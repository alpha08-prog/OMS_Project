/**
 * Tour Program controller — backed by Catalyst Data Store via custom REST client.
 *
 * Notes:
 *   - Google Calendar integration is dropped on this path. The
 *     `googleCalendarEventId` column is preserved for schema compatibility
 *     but never written. Re-enable later if needed.
 *   - Tour programs are NOT data-isolated by createdById — everyone (any
 *     authenticated user) sees all tour programs because tours are
 *     office-wide events.
 *
 * Workflow:
 *   - decision: PENDING → ACCEPTED | REGRET (admin only via /decision)
 *   - complete: only ACCEPTED + past dateTime can submit a post-event report
 *     (sets isCompleted, completedAt, completedById, drive/keynotes/etc.)
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  updateRow,
  updateRowTolerant,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  executeZCQL,
  zcqlEscapeValue,
  zcqlAnyOf,
  zcqlLike,
  columnExists,
  zcqlSafeLimit,
  assertZcqlLimit,
  ZCQL_MAX_LIMIT,
  countRows,
  fetchOffsetWindow,
  dateRangeClauses,
  countZcqlConditions,
  zcqlSearchWithinBudget,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import { cacheClear, cacheSWR } from '../lib/cache';
import { getCachedTableList, getUserIdAliases } from '../lib/catalyst-user-lookup';
import { emitNotification } from './notification.controller';
import { autoCreateSelfTask } from './task.controller';
import type {
  AuthenticatedRequest,
  TourProgramFilters,
  EventFilters,
} from '../types';

const TOUR_TABLE = 'TourProgram';
const VALID_DECISIONS = new Set(['PENDING', 'ACCEPTED', 'REGRET']);
// Event categories stored in the `eventType` TEXT column. Optional — a tour can
// be created without one. Invalid values are rejected at create/update time.
const VALID_EVENT_TYPES = new Set([
  'WEDDING',
  'HOUSE_WARMING',
  'STATE_GOVT_EVENT',
  'CENTRAL_GOVT_EVENT',
  'GOVT_MEETING',
  'PARTY_MEETING',
  'FAMILY_EVENT',
]);

// ── Helpers ───────────────────────────────────────────────────────────────

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function parseInt0(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? null : Math.trunc(n);
}

/**
 * Ascending compare of two Catalyst ROWIDs.
 *
 * ROWIDs are ~17-digit strings (e.g. 37719000000744038), past
 * Number.MAX_SAFE_INTEGER — Number() would silently round neighbouring ids to
 * the same value. Compare them as numeric strings: longer wins, then lexical.
 */
