import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createTrainRequest,
  getTrainRequests,
  getTrainRequestById,
  updateTrainRequest,
  approveTrainRequest,
  rejectTrainRequest,
  resolveTrainRequest,
  deleteTrainRequest,
  getPendingQueue,
  checkPNRStatus,
  exportTrainRequests,
} from '../controllers-catalyst/trainRequest.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

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

const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid train request ID'),
];

const rejectValidation = [body('reason').optional().trim()];

router.use(authenticate);

router.post('/', staffOnly, validate(createTrainRequestValidation), createTrainRequest);
router.get('/', getTrainRequests);
// MUST stay above '/:id' — Express matches in registration order, and the
// param route would otherwise answer /export.csv with an ID validation error.
// Not adminOnly on purpose: it reuses the list's staff scoping, so a STAFF
// caller exports exactly their own rows.
router.get('/export.csv', exportTrainRequests);
router.get('/queue/pending', adminOnly, getPendingQueue);
router.get('/pnr/:pnr', checkPNRStatus);
router.get('/:id', validate(idParamValidation), getTrainRequestById);
router.put('/:id', validate(idParamValidation), updateTrainRequest);
router.patch('/:id/approve', adminOnly, validate(idParamValidation), approveTrainRequest);
router.patch(
  '/:id/reject',
  adminOnly,
  validate([...idParamValidation, ...rejectValidation]),
  rejectTrainRequest
);
router.patch('/:id/resolve', adminOnly, validate(idParamValidation), resolveTrainRequest);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteTrainRequest);

export default router;
