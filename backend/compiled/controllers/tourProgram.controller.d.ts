import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Create tour program entry
 * POST /api/tour-programs
 */
export declare function createTourProgram(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all tour programs with pagination and filters
 * GET /api/tour-programs
 */
export declare function getTourPrograms(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get single tour program by ID
 * GET /api/tour-programs/:id
 */
export declare function getTourProgramById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update tour program
 * PUT /api/tour-programs/:id
 */
export declare function updateTourProgram(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update tour program decision
 * PATCH /api/tour-programs/:id/decision
 */
export declare function updateDecision(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete tour program
 * DELETE /api/tour-programs/:id
 */
export declare function deleteTourProgram(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get today's schedule
 * GET /api/tour-programs/schedule/today
 */
export declare function getTodaySchedule(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get upcoming events
 * GET /api/tour-programs/upcoming
 */
export declare function getUpcomingEvents(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get pending decisions
 * GET /api/tour-programs/pending
 */
export declare function getPendingDecisions(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all completed events (ACCEPTED tours where dateTime has passed)
 * GET /api/tour-programs/events
 */
export declare function getEvents(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Submit post-event report (staff)
 * PATCH /api/tour-programs/:id/complete
 */
export declare function submitEventReport(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=tourProgram.controller.d.ts.map