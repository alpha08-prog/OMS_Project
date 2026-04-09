"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const pdf_controller_1 = require("../controllers/pdf.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid ID'),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Train EQ Letter — staff can download their own, admins can download any
router.get('/train-eq/:id', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.generateTrainEQPDF);
router.get('/train-eq/:id/preview', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.previewTrainEQ);
// Grievance Letter — staff can download their own, admins can download any
router.get('/grievance/:id', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.generateGrievancePDF);
router.get('/grievance/:id/preview', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), pdf_controller_1.previewGrievance);
// Tour Program PDF — admin only (overview of all accepted tours)
router.get('/tour-program', auth_1.adminOnly, pdf_controller_1.generateTourProgramPDFController);
exports.default = router;
//# sourceMappingURL=pdf.routes.js.map