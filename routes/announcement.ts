import express, { Request, Response } from 'express';
import Announcement from '../models/Announcement';

const router = express.Router();

// GET announcement
router.get('/', async (req: Request, res: Response) => {
  try {
    let announcement = await Announcement.findOne();
    if (!announcement) {
      announcement = await Announcement.create({ notice: '' });
    }
    res.json({ notice: announcement.notice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// POST announcement
router.post('/', async (req: Request, res: Response) => {
  const { notice } = req.body;
  try {
    let announcement = await Announcement.findOne();
    if (!announcement) {
      announcement = await Announcement.create({ notice });
    } else {
      announcement.notice = notice;
      announcement.updatedAt = new Date();
      await announcement.save();
    }
    res.json({ message: 'Announcement updated', notice: announcement.notice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

export default router;
