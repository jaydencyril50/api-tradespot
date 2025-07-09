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

export function getStyledEmailHtml(subject: string, body: string) {
  return `
    <div style="margin: 0; padding: 0; background: #f3f4f6; font-family: 'Inter', 'Segoe UI', sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 25px rgba(0, 0, 0, 0.1);">

              <!-- Header with Logo -->
              <tr>
                <td style="text-align: center; padding: 24px 0; background-color: #f9fafb; border-bottom: 1px solid #e2e8f0;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a;">TRADESPOT</h1>
                </td>
              </tr>

              <!-- Illustration -->
              <tr>
                <td style="text-align: center; padding: 32px 24px 16px;">
                  <img src="https://img.icons8.com/color/96/000000/privacy.png" alt="Security Icon" style="max-width: 96px;">
                </td>
              </tr>

              <!-- Email Subject & Code Body -->
              <tr>
                <td style="padding: 0 32px 8px; text-align: center;">
                  <h2 style="font-size: 20px; color: #0f172a; margin-bottom: 12px;">\${subject}</h2>
                  <p style="font-size: 15px; color: #334155; line-height: 1.6;">\${body}</p>
                </td>
              </tr>

              <!-- One-Time Code Box -->
              <tr>
                <td style="text-align: center; padding: 8px 32px 32px;">
                  <div style="display: inline-block; background-color: #f1f5f9; color: #0f172a; padding: 12px 24px; border-radius: 10px; font-size: 22px; font-weight: 700; letter-spacing: 4px;">\${subject.match(/\d{4,6}/)?.[0] || '123456'}</div>
                </td>
              </tr>

              <!-- Support Info -->
              <tr>
                <td style="padding: 0 32px 16px; text-align: center; font-size: 13px; color: #475569;">
                  <p style="margin: 0;">Need help? Email us at <a href="mailto:help@tradespot.online" style="color: #1d4ed8; font-weight: 500;">help@tradespot.online</a></p>
                  <p style="margin: 4px 0 0;">or call 1 (800) 555-TRDS</p>
                </td>
              </tr>

              <!-- Social Links -->
              <tr>
                <td style="text-align: center; padding: 8px 0 0;">
                  <a href="#" style="margin: 0 8px;"><img src="https://img.icons8.com/ios-filled/24/1d4ed8/facebook--v1.png" alt="Facebook"></a>
                  <a href="#" style="margin: 0 8px;"><img src="https://img.icons8.com/ios-filled/24/1d4ed8/instagram-new.png" alt="Instagram"></a>
                  <a href="#" style="margin: 0 8px;"><img src="https://img.icons8.com/ios-filled/24/1d4ed8/twitter.png" alt="Twitter"></a>
                </td>
              </tr>

              <!-- Legal Footer -->
              <tr>
                <td style="text-align: center; font-size: 11px; color: #94a3b8; padding: 16px 32px 28px;">
                  <p style="margin: 0;">© 2025 TradeSpot Global Ltd. All rights reserved.</p>
                  <p style="margin: 4px 0 0;"><a href="#" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a></p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
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
              `Your verification code is: <b style="font-size:20px;color:#1e3c72;">${code}</b>`
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
              `Your email change verification code is: <b style="font-size:20px;color:#1e3c72;">${code}</b>`
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
              `Your wallet change verification code is: <b style=\"font-size:20px;color:#1e3c72;\">${code}</b>`
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
              `Your password change verification code is: <b style=\"font-size:20px;color:#1e3c72;\">${code}</b>`
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
