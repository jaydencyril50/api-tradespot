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
  'https://localhost',
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
  const userIDBuffer = Buffer.from(user._id.toString(), 'utf8'); // safest and consistent
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
    // Step 1: Bulletproof publicKey handling
    const rawPublicKey = verification.registrationInfo.credential.publicKey;
    // Always decode to Buffer (lib should already give Buffer, but force for safety)
    const publicKeyBuffer = Buffer.from(rawPublicKey);
    // Step 2: Debug logs
    console.log('[debug] publicKeyBuffer length:', publicKeyBuffer.length);
    console.log('[debug] publicKeyBuffer (base64url):', publicKeyBuffer.toString('base64url'));

    user.webauthnCredentials = user.webauthnCredentials || [];
    user.webauthnCredentials.push({
      credentialID: Buffer.from(verification.registrationInfo.credential.id, 'base64url'),
      publicKey: publicKeyBuffer,
      counter: verification.registrationInfo.credential.counter,
      transports: attResp.transports || [],
      credentialType: attResp.credentialType || 'public-key',
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
    const matchingCred = user.webauthnCredentials.find(
      cred => isoBase64URL.fromBuffer(cred.credentialID) === assertionResp.id
    );
    if (!matchingCred) return res.status(403).json({ error: 'No matching credential found' });

    const verification = await verifyAuthResponse({
      response: assertionResp,
      expectedChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN!,
      expectedRPID: process.env.WEBAUTHN_RPID || 'localhost',
      credential: {
        id: assertionResp.id,
        publicKey: matchingCred.publicKey,
        counter: matchingCred.counter,
        transports: matchingCred.transports || [],
      },
    });
    if (!verification.verified) return res.status(400).json({ error: 'Verification failed' });
    // Update counter
    matchingCred.counter = verification.authenticationInfo.newCounter;
    await user.save();
    delete challengeStore[user._id];
    // Issue session/JWT here as needed
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Verification error', details: e.message });
  }
});

export default router;
