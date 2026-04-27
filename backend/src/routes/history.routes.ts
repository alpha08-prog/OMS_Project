import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import {
  getAdminHistory,
  getHistoryStats,
} from '../controllers-catalyst/history.controller';

const router = Router();

router.use(authenticate);
router.use(adminOnly);

router.get('/', getAdminHistory);
router.get('/stats', getHistoryStats);

export default router;
