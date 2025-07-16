import express, { Request, Response } from 'express';
import authenticateToken from '../middleware/authenticateToken';
import User from '../models/User';

const router = express.Router();

// GET /api/bot-settings - Get logged-in user's bot settings
router.get('/bot-settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Return bot settings (customize fields as needed)
    res.json({
      botEnabled: user.botEnabled || false,
      botDailyOrderAmount: user.botDailyOrderAmount || 0,
      botOrderType: user.botOrderType || 'buy',
      botRunTime: user.botRunTime || '09:00',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bot settings' });
  }
});

// GET /api/bot/vip-level - Get logged-in user's VIP level
router.get('/vip-level', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ vipLevel: user.vipLevel || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch VIP level' });
  }
});

export default router;
