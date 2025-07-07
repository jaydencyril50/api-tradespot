import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The user placing the order
  buyerId: { type: String, required: true }, // The fake buyer's userId
  buyerUsername: { type: String, required: true },
  sellerId: { type: String }, // Optional, for sell orders
  sellerUsername: { type: String }, // Optional, for sell orders
  price: { type: Number, required: true },
  spotAmount: { type: Number, required: true },
  usdtAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  // --- Countdown fields ---
  displayCountdownEndsAt: { type: Date }, // Always 10 min from creation
  autoCompleteAt: { type: Date }, // Random 1-10 min from creation
  type: { type: String, enum: ['buy', 'sell'], default: 'buy' }, // Add type to distinguish order direction
});

export default mongoose.model('Order', orderSchema);