function compareRowIdAsc(a: unknown, b: unknown): number {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Milliseconds for a sort key, with malformed dates pinned to 0 rather than NaN. */
function sortTime(value: unknown): number {
  if (!value) return 0;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * JS twin of dateRangeClauses, so the fallback path filters EXACTLY the rows
 * the ZCQL path does. Returns null when no bound was supplied.
 *
 * The fallback used to compare `new Date(row.dateTime).getTime()` against
 * `new Date(filters.endDate).getTime()`. A bare 'YYYY-MM-DD' parses as UTC
 * midnight while the row's 'YYYY-MM-DD HH:mm:ss' parses as LOCAL time, so on an
 * IST box every event after 05:30 on the end date was dropped — filtering to a
 * single day showed almost nothing, and the two branches disagreed with each
 * other. Comparing the 'YYYY-MM-DD' prefix is the same day-inclusive window
 * dateRangeClauses emits, and needs no date parsing at all.
 */
function dayRangeFilter(
  startDate?: string | null,
  endDate?: string | null
): ((value: unknown) => boolean) | null {
  const start = toCatalystDate(startDate ?? undefined)?.slice(0, 10) ?? null;
  const end = toCatalystDate(endDate ?? undefined)?.slice(0, 10) ?? null;
  if (!start && !end) return null;
  return (value: unknown) => {
    const day = String(value ?? '').slice(0, 10);
    if (day.length < 10) return false;
    if (start && day < start) return false;
    if (end && day > end) return false;
    return true;
  };
}

/** Reshape a Catalyst tour row → JSON shape the frontend expects. */
function shapeTour(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  completedBy?: { id: string; name: string; email: string } | null,
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    // Human-friendly reference: the stored sequential number (TOUR-YYYY-NNNN)
    // when present, else a ROWID-based fallback (TOUR-<rowid>) for legacy rows
    // / before the `tourNumber` column is added in Catalyst.
    referenceNo: row.tourNumber
      ? String(row.tourNumber)
      : `TOUR-${String(row.ROWID)}`,
    eventName: row.eventName,
    eventType: row.eventType ?? null,
    organizer: row.organizer,
    dateTime: row.dateTime,
    venue: row.venue,
    venueLink: row.venueLink ?? null,
    description: row.description ?? null,
    referencedBy: row.referencedBy ?? null,
    decision: row.decision,
    decisionNote: row.decisionNote ?? null,
    chiefGuest: row.chiefGuest ?? null,
    contactPhone: row.contactPhone ?? null,
    expectedFootfall: row.expectedFootfall ?? null,
    organizerPhone: row.organizerPhone ?? null,
    organizerEmail: row.organizerEmail ?? null,
    isCompleted: parseBool(row.isCompleted),
    completedAt: row.completedAt ?? null,
    driveLink: row.driveLink ?? null,
    keynotes: row.keynotes ?? null,
    attendeesCount: parseInt0(row.attendeesCount),
    outcomeSummary: row.outcomeSummary ?? null,
    mediaLink: row.mediaLink ?? null,
    googleCalendarEventId: row.googleCalendarEventId ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdById: row.createdById ?? null,
    completedById: row.completedById ?? null,
    createdBy: createdBy ?? null,
    completedBy: completedBy ?? null,
    // Edit audit — who last edited this tour and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
  };
}

/** Look up users from cached Catalyst AppUser. Best-effort. */
async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return map;
  try {
    const users = await getCachedTableList('AppUser');
    const wanted = new Set(list.map(String));
    for (const u of users) {
      const rowId = String(u.ROWID);
      const legacyId = u.legacyId ? String(u.legacyId) : null;
      if (wanted.has(rowId)) {
        map.set(rowId, { id: rowId, name: String(u.name), email: String(u.email) });
      }
      // INDEPENDENT if, not else-if: one user can be referenced by their
      // Catalyst ROWID on some rows and their pre-migration legacy UUID on
      // others. With else-if, a page containing both forms resolved only the
      // ROWID and rendered the user's name blank on the legacy rows.
      if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name: String(u.name), email: String(u.email) });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
  }
  return map;
}

async function hydrate(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];
  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.completedById) ids.add(String(r.completedById));
    if (r.lastEditedById) ids.add(String(r.lastEditedById));
  }
  const users = await lookupUsers(ids);
  return safe.map((r) =>
    shapeTour(
      r,
      users.get(String(r.createdById)) ?? null,
      r.completedById ? users.get(String(r.completedById)) ?? null : null,
      r.lastEditedById ? users.get(String(r.lastEditedById)) ?? null : null
    )
  );
}

/** Cache-key prefix for the list totals, so writes can drop a stale count. */
const COUNT_CACHE_PREFIX = 'tours:count:';

function invalidateCaches() {
  cacheClear('calendar_events_');
  cacheClear('dashboard_stats');
  // The list total is now a real COUNT served from a short-lived cache; a
  // decision change or delete must not leave the pager quoting the old number.
  cacheClear(COUNT_CACHE_PREFIX);
}

/**
 * Is the optional `tourNumber` column present in this datastore?
 *
 * VERIFIED ABSENT in Development. ZCQL rejects the WHOLE query with a 400 when
 * it references an unknown column, so an unguarded mention of tourNumber in
 * the search predicate would fail the entire tour search rather than just that
 * one clause. Same shape as trainRequestNumber on TrainRequest.
 */
function hasTourNumberColumn(): Promise<boolean> {
  return columnExists(TOUR_TABLE, 'tourNumber');
}

/**
 * Best-effort sequential reference number: TOUR-<IST year>-NNNN. Returns
 * max+1 for the current year. Still NOT transaction-safe — pre-existing, and
 * adequate for office-scale concurrency.
 *
 * One query, not a full-table scan: the sequence is zero-padded to 4 digits, so
 * lexical DESC equals numeric DESC up to 9999 and the highest existing number
 * is simply the first row. Previously this read every tour program ever created
 * on every single create.
 */
