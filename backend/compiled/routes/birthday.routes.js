"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const birthday_controller_1 = require("../controllers/birthday.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const createBirthdayValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
    (0, express_validator_1.body)('dob').notEmpty().isISO8601().withMessage('Date of birth is required and must be a valid date'),
    (0, express_validator_1.body)('relation').trim().notEmpty().withMessage('Relation/Category is required'),
    (0, express_validator_1.body)('notes').optional().trim(),
];
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid birthday ID'),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Staff can create birthday entries
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createBirthdayValidation), birthday_controller_1.createBirthday);
// Get all birthdays (for listing)
router.get('/', birthday_controller_1.getBirthdays);
// Get today's birthdays (for widget)
router.get('/today', birthday_controller_1.getTodayBirthdays);
// Get upcoming birthdays (next 7 days)
router.get('/upcoming', birthday_controller_1.getUpcomingBirthdays);
// Get single birthday entry
router.get('/:id', (0, validate_1.validate)(idParamValidation), birthday_controller_1.getBirthdayById);
// Update birthday entry
router.put('/:id', (0, validate_1.validate)(idParamValidation), birthday_controller_1.updateBirthday);
// Delete birthday entry (admin only)
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), birthday_controller_1.deleteBirthday);
exports.default = router;
//# sourceMappingURL=birthday.routes.js.map