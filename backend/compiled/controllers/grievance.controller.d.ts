import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Create a new grievance
 * POST /api/grievances
 */
export declare function createGrievance(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all grievances with pagination and filters
 * GET /api/grievances
 */
export declare function getGrievances(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get single grievance by ID
 * GET /api/grievances/:id
 */
export declare function getGrievanceById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update grievance
 * PUT /api/grievances/:id
 */
export declare function updateGrievance(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Verify grievance (Admin only)
 * PATCH /api/grievances/:id/verify
 * This also marks the grievance as RESOLVED
 */
export declare function verifyGrievance(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update grievance status
 * PATCH /api/grievances/:id/status
 */
export declare function updateGrievanceStatus(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete grievance
 * DELETE /api/grievances/:id
 */
export declare function deleteGrievance(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get grievances pending verification
 * GET /api/grievances/queue/verification
 */
export declare function getVerificationQueue(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=grievance.controller.d.ts.map