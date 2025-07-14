import mongoose from 'mongoose';

const rewardSchema = new mongoose.Schema({
  index: { type: Number, required: true, unique: true }, // 0-based index
  value: { type: String, required: true, maxlength: 7 }, // digits only
  colorRow: { type: String, required: true }, // e.g. 'dark-yellow', 'light-yellow', etc.
  updatedAt: { type: Date, default: Date.now }
});

const Reward = mongoose.model('Reward', rewardSchema);
export default Reward;
