import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createTourProgram,
  getTourPrograms,
  getTourProgramById,
  updateTourProgram,
  updateDecision,
  deleteTourProgram,
  getPendingDecisions,
  getTodaySchedule,
  getUpcomingEvents,
  getEvents,
  submitEventReport,
} from '../controllers-catalyst/tourProgram.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const createTourProgramValidation = [
  body('eventName').trim().notEmpty().withMessage('Event name is required'),
  body('organizer').trim().notEmpty().withMessage('Organizer is required'),
  body('dateTime').isISO8601().withMessage('Valid date and time is required'),
  body('venue').trim().notEmpty().withMessage('Venue is required'),
  body('venueLink').optional().isURL().withMessage('Venue link must be a valid URL'),
];

const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid tour program ID'),
];

const decisionValidation = [
  body('decision').isIn(['ACCEPTED', 'REGRET', 'PENDING']).withMessage('Invalid decision'),
  body('decisionNote').optional().trim(),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createTourProgramValidation), createTourProgram);
router.get('/', getTourPrograms);
router.get('/schedule/today', getTodaySchedule);
router.get('/upcoming', getUpcomingEvents);
router.get('/pending', adminOnly, getPendingDecisions);
router.get('/events', getEvents);
router.patch('/:id/complete', validate(idParamValidation), submitEventReport);
router.get('/:id', validate(idParamValidation), getTourProgramById);
router.put('/:id', validate(idParamValidation), updateTourProgram);
router.patch(
  '/:id/decision',
  adminOnly,
  validate([...idParamValidation, ...decisionValidation]),
  updateDecision
);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteTourProgram);

export default router;
