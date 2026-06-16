import { Router } from 'express';
import { body } from 'express-validator';
import {
  markAttendance,
  checkOutAttendance,
  markLeaveRange,
  getMyToday,
  getMyHistory,
  getAllAttendance,
  getTodayStats,
  getAggregate,
} from '../controllers-catalyst/attendance.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const markAttendanceValidation = [
  body('status')
    .isIn(['PRESENT', 'HALF_DAY', 'LEAVE'])
    .withMessage('status must be PRESENT, HALF_DAY, or LEAVE'),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  body('date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('date must be in YYYY-MM-DD format'),
];

const leaveRangeValidation = [
  body('startDate')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('startDate must be in YYYY-MM-DD format'),
  body('endDate')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('endDate must be in YYYY-MM-DD format'),
  body('reason').isString().trim().isLength({ min: 1, max: 500 })
    .withMessage('reason is required (max 500 chars)'),
];

router.use(authenticate);

// Staff endpoints — any authenticated user (incl. admins) may mark/view their
// own row. staffOnly = STAFF + ADMIN + SUPER_ADMIN.
router.post('/', staffOnly, validate(markAttendanceValidation), markAttendance);
router.post('/checkout', staffOnly, checkOutAttendance);
router.post(
  '/leave-range',
  staffOnly,
  validate(leaveRangeValidation),
  markLeaveRange
);
router.get('/me/today', staffOnly, getMyToday);
router.get('/me', staffOnly, getMyHistory);

// Admin endpoints — list everyone, dashboard counts, range aggregates.
router.get('/stats', adminOnly, getTodayStats);
router.get('/aggregate', adminOnly, getAggregate);
router.get('/', adminOnly, getAllAttendance);

export default router;
