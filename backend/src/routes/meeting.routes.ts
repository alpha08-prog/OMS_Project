import { Router } from 'express';
import { body } from 'express-validator';
import {
  createMeeting,
  getMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
} from '../controllers-catalyst/meeting.controller';
import { authenticate, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const createMeetingValidation = [
  body('title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('title is required (max 200 chars)'),
  body('dateTime').notEmpty().withMessage('dateTime is required'),
  body('location').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('attendees').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
  body('agenda').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body('summary').optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
];

router.use(authenticate);

// Meetings are an admin-only module (adminOnly = ADMIN + SUPER_ADMIN).
router.post('/', adminOnly, validate(createMeetingValidation), createMeeting);
router.get('/', adminOnly, getMeetings);
router.get('/:id', adminOnly, getMeetingById);
router.patch('/:id', adminOnly, updateMeeting);
router.delete('/:id', adminOnly, deleteMeeting);

export default router;
