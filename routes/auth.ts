import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import passport from 'passport';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET!;

// --- Register ---
router.post('/register', async (req: Request, res: Response) => {
    const { fullName, email, password, wallet, referredBy } = req.body;
    if (!fullName || !email || !password || !wallet || !referredBy) {
        res.status(400).json({ error: 'All fields required, including referral link' });
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
    const user = new User({ fullName, email, password: hash, wallet, usdtBalance: 0, spotBalance: 0, referralCode, referredBy, spotid });
    await user.save();
    referrer.teamMembers.push({ userId: user._id as mongoose.Types.ObjectId, joinedAt: new Date() });
    await referrer.save();
    res.json({ message: 'User registered successfully', referralCode, spotid });
});

// --- Login ---
router.post('/login', async (req: Request, res: Response) => {
    const { email, password, twoFAToken, device } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.password) {
        res.status(400).json({ error: 'Invalid credentials' });
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
        next();
    },
    passport.authenticate('google', { failureRedirect: '/' }),
    async (req: Request, res: Response) => {
        try {
            const profile = req.user as any;
            if (!profile || !profile.emails || !profile.emails[0]) {
                return res.redirect('https://www.tradespot.online/login?error=google_profile');
            }
            const email = profile.emails[0].value;
            let user = await User.findOne({ email });
            if (!user) {
                return res.redirect('https://www.tradespot.online/login?error=not_registered');
            }
            const tokenId = new mongoose.Types.ObjectId().toString();
            const token = jwt.sign({ userId: user._id, email: user.email, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
            user.sessions = user.sessions || [];
            if (user.sessions.length >= 2) {
                user.sessions.shift();
            }
            user.sessions.push({ tokenId, device: 'google-oauth', issuedAt: new Date() });
            await user.save();
            res.redirect(`https://www.tradespot.online/login?token=${token}`);
        } catch (err) {
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

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL || 'https://www.tradespot.online'}/reset-password?token=${token}`;
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
        subject: 'Password Reset Request',
        html: `<p>You requested a password reset for your TradeSpot account.</p>
               <p><a href="${resetUrl}">Click here to reset your password</a></p>
               <p>This link will expire in 30 minutes. If you did not request this, please ignore this email.</p>`
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
    res.json({ message: 'Password has been reset successfully.' });
});

// --- OPTIONS for /login ---
router.options('/login', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

export default router;