async function nextTourNumber(): Promise<string> {
  const istYear = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
  const prefix = `TOUR-${istYear}-`;
  let maxSeq = 0;
  // Skip entirely when the column is absent — querying it would 400.
  if (!(await hasTourNumberColumn())) return `${prefix}0001`;
  try {
    const rows = await executeZCQL<CatalystRow>(
      `SELECT tourNumber FROM ${TOUR_TABLE} ` +
        `WHERE ${zcqlLike('tourNumber', prefix, 'prefix')} ` +
        `ORDER BY tourNumber DESC LIMIT 1`
    );
    const num = String(rows[0]?.tourNumber ?? '');
    if (num.startsWith(prefix)) {
      const seq = parseInt(num.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  } catch {
    /* table unreadable — fall back to 1 */
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/** POST /api/tour-programs */
export async function createTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const {
      eventName,
      eventType,
      organizer,
      organizerPhone,
      organizerEmail,
      dateTime,
      venue,
      venueLink,
      description,
      referencedBy,
      chiefGuest,
      contactPhone,
      expectedFootfall,
    } = req.body;

    // eventType is optional; reject only when a non-empty, unknown value is sent.
    if (eventType && !VALID_EVENT_TYPES.has(eventType)) {
      sendError(res, `Invalid event type: ${eventType}`);
      return;
    }

    const row = await insertRow(TOUR_TABLE, {
      eventName,
      eventType: eventType || null,
      organizer,
      dateTime: toCatalystDate(dateTime) || nowCatalystIST(),
      venue,
      venueLink: venueLink?.trim() || null,
      description: description?.trim() || null,
      referencedBy: referencedBy?.trim() || null,
      decision: 'PENDING',
      decisionNote: null,
      chiefGuest: chiefGuest?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      expectedFootfall: expectedFootfall?.trim() || null,
      organizerPhone: organizerPhone?.trim() || null,
      organizerEmail: organizerEmail?.trim() || null,
      isCompleted: false,
      completedAt: null,
      driveLink: null,
      keynotes: null,
      attendeesCount: null,
      outcomeSummary: null,
      mediaLink: null,
      createdById: req.user.id,
      completedById: null,
      googleCalendarEventId: null,
    });

    // Assign a short sequential reference number (TOUR-YYYY-NNNN). Best-effort,
    // separate post-insert update so creation still succeeds if the `tourNumber`
    // column isn't in Catalyst yet — the reference then falls back to the ROWID
    // form (TOUR-<rowid>) at the read layer until the column is added.
    try {
      const tourNumber = await nextTourNumber();
      await updateRow(TOUR_TABLE, { ROWID: String(row.ROWID), tourNumber });
      row.tourNumber = tourNumber;
    } catch (err) {
      console.warn('[tour] Could not assign tourNumber (column missing?)', err);
    }

    // Auto self-assign: the tour invitation becomes a task owned by its creator
    // so it shows up on the shared Tasks board. The admin still makes the
    // ACCEPT/REGRET decision separately. Best-effort.
    const refNo = row.tourNumber ? String(row.tourNumber) : `TOUR-${String(row.ROWID)}`;
    await autoCreateSelfTask({
      userId: req.user.id,
      // Reference number in the title so the tour is findable by id on the
      // shared task boards (their search matches the title).
      title: `Tour ${refNo}: ${eventName}`,
      taskType: 'TOUR_PROGRAM',
      referenceId: String(row.ROWID),
      referenceType: 'TOUR_PROGRAM',
      description: typeof description === 'string' ? description.slice(0, 500) : null,
    });

    // The list totals are now real counts served from a short-lived cache —
    // drop them so this tour is reflected immediately, not after the TTL.
    cacheClear(COUNT_CACHE_PREFIX);

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Tour program created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create tour program', error);
  }
}

/**
 * WHERE clauses only — no ORDER BY, no LIMIT. Kept separate so the page query
 * and the COUNT query are derived from the SAME predicate; a total that
 * disagrees with the rows on screen is its own bug.
 */
function buildTourWhere(
  filters: TourProgramFilters,
  staffIds?: string[],
  hasTourNo = false
): string[] {
  const conditions: string[] = [];
  // Staff can only see their own tour programs. Admins/super-admins see all.
  // Matched against ALL identity aliases (ROWID + legacy UUID), since rows
  // written in different eras carry different forms of the same user.
  if (staffIds && staffIds.length > 0) {
    conditions.push(zcqlAnyOf('createdById', staffIds));
  }
  if (filters.decision) {
    conditions.push(`decision = '${zcqlEscapeValue(String(filters.decision))}'`);
  }
  // Half-open upper bound. The old `dateTime <= toCatalystDate(endDate)` used a
  // MIDNIGHT timestamp as an inclusive bound, so every event ON the end date
  // was excluded — a single-day filter came back empty.
  conditions.push(
    ...dateRangeClauses(
      'dateTime',
      filters.startDate as unknown as string,
      filters.endDate as unknown as string
    )
  );

  // Search is built LAST, from whatever is left of the 10-condition budget. It
  // is the only variable-width clause (up to four columns plus a ROWID term),
  // so it is the one that must yield: over budget is a hard 400 and the whole
  // query returns nothing, which reads as "no such tour" rather than an error.
  if (filters.search && String(filters.search).trim()) {
    const raw = String(filters.search).trim();
    // Legacy "TOUR-<rowid>" reference → match the ROWID directly. Costs one
    // condition of its own, so it is charged against the budget before the
    // LIKE columns are chosen.
    const m = raw.match(/^TOUR-(\d+)$/i);
    const used = countZcqlConditions(conditions) + (m ? 1 : 0);
    // Most-identifying first, so the reference number survives when the budget
    // forces columns to be shed. tourNumber is only named when it exists —
    // referencing a missing column 400s the entire query, not just this clause.
    const columns = hasTourNo
      ? ['tourNumber', 'eventName', 'organizer', 'venue']
      : ['eventName', 'organizer', 'venue'];
    const { clause } = zcqlSearchWithinBudget(columns, raw, used);
    const orTerms = [clause, m ? `ROWID = ${m[1]}` : null].filter(
      (c): c is string => Boolean(c)
    );
    // Nothing survived the budget — match nothing rather than silently
    // ignoring the search box and handing back the unfiltered list.
    conditions.push(orTerms.length > 0 ? `(${orTerms.join(' OR ')})` : 'ROWID = 0');
  }
  return conditions;
}

function tourWhereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/** GET /api/tour-programs */
export async function getTourPrograms(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as TourProgramFilters;

    let pageRows: CatalystRow[];
    // null once the count is genuinely unavailable — never a number inferred
    // from the page we happen to be holding.
    let total: number | null;
    let effectiveLimit = limit;
    let hasMore = false;

    // Scope to creator for STAFF role; admins see everything. Resolved to the
    // full identity-alias set (ROWID + legacy UUID) so pre-migration rows match.
    const staffIds =
      req.user?.role === 'STAFF' ? await getUserIdAliases(req.user.id) : undefined;

    // Free-text search (incl. reference number / TOUR-<rowid>) always runs
    // through the JS path: it reliably matches tourNumber + ROWID and scans the
    // whole table, sidestepping ZCQL quirks and a possibly-missing tourNumber
    // column. ZCQL still handles the common filtered/sorted list with no search.
    if (useZCQL() && !filters.search) {
      const clauses = buildTourWhere(filters, staffIds, await hasTourNumberColumn());
      const where = tourWhereSql(clauses);
      // ZCQL caps LIMIT at 300 but the list contract allows up to 1000, so a
      // request for more than 299 rows is served in chunks (fetchOffsetWindow)
      // rather than clamped. Clamping silently either loses rows 299-999
      // outright or quietly returns a page a third of the size that was asked
      // for; chunking serves the window the caller actually requested.
      effectiveLimit = limit;
      // A real count, run in PARALLEL with the page query and only on page 1,
      // behind a stale-while-revalidate cache. The key is scoped by role + user
      // id because STAFF results are per-identity — a shared key would leak one
      // staffer's row count to another.
      const countKey =
        `${COUNT_CACHE_PREFIX}${req.user?.role}:${req.user?.id}:` + JSON.stringify(clauses);

      const [fetched, counted] = await Promise.all([
        // ROWID tiebreaker: invitations cluster into the same slot (every
        // wedding at 11:00), and with only a partial order those tied rows
        // get re-shuffled per query — one event shows on two pages while
        // another is returned by none.
        fetchOffsetWindow(
          TOUR_TABLE,
          where,
          'dateTime',
          'oldest',
          skip,
          limit + 1 // +1 probes for a next page
        ),
        // Counted on EVERY page, not just the first: the key is derived from
        // the predicate (not the page), so pages 2+ hit the cache page 1 warmed
        // and cost nothing. Gating on page 1 made meta.totalKnown false the
        // moment the user clicked Next, which leaves the pager rendering
        // "Page 2 of undefined" — the same lost-total symptom this replaced.
        cacheSWR(countKey, 30, 120, () => countRows(TOUR_TABLE, where)),
      ]);

      hasMore = fetched.length > limit;
      pageRows = hasMore ? fetched.slice(0, limit) : fetched;
      // `total` appears ONLY when it is real. The old
      // `skip + rows.length + (hasMore ? 1 : 0)` looked like a count but can
      // never exceed currentPage + 1, so the pager capped itself at two pages
      // and hid the rest of the table.
      total = counted;
    } else {
      let rows = await listAllRows(TOUR_TABLE);
      if (staffIds) {
        const idSet = new Set(staffIds);
        rows = rows.filter((r) => idSet.has(String(r.createdById)));
      }
      if (filters.decision) {
        rows = rows.filter((r) => r.decision === filters.decision);
      }
      if (filters.search) {
        const raw = String(filters.search).trim();
        const q = raw.toLowerCase();
        // "TOUR-<rowid>" or a bare ROWID search → the digits to match directly.
        const rowidMatch = raw.match(/^(?:TOUR-)?(\d{6,})$/i);
        rows = rows.filter((r) => {
          // The SAME human reference the UI shows: tourNumber (TOUR-YYYY-NNNN)
          // when present, else the ROWID fallback (TOUR-<rowid>).
          const refNo = (r.tourNumber
            ? String(r.tourNumber)
            : `TOUR-${String(r.ROWID)}`
          ).toLowerCase();
          return (
            (r.eventName || '').toLowerCase().includes(q) ||
            (r.organizer || '').toLowerCase().includes(q) ||
            (r.venue || '').toLowerCase().includes(q) ||
            refNo.includes(q) ||
            (rowidMatch ? String(r.ROWID) === rowidMatch[1] : false)
          );
        });
      }
      // Day-inclusive on both ends, matching the half-open bound the ZCQL
      // branch emits. The two paths have to agree.
      const inDayRange = dayRangeFilter(
        filters.startDate as unknown as string,
        filters.endDate as unknown as string
      );
      if (inDayRange) {
        rows = rows.filter((r) => inDayRange(r.dateTime));
      }

      rows.sort((a, b) => {
        const ta = sortTime(a.dateTime);
        const tb = sortTime(b.dateTime);
        // Mirrors `ORDER BY dateTime ASC, ROWID ASC` — events share slots often
        // enough that a partial order makes the two paths disagree about which
        // rows land on which page.
        if (ta !== tb) return ta - tb;
        return compareRowIdAsc(a.ROWID, b.ROWID);
      });

      // Honest total: this path holds the whole filtered set in memory, so the
      // count is exact rather than inferred from the current page.
      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
      hasMore = skip + pageRows.length < total;
    }

    const data = await hydrate(pageRows);

    sendSuccess(res, data, 'Tour programs retrieved successfully', 200, {
      page,
      limit: effectiveLimit,
      count: pageRows.length,
      hasMore,
      ...(total !== null && total !== undefined
        ? {
            total,
            totalKnown: true,
            totalPages: Math.ceil(total / effectiveLimit),
          }
        : { totalKnown: false }),
    });
  } catch (error) {
    sendServerError(res, 'Failed to get tour programs', error);
  }
}

/** GET /api/tour-programs/:id */
export async function getTourProgramById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(TOUR_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Tour program not found');
      return;
    }
    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Tour program retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get tour program', error);
  }
}

