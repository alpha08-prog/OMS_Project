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
} from '../controllers-catalyst/visitor.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const createVisitorValidation = [
  body('name').trim().notEmpty().withMessage('Visitor name is required'),
  body('designation').trim().notEmpty().withMessage('Designation is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('dob').optional().isISO8601().withMessage('Date of birth must be a valid date'),
  body('purpose').trim().notEmpty().withMessage('Purpose of visit is required'),
];

// Catalyst row ids are numeric; legacy ids are UUID. Accept either form.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid visitor ID'),
];

const dateParamValidation = [
  param('date').isISO8601().withMessage('Invalid date format'),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createVisitorValidation), createVisitor);
router.get('/', getVisitors);
router.get('/birthdays/today', getTodayBirthdays);
router.get('/date/:date', validate(dateParamValidation), getVisitorsByDate);
router.get('/:id', validate(idParamValidation), getVisitorById);
router.put('/:id', validate(idParamValidation), updateVisitor);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteVisitor);

export default router;
