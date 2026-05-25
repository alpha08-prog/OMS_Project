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
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  executeZCQL,
  zcqlEscapeValue,
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
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { emitNotification } from './notification.controller';
import type {
  AuthenticatedRequest,
  TourProgramFilters,
  EventFilters,
} from '../types';

const TOUR_TABLE = 'TourProgram';
const VALID_DECISIONS = new Set(['PENDING', 'ACCEPTED', 'REGRET']);

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
  completedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    eventName: row.eventName,
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
    createdById: row.createdById,
    completedById: row.completedById ?? null,
    createdBy: createdBy ?? null,
    completedBy: completedBy ?? null,
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
  }
  const users = await lookupUsers(ids);
  return safe.map((r) =>
    shapeTour(
      r,
      users.get(String(r.createdById)) ?? null,
      r.completedById ? users.get(String(r.completedById)) ?? null : null
    )
  );
}

function invalidateCaches() {
  cacheClear('calendar_events_');
  cacheClear('dashboard_stats');
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

    const row = await insertRow(TOUR_TABLE, {
      eventName,
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

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Tour program created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create tour program', error);
  }
}

function buildTourZCQL(filters: TourProgramFilters, staffId?: string): string {
  const conditions: string[] = [];
  // Staff can only see their own tour programs. Admins/super-admins see all.
  // Aligns with the data-isolation already enforced for grievances, visitors,
  // and train requests.
  if (staffId) {
    conditions.push(`createdById = '${zcqlEscapeValue(staffId)}'`);
  }
  if (filters.decision) {
    conditions.push(`decision = '${zcqlEscapeValue(String(filters.decision))}'`);
  }
  if (filters.search) {
    const q = zcqlEscapeValue(String(filters.search));
    conditions.push(
      `(eventName LIKE '%${q}%' OR organizer LIKE '%${q}%' OR venue LIKE '%${q}%')`
    );
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

    // Scope to creator for STAFF role; admins see everything.
    const staffId = req.user?.role === 'STAFF' ? req.user.id : undefined;

    if (useZCQL()) {
      const baseQuery = buildTourZCQL(filters, staffId);
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      total = skip + pageRows.length + (hasMore ? 1 : 0);
    } else {
      let rows = await listAllRows(TOUR_TABLE);
      if (staffId) {
        rows = rows.filter((r) => String(r.createdById) === staffId);
      }
      if (filters.decision) {
        rows = rows.filter((r) => r.decision === filters.decision);
      }
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        rows = rows.filter(
          (r) =>
            (r.eventName || '').toLowerCase().includes(q) ||
            (r.organizer || '').toLowerCase().includes(q) ||
            (r.venue || '').toLowerCase().includes(q)
        );
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
    if (body.attendeesCount !== undefined) {
      updateData.attendeesCount = parseInt0(body.attendeesCount);
    }

    const updated = await updateRow(TOUR_TABLE, updateData as any);
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
