import express, { Request, Response } from 'express';
import User from '../models/User';
import nodemailer from 'nodemailer';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import bcrypt from 'bcryptjs';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// --- CODE VERIFICATION HELPERS (copy or import if needed) ---
const CODE_EXPIRY_MS = 10 * 60 * 1000;
type CodeWithTime = { code: string, created: number };
function setCode(globalKey: string, email: string, code: string) {
    (global as any)[globalKey] = (global as any)[globalKey] || {};
    (global as any)[globalKey][email] = { code, created: Date.now() };
}
function getCode(globalKey: string, email: string): CodeWithTime | undefined {
    const codes = (global as any)[globalKey] || {};
    return codes[email];
}
function deleteCode(globalKey: string, email: string) {
    const codes = (global as any)[globalKey] || {};
    delete codes[email];
}
function verifyCode(globalKey: string, email: string, inputCode: string): boolean {
    const obj = getCode(globalKey, email);
    if (!obj) return false;
    if (obj.code !== inputCode) return false;
    if (Date.now() - obj.created > CODE_EXPIRY_MS) {
        deleteCode(globalKey, email);
        return false;
    }
    return true;
}

function getVerificationEmailBody(fullName: string, code: string, action: string) {
  return `
    <div style="text-align:center;">
      <p style="font-size:1.15rem;margin-bottom:18px;margin-top:0;">Hello <b>${fullName}</b>,</p>
      <p style="font-size:1.08rem;margin-bottom:22px;margin-top:0;">You recently requested to update your <b>${action}</b>.<br/>Please use the verification code below to continue:</p>
      <div style="margin:24px auto 24px auto;max-width:220px;text-align:center;">
        <span style="display:inline-block;font-size:2.2rem;font-weight:700;color:#008066;border:1.5px solid #008066;padding:18px 32px;background:#ededed;letter-spacing:2px;box-shadow:0 2px 6px rgba(0,0,0,0.1);">${code}</span>
      </div>
    </div>
  `;
}

export function getStyledEmailHtml(subject: string, body: string) {
  return `
    <div style="background:#0f172a;padding:0;margin:0;font-family:'Inter','Segoe UI',sans-serif;color:#e2e8f0;">
      <div style="max-width:600px;margin:24px auto;background:#1e293b;box-shadow:0 4px 18px rgba(0,0,0,0.5);color:#e2e8f0;">
        <div style="background:#0f172a;padding:24px 0;text-align:center;border-bottom:1px solid #1f2937;">
          <img src="https://www.tradespot.online/favicon.ico" alt="TradeSpot Logo" width="64" height="64" style="display:block;margin:0 auto 12px;">
          <span style="font-size:1.8rem;font-weight:800;color:#10b981;letter-spacing:1px;">TRADESPOT</span>
        </div>
        <div style="padding:28px 24px;text-align:center;color:#e2e8f0;">
          ${body}
        </div>
        <div style="padding:16px 24px 0 24px;font-size:0.95rem;color:#94a3b8;text-align:center;">
          <span>If you did not request this change, please disregard this message.</span>
        </div>
        <div style="background:#0f172a;padding:14px 0;text-align:center;">
          <span style="font-size:0.9rem;color:#64748b;">© 2025 TradeSpot Global Ltd</span>
        </div>
      </div>
    </div>
  `;
}

// --- NAME CHANGE ---
router.post('/send-name-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('nameChangeCodes', user.email, code);
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Your Name Change Verification Code',
            html: getStyledEmailHtml(
              'Name Change Verification',
              getVerificationEmailBody(user.fullName, code, 'name')
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/change-name', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newName, code } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    if (!verifyCode('nameChangeCodes', user.email, code)) {
        res.status(400).json({ error: 'Invalid or expired verification code' });
        return;
    }
    user.fullName = newName;
    await user.save();
    deleteCode('nameChangeCodes', user.email);
    res.json({ message: 'Name updated successfully' });
});

// --- EMAIL CHANGE ---
router.post('/send-email-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('emailChangeCodes', user.email, code);
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Your Email Change Verification Code',
            html: getStyledEmailHtml(
              'Email Change Verification',
              getVerificationEmailBody(user.fullName, code, 'email')
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/change-email', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newEmail, password, code } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    if (!password || !(await bcrypt.compare(password, user.password))) {
        res.status(400).json({ error: 'Invalid password' });
        return;
    }
    if (!code || !verifyCode('emailChangeCodes', user.email, code)) {
        res.status(400).json({ error: 'Invalid or expired verification code' });
        return;
    }
    const existing = await User.findOne({ email: newEmail });
    if (existing) {
        res.status(400).json({ error: 'Email already exists' });
        return;
    }
    user.email = newEmail;
    await user.save();
    deleteCode('emailChangeCodes', user.email);
    res.json({ message: 'Email updated successfully' });
});

