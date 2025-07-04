import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The user placing the order
  buyerId: { type: String, required: true }, // The fake buyer's userId
  buyerUsername: { type: String, required: true },
  price: { type: Number, required: true },
  spotAmount: { type: Number, required: true },
  usdtAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  // Add autoCompleteAt field for backend timing
  autoCompleteAt: { type: Date },
});

export default mongoose.model('Order', orderSchema);