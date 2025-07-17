import mongoose, { Document, Schema } from 'mongoose';

export interface IBot extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  tradeLimit: number;
  commissionPercent: number;
  strategy: string; // e.g., 'basic', 'vip', etc.
  rules?: {
    minTrade?: number;
    maxTrade?: number;
    [key: string]: any;
  }; // JSON or object for custom rules
  createdAt: Date;
  updatedAt: Date;
}

const BotSchema = new Schema<IBot>({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  tradeLimit: { type: Number, required: true },
  commissionPercent: { type: Number, required: true },
  strategy: { type: String, required: true },
  rules: {
    type: Schema.Types.Mixed,
    default: () => ({})
  },
}, { timestamps: true });

export default mongoose.model<IBot>('Bot', BotSchema);
