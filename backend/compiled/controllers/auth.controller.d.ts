import { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Register a new user
 * POST /api/auth/register
 */
export declare function register(req: Request, res: Response): Promise<void>;
/**
 * Login user
 * POST /api/auth/login
 */
export declare function login(req: Request, res: Response): Promise<void>;
/**
 * Get current user profile
 * GET /api/auth/me
 */
export declare function getMe(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update password
 * PUT /api/auth/password
 */
export declare function updatePassword(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get all users (Admin only)
 * GET /api/auth/users
 */
export declare function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Update user role (Admin only)
 * PATCH /api/auth/users/:id/role
 */
export declare function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Deactivate user (Admin only)
 * PATCH /api/auth/users/:id/deactivate
 */
export declare function deactivateUser(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map