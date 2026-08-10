import { Request, Response } from 'express';
import {
  listAllRows,
  getRow,
  insertRow,
  updateRow,
  deleteRow,
  toCatalystDate,
  executeZCQL,
  zcqlAnyOf,
  dateRangeClauses,
  columnExists,
  assertConditionBudget,
  assertZcqlLimit,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import { getUserIdAliases } from '../lib/catalyst-user-lookup';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache';
import { sendSuccess, sendServerError, sendError } from '../utils/response';
import config from '../config';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  disconnectCalendar,
  createTourCalendarEvent,
  createCustomGoogleEvent,
  createMeetingGoogleEvent,
  isCalendarConnected,
} from '../services/google.service';
import type { AuthenticatedRequest } from '../types';

const TOUR_TABLE = 'TourProgram';
const CUSTOM_EVENT_TABLE = 'CustomCalendarEvent';
const MEETING_TABLE = 'Meeting';

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

// A single ZCQL page is capped at 299 rows, so anything that must return a
// complete set has to walk pages. 12 pages (~3.5k rows) is a ceiling on any
// one calendar window or sync batch — far above a realistic month range, and
// bounded, which the old whole-table reads were not.
const MAX_PAGED_READS = 12;

/**
 * Run a filtered SELECT and page through the entire result set.
 *
 * Two traps this closes. ZCQL rejects LIMIT > 300, so a single query silently
 * truncates a busy window instead of erroring. And a sort on a timestamp alone
 * duplicates and drops rows across page boundaries whenever two rows share a
 * value, so the ORDER BY carries a ROWID tiebreaker.
 *
 * Throws on a missing table (Catalyst says "Unkown Table") exactly like the
 * listAllRows call it replaces — callers keep the try/catch that made
 * CustomCalendarEvent and Meeting optional.
 */
