import express from 'express';
import User from '../models/User';

const router = express.Router();

router.post('/check-email-exists', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ exists: false, error: 'Invalid email' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    res.json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ exists: false, error: 'Server error' });
  }
});

export default router;
