import express, { Request, Response, NextFunction } from 'express';
import Chat from '../models/Chat';
import User from '../models/User';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}

// Fix: Extend AuthRequest to include headers and body as in Express.Request
interface AuthRequest extends express.Request {
  user?: any;
  headers: any;
  body: any;
}

// GET /api/chat - Fetch only the authenticated user's chat messages
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const chats = await Chat.find({ userEmail: user.email }).sort({ createdAt: 1 });
    res.json({ chats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// Middleware to authenticate and attach user to req
function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  jwt.verify(token, JWT_SECRET as string, (err: any, user: any) => {
    if (err) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    req.user = user;
    next();
  });
}

// POST /api/chat - Save a new chat message (only)
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const chat = new Chat({ userEmail: user.email, message });
    await chat.save();
    res.status(201).json({ success: true, chat });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save chat message' });
  }
});

export default router;