async function selectAllPaged(
  table: string,
  clauses: string[],
  orderColumn: string
): Promise<CatalystRow[]> {
  // The clause set here is internal and bounded (a date window plus at most a
  // couple of identity aliases), so exceeding the budget would be a programmer
  // error, not something a user can provoke. Throwing is the right response —
  // unlike the user-facing list endpoints, which shed clauses instead.
  assertConditionBudget(clauses, `${table} calendar query`);
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';

  // KEYSET, not OFFSET. Catalyst's OFFSET is not stable: measured on a
  // 2067-row table with a full total order and no concurrent writes, a chunked
  // OFFSET walk returned 2068 rows / 2067 unique while a keyset walk returned
  // exactly 2067. Seeking past the last ROWID already read cannot drift, and
  // ROWID is unique so it needs no tiebreaker.
  const rows: CatalystRow[] = [];
  let lastRowId: string | null = null;
  for (let page = 0; page < MAX_PAGED_READS; page++) {
    const pageWhere: string = lastRowId
      ? `${where ? `${where} AND` : ' WHERE'} ROWID > ${lastRowId}`
      : where;
    const batch: CatalystRow[] = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${table}${pageWhere} ORDER BY ROWID ASC ` +
        `LIMIT ${assertZcqlLimit(ZCQL_MAX_LIMIT)}`
    );
    rows.push(...batch);
    if (batch.length < ZCQL_MAX_LIMIT) break;
    lastRowId = String(batch[batch.length - 1].ROWID);
    if (page === MAX_PAGED_READS - 1) {
      // Hitting the ceiling means matching rows exist that this call will
      // never return. Silent truncation is exactly how records disappear, so
      // the cap has to announce itself rather than look like an empty tail.
      console.warn(
        `[google] ${table} read hit the ${MAX_PAGED_READS}-page ceiling ` +
          `(${rows.length} rows) — results are truncated. Narrow the window.`
      );
    }
  }
  // The caller sorts by `orderColumn`; reading in ROWID order is only how the
  // rows are STREAMED, not how they are presented.
  rows.sort((a, b) =>
    String(a[orderColumn] ?? '').localeCompare(String(b[orderColumn] ?? ''))
  );
  return rows;
}

/**
 * Catalyst answers "Unkown Table" (its spelling) when a table was never
 * created, which is the expected state for the optional CustomCalendarEvent
 * and Meeting modules. Every OTHER failure — a rejected predicate, a column
 * that does not exist, a transient 400 — renders as "this user has no events",
 * which is indistinguishable from the truth unless we say so.
 */
function warnUnlessMissingTable(table: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unk?nown table/i.test(msg)) return;
  console.warn(`[google] ${table} calendar read failed; returning no events:`, msg);
}

// The calendar is a window onto a date range, but this endpoint used to read
// every tour, meeting and custom event ever recorded — so its cost grew with
// the age of the deployment rather than with what the user is looking at.
// Callers may pass ?startDate=&endDate= (YYYY-MM-DD). The default span is
// deliberately wide because AdminCalendar fetches once and then pages through
// months client-side; it still bounds the read to a fixed number of months
// instead of "everything".
const DEFAULT_WINDOW_MONTHS_BACK = 24;
const DEFAULT_WINDOW_MONTHS_FORWARD = 12;

function resolveWindow(query: Record<string, unknown>): {
  startDate: string;
  endDate: string;
} {
  const asDate = (v: unknown): string | null => {
    const s = String(v ?? '').trim();
    // Shape AND validity. A shape-only check accepts '2026-13-99', which
    // toCatalystDate then parses as Invalid Date and silently drops from the
    // WHERE clause — turning a bad query param into an UNBOUNDED table read
    // rather than an error. Round-tripping through Date catches that.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
  };
  const now = new Date();
  // First of the month N months back → last day of the month M months ahead,
  // so month navigation never lands on a half-populated edge month.
  const defStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - DEFAULT_WINDOW_MONTHS_BACK, 1)
  );
  const defEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + DEFAULT_WINDOW_MONTHS_FORWARD + 1, 0)
  );
  return {
    startDate: asDate(query.startDate) ?? defStart.toISOString().slice(0, 10),
    endDate: asDate(query.endDate) ?? defEnd.toISOString().slice(0, 10),
  };
}

/**
 * Rows still awaiting a push to Google Calendar.
 *
 * `googleCalendarEventId IS NULL` is pushed down so each re-run reads only
 * what is left to do — the read shrinks as the sync progresses instead of
 * pulling every already-synced row back over the wire every time.
 *
 * `clauses` (ZCQL) and `filter` (JS) express the SAME extra predicate. Both
 * are needed and both must agree: ZCQL 400s the whole query when the optional
 * `googleCalendarEventId` column is absent, in which case we fall back to the
 * original full read and filter in JS.
 */
async function fetchPendingSync(
  table: string,
  orderColumn: string,
  opts: { clauses?: string[]; filter?: (row: CatalystRow) => boolean } = {}
): Promise<CatalystRow[]> {
  const keep = (rows: CatalystRow[]) =>
    rows.filter(
      (r) => !r.googleCalendarEventId && (opts.filter ? opts.filter(r) : true)
    );

  if (await columnExists(table, 'googleCalendarEventId')) {
    try {
      const rows = await selectAllPaged(
        table,
        [...(opts.clauses ?? []), 'googleCalendarEventId IS NULL'],
        orderColumn
      );
      return keep(rows);
    } catch (err) {
      // Don't let a rejected predicate silently sync nothing — say so, then
      // do it the slow-but-known-good way.
      console.warn(
        `[google] Narrowed unsynced query for ${table} failed; falling back to a full read:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return keep(await listAllRows(table));
}

/**
 * Redirect admin to Google OAuth consent screen
 * GET /api/google/connect
 */
export async function initiateGoogleAuth(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const url = getAuthUrl(req.user!.id);
    res.redirect(url);
  } catch (error) {
    sendServerError(res, 'Failed to initiate Google auth', error);
  }
}

/**
 * Google redirects here after user grants permission
 * GET /api/google/callback
 */
