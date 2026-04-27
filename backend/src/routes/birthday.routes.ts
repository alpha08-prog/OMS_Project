import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/birthday.controller';
import * as catalystCtrl from '../controllers-catalyst/birthday.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/** Dispatcher: same pattern as visitor / grievance / task / train / tour / news. */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('birthday')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

const createBirthdayValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
  body('dob').notEmpty().isISO8601().withMessage('Date of birth is required and must be a valid date'),
  body('relation').trim().notEmpty().withMessage('Relation/Category is required'),
  body('notes').optional().trim(),
];

// Catalyst uses numeric ROWIDs; Prisma uses UUIDs.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid birthday ID'),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createBirthdayValidation), dispatch('createBirthday'));
router.get('/', dispatch('getBirthdays'));
router.get('/today', dispatch('getTodayBirthdays'));
router.get('/upcoming', dispatch('getUpcomingBirthdays'));
router.get('/:id', validate(idParamValidation), dispatch('getBirthdayById'));
router.put('/:id', validate(idParamValidation), dispatch('updateBirthday'));
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteBirthday'));

export default router;
