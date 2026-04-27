import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/visitor.controller';
import * as catalystCtrl from '../controllers-catalyst/visitor.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Dispatcher — routes the request to either Prisma or Catalyst implementation
 * based on USE_CATALYST_VISITOR (or master USE_CATALYST) feature flag.
 *
 * The flag is read on every request, so flipping it in .env + restarting the
 * server is enough to switch backends. No code changes needed to roll back.
 */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('visitor')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Validation rules
const createVisitorValidation = [
  body('name').trim().notEmpty().withMessage('Visitor name is required'),
  body('designation').trim().notEmpty().withMessage('Designation is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('dob').optional().isISO8601().withMessage('Date of birth must be a valid date'),
  body('purpose').trim().notEmpty().withMessage('Purpose of visit is required'),
];

// Catalyst uses numeric ROWIDs, Prisma uses UUIDs.
// Accept either form so the route works under both backends.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid visitor ID'),
];

const dateParamValidation = [
  param('date').isISO8601().withMessage('Invalid date format'),
];

// All routes require authentication
router.use(authenticate);

// Staff can create visitors
router.post('/', staffOnly, validate(createVisitorValidation), dispatch('createVisitor'));

// Get all visitors
router.get('/', dispatch('getVisitors'));

// Get today's birthdays
router.get('/birthdays/today', dispatch('getTodayBirthdays'));

// Get visitors by date
router.get('/date/:date', validate(dateParamValidation), dispatch('getVisitorsByDate'));

// Get single visitor
router.get('/:id', validate(idParamValidation), dispatch('getVisitorById'));

// Update visitor
router.put('/:id', validate(idParamValidation), dispatch('updateVisitor'));

// Delete visitor (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteVisitor'));

export default router;
