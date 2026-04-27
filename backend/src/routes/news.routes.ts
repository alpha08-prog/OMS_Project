import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createNews,
  getNews,
  getNewsById,
  updateNews,
  deleteNews,
  getCriticalAlerts,
} from '../controllers-catalyst/news.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

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

const idParamValidation = [
  param('id')
    .matches(/^([0-9a-fA-F-]{36}|[0-9]+)$/)
    .withMessage('Invalid news ID'),
];

router.use(authenticate);

router.post('/', staffOnly, validate(createNewsValidation), createNews);
router.get('/', getNews);
router.get('/alerts/critical', getCriticalAlerts);
router.get('/:id', validate(idParamValidation), getNewsById);
router.put('/:id', validate(idParamValidation), updateNews);
router.delete('/:id', adminOnly, validate(idParamValidation), deleteNews);

export default router;
