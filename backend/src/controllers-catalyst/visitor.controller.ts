
/**
 * Visitor controller — backed by Catalyst Data Store via the custom REST client.
 *
 * Bypasses zcatalyst-sdk-node entirely (it has bugs in local-dev mode).
 * Uses our thin client at lib/catalyst-client.ts instead.
 *
 * Role-based access:
 *   - STAFF:  only see/edit rows where createdById === their user id
 *   - ADMIN:  see/edit everything
 */
import { Response } from 'express';
import {
  insertRowTolerant,
  listAllRows,
  getRow,
  updateRowTolerant,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  executeZCQL,
  zcqlAnyOf,
  zcqlSafeLimit,
  countRows,
  fetchOffsetWindow,
  dateRangeClauses,
  countZcqlConditions,
  zcqlSearchWithinBudget,
  CatalystRow,
} from '../lib/catalyst-client';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
// calculatePaginationMeta is deliberately not used on the list path any more:
// it takes `total` as a required argument, which is what pushed this controller
// into fabricating one. parsePagination stays for the page/limit contract.
import { parsePagination } from '../utils/pagination';
import { cacheSWR, cacheClear } from '../lib/cache';
import { lookupUsers, getUserIdAliases } from '../lib/catalyst-user-lookup';
import { useZCQL } from '../config/feature-flags';
import type { AuthenticatedRequest, VisitorFilters } from '../types';

const VISITOR_TABLE = 'Visitor';
/** Cache-key prefix for the list totals, so writes can drop a stale count. */
const COUNT_CACHE_PREFIX = 'visitors:count:';

/**
 * Catalyst returns boolean columns as the strings "true"/"false" rather than
 * actual booleans. Coerce to a real boolean.
 */
function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

/**
 * Ascending compare of two Catalyst ROWIDs.
 *
 * ROWIDs are ~17-digit strings (e.g. 37719000000744038), which is past
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
 * The fallback used to compare `new Date(row.visitDate).getTime()` against
 * `new Date(filters.endDate).getTime()`. A bare 'YYYY-MM-DD' parses as UTC
 * midnight while the row's 'YYYY-MM-DD HH:mm:ss' parses as LOCAL time, so on an
 * IST box every visitor logged after 05:30 on the end date was dropped —
 * "show me today" returned almost nothing, and the two branches disagreed.
 * Comparing the 'YYYY-MM-DD' prefix is the same day-inclusive window
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

/** Reshape a Catalyst row into the JSON shape the frontend expects. */
function shapeVisitor(
  row: CatalystRow,
  creator?: { id: string; name: string; email: string } | null,
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    name: row.name,
    designation: row.designation,
    phone: row.phone,
    dob: row.dob ?? null,
    purpose: row.purpose,
    referencedBy: row.referencedBy,
    constituency: row.constituency ?? null,
    wardVillage: row.wardVillage ?? null,
    // Whether this person is a serving official — drives the "Official" mark on
    // their birthday (View Birthdays + dashboard). Defaults false for legacy
    // rows / before the Catalyst column exists.
    isOfficial: parseBool(row.isOfficial),
    visitDate: row.visitDate,
    createdById: row.createdById ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdBy: creator ?? null,
    // Edit audit — who last edited this visitor and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
  };
}

/**
 * Best-effort lookup of creator + last-editor user info. Resolved via
 * lookupUsers, which queries the AppUser table and handles both Catalyst
 * ROWIDs and legacy UUID ids (createdById / lastEditedById can be either
 * form). If AppUser is unreachable, createdBy / lastEditedBy stay null.
 */
async function attachCreators(rows: CatalystRow[]): Promise<any[]> {
  // Guard against undefined entries — some Catalyst endpoints return shapes
  // we don't fully control.
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.lastEditedById) ids.add(String(r.lastEditedById));
  }

  let byId = new Map<string, { id: string; name: string; email: string }>();
  if (ids.size > 0) {
    try {
      byId = await lookupUsers(ids);
    } catch {
      // AppUser unreachable — leave creator/editor null.
    }
  }

  return safe.map((r) =>
    shapeVisitor(
      r,
      (r.createdById && byId.get(String(r.createdById))) || null,
      (r.lastEditedById && byId.get(String(r.lastEditedById))) || null
    )
  );
}

