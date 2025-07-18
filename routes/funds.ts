import express, { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import DepositSession from '../models/DepositSession';
import Notification from '../models/Notification';
import Withdrawal from '../models/Withdrawal';
import speakeasy from 'speakeasy';
import authenticateToken from '../middleware/authenticateToken';
import verifyWebauthn from '../middleware/verifyWebauthn';
import conditionalWebauthn from '../middleware/conditionalWebauthn';
import bcrypt from 'bcryptjs';
import { getStyledEmailHtml } from '../routes/userSettings';
import { Resend } from 'resend';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// --- CODE VERIFICATION HELPERS ---
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

// --- CONVERT ENDPOINT ---
router.post('/convert', authenticateToken, conditionalWebauthn('convert'), async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { direction, amount } = req.body;
    const CONVERT_RATE = 1;
    if (!direction || !amount || isNaN(amount) || amount <= 0) {
        res.status(400).json({ error: 'Invalid conversion request' });
        return;
    }
    try {
        const user = await User.findById(userId);
        console.log('[CONVERT] userId:', userId, 'direction:', direction, 'amount:', amount);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // FLEX_TO_USDT
        if (direction === 'FLEX_TO_USDT') {
            if (user.flexBalance == null || user.flexBalance < amount) {
                res.status(400).json({ error: 'Insufficient FLEX balance' });
                return;
            }
            user.flexBalance -= amount;
            user.usdtBalance += amount * CONVERT_RATE;
            user.recentTransactions = user.recentTransactions || [];
            user.recentTransactions.push({ type: 'Convert', amount, currency: 'USDT', date: new Date(), note: `Converted ${amount} FLEX to ${amount * CONVERT_RATE} USDT` });
            await user.save();
            res.json({ message: `Converted ${amount} FLEX to ${amount * CONVERT_RATE} USDT.`, usdtBalance: user.usdtBalance, flexBalance: user.flexBalance });
            return;
        }
        // USDT_TO_SPOT (if present)
        if (direction === 'USDT_TO_SPOT') {
            if (user.usdtBalance < amount) {
                res.status(400).json({ error: 'Insufficient USDT balance' });
                return;
            }
            user.usdtBalance -= amount;
            user.spotBalance += amount / CONVERT_RATE;
            user.recentTransactions.push({ type: 'Convert', amount: amount / CONVERT_RATE, currency: 'SPOT', date: new Date() });
            await user.save();
            res.json({ message: `Converted ${amount} USDT to ${amount / CONVERT_RATE} SPOT.`, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance });
            return;
        }
        // SPOT_TO_USDT (if present)
        if (direction === 'SPOT_TO_USDT') {
            if (user.spotBalance < amount) {
                res.status(400).json({ error: 'Insufficient SPOT balance' });
                return;
            }
            user.spotBalance -= amount;
            user.usdtBalance += amount * CONVERT_RATE;
            user.recentTransactions.push({ type: 'Convert', amount, currency: 'USDT', date: new Date() });
            await user.save();
            res.json({ message: `Converted ${amount} SPOT to ${amount * CONVERT_RATE} USDT.`, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance });
            return;
        }
        res.status(400).json({ error: 'Invalid conversion direction' });
    } catch (err) {
        console.error('[CONVERT] Error:', err);
        res.status(500).json({ error: 'Conversion failed' });
    }
});

