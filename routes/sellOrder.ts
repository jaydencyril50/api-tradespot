import express, { Response } from 'express';
import Order from '../models/Order';
import User from '../models/User';

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

// Create a new sell order (user gives spot, receives USDT)
router.post('/sell-orders', authenticateToken, async (req: any, res: Response) => {
  try {
    const { buyerId, buyerUsername, price, spotAmount, usdtAmount } = req.body;
    const sellerId = req.user.userId;
    // Check seller's spot balance
    const seller = await User.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'User not found' });
    if (seller.spotBalance < spotAmount) {
      return res.status(400).json({ error: 'Insufficient SPOT balance' });
    }
    // Set auto-complete time: random 1-10 min from now
    const min = 1 * 60 * 1000, max = 10 * 60 * 1000;
    const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
    const autoCompleteAt = new Date(Date.now() + randomMs);
    const order = await Order.create({
      userId: sellerId,
      buyerId,
      buyerUsername,
      sellerId,
      sellerUsername: seller.username,
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

// Complete a sell order (user gives spot, receives USDT)
router.patch('/sell-orders/:orderId/complete', authenticateToken, async (req: any, res: Response) => {
  try {
    const sellerId = req.user.userId;
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId: sellerId, type: 'sell' });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order already completed or cancelled' });
    if (order.autoCompleteAt && new Date() < order.autoCompleteAt) {
      return res.status(400).json({ error: 'Order cannot be completed yet. Please wait.' });
    }
    // Update seller balances
    const seller = await User.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'User not found' });
    if (seller.spotBalance < order.spotAmount) {
      return res.status(400).json({ error: 'Insufficient SPOT balance' });
    }
    seller.spotBalance -= order.spotAmount;
    seller.usdtBalance += order.usdtAmount;
    seller.recentTransactions = seller.recentTransactions || [];
    seller.recentTransactions.push({
      type: 'P2P Sell',
      amount: order.spotAmount,
      currency: 'SPOT',
      date: new Date(),
      note: `Sold SPOT to ${order.buyerUsername || ''} for USDT`
    });
    await seller.save();
    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();
    res.json({ order, usdtBalance: seller.usdtBalance, spotBalance: seller.spotBalance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a sell order (user-initiated, only if pending)
router.patch('/sell-orders/:orderId/cancel', authenticateToken, async (req: any, res: Response) => {
  try {
    const sellerId = req.user.userId;
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId: sellerId, type: 'sell' });
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
