import { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Generate Train EQ Letter PDF
 * GET /api/pdf/train-eq/:id
 */
export declare function generateTrainEQPDF(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Generate Grievance Letter PDF
 * GET /api/pdf/grievance/:id
 */
export declare function generateGrievancePDF(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Generate Tour Program PDF
 * GET /api/pdf/tour-program
 */
export declare function generateTourProgramPDFController(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Preview Train EQ Letter (returns HTML instead of PDF for quick preview)
 * GET /api/pdf/train-eq/:id/preview
 */
export declare function previewTrainEQ(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Preview Grievance Letter (returns HTML)
 * GET /api/pdf/grievance/:id/preview
 */
export declare function previewGrievance(req: AuthenticatedRequest, res: Response): Promise<void>;
//# sourceMappingURL=pdf.controller.d.ts.map