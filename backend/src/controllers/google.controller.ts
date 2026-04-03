import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache';
import { sendSuccess, sendServerError, sendError } from '../utils/response';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  disconnectCalendar,
  createTourCalendarEvent,
} from '../services/google.service';
import type { AuthenticatedRequest } from '../types';

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
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
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
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { calendarConnected: true },
    });
    sendSuccess(res, { connected: user?.calendarConnected ?? false });
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

    const [tourPrograms, customEvents] = await Promise.all([
      prisma.tourProgram.findMany({
        where: { decision: 'ACCEPTED' },
        select: {
          id: true,
          eventName: true,
          organizer: true,
          venue: true,
          dateTime: true,
          description: true,
          venueLink: true,
          googleCalendarEventId: true,
        },
        orderBy: { dateTime: 'asc' },
      }),
      prisma.customCalendarEvent.findMany({
        where: { createdById: req.user!.id },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const events = [
      ...tourPrograms.map((t) => ({
        id: t.id,
        title: t.eventName,
        start: t.dateTime,
        end: new Date(new Date(t.dateTime).getTime() + 2 * 60 * 60 * 1000),
        type: 'TOUR' as const,
        organizer: t.organizer,
        venue: t.venue,
        googleSynced: !!t.googleCalendarEventId,
      })),
      ...customEvents.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startTime,
        end: e.endTime,
        type: 'CUSTOM' as const,
        description: e.description,
        googleSynced: false,
      })),
    ];

    cacheSet(cacheKey, events, 60); // cache for 60 seconds
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
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default

    const event = await prisma.customCalendarEvent.create({
      data: {
        title: title.trim(),
        startTime,
        endTime,
        description: description?.trim() || null,
        createdById: req.user!.id,
      },
    });

    cacheClear('calendar_events_');
    sendSuccess(res, event, 'Event added');
  } catch (error) {
    sendServerError(res, 'Failed to add event', error);
  }
}

/**
 * Sync all accepted tours to Google Calendar
 * POST /api/google/sync
 */
export async function syncAllToursToCalendar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tours = await prisma.tourProgram.findMany({
      where: {
        decision: 'ACCEPTED',
        googleCalendarEventId: null,
      },
    });

    let synced = 0;
    for (const tour of tours) {
      try {
        const googleEventId = await createTourCalendarEvent(req.user!.id, {
          id: tour.id,
          eventName: tour.eventName,
          organizer: tour.organizer,
          venue: tour.venue,
          dateTime: tour.dateTime,
          description: tour.description,
          venueLink: tour.venueLink,
        });
        if (googleEventId) {
          await prisma.tourProgram.update({
            where: { id: tour.id },
            data: { googleCalendarEventId: googleEventId },
          });
          synced++;
        }
      } catch (err) {
        console.error(`Failed to sync tour ${tour.id}:`, err);
      }
    }

    sendSuccess(res, { synced, total: tours.length }, `Synced ${synced} events to Google Calendar`);
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

    await prisma.customCalendarEvent.deleteMany({
      where: { id, createdById: req.user!.id },
    });

    cacheClear('calendar_events_');
    sendSuccess(res, null, 'Event deleted');
  } catch (error) {
    sendServerError(res, 'Failed to delete event', error);
  }
}
