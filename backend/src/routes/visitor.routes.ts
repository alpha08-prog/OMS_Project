import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createVisitor,
  getVisitors,
  getVisitorById,
  updateVisitor,
  deleteVisitor,
  getTodayBirthdays,
  getVisitorsByDate,
} from '../controllers/visitor.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const createVisitorValidation = [
  body('name').trim().notEmpty().withMessage('Visitor name is required'),
  body('designation').trim().notEmpty().withMessage('Designation is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('dob').optional().isISO8601().withMessage('Date of birth must be a valid date'),
  body('purpose').trim().notEmpty().withMessage('Purpose of visit is required'),
];

const idParamValidation = [
  param('id').isUUID().withMessage('Invalid visitor ID'),
];

const dateParamValidation = [
  param('date').isISO8601().withMessage('Invalid date format'),
];

// All routes require authentication
router.use(authenticate);

// Staff can create visitors
router.post('/', staffOnly, validate(createVisitorValidation), createVisitor);

// Get all visitors
router.get('/', getVisitors);

// Get today's birthdays
router.get('/birthdays/today', getTodayBirthdays);

// Get visitors by date
router.get('/date/:date', validate(dateParamValidation), getVisitorsByDate);

// Get single visitor
router.get('/:id', validate(idParamValidation), getVisitorById);

// Update visitor
router.put('/:id', validate(idParamValidation), updateVisitor);

// Delete visitor (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), deleteVisitor);

export default router;
