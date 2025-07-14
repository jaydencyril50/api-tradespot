import express, { Request, Response } from 'express';
import Reward from '../models/Reward';

const router = express.Router();

// Save or update a reward value and color row
router.post('/reward', async (req: Request, res: Response) => {
  const { index, value, colorRow } = req.body;
  if (
    typeof index !== 'number' ||
    typeof value !== 'string' ||
    typeof colorRow !== 'string' ||
    !/^\d{1,7}$/.test(value)
  ) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  try {
    const reward = await Reward.findOneAndUpdate(
      { index },
      { value, colorRow, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, reward });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save reward' });
  }
});

// Get all rewards
router.get('/rewards', async (_req: Request, res: Response) => {
  try {
    const rewards = await Reward.find().sort({ index: 1 });
    res.json({ rewards });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rewards' });
  }
});

export default router;