// --- TRANSFER ENDPOINT ---
router.post('/transfer', authenticateToken, conditionalWebauthn('transfer'), async (req: Request, res: Response) => {
    try {
        const senderId = (req as any).user.userId;
        const { recipientEmail, amount, twoFAToken } = req.body;
        if (!recipientEmail || !amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Recipient email and valid amount are required' });
        }
        const sender = await User.findById(senderId);
        if (!sender) return res.status(404).json({ error: 'Sender not found' });
        if (sender.email === recipientEmail) return res.status(400).json({ error: 'Cannot transfer to yourself' });
        if (sender.flexBalance < amount) return res.status(400).json({ error: 'Insufficient FLEX balance' });
        // Skip 2FA check if WebAuthn is enabled for transfer
        if (!(sender.webauthnSettings && sender.webauthnSettings.transfer)) {
            if (!twoFAToken) {
                return res.status(400).json({ error: '2FA code required' });
            }
            if (!sender.twoFA || !sender.twoFA.enabled || !sender.twoFA.secret) {
                return res.status(400).json({ error: '2FA must be enabled to transfer funds' });
            }
            const verified = speakeasy.totp.verify({
                secret: sender.twoFA.secret,
                encoding: 'base32',
                token: twoFAToken,
                window: 1
            });
            if (!verified) {
                return res.status(400).json({ error: 'Invalid 2FA code' });
            }
        }
        const recipient = await User.findOne({ email: recipientEmail });
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
        sender.flexBalance -= amount;
        recipient.flexBalance += amount;
        sender.recentTransactions.push({ type: 'Transfer Out', amount, currency: 'FLEX', date: new Date(), to: recipientEmail });
        recipient.recentTransactions.push({ type: 'Transfer In', amount, currency: 'FLEX', date: new Date(), from: sender.email });
        await sender.save();
        await recipient.save();
        await Notification.create([
            {
                userId: sender._id,
                message: `You sent ${amount} FLEX to ${recipientEmail}.`,
                read: false
            },
            {
                userId: recipient._id,
                message: `You received ${amount} FLEX from ${sender.email}.`,
                read: false
            }
        ]);
        res.json({ message: `Transferred ${amount} FLEX to ${recipientEmail}` });
    } catch (err) {
        res.status(500).json({ error: 'Transfer failed' });
    }
});

// --- MANUAL DEPOSIT ENDPOINT ---
router.post('/deposit/manual', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { amount, txid } = req.body;
  if (!amount || isNaN(amount) || amount < 10) {
    return res.status(400).json({ error: 'Minimum deposit is 10 USDT' });
  }
  if (!txid || typeof txid !== 'string' || txid.length < 8) {
    return res.status(400).json({ error: 'Invalid txid' });
  }
  await DepositSession.create({
    userId,
    amount: Number(amount),
    address: 'TSNHcwrdH83nh16RGdFQizYKQaDUyTnd7W',
    txid,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24*60*60*1000),
  });
  res.json({ message: 'Deposit request submitted for admin review.' });
});

// --- DEPOSIT STATUS ENDPOINT ---
router.get('/deposit/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const session = await DepositSession.findOne({
      userId: (req as any).user._id,
      status: { $in: ['pending', 'approved'] },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!session) {
      const expired = await DepositSession.findOne({
        userId: (req as any).user._id,
        status: 'pending',
        expiresAt: { $lte: new Date() },
      }).sort({ createdAt: -1 });
      if (expired) {
        return res.json({ status: 'failed' });
      }
      return res.json({ status: 'failed' });
    }
    if (session.status === 'approved') {
      return res.json({ status: 'success' });
    }
    return res.json({ status: 'pending' });
  } catch (err) {
    return res.status(500).json({ status: 'failed', error: 'Server error' });
  }
});

