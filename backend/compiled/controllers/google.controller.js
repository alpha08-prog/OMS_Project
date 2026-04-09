"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiateGoogleAuth = initiateGoogleAuth;
exports.handleGoogleCallback = handleGoogleCallback;
exports.getCalendarStatus = getCalendarStatus;
exports.disconnectGoogleCalendar = disconnectGoogleCalendar;
exports.getCalendarEvents = getCalendarEvents;
exports.addCustomEvent = addCustomEvent;
exports.syncAllToursToCalendar = syncAllToursToCalendar;
exports.deleteCustomEvent = deleteCustomEvent;
const prisma_1 = __importDefault(require("../lib/prisma"));
const cache_1 = require("../lib/cache");
const response_1 = require("../utils/response");
const config_1 = __importDefault(require("../config"));
const google_service_1 = require("../services/google.service");
/**
 * Redirect admin to Google OAuth consent screen
 * GET /api/google/connect
 */
async function initiateGoogleAuth(req, res) {
    try {
        const url = (0, google_service_1.getAuthUrl)(req.user.id);
        res.redirect(url);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to initiate Google auth', error);
    }
}
/**
 * Google redirects here after user grants permission
 * GET /api/google/callback
 */
async function handleGoogleCallback(req, res) {
    const frontendBase = config_1.default.frontendUrl;
    try {
        const { code, state: userId } = req.query;
        if (!code || !userId) {
            res.redirect(`${frontendBase}/admin/calendar?error=missing_params`);
            return;
        }
        await (0, google_service_1.exchangeCodeForTokens)(code, userId);
        res.redirect(`${frontendBase}/admin/calendar?connected=true`);
    }
    catch (error) {
        console.error('Google OAuth callback error:', error);
        res.redirect(`${frontendBase}/admin/calendar?error=auth_failed`);
    }
}
/**
 * Check whether the current user has connected Google Calendar
 * GET /api/google/status
 */
async function getCalendarStatus(req, res) {
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { calendarConnected: true },
        });
        (0, response_1.sendSuccess)(res, { connected: user?.calendarConnected ?? false });
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get calendar status', error);
    }
}
/**
 * Remove stored Google tokens for the current user
 * DELETE /api/google/disconnect
 */
async function disconnectGoogleCalendar(req, res) {
    try {
        await (0, google_service_1.disconnectCalendar)(req.user.id);
        (0, response_1.sendSuccess)(res, null, 'Google Calendar disconnected');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to disconnect calendar', error);
    }
}
/**
 * Return all calendar-relevant events (accepted tours + tasks with due dates)
 * GET /api/google/events
 */
async function getCalendarEvents(req, res) {
    try {
        const cacheKey = `calendar_events_${req.user.id}`;
        const cached = (0, cache_1.cacheGet)(cacheKey);
        if (cached) {
            (0, response_1.sendSuccess)(res, cached);
            return;
        }
        const [tourPrograms, customEvents] = await Promise.all([
            prisma_1.default.tourProgram.findMany({
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
            prisma_1.default.customCalendarEvent.findMany({
                where: { createdById: req.user.id },
                orderBy: { startTime: 'asc' },
            }),
        ]);
        const events = [
            ...tourPrograms.map((t) => ({
                id: t.id,
                title: t.eventName,
                start: t.dateTime,
                end: new Date(new Date(t.dateTime).getTime() + 2 * 60 * 60 * 1000),
                type: 'TOUR',
                organizer: t.organizer,
                venue: t.venue,
                googleSynced: !!t.googleCalendarEventId,
            })),
            ...customEvents.map((e) => ({
                id: e.id,
                title: e.title,
                start: e.startTime,
                end: e.endTime,
                type: 'CUSTOM',
                description: e.description,
                googleSynced: false,
            })),
        ];
        (0, cache_1.cacheSet)(cacheKey, events, 60); // cache for 60 seconds
        (0, response_1.sendSuccess)(res, events);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to fetch calendar events', error);
    }
}
/**
 * Create a custom calendar event
 * POST /api/google/events
 */
async function addCustomEvent(req, res) {
    try {
        const { title, startDateTime, description } = req.body;
        if (!title || !startDateTime) {
            (0, response_1.sendError)(res, 'Title and date are required', 400);
            return;
        }
        const startTime = new Date(startDateTime);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default
        const event = await prisma_1.default.customCalendarEvent.create({
            data: {
                title: title.trim(),
                startTime,
                endTime,
                description: description?.trim() || null,
                createdById: req.user.id,
            },
        });
        (0, cache_1.cacheClear)('calendar_events_');
        (0, response_1.sendSuccess)(res, event, 'Event added');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to add event', error);
    }
}
/**
 * Sync all accepted tours to Google Calendar
 * POST /api/google/sync
 */
async function syncAllToursToCalendar(req, res) {
    try {
        const tours = await prisma_1.default.tourProgram.findMany({
            where: {
                decision: 'ACCEPTED',
                googleCalendarEventId: null,
            },
        });
        let synced = 0;
        for (const tour of tours) {
            try {
                const googleEventId = await (0, google_service_1.createTourCalendarEvent)(req.user.id, {
                    id: tour.id,
                    eventName: tour.eventName,
                    organizer: tour.organizer,
                    venue: tour.venue,
                    dateTime: tour.dateTime,
                    description: tour.description,
                    venueLink: tour.venueLink,
                });
                if (googleEventId) {
                    await prisma_1.default.tourProgram.update({
                        where: { id: tour.id },
                        data: { googleCalendarEventId: googleEventId },
                    });
                    synced++;
                }
            }
            catch (err) {
                console.error(`Failed to sync tour ${tour.id}:`, err);
            }
        }
        (0, response_1.sendSuccess)(res, { synced, total: tours.length }, `Synced ${synced} events to Google Calendar`);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to sync events', error);
    }
}
/**
 * Delete a custom calendar event
 * DELETE /api/google/events/:id
 */
async function deleteCustomEvent(req, res) {
    try {
        const { id } = req.params;
        await prisma_1.default.customCalendarEvent.deleteMany({
            where: { id, createdById: req.user.id },
        });
        (0, cache_1.cacheClear)('calendar_events_');
        (0, response_1.sendSuccess)(res, null, 'Event deleted');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete event', error);
    }
}
//# sourceMappingURL=google.controller.js.map