import express, { Request, Response } from 'express';
import authenticateToken from '../middleware/authenticateToken';
import User from '../models/User';
import Bot from '../models/Bot';

const router = express.Router();

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

    // Save bot details to Bot model when enabled
    if (botEnabled) {
      // Find or create bot for user
      let botDoc = await Bot.findOne({ name: botType });
      if (!botDoc) {
        botDoc = new Bot({
          name: botType,
          tradeLimit: botDailyOrderAmount || 0,
          commissionPercent: botPercent ?? 4,
          isActive: true,
          strategy: botOrderType || 'buy',
          description: `Enabled by user ${userId}`,
          settings: {
            userId,
            vipLevel: user.vipLevel || '',
            runTime: botRunTime || '',
          },
        });
      } else {
        botDoc.tradeLimit = botDailyOrderAmount || botDoc.tradeLimit;
        botDoc.commissionPercent = botPercent ?? botDoc.commissionPercent;
        botDoc.isActive = true;
        botDoc.strategy = botOrderType || botDoc.strategy;
        botDoc.description = `Enabled by user ${userId}`;
        botDoc.settings = {
          userId,
          vipLevel: user.vipLevel || '',
          runTime: botRunTime || '',
        };
      }
      await botDoc.save();
    }
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
