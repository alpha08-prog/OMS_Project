"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const visitor_controller_1 = require("../controllers/visitor.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const createVisitorValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Visitor name is required'),
    (0, express_validator_1.body)('designation').trim().notEmpty().withMessage('Designation is required'),
    (0, express_validator_1.body)('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
    (0, express_validator_1.body)('dob').optional().isISO8601().withMessage('Date of birth must be a valid date'),
    (0, express_validator_1.body)('purpose').trim().notEmpty().withMessage('Purpose of visit is required'),
];
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid visitor ID'),
];
const dateParamValidation = [
    (0, express_validator_1.param)('date').isISO8601().withMessage('Invalid date format'),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Staff can create visitors
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createVisitorValidation), visitor_controller_1.createVisitor);
// Get all visitors
router.get('/', visitor_controller_1.getVisitors);
// Get today's birthdays
router.get('/birthdays/today', visitor_controller_1.getTodayBirthdays);
// Get visitors by date
router.get('/date/:date', (0, validate_1.validate)(dateParamValidation), visitor_controller_1.getVisitorsByDate);
// Get single visitor
router.get('/:id', (0, validate_1.validate)(idParamValidation), visitor_controller_1.getVisitorById);
// Update visitor
router.put('/:id', (0, validate_1.validate)(idParamValidation), visitor_controller_1.updateVisitor);
// Delete visitor (admin only)
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), visitor_controller_1.deleteVisitor);
exports.default = router;
//# sourceMappingURL=visitor.routes.js.map