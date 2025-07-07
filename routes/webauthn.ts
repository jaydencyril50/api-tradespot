import express from 'express';
import cors from 'cors';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse as verifyAuthResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import User from '../models/User';
import challengeStore from '../utils/webauthnChallengeStore';

const router = express.Router();

const allowedOrigins = [
  'https://www.tradespot.online',
  'https://tradespot.online',
  'https://api.tradespot.online',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Attach CORS middleware directly
router.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked for origin: ' + origin));
    }
  },
  credentials: true
}));

// Registration options
router.get('/register/options', async (req, res) => {
  const { email } = req.query;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  // SimpleWebAuthn v8+ requires userID as Buffer or Uint8Array
  let userIDBuffer;
  if (user._id instanceof Buffer) {
    userIDBuffer = user._id;
  } else if (user._id && user._id.id) {
    userIDBuffer = user._id.id; // Mongoose ObjectId .id is a Buffer
  } else {
    userIDBuffer = Buffer.from(user._id.toString(), 'utf8');
  }
  const options = await generateRegistrationOptions({
    rpName: process.env.WEBAUTHN_RP_NAME || 'Tradespot',
    rpID: process.env.WEBAUTHN_RPID || 'localhost',
    userID: userIDBuffer,
    userName: user.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred'
    },
    timeout: 60000,
  });
  challengeStore[user._id] = options.challenge;
  res.json(options);
});

// Registration verify
router.post('/register/verify', async (req, res) => {
  const { email, attResp } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const expectedChallenge = challengeStore[user._id];
  try {
    const verification = await verifyRegistrationResponse({
      response: attResp,
      expectedChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN,
      expectedRPID: process.env.WEBAUTHN_RPID || 'localhost',
    });
    if (!verification.verified) {
      // Return more details for debugging
      return res.status(400).json({ error: 'Verification failed', verification });
    }
    // Save credential
    const pk = verification.registrationInfo.credential.publicKey;
    user.webauthnCredentials = user.webauthnCredentials || [];
    user.webauthnCredentials.push({
      credentialID: Buffer.from(verification.registrationInfo.credential.id, 'base64url'),
      publicKey: Buffer.isBuffer(pk)
        ? pk
        : typeof pk === 'string'
          ? Buffer.from(pk, 'base64url')
          : Buffer.from(pk), // handles Uint8Array
      counter: verification.registrationInfo.credential.counter,
      transports: attResp.transports,
      credentialType: attResp.credentialType,
    });
    await user.save();
    delete challengeStore[user._id];
    res.json({ success: true });
  } catch (e) {
    // Return stack and error for debugging
    res.status(400).json({ error: 'Verification error', details: e.message, stack: e.stack });
  }
});

// Authentication options
router.get('/authenticate/options', async (req, res) => {
  const { email } = req.query;
  const user = await User.findOne({ email });
  if (!user || !user.webauthnCredentials || user.webauthnCredentials.length === 0) return res.status(404).json({ error: 'No credentials' });
  const options = await generateAuthenticationOptions({
    timeout: 60000,
    // Omit allowCredentials for discoverable credentials
    userVerification: 'preferred',
    rpID: process.env.WEBAUTHN_RPID || 'localhost',
  });
  challengeStore[user._id] = options.challenge;
  res.json(options);
});

// Authentication verify
router.post('/authenticate/verify', async (req, res) => {
  const { email, assertionResp } = req.body;
  const user = await User.findOne({ email });
  if (!user || !user.webauthnCredentials || user.webauthnCredentials.length === 0) return res.status(404).json({ error: 'No credentials' });
  const expectedChallenge = challengeStore[user._id];
  try {
    const verification = await verifyAuthResponse({
      response: assertionResp,
      expectedChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN!,
      expectedRPID: process.env.WEBAUTHN_RPID || 'localhost',
      credential: {
        id: isoBase64URL.fromBuffer(user.webauthnCredentials[0].credentialID), // updated to use isoBase64URL
        publicKey: user.webauthnCredentials[0].publicKey,
        counter: user.webauthnCredentials[0].counter,
        transports: user.webauthnCredentials[0].transports || [],
      },
    });
    if (!verification.verified) return res.status(400).json({ error: 'Verification failed' });
    // Update counter
    user.webauthnCredentials[0].counter = verification.authenticationInfo.newCounter;
    await user.save();
    delete challengeStore[user._id];
    // Issue session/JWT here as needed
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Verification error', details: e.message });
  }
});

export default router;
