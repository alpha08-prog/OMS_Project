/**
 * Meeting controller — Catalyst Data Store.
 *
 * Admin-only module: an admin schedules meetings, sees every past + upcoming
 * meeting in one list, and fills a post-meeting summary/remark on each.
 *
 * Table: `Meeting`
 *   title          (text)      — required
 *   dateTime       (datetime)  — when the meeting is/was scheduled (IST)
 *   location       (text)      — optional
 *   attendees      (text)      — optional, free text / comma-separated names
 *   agenda         (text)      — optional, purpose / agenda
 *   status         (text)      — SCHEDULED | COMPLETED | CANCELLED
 *   summary        (text)      — optional, filled in after the meeting
 *   createdById    (text)      — admin who scheduled it (audit trail)
 *   lastEditedById (text)      — admin who last edited it (audit trail)
 *   lastEditedAt   (datetime)  — when it was last edited (audit trail)
 */
import { Response } from 'express';
import {
  insertRow,
  getRow,
  updateRow,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  executeZCQL,
  zcqlEscapeValue,
  zcqlSearchWithinBudget,
  countZcqlConditions,
  assertConditionBudget,
  assertZcqlLimit,
  dateRangeClauses,
  countRows,
  fetchOffsetWindow,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import { lookupUsers } from '../lib/catalyst-user-lookup';
import { cacheClear, cacheSWR } from '../lib/cache';
import { createMeetingGoogleEvent } from '../services/google.service';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
// calculatePaginationMeta is deliberately not imported: it takes `total` as a
// REQUIRED argument, which forces a caller that cannot count to invent one.
// parsePagination stays — the page/limit contract is unchanged.
import { parsePagination } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

const MEETING_TABLE = 'Meeting';
/** Count cache prefix — cleared on every write so the pager can't lag a create. */
const MEETING_COUNT_PREFIX = 'meetings:count:';

const VALID_STATUSES = new Set(['SCHEDULED', 'COMPLETED', 'CANCELLED']);

type ResolvedUser = { id: string; name: string; email: string };

/** Reshape a Catalyst Meeting row → the JSON shape the frontend expects. */
function shapeMeeting(
  row: CatalystRow,
  createdBy?: ResolvedUser | null,
  lastEditedBy?: ResolvedUser | null
) {
  return {
    id: String(row.ROWID),
    title: row.title,
    dateTime: row.dateTime,
    location: row.location ?? null,
    attendees: row.attendees ?? null,
    agenda: row.agenda ?? null,
    status: row.status ?? 'SCHEDULED',
    summary: row.summary ?? null,
    // True once this meeting has been pushed to Google Calendar.
    googleSynced: !!row.googleCalendarEventId,
    createdById: row.createdById ?? null,
    createdBy: createdBy ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    // Audit trail — who last edited this meeting and when.
    lastEditedById: row.lastEditedById ?? null,
    lastEditedBy: lastEditedBy ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
  };
}

/** Attach createdBy + lastEditedBy user info to a list of meetings (one batch). */
async function attachUsers(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.lastEditedById) ids.add(String(r.lastEditedById));
  }

  let byId = new Map<string, ResolvedUser>();
  if (ids.size > 0) {
    try {
      byId = await lookupUsers(ids);
    } catch {
      // AppUser unreachable — leave creator/editor names null.
    }
  }

  return safe.map((r) =>
    shapeMeeting(
      r,
      (r.createdById && byId.get(String(r.createdById))) || null,
      (r.lastEditedById && byId.get(String(r.lastEditedById))) || null
    )
  );
}

/**
 * POST /api/meetings — schedule a new meeting. Admin-only.
 */
