import { Router } from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  getMe,
  updatePassword,
  getAllUsers,
  updateUserRole,
  deactivateUser,
} from '../controllers/auth.controller';
import { authenticate, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginValidation = [
  body('identifier').trim().notEmpty().withMessage('Email or phone is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const passwordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

const roleValidation = [
  body('role').isIn(['STAFF', 'ADMIN', 'SUPER_ADMIN']).withMessage('Invalid role'),
];

// Public routes
router.post('/register', validate(registerValidation), register);
router.post('/login', validate(loginValidation), login);

// Protected routes
router.get('/me', authenticate, getMe);
router.put('/password', authenticate, validate(passwordValidation), updatePassword);

// Admin only routes
router.get('/users', authenticate, adminOnly, getAllUsers);
router.patch('/users/:id/role', authenticate, adminOnly, validate(roleValidation), updateUserRole);
router.patch('/users/:id/deactivate', authenticate, adminOnly, deactivateUser);

export default router;
