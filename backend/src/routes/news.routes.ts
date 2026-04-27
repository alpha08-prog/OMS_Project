import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import * as prismaCtrl from '../controllers/news.controller';
import * as catalystCtrl from '../controllers-catalyst/news.controller';
import { useCatalyst } from '../config/feature-flags';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/** Dispatcher: same pattern as visitor / grievance / task / train / tour. */
type CtrlMethod = keyof typeof prismaCtrl;

function dispatch(method: CtrlMethod) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impl = useCatalyst('news')
        ? (catalystCtrl as any)[method]
        : (prismaCtrl as any)[method];
      await impl(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

const createNewsValidation = [
  body('headline').trim().notEmpty().withMessage('Headline is required'),
  body('category')
    .isIn([
      'DEVELOPMENT_WORK',
      'CONSPIRACY_FAKE_NEWS',
      'LEADER_ACTIVITY',
      'PARTY_ACTIVITY',
      'OPPOSITION',
      'OTHER',
    ])
    .withMessage('Valid category is required'),
  body('priority')
    .optional()
    .isIn(['NORMAL', 'HIGH', 'CRITICAL'])
    .withMessage('Invalid priority level'),
  body('mediaSource').trim().notEmpty().withMessage('Media source is required'),
  body('region').trim().notEmpty().withMessage('Region is required'),
];

// Catalyst uses numeric ROWIDs; Prisma uses UUIDs.
const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid news ID'),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createNewsValidation), dispatch('createNews'));
router.get('/', dispatch('getNews'));
router.get('/alerts/critical', dispatch('getCriticalAlerts'));
router.get('/:id', validate(idParamValidation), dispatch('getNewsById'));
router.put('/:id', validate(idParamValidation), dispatch('updateNews'));
router.delete('/:id', adminOnly, validate(idParamValidation), dispatch('deleteNews'));

export default router;
