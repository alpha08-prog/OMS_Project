import { Router } from 'express';
import { param } from 'express-validator';
import {
  generateTrainEQPDF,
  generateGrievancePDF,
  generateTourProgramPDFController,
  generateTourProgramSinglePDF,
  previewTourProgram,
  previewTrainEQ,
  previewGrievance,
} from '../controllers-catalyst/pdf.controller';
import { authenticate, staffOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Catalyst row ids are numeric; legacy Prisma ids are UUID. Accept either form.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid ID'),
];

router.use(authenticate);

router.get('/train-eq/:id', staffOnly, validate(idParamValidation), generateTrainEQPDF);
router.get('/train-eq/:id/preview', staffOnly, validate(idParamValidation), previewTrainEQ);
router.get('/grievance/:id', staffOnly, validate(idParamValidation), generateGrievancePDF);
router.get('/grievance/:id/preview', staffOnly, validate(idParamValidation), previewGrievance);
router.get('/tour-program', staffOnly, generateTourProgramPDFController);
router.get('/tour-program/:id', staffOnly, validate(idParamValidation), generateTourProgramSinglePDF);
router.get('/tour-program/:id/preview', staffOnly, validate(idParamValidation), previewTourProgram);

export default router;
