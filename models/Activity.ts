// This model will store admin-auditable activities for the platform
import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({
  type: { type: String, required: true }, // e.g. USER_SIGNUP, WITHDRAWAL_SUBMITTED, DEPOSIT, USER_UPDATE
  user: {
    fullName: String,
    email: String,
    spotid: String,
    _id: mongoose.Schema.Types.ObjectId,
  },
  details: mongoose.Schema.Types.Mixed, // Any extra info
  createdAt: { type: Date, default: Date.now },
});

const Activity = mongoose.model('Activity', ActivitySchema);
export default Activity;
