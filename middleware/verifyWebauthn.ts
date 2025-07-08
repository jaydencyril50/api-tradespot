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
    // Find the matching credential by id
    const credentialIdBuffer = Buffer.from(assertionResp.id, 'base64url');
    // Debug: log all stored credential IDs for this user
    console.log('[verifyWebauthn] Stored credentialIDs for user:', user._id, user.webauthnCredentials.map(c => c.credentialID.toString('base64url')));
    console.log('[verifyWebauthn] Incoming assertionResp.id:', assertionResp.id);
    const matchingCred = user.webauthnCredentials.find(c => Buffer.compare(c.credentialID, credentialIdBuffer) === 0);
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
    // 6. Prepare publicKey as Buffer
    let publicKeyBuffer: Buffer;
    if (Buffer.isBuffer(matchingCred.publicKey)) {
      publicKeyBuffer = matchingCred.publicKey;
    } else if (typeof matchingCred.publicKey === 'string') {
      publicKeyBuffer = Buffer.from(matchingCred.publicKey, 'base64url');
    } else if (matchingCred.publicKey && matchingCred.publicKey.type === 'Buffer' && Array.isArray(matchingCred.publicKey.data)) {
      publicKeyBuffer = Buffer.from(matchingCred.publicKey.data);
    } else {
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
        id: isoBase64URL.fromBuffer(matchingCred.credentialID),
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
