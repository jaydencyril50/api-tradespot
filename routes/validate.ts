import express from 'express';
import User from '../models/User';

const router = express.Router();

// POST /api/validate-spotid
router.post('/validate-spotid', async (req, res) => {
  const { spotid } = req.body;
  if (!spotid) return res.json({ valid: false });
  try {
    // Assuming spotid is stored as 'spotid' or '_id' in User
    const user = await User.findOne({ spotid });
    res.json({ valid: !!user });
  } catch (e) {
    res.json({ valid: false });
  }
});

// POST /api/validate-password-code
router.post('/validate-password-code', async (req, res) => {
  const { code, spotid } = req.body;
  if (!code || !spotid) return res.json({ valid: false });
  try {
    // Find user by spotid
    const user = await User.findOne({ spotid });
    if (!user) return res.json({ valid: false });
    // Assume user.passwordResetCode is set when code is sent
    if (user.passwordResetCode && user.passwordResetCode === code) {
      return res.json({ valid: true });
    }
    res.json({ valid: false });
  } catch (e) {
    res.json({ valid: false });
  }
});

// GET /api/validate-user-valid-member/:id
router.get('/validate-user-valid-member/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ valid: false, error: 'User not found' });
    res.json({ valid: true, validMember: !!user.validMember });
  } catch (e) {
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

export default router;
