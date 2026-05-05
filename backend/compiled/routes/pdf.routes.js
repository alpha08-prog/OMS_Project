"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const pdf_controller_1 = require("../controllers-catalyst/pdf.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Catalyst row ids are numeric; legacy Prisma ids are UUID. Accept either form.
const idParamValidation = [
    (0, express_validator_1.param)('id')
        .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
        .withMessage('Invalid ID'),
];
router.use(auth_1.authenticate);
router.get('/train-eq/:id', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.generateTrainEQPDF);
router.get('/train-eq/:id/preview', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.previewTrainEQ);
router.get('/grievance/:id', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.generateGrievancePDF);
router.get('/grievance/:id/preview', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.previewGrievance);
router.get('/tour-program', auth_1.adminOnly, pdf_controller_1.generateTourProgramPDFController);
router.get('/tour-program/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.generateTourProgramSinglePDF);
router.get('/tour-program/:id/preview', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.previewTourProgram);
exports.default = router;
//# sourceMappingURL=pdf.routes.js.map