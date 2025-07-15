import express, { Request, Response } from 'express';
import Reward from '../models/Reward';
import AwardTableRow from '../models/AwardTableRow';

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

// Get all award table rows
router.get('/award-table', async (_req, res) => {
  try {
    const rows = await AwardTableRow.find();
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save or update an award table row by category
router.post('/award-table', async (req, res) => {
  const { category, team, reward } = req.body;
  if (!category || !team || !reward) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    // Update if category exists, else create
    const row = await AwardTableRow.findOneAndUpdate(
      { category },
      { team, reward },
      { new: true, upsert: true }
    );
    res.json({ row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
