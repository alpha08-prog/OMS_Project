"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const task_controller_1 = require("../controllers/task.controller");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
// Validation rules
const createTaskValidation = [
    (0, express_validator_1.body)('title').trim().notEmpty().withMessage('Task title is required'),
    (0, express_validator_1.body)('taskType').isIn(['GRIEVANCE', 'TRAIN_REQUEST', 'TOUR_PROGRAM', 'GENERAL']).withMessage('Valid task type is required'),
    (0, express_validator_1.body)('assignedToId').isUUID().withMessage('Valid staff ID is required'),
    (0, express_validator_1.body)('dueDate').optional().isISO8601().withMessage('Due date must be valid'),
];
const idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid task ID'),
];
const updateProgressValidation = [
    (0, express_validator_1.body)('status').optional().isIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).withMessage('Valid status required'),
    (0, express_validator_1.body)('progressNotes').optional().trim(),
    (0, express_validator_1.body)('progressPercent').optional().isInt({ min: 0, max: 100 }).withMessage('Progress must be 0-100'),
];
const updateStatusValidation = [
    (0, express_validator_1.body)('status').isIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).withMessage('Valid status required'),
];
// All routes require authentication
router.use(auth_1.authenticate);
// Staff routes
router.get('/my-tasks', auth_1.staffOnly, task_controller_1.getMyTasks);
router.get('/:id/history', auth_1.staffOnly, (0, validate_1.validate)(idParamValidation), task_controller_1.getTaskHistory);
router.patch('/:id/progress', auth_1.staffOnly, (0, validate_1.validate)([...idParamValidation, ...updateProgressValidation]), task_controller_1.updateTaskProgress);
// Admin routes
router.post('/', auth_1.adminOnly, (0, validate_1.validate)(createTaskValidation), task_controller_1.createTask);
router.get('/tracking', auth_1.adminOnly, task_controller_1.getTaskTracking);
router.get('/staff', auth_1.adminOnly, task_controller_1.getStaffMembers);
router.patch('/:id/status', auth_1.adminOnly, (0, validate_1.validate)([...idParamValidation, ...updateStatusValidation]), task_controller_1.updateTaskStatus);
router.delete('/:id', auth_1.adminOnly, (0, validate_1.validate)(idParamValidation), task_controller_1.deleteTask);
// Shared routes (with role-based filtering in controller)
router.get('/', task_controller_1.getTasks);
router.get('/:id', (0, validate_1.validate)(idParamValidation), task_controller_1.getTaskById);
exports.default = router;
//# sourceMappingURL=task.routes.js.map