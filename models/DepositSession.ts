import mongoose from 'mongoose';

const depositSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  address: { type: String, required: true },
  txid: { type: String },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true });

const DepositSession = mongoose.model('DepositSession', depositSessionSchema);
export default DepositSession;
