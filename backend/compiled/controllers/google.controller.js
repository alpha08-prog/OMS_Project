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
const catalyst_client_1 = require("../lib/catalyst-client");
const cache_1 = require("../lib/cache");
const response_1 = require("../utils/response");
const config_1 = __importDefault(require("../config"));
const google_service_1 = require("../services/google.service");
const TOUR_TABLE = 'TourProgram';
const CUSTOM_EVENT_TABLE = 'CustomCalendarEvent';
function parseBool(v) {
    if (typeof v === 'boolean')
        return v;
    if (typeof v === 'string')
        return v.toLowerCase() === 'true';
    return Boolean(v);
}
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
        const connected = await (0, google_service_1.isCalendarConnected)(req.user.id);
        (0, response_1.sendSuccess)(res, { connected });
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
        // Custom events table may not exist in Catalyst yet — best-effort lookup.
        let customEvents = [];
        try {
            const all = await (0, catalyst_client_1.listAllRows)(CUSTOM_EVENT_TABLE);
            customEvents = all.filter((e) => String(e.createdById) === req.user.id);
        }
        catch {
            /* CustomCalendarEvent table not created yet — skip silently */
        }
        const tourPrograms = await (0, catalyst_client_1.listAllRows)(TOUR_TABLE);
        const acceptedTours = tourPrograms
            .filter((t) => t.decision === 'ACCEPTED')
            .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
        const events = [
            ...acceptedTours.map((t) => ({
                id: String(t.ROWID),
                title: t.eventName,
                start: t.dateTime,
                end: t.dateTime
                    ? new Date(new Date(t.dateTime).getTime() + 2 * 60 * 60 * 1000).toISOString()
                    : null,
                type: 'TOUR',
                organizer: t.organizer,
                venue: t.venue,
                googleSynced: !!t.googleCalendarEventId,
            })),
            ...customEvents
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                .map((e) => ({
                id: String(e.ROWID),
                title: e.title,
                start: e.startTime,
                end: e.endTime,
                type: 'CUSTOM',
                description: e.description ?? null,
                googleSynced: false,
            })),
        ];
        (0, cache_1.cacheSet)(cacheKey, events, 60);
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
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        let row;
        try {
            row = await (0, catalyst_client_1.insertRow)(CUSTOM_EVENT_TABLE, {
                title: String(title).trim(),
                startTime: (0, catalyst_client_1.toCatalystDate)(startTime),
                endTime: (0, catalyst_client_1.toCatalystDate)(endTime),
                description: description ? String(description).trim() : null,
                createdById: req.user.id,
            });
        }
        catch (err) {
            // Catalyst returns 404 INVALID_ID when the table itself is missing.
            // Treat that as a feature-not-configured scenario rather than a 500.
            if (err?.statusCode === 404) {
                (0, response_1.sendError)(res, 'Custom events are not enabled. Create the CustomCalendarEvent table in Catalyst Console to enable.', 501);
                return;
            }
            throw err;
        }
        // Best-effort: push to Google Calendar immediately if the user has it
        // connected. Failure here doesn't fail the request — local creation
        // already succeeded and the event can still be synced later via Sync All.
        let googleSynced = false;
        try {
            const googleEventId = await (0, google_service_1.createCustomGoogleEvent)(req.user.id, {
                id: String(row.ROWID),
                title: String(row.title),
                startTime,
                endTime,
                description: row.description ?? null,
            });
            if (googleEventId) {
                await (0, catalyst_client_1.updateRow)(CUSTOM_EVENT_TABLE, {
                    ROWID: String(row.ROWID),
                    googleCalendarEventId: googleEventId,
                });
                googleSynced = true;
            }
        }
        catch (err) {
            console.error('Failed to push custom event to Google Calendar:', err);
        }
        (0, cache_1.cacheClear)('calendar_events_');
        (0, response_1.sendSuccess)(res, {
            id: String(row.ROWID),
            title: row.title,
            startTime: row.startTime,
            endTime: row.endTime,
            description: row.description ?? null,
            createdById: row.createdById,
            googleSynced,
        }, 'Event added');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to add event', error);
    }
}
/**
 * Sync all accepted tours and the user's unsynced custom events to Google Calendar.
 * POST /api/google/sync
 */
async function syncAllToursToCalendar(req, res) {
    try {
        // ── Tours: sync every ACCEPTED tour that hasn't been pushed yet ──────
        const allTours = await (0, catalyst_client_1.listAllRows)(TOUR_TABLE);
        const tours = allTours.filter((t) => t.decision === 'ACCEPTED' && !t.googleCalendarEventId);
        let toursSynced = 0;
        for (const tour of tours) {
            try {
                const googleEventId = await (0, google_service_1.createTourCalendarEvent)(req.user.id, {
                    id: String(tour.ROWID),
                    eventName: String(tour.eventName),
                    organizer: String(tour.organizer),
                    venue: String(tour.venue),
                    dateTime: new Date(tour.dateTime),
                    description: tour.description ?? null,
                    venueLink: tour.venueLink ?? null,
                });
                if (googleEventId) {
                    await (0, catalyst_client_1.updateRow)(TOUR_TABLE, {
                        ROWID: String(tour.ROWID),
                        googleCalendarEventId: googleEventId,
                    });
                    toursSynced++;
                }
            }
            catch (err) {
                console.error(`Failed to sync tour ${tour.ROWID}:`, err);
            }
        }
        // ── Custom events: sync the user's own unsynced custom events ────────
        let customEvents = [];
        try {
            const all = await (0, catalyst_client_1.listAllRows)(CUSTOM_EVENT_TABLE);
            customEvents = all.filter((e) => String(e.createdById) === req.user.id &&
                !e.googleCalendarEventId);
        }
        catch {
            // Table may not exist — skip silently. Tours portion still ran.
        }
        let customSynced = 0;
        for (const event of customEvents) {
            try {
                const googleEventId = await (0, google_service_1.createCustomGoogleEvent)(req.user.id, {
                    id: String(event.ROWID),
                    title: String(event.title),
                    startTime: new Date(event.startTime),
                    endTime: new Date(event.endTime),
                    description: event.description ?? null,
                });
                if (googleEventId) {
                    await (0, catalyst_client_1.updateRow)(CUSTOM_EVENT_TABLE, {
                        ROWID: String(event.ROWID),
                        googleCalendarEventId: googleEventId,
                    });
                    customSynced++;
                }
            }
            catch (err) {
                console.error(`Failed to sync custom event ${event.ROWID}:`, err);
            }
        }
        const total = tours.length + customEvents.length;
        const synced = toursSynced + customSynced;
        (0, response_1.sendSuccess)(res, { synced, total, toursSynced, customSynced }, `Synced ${synced} of ${total} events to Google Calendar`);
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
        // Verify ownership before deleting — Catalyst's row delete doesn't filter by
        // arbitrary columns, so we read the row first and check createdById.
        try {
            const all = await (0, catalyst_client_1.listAllRows)(CUSTOM_EVENT_TABLE);
            const row = all.find((e) => String(e.ROWID) === id);
            if (row && String(row.createdById) === req.user.id) {
                await (0, catalyst_client_1.deleteRow)(CUSTOM_EVENT_TABLE, id);
            }
        }
        catch {
            /* table may not exist — silently no-op, matches Prisma deleteMany semantics */
        }
        (0, cache_1.cacheClear)('calendar_events_');
        (0, response_1.sendSuccess)(res, null, 'Event deleted');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete event', error);
    }
}
//# sourceMappingURL=google.controller.js.map