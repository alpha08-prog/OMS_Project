import { Router } from 'express';
import {
  getDashboardSummary,
  getGrievancesByType,
  getGrievancesByStatus,
  getGrievancesByConstituency,
  getMonthlyGrievanceTrends,
  getMonetizationSummary,
  getRecentActivity,
} from '../controllers-catalyst/stats.controller';
import { authenticate, adminOnly, superAdminOnly } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/summary', adminOnly, getDashboardSummary);
router.get('/grievances/by-type', adminOnly, getGrievancesByType);
router.get('/grievances/by-status', adminOnly, getGrievancesByStatus);
router.get('/grievances/by-constituency', adminOnly, getGrievancesByConstituency);
router.get('/grievances/monthly', adminOnly, getMonthlyGrievanceTrends);
router.get('/monetization', superAdminOnly, getMonetizationSummary);
router.get('/recent-activity', adminOnly, getRecentActivity);

export default router;
