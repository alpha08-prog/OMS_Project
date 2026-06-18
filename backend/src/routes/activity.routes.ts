import { Router } from 'express';
import { getActivityLog } from '../controllers-catalyst/activity.controller';
import { authenticate, adminOnly } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Global "who did what, when" feed — admin-only.
router.get('/', adminOnly, getActivityLog);

export default router;
