import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import type { AuthenticatedRequest } from '../types';
/**
 * Middleware to authenticate JWT token
 * Attaches user info to request object
 * Supports token from:
 * 1. Authorization header (Bearer token)
 * 2. Query parameter (?token=xxx) - useful for PDF downloads
 */
export declare function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
export declare function authorize(...allowedRoles: UserRole[]): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware for Staff only access
 */
export declare const staffOnly: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware for Admin only access
 */
export declare const adminOnly: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
/**
 * Middleware for Super Admin only access
 */
export declare const superAdminOnly: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map