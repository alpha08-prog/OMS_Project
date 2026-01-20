import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createBirthday,
  getBirthdays,
  getBirthdayById,
  updateBirthday,
  deleteBirthday,
  getTodayBirthdays,
  getUpcomingBirthdays,
} from '../controllers/birthday.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const createBirthdayValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('dob').notEmpty().isISO8601().withMessage('Date of birth is required and must be a valid date'),
  body('relation').trim().notEmpty().withMessage('Relation/Category is required'),
  body('notes').optional().trim(),
];

const idParamValidation = [
  param('id').isUUID().withMessage('Invalid birthday ID'),
];

// All routes require authentication
router.use(authenticate);

// Staff can create birthday entries
router.post('/', staffOnly, validate(createBirthdayValidation), createBirthday);

// Get all birthdays (for listing)
router.get('/', getBirthdays);

// Get today's birthdays (for widget)
router.get('/today', getTodayBirthdays);

// Get upcoming birthdays (next 7 days)
router.get('/upcoming', getUpcomingBirthdays);

// Get single birthday entry
router.get('/:id', validate(idParamValidation), getBirthdayById);

// Update birthday entry
router.put('/:id', validate(idParamValidation), updateBirthday);

// Delete birthday entry (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), deleteBirthday);

export default router;
