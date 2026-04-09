import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Create a new task assignment
 * POST /api/tasks
 */
export declare function createTask(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all tasks with filters
 * GET /api/tasks
 */
export declare function getTasks(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get tasks assigned to the logged-in staff member
 * GET /api/tasks/my-tasks
 */
export declare function getMyTasks(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get task by ID
 * GET /api/tasks/:id
 */
export declare function getTaskById(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update task progress (Staff)
 * PATCH /api/tasks/:id/progress
 */
export declare function updateTaskProgress(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get task progress history
 * GET /api/tasks/:id/history
 */
export declare function getTaskHistory(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update task status (Admin - for marking as resolved)
 * PATCH /api/tasks/:id/status
 */
export declare function updateTaskStatus(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get task tracking/stats for admin
 * GET /api/tasks/tracking
 */
export declare function getTaskTracking(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Delete task
 * DELETE /api/tasks/:id
 */
export declare function deleteTask(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all staff members (for task assignment dropdown)
 * GET /api/tasks/staff
 */
export declare function getStaffMembers(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=task.controller.d.ts.map