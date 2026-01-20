import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { extractToken, verifyToken } from '../utils/jwt';
import { sendUnauthorized, sendForbidden } from '../utils/response';
import prisma from '../lib/prisma';
import type { AuthenticatedRequest } from '../types';

/**
 * Middleware to authenticate JWT token
 * Attaches user info to request object
 * Supports token from:
 * 1. Authorization header (Bearer token)
 * 2. Query parameter (?token=xxx) - useful for PDF downloads
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try to get token from header first, then from query params
    let token = extractToken(req.headers.authorization);
    
    // If no token in header, check query params (for PDF downloads in new tabs)
    if (!token && req.query.token) {
      token = String(req.query.token);
    }

    if (!token) {
      sendUnauthorized(res, 'No token provided');
      return;
    }

    const payload = verifyToken(token);

    if (!payload) {
      sendUnauthorized(res, 'Invalid or expired token');
      return;
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, name: true, isActive: true },
    });

    if (!user || !user.isActive) {
      sendUnauthorized(res, 'User not found or inactive');
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    sendUnauthorized(res, 'Authentication failed');
  }
}

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      sendUnauthorized(res, 'User not authenticated');
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendForbidden(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`
      );
      return;
    }

    next();
  };
}

/**
 * Middleware for Staff only access
 */
export const staffOnly = authorize(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN);

/**
 * Middleware for Admin only access
 */
export const adminOnly = authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN);

/**
 * Middleware for Super Admin only access
 */
export const superAdminOnly = authorize(UserRole.SUPER_ADMIN);