// --- WITHDRAWAL VERIFICATION ---
router.post('/send-withdrawal-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('withdrawalCodes', user.email, code);
    try {
        await resend.emails.send({
            from: 'noreply@tradespot.online',
            to: user.email,
            subject: 'Withdrawal Verification Code',
            html: getStyledEmailHtml(
              'Withdrawal Verification',
              `Your withdrawal verification code is: <b style="font-size:20px;color:#1e3c72;">${code}</b>`
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// --- WITHDRAW ENDPOINT ---
router.post('/withdraw', authenticateToken, conditionalWebauthn('withdraw'), async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { amount, verificationCode, twoFACode } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    if (!amount || isNaN(amount) || amount < 10) {
        res.status(400).json({ error: 'Minimum withdrawal amount is 10 FLEX' });
        return;
    }
    if (user.flexBalance == null || user.flexBalance < amount) {
        res.status(400).json({ error: 'Insufficient FLEX balance' });
        return;
    }
    // Skip 2FA check if WebAuthn is enabled for withdraw
    if (!(user.webauthnSettings && user.webauthnSettings.withdraw)) {
        if (!twoFACode) {
            res.status(400).json({ error: '2FA code required' });
            return;
        }
        if (!user.twoFA || !user.twoFA.enabled || !user.twoFA.secret) {
            res.status(400).json({ error: '2FA must be enabled to withdraw funds' });
            return;
        }
        const verified = speakeasy.totp.verify({
            secret: user.twoFA.secret,
            encoding: 'base32',
            token: twoFACode,
            window: 1
        });
        if (!verified) {
            res.status(400).json({ error: 'Invalid 2FA code' });
            return;
        }
    }
    user.flexBalance -= amount;
    user.recentTransactions = user.recentTransactions || [];
    user.recentTransactions.push({
        type: 'Withdrawal',
        amount,
        currency: 'FLEX',
        date: new Date(),
        note: `Withdrawal request submitted to ${user.wallet}`
    });
    await user.save();
    const withdrawal = new Withdrawal({
        userId,
        spotid: user.spotid,
        wallet: user.wallet,
        amount,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    });
    await withdrawal.save();
    res.json({ message: 'Withdrawal request submitted', withdrawalId: withdrawal._id });
});

// --- TRANSACTIONS ENDPOINT ---
router.get('/transactions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId || (req as any).user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ transactions: user.recentTransactions || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// --- FUNDS PRIVACY VERIFICATION CODE ---
router.post('/send-funds-privacy-code', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('fundsPrivacyCodes', user.email, code);
    try {
        await resend.emails.send({
            from: 'noreply@tradespot.online',
            to: user.email,
            subject: 'Funds Privacy Verification Code',
            html: getStyledEmailHtml(
              'Funds Privacy Verification',
              `<div style="text-align:center;">
                <p style="font-size:1.15rem;margin-bottom:18px;margin-top:0;">Hello <b>${user.fullName || user.email}</b>,</p>
                <p style="font-size:1.08rem;margin-bottom:22px;margin-top:0;">You recently requested to update your <b>funds privacy settings</b>.<br/>Please use the verification code below to continue:</p>
                <div style="margin:24px auto 24px auto;max-width:220px;text-align:center;">
                  <span style="display:inline-block;font-size:2.2rem;font-weight:700;color:#008066;border:1.5px solid #008066;padding:18px 32px;background:#ededed;letter-spacing:2px;box-shadow:0 2px 6px rgba(0,0,0,0.1);">${code}</span>
                </div>
              </div>`
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// --- VERIFY FUNDS PRIVACY ---
router.post('/verify-funds-privacy', authenticateToken, async (req, res) => {
    const { spotid, emailCode, password, twoFAToken } = req.body;
    if (!spotid || !emailCode || !password || !twoFAToken) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        // Find user by spotid
        const user = await User.findOne({ spotid });
        if (!user) return res.status(404).json({ error: 'User not found.' });
        // Check password (use bcrypt for hashed passwords)
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Incorrect password.' });
        }
        // Check 2FA
        if (!user.twoFA || !user.twoFA.enabled || !user.twoFA.secret) {
            return res.status(400).json({ error: '2FA not enabled.' });
        }
        const verified = speakeasy.totp.verify({
            secret: user.twoFA.secret,
            encoding: 'base32',
            token: twoFAToken,
            window: 1
        });
        if (!verified) {
            return res.status(400).json({ error: 'Invalid 2FA code.' });
        }
        // Check email code
        if (!verifyCode('fundsPrivacyCodes', user.email, emailCode)) {
            return res.status(400).json({ error: 'Invalid or expired email code.' });
        }
        // Toggle fundsLocked
        user.fundsLocked = !user.fundsLocked;
        await user.save();
        return res.json({ 
            message: user.fundsLocked ? 'Funds locked.' : 'Funds unlocked.',
            fundsLocked: user.fundsLocked
        });
    } catch (err) {
        return res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
