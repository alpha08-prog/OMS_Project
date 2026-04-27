import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createTask,
  getTasks,
  getMyTasks,
  getTaskById,
  updateTaskProgress,
  updateTaskStatus,
  deleteTask,
  getTaskHistory,
  getTaskTracking,
  getStaffMembers,
} from '../controllers-catalyst/task.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Catalyst row ids are numeric; legacy Prisma ids are UUID. Accept either form.
const ID_PATTERN = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9]+)$/;

const createTaskValidation = [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('taskType')
    .isIn(['GRIEVANCE', 'TRAIN_REQUEST', 'TOUR_PROGRAM', 'GENERAL'])
    .withMessage('Valid task type is required'),
  body('assignedToId').matches(ID_PATTERN).withMessage('Valid staff ID is required'),
  body('referenceId').optional().matches(ID_PATTERN).withMessage('Invalid reference ID'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be valid'),
];

const idParamValidation = [
  param('id').matches(ID_PATTERN).withMessage('Invalid task ID'),
];

const updateProgressValidation = [
  body('status')
    .optional()
    .isIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'])
    .withMessage('Valid status required'),
  body('progressNotes').optional().trim(),
  body('progressPercent')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Progress must be 0-100'),
];

const updateStatusValidation = [
  body('status')
    .isIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'])
    .withMessage('Valid status required'),
];

router.use(authenticate);

// Staff routes
router.get('/my-tasks', staffOnly, getMyTasks);
router.get('/:id/history', staffOnly, validate(idParamValidation), getTaskHistory);
router.patch(
  '/:id/progress',
  staffOnly,
  validate([...idParamValidation, ...updateProgressValidation]),
  updateTaskProgress
);

// Admin routes
router.post('/', adminOnly, validate(createTaskValidation), createTask);
router.get('/tracking', adminOnly, getTaskTracking);
router.get('/staff', adminOnly, getStaffMembers);
router.patch(
  '/:id/status',
  adminOnly,
  validate([...idParamValidation, ...updateStatusValidation]),
  updateTaskStatus
);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteTask);

// Admin-only — full task list (staff use /my-tasks for their own tasks).
router.get('/', adminOnly, getTasks);
router.get('/:id', validate(idParamValidation), getTaskById);

export default router;
