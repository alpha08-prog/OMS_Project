import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Create news intelligence entry
 * POST /api/news
 */
export declare function createNews(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all news with pagination and filters
 * GET /api/news
 */
export declare function getNews(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get single news by ID
 * GET /api/news/:id
 */
export declare function getNewsById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update news
 * PUT /api/news/:id
 */
export declare function updateNews(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete news
 * DELETE /api/news/:id
 */
export declare function deleteNews(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get critical news alerts
 * GET /api/news/alerts/critical
 */
export declare function getCriticalAlerts(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=news.controller.d.ts.map