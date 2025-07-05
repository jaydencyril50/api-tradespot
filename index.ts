import dotenv from 'dotenv';
dotenv.config();

// Fix: Add types for Express handlers and callbacks
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import session from 'express-session';
const MongoStore = require('connect-mongo');
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import Announcement from './models/Announcement';
import Activity from './models/Activity';
import DepositSession from './models/DepositSession';
import Trash from './models/Trash';
import trashRoutes from './routes/trash';
import Chat from './models/Chat';
import chatRoutes from './routes/chat';
import User from './models/User';
import teamRouter from './routes/team';
import checkEmailRouter from './routes/checkEmail';
import validateRouter from './routes/validate';
import generateBuyersRouter from './routes/generateBuyers';
import generateSellersRouter from './routes/generateSellers';
import { randomizeBuyerStatuses } from './utils/randomizeBuyerStatuses';
import { randomizeSellerStatuses } from './utils/randomizeSellerStatuses';
import orderRoutes from './routes/order';
import sellOrderRoutes from './routes/sellOrder';
import Order from './models/Order';
import { updateFakeBuyerPrices } from './cron/updateFakeBuyerPrices';
import { updateFakeSellerPrices } from './cron/updateFakeSellerPrices';

const app = express();
// Update CORS configuration to allow all related domains as specified
const allowedOrigins = [
  'https://www.tradespot.online',
  'https://tradespot.online',
  'https://api.tradespot.online',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked for origin: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Added PATCH here
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Optionally, handle preflight requests for all routes
app.options('*', cors());

// Immediately respond to OPTIONS requests with 200
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60 // 14 days
  })
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Fix: Use 'any' instead of 'Express.User' to resolve TS2503 error
passport.serializeUser((user: any, done: (err: any, id?: unknown) => void) => {
  done(null, user);
});
passport.deserializeUser((user: any, done: (err: any, user?: any) => void) => {
  done(null, user);
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_CALLBACK_URL!,
}, (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) => {
  console.log('[GoogleStrategy] accessToken:', accessToken);
  console.log('[GoogleStrategy] refreshToken:', refreshToken);
  console.log('[GoogleStrategy] profile:', profile);
  // Here you can save/find the user in your DB
  return done(null, profile);
}));

