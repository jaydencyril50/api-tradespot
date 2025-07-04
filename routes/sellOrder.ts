import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order';
import User from '../models/User';
import SellerModel from '../models/Sellermodel';
import { Request, Response } from 'express';

const router = express.Router();

// Middleware to authenticate user (reuse from main server)
function authenticateToken(req: any, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
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

// Create a new order (Sell Spot)
router.post('/sell-orders', authenticateToken, async (req: any, res: Response) => {
  try {
    const { sellerId, sellerUsername, price, spotAmount, usdtAmount } = req.body;
    const userId = req.user.userId;
    // Check user spot balance
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.spotBalance < spotAmount) {
      return res.status(400).json({ error: 'Insufficient SPOT balance' });
    }
    // Set auto-complete time: random 1-10 min from now
    const min = 1 * 60 * 1000, max = 10 * 60 * 1000;
    const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
    const autoCompleteAt = new Date(Date.now() + randomMs);
    const order = await Order.create({
      userId,
      sellerId,
      sellerUsername,
      price,
      spotAmount,
      usdtAmount,
      status: 'pending',
      autoCompleteAt,
      type: 'sell',
    });
    res.json({ order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Complete a sell order (simulate payment, update balances)
router.patch('/sell-orders/:orderId/complete', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId, type: 'sell' });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order already completed or cancelled' });
    if (order.autoCompleteAt && new Date() < order.autoCompleteAt) {
      return res.status(400).json({ error: 'Order cannot be completed yet. Please wait.' });
    }
    // Update user balances
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.spotBalance < order.spotAmount) {
      return res.status(400).json({ error: 'Insufficient SPOT balance' });
    }
    user.spotBalance -= order.spotAmount;
    user.usdtBalance += order.usdtAmount;
    user.recentTransactions = user.recentTransactions || [];
    // Use sellerUsername if present, else fallback to empty string
    user.recentTransactions.push({
      type: 'P2P Sell',
      amount: order.spotAmount,
      currency: 'SPOT',
      date: new Date(),
      note: `Sold to ${order.sellerUsername || ''}`
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

// Cancel a sell order (user-initiated, only if pending)
router.patch('/sell-orders/:orderId/cancel', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId, type: 'sell' });
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
