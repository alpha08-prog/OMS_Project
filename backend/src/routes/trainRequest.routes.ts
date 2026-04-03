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
} from '../controllers/trainRequest.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
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
  param('id').isUUID().withMessage('Invalid train request ID'),
];

const rejectValidation = [
  body('reason').optional().trim(),
];

// All routes require authentication
router.use(authenticate);

// Staff can create train requests
router.post('/', staffOnly, validate(createTrainRequestValidation), createTrainRequest);

// Get all train requests
router.get('/', getTrainRequests);

// Get pending queue (admin only)
router.get('/queue/pending', adminOnly, getPendingQueue);

// Check PNR status (mock)
router.get('/pnr/:pnr', checkPNRStatus);

// Get single train request
router.get('/:id', validate(idParamValidation), getTrainRequestById);

// Update train request
router.put('/:id', validate(idParamValidation), updateTrainRequest);

// Approve train request (admin only)
router.patch('/:id/approve', adminOnly, validate(idParamValidation), approveTrainRequest);

// Reject train request (admin only)
router.patch('/:id/reject', adminOnly, validate([...idParamValidation, ...rejectValidation]), rejectTrainRequest);

// Mark approved request as resolved (admin only)
router.patch('/:id/resolve', adminOnly, validate(idParamValidation), resolveTrainRequest);

// Delete train request (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), deleteTrainRequest);

export default router;
