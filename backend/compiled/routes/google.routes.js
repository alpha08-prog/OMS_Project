"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_controller_1 = require("../controllers/google.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Admin clicks "Connect Google Calendar" — browser is redirected to Google
router.get('/connect', auth_1.authenticate, auth_1.adminOnly, google_controller_1.initiateGoogleAuth);
// Google redirects here after the user grants permission (no auth header — browser redirect)
router.get('/callback', google_controller_1.handleGoogleCallback);
// Check if the current user's calendar is connected
router.get('/status', auth_1.authenticate, google_controller_1.getCalendarStatus);
// Revoke and remove stored tokens
router.delete('/disconnect', auth_1.authenticate, auth_1.adminOnly, google_controller_1.disconnectGoogleCalendar);
// Fetch events for the calendar page (accepted tours + custom events)
router.get('/events', auth_1.authenticate, google_controller_1.getCalendarEvents);
// Sync all unsynced accepted tours to Google Calendar
router.post('/sync', auth_1.authenticate, auth_1.adminOnly, google_controller_1.syncAllToursToCalendar);
// Add / delete custom calendar events
router.post('/events', auth_1.authenticate, auth_1.adminOnly, google_controller_1.addCustomEvent);
router.delete('/events/:id', auth_1.authenticate, auth_1.adminOnly, google_controller_1.deleteCustomEvent);
exports.default = router;
//# sourceMappingURL=google.routes.js.map