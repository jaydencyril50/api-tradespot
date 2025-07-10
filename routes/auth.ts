import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import passport from 'passport';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User';
import webauthnRouter from './webauthn';
import authenticateToken from '../middleware/authenticateToken';
import { getWelcomeEmailBody, getStyledEmailHtml } from '../utils/emailTemplates';
import { adminRateLimiter, signupRateLimiter, loginRateLimiter } from '../middleware/rateLimiters';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET!;

// --- Register ---
router.post('/register', signupRateLimiter, async (req: Request, res: Response) => {
    const { fullName, email, password, wallet, referredBy, device } = req.body;
    if (!fullName || !email || !password || !wallet || !referredBy || !device) {
        res.status(400).json({ error: 'All fields required, including referral link and device' });
        return;
    }
    // Check if this device has already registered
    const deviceExists = await User.findOne({ signupDevice: device });
    if (deviceExists) {
        res.status(400).json({ error: 'Signup already completed on this device.' });
        return;
    }
    const referrer = await User.findOne({ referralCode: referredBy });
    if (!referrer) {
        res.status(400).json({ error: 'Referral link is invalid or does not exist' });
        return;
    }
    const existing = await User.findOne({ email });
    if (existing) {
        res.status(400).json({ error: 'Email already exists' });
        return;
    }
    const walletExists = await User.findOne({ wallet });
    if (walletExists) {
        res.status(400).json({ error: 'Wallet address already exists' });
        return;
    }
    let referralCode;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    do {
        referralCode = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (await User.findOne({ referralCode }));
    let spotid;
    do {
        spotid = Math.floor(1000000 + Math.random() * 9000000).toString();
    } while (await User.findOne({ spotid }));
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ fullName, email, password: hash, wallet, usdtBalance: 0, spotBalance: 0, referralCode, referredBy, spotid, signupDevice: device });
    await user.save();
    referrer.teamMembers.push({ userId: user._id as mongoose.Types.ObjectId, joinedAt: new Date() });
    await referrer.save();

    // Send welcome email
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
            to: email,
            subject: 'Welcome to TradeSpot!',
            html: getStyledEmailHtml('Welcome to TradeSpot!', getWelcomeEmailBody(fullName))
        });
    } catch (err) {
        // Log but do not block registration if email fails
        console.error('Failed to send welcome email:', err);
    }

    res.json({ message: 'User registered successfully', referralCode, spotid });
});

// --- Login ---
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
    const { email, password, twoFAToken, device } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.password) {
        res.status(400).json({ error: 'Invalid credentials' });
        return;
    }
    if (user.banned) {
        res.status(403).json({ error: 'Account is banned. Contact support.' });
        return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        res.status(400).json({ error: 'Invalid credentials' });
        return;
    }
    if (user.twoFA && user.twoFA.enabled) {
        if (!twoFAToken) {
            res.status(401).json({ error: '2FA required' });
            return;
        }
        const speakeasy = require('speakeasy');
        const verified = speakeasy.totp.verify({
            secret: user.twoFA.secret || '',
            encoding: 'base32',
            token: twoFAToken,
            window: 1
        });
        if (!verified) {
            res.status(401).json({ error: 'Invalid 2FA code' });
            return;
        }
    }
    const tokenId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign({ userId: user._id, email: user.email, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
    user.sessions = user.sessions || [];
    if (user.sessions.length >= 2) {
        user.sessions.shift();
    }
    user.sessions.push({ tokenId, device: device || 'unknown', issuedAt: new Date() });
    await user.save();
    res.json({ token, user: { id: user._id, fullName: user.fullName, email: user.email, wallet: user.wallet, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance } });
});

