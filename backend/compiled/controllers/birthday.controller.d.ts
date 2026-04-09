import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
/**
 * Create a new birthday entry
 * POST /api/birthdays
 */
export declare function createBirthday(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all birthday entries with pagination
 * GET /api/birthdays
 */
export declare function getBirthdays(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get today's birthdays
 * GET /api/birthdays/today
 */
export declare function getTodayBirthdays(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get upcoming birthdays (next 7 days)
 * GET /api/birthdays/upcoming
 */
export declare function getUpcomingBirthdays(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get a single birthday entry
 * GET /api/birthdays/:id
 */
export declare function getBirthdayById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update a birthday entry
 * PUT /api/birthdays/:id
 */
export declare function updateBirthday(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete a birthday entry
 * DELETE /api/birthdays/:id
 */
export declare function deleteBirthday(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get birthday count for today (for dashboard stats)
 */
export declare function getTodayBirthdayCount(): Promise<number>;
//# sourceMappingURL=birthday.controller.d.ts.map