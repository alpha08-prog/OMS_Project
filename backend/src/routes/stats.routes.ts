import { Router } from 'express';
import {
  getDashboardSummary,
  getGrievancesByType,
  getGrievancesByStatus,
  getGrievancesByConstituency,
  getMonthlyGrievanceTrends,
  getMonetizationSummary,
  getRecentActivity,
} from '../controllers/stats.controller';
import { authenticate, adminOnly, superAdminOnly } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Dashboard summary - available to admin and super admin
router.get('/summary', adminOnly, getDashboardSummary);

// Grievance statistics
router.get('/grievances/by-type', adminOnly, getGrievancesByType);
router.get('/grievances/by-status', adminOnly, getGrievancesByStatus);
router.get('/grievances/by-constituency', adminOnly, getGrievancesByConstituency);
router.get('/grievances/monthly', adminOnly, getMonthlyGrievanceTrends);

// Monetization/CSR statistics (Super Admin only)
router.get('/monetization', superAdminOnly, getMonetizationSummary);

// Recent activity
router.get('/recent-activity', adminOnly, getRecentActivity);

export default router;