// Auth routes
app.use('/api/team', teamRouter);
// Remove redundant CORS here:
app.get('/auth/google',
  (req: Request, res: Response, next: NextFunction) => {
    console.log('[Google OAuth] /auth/google called');
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    console.log('[Google OAuth] /auth/google/callback called');
    next();
  },
  passport.authenticate('google', { failureRedirect: '/' }),
  async (req: Request, res: Response) => {
    try {
      console.log('[Google OAuth] Callback handler, req.user:', req.user);
      // Extract Google profile
      const profile = req.user as any;
      if (!profile || !profile.emails || !profile.emails[0]) {
        console.error('[Google OAuth] Google login failed: No profile or email found', { profile });
        return res.redirect('https://www.tradespot.online/login?error=google_profile');
      }
      const email = profile.emails[0].value;
      let user = await User.findOne({ email });
      if (!user) {
        console.warn('[Google OAuth] Google login attempt for unregistered email:', email);
        // Do NOT create a new user. Only allow login for existing users.
        return res.redirect('https://www.tradespot.online/login?error=not_registered');
      }
      // Generate JWT token with unique jti
      const tokenId = new mongoose.Types.ObjectId().toString();
      const token = jwt.sign({ userId: user._id, email: user.email, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
      // Add session to user's sessions array (max 2 sessions)
      user.sessions = user.sessions || [];
      if (user.sessions.length >= 2) {
        user.sessions.shift();
      }
      user.sessions.push({ tokenId, device: 'google-oauth', issuedAt: new Date() });
      await user.save();
      console.log('[Google OAuth] Login success, redirecting with token:', token);
      // Redirect to frontend with token (send to /login, not /dashboard)
      res.redirect(`https://www.tradespot.online/login?token=${token}`);
    } catch (err) {
      console.error('[Google OAuth] Error during Google login callback:', err);
      return res.redirect('https://www.tradespot.online/login?error=server_error');
    }
  }
);

// Health check route for backend or uptime monitoring
app.get('/', (req: Request, res: Response) => {
  res.status(200).send('TradeSpot server is alive ✅');
});

// Mount chat routes for ProChat functionality
app.use('/api/chat', chatRoutes);
app.use('/api', checkEmailRouter);
app.use('/api', validateRouter);
app.use('/api/p2p', generateBuyersRouter);
app.use('/api/p2p', generateSellersRouter);
app.use('/api/p2p', orderRoutes);
app.use('/api/p2p', sellOrderRoutes);

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const MONGO_URI = process.env.MONGO_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;

mongoose.connect(MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch((err: any) => console.error('MongoDB connection error:', err));

// Notification schema (user notifications)
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// Withdrawal schema (user withdrawal requests)
const withdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    spotid: String,
    wallet: String,
    amount: Number,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

// Utility to wrap async route handlers
// Fix: Add types to asyncHandler
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Helper to log activity
type ActivityType =
  | 'USER_SIGNUP'
  | 'WITHDRAWAL_SUBMITTED'
  | 'DEPOSIT'
  | 'USER_UPDATE'
  | 'STOCK_PURCHASE'
  | 'TRANSFER';
async function logActivity(type: ActivityType, user: any, details?: any) {
  await Activity.create({
    type,
    user: {
      fullName: user.fullName,
      email: user.email,
      spotid: user.spotid,
      _id: user._id,
    },
    details,
  });
}

app.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
    const { fullName, email, password, wallet, referredBy } = req.body;
    if (!fullName || !email || !password || !wallet || !referredBy) {
        res.status(400).json({ error: 'All fields required, including referral link' });
        return;
    }
    // Check that referredBy exists in the database
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
    // Check for duplicate wallet address
    const walletExists = await User.findOne({ wallet });
    if (walletExists) {
        res.status(400).json({ error: 'Wallet address already exists' });
        return;
    }
    // Generate a unique 6-character referral code
    let referralCode;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    do {
        referralCode = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (await User.findOne({ referralCode }));

    // Generate a unique 7-digit spotid
    let spotid;
    do {
        spotid = Math.floor(1000000 + Math.random() * 9000000).toString(); // 7 digits
    } while (await User.findOne({ spotid }));

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ fullName, email, password: hash, wallet, usdtBalance: 0, spotBalance: 0, referralCode, referredBy, spotid });
    await user.save();

    // Add this user to the referrer's teamMembers
    referrer.teamMembers.push({ userId: user._id as mongoose.Types.ObjectId, joinedAt: new Date() });
    await referrer.save();
    // Log activity
    await logActivity('USER_SIGNUP', user, { referralCode, spotid });
    res.json({ message: 'User registered successfully', referralCode, spotid });
});

app.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
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
    // --- JWT session management ---
    // Generate a unique token ID (jti)
    const tokenId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign({ userId: user._id, email: user.email, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
    // Remove oldest session if already 2 active
    user.sessions = user.sessions || [];
    if (user.sessions.length >= 2) {
        // Remove the oldest session (first in array)
        user.sessions.shift();
    }
    // Add new session
    user.sessions.push({ tokenId, device: device || req.headers['user-agent'] || 'unknown', issuedAt: new Date() });
    await user.save();
    res.json({ token, user: { id: user._id, fullName: user.fullName, email: user.email, wallet: user.wallet, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance } });
});

