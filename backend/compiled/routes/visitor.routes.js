"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const visitor_controller_1 = require("../controllers-catalyst/visitor.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
const createVisitorValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Visitor name is required'),
    (0, express_validator_1.body)('designation').trim().notEmpty().withMessage('Designation is required'),
    (0, express_validator_1.body)('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
    (0, express_validator_1.body)('dob').optional().isISO8601().withMessage('Date of birth must be a valid date'),
    (0, express_validator_1.body)('purpose').trim().notEmpty().withMessage('Purpose of visit is required'),
];
// Catalyst row ids are numeric; legacy Prisma ids are UUID. Accept either form.
const idParamValidation = [
    (0, express_validator_1.param)('id')
        .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
        .withMessage('Invalid visitor ID'),
];
const dateParamValidation = [
    (0, express_validator_1.param)('date').isISO8601().withMessage('Invalid date format'),
];
router.use(auth_1.authenticate);
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createVisitorValidation), visitor_controller_1.createVisitor);
router.get('/', visitor_controller_1.getVisitors);
router.get('/birthdays/today', visitor_controller_1.getTodayBirthdays);
router.get('/date/:date', (0, validate_1.validate)(dateParamValidation), visitor_controller_1.getVisitorsByDate);
router.get('/:id', (0, validate_1.validate)(idParamValidation), visitor_controller_1.getVisitorById);
router.put('/:id', (0, validate_1.validate)(idParamValidation), visitor_controller_1.updateVisitor);
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), visitor_controller_1.deleteVisitor);
exports.default = router;
//# sourceMappingURL=visitor.routes.js.map