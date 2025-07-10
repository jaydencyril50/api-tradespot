const mongoose = require('mongoose');

const FlexDropLinkSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  claimedBy: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      amount: Number,
      claimedAt: Date
    }
  ],
  linkId: { type: String, required: true, unique: true },
  maxClaims: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FlexDropLink', FlexDropLinkSchema);