// --- Admin Login ---
router.post('/admin/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const adminUser = await User.findOne({ email, isAdmin: true });
    if (!adminUser) {
        return res.status(401).json({ error: 'Admin user not found' });
    }
    const valid = await bcrypt.compare(password, adminUser.password);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    const tokenId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign({ userId: adminUser._id, email: adminUser.email, isAdmin: true, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
    adminUser.sessions = adminUser.sessions || [];
    if (adminUser.sessions.length >= 2) {
        adminUser.sessions.shift();
    }
    adminUser.sessions.push({ tokenId, device: 'admin', issuedAt: new Date() });
    await adminUser.save();
    res.json({ token });
});

// --- Admin Signup ---
router.post('/admin/signup', async (req: Request, res: Response) => {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
        return res.status(400).json({ error: 'Admin with this email already exists' });
    }
    let referralCode;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    do {
        referralCode = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (await User.findOne({ referralCode }));
    let spotid;
    do {
        spotid = Math.floor(1000000 + Math.random() * 9000000).toString();
    } while (await User.findOne({ spotid }));
    const hash = await bcrypt.hash(password, 10);
    const adminUser = new User({
        fullName,
        email,
        password: hash,
        referralCode,
        spotid,
        isAdmin: true,
        validMember: true
    });
    await adminUser.save();
    res.json({ message: 'Admin registered successfully' });
});

// --- Google OAuth ---
router.get('/google',
    (req: Request, res: Response, next: NextFunction) => {
        next();
    },
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
    (req: Request, res: Response, next: NextFunction) => {
        console.log('[Google OAuth] /api/auth/google/callback called');
        next();
    },
    passport.authenticate('google', { failureRedirect: '/' }),
    async (req: Request, res: Response) => {
        try {
            console.log('[Google OAuth] Callback handler, req.user:', req.user);
            const profile = req.user as any;
            if (!profile || !profile.emails || !profile.emails[0]) {
                console.error('[Google OAuth] Google login failed: No profile or email found', { profile });
                return res.redirect('https://www.tradespot.online/login?error=google_profile');
            }
            const email = profile.emails[0].value;
            let user = await User.findOne({ email });
            if (!user) {
                console.warn('[Google OAuth] Google login attempt for unregistered email:', email);
                return res.redirect('https://www.tradespot.online/login?error=not_registered');
            }
            if (user.banned) {
                console.warn('[Google OAuth] Banned user attempted Google login:', email);
                return res.redirect('https://www.tradespot.online/login?error=banned');
            }
            const tokenId = new mongoose.Types.ObjectId().toString();
            const token = jwt.sign({ userId: user._id, email: user.email, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
            user.sessions = user.sessions || [];
            if (user.sessions.length >= 2) {
                user.sessions.shift();
            }
            user.sessions.push({ tokenId, device: 'google-oauth', issuedAt: new Date() });
            await user.save();
            console.log('[Google OAuth] Login success, redirecting with token:', token);
            // Add twoFAEnabled flag to redirect URL if enabled
            const twoFAEnabled = user.twoFA && user.twoFA.enabled ? 'true' : 'false';
            res.redirect(`https://www.tradespot.online/login?token=${token}&twoFAEnabled=${twoFAEnabled}`);
        } catch (err) {
            console.error('[Google OAuth] Error during Google login callback:', err);
            return res.redirect('https://www.tradespot.online/login?error=server_error');
        }
    }
);

// --- Password Reset Request ---
router.post('/request-password-reset', async (req: Request, res: Response) => {
    const { email, wallet, spotid } = req.body;
    if (!email || !wallet || !spotid) {
        return res.status(400).json({ error: 'Email, wallet address, and spotid are required.' });
    }
    const user = await User.findOne({ email, wallet, spotid });
    // Always respond with success to avoid email enumeration
    if (!user) return res.json({ message: 'If the provided details are correct, a reset link has been sent.' });

    // Generate a secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 1000 * 60 * 30; // 30 minutes
    user.resetPasswordToken = token;
    user.resetPasswordExpires = expires;
    await user.save();

    // Styled email
    const resetUrl = `${process.env.FRONTEND_URL || 'https://www.tradespot.online'}/reset-password?token=${token}`;
    const subject = 'Password Reset Request';
    const body = `<div style="color:#e2e8f0;">You requested a password reset for your TradeSpot account.<br><br>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#1e3c72;color:#fff;font-weight:700;font-size:16px;border-radius:6px;text-decoration:none;margin:18px 0 12px 0;">Reset Password</a><br>
      <span style="color:#8c94a4;font-size:14px;">This link will expire in 30 minutes. If you did not request this, please ignore this email.</span></div>`;
    const html = getStyledEmailHtml(subject, body);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
    await transporter.sendMail({
        to: user.email,
        from: process.env.EMAIL_USER,
        subject,
        html
    });
    res.json({ message: 'If the provided details are correct, a reset link has been sent.' });
});

// --- Password Reset (Verify Token & Update Password) ---
router.post('/reset-password', async (req: Request, res: Response) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required.' });
    }
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) {
        return res.status(400).json({ error: 'Invalid or expired token.' });
    }
    const hash = await bcrypt.hash(password, 10);
    user.password = hash;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.status(200).json({ message: 'Password reset successful' });
});

// --- Validate Password Reset Token ---
router.get('/validate-reset-token', async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ valid: false, error: 'Token is required.' });
    }
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) {
        return res.status(400).json({ valid: false, error: 'Invalid or expired token.' });
    }
    res.json({ valid: true });
});

// --- Get current user info (for WebAuthn etc) ---
router.get('/user/me', authenticateToken, async (req, res) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
        email: user.email,
        webauthnCredentials: user.webauthnCredentials || [],
        // add any other fields you want to expose
    });
});

// --- Admin: Ban/Unban User by Email ---
router.post('/admin/ban', authenticateToken, async (req: Request, res: Response) => {
    const { email, ban } = req.body;
    // Only allow admin to perform this action
    const adminId = (req as any).user?.userId;
    const admin = await User.findById(adminId);
    if (!admin || !admin.isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.banned = !!ban;
    await user.save();
    res.json({ message: `User ${ban ? 'banned' : 'unbanned'} successfully.` });
});

// --- Google/Token 2FA Verification ---
router.post('/verify-2fa', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { code } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.twoFA || !user.twoFA.secret) {
        return res.status(400).json({ error: '2FA is not set up for this account' });
    }
    const speakeasy = require('speakeasy');
    const verified = speakeasy.totp.verify({
        secret: user.twoFA.secret,
        encoding: 'base32',
        token: code,
        window: 1
    });
    if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
    }
    return res.json({ success: true });
});

// --- Google 2FA Verification ---
router.post('/google/2fa', async (req: Request, res: Response) => {
    const { token, code } = req.body;
    if (!token || !code) {
        return res.status(400).json({ error: 'Token and 2FA code are required.' });
    }
    try {
        // Verify JWT token to get userId
        const decoded: any = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.twoFA || !user.twoFA.secret) {
            return res.status(400).json({ error: '2FA is not set up for this account' });
        }
        const speakeasy = require('speakeasy');
        const verified = speakeasy.totp.verify({
            secret: user.twoFA.secret,
            encoding: 'base32',
            token: code,
            window: 1
        });
        if (!verified) {
            return res.status(401).json({ error: 'Invalid 2FA code' });
        }
        // Success: return the same token (or a new one if you want)
        return res.json({ token });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
});

router.use('/webauthn', webauthnRouter);
export default router;
