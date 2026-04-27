import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/task.controller';
import * as catalystCtrl from '../controllers-catalyst/task.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/** Dispatcher: same pattern as visitor.routes.ts and grievance.routes.ts. */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('task')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Validation rules
const createTaskValidation = [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('taskType')
    .isIn(['GRIEVANCE', 'TRAIN_REQUEST', 'TOUR_PROGRAM', 'GENERAL'])
    .withMessage('Valid task type is required'),
  body('assignedToId').isUUID().withMessage('Valid staff ID is required'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be valid'),
];

// Catalyst tasks have numeric ROWIDs; Prisma tasks have UUIDs. Accept both.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid task ID'),
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

// All routes require authentication
router.use(authenticate);

// Staff routes
router.get('/my-tasks', staffOnly, dispatch('getMyTasks'));
router.get(
  '/:id/history',
  staffOnly,
  validate(idParamValidation),
  dispatch('getTaskHistory')
);
router.patch(
  '/:id/progress',
  staffOnly,
  validate([...idParamValidation, ...updateProgressValidation]),
  dispatch('updateTaskProgress')
);

// Admin routes
router.post('/', adminOnly, validate(createTaskValidation), dispatch('createTask'));
router.get('/tracking', adminOnly, dispatch('getTaskTracking'));
router.get('/staff', adminOnly, dispatch('getStaffMembers'));
router.patch(
  '/:id/status',
  adminOnly,
  validate([...idParamValidation, ...updateStatusValidation]),
  dispatch('updateTaskStatus')
);
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteTask'));

// Shared
router.get('/', dispatch('getTasks'));
router.get('/:id', validate(idParamValidation), dispatch('getTaskById'));

export default router;
