import { Router } from 'express';
import authRoutes from './auth.routes';
import grievanceRoutes from './grievance.routes';
import visitorRoutes from './visitor.routes';
import newsRoutes from './news.routes';
import trainRequestRoutes from './trainRequest.routes';
import tourProgramRoutes from './tourProgram.routes';
import statsRoutes from './stats.routes';
import pdfRoutes from './pdf.routes';
import birthdayRoutes from './birthday.routes';
import historyRoutes from './history.routes';
import taskRoutes from './task.routes';
import googleRoutes from './google.routes';
import uploadRoutes from './upload.routes';
import notificationRoutes from './notification.routes';
import attendanceRoutes from './attendance.routes';
import meetingRoutes from './meeting.routes';
import activityRoutes from './activity.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'OMS API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/grievances', grievanceRoutes);
router.use('/visitors', visitorRoutes);
router.use('/news', newsRoutes);
router.use('/train-requests', trainRequestRoutes);
router.use('/tour-programs', tourProgramRoutes);
router.use('/stats', statsRoutes);
router.use('/pdf', pdfRoutes);
router.use('/birthdays', birthdayRoutes);
router.use('/history', historyRoutes);
router.use('/tasks', taskRoutes);
router.use('/google', googleRoutes);
router.use('/uploads', uploadRoutes);
router.use('/notifications', notificationRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/meetings', meetingRoutes);
router.use('/activity', activityRoutes);

export default router;
