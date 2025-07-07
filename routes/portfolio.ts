import express from 'express';
import authenticateToken from '../middleware/authenticateToken';
import User from '../models/User';

const router = express.Router();

// Add this at the top of your portfolio.ts routes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Return relevant portfolio data
    res.json({
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      wallet: user.wallet,
      usdtBalance: user.usdtBalance,
      spotBalance: user.spotBalance,
      flexBalance: user.flexBalance,
      vipLevel: user.vipLevel,
      recentTransactions: user.recentTransactions ? user.recentTransactions.slice(-5).reverse() : [],
      profilePicture: user.profilePicture,
      fundsLocked: user.fundsLocked,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// POST /api/portfolio/flex-profit
router.post('/flex-profit', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).user?.userId;
    const { profit } = req.body;
    if (!userId || typeof profit !== 'number' || profit <= 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Prevent activation if spot balance is not below 0.02
    if ((user.spotBalance ?? 0) >= 0.02) {
      return res.status(403).json({ error: 'SPOT balance must be below 0.02 to activate FLEX profit.' });
    }
    // Check if already activated
    if (user.flexProfitActive) {
      return res.status(409).json({ error: 'FLEX profit activation already in progress.' });
    }
    // Mark as activated and record USDT balance
    user.flexProfitActive = true;
    user.flexProfitUsdtRecord = user.usdtBalance ?? 0;
    await user.save();
    return res.json({ success: true, activated: true, usdtRecord: user.flexProfitUsdtRecord });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/portfolio/flex-profit-complete
router.post('/flex-profit-complete', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).user?.userId;
    const { profit } = req.body;
    if (!userId || typeof profit !== 'number' || profit <= 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.flexProfitActive) {
      return res.status(400).json({ error: 'FLEX profit activation not in progress.' });
    }
    // Credit FLEX balance and debit USDT
    user.flexBalance = (user.flexBalance || 0) + profit;
    user.usdtBalance = (user.usdtBalance || 0) - profit;
    user.flexProfitActive = false;
    user.flexProfitUsdtRecord = 0;
    await user.save();
    return res.json({ success: true, flexBalance: user.flexBalance, usdtBalance: user.usdtBalance });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/portfolio/flex-profit-activate
router.post('/flex-profit-activate', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if ((user.spotBalance ?? 0) >= 0.02) {
      return res.status(403).json({ error: 'SPOT balance must be below 0.02 to activate FLEX profit.' });
    }
    if (user.flexProfitActive) {
      return res.status(409).json({ error: 'FLEX profit activation already in progress.' });
    }
    user.flexProfitActive = true;
    user.flexProfitUsdtRecord = user.usdtBalance ?? 0;
    await user.save();
    return res.json({ success: true, activated: true, usdtRecord: user.flexProfitUsdtRecord });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/portfolio/flex-profit-cancel
router.post('/flex-profit-cancel', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.flexProfitActive = false;
    user.flexProfitUsdtRecord = 0;
    await user.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/portfolio/flex-profit-status
router.get('/flex-profit-status', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).user?.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ active: !!user.flexProfitActive, usdtRecord: user.flexProfitUsdtRecord ?? 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// Debug route to confirm router is mounted
router.get('/debug', (req, res) => {
  console.log('✅ HIT /api/portfolio/debug');
  res.json({ status: 'portfolio router mounted and working 🎯' });
});

// --- BACKGROUND PROFIT MONITOR ---
// This function should be called periodically (e.g. every minute) by a cron job or setInterval in server entry
export const monitorFlexProfit = async () => {
  const users = await User.find({ flexProfitActive: true });
  for (const user of users) {
    if (typeof user.flexProfitUsdtRecord !== 'number') continue;
    const currentUSDT = user.usdtBalance ?? 0;
    if (currentUSDT > user.flexProfitUsdtRecord) {
      const profit = +(currentUSDT - user.flexProfitUsdtRecord).toFixed(2);
      user.flexBalance = (user.flexBalance || 0) + profit;
      user.usdtBalance = (user.usdtBalance || 0) - profit; // Deduct USDT when crediting FLEX
      user.flexProfitActive = false;
      user.flexProfitUsdtRecord = 0;
      await user.save();
      // Optionally: log transaction, notify user, etc.
    }
  }
};

export default router;
