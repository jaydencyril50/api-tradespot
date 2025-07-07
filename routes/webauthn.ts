import express from 'express';
import cors from 'cors';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse as verifyAuthResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import User from '../models/User';

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

// In-memory challenge store (replace with Redis/DB in production)
const challengeStore: Record<string, string> = {};

// Temporary test assignment
const test = verifyAuthResponse;

// Registration options
router.get('/register/options', async (req, res) => {
  const { email } = req.query;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const options = await generateRegistrationOptions({
    rpName: process.env.WEBAUTHN_RP_NAME || 'Tradespot',
    rpID: process.env.WEBAUTHN_RPID || 'localhost',
    userID: user._id.toString(),
    userName: user.email,
    attestationType: 'none',
    authenticatorSelection: { userVerification: 'preferred' },
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
    if (!verification.verified) return res.status(400).json({ error: 'Verification failed' });
    // Save credential
    user.webauthnCredentials = user.webauthnCredentials || [];
    user.webauthnCredentials.push({
      credentialID: Buffer.from(verification.registrationInfo.credential.id),
      publicKey: verification.registrationInfo.credential.publicKey,
      counter: verification.registrationInfo.credential.counter,
      transports: attResp.transports,
      credentialType: attResp.credentialType,
    });
    await user.save();
    delete challengeStore[user._id];
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Verification error', details: e.message });
  }
});

// Authentication options
router.get('/authenticate/options', async (req, res) => {
  const { email } = req.query;
  const user = await User.findOne({ email });
  if (!user || !user.webauthnCredentials || user.webauthnCredentials.length === 0) return res.status(404).json({ error: 'No credentials' });
  const options = await generateAuthenticationOptions({
    timeout: 60000,
    allowCredentials: user.webauthnCredentials.map(c => ({
      id: c.credentialID,
      type: 'public-key',
      transports: c.transports,
    })),
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