/**
 * POST /api/visitors
 */
export async function createVisitor(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { name, designation, phone, dob, purpose, referencedBy, visitDate, constituency, wardVillage, isOfficial } = req.body;

    const payload: Record<string, unknown> = {
      name,
      designation,
      phone,
      dob: toCatalystDate(dob),
      purpose,
      referencedBy,
      // Serving-official flag. Stored as a real boolean; the tolerant insert
      // below drops it if the Catalyst column hasn't been added yet.
      isOfficial: Boolean(isOfficial),
      visitDate: toCatalystDate(visitDate) || nowCatalystIST(),
      createdById: req.user.id,
    };
    if (constituency) payload.constituency = constituency;
    if (wardVillage) payload.wardVillage = wardVillage;

    // insertRowTolerant retries without `isOfficial` if Catalyst rejects the
    // write (column missing) so logging a visitor never fails on the new flag.
    const row = await insertRowTolerant(VISITOR_TABLE, payload, ['isOfficial']);

    // The list totals are now real counts served from a short-lived cache —
    // drop them so the new visitor is reflected immediately instead of after
    // the TTL.
    cacheClear(COUNT_CACHE_PREFIX);

    const [shaped] = await attachCreators([row]);
    sendSuccess(res, shaped, 'Visitor logged successfully', 201);
  } catch (error) {
    // Surface the underlying Catalyst reason (e.g. a missing/invalid column)
    // instead of a generic message — same pattern as createGrievance.
    const msg =
      error instanceof Error && error.message
        ? `Failed to log visitor: ${error.message}`
        : 'Failed to log visitor';
    sendServerError(res, msg, error);
  }
}

/**
 * WHERE clauses only — no ORDER BY, no LIMIT. Kept separate so the page query
 * and the COUNT query are derived from the SAME predicate; a total that
 * disagrees with the rows on screen is its own bug.
 */
function buildVisitorWhere(
  staffIds: string[] | null,
  filters: VisitorFilters
): string[] {
  const conditions: string[] = [];

  // STAFF scoping — match ALL identity aliases (ROWID + legacy UUID), since
  // rows written in different eras carry different forms of the same user.
  if (staffIds && staffIds.length > 0) {
    conditions.push(zcqlAnyOf('createdById', staffIds));
  }

  // Half-open upper bound. The old `visitDate <= toCatalystDate(endDate)` used
  // a MIDNIGHT timestamp as an inclusive bound, so every visitor logged during
  // the end date was excluded — picking one day in the UI returned nothing.
  conditions.push(
    ...dateRangeClauses(
      'visitDate',
      filters.startDate as unknown as string,
      filters.endDate as unknown as string
    )
  );

  // Search is built LAST, from whatever is left of the 10-condition budget: it
  // is the only variable-width clause here, so it is the one that must yield.
  // Over budget is a hard 400 — the whole query returns nothing, which reads
  // to the user as "no such visitor" rather than as an error.
  if (filters.search && String(filters.search).trim()) {
    const used = countZcqlConditions(conditions);
    // Most-identifying first, so the columns people actually search survive
    // when the budget forces one to be shed.
    const { clause } = zcqlSearchWithinBudget(
      ['name', 'designation', 'purpose'],
      String(filters.search).trim(),
      used
    );
    // No budget left at all — match nothing rather than silently ignoring the
    // search box and handing back the unfiltered list.
    conditions.push(clause ?? 'ROWID = 0');
  }

  return conditions;
}

function visitorWhereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * GET /api/visitors
 *
 * Two execution paths controlled by the USE_ZCQL master flag:
 *   - true:  push filters down to Catalyst via ZCQL (scales with table size)
 *   - false (default): list everything and filter in JS (safe fallback while
 *     ZCQL behavior in this project is being validated)
 */
