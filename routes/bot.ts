import express, { Request, Response } from 'express';
import authenticateToken from '../middleware/authenticateToken';
import User from '../models/User';

const router = express.Router();

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
