import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/trainRequest.controller';
import * as catalystCtrl from '../controllers-catalyst/trainRequest.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/** Dispatcher: same pattern as visitor / grievance / task. */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('trainRequest')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

const createTrainRequestValidation = [
  body('passengerName').trim().notEmpty().withMessage('Passenger name is required'),
  body('pnrNumber').trim().notEmpty().withMessage('PNR number is required'),
  body('journeyClass').trim().notEmpty().withMessage('Journey class is required'),
  body('dateOfJourney').isISO8601().withMessage('Valid date of journey is required'),
  body('fromStation').trim().notEmpty().withMessage('From station is required'),
  body('toStation').trim().notEmpty().withMessage('To station is required'),
  body('contactNumber')
    .optional({ values: 'falsy' })
    .trim()
    .custom((value) => {
      if (value === '' || value === undefined || value === null) return true;
      if (!/^\d{10}$/.test(value)) throw new Error('Contact number must be 10 digits');
      return true;
    }),
];

// Catalyst tasks have numeric ROWIDs; Prisma uses UUIDs. Accept both.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid train request ID'),
];

const rejectValidation = [body('reason').optional().trim()];

// All routes require authentication
router.use(authenticate);

router.post('/', staffOnly, validate(createTrainRequestValidation), dispatch('createTrainRequest'));
router.get('/', dispatch('getTrainRequests'));
router.get('/queue/pending', adminOnly, dispatch('getPendingQueue'));
router.get('/pnr/:pnr', dispatch('checkPNRStatus'));
router.get('/:id', validate(idParamValidation), dispatch('getTrainRequestById'));
router.put('/:id', validate(idParamValidation), dispatch('updateTrainRequest'));
router.patch('/:id/approve', adminOnly, validate(idParamValidation), dispatch('approveTrainRequest'));
router.patch(
  '/:id/reject',
  adminOnly,
  validate([...idParamValidation, ...rejectValidation]),
  dispatch('rejectTrainRequest')
);
router.patch('/:id/resolve', adminOnly, validate(idParamValidation), dispatch('resolveTrainRequest'));
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteTrainRequest'));

export default router;
