import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IWithdrawal extends Document {
  userId: Types.ObjectId;
  spotid: string;
  wallet: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  spotid: { type: String, required: true },
  wallet: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ Fix ambiguity by casting manually
const Withdrawal: Model<IWithdrawal> = mongoose.models.Withdrawal as Model<IWithdrawal> || mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);
export default Withdrawal;
