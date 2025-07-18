import express, { Request, Response } from 'express';
import Bot from '../models/Bot';
import User from '../models/User';
import mongoose from 'mongoose';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// Get current user's bot subscriptions
router.get('/subscriptions', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ subscriptions: user.botSubscriptions || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bots
router.get('/bots', async (_req: Request, res: Response) => {
  try {
    const bots = await Bot.find({ isActive: true });
    res.json({ bots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Subscribe to a bot
router.post('/bots/:botId/subscribe', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { botId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch the bot to check tradeLimit
    const bot = await Bot.findById(botId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Check user's usdtBalance against bot's tradeLimit
    if (typeof user.usdtBalance !== 'number' || user.usdtBalance < bot.tradeLimit) {
      return res.status(400).json({ error: `Insufficient USDT balance. You need at least ${bot.tradeLimit} USDT to subscribe to this bot.` });
    }

    // 1. Prevent subscribing if already subscribed to another active bot
    const activeSub = (user.botSubscriptions || []).find((sub: any) => sub.isActive);
    if (activeSub && activeSub.botId.toString() !== botId) {
      return res.status(400).json({ error: 'You can only subscribe to one bot at a time. Please unsubscribe from your current bot first.' });
    }

    // 2. Prevent subscribing if a bot order has already been placed for the day
    const Order = require('../models/Order').default;
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const completedToday = await Order.findOne({
      userId: user._id,
      botId: new mongoose.Types.ObjectId(botId),
      type: { $in: [null, 'buy'] },
      status: 'completed',
      completedAt: { $gte: startOfDay, $lte: endOfDay }
    });
    if (completedToday) {
      return res.status(400).json({ error: 'You have already placed a bot order for today. Please try again tomorrow.' });
    }

    const existing = user.botSubscriptions?.find((sub: any) => sub.botId.toString() === botId);
    if (existing) {
      existing.isActive = true;
      existing.subscribedAt = new Date();
    } else {
      user.botSubscriptions = user.botSubscriptions || [];
      user.botSubscriptions.push({ botId: new mongoose.Types.ObjectId(botId), isActive: true, subscribedAt: new Date() });
    }
    await user.save();
    res.json({ message: 'Subscribed to bot successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unsubscribe from a bot
router.post('/bots/:botId/unsubscribe', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { botId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const existing = user.botSubscriptions?.find((sub: any) => sub.botId.toString() === botId);
    if (existing) {
      existing.isActive = false;
      await user.save();
      return res.json({ message: 'Unsubscribed from bot successfully' });
    }
    res.status(400).json({ error: 'Not subscribed to this bot' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