/** PUT /api/tour-programs/:id */
export async function updateTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    delete body.id;
    delete body.createdById;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.ROWID;
    delete body.CREATEDTIME;
    delete body.MODIFIEDTIME;
    delete body.CREATORID;

    const updateData: Record<string, unknown> = { ROWID: id };

    // Allowed updatable fields (everything except auth/audit columns)
    const allowed = [
      'eventName',
      'organizer',
      'venue',
      'venueLink',
      'description',
      'referencedBy',
      'decisionNote',
      'chiefGuest',
      'contactPhone',
      'expectedFootfall',
      'organizerPhone',
      'organizerEmail',
    ];
    for (const k of allowed) {
      if (body[k] !== undefined) updateData[k] = body[k];
    }
    if (body.dateTime !== undefined) {
      updateData.dateTime = toCatalystDate(body.dateTime);
    }
    if (body.decision !== undefined) {
      if (!VALID_DECISIONS.has(body.decision)) {
        sendError(res, `Invalid decision: ${body.decision}`);
        return;
      }
      updateData.decision = body.decision;
    }
    if (body.eventType !== undefined) {
      // Allow clearing it; otherwise it must be a known category.
      if (body.eventType && !VALID_EVENT_TYPES.has(body.eventType)) {
        sendError(res, `Invalid event type: ${body.eventType}`);
        return;
      }
      updateData.eventType = body.eventType || null;
    }
    if (body.attendeesCount !== undefined) {
      updateData.attendeesCount = parseInt0(body.attendeesCount);
    }

    // Edit audit — stamp who edited and when (never client-controlled).
    if (req.user) {
      updateData.lastEditedById = req.user.id;
      updateData.lastEditedAt = nowCatalystIST();
    }

    // Tolerate a Catalyst schema that doesn't have the audit columns yet —
    // the update still succeeds (minus the stamp) until they're added.
    const updated = await updateRowTolerant(
      TOUR_TABLE,
      updateData as { ROWID: string | number; [column: string]: any },
      ['lastEditedById', 'lastEditedAt']
    );
    // This route can change `decision` and `dateTime` — both are columns the
    // cached list COUNT filters on — so the total has to be dropped here too,
    // not only in updateDecision/delete.
    invalidateCaches();
    const [shaped] = await hydrate([updated]);
    sendSuccess(res, shaped, 'Tour program updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update tour program', error);
  }
}

