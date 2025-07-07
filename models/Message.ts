import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // user or admin
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // always a user (admin is special)
  fromAdmin: { type: Boolean, default: false }, // true if sent by admin
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

export default mongoose.model('Message', messageSchema);
