import mongoose, { Schema, Document } from 'mongoose';

export interface IAwardTableRow extends Document {
  category: string;
  team: string;
  reward: string;
}

const AwardTableRowSchema: Schema = new Schema({
  category: { type: String, required: true },
  team: { type: String, required: true },
  reward: { type: String, required: true },
});

export default mongoose.model<IAwardTableRow>('AwardTableRow', AwardTableRowSchema);
