import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order';
import User from '../models/User';
import { Request, Response } from 'express';

const router = express.Router();

// Middleware to authenticate user (reuse from main server)
function authenticateToken(req: any, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  // Use the same JWT_SECRET as in your main server file
  const JWT_SECRET = process.env.JWT_SECRET || '';
  require('jsonwebtoken').verify(token, JWT_SECRET, async (err: any, payload: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    const user = await User.findById(payload.userId);
    if (!user || !user.sessions || !user.sessions.some((s: any) => s.tokenId === payload.jti)) {
      return res.status(401).json({ error: 'Session expired or invalidated' });
    }
    req.user = payload;
    next();
  });
}

// Create a new order (Buy Spot)
router.post('/orders', authenticateToken, async (req: any, res: Response) => {
  try {
    const { buyerId, buyerUsername, price, spotAmount, usdtAmount } = req.body;
    const userId = req.user.userId;
    // Restrict: Only 1 completed buy order per UTC day
    const now = new Date();
    const utcYear = now.getUTCFullYear();
    const utcMonth = now.getUTCMonth();
    const utcDate = now.getUTCDate();
    const startOfDayUTC = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0));
    const endOfDayUTC = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999));
    const completedToday = await Order.findOne({
      userId,
      type: { $in: [null, 'buy'] }, // legacy or explicit buy
      status: 'completed',
      completedAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
    });
    if (completedToday) {
      return res.status(400).json({ error: 'You can only complete 1 buy order per day (00:00 UTC - 23:59 UTC).' });
    }
    // Check user balance
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.usdtBalance < usdtAmount) {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }
    // Set display countdown: always 10 min from now
    const displayCountdownEndsAt = new Date(Date.now() + 10 * 60 * 1000);
    // Set auto-complete time: random 1-10 min from now
    const min = 1 * 60 * 1000, max = 10 * 60 * 1000;
    const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
    const autoCompleteAt = new Date(Date.now() + randomMs);
    const order = await Order.create({
      userId,
      buyerId,
      buyerUsername,
      price,
      spotAmount,
      usdtAmount,
      status: 'pending',
      displayCountdownEndsAt,
      autoCompleteAt,
    });
    res.json({ order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all orders for a user
router.get('/orders', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    // Always include displayCountdownEndsAt for frontend
    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Complete an order (simulate payment, update balances)
router.patch('/orders/:orderId/complete', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order already completed or cancelled' });
    // Only allow completion if autoCompleteAt has passed
    if (order.autoCompleteAt && new Date() < order.autoCompleteAt) {
      return res.status(400).json({ error: 'Order cannot be completed yet. Please wait.' });
    }
    // Update user balances
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.usdtBalance < order.usdtAmount) {
      return res.status(400).json({ error: 'Insufficient USDT balance' });
    }
    user.usdtBalance -= order.usdtAmount;
    user.spotBalance += order.spotAmount;
    user.recentTransactions = user.recentTransactions || [];
    user.recentTransactions.push({
      type: 'P2P Buy',
      amount: order.spotAmount,
      currency: 'SPOT',
      date: new Date(),
      note: `Bought from ${order.buyerUsername}`
    });
    await user.save();
    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();
    res.json({ order, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel an order (user-initiated, only if pending)
router.patch('/orders/:orderId/cancel', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order already completed or cancelled' });
    order.status = 'cancelled';
    order.completedAt = new Date();
    await order.save();
    res.json({ order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
