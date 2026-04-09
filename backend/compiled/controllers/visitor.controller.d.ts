import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Create a new visitor entry
 * POST /api/visitors
 */
export declare function createVisitor(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all visitors with pagination and filters
 * GET /api/visitors
 */
export declare function getVisitors(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get single visitor by ID
 * GET /api/visitors/:id
 */
export declare function getVisitorById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update visitor
 * PUT /api/visitors/:id
 */
export declare function updateVisitor(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete visitor
 * DELETE /api/visitors/:id
 */
export declare function deleteVisitor(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get today's birthdays
 * GET /api/visitors/birthdays/today
 */
export declare function getTodayBirthdays(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get visitors by date
 * GET /api/visitors/date/:date
 */
export declare function getVisitorsByDate(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=visitor.controller.d.ts.map