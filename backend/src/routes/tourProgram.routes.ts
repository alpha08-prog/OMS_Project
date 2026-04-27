import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/tourProgram.controller';
import * as catalystCtrl from '../controllers-catalyst/tourProgram.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/** Dispatcher: same pattern as visitor / grievance / task / train. */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('tourProgram')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

const createTourProgramValidation = [
  body('eventName').trim().notEmpty().withMessage('Event name is required'),
  body('organizer').trim().notEmpty().withMessage('Organizer is required'),
  body('dateTime').isISO8601().withMessage('Valid date and time is required'),
  body('venue').trim().notEmpty().withMessage('Venue is required'),
  body('venueLink').optional().isURL().withMessage('Venue link must be a valid URL'),
];

// Catalyst uses numeric ROWIDs; Prisma uses UUIDs. Accept both.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid tour program ID'),
];

const decisionValidation = [
  body('decision')
    .isIn(['ACCEPTED', 'REGRET', 'PENDING'])
    .withMessage('Invalid decision'),
  body('decisionNote').optional().trim(),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createTourProgramValidation), dispatch('createTourProgram'));
router.get('/', dispatch('getTourPrograms'));
router.get('/schedule/today', dispatch('getTodaySchedule'));
router.get('/upcoming', dispatch('getUpcomingEvents'));
router.get('/pending', adminOnly, dispatch('getPendingDecisions'));
router.get('/events', dispatch('getEvents'));
router.patch('/:id/complete', validate(idParamValidation), dispatch('submitEventReport'));
router.get('/:id', validate(idParamValidation), dispatch('getTourProgramById'));
router.put('/:id', validate(idParamValidation), dispatch('updateTourProgram'));
router.patch(
  '/:id/decision',
  adminOnly,
  validate([...idParamValidation, ...decisionValidation]),
  dispatch('updateDecision')
);
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteTourProgram'));

export default router;
