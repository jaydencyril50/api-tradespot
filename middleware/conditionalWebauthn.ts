import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import verifyWebauthn from './verifyWebauthn';

/**
 * Middleware to conditionally require WebAuthn for a given action based on user settings.
 * Usage: conditionalWebauthn('convert' | 'transfer' | 'withdraw')
 */
export default function conditionalWebauthn(action: 'convert' | 'transfer' | 'withdraw') {
  return async function (req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.webauthnSettings && user.webauthnSettings[action]) {
        // If enabled, run verifyWebauthn middleware
        // Call as a function, not as Express middleware stack
        // (req, res, next) signature
        return verifyWebauthn(req, res, next);
      } else {
        // Not required, continue
        return next();
      }
    } catch (e: any) {
      return res.status(500).json({ error: 'WebAuthn check error', details: e.message });
    }
  };
}
