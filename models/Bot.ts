import mongoose, { Schema, Document } from 'mongoose';

export interface IBot extends Document {
  name: string;
  tradeLimit: number;
  commissionPercent: number;
  isActive: boolean;
  strategy: string;
  createdAt: Date;
  updatedAt: Date;
  description?: string;
  settings?: Record<string, any>;
}

const BotSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  tradeLimit: { type: Number, required: true },
  commissionPercent: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  strategy: { type: String, required: true },
  description: { type: String },
  settings: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

export default mongoose.model<IBot>('Bot', BotSchema);
