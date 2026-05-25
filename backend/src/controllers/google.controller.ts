import { Request, Response } from 'express';
import {
  listAllRows,
  insertRow,
  updateRow,
  deleteRow,
  toCatalystDate,
  CatalystRow,
} from '../lib/catalyst-client';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache';
import { sendSuccess, sendServerError, sendError } from '../utils/response';
import config from '../config';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  disconnectCalendar,
  createTourCalendarEvent,
  createCustomGoogleEvent,
  isCalendarConnected,
} from '../services/google.service';
import type { AuthenticatedRequest } from '../types';

const TOUR_TABLE = 'TourProgram';
const CUSTOM_EVENT_TABLE = 'CustomCalendarEvent';

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
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
    const cacheKey = `calendar_events_${req.user!.id}`;
    const cached = cacheGet<unknown[]>(cacheKey);
    if (cached) {
      sendSuccess(res, cached);
      return;
    }

    // Custom events table may not exist in Catalyst yet — best-effort lookup.
    let customEvents: CatalystRow[] = [];
    try {
      const all = await listAllRows(CUSTOM_EVENT_TABLE);
      customEvents = all.filter(
        (e) => String(e.createdById) === req.user!.id
      );
    } catch {
      /* CustomCalendarEvent table not created yet — skip silently */
    }

    const tourPrograms = await listAllRows(TOUR_TABLE);
    const acceptedTours = tourPrograms
      .filter((t) => t.decision === 'ACCEPTED')
      .sort(
        (a, b) =>
          new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      );

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
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        )
        .map((e) => ({
          id: String(e.ROWID),
          title: e.title,
          start: e.startTime,
          end: e.endTime,
          type: 'CUSTOM' as const,
          description: e.description ?? null,
          googleSynced: false,
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
    const allTours = await listAllRows(TOUR_TABLE);
    const tours = allTours.filter(
      (t) => t.decision === 'ACCEPTED' && !t.googleCalendarEventId
    );

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
    let customEvents: CatalystRow[] = [];
    try {
      const all = await listAllRows(CUSTOM_EVENT_TABLE);
      customEvents = all.filter(
        (e) =>
          String(e.createdById) === req.user!.id &&
          !e.googleCalendarEventId
      );
    } catch {
      // Table may not exist — skip silently. Tours portion still ran.
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

    const total = tours.length + customEvents.length;
    const synced = toursSynced + customSynced;
    sendSuccess(
      res,
      { synced, total, toursSynced, customSynced },
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
    // arbitrary columns, so we read the row first and check createdById.
    try {
      const all = await listAllRows(CUSTOM_EVENT_TABLE);
      const row = all.find((e) => String(e.ROWID) === id);
      if (row && String(row.createdById) === req.user!.id) {
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
