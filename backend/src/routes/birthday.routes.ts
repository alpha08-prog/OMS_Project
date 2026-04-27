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
} from '../controllers-catalyst/birthday.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const createBirthdayValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('dob').notEmpty().isISO8601().withMessage('Date of birth is required and must be a valid date'),
  body('relation').trim().notEmpty().withMessage('Relation/Category is required'),
  body('notes').optional().trim(),
];

const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid birthday ID'),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createBirthdayValidation), createBirthday);
router.get('/', getBirthdays);
router.get('/today', getTodayBirthdays);
router.get('/upcoming', getUpcomingBirthdays);
router.get('/:id', validate(idParamValidation), getBirthdayById);
router.put('/:id', validate(idParamValidation), updateBirthday);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteBirthday);

export default router;
