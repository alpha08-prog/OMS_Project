import { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Redirect admin to Google OAuth consent screen
 * GET /api/google/connect
 */
export declare function initiateGoogleAuth(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Google redirects here after user grants permission
 * GET /api/google/callback
 */
export declare function handleGoogleCallback(req: Request, res: Response): Promise<void>;
/**
 * Check whether the current user has connected Google Calendar
 * GET /api/google/status
 */
export declare function getCalendarStatus(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Remove stored Google tokens for the current user
 * DELETE /api/google/disconnect
 */
export declare function disconnectGoogleCalendar(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Return all calendar-relevant events (accepted tours + tasks with due dates)
 * GET /api/google/events
 */
export declare function getCalendarEvents(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Create a custom calendar event
 * POST /api/google/events
 */
export declare function addCustomEvent(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Sync all accepted tours to Google Calendar
 * POST /api/google/sync
 */
export declare function syncAllToursToCalendar(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete a custom calendar event
 * DELETE /api/google/events/:id
 */
export declare function deleteCustomEvent(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=google.controller.d.ts.map