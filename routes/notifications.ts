import express, { Request, Response } from 'express';
import Notification from '../models/Notification';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// Apply authentication to all routes in this router
router.use(authenticateToken);

// GET /api/notifications - Get all notifications for the logged-in user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/mark-read - Mark all notifications as read for the logged-in user
router.patch('/mark-read', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

export default router;
