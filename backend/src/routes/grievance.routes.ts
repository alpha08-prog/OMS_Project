import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createGrievance,
  getGrievances,
  getGrievanceById,
  getGrievanceTimeline,
  updateGrievance,
  verifyGrievance,
  updateGrievanceStatus,
  deleteGrievance,
  getVerificationQueue,
} from '../controllers-catalyst/grievance.controller';
import { authenticate, adminOnly, staffOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const createGrievanceValidation = [
  body('petitionerName').trim().notEmpty().withMessage('Petitioner name is required'),
  body('mobileNumber').matches(/^\d{10}$/).withMessage('Valid 10-digit mobile number is required'),
  body('constituency').trim().notEmpty().withMessage('Constituency is required'),
  body('grievanceType')
    .isIn(['WATER', 'ROAD', 'POLICE', 'HEALTH', 'TRANSFER', 'FINANCIAL_AID', 'ELECTRICITY', 'EDUCATION', 'HOUSING', 'Revenue', 'RDPR', 'Railway', 'Agriculture', 'Job', 'TEMPLE_VISIT', 'OTHER'])
    .withMessage('Valid grievance type is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('monetaryValue')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Monetary value must be a positive number'),
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
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid grievance ID'),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createGrievanceValidation), createGrievance);
router.get('/', getGrievances);
router.get('/queue/verification', adminOnly, getVerificationQueue);
router.get('/:id', validate(idParamValidation), getGrievanceById);
router.get('/:id/timeline', validate(idParamValidation), getGrievanceTimeline);
router.put('/:id', validate(idParamValidation), updateGrievance);
router.patch('/:id/verify', adminOnly, validate(idParamValidation), verifyGrievance);
router.patch('/:id/status', adminOnly, validate([...idParamValidation, ...updateStatusValidation]), updateGrievanceStatus);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteGrievance);

export default router;
