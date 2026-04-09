import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Create train EQ request
 * POST /api/train-requests
 */
export declare function createTrainRequest(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all train requests with pagination and filters
 * GET /api/train-requests
 */
export declare function getTrainRequests(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get single train request by ID
 * GET /api/train-requests/:id
 */
export declare function getTrainRequestById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update train request
 * PUT /api/train-requests/:id
 */
export declare function updateTrainRequest(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Approve train request (Admin only)
 * PATCH /api/train-requests/:id/approve
 */
export declare function approveTrainRequest(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Reject train request (Admin only)
 * PATCH /api/train-requests/:id/reject
 */
export declare function rejectTrainRequest(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Mark approved train request as resolved (Admin only)
 * PATCH /api/train-requests/:id/resolve
 */
export declare function resolveTrainRequest(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete train request
 * DELETE /api/train-requests/:id
 */
export declare function deleteTrainRequest(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get pending train requests queue
 * GET /api/train-requests/queue/pending
 */
export declare function getPendingQueue(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Check PNR status using IRCTC RapidAPI
 * GET /api/train-requests/pnr/:pnr
 */
export declare function checkPNRStatus(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=trainRequest.controller.d.ts.map