import { Router } from 'express';
import { param } from 'express-validator';
import {
  generateTrainEQPDF,
  generateGrievancePDF,
  generateTourProgramPDFController,
  previewTrainEQ,
  previewGrievance,
} from '../controllers/pdf.controller';
import { authenticate, adminOnly, staffOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const idParamValidation = [
  param('id').isUUID().withMessage('Invalid ID'),
];

// All routes require authentication
router.use(authenticate);

// Train EQ Letter — staff can download their own, admins can download any
router.get('/train-eq/:id', staffOnly, validate(idParamValidation), generateTrainEQPDF);
router.get('/train-eq/:id/preview', staffOnly, validate(idParamValidation), previewTrainEQ);

// Grievance Letter — staff can download their own, admins can download any
router.get('/grievance/:id', staffOnly, validate(idParamValidation), generateGrievancePDF);
router.get('/grievance/:id/preview', staffOnly, validate(idParamValidation), previewGrievance);

// Tour Program PDF — admin only (overview of all accepted tours)
router.get('/tour-program', adminOnly, generateTourProgramPDFController);

export default router;
