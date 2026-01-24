import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createGrievance,
  getGrievances,
  getGrievanceById,
  updateGrievance,
  verifyGrievance,
  updateGrievanceStatus,
  deleteGrievance,
  getVerificationQueue,
} from '../controllers/grievance.controller';
import { authenticate, adminOnly, staffOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const createGrievanceValidation = [
  body('petitionerName').trim().notEmpty().withMessage('Petitioner name is required'),
  body('mobileNumber').matches(/^\d{10}$/).withMessage('Valid 10-digit mobile number is required'),
  body('constituency').trim().notEmpty().withMessage('Constituency is required'),
  body('grievanceType')
    .isIn(['WATER', 'ROAD', 'POLICE', 'HEALTH', 'TRANSFER', 'FINANCIAL_AID', 'ELECTRICITY', 'EDUCATION', 'HOUSING', 'OTHER'])
    .withMessage('Valid grievance type is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('monetaryValue').optional().isFloat({ min: 0 }).withMessage('Monetary value must be a positive number'),
  body('actionRequired')
    .optional()
    .isIn(['GENERATE_LETTER', 'CALL_OFFICIAL', 'FORWARD_TO_DEPT', 'SCHEDULE_MEETING', 'NO_ACTION'])
    .withMessage('Invalid action required'),
];

const updateStatusValidation = [
  body('status')
    .isIn(['OPEN', 'IN_PROGRESS', 'VERIFIED', 'RESOLVED', 'REJECTED'])
    .withMessage('Invalid status'),
];

const idParamValidation = [
  param('id').isUUID().withMessage('Invalid grievance ID'),
];

// All routes require authentication
router.use(authenticate);

// Staff can create grievances
router.post('/', staffOnly, validate(createGrievanceValidation), createGrievance);

// Get all grievances (with filters and pagination)
router.get('/', getGrievances);

// Get verification queue (admin only)
router.get('/queue/verification', adminOnly, getVerificationQueue);

// Get single grievance
router.get('/:id', validate(idParamValidation), getGrievanceById);

// Update grievance
router.put('/:id', validate(idParamValidation), updateGrievance);

// Verify grievance (admin only)
router.patch('/:id/verify', adminOnly, validate(idParamValidation), verifyGrievance);

// Update status (admin only)
router.patch('/:id/status', adminOnly, validate([...idParamValidation, ...updateStatusValidation]), updateGrievanceStatus);

// Delete grievance (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), deleteGrievance);

export default router;
