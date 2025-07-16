import express, { Request, Response } from 'express';
import authenticateToken from '../middleware/authenticateToken';
import User from '../models/User';

const router = express.Router();

// GET /api/bot - Get logged-in user's bot settings
router.get('/', authenticateToken, async (req: Request, res: Response) => {
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
      botType: user.botType || 'AlphaBot',
      botPercent: user.botPercent ?? 4,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bot settings' });
  }
});

// PUT /api/bot - Update logged-in user's bot settings
router.put('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { botEnabled, botDailyOrderAmount, botOrderType, botRunTime, botType, botPercent } = req.body;
    if (typeof botEnabled !== 'undefined') user.botEnabled = botEnabled;
    if (typeof botDailyOrderAmount !== 'undefined') user.botDailyOrderAmount = botDailyOrderAmount;
    if (typeof botOrderType !== 'undefined') user.botOrderType = botOrderType;
    if (typeof botRunTime !== 'undefined') user.botRunTime = botRunTime;
    if (typeof botType !== 'undefined') user.botType = botType;
    if (typeof botPercent !== 'undefined') user.botPercent = botPercent;
    await user.save();
    res.json({ message: 'Bot settings updated!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bot settings' });
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