/**
 * PATCH /api/tour-programs/:id/decision — admin only.
 *
 * Google Calendar integration is intentionally NOT wired here.
 */
export async function updateDecision(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { decision, decisionNote } = req.body;

    if (!VALID_DECISIONS.has(decision)) {
      sendError(res, 'Invalid decision value');
      return;
    }

    const updated = await updateRow(TOUR_TABLE, {
      ROWID: id,
      decision,
      decisionNote: decisionNote ?? null,
    });

    // Notify the original creator that a decision was made on their tour.
    if (updated?.createdById) {
      try {
        await emitNotification({
          recipientId: String(updated.createdById),
          type: 'TOUR_DECIDED',
          title: `Tour ${String(decision).toLowerCase()}: ${updated.eventName ?? 'event'}`,
          body: decisionNote ? String(decisionNote).slice(0, 200) : '',
          // Staff home shows the submitter's tour cards; passing the row id
          // lets the page open/highlight this tour on arrival.
          link: `/staff/home?tour=${encodeURIComponent(String(updated.ROWID))}`,
          referenceId: String(updated.ROWID),
          referenceType: 'TOUR',
        });
      } catch (notifErr) {
        console.error('[tour] decision notification failed:', notifErr);
      }
    }

    invalidateCaches();
    const [shaped] = await hydrate([updated]);
    sendSuccess(res, shaped, 'Decision updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update decision', error);
  }
}

