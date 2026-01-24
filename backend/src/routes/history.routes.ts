import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import { getAdminHistory, getHistoryStats } from '../controllers/history.controller';

const router = Router();

// All history routes require authentication and admin+ role
router.use(authenticate);
router.use(adminOnly);

// GET /api/history - Get all admin action history
// Query params: type (GRIEVANCE, TRAIN_REQUEST, TOUR_PROGRAM), action, startDate, endDate, page, limit
router.get('/', getAdminHistory);

// GET /api/history/stats - Get history statistics
router.get('/stats', getHistoryStats);

export default router;