export async function getVisitors(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as VisitorFilters;
    // STAFF see only their own rows — resolved to the full identity-alias set
    // (Catalyst ROWID + legacy UUID) so pre-migration rows still match.
    const staffIds =
      req.user?.role === 'STAFF' ? await getUserIdAliases(req.user.id) : null;
    if (useZCQL()) {
      const clauses = buildVisitorWhere(staffIds, filters);
      const where = visitorWhereSql(clauses);
      // ZCQL caps LIMIT at 300 but the list contract allows up to 1000, so a
      // request for more than 299 rows is served in chunks (fetchOffsetWindow)
      // rather than clamped. Clamping silently either loses rows 299-999
      // outright or quietly hands back a page a third of the size the caller
      // asked for; chunking returns the window that was actually requested.

      // A real count, run in PARALLEL with the page query and only on page 1,
      // behind a stale-while-revalidate cache. The key is scoped by role + user
      // id because STAFF results are per-identity — a shared key would leak one
      // staffer's row count to another.
      const countKey =
        `${COUNT_CACHE_PREFIX}${req.user?.role}:${req.user?.id}:` + JSON.stringify(clauses);

      const [fetched, total] = await Promise.all([
        // ROWID tiebreaker: a busy office logs dozens of visitors against the
        // same visitDate, and with only a partial order those tied rows get
        // re-shuffled per query — the same visitor shows up on two pages and
        // another is never returned at all.
        fetchOffsetWindow(
          VISITOR_TABLE,
          where,
          'visitDate',
          'newest',
          skip,
          limit + 1 // +1 probes for a next page
        ),
        // Counted on EVERY page, not just the first: the key is derived from
        // the predicate (not the page), so pages 2+ hit the cache page 1 warmed
        // and cost nothing. Gating on page 1 made meta.totalKnown false the
        // moment the user clicked Next, which leaves the pager rendering
        // "Page 2 of undefined" — the same lost-total symptom this replaced.
        cacheSWR(countKey, 30, 120, () => countRows(VISITOR_TABLE, where)),
      ]);

      const hasMore = fetched.length > limit;
      const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
      const visitors = await attachCreators(pageRows);
      sendSuccess(res, visitors, 'Visitors retrieved successfully', 200, {
        page,
        limit,
        count: pageRows.length,
        hasMore,
        // `total` appears ONLY when it is real. The old
        // `skip + rows.length + (hasMore ? 1 : 0)` looked like a count but can
        // never exceed currentPage + 1, so the pager capped itself at two pages
        // and hid the rest of the table.
        ...(total !== null && total !== undefined
          ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
          : { totalKnown: false }),
      });
      return;
    }

    // ── Fallback path: list everything, filter in JS ────────────────────
    let rows = await listAllRows(VISITOR_TABLE, 1000);

    // STAFF data isolation
    if (staffIds) {
      const idSet = new Set(staffIds);
      rows = rows.filter((r) => idSet.has(String(r.createdById)));
    }

    // Search filter (name | designation | purpose)
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.designation || '').toLowerCase().includes(q) ||
          (r.purpose || '').toLowerCase().includes(q)
      );
    }

    // Date range filter — day-inclusive on both ends, matching the half-open
    // bound the ZCQL branch emits. The two paths have to agree.
    const inDayRange = dayRangeFilter(
      filters.startDate as unknown as string,
      filters.endDate as unknown as string
    );
    if (inDayRange) {
      rows = rows.filter((r) => inDayRange(r.visitDate));
    }

    rows.sort((a, b) => {
      const ta = sortTime(a.visitDate);
      const tb = sortTime(b.visitDate);
      // Mirrors `ORDER BY visitDate DESC, ROWID DESC`. Same-day visitors are
      // the norm here, so without a total order this page and the ZCQL page
      // disagree about which rows land where.
      if (tb !== ta) return tb - ta;
      return compareRowIdAsc(b.ROWID, a.ROWID);
    });

    // Honest total: this path has the whole filtered set in memory, so the
    // count is exact rather than inferred from the current page.
    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const visitors = await attachCreators(paged);

    sendSuccess(res, visitors, 'Visitors retrieved successfully', 200, {
      page,
      limit,
      count: paged.length,
      hasMore: skip + paged.length < total,
      total,
      totalKnown: true,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    sendServerError(res, 'Failed to get visitors', error);
  }
}

/**
 * GET /api/visitors/:id
 */
export async function getVisitorById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(VISITOR_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Visitor not found');
      return;
    }

    if (req.user?.role === 'STAFF') {
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(row.createdById))) {
        sendError(res, 'Forbidden', 403);
        return;
      }
    }

    const [shaped] = await attachCreators([row]);
    sendSuccess(res, shaped, 'Visitor retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get visitor', error);
  }
}

/**
 * PUT /api/visitors/:id
 */
export async function updateVisitor(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, designation, phone, dob, purpose, referencedBy, visitDate, constituency, wardVillage, isOfficial } = req.body;

    // Corrections: staff may only edit visitors they logged (matched against
    // all identity aliases). Admins can edit any.
    if (req.user?.role === 'STAFF') {
      const existing = await getRow(VISITOR_TABLE, id);
      if (!existing) {
        sendNotFound(res, 'Visitor not found');
        return;
      }
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(existing.createdById))) {
        sendError(res, 'You can only edit visitors you logged', 403);
        return;
      }
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (name !== undefined) updateData.name = name;
    if (designation !== undefined) updateData.designation = designation;
    if (phone !== undefined) updateData.phone = phone;
    if (dob !== undefined) updateData.dob = toCatalystDate(dob);
    if (purpose !== undefined) updateData.purpose = purpose;
    if (referencedBy !== undefined) updateData.referencedBy = referencedBy;
    if (visitDate !== undefined) updateData.visitDate = toCatalystDate(visitDate);
    if (constituency !== undefined) updateData.constituency = constituency;
    if (wardVillage !== undefined) updateData.wardVillage = wardVillage;
    if (isOfficial !== undefined) updateData.isOfficial = Boolean(isOfficial);

    // Edit audit — stamp who edited and when. Never let the client override it.
    if (req.user) {
      updateData.lastEditedById = req.user.id;
      updateData.lastEditedAt = nowCatalystIST();
    }

    // updateRowTolerant tolerates a Catalyst schema that doesn't have the audit
    // / isOfficial columns yet — it retries without them if Catalyst rejects.
    const updated = await updateRowTolerant(VISITOR_TABLE, updateData as any, [
      'lastEditedById',
      'lastEditedAt',
      'isOfficial',
    ]);
    // An edited visitDate moves the row between date buckets, so the cached
    // per-filter totals are no longer trustworthy.
    cacheClear(COUNT_CACHE_PREFIX);
    const [shaped] = await attachCreators([updated]);
    sendSuccess(res, shaped, 'Visitor updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update visitor', error);
  }
}

/**
 * DELETE /api/visitors/:id
 */
export async function deleteVisitor(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(VISITOR_TABLE, id);
    cacheClear(COUNT_CACHE_PREFIX);
    sendSuccess(res, null, 'Visitor deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete visitor', error);
  }
}

/**
 * GET /api/visitors/birthdays/today
 */
export async function getTodayBirthdays(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const rows = await listAllRows(VISITOR_TABLE, 1000);
    const matches = rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      return d.getMonth() + 1 === month && d.getDate() === day;
    });

    const visitors = await attachCreators(matches);
    sendSuccess(res, visitors, "Today's birthdays retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/**
 * GET /api/visitors/date/:date
 */
export async function getVisitorsByDate(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { date } = req.params;
    const target = new Date(date);
    const next = new Date(target);
    next.setDate(next.getDate() + 1);

    const rows = await listAllRows(VISITOR_TABLE, 1000);
    const startMs = target.getTime();
    const endMs = next.getTime();
    const matches = rows
      .filter((r) => {
        if (!r.visitDate) return false;
        const t = new Date(r.visitDate).getTime();
        return t >= startMs && t < endMs;
      })
      // ROWID tiebreaker: every row here shares the same day, so visitDate
      // alone leaves most of the list in an arbitrary, request-to-request
      // order. Same total order the list endpoint uses.
      .sort((a, b) => {
        const ta = sortTime(a.visitDate);
        const tb = sortTime(b.visitDate);
        if (tb !== ta) return tb - ta;
        return compareRowIdAsc(b.ROWID, a.ROWID);
      });

    const visitors = await attachCreators(matches);
    sendSuccess(res, visitors, 'Visitors retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get visitors', error);
  }
}
