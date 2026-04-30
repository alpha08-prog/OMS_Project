import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../controllers-catalyst/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/', listMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markRead);
router.post('/read-all', markAllRead);

export default router;
