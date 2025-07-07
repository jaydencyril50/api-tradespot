import express from 'express';
import Message from '../models/Message';
import User from '../models/User';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// Helper to emit socket events
function emitMessage(io, recipientId, message) {
  if (io && recipientId) {
    io.to(recipientId.toString()).emit('new_message', message);
  }
}

// USER: Send message to admin
router.post('/user/send', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content required' });
    // Find admin user (assuming first admin found)
    const admin = await User.findOne({ isAdmin: true });
    if (!admin) return res.status(500).json({ error: 'Admin not found' });
    const msg = await Message.create({
      sender: userId,
      recipient: admin._id,
      fromAdmin: false,
      content
    });
    // Emit to admin (if online)
    emitMessage(req.app.get('io'), admin._id, msg);
    res.json({ message: 'Message sent', msg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// USER: Get chat history with admin
router.get('/user/history', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const admin = await User.findOne({ isAdmin: true });
    if (!admin) return res.status(500).json({ error: 'Admin not found' });
    const history = await Message.find({
      $or: [
        { sender: userId, recipient: admin._id },
        { sender: admin._id, recipient: userId }
      ]
    }).sort({ timestamp: 1 });
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ADMIN: List users who have messaged
router.get('/admin/users', authenticateToken, async (req, res) => {
  try {
    // Only admin can access
    const adminId = (req as any).user.userId;
    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    // Find unique user IDs who have messaged admin
    const userIds = await Message.distinct('sender', { fromAdmin: false });
    const users = await User.find({ _id: { $in: userIds } }, 'email fullName');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ADMIN: Get chat history with a user
router.get('/admin/history/:userId', authenticateToken, async (req, res) => {
  try {
    const adminId = (req as any).user.userId;
    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { userId } = req.params;
    const history = await Message.find({
      $or: [
        { sender: userId, recipient: adminId },
        { sender: adminId, recipient: userId }
      ]
    }).sort({ timestamp: 1 });
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ADMIN: Send message to a user
router.post('/admin/send/:userId', authenticateToken, async (req, res) => {
  try {
    const adminId = (req as any).user.userId;
    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { userId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content required' });
    const msg = await Message.create({
      sender: adminId,
      recipient: userId,
      fromAdmin: true,
      content
    });
    // Emit to user (if online)
    emitMessage(req.app.get('io'), userId, msg);
    res.json({ message: 'Message sent', msg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
