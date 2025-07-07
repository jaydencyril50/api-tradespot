import express from 'express';
import authenticateToken from '../middleware/authenticateToken';
import User from '../models/User';

const router = express.Router();

// Get current user's WebAuthn settings
router.get('/settings', authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ webauthnSettings: user.webauthnSettings || {} });
});

// Update (toggle) WebAuthn for a specific action
router.post('/settings', authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { action, enabled } = req.body; // action: 'login' | 'transfer' | 'withdraw' | 'convert'
  if (!['login', 'transfer', 'withdraw', 'convert'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.webauthnSettings = user.webauthnSettings || {};
  user.webauthnSettings[action] = !!enabled;
  await user.save();
  res.json({ webauthnSettings: user.webauthnSettings });
});

export default router;