// Robust handler for OPTIONS requests to /auth/login to ensure no redirects and proper CORS headers
app.options('/auth/login', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Admin login endpoint
app.post('/auth/admin/login', async function (req: Request, res: Response) {
    const { email, password } = req.body;
    // Replace with your admin credentials or admin user lookup
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@tradespot.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (email !== adminEmail || password !== adminPassword) {
        res.status(401).json({ error: 'Invalid admin credentials' });
        return;
    }
    // Issue a JWT token for admin
    const token = jwt.sign({ admin: true, email }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
});

// JWT authentication middleware
function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    jwt.verify(token, JWT_SECRET, async (err: any, payload: any) => {
        if (err) {
            res.status(403).json({ error: 'Invalid token' });
            return;
        }
        // Check if token is in user's active sessions
        const user = await User.findById(payload.userId);
        if (!user || !user.sessions || !user.sessions.some((s: any) => s.tokenId === payload.jti)) {
            res.status(401).json({ error: 'Session expired or invalidated' });
            return;
        }
        (req as any).user = payload;
        next();
        return;
    });
}

// Admin middleware (simple: checks JWT for admin: true)
function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err || !user || !user.admin) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        (req as any).admin = user;
        next();
    });
}

// Example protected route
app.get('/api/portfolio', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    res.json({
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        wallet: user.wallet,
        usdtBalance: user.usdtBalance,
        spotBalance: user.spotBalance,
        recentTransactions: user.recentTransactions ? user.recentTransactions.slice(-5).reverse() : [],
        profilePicture: user.profilePicture, // Include profilePicture in response
        fundsLocked: user.fundsLocked // Add fundsLocked to response
    });
});

