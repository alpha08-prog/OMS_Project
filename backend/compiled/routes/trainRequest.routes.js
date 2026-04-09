"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const trainRequest_controller_1 = require("../controllers/trainRequest.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const createTrainRequestValidation = [
    (0, express_validator_1.body)('passengerName').trim().notEmpty().withMessage('Passenger name is required'),
    (0, express_validator_1.body)('pnrNumber').trim().notEmpty().withMessage('PNR number is required'),
    (0, express_validator_1.body)('journeyClass').trim().notEmpty().withMessage('Journey class is required'),
    (0, express_validator_1.body)('dateOfJourney').isISO8601().withMessage('Valid date of journey is required'),
    (0, express_validator_1.body)('fromStation').trim().notEmpty().withMessage('From station is required'),
    (0, express_validator_1.body)('toStation').trim().notEmpty().withMessage('To station is required'),
    (0, express_validator_1.body)('contactNumber')
        .optional({ values: 'falsy' })
        .trim()
        .custom((value) => {
        if (value === '' || value === undefined || value === null)
            return true;
        if (!/^\d{10}$/.test(value))
            throw new Error('Contact number must be 10 digits');
        return true;
    }),
];
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid train request ID'),
];
const rejectValidation = [
    (0, express_validator_1.body)('reason').optional().trim(),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Staff can create train requests
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createTrainRequestValidation), trainRequest_controller_1.createTrainRequest);
// Get all train requests
router.get('/', trainRequest_controller_1.getTrainRequests);
// Get pending queue (admin only)
router.get('/queue/pending', auth_1.adminOnly, trainRequest_controller_1.getPendingQueue);
// Check PNR status (mock)
router.get('/pnr/:pnr', trainRequest_controller_1.checkPNRStatus);
// Get single train request
router.get('/:id', (0, validate_1.validate)(idParamValidation), trainRequest_controller_1.getTrainRequestById);
// Update train request
router.put('/:id', (0, validate_1.validate)(idParamValidation), trainRequest_controller_1.updateTrainRequest);
// Approve train request (admin only)
router.patch('/:id/approve', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), trainRequest_controller_1.approveTrainRequest);
// Reject train request (admin only)
router.patch('/:id/reject', auth_1.adminOnly, (0, validate_1.validate)([...idParamValidation, ...rejectValidation]), trainRequest_controller_1.rejectTrainRequest);
// Mark approved request as resolved (admin only)
router.patch('/:id/resolve', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), trainRequest_controller_1.resolveTrainRequest);
// Delete train request (admin only)
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), trainRequest_controller_1.deleteTrainRequest);
exports.default = router;
//# sourceMappingURL=trainRequest.routes.js.map