import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/grievance.controller';
import * as catalystCtrl from '../controllers-catalyst/grievance.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, adminOnly, staffOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Dispatcher — picks Prisma or Catalyst implementation per request based on
 * USE_CATALYST_GRIEVANCE feature flag. Same pattern as visitor.routes.ts.
 */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('grievance')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Validation rules (unchanged from Prisma version)
const createGrievanceValidation = [
  body('petitionerName').trim().notEmpty().withMessage('Petitioner name is required'),
  body('mobileNumber').matches(/^\d{10}$/).withMessage('Valid 10-digit mobile number is required'),
  body('constituency').trim().notEmpty().withMessage('Constituency is required'),
  body('grievanceType')
    .isIn(['WATER', 'ROAD', 'POLICE', 'HEALTH', 'TRANSFER', 'FINANCIAL_AID', 'ELECTRICITY', 'EDUCATION', 'HOUSING', 'OTHER'])
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

// Catalyst uses numeric ROWIDs, Prisma uses UUIDs.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid grievance ID'),
];

// All routes require authentication
router.use(authenticate);

// Staff can create grievances
router.post('/', staffOnly, validate(createGrievanceValidation), dispatch('createGrievance'));

// Get all grievances (with filters and pagination)
router.get('/', dispatch('getGrievances'));

// Get verification queue (admin only)
router.get('/queue/verification', adminOnly, dispatch('getVerificationQueue'));

// Get single grievance
router.get('/:id', validate(idParamValidation), dispatch('getGrievanceById'));

// Update grievance
router.put('/:id', validate(idParamValidation), dispatch('updateGrievance'));

// Verify grievance (admin only)
router.patch('/:id/verify', adminOnly, validate(idParamValidation), dispatch('verifyGrievance'));

// Update status (admin only)
router.patch('/:id/status', adminOnly, validate([...idParamValidation, ...updateStatusValidation]), dispatch('updateGrievanceStatus'));

// Delete grievance (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteGrievance'));

export default router;
