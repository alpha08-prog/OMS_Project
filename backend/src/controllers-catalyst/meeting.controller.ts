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
  listAllRows,
  getRow,
  updateRow,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  CatalystRow,
} from '../lib/catalyst-client';
import { lookupUsers } from '../lib/catalyst-user-lookup';
import { cacheClear } from '../lib/cache';
import { createMeetingGoogleEvent } from '../services/google.service';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

const MEETING_TABLE = 'Meeting';

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
    // new meeting appears immediately.
    cacheClear('calendar_events_');

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

/**
 * GET /api/meetings — list meetings (upcoming + past), newest first.
 *
 * Optional query:
 *   - status=SCHEDULED|COMPLETED|CANCELLED
 *   - scope=upcoming|past   (split on dateTime vs now, IST)
 */
export async function getMeetings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { status, scope } = req.query as Record<string, string>;

    let rows = await listAllRows(MEETING_TABLE);

    if (status) {
      const want = status.toUpperCase();
      rows = rows.filter(
        (r) => String(r.status ?? 'SCHEDULED').toUpperCase() === want
      );
    }

    if (scope === 'upcoming' || scope === 'past') {
      // Catalyst datetimes are IST strings in `YYYY-MM-DD HH:mm:ss` form, so a
      // direct string compare against nowCatalystIST() orders correctly.
      const now = nowCatalystIST();
      rows = rows.filter((r) => {
        const dt = r.dateTime ? String(r.dateTime) : '';
        if (!dt) return scope === 'upcoming';
        return scope === 'upcoming' ? dt >= now : dt < now;
      });
    }

    rows.sort((a, b) => {
      const ta = a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const tb = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return tb - ta; // newest first
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const meetings = await attachUsers(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, meetings, 'Meetings retrieved successfully', 200, meta);
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
    sendSuccess(res, null, 'Meeting deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete meeting', error);
  }
}