app.put('/api/portfolio', authenticateToken, async (req: Request, res: Response): Promise<void> => {
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
        // Log activity for profile update
        await logActivity('USER_UPDATE', user, { updated: 'profilePicture' });
        res.json({ message: 'Profile updated', profilePicture: user.profilePicture });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Convert endpoint: USDT <-> SPOT
app.post('/api/convert', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user.userId;
    const { direction, amount } = req.body;
    const CONVERT_RATE = 500;
    if (!direction || !amount || isNaN(amount) || amount <= 0) {
        res.status(400).json({ error: 'Invalid conversion request' });
        return;
    }
    try {
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (direction === 'USDT_TO_SPOT') {
            if (user.usdtBalance < amount) {
                res.status(400).json({ error: 'Insufficient USDT balance' });
                return;
            }
            user.usdtBalance -= amount;
            user.spotBalance += amount / CONVERT_RATE;
            user.recentTransactions.push({ type: 'Convert', amount: amount / CONVERT_RATE, currency: 'SPOT', date: new Date() });
            await user.save();
            res.json({ message: `Converted ${amount} USDT to ${(amount / CONVERT_RATE)} SPOT.`, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance });
        } else if (direction === 'SPOT_TO_USDT') {
            if (user.spotBalance < amount) {
                res.status(400).json({ error: 'Insufficient SPOT balance' });
                return;
            }
            user.spotBalance -= amount;
            user.usdtBalance += amount * CONVERT_RATE;
            user.recentTransactions.push({ type: 'Convert', amount, currency: 'USDT', date: new Date() });
            await user.save();
            res.json({ message: `Converted ${amount} SPOT to ${amount * CONVERT_RATE} USDT.`, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance });
        } else {
            res.status(400).json({ error: 'Invalid conversion direction' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Conversion failed' });
    }
});

app.post('/api/transfer', authenticateToken, async (req: Request, res: Response) => {
    try {
        const senderId = (req as any).user.userId;
        const { recipientEmail, amount, twoFAToken } = req.body;
        if (!recipientEmail || !amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Recipient email and valid amount are required' });
        }
        const sender = await User.findById(senderId);
        if (!sender) return res.status(404).json({ error: 'Sender not found' });
        if (sender.email === recipientEmail) return res.status(400).json({ error: 'Cannot transfer to yourself' });
        if (sender.spotBalance < amount) return res.status(400).json({ error: 'Insufficient SPOT balance' });
        // 2FA fallback
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
        const recipient = await User.findOne({ email: recipientEmail });
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
        sender.spotBalance -= amount;
        recipient.spotBalance += amount;
        sender.recentTransactions.push({ type: 'Transfer Out', amount, currency: 'SPOT', date: new Date(), to: recipientEmail });
        recipient.recentTransactions.push({ type: 'Transfer In', amount, currency: 'SPOT', date: new Date(), from: sender.email });
        await sender.save();
        await recipient.save();
        // Notify both sender and recipient
        await Notification.create({
            userId: sender._id,
            message: `You sent ${amount} SPOT to ${recipientEmail}.`,
            read: false
        });
        await Notification.create({
            userId: recipient._id,
            message: `You received ${amount} SPOT from ${sender.email}.`,
            read: false
        });
        // Log activity
        await logActivity('TRANSFER', sender, { recipientEmail, amount });
        res.json({ message: `Transferred ${amount} SPOT to ${recipientEmail}` });
    } catch (err) {
        res.status(500).json({ error: 'Transfer failed' });
    }
});

// Helper: 10 min expiry in ms
const CODE_EXPIRY_MS = 10 * 60 * 1000;

// Helper: set code with timestamp
type CodeWithTime = { code: string, created: number };
function setCode(globalKey: string, email: string, code: string) {
    (global as any)[globalKey] = (global as any)[globalKey] || {};
    (global as any)[globalKey][email] = { code, created: Date.now() };
}
// Helper: get code object
type CodeObj = { code: string, created: number };
function getCode(globalKey: string, email: string): CodeObj | undefined {
    const codes = (global as any)[globalKey] || {};
    return codes[email];
}
// Helper: delete code
function deleteCode(globalKey: string, email: string) {
    const codes = (global as any)[globalKey] || {};
    delete codes[email];
}
// Helper: verify code and expiry
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

// --- NAME CHANGE ---
app.post('/api/send-name-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('nameChangeCodes', user.email, code);
    // Send email
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

app.post('/api/change-name', authenticateToken, async (req: Request, res: Response) => {
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
    // Log activity
    await logActivity('USER_UPDATE', user, { changedFields: ['fullName'] });
    res.json({ message: 'Name updated successfully' });
});

// --- EMAIL CHANGE ---
app.post('/api/send-email-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('emailChangeCodes', user.email, code);
    // Send email
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

app.post('/api/change-email', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newEmail, spotid } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Check spotid matches
    if (user.spotid !== spotid) {
        res.status(400).json({ error: 'Invalid spotid' });
        return;
    }
    // Check if new email already exists
    const existing = await User.findOne({ email: newEmail });
    if (existing) {
        res.status(400).json({ error: 'Email already exists' });
        return;
    }
    user.email = newEmail;
    await user.save();
    // Log activity
    await logActivity('USER_UPDATE', user, { changedFields: ['email'] });
    res.json({ message: 'Email updated successfully' });
});

// --- WALLET CHANGE ---
app.post('/api/send-wallet-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('walletChangeCodes', user.email, code);
    // Send email
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
              `Your wallet change verification code is: <b style="font-size:20px;color:#1e3c72;">${code}</b>`
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

app.post('/api/change-wallet', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newWallet, code, spotid, twoFAToken } = req.body;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Validate all required fields
    if (!newWallet || !code || !spotid || !twoFAToken) {
        res.status(400).json({ error: 'newWallet, code, spotid, and twoFAToken are required' });
        return;
    }
    // Validate spotid
    if (user.spotid !== spotid) {
        res.status(400).json({ error: 'Invalid spotid' });
        return;
    }
    // Validate 2FA code (always required)
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
    // Check if new wallet already exists
    const existing = await User.findOne({ wallet: newWallet });
    if (existing) {
        res.status(400).json({ error: 'Wallet address already exists' });
        return;
    }
    user.wallet = newWallet;
    await user.save();
    deleteCode('walletChangeCodes', user.email);
    // Log activity
    await logActivity('USER_UPDATE', user, { changedFields: ['wallet'] });
    res.json({ message: 'Wallet updated successfully' });
});

// --- PASSWORD CHANGE ---
app.post('/api/send-password-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('passwordChangeCodes', user.email, code);
    // Send email
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
              `Your password change verification code is: <b style="font-size:20px;color:#1e3c72;">${code}</b>`
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

app.post('/api/change-password', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { newPassword, code, spotid } = req.body; // REMOVE twoFAToken
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
    // REMOVE 2FA checks for password change
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
        console.error('Error updating password:', err); // Log error to backend console
        res.status(500).json({ error: 'Failed to update password', details: err instanceof Error ? err.message : err });
    }
});

// --- WITHDRAWAL ---
app.post('/api/send-withdrawal-verification', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('withdrawalCodes', user.email, code);
    // Send email
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

app.post('/api/withdraw', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const { amount, verificationCode, twoFACode } = req.body;
    // --- TEAM STOCK CHECK ---
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Get all team member userIds
    const teamMemberIds = (user.teamMembers || []).map((tm: any) => tm.userId);
    if (!teamMemberIds.length) {
        res.status(403).json({ error: 'You cannot withdraw until you have at least 1 team member who has ever purchased a stock plan.' });
        return;
    }
    if (!amount || isNaN(amount) || amount < 10) {
        res.status(400).json({ error: 'Minimum withdrawal amount is 10 USDT' });
        return;
    }
    // Deduct USDT balance immediately
    if (user.usdtBalance < amount) {
        res.status(400).json({ error: 'Insufficient USDT balance' });
        return;
    }
    user.usdtBalance -= amount;
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

// Admin: Get all deposit sessions (optionally filter by status)
app.get('/api/admin/deposits', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    // Find all deposit sessions with status 'pending', populate user info
    const deposits = await DepositSession.find({ status: 'pending' })
      .populate('userId', 'email spotid')
      .sort({ createdAt: -1 });
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deposit requests' });
  }
});

// --- Manual Deposit Endpoint ---
app.post('/api/deposit/manual', authenticateToken, async (req: Request, res: Response) => {
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

// Admin: Get all users
app.get('/api/admin/users', authenticateAdmin, async (req: Request, res: Response) => {
    try {
        const users = await User.find({}, 'fullName email spotid wallet usdtBalance spotBalance');
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Admin: Update user details
app.put('/api/admin/users/:id', authenticateAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fullName, email, spotid, wallet, usdtBalance, spotBalance } = req.body;
    try {
        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // Check for unique email, wallet, spotid (if changed)
        if (email && email !== user.email) {
            const exists = await User.findOne({ email });
            if (exists) {
                res.status(400).json({ error: 'Email already exists' });
                return;
            }
            user.email = email;
        }
        if (wallet && wallet !== user.wallet) {
            const exists = await User.findOne({ wallet });
            if (exists) {
                res.status(400).json({ error: 'Wallet address already exists' });
                return;
            }
            user.wallet = wallet;
        }
        if (spotid && spotid !== user.spotid) {
            const exists = await User.findOne({ spotid });
            if (exists) {
                res.status(400).json({ error: 'Spot ID already exists' });
                return;
            }
            user.spotid = spotid;
        }
        if (typeof fullName === 'string') user.fullName = fullName;
        if (typeof usdtBalance === 'number') user.usdtBalance = usdtBalance;
        if (typeof spotBalance === 'number') user.spotBalance = spotBalance;

        await user.save();
        // Log activity for admin user update
        await logActivity('USER_UPDATE', user, { updatedBy: 'admin', updatedFields: { fullName, email, spotid, wallet, usdtBalance, spotBalance } });
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Admin: Delete user
app.delete('/api/admin/users/:id', authenticateAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Optionally, clean up related data (e.g., activities, deposits, etc.)
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin: Get all withdrawal requests
app.get('/admin/withdrawals', asyncHandler(async (req: Request, res: Response) => {
    // TODO: Add admin authentication
    const withdrawals = await Withdrawal.find().populate('userId', 'spotid wallet email');
    res.json({ withdrawals });
}));

// Admin: Approve withdrawal
app.post('/admin/withdrawals/:id/approve', asyncHandler(async (req: Request, res: Response) => {
    // TODO: Add admin authentication
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    withdrawal.status = 'approved';
    withdrawal.updatedAt = new Date();
    await withdrawal.save();
    // Optionally notify user of approval
    await Notification.create({
        userId: withdrawal.userId,
        message: `withdrawal of ${withdrawal.amount} USDT Successful✅.`
    });
    res.json({ message: 'Withdrawal approved' });
}));

// --- ADMIN: GET ALL DEPOSIT REQUESTS ---
app.get('/api/admin/deposits', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    // Find all deposit sessions with status 'pending', populate user info
    const deposits = await DepositSession.find({ status: 'pending' })
      .populate('userId', 'email spotid')
      .sort({ createdAt: -1 });
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deposit requests' });
  }
});

// Admin: Reject withdrawal
app.post('/admin/withdrawals/:id/reject', asyncHandler(async (req: Request, res: Response) => {
    // TODO: Add admin authentication
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status === 'rejected') {
        return res.status(400).json({ error: 'Withdrawal already rejected' });
    }
    withdrawal.status = 'rejected';
    withdrawal.updatedAt = new Date();
    await withdrawal.save();
    // Refund amount to user
    const user = await User.findById(withdrawal.userId);
    if (user) {
        user.usdtBalance += withdrawal.amount ?? 0;
        user.recentTransactions = user.recentTransactions || [];
        user.recentTransactions.push({
            type: 'Withdrawal Refund',
            amount: withdrawal.amount ?? 0,
            currency: 'USDT',
            date: new Date(),
            note: 'Withdrawal rejected by admin'
        });
        await user.save();
    }
    // Notify user of rejection
    await Notification.create({
        userId: withdrawal.userId,
        message: `Withdrawal of ${withdrawal.amount} USDT rejected❌.`
    });
    res.json({ message: 'Withdrawal rejected, user notified, and amount refunded' });
}));

// --- ANNOUNCEMENT ENDPOINTS ---
app.get('/api/announcement', async (req: Request, res: Response) => {
  try {
    let announcement = await Announcement.findOne();
    if (!announcement) {
      announcement = await Announcement.create({ notice: '' });
    }
    res.json({ notice: announcement.notice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// Set/update the announcement
app.post('/api/announcement', async (req: Request, res: Response) => {
  const { notice } = req.body;
  try {
    let announcement = await Announcement.findOne();
    if (!announcement) {
      announcement = await Announcement.create({ notice });
    } else {
      announcement.notice = notice;
      announcement.updatedAt = new Date();
      await announcement.save();
    }
    // Notify all users of the new announcement
    const users = await User.find({}, '_id');
    const notifications = users.map((u: any) => ({
      userId: u._id,
      message: `Announcement: ${notice}`,
      read: false
    }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
    res.json({ message: 'Announcement updated', notice: announcement.notice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// --- 2FA SETUP ENDPOINT ---
app.post('/api/2fa/setup', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  // Generate a new TOTP secret
  const secret = speakeasy.generateSecret({
    name: `TradeSpot (${user.email})`,
    length: 32
  });
  // Save the secret to the user (but do not enable 2FA yet)
  user.twoFA = { enabled: false, secret: secret.base32 };
  await user.save();
  // Generate QR code for Google Authenticator
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

// --- 2FA VERIFY ENDPOINT ---
app.post('/api/2fa/verify', authenticateToken, async (req: Request, res: Response) => {
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

// --- 2FA STATUS ENDPOINT ---
app.get('/api/2fa/status', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ enabled: !!(user.twoFA && user.twoFA.enabled) });
});

// --- ADMIN: GET RECENT ACTIVITIES ---
app.get('/api/admin/recent-activities', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const activities = await Activity.find({}).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ activities });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Auto-delete activities older than 24 hours (run every hour)
cron.schedule('0 * * * *', async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const result = await Activity.deleteMany({ createdAt: { $lt: cutoff } });
    if (result.deletedCount) {
      console.log(`[Activity Cleanup] Deleted ${result.deletedCount} activities older than 24h`);
    }
  } catch (err) {
    console.error('[Activity Cleanup] Error:', err);
  }
});

// --- CRON: Update fake buyers' prices every 4 hours ---
cron.schedule('0 */4 * * *', async () => {
  await updateFakeBuyerPrices();
});

// --- CRON: Update fake sellers' prices every 4 hours ---
cron.schedule('0 */4 * * *', async () => {
  await updateFakeSellerPrices();
});

app.use('/api/admin/trash', trashRoutes);

// --- CRON JOB: Randomize buyer statuses every 2 hours ---
cron.schedule('0 */2 * * *', async () => {
  try {
    await randomizeBuyerStatuses();
    await randomizeSellerStatuses();
  } catch (err) {
    console.error('Error randomizing buyer/seller statuses:', err);
  }
});

// --- EMAIL STYLING UTILITY (PRO CENTERED EDITION - COMPACT HEADER) ---
function getStyledEmailHtml(subject: string, body: string) {
  return `
    <div style="background-color:#f4f6fb;padding:0;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6fb;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #e0e6ed;box-shadow:0 10px 30px rgba(18,38,63,0.1);text-align:center;">
              <tr>
                <td style="background:#1e3c72;padding:20px 16px;text-align:center;border-top-left-radius:12px;border-top-right-radius:12px;">
                  <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:1px;">TRADESPOT</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 24px 16px 24px;text-align:center;">
                  <h2 style="font-size:20px;color:#1e3c72;font-weight:700;margin:0 0 16px 0;">${subject}</h2>
                  <p style="font-size:16px;line-height:1.6;color:#3a3a3a;margin:0;">
                    ${body}
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;text-align:center;font-size:13px;color:#8c94a4;border-top:1px solid #e6eaf0;">
                  <p style="margin:0;">If you did not request this email, you can safely ignore it.</p>
                  <p style="margin:4px 0 0 0;font-weight:600;color:#1e3c72;">— Tradespot Security Team</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

app.get('/api/deposit/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Find the most recent pending deposit session for this user
    const session = await DepositSession.findOne({
      userId: (req as any).user._id,
      status: { $in: ['pending', 'approved'] },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!session) {
      // No pending session found, check if any session expired recently
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
    // Still pending
    return res.json({ status: 'pending' });
  } catch (err) {
    return res.status(500).json({ status: 'failed', error: 'Server error' });
  }
});

// Get user's recent transactions
app.get('/api/transactions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId || (req as any).user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Return all recent transactions, or limit if needed
    res.json({ transactions: user.recentTransactions || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// --- NOTIFICATIONS API ---
// Get all notifications for the logged-in user
app.get('/api/notifications', authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
        res.json({ notifications });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark all notifications as read for the logged-in user
app.patch('/api/notifications/mark-read', authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// --- FUNDS PRIVACY VERIFICATION CODE ---
app.post('/api/send-funds-privacy-code', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user || typeof user.email !== 'string') {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCode('fundsPrivacyCodes', user.email, code);
    // Send email
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
            subject: 'Funds Privacy Verification Code',
            html: getStyledEmailHtml(
              'Funds Privacy Verification',
              `Your funds privacy verification code is: <b style="font-size:20px;color:#1e3c72;">${code}</b>`
            )
        });
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        console.error('Error sending funds privacy code email:', err); // Log error to backend console
        res.status(500).json({ error: 'Failed to send email', details: err instanceof Error ? err.message : err });
    }
});

// Admin: Get all deposit sessions (optionally filter by status)
app.get('/api/admin/deposits', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    // Find all deposit sessions with status 'pending', populate user info
    const deposits = await DepositSession.find({ status: 'pending' })
      .populate('userId', 'email spotid')
      .sort({ createdAt: -1 });
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deposit requests' });
  }
});

cron.schedule('*/1 * * * *', async () => {
  try {
    // Find all pending sell orders where autoCompleteAt is in the past
    const pendingOrders = await Order.find({
      type: 'sell',
      status: 'pending',
      autoCompleteAt: { $lte: new Date() }
    });

    for (const order of pendingOrders) {
      const user = await User.findById(order.userId);
      if (!user) continue;
      if (user.spotBalance < order.spotAmount) continue;
      user.spotBalance -= order.spotAmount;
      user.usdtBalance += order.usdtAmount;
      user.recentTransactions = user.recentTransactions || [];
      user.recentTransactions.push({
        type: 'P2P Sell',
        amount: order.spotAmount,
        currency: 'SPOT',
        date: new Date(),
        note: `Sold to ${order.sellerUsername || ''}`
      });
      await user.save();

      order.status = 'completed';
      order.completedAt = new Date();
      await order.save();
    }
    if (pendingOrders.length) {
      console.log(`[Auto-Complete Sell Orders] Completed ${pendingOrders.length} orders`);
    }
  } catch (err) {
    console.error('[Auto-Complete Sell Orders] Error:', err);
  }
});

// --- Admin: Approve manual deposit ---
app.post('/api/admin/deposits/:id/approve', authenticateAdmin, async (req: Request, res: Response) => {
  const deposit = await DepositSession.findById(req.params.id).populate('userId');
  if (!deposit || deposit.status === 'approved') return res.status(404).json({ error: 'Deposit not found or already approved' });
  deposit.status = 'approved';
  await deposit.save();
  if (deposit.userId) {
    // Update balance and add to transaction history
    const user = await (await import('./models/User')).default.findById(deposit.userId._id);
    if (user) {
      user.usdtBalance += deposit.amount;
      user.recentTransactions = user.recentTransactions || [];
      user.recentTransactions.push({
        type: 'Deposit',
        amount: deposit.amount,
        currency: 'USDT',
        date: new Date(),
        txid: deposit.txid || undefined
      });
      await user.save();
      // Send notification to user about deposit approval
      await Notification.create({
        userId: user._id,
        message: `Deposit of ${deposit.amount} USDT Successful✅.`,
        read: false
      });
    } else {
      // fallback for old logic
      await (await import('./models/User')).default.findByIdAndUpdate(deposit.userId._id, { $inc: { usdtBalance: deposit.amount } });
    }
  }
  res.json({ message: 'Deposit approved' });
});

// --- Admin: Reject manual deposit ---
app.post('/api/admin/deposits/:id/reject', authenticateAdmin, async (req: Request, res: Response) => {
  const deposit = await DepositSession.findById(req.params.id);
  if (!deposit || deposit.status === 'approved' || deposit.status === 'rejected') return res.status(404).json({ error: 'Deposit not found or already processed' });
  deposit.status = 'rejected';
  await deposit.save();
  if (deposit.userId) {
    await Notification.create({
      userId: deposit.userId,
      message: `Deposit of ${deposit.amount} USDT rejected❌.`,
      read: false
    });
  }
  res.json({ message: 'Deposit rejected' });
});

// ADMIN: Get all users who have team members and the number of members they have
app.get('/api/admin/team-users', authenticateAdmin, async (req: Request, res: Response) => {
    const users = await User.find({ 'teamMembers.0': { $exists: true } });
    const result = users.map((u: any) => ({
       
        id: u._id,
        fullName: u.fullName,
        email: u.email,
        teamCount: u.teamMembers.length
    }));
    res.json(result);
});

app.get('/api/admin/team-members/:userId', authenticateAdmin, async (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
 
  }

  // Get all team member userIds
  const teamUserIds = (user.teamMembers || []).map((tm: any) => tm.userId);
  if (!teamUserIds.length) {
    return res.json({ members: [] });
  }
  // Fetch spotid and email for each team member
  const members = await User.find({ _id: { $in: teamUserIds } }, 'spotid email');
  res.json({ members: members.map((m: any) => ({ spotid: m.spotid, email: m.email })) });
});

// --- BIOMETRIC STATUS ENDPOINT ---
app.get('/api/biometric/status', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ enabled: false });
  }
  // Biometric is enabled if authenticators array exists and is not empty
  const enabled = Array.isArray(user.authenticators) && user.authenticators.length > 0;
  res.json({ enabled });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});