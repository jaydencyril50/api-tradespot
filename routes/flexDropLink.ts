const express = require('express');
const router = express.Router();
const FlexDropLink = require('../models/FlexDropLink');
const User = require('../models/User').default;
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middleware/authenticateToken').default;

// Admin creates a flex drop link
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { minAmount, maxAmount, expiresAt, maxClaims } = req.body;
    if (!minAmount || !maxAmount || !expiresAt || !maxClaims) {
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
      maxClaims,
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
    if (!Array.isArray(flexDrop.claimedBy)) {
      flexDrop.claimedBy = [];
    }
    if (flexDrop.claimedBy.some(c => c.user.toString() === req.user.userId)) {
      return res.status(403).json({ message: 'Already claimed.' });
    }
    if (flexDrop.claimedBy.length >= flexDrop.maxClaims) {
      return res.status(410).json({ message: 'Max claims reached.' });
    }
    // Generate random amount
    const amount = Math.floor(Math.random() * (flexDrop.maxAmount - flexDrop.minAmount + 1)) + flexDrop.minAmount;
    flexDrop.claimedBy.push({ user: req.user.userId, amount, claimedAt: new Date() });
    await flexDrop.save();
    // Credit user flexBalance
    await User.findByIdAndUpdate(
      req.user.userId,
      { $inc: { flexBalance: amount } }
    );
    // Log transaction in user's history
    const user = await User.findById(req.user.userId);
    if (user) {
      user.recentTransactions = user.recentTransactions || [];
      user.recentTransactions.push({
        type: 'FlexDrop',
        amount,
        currency: 'FLEX',
        date: new Date(),
        note: `Claimed FlexDrop link ${linkId}`
      });
      await user.save();
    }
    res.json({ amount });
  } catch (err) {
    console.error('FlexDrop claim error:', {
      message: err.message,
      stack: err.stack,
      user: req.user,
      linkId: req.params.linkId
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Admin expires a flex drop link
router.post('/expire/:linkId', authenticateToken, async (req, res) => {
  try {
    const { linkId } = req.params;
    const flexDrop = await FlexDropLink.findOne({ linkId });
    if (!flexDrop) return res.status(404).json({ message: 'Link not found.' });
    // Only the admin who created the link can expire it
    if (flexDrop.admin.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to expire this link.' });
    }
    flexDrop.expiresAt = new Date();
    await flexDrop.save();
    res.json({ message: 'FlexDrop link expired successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all flex drop links for admin
router.get('/admin-links', authenticateToken, async (req, res) => {
  try {
    // Only allow admin users
    const adminId = req.user.userId;
    // Find all links created by this admin
    const links = await FlexDropLink.find({ admin: adminId });
    res.json({ links });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
