import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

export default function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'OPTIONS') return next(); // Skip auth for preflight

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    jwt.verify(token, JWT_SECRET, async (err: any, payload: any) => {
        if (err) {
            res.status(403).json({ error: 'Invalid token' });
            return;
        }
        // Check if token is in user's active sessions
        const user = await User.findById(payload.userId);
        if (!user || !user.sessions || !user.sessions.some((s: any) => s.tokenId === payload.jti)) {
            res.status(401).json({ error: 'Session expired or invalidated' });
            return;
        }
        (req as any).user = payload;
        next();
    });
}