/** DELETE /api/tour-programs/:id */
export async function deleteTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(TOUR_TABLE, id);
    invalidateCaches();
    sendSuccess(res, null, 'Tour program deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete tour program', error);
  }
}

/** GET /api/tour-programs/schedule/today */
export async function getTodaySchedule(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayDay = toCatalystDate(today)?.slice(0, 10) ?? null;

    let matched: CatalystRow[] | null = null;

    // Push the day window down instead of reading every tour ever created to
    // answer "what is on today". dateRangeClauses gives the half-open upper
    // bound, which is the only form that survives Catalyst datetimes carrying
    // milliseconds after a colon.
    if (todayDay) {
      const clauses = [
        `decision = 'ACCEPTED'`,
        ...dateRangeClauses('dateTime', todayDay, todayDay),
      ];
      try {
        const rows = await executeZCQL<CatalystRow>(
          `SELECT * FROM ${TOUR_TABLE}${tourWhereSql(clauses)} ` +
            // ROWID tiebreaker: several events share a slot, and a partial
            // order lets tied rows swap places between requests.
            `ORDER BY dateTime ASC, ROWID ASC LIMIT ${assertZcqlLimit(ZCQL_MAX_LIMIT + 1)}`
        );
        // A completely full page means we cannot prove we saw the whole day —
        // fall through to the scan rather than truncating the schedule in
        // silence. (A day that busy is not realistic; this is a guard, not a
        // path we expect to take.)
        if (rows.length <= ZCQL_MAX_LIMIT) matched = rows;
      } catch (err) {
        console.warn('[tour] today-schedule query failed; falling back to scan', err);
      }
    }

    if (!matched) {
      const rows = await listAllRows(TOUR_TABLE);
      matched = rows
        .filter((r) => r.decision === 'ACCEPTED')
        .filter((r) => {
          if (!r.dateTime) return false;
          const t = sortTime(r.dateTime);
          return t >= today.getTime() && t < tomorrow.getTime();
        })
        .sort((a, b) => {
          const ta = sortTime(a.dateTime);
          const tb = sortTime(b.dateTime);
          if (ta !== tb) return ta - tb;
          return compareRowIdAsc(a.ROWID, b.ROWID);
        });
    }

    const data = await hydrate(matched);
    sendSuccess(res, data, "Today's schedule retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get schedule', error);
  }
}

