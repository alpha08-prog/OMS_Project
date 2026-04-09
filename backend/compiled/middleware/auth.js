"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminOnly = exports.adminOnly = exports.staffOnly = void 0;
exports.authenticate = authenticate;
exports.authorize = authorize;
const client_1 = require("@prisma/client");
const jwt_1 = require("../utils/jwt");
const response_1 = require("../utils/response");
const prisma_1 = __importDefault(require("../lib/prisma"));
/**
 * Middleware to authenticate JWT token
 * Attaches user info to request object
 * Supports token from:
 * 1. Authorization header (Bearer token)
 * 2. Query parameter (?token=xxx) - useful for PDF downloads
 */
async function authenticate(req, res, next) {
    try {
        // Try to get token from header first, then from query params
        let token = (0, jwt_1.extractToken)(req.headers.authorization);
        // If no token in header, check query params (for PDF downloads in new tabs)
        if (!token && req.query.token) {
            token = String(req.query.token);
        }
        if (!token) {
            (0, response_1.sendUnauthorized)(res, 'No token provided');
            return;
        }
        const payload = (0, jwt_1.verifyToken)(token);
        if (!payload) {
            (0, response_1.sendUnauthorized)(res, 'Invalid or expired token');
            return;
        }
        // Verify user still exists and is active
        const user = await prisma_1.default.user.findUnique({
            where: { id: payload.id },
            select: { id: true, email: true, role: true, name: true, isActive: true },
        });
        if (!user || !user.isActive) {
            (0, response_1.sendUnauthorized)(res, 'User not found or inactive');
            return;
        }
        // Attach user to request
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        };
        console.log(`Authentication successful - User: ${user.email}, Role: ${user.role}, Path: ${req.path}`);
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        (0, response_1.sendUnauthorized)(res, 'Authentication failed');
    }
}
/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            console.error('Authorization failed: User not authenticated');
            (0, response_1.sendUnauthorized)(res, 'User not authenticated');
            return;
        }
        console.log(`Authorization check - User role: ${req.user.role}, Allowed roles: ${allowedRoles.join(', ')}, Match: ${allowedRoles.includes(req.user.role)}`);
        if (!allowedRoles.includes(req.user.role)) {
            console.error(`Access denied for user ${req.user.email} (role: ${req.user.role}). Required: ${allowedRoles.join(' or ')}`);
            (0, response_1.sendForbidden)(res, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
            return;
        }
        next();
    };
}
/**
 * Middleware for Staff only access
 */
exports.staffOnly = authorize(client_1.UserRole.STAFF, client_1.UserRole.ADMIN, client_1.UserRole.SUPER_ADMIN);
/**
 * Middleware for Admin only access
 */
exports.adminOnly = authorize(client_1.UserRole.ADMIN, client_1.UserRole.SUPER_ADMIN);
/**
 * Middleware for Super Admin only access
 */
exports.superAdminOnly = authorize(client_1.UserRole.SUPER_ADMIN);
//# sourceMappingURL=auth.js.map