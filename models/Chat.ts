import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  message: { type: String, required: true },
  imageUrl: { type: String }, // Optional, for image messages
  createdAt: { type: Date, default: Date.now }
});

// Use global to avoid OverwriteModelError in dev/hot-reload and production
const Chat = (global as any).Chat || mongoose.models.Chat || mongoose.model('Chat', chatSchema);
(global as any).Chat = Chat;
export default Chat;