// --- WALLET CHANGE ---
router.post('/send-wallet-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('walletChangeCodes', user.email, code);
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Wallet Change Verification Code',
            html: getStyledEmailHtml(
              'Wallet Change Verification',
              getVerificationEmailBody(user.fullName, code, 'wallet')
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/change-wallet', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newWallet, code, password, twoFAToken } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    if (!newWallet || !code || !password || !twoFAToken) {
        res.status(400).json({ error: 'newWallet, code, password, and twoFAToken are required' });
        return;
    }
    if (!password || !(await bcrypt.compare(password, user.password))) {
        res.status(400).json({ error: 'Invalid password' });
        return;
    }
    let secret = '';
    if (user.twoFA && user.twoFA.secret) {
        secret = user.twoFA.secret;
    }
    if (!secret) {
        res.status(400).json({ error: '2FA is not set up for this account' });
        return;
    }
    const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: twoFAToken,
        window: 1
    });
    if (!verified) {
        res.status(400).json({ error: 'Invalid 2FA code' });
        return;
    }
    if (!verifyCode('walletChangeCodes', user.email, code)) {
        res.status(400).json({ error: 'Invalid or expired verification code' });
        return;
    }
    const existing = await User.findOne({ wallet: newWallet });
    if (existing) {
        res.status(400).json({ error: 'Wallet address already exists' });
        return;
    }
    user.wallet = newWallet;
    await user.save();
    deleteCode('walletChangeCodes', user.email);
    res.json({ message: 'Wallet updated successfully' });
});

// --- PASSWORD CHANGE ---
router.post('/send-password-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('passwordChangeCodes', user.email, code);
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Password Change Verification Code',
            html: getStyledEmailHtml(
              'Password Change Verification',
              getVerificationEmailBody(user.fullName, code, 'password')
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/change-password', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newPassword, code, spotid } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    if (!newPassword || !code || !spotid) {
        res.status(400).json({ error: 'newPassword, code, and spotid are required' });
        return;
    }
    if (user.spotid !== spotid) {
        res.status(400).json({ error: 'Invalid spotid' });
        return;
    }
    if (!verifyCode('passwordChangeCodes', user.email, code)) {
        res.status(400).json({ error: 'Invalid or expired verification code' });
        return;
    }
    try {
        const hash = await bcrypt.hash(newPassword, 10);
        user.password = hash;
        await user.save();
        deleteCode('passwordChangeCodes', user.email);
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// --- PROFILE PICTURE UPDATE ---
router.put('/portfolio', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { profilePicture } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (profilePicture) {
            user.profilePicture = profilePicture;
        }
        await user.save();
        res.json({ message: 'Profile updated', profilePicture: user.profilePicture });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// --- 2FA SETUP ---
router.post('/2fa/setup', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const secret = speakeasy.generateSecret({
    name: `TradeSpot (${user.email})`,
    length: 32
  });
  user.twoFA = { enabled: false, secret: secret.base32 };
  await user.save();
  const otpauth: string = secret.otpauth_url || '';
  let qr = '';
  try {
    qr = await qrcode.toDataURL(otpauth);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
    return;
  }
  res.json({ qr, otpauth, secret: secret.base32 });
});

// --- 2FA VERIFY ---
router.post('/2fa/verify', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { token } = req.body;
  const user = await User.findById(userId);
  if (!user || !user.twoFA || !user.twoFA.secret) {
    res.status(400).json({ error: '2FA setup not started' });
    return;
  }
  const verified = speakeasy.totp.verify({
    secret: user.twoFA.secret,
    encoding: 'base32',
    token,
    window: 1
  });
  if (!verified) {
    res.status(400).json({ error: 'Invalid 2FA code' });
    return;
  }
  user.twoFA.enabled = true;
  await user.save();
  res.json({ message: '2FA enabled successfully' });
});

// --- 2FA STATUS ---
router.get('/2fa/status', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ enabled: !!(user.twoFA && user.twoFA.enabled) });
});

export default router;