/** GET /api/tour-programs/upcoming — next 7 days, capped at 20. */
export async function getUpcomingEvents(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const now = new Date().getTime();
    const sevenDaysLater = now + 7 * 24 * 60 * 60 * 1000;

    // Left as a full read on purpose: the `>= now` bound is to-the-second, and
    // dateRangeClauses only expresses whole days — a day-granular push-down
    // would start showing events that already finished this morning. Scoping
    // this needs a timestamp-bound helper (see the report), not a guess here.
    const rows = await listAllRows(TOUR_TABLE);
    const matched = rows
      .filter((r) => {
        if (!r.dateTime) return false;
        const t = sortTime(r.dateTime);
        return t >= now && t <= sevenDaysLater;
      })
      // ROWID tiebreaker: this list is truncated to 20, so an unstable order
      // among same-slot events decides which ones make the cut at random.
      .sort((a, b) => {
        const ta = sortTime(a.dateTime);
        const tb = sortTime(b.dateTime);
        if (ta !== tb) return ta - tb;
        return compareRowIdAsc(a.ROWID, b.ROWID);
      })
      .slice(0, 20);

    const data = await hydrate(matched);
    sendSuccess(res, data, 'Upcoming events retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get upcoming events', error);
  }
}

/** GET /api/tour-programs/pending — admin queue. */
export async function getPendingDecisions(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );

    const { startDate, endDate } = req.query as Record<string, string>;

    let rows = await listAllRows(TOUR_TABLE);
    rows = rows.filter((r) => r.decision === 'PENDING');

    // Day-inclusive range over CREATEDTIME. The old `<= new Date(endDate)`
    // bound compared a UTC-midnight parse of 'YYYY-MM-DD' against a LOCAL
    // parse of the row timestamp, so on an IST box anything submitted after
    // 05:30 on the end date fell out of the queue. CREATEDTIME additionally
    // carries milliseconds after a colon, which the day prefix ignores.
    const inDayRange = dayRangeFilter(startDate, endDate);
    if (inDayRange) {
      rows = rows.filter((r) => inDayRange(r.CREATEDTIME));
    }

    rows.sort((a, b) => {
      const ta = sortTime(a.dateTime);
      const tb = sortTime(b.dateTime);
      // most recent first, with a ROWID tiebreaker so tied slots keep a stable
      // order across the page boundary.
      if (tb !== ta) return tb - ta;
      return compareRowIdAsc(b.ROWID, a.ROWID);
    });

    // Honest total: the whole filtered set is in memory here, so this is an
    // exact count rather than one inferred from the current page.
    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    sendSuccess(res, data, 'Pending decisions retrieved', 200, {
      ...calculatePaginationMeta(total, page, limit),
      count: paged.length,
      hasMore: skip + paged.length < total,
      totalKnown: true,
    });
  } catch (error) {
    sendServerError(res, 'Failed to get pending decisions', error);
  }
}

/**
 * GET /api/tour-programs/events
 *
 * Returns every ACCEPTED tour as an event — both upcoming (not yet held)
 * and past (already happened). The frontend's Event Reports page splits
 * them into pending vs completed via the `isCompleted` flag, so we don't
 * gate by date here. Anything still PENDING or REGRET is excluded.
 */
export async function getEvents(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as EventFilters;

    let rows = await listAllRows(TOUR_TABLE);
    rows = rows.filter((r) => r.decision === 'ACCEPTED');

    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.eventName || '').toLowerCase().includes(q) ||
          (r.organizer || '').toLowerCase().includes(q) ||
          (r.venue || '').toLowerCase().includes(q)
      );
    }
    if (filters.venue) {
      const q = String(filters.venue).toLowerCase();
      rows = rows.filter((r) => (r.venue || '').toLowerCase().includes(q));
    }
    // Day-inclusive range, same window the list endpoint's ZCQL branch uses.
    // The old `<= new Date(endDate)` bound parsed a bare 'YYYY-MM-DD' as UTC
    // midnight and the row's dateTime as LOCAL time, so on an IST box every
    // event after 05:30 on the end date was dropped from the report.
    const inDayRange = dayRangeFilter(
      filters.startDate as unknown as string,
      filters.endDate as unknown as string
    );
    if (inDayRange) {
      rows = rows.filter((r) => inDayRange(r.dateTime));
    }
    if (filters.isCompleted !== undefined) {
      const want = String(filters.isCompleted) === 'true';
      rows = rows.filter((r) => parseBool(r.isCompleted) === want);
    }

    rows.sort((a, b) => {
      const ta = sortTime(a.dateTime);
      const tb = sortTime(b.dateTime);
      // most recent past events first, with a ROWID tiebreaker so same-slot
      // events keep a stable order across the page boundary.
      if (tb !== ta) return tb - ta;
      return compareRowIdAsc(b.ROWID, a.ROWID);
    });

    // Honest total: the whole filtered set is in memory here, so this is an
    // exact count rather than one inferred from the current page.
    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    sendSuccess(res, data, 'Events retrieved successfully', 200, {
      ...calculatePaginationMeta(total, page, limit),
      count: paged.length,
      hasMore: skip + paged.length < total,
      totalKnown: true,
    });
  } catch (error) {
    sendServerError(res, 'Failed to get events', error);
  }
}

/**
 * PATCH /api/tour-programs/:id/complete — staff submits post-event report.
 * Requires: decision === ACCEPTED, dateTime in the past.
 */
export async function submitEventReport(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const { driveLink, keynotes, attendeesCount, outcomeSummary, mediaLink } =
      req.body;

    const existing = await getRow(TOUR_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Tour program not found');
      return;
    }
    if (existing.decision !== 'ACCEPTED') {
      sendError(res, 'Only accepted tour programs can have event reports');
      return;
    }
    if (!existing.dateTime || new Date(existing.dateTime) > new Date()) {
      sendError(res, 'Event has not occurred yet');
      return;
    }

    const updated = await updateRow(TOUR_TABLE, {
      ROWID: id,
      isCompleted: true,
      completedAt: nowCatalystIST(),
      driveLink: driveLink?.trim() || null,
      keynotes: keynotes?.trim() || null,
      attendeesCount: parseInt0(attendeesCount),
      outcomeSummary: outcomeSummary?.trim() || null,
      mediaLink: mediaLink?.trim() || null,
      completedById: req.user.id,
    });

    const [shaped] = await hydrate([updated]);
    sendSuccess(res, shaped, 'Event report submitted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to submit event report', error);
  }
}
