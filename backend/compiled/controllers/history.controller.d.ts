import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Get admin action history
 * GET /api/history
 * Returns all actions taken by admins (verified/rejected grievances, approved/rejected train requests, tour decisions)
 */
export declare function getAdminHistory(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get history statistics
 * GET /api/history/stats
 */
export declare function getHistoryStats(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=history.controller.d.ts.map