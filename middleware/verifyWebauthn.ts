import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// You may want to move this to a shared config
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// In-memory challenge store (should match your main challenge store)
const challengeStore: Record<string, string> = {};

export default async function verifyWebauthn(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Get JWT from Authorization header
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      console.warn('[verifyWebauthn] No token');
      return res.status(401).json({ error: 'No token' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.warn('[verifyWebauthn] Invalid token');
      return res.status(401).json({ error: 'Invalid token' });
    }
    // 2. Verify JWT
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      console.warn('[verifyWebauthn] Invalid token (JWT verify failed)');
      return res.status(401).json({ error: 'Invalid token' });
    }
    // 3. Find user
    const user = await User.findById(payload.id);
    if (!user || !user.webauthnCredentials || user.webauthnCredentials.length === 0) {
      console.warn('[verifyWebauthn] No WebAuthn credentials for user:', payload.id);
      return res.status(403).json({ error: 'No WebAuthn credentials' });
    }
    // 4. Get assertion from request
    const assertionResp = req.body.assertionResp;
    if (!assertionResp) {
      console.warn('[verifyWebauthn] Missing assertion response');
      return res.status(400).json({ error: 'Missing assertion response' });
    }
    // 5. Get expected challenge
    const expectedChallenge = challengeStore[user._id];
    if (!expectedChallenge) {
      console.warn('[verifyWebauthn] No challenge found for user:', user._id);
      return res.status(400).json({ error: 'No challenge found' });
    }
    // 6. Verify assertion
    const verification = await verifyAuthenticationResponse({
      response: assertionResp,
      expectedChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN!,
      expectedRPID: process.env.WEBAUTHN_RPID || 'localhost',
      credential: {
        id: isoBase64URL.fromBuffer(user.webauthnCredentials[0].credentialID),
        publicKey: user.webauthnCredentials[0].publicKey,
        counter: user.webauthnCredentials[0].counter,
        transports: user.webauthnCredentials[0].transports || [],
      },
    });
    if (!verification.verified) {
      console.warn('[verifyWebauthn] WebAuthn verification failed for user:', user._id);
      return res.status(403).json({ error: 'WebAuthn verification failed' });
    }
    // 7. Update counter
    user.webauthnCredentials[0].counter = verification.authenticationInfo.newCounter;
    await user.save();
    delete challengeStore[user._id];
    // 8. Continue
    next();
  } catch (e: any) {
    console.error('[verifyWebauthn] Middleware error:', e);
    res.status(500).json({ error: 'WebAuthn middleware error', details: e.message });
  }
}
