"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const tourProgram_controller_1 = require("../controllers/tourProgram.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const createTourProgramValidation = [
    (0, express_validator_1.body)('eventName').trim().notEmpty().withMessage('Event name is required'),
    (0, express_validator_1.body)('organizer').trim().notEmpty().withMessage('Organizer is required'),
    (0, express_validator_1.body)('dateTime').isISO8601().withMessage('Valid date and time is required'),
    (0, express_validator_1.body)('venue').trim().notEmpty().withMessage('Venue is required'),
    (0, express_validator_1.body)('venueLink').optional().isURL().withMessage('Venue link must be a valid URL'),
];
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid tour program ID'),
];
const decisionValidation = [
    (0, express_validator_1.body)('decision')
        .isIn(['ACCEPTED', 'REGRET', 'PENDING'])
        .withMessage('Invalid decision'),
    (0, express_validator_1.body)('decisionNote').optional().trim(),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Staff can create tour programs
router.post('/', auth_1.staffOnly, (0, validate_1.validate)(createTourProgramValidation), tourProgram_controller_1.createTourProgram);
// Get all tour programs
router.get('/', tourProgram_controller_1.getTourPrograms);
// Get today's schedule
router.get('/schedule/today', tourProgram_controller_1.getTodaySchedule);
// Get upcoming events
router.get('/upcoming', tourProgram_controller_1.getUpcomingEvents);
// Get pending decisions (admin only)
router.get('/pending', auth_1.adminOnly, tourProgram_controller_1.getPendingDecisions);
// Get all past events (ACCEPTED + date passed)
router.get('/events', tourProgram_controller_1.getEvents);
// Submit post-event report (staff)
router.patch('/:id/complete', (0, validate_1.validate)(idParamValidation), tourProgram_controller_1.submitEventReport);
// Get single tour program
router.get('/:id', (0, validate_1.validate)(idParamValidation), tourProgram_controller_1.getTourProgramById);
// Update tour program
router.put('/:id', (0, validate_1.validate)(idParamValidation), tourProgram_controller_1.updateTourProgram);
// Update decision (admin only)
router.patch('/:id/decision', auth_1.adminOnly, (0, validate_1.validate)([...idParamValidation, ...decisionValidation]), tourProgram_controller_1.updateDecision);
// Delete tour program (admin only)
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), tourProgram_controller_1.deleteTourProgram);
exports.default = router;
//# sourceMappingURL=tourProgram.routes.js.map