import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import challengeStore from '../utils/webauthnChallengeStore';

// You may want to move this to a shared config
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

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
    const user = await User.findById(payload.userId);
    if (!user || !user.webauthnCredentials || user.webauthnCredentials.length === 0) {
      console.warn('[verifyWebauthn] No WebAuthn credentials for user:', payload.userId);
      return res.status(403).json({ error: 'No WebAuthn credentials' });
    }
    // 4. Get assertion from request
    const assertionResp = req.body.assertionResp;
    if (!assertionResp) {
      console.warn('[verifyWebauthn] Missing assertion response');
      return res.status(400).json({ error: 'Missing assertion response' });
    }
    // 4. Find the matching credential by id (base64url string match)
    const matchingCred = user.webauthnCredentials.find(
      cred => isoBase64URL.fromBuffer(cred.credentialID) === assertionResp.id
    );
    if (!matchingCred) {
      console.warn('[verifyWebauthn] No matching credential for id:', assertionResp.id);
      return res.status(403).json({ error: 'No matching WebAuthn credential' });
    }
    // 5. Get expected challenge
    const expectedChallenge = challengeStore[user._id];
    if (!expectedChallenge) {
      console.warn('[verifyWebauthn] No challenge found for user:', user._id);
      return res.status(400).json({ error: 'No challenge found' });
    }
    // 6. Convert publicKey safely
    function toBuffer(input: any): Buffer {
      if (Buffer.isBuffer(input)) return input;
      if (typeof input === 'string') return Buffer.from(input, 'base64url');
      if (input?.type === 'Buffer' && Array.isArray(input.data)) return Buffer.from(input.data);
      throw new Error('Invalid buffer input');
    }
    let publicKeyBuffer: Buffer;
    try {
      publicKeyBuffer = toBuffer(matchingCred.publicKey);
    } catch (e) {
      console.error('[verifyWebauthn] Invalid publicKey format:', matchingCred.publicKey);
      return res.status(500).json({ error: 'Invalid publicKey format' });
    }
    // 7. Verify assertion
    const verification = await verifyAuthenticationResponse({
      response: assertionResp,
      expectedChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN!,
      expectedRPID: process.env.WEBAUTHN_RPID || 'localhost',
      credential: {
        id: assertionResp.id, // use raw incoming id
        publicKey: publicKeyBuffer,
        counter: matchingCred.counter,
        transports: matchingCred.transports || [],
      },
    });
    if (!verification.verified) {
      console.warn('[verifyWebauthn] WebAuthn verification failed for user:', user._id);
      return res.status(403).json({ error: 'WebAuthn verification failed' });
    }
    // 8. Update counter
    matchingCred.counter = verification.authenticationInfo.newCounter;
    await user.save();
    delete challengeStore[user._id];
    // 9. Continue
    next();
  } catch (e: any) {
    console.error('[verifyWebauthn] Middleware error:', e);
    res.status(500).json({ error: 'WebAuthn middleware error', details: e.message });
  }
}
