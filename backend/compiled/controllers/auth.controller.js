"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.getMe = getMe;
exports.updatePassword = updatePassword;
exports.getAllUsers = getAllUsers;
exports.updateUserRole = updateUserRole;
exports.deactivateUser = deactivateUser;
const client_1 = require("@prisma/client");
const prisma_1 = __importStar(require("../lib/prisma"));
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const response_1 = require("../utils/response");
/**
 * Register a new user
 * POST /api/auth/register
 */
async function register(req, res) {
    try {
        const { name, email, phone, password, role } = req.body;
        // Validate password strength
        const passwordValidation = (0, password_1.validatePasswordStrength)(password);
        if (!passwordValidation.isValid) {
            (0, response_1.sendError)(res, passwordValidation.errors.join('. '), 400);
            return;
        }
        // Check if email already exists
        const existingUser = await prisma_1.default.user.findFirst({
            where: {
                OR: [
                    { email: email.toLowerCase() },
                    ...(phone ? [{ phone }] : []),
                ],
            },
        });
        if (existingUser) {
            (0, response_1.sendError)(res, 'User with this email or phone already exists', 409);
            return;
        }
        // Hash password
        const hashedPassword = await (0, password_1.hashPassword)(password);
        // Create user (default role is STAFF unless specified by admin)
        const user = await prisma_1.default.user.create({
            data: {
                name,
                email: email.toLowerCase(),
                phone: phone || null,
                password: hashedPassword,
                role: role || client_1.UserRole.STAFF,
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
        const token = (0, jwt_1.generateToken)({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        });
        (0, response_1.sendSuccess)(res, { user, token }, 'User registered successfully', 201);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to register user', error);
    }
}
/**
 * Login user
 * POST /api/auth/login
 */
async function login(req, res) {
    try {
        const { identifier, password } = req.body;
        // Find user by email or phone with retry logic for connection errors
        const user = await (0, prisma_1.withRetry)(async () => {
            return await prisma_1.default.user.findFirst({
                where: {
                    OR: [
                        { email: identifier.toLowerCase() },
                        { phone: identifier },
                    ],
                },
            });
        });
        if (!user) {
            (0, response_1.sendError)(res, 'Invalid credentials', 401);
            return;
        }
        if (!user.isActive) {
            (0, response_1.sendError)(res, 'Account is deactivated. Contact administrator.', 403);
            return;
        }
        // Verify password
        const isValidPassword = await (0, password_1.comparePassword)(password, user.password);
        if (!isValidPassword) {
            (0, response_1.sendError)(res, 'Invalid credentials', 401);
            return;
        }
        // Generate token
        const token = (0, jwt_1.generateToken)({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        });
        (0, response_1.sendSuccess)(res, {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
            },
            token,
        }, 'Login successful');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Login failed', error);
    }
}
/**
 * Get current user profile
 * GET /api/auth/me
 */
async function getMe(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const user = await prisma_1.default.user.findUnique({
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
            (0, response_1.sendError)(res, 'User not found', 404);
            return;
        }
        (0, response_1.sendSuccess)(res, user, 'User profile retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get user profile', error);
    }
}
/**
 * Update password
 * PUT /api/auth/password
 */
async function updatePassword(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { currentPassword, newPassword } = req.body;
        // Get user with password
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
        });
        if (!user) {
            (0, response_1.sendError)(res, 'User not found', 404);
            return;
        }
        // Verify current password
        const isValidPassword = await (0, password_1.comparePassword)(currentPassword, user.password);
        if (!isValidPassword) {
            (0, response_1.sendError)(res, 'Current password is incorrect', 400);
            return;
        }
        // Validate new password strength
        const passwordValidation = (0, password_1.validatePasswordStrength)(newPassword);
        if (!passwordValidation.isValid) {
            (0, response_1.sendError)(res, passwordValidation.errors.join('. '), 400);
            return;
        }
        // Hash and update password
        const hashedPassword = await (0, password_1.hashPassword)(newPassword);
        await prisma_1.default.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword },
        });
        (0, response_1.sendSuccess)(res, null, 'Password updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update password', error);
    }
}
/**
 * Get all users (Admin only)
 * GET /api/auth/users
 */
async function getAllUsers(req, res) {
    try {
        const users = await prisma_1.default.user.findMany({
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
        (0, response_1.sendSuccess)(res, users, 'Users retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get users', error);
    }
}
/**
 * Update user role (Admin only)
 * PATCH /api/auth/users/:id/role
 */
async function updateUserRole(req, res) {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const user = await prisma_1.default.user.update({
            where: { id },
            data: { role },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });
        (0, response_1.sendSuccess)(res, user, 'User role updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update user role', error);
    }
}
/**
 * Deactivate user (Admin only)
 * PATCH /api/auth/users/:id/deactivate
 */
async function deactivateUser(req, res) {
    try {
        const { id } = req.params;
        // Prevent self-deactivation
        if (req.user?.id === id) {
            (0, response_1.sendError)(res, 'Cannot deactivate your own account', 400);
            return;
        }
        await prisma_1.default.user.update({
            where: { id },
            data: { isActive: false },
        });
        (0, response_1.sendSuccess)(res, null, 'User deactivated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to deactivate user', error);
    }
}
//# sourceMappingURL=auth.controller.js.map