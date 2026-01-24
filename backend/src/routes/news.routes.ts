import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createNews,
  getNews,
  getNewsById,
  updateNews,
  deleteNews,
  getCriticalAlerts,
} from '../controllers/news.controller';
import { authenticate, staffOnly, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Validation rules
const createNewsValidation = [
  body('headline').trim().notEmpty().withMessage('Headline is required'),
  body('category')
    .isIn(['DEVELOPMENT_WORK', 'CONSPIRACY_FAKE_NEWS', 'LEADER_ACTIVITY', 'PARTY_ACTIVITY', 'OPPOSITION', 'OTHER'])
    .withMessage('Valid category is required'),
  body('priority')
    .optional()
    .isIn(['NORMAL', 'HIGH', 'CRITICAL'])
    .withMessage('Invalid priority level'),
  body('mediaSource').trim().notEmpty().withMessage('Media source is required'),
  body('region').trim().notEmpty().withMessage('Region is required'),
];

const idParamValidation = [
  param('id').isUUID().withMessage('Invalid news ID'),
];

// All routes require authentication
router.use(authenticate);

// Staff can create news
router.post('/', staffOnly, validate(createNewsValidation), createNews);

// Get all news
router.get('/', getNews);

// Get critical alerts
router.get('/alerts/critical', getCriticalAlerts);

// Get single news
router.get('/:id', validate(idParamValidation), getNewsById);

// Update news
router.put('/:id', validate(idParamValidation), updateNews);

// Delete news (admin only)
router.delete('/:id', adminOnly, validate(idParamValidation), deleteNews);

export default router;
