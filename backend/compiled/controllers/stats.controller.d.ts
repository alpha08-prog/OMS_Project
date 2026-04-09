import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Get dashboard summary statistics
 * GET /api/stats/summary
 */
export declare function getDashboardSummary(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get grievance statistics by type
 * GET /api/stats/grievances/by-type
 */
export declare function getGrievancesByType(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get grievance statistics by status
 * GET /api/stats/grievances/by-status
 */
export declare function getGrievancesByStatus(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get grievance statistics by constituency
 * GET /api/stats/grievances/by-constituency
 */
export declare function getGrievancesByConstituency(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get monthly grievance trends
 * GET /api/stats/grievances/monthly
 */
export declare function getMonthlyGrievanceTrends(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get monetization summary (CSR tracking)
 * GET /api/stats/monetization
 */
export declare function getMonetizationSummary(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get recent activity across all modules
 * GET /api/stats/recent-activity
 */
export declare function getRecentActivity(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=stats.controller.d.ts.map