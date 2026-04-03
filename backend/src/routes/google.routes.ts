import { Router } from 'express';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  getCalendarStatus,
  disconnectGoogleCalendar,
  getCalendarEvents,
  addCustomEvent,
  deleteCustomEvent,
  syncAllToursToCalendar,
} from '../controllers/google.controller';
import { authenticate, adminOnly } from '../middleware/auth';

const router = Router();

// Admin clicks "Connect Google Calendar" — browser is redirected to Google
router.get('/connect', authenticate, adminOnly, initiateGoogleAuth);

// Google redirects here after the user grants permission (no auth header — browser redirect)
router.get('/callback', handleGoogleCallback);

// Check if the current user's calendar is connected
router.get('/status', authenticate, getCalendarStatus);

// Revoke and remove stored tokens
router.delete('/disconnect', authenticate, adminOnly, disconnectGoogleCalendar);

// Fetch events for the calendar page (accepted tours + custom events)
router.get('/events', authenticate, getCalendarEvents);

// Sync all unsynced accepted tours to Google Calendar
router.post('/sync', authenticate, adminOnly, syncAllToursToCalendar);

// Add / delete custom calendar events
router.post('/events', authenticate, adminOnly, addCustomEvent);
router.delete('/events/:id', authenticate, adminOnly, deleteCustomEvent);

export default router;