export async function createMeeting(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { title, dateTime, location, attendees, agenda, summary } =
      req.body as Record<string, unknown>;

    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!cleanTitle) {
      sendError(res, 'title is required');
      return;
    }
    const when = toCatalystDate(dateTime as string);
    if (!when) {
      sendError(res, 'dateTime is required and must be a valid date/time');
      return;
    }

    const payload: Record<string, unknown> = {
      title: cleanTitle,
      dateTime: when,
      status: 'SCHEDULED',
      createdById: req.user.id,
    };
    if (typeof location === 'string' && location.trim()) payload.location = location.trim();
    if (typeof attendees === 'string' && attendees.trim()) payload.attendees = attendees.trim();
    if (typeof agenda === 'string' && agenda.trim()) payload.agenda = agenda.trim();
    if (typeof summary === 'string' && summary.trim()) payload.summary = summary.trim();

    const row = await insertRow(MEETING_TABLE, payload);

    // Best-effort: push to the scheduler's Google Calendar if connected. Never
    // fails the request — the meeting is saved regardless and can still be
    // synced later via the calendar's "Sync All".
    try {
      const googleEventId = await createMeetingGoogleEvent(req.user.id, {
        id: String(row.ROWID),
        title: String(row.title),
        dateTime: String(row.dateTime),
        location: row.location ?? null,
        attendees: row.attendees ?? null,
        agenda: row.agenda ?? null,
      });
      if (googleEventId) {
        await updateRow(MEETING_TABLE, {
          ROWID: String(row.ROWID),
          googleCalendarEventId: googleEventId,
        });
        row.googleCalendarEventId = googleEventId;
      }
    } catch (err) {
      console.error('Failed to push meeting to Google Calendar:', err);
    }

    // The calendar view caches its merged event list per user — drop it so the
    // new meeting appears immediately. Same for the list's cached COUNT, or the
    // pager reports one meeting fewer than the list shows for up to 30s.
    cacheClear('calendar_events_');
    cacheClear(MEETING_COUNT_PREFIX);

    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Meeting scheduled successfully', 201);
  } catch (error) {
    const msg =
      error instanceof Error && error.message
        ? `Failed to schedule meeting: ${error.message}`
        : 'Failed to schedule meeting';
    sendServerError(res, msg, error);
  }
}

type MeetingQuery = {
  status?: string;
  scope?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
};

/**
 * WHERE clauses only — no ORDER BY, no LIMIT. Kept separate so the page query
 * and the COUNT query are built from the SAME predicate; a total that disagrees
 * with the rows on screen is its own bug.
 */
function buildMeetingWhere(q: MeetingQuery): string[] {
  const clauses: string[] = [];

  if (q.status) {
    const want = String(q.status).toUpperCase();
    // Rows written before `status` existed read back null, and the previous
    // in-JS filter treated them as SCHEDULED (`String(r.status ?? 'SCHEDULED')`).
    // Keep that, or filtering the default tab quietly hides those meetings.
    clauses.push(
      want === 'SCHEDULED'
        ? `(status = 'SCHEDULED' OR status IS NULL)`
        : `status = '${zcqlEscapeValue(want)}'`
    );
  }

  if (q.scope === 'upcoming' || q.scope === 'past') {
    // Catalyst datetimes are IST strings in `YYYY-MM-DD HH:mm:ss` form, so a
    // direct compare against nowCatalystIST() orders correctly.
    const now = nowCatalystIST();
    clauses.push(
      q.scope === 'upcoming'
        ? // An undated meeting counted as upcoming before; keep it there rather
          // than letting it fall out of both halves of the split.
          `(dateTime >= '${now}' OR dateTime IS NULL)`
        : `dateTime < '${now}'`
    );
  }

  // dateTime is a real datetime (toCatalystDate on write), so the half-open
  // upper bound matters here: a `<=` end-of-day bound drops the last second.
  clauses.push(...dateRangeClauses('dateTime', q.startDate, q.endDate));

  if (q.search && String(q.search).trim()) {
    // Search is the only variable-width clause, so it is the one that yields to
    // the 10-condition ZCQL budget — visibly (it warns), not by 400-ing the
    // whole query. Most-identifying column first.
    const { clause } = zcqlSearchWithinBudget(
      ['title', 'location', 'attendees', 'agenda'],
      String(q.search).trim(),
      countZcqlConditions(clauses)
    );
    // No budget left for search at all — match nothing rather than silently
    // ignoring the search box and returning the unfiltered list.
    clauses.push(clause ?? 'ROWID = 0');
  }
  return clauses;
}

function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * Fetch `want` rows starting at `skip`, in ZCQL-legal chunks.
 *
 * parsePagination permits limit up to 1000 while ZCQL rejects LIMIT > 300, and
 * both meetings screens ask for 200 in one go. Clamping silently is how rows
 * 299-999 disappear from every page at once, so serve the window the caller
 * actually asked for instead.
 */
async function fetchMeetingWindow(
  filterWhere: string,
  skip: number,
  want: number
): Promise<CatalystRow[]> {
  // Delegates to the shared KEYSET walk. The obvious implementation — LIMIT 299
  // with a marching OFFSET — silently DUPLICATES rows at chunk boundaries:
  // measured on a 2067-row table with a full total order and no concurrent
  // writes, the OFFSET walk returned 2068 rows / 2067 unique while the keyset
  // walk returned exactly 2067. Catalyst's OFFSET is not stable, and a
  // tiebreaker in ORDER BY does not fix it.
  return fetchOffsetWindow(MEETING_TABLE, filterWhere, 'dateTime', 'newest', skip, want);
}

/**
 * GET /api/meetings — list meetings (upcoming + past), newest first.
 *
 * Optional query:
 *   - status=SCHEDULED|COMPLETED|CANCELLED
 *   - scope=upcoming|past          (split on dateTime vs now, IST)
 *   - startDate / endDate          (inclusive, on dateTime)
 *   - search                       (title / location / attendees / agenda)
 *
 * Filtering, sorting and paging are pushed down to the datastore. This used to
 * read the ENTIRE Meeting table on every request and slice it in Node, so the
 * cost of showing 25 rows grew with every meeting ever scheduled.
 */
export async function getMeetings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const query = req.query as MeetingQuery;

    const clauses = assertConditionBudget(buildMeetingWhere(query), 'meeting list');
    const filterWhere = whereSql(clauses);

    // Count runs in PARALLEL with the page query behind a short SWR cache.
    // Keyed on the raw filters rather than the generated SQL because the
    // `scope` predicate embeds "now" and would otherwise miss the cache every
    // second. Meetings are not user-scoped (every admin sees the same list), so
    // a shared key leaks nothing.
    const countKey =
      MEETING_COUNT_PREFIX +
      JSON.stringify([query.status, query.scope, query.startDate, query.endDate, query.search]);

    const [fetched, total] = await Promise.all([
      // +1 probe row tells us whether another page exists without a count.
      fetchMeetingWindow(filterWhere, skip, limit + 1),
      cacheSWR(countKey, 30, 120, () => countRows(MEETING_TABLE, filterWhere)),
    ]);

    const hasMore = fetched.length > limit;
    const rows = hasMore ? fetched.slice(0, limit) : fetched;
    const meetings = await attachUsers(rows);

    sendSuccess(res, meetings, 'Meetings retrieved successfully', 200, {
      page,
      limit,
      count: rows.length,
      hasMore,
      // `total` is present ONLY when it is a real count. When COUNT is
      // unavailable the response says so instead of inventing a number the
      // pager would then cap itself against.
      ...(total !== null && total !== undefined
        ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
        : { totalKnown: false }),
    });
  } catch (error) {
    sendServerError(res, 'Failed to get meetings', error);
  }
}

/**
 * GET /api/meetings/:id
 */
export async function getMeetingById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(MEETING_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Meeting not found');
      return;
    }
    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Meeting retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get meeting', error);
  }
}

/**
 * PATCH /api/meetings/:id — update fields, incl. the post-meeting summary
 * and status. Stamps the audit trail (who edited, when). Admin-only.
 */
export async function updateMeeting(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const body = { ...req.body } as Record<string, unknown>;

    const updateData: Record<string, unknown> = { ROWID: id };

    if (typeof body.title === 'string') {
      const t = body.title.trim();
      if (!t) {
        sendError(res, 'title cannot be empty');
        return;
      }
      updateData.title = t;
    }
    if (body.dateTime !== undefined) {
      const when = toCatalystDate(body.dateTime as string);
      if (!when) {
        sendError(res, 'Invalid dateTime');
        return;
      }
      updateData.dateTime = when;
    }
    if (body.status !== undefined) {
      const s = String(body.status).toUpperCase();
      if (!VALID_STATUSES.has(s)) {
        sendError(res, `Invalid status: ${body.status}`);
        return;
      }
      updateData.status = s;
    }
    if (body.location !== undefined) {
      updateData.location = body.location === null ? null : String(body.location).trim();
    }
    if (body.attendees !== undefined) {
      updateData.attendees = body.attendees === null ? null : String(body.attendees).trim();
    }
    if (body.agenda !== undefined) {
      updateData.agenda = body.agenda === null ? null : String(body.agenda).trim();
    }
    if (body.summary !== undefined) {
      updateData.summary = body.summary === null ? null : String(body.summary).trim();
    }

    // Audit trail — never let the client override who/when.
    updateData.lastEditedById = req.user.id;
    updateData.lastEditedAt = nowCatalystIST();

    const updated = await updateRow(MEETING_TABLE, updateData as { ROWID: string });
    cacheClear('calendar_events_');
    // A status/dateTime edit moves the row between filtered counts.
    cacheClear(MEETING_COUNT_PREFIX);
    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Meeting updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update meeting', error);
  }
}

/**
 * DELETE /api/meetings/:id
 */
export async function deleteMeeting(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(MEETING_TABLE, id);
    cacheClear('calendar_events_');
    cacheClear(MEETING_COUNT_PREFIX);
    sendSuccess(res, null, 'Meeting deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete meeting', error);
  }
}
