const express = require('express');
const router = express.Router();
const FlexDropLink = require('../models/FlexDropLink');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middleware/authenticateToken').default;

// Admin creates a flex drop link
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { minAmount, maxAmount, expiresAt } = req.body;
    if (!minAmount || !maxAmount || !expiresAt) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (minAmount > maxAmount) {
      return res.status(400).json({ message: 'minAmount cannot be greater than maxAmount.' });
    }
    const linkId = uuidv4();
    const flexDrop = await FlexDropLink.create({
      admin: req.user.userId, // FIXED: use userId from JWT payload
      minAmount,
      maxAmount,
      expiresAt,
      linkId
    });
    res.json({ linkId, flexDrop });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// User claims from a flex drop link
router.post('/claim/:linkId', authenticateToken, async (req, res) => {
  try {
    const { linkId } = req.params;
    const flexDrop = await FlexDropLink.findOne({ linkId });
    if (!flexDrop) return res.status(404).json({ message: 'Link not found.' });
    if (new Date() > flexDrop.expiresAt) return res.status(410).json({ message: 'Link expired.' });
    if (flexDrop.claimedBy.some(c => c.user.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Already claimed.' });
    }
    // Generate random amount
    const amount = Math.floor(Math.random() * (flexDrop.maxAmount - flexDrop.minAmount + 1)) + flexDrop.minAmount;
    flexDrop.claimedBy.push({ user: req.user.id, amount, claimedAt: new Date() });
    await flexDrop.save();
    // Credit user flexBalance
    await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { flexBalance: amount } }
    );
    res.json({ amount });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
