import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import prisma from '../lib/prisma';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { sendSuccess, sendError, sendServerError } from '../utils/response';
import type { AuthenticatedRequest, LoginRequest, RegisterRequest } from '../types';

/**
 * Register a new user
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, phone, password, role } = req.body as RegisterRequest;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      sendError(res, passwordValidation.errors.join('. '), 400);
      return;
    }

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    if (existingUser) {
      sendError(res, 'User with this email or phone already exists', 409);
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user (default role is STAFF unless specified by admin)
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        password: hashedPassword,
        role: role || UserRole.STAFF,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    sendSuccess(
      res,
      { user, token },
      'User registered successfully',
      201
    );
  } catch (error) {
    sendServerError(res, 'Failed to register user', error);
  }
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = req.body as LoginRequest;

    // Find user by email or phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { phone: identifier },
        ],
      },
    });

    if (!user) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    if (!user.isActive) {
      sendError(res, 'Account is deactivated. Contact administrator.', 403);
      return;
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    sendSuccess(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      token,
    }, 'Login successful');
  } catch (error) {
    sendServerError(res, 'Login failed', error);
  }
}

/**
 * Get current user profile
 * GET /api/auth/me
 */
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user, 'User profile retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get user profile', error);
  }
}

/**
 * Update password
 * PUT /api/auth/password
 */
export async function updatePassword(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      sendError(res, 'Current password is incorrect', 400);
      return;
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      sendError(res, passwordValidation.errors.join('. '), 400);
      return;
    }

    // Hash and update password
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    sendSuccess(res, null, 'Password updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update password', error);
  }
}

/**
 * Get all users (Admin only)
 * GET /api/auth/users
 */
export async function getAllUsers(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, users, 'Users retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get users', error);
  }
}

/**
 * Update user role (Admin only)
 * PATCH /api/auth/users/:id/role
 */
export async function updateUserRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    sendSuccess(res, user, 'User role updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update user role', error);
  }
}

/**
 * Deactivate user (Admin only)
 * PATCH /api/auth/users/:id/deactivate
 */
export async function deactivateUser(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (req.user?.id === id) {
      sendError(res, 'Cannot deactivate your own account', 400);
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    sendSuccess(res, null, 'User deactivated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to deactivate user', error);
  }
}
