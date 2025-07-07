import express from 'express';
import Trash from '../models/Trash';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// Get all trash items
router.get('/', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const items = await Trash.find().sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trash items' });
  }
});

// Add a new trash item
router.post('/', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    const item = new Trash({ text });
    await item.save();
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save trash item' });
  }
});

export default router;
