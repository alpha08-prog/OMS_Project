"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const grievance_controller_1 = require("../controllers-catalyst/grievance.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
const createGrievanceValidation = [
    (0, express_validator_1.body)('petitionerName').trim().notEmpty().withMessage('Petitioner name is required'),
    (0, express_validator_1.body)('mobileNumber').matches(/^\d{10}$/).withMessage('Valid 10-digit mobile number is required'),
    (0, express_validator_1.body)('constituency').trim().notEmpty().withMessage('Constituency is required'),
    (0, express_validator_1.body)('grievanceType')
        .isIn(['WATER', 'ROAD', 'POLICE', 'HEALTH', 'TRANSFER', 'FINANCIAL_AID', 'ELECTRICITY', 'EDUCATION', 'HOUSING', 'TEMPLE_VISIT', 'OTHER'])
        .withMessage('Valid grievance type is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Description is required'),
    (0, express_validator_1.body)('monetaryValue')
        .optional({ nullable: true, checkFalsy: true })
        .isFloat({ min: 0 })
        .withMessage('Monetary value must be a positive number'),
    (0, express_validator_1.body)('actionRequired')
        .optional()
        .isIn(['GENERATE_LETTER', 'CALL_OFFICIAL', 'FORWARD_TO_DEPT', 'SCHEDULE_MEETING', 'NO_ACTION'])
        .withMessage('Invalid action required'),
];
const updateStatusValidation = [
    (0, express_validator_1.body)('status')
        .isIn(['OPEN', 'IN_PROGRESS', 'VERIFIED', 'RESOLVED', 'REJECTED'])
        .withMessage('Invalid status'),
];
const idParamValidation = [
    (0, express_validator_1.param)('id')
        .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
        .withMessage('Invalid grievance ID'),
];
router.use(auth_1.authenticate);
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createGrievanceValidation), grievance_controller_1.createGrievance);
router.get('/', grievance_controller_1.getGrievances);
router.get('/queue/verification', auth_1.adminOnly, grievance_controller_1.getVerificationQueue);
router.get('/:id', (0, validate_1.validate)(idParamValidation), grievance_controller_1.getGrievanceById);
router.put('/:id', (0, validate_1.validate)(idParamValidation), grievance_controller_1.updateGrievance);
router.patch('/:id/verify', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), grievance_controller_1.verifyGrievance);
router.patch('/:id/status', auth_1.adminOnly, (0, validate_1.validate)([...idParamValidation, ...updateStatusValidation]), grievance_controller_1.updateGrievanceStatus);
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), grievance_controller_1.deleteGrievance);
exports.default = router;
//# sourceMappingURL=grievance.routes.js.map