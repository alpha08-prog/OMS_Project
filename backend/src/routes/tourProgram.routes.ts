import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createTourProgram,
  getTourPrograms,
  getTourProgramById,
  updateTourProgram,
  updateDecision,
  deleteTourProgram,
  getTodaySchedule,
  getUpcomingEvents,
  getPendingDecisions,
  getEvents,
  submitEventReport,
} from '../controllers/tourProgram.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const createTourProgramValidation = [
  body('eventName').trim().notEmpty().withMessage('Event name is required'),
  body('organizer').trim().notEmpty().withMessage('Organizer is required'),
  body('dateTime').isISO8601().withMessage('Valid date and time is required'),
  body('venue').trim().notEmpty().withMessage('Venue is required'),
  body('venueLink').optional().isURL().withMessage('Venue link must be a valid URL'),
];

const idParamValidation = [
  param('id').isUUID().withMessage('Invalid tour program ID'),
];

const decisionValidation = [
  body('decision')
    .isIn(['ACCEPTED', 'REGRET', 'PENDING'])
    .withMessage('Invalid decision'),
  body('decisionNote').optional().trim(),
];

// All routes require authentication
router.use(authenticate);

// Staff can create tour programs
router.post('/', staffOnly, validate(createTourProgramValidation), createTourProgram);

// Get all tour programs
router.get('/', getTourPrograms);

// Get today's schedule
router.get('/schedule/today', getTodaySchedule);

// Get upcoming events
router.get('/upcoming', getUpcomingEvents);

// Get pending decisions (admin only)
router.get('/pending', adminOnly, getPendingDecisions);

// Get all past events (ACCEPTED + date passed)
router.get('/events', getEvents);

// Submit post-event report (staff)
router.patch('/:id/complete', validate(idParamValidation), submitEventReport);

// Get single tour program
router.get('/:id', validate(idParamValidation), getTourProgramById);

// Update tour program
router.put('/:id', validate(idParamValidation), updateTourProgram);

// Update decision (admin only)
router.patch('/:id/decision', adminOnly, validate([...idParamValidation, ...decisionValidation]), updateDecision);

// Delete tour program (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), deleteTourProgram);

export default router;