export async function handleGoogleCallback(req: Request, res: Response): Promise<void> {
  const frontendBase = config.frontendUrl;
  try {
    const { code, state: userId } = req.query as { code?: string; state?: string };

    if (!code || !userId) {
      res.redirect(`${frontendBase}/admin/calendar?error=missing_params`);
      return;
    }

    await exchangeCodeForTokens(code, userId);
    res.redirect(`${frontendBase}/admin/calendar?connected=true`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${frontendBase}/admin/calendar?error=auth_failed`);
  }
}

/**
 * Check whether the current user has connected Google Calendar
 * GET /api/google/status
 */
export async function getCalendarStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const connected = await isCalendarConnected(req.user!.id);
    sendSuccess(res, { connected });
  } catch (error) {
    sendServerError(res, 'Failed to get calendar status', error);
  }
}

/**
 * Remove stored Google tokens for the current user
 * DELETE /api/google/disconnect
 */
export async function disconnectGoogleCalendar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await disconnectCalendar(req.user!.id);
    sendSuccess(res, null, 'Google Calendar disconnected');
  } catch (error) {
    sendServerError(res, 'Failed to disconnect calendar', error);
  }
}

/**
 * Return all calendar-relevant events (accepted tours + tasks with due dates)
 * GET /api/google/events
 */
export async function getCalendarEvents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { startDate, endDate } = resolveWindow(
      req.query as Record<string, unknown>
    );
    // Window is part of the identity of the cached payload — a shared key
    // would serve one range's events for another. The `calendar_events_`
    // prefix is load-bearing: tour/meeting writes invalidate by that prefix.
    const cacheKey = `calendar_events_${req.user!.id}_${startDate}_${endDate}`;
    const cached = cacheGet<unknown[]>(cacheKey);
    if (cached) {
      sendSuccess(res, cached);
      return;
    }

    // Ownership must match the identity ALIAS set (ROWID + pre-migration legacy
    // UUID), not a bare createdById comparison: which form a row carries depends
    // on when it was written, so matching only req.user.id makes a user's older
    // events vanish from their own calendar.
    const aliases = await getUserIdAliases(req.user!.id);

    // The three reads are independent — issue them together instead of paying
    // three serial Catalyst round-trips. Tours keep their old un-caught
    // behaviour (a failure is a 500); the two optional tables keep theirs
    // (a missing table yields no events).
    const [acceptedTours, customEvents, meetings] = await Promise.all([
      selectAllPaged(
        TOUR_TABLE,
        [`decision = 'ACCEPTED'`, ...dateRangeClauses('dateTime', startDate, endDate)],
        'dateTime'
      ),
      (async (): Promise<CatalystRow[]> => {
        try {
          return await selectAllPaged(
            CUSTOM_EVENT_TABLE,
            [
              zcqlAnyOf('createdById', aliases),
              ...dateRangeClauses('startTime', startDate, endDate),
            ],
            'startTime'
          );
        } catch (err) {
          /* CustomCalendarEvent table not created yet — skip silently */
          warnUnlessMissingTable(CUSTOM_EVENT_TABLE, err);
          return [];
        }
      })(),
      (async (): Promise<CatalystRow[]> => {
        try {
          // status is filtered in JS below, not pushed down: rows with no
          // status at all are treated as SCHEDULED, and a ZCQL
          // `status != 'CANCELLED'` would drop them.
          return await selectAllPaged(
            MEETING_TABLE,
            dateRangeClauses('dateTime', startDate, endDate),
            'dateTime'
          );
        } catch (err) {
          /* Meeting table not created yet — skip silently */
          warnUnlessMissingTable(MEETING_TABLE, err);
          return [];
        }
      })(),
    ]);

    // Each list already arrives ordered by its date column (with a ROWID
    // tiebreaker), so the JS sorts that used to run here are gone.
    const events = [
      ...acceptedTours.map((t) => ({
        id: String(t.ROWID),
        title: t.eventName,
        start: t.dateTime,
        end: t.dateTime
          ? new Date(new Date(t.dateTime).getTime() + 2 * 60 * 60 * 1000).toISOString()
          : null,
        type: 'TOUR' as const,
        organizer: t.organizer,
        venue: t.venue,
        googleSynced: !!t.googleCalendarEventId,
      })),
      ...customEvents
        .map((e) => ({
          id: String(e.ROWID),
          title: e.title,
          start: e.startTime,
          end: e.endTime,
          type: 'CUSTOM' as const,
          description: e.description ?? null,
          googleSynced: false,
        })),
      ...meetings
        .filter(
          (m) => String(m.status ?? 'SCHEDULED').toUpperCase() !== 'CANCELLED'
        )
        .map((m) => ({
          id: `meeting-${String(m.ROWID)}`,
          title: m.title,
          start: m.dateTime,
          end: m.dateTime
            ? new Date(new Date(m.dateTime).getTime() + 60 * 60 * 1000).toISOString()
            : null,
          type: 'MEETING' as const,
          location: m.location ?? null,
          description: m.agenda ?? m.summary ?? null,
          googleSynced: !!m.googleCalendarEventId,
        })),
    ];

    cacheSet(cacheKey, events, 60);
    sendSuccess(res, events);
  } catch (error) {
    sendServerError(res, 'Failed to fetch calendar events', error);
  }
}

/**
 * Create a custom calendar event
 * POST /api/google/events
 */
export async function addCustomEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { title, startDateTime, description } = req.body;

    if (!title || !startDateTime) {
      sendError(res, 'Title and date are required', 400);
      return;
    }

    const startTime = new Date(startDateTime);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    let row;
    try {
      row = await insertRow(CUSTOM_EVENT_TABLE, {
        title: String(title).trim(),
        startTime: toCatalystDate(startTime),
        endTime: toCatalystDate(endTime),
        description: description ? String(description).trim() : null,
        createdById: req.user!.id,
      });
    } catch (err: any) {
      // Catalyst returns 404 INVALID_ID when the table itself is missing.
      // Treat that as a feature-not-configured scenario rather than a 500.
      if (err?.statusCode === 404) {
        sendError(
          res,
          'Custom events are not enabled. Create the CustomCalendarEvent table in Catalyst Console to enable.',
          501
        );
        return;
      }
      throw err;
    }

    // Best-effort: push to Google Calendar immediately if the user has it
    // connected. Failure here doesn't fail the request — local creation
    // already succeeded and the event can still be synced later via Sync All.
    let googleSynced = false;
    try {
      const googleEventId = await createCustomGoogleEvent(req.user!.id, {
        id: String(row.ROWID),
        title: String(row.title),
        startTime,
        endTime,
        description: row.description ?? null,
      });
      if (googleEventId) {
        await updateRow(CUSTOM_EVENT_TABLE, {
          ROWID: String(row.ROWID),
          googleCalendarEventId: googleEventId,
        });
        googleSynced = true;
      }
    } catch (err) {
      console.error('Failed to push custom event to Google Calendar:', err);
    }

    cacheClear('calendar_events_');
    sendSuccess(
      res,
      {
        id: String(row.ROWID),
        title: row.title,
        startTime: row.startTime,
        endTime: row.endTime,
        description: row.description ?? null,
        createdById: row.createdById,
        googleSynced,
      },
      'Event added'
    );
  } catch (error) {
    sendServerError(res, 'Failed to add event', error);
  }
}

/**
 * Sync all accepted tours and the user's unsynced custom events to Google Calendar.
 * POST /api/google/sync
 */
export async function syncAllToursToCalendar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // ── Tours: sync every ACCEPTED tour that hasn't been pushed yet ──────
    // Both predicates are pushed down, so a second run reads only what the
    // first run failed to sync rather than the whole table again.
    const tours = await fetchPendingSync(TOUR_TABLE, 'dateTime', {
      clauses: [`decision = 'ACCEPTED'`],
      filter: (t) => t.decision === 'ACCEPTED',
    });

    let toursSynced = 0;
    for (const tour of tours) {
      try {
        const googleEventId = await createTourCalendarEvent(req.user!.id, {
          id: String(tour.ROWID),
          eventName: String(tour.eventName),
          organizer: String(tour.organizer),
          venue: String(tour.venue),
          dateTime: new Date(tour.dateTime),
          description: tour.description ?? null,
          venueLink: tour.venueLink ?? null,
        });
        if (googleEventId) {
          await updateRow(TOUR_TABLE, {
            ROWID: String(tour.ROWID),
            googleCalendarEventId: googleEventId,
          });
          toursSynced++;
        }
      } catch (err) {
        console.error(`Failed to sync tour ${tour.ROWID}:`, err);
      }
    }

    // ── Custom events: sync the user's own unsynced custom events ────────
    // Alias-matched for the same reason the calendar read is: a bare
    // createdById comparison skips the user's pre-migration events, which
    // would then show as unsynced forever.
    const aliases = await getUserIdAliases(req.user!.id);
    let customEvents: CatalystRow[] = [];
    try {
      customEvents = await fetchPendingSync(CUSTOM_EVENT_TABLE, 'startTime', {
        clauses: [zcqlAnyOf('createdById', aliases)],
        filter: (e) => aliases.includes(String(e.createdById)),
      });
    } catch (err) {
      // Table may not exist — skip silently. Tours portion still ran.
      warnUnlessMissingTable(CUSTOM_EVENT_TABLE, err);
    }

    let customSynced = 0;
    for (const event of customEvents) {
      try {
        const googleEventId = await createCustomGoogleEvent(req.user!.id, {
          id: String(event.ROWID),
          title: String(event.title),
          startTime: new Date(event.startTime),
          endTime: new Date(event.endTime),
          description: event.description ?? null,
        });
        if (googleEventId) {
          await updateRow(CUSTOM_EVENT_TABLE, {
            ROWID: String(event.ROWID),
            googleCalendarEventId: googleEventId,
          });
          customSynced++;
        }
      } catch (err) {
        console.error(`Failed to sync custom event ${event.ROWID}:`, err);
      }
    }

    // ── Meetings: sync unsynced, non-cancelled meetings ─────────────────
    let meetings: CatalystRow[] = [];
    try {
      // status stays a JS filter: an unset status means SCHEDULED here, and a
      // pushed-down `status != 'CANCELLED'` would drop those rows.
      meetings = await fetchPendingSync(MEETING_TABLE, 'dateTime', {
        filter: (m) =>
          String(m.status ?? 'SCHEDULED').toUpperCase() !== 'CANCELLED',
      });
    } catch (err) {
      // Meeting table may not exist — skip silently. Tours/custom still ran.
      warnUnlessMissingTable(MEETING_TABLE, err);
    }

    let meetingsSynced = 0;
    for (const meeting of meetings) {
      try {
        const googleEventId = await createMeetingGoogleEvent(req.user!.id, {
          id: String(meeting.ROWID),
          title: String(meeting.title),
          dateTime: String(meeting.dateTime),
          location: meeting.location ?? null,
          attendees: meeting.attendees ?? null,
          agenda: meeting.agenda ?? null,
        });
        if (googleEventId) {
          await updateRow(MEETING_TABLE, {
            ROWID: String(meeting.ROWID),
            googleCalendarEventId: googleEventId,
          });
          meetingsSynced++;
        }
      } catch (err) {
        console.error(`Failed to sync meeting ${meeting.ROWID}:`, err);
      }
    }

    const total = tours.length + customEvents.length + meetings.length;
    const synced = toursSynced + customSynced + meetingsSynced;
    sendSuccess(
      res,
      { synced, total, toursSynced, customSynced, meetingsSynced },
      `Synced ${synced} of ${total} events to Google Calendar`
    );
  } catch (error) {
    sendServerError(res, 'Failed to sync events', error);
  }
}

/**
 * Delete a custom calendar event
 * DELETE /api/google/events/:id
 */
export async function deleteCustomEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Verify ownership before deleting — Catalyst's row delete doesn't filter by
    // arbitrary columns, so we read the row first and check createdById. Read
    // THAT row by ROWID: pulling the whole table to find one id was a full scan
    // on every delete. Ownership compares against the identity alias set so a
    // pre-migration event stays deletable by the person who created it.
    try {
      const [row, aliases] = await Promise.all([
        getRow(CUSTOM_EVENT_TABLE, id),
        getUserIdAliases(req.user!.id),
      ]);
      if (row && aliases.includes(String(row.createdById))) {
        await deleteRow(CUSTOM_EVENT_TABLE, id);
      }
    } catch {
      /* table may not exist — silently no-op (delete-if-present semantics) */
    }

    cacheClear('calendar_events_');
    sendSuccess(res, null, 'Event deleted');
  } catch (error) {
    sendServerError(res, 'Failed to delete event', error);
  }
}
