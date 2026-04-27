import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import * as prismaCtrl from '../controllers/auth.controller';
import * as catalystCtrl from '../controllers-catalyst/auth.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/** Dispatcher: same pattern as the other migrated modules. */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('auth')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

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
router.post('/register', validate(registerValidation), dispatch('register'));
router.post('/login', validate(loginValidation), dispatch('login'));

// Protected routes
router.get('/me', authenticate, dispatch('getMe'));
router.put('/password', authenticate, validate(passwordValidation), dispatch('updatePassword'));

// Admin only routes
router.get('/users', authenticate, adminOnly, dispatch('getAllUsers'));
router.patch('/users/:id/role', authenticate, adminOnly, validate(roleValidation), dispatch('updateUserRole'));
router.patch('/users/:id/deactivate', authenticate, adminOnly, dispatch('deactivateUser'));

export default router;
