import { Router } from 'express';
import { param } from 'express-validator';
import {
  generateTrainEQPDF,
  generateGrievancePDF,
  generateTourProgramPDFController,
  previewTrainEQ,
  previewGrievance,
} from '../controllers/pdf.controller';
import { authenticate, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const idParamValidation = [
  param('id').isUUID().withMessage('Invalid ID'),
];

// All routes require authentication and admin access
router.use(authenticate);
router.use(adminOnly);

// Train EQ Letter
router.get('/train-eq/:id', validate(idParamValidation), generateTrainEQPDF);
router.get('/train-eq/:id/preview', validate(idParamValidation), previewTrainEQ);

// Grievance Letter
router.get('/grievance/:id', validate(idParamValidation), generateGrievancePDF);
router.get('/grievance/:id/preview', validate(idParamValidation), previewGrievance);

// Tour Program PDF
router.get('/tour-program', generateTourProgramPDFController);

export default router;
