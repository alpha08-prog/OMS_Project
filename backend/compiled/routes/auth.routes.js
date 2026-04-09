"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const registerValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];
const loginValidation = [
    (0, express_validator_1.body)('identifier').trim().notEmpty().withMessage('Email or phone is required'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required'),
];
const passwordValidation = [
    (0, express_validator_1.body)('currentPassword').notEmpty().withMessage('Current password is required'),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];
const roleValidation = [
    (0, express_validator_1.body)('role').isIn(['STAFF', 'ADMIN', 'SUPER_ADMIN']).withMessage('Invalid role'),
];
// Public routes
router.post('/register', (0, validate_1.validate)(registerValidation), auth_controller_1.register);
router.post('/login', (0, validate_1.validate)(loginValidation), auth_controller_1.login);
// Protected routes
router.get('/me', auth_1.authenticate, auth_controller_1.getMe);
router.put('/password', auth_1.authenticate, (0, validate_1.validate)(passwordValidation), auth_controller_1.updatePassword);
// Admin only routes
router.get('/users', auth_1.authenticate, auth_1.adminOnly, auth_controller_1.getAllUsers);
router.patch('/users/:id/role', auth_1.authenticate, auth_1.adminOnly, (0, validate_1.validate)(roleValidation), auth_controller_1.updateUserRole);
router.patch('/users/:id/deactivate', auth_1.authenticate, auth_1.adminOnly, auth_controller_1.deactivateUser);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map