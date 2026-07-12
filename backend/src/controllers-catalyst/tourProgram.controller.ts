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
  zcqlSafeLimit,
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
import { cacheClear } from '../lib/cache';
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
      } else if (legacyId && wanted.has(legacyId)) {
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

function invalidateCaches() {
  cacheClear('calendar_events_');
  cacheClear('dashboard_stats');
}

/**
 * Best-effort sequential reference number: TOUR-<IST year>-NNNN. Scans existing
 * tourNumber values for the current year and returns max+1. Not transaction-safe
 * — adequate for office-scale concurrency. Mirrors nextGrievanceNumber().
 */
async function nextTourNumber(): Promise<string> {
  const istYear = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
  const prefix = `TOUR-${istYear}-`;
  let maxSeq = 0;
  try {
    const rows = await listAllRows(TOUR_TABLE);
    for (const r of rows) {
      const num = String(r.tourNumber ?? '');
      if (num.startsWith(prefix)) {
        const seq = parseInt(num.slice(prefix.length), 10);
        if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
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

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Tour program created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create tour program', error);
  }
}

function buildTourZCQL(filters: TourProgramFilters, staffIds?: string[]): string {
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
  if (filters.search) {
    const raw = String(filters.search).trim();
    const q = zcqlEscapeValue(raw);
    const clauses = [
      `eventName LIKE '%${q}%'`,
      `organizer LIKE '%${q}%'`,
      `venue LIKE '%${q}%'`,
      `tourNumber LIKE '%${q}%'`,
    ];
    // Legacy "TOUR-<rowid>" reference → match the ROWID directly.
    const m = raw.match(/^TOUR-(\d+)$/i);
    if (m) clauses.push(`ROWID = ${m[1]}`);
    conditions.push(`(${clauses.join(' OR ')})`);
  }
  if (filters.startDate) {
    const start = toCatalystDate(filters.startDate as unknown as string);
    if (start) conditions.push(`dateTime >= '${start}'`);
  }
  if (filters.endDate) {
    const end = toCatalystDate(filters.endDate as unknown as string);
    if (end) conditions.push(`dateTime <= '${end}'`);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return `SELECT * FROM ${TOUR_TABLE}${where} ORDER BY dateTime ASC`;
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
    let total: number;

    // Scope to creator for STAFF role; admins see everything. Resolved to the
    // full identity-alias set (ROWID + legacy UUID) so pre-migration rows match.
    const staffIds =
      req.user?.role === 'STAFF' ? await getUserIdAliases(req.user.id) : undefined;

    // Free-text search (incl. reference number / TOUR-<rowid>) always runs
    // through the JS path: it reliably matches tourNumber + ROWID and scans the
    // whole table, sidestepping ZCQL quirks and a possibly-missing tourNumber
    // column. ZCQL still handles the common filtered/sorted list with no search.
    if (useZCQL() && !filters.search) {
      const baseQuery = buildTourZCQL(filters, staffIds);
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      total = skip + pageRows.length + (hasMore ? 1 : 0);
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
      if (filters.startDate) {
        const start = new Date(filters.startDate as unknown as string).getTime();
        rows = rows.filter(
          (r) => r.dateTime && new Date(r.dateTime).getTime() >= start
        );
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate as unknown as string).getTime();
        rows = rows.filter(
          (r) => r.dateTime && new Date(r.dateTime).getTime() <= end
        );
      }

      rows.sort((a, b) => {
        const ta = a.dateTime ? new Date(a.dateTime).getTime() : 0;
        const tb = b.dateTime ? new Date(b.dateTime).getTime() : 0;
        return ta - tb;
      });

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
    }

    const data = await hydrate(pageRows);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Tour programs retrieved successfully', 200, meta);
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

    const rows = await listAllRows(TOUR_TABLE);
    const matched = rows
      .filter((r) => r.decision === 'ACCEPTED')
      .filter((r) => {
        if (!r.dateTime) return false;
        const t = new Date(r.dateTime).getTime();
        return t >= today.getTime() && t < tomorrow.getTime();
      })
      .sort(
        (a, b) =>
          new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      );

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

    const rows = await listAllRows(TOUR_TABLE);
    const matched = rows
      .filter((r) => {
        if (!r.dateTime) return false;
        const t = new Date(r.dateTime).getTime();
        return t >= now && t <= sevenDaysLater;
      })
      .sort(
        (a, b) =>
          new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      )
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

    if (startDate) {
      const start = new Date(startDate).getTime();
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= start
      );
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() <= end
      );
    }

    rows.sort((a, b) => {
      const ta = a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const tb = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return tb - ta; // most recent first
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Pending decisions retrieved', 200, meta);
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
    if (filters.startDate) {
      const start = new Date(filters.startDate as unknown as string).getTime();
      rows = rows.filter(
        (r) => r.dateTime && new Date(r.dateTime).getTime() >= start
      );
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate as unknown as string).getTime();
      rows = rows.filter(
        (r) => r.dateTime && new Date(r.dateTime).getTime() <= end
      );
    }
    if (filters.isCompleted !== undefined) {
      const want = String(filters.isCompleted) === 'true';
      rows = rows.filter((r) => parseBool(r.isCompleted) === want);
    }

    rows.sort((a, b) => {
      const ta = a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const tb = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return tb - ta; // most recent past events first
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Events retrieved successfully', 200, meta);
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
