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
import BuyerModel from './models/Buyermodel';
import SellerModel from './models/Sellermodel';
import notificationsRouter from './routes/notifications';
import portfolioRoutes, { monitorFlexProfit } from './routes/portfolio';
import Notification from './models/Notification';
import Withdrawal from './models/Withdrawal';
import adminRouter from './routes/admin';
import fundsRouter from './routes/funds';
import userSettingsRouter from './routes/userSettings';
import messagesRouter from './routes/messages';

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
app.use('/api', checkEmailRouter);
app.use('/api', validateRouter);
app.use('/api/p2p', generateBuyersRouter);
app.use('/api/p2p', generateSellersRouter);
app.use('/api/p2p', orderRoutes);
app.use('/api/p2p', sellOrderRoutes);
app.use('/api/notifications', notificationsRouter);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/admin', adminRouter);
app.use('/api', fundsRouter);
app.use('/api', userSettingsRouter);
app.use('/api/messages', messagesRouter);

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Make io available to routes
app.set('io', io);

// Socket.io connection logic
io.on('connection', (socket) => {
  // Expect client to join their userId room for direct messaging
  socket.on('join', (userId) => {
    if (userId) socket.join(userId.toString());
  });
});

console.log("Mounting portfolio routes at /api/portfolio");

const MONGO_URI = process.env.MONGO_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;

mongoose.connect(MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch((err: any) => console.error('MongoDB connection error:', err));

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
    // Look up admin user in DB
    const adminUser = await User.findOne({ email, isAdmin: true });
    if (!adminUser) {
        return res.status(401).json({ error: 'Admin user not found' });
    }
    const valid = await bcrypt.compare(password, adminUser.password);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    // Generate a unique token ID (jti)
    const tokenId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign({ userId: adminUser._id, email: adminUser.email, isAdmin: true, jti: tokenId }, JWT_SECRET, { expiresIn: '1d' });
    // Remove oldest session if already 2 active
    adminUser.sessions = adminUser.sessions || [];
    if (adminUser.sessions.length >= 2) {
        adminUser.sessions.shift();
    }
    adminUser.sessions.push({ tokenId, device: req.headers['user-agent'] || 'admin', issuedAt: new Date() });
    await adminUser.save();
    res.json({ token });
});

// Admin signup endpoint
app.post('/auth/admin/signup', async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  // Check if admin already exists
  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ error: 'Admin with this email already exists' });
  }
  // Generate a unique referral code and spotid
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

// JWT authentication middleware
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
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

export { authenticateAdmin };

// Example protected route
app.get('/api/portfolio', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Calculate valid team members and VIP level
    const teamMemberIds = (user.teamMembers || []).map((tm: any) => tm.userId);
    let validCount = 0;
    if (teamMemberIds.length > 0) {
        const teamMembers = await User.find({ _id: { $in: teamMemberIds } }, 'validMember');
        validCount = teamMembers.filter((tm: any) => tm.validMember).length;
    }
    let vipLevel = 1;
    if (validCount >= 30) vipLevel = 3;
    else if (validCount >= 10) vipLevel = 2;
    // Optionally, update in DB (uncomment if you want to persist):
    // user.vipLevel = vipLevel; await user.save();
    res.json({
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        wallet: user.wallet,
        usdtBalance: user.usdtBalance,
        spotBalance: user.spotBalance,
        flexBalance: user.flexBalance,
        vipLevel, // Calculated dynamically
        recentTransactions: user.recentTransactions ? user.recentTransactions.slice(-5).reverse() : [],
        profilePicture: user.profilePicture,
        fundsLocked: user.fundsLocked
});
});

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
    // DO NOT create notifications for announcements anymore
    res.json({ message: 'Announcement updated', notice: announcement.notice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// --- CRON: Randomly update trade limits every 24 hours
cron.schedule('0 0 * * *', async () => {
  // Update buyers
  const buyers = await BuyerModel.find();
  for (const buyer of buyers) {
    const { minLimit, maxLimit } = getRandomLimits();
    buyer.minLimit = minLimit;
    buyer.maxLimit = maxLimit;
    await buyer.save();
  }
  // Update sellers
  const sellers = await SellerModel.find();
  for (const seller of sellers) {
    const { minLimit, maxLimit } = getRandomLimits();
    seller.minLimit = minLimit;
    seller.maxLimit = maxLimit;
    await seller.save();
  }
  console.log('Randomized trade limits for all buyers and sellers');
});

// --- CRON: Update fake buyers' prices every 24 hours ---
cron.schedule('0 0 * * *', async () => {
  await updateFakeBuyerPrices();
});

// --- CRON: Update fake sellers' prices every 24 hours ---
cron.schedule('0 0 * * *', async () => {
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

// --- CRON JOB: Auto-complete orders when random countdown expires ---
cron.schedule('*/10 * * * * *', async () => {
  try {
    const now = new Date();
    // Find all pending orders where autoCompleteAt has passed
    const ordersToComplete = await Order.find({
      status: 'pending',
      autoCompleteAt: { $lte: now }
    });
    for (const order of ordersToComplete) {
      const user = await User.findById(order.userId);
      if (!user) continue;
      if (order.type === 'sell') {
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
      } else {
        if (user.usdtBalance < order.usdtAmount) continue;
        user.usdtBalance -= order.usdtAmount;
        user.spotBalance += order.spotAmount;
        user.recentTransactions = user.recentTransactions || [];
        user.recentTransactions.push({
          type: 'P2P Buy',
          amount: order.spotAmount,
          currency: 'SPOT',
          date: new Date(),
          note: `Bought from ${order.buyerUsername || ''}`
        });
      }
      await user.save();
      order.status = 'completed';
      order.completedAt = new Date();
      await order.save();
    }
  } catch (err) {
    console.error('[Auto-complete Orders] Error:', err);
  }
});

cron.schedule('*/1 * * * *', async () => {
  try {
    // Find all pending orders with autoCompleteAt in the future (still within 10 min window)
    const now = new Date();
    const pendingOrders = await Order.find({
      status: 'pending',
      autoCompleteAt: { $gt: now }
    });
    for (const order of pendingOrders) {
      // 1 in 10 chance per minute to complete (adjust probability as needed)
      if (Math.random() < 0.12) { // ~12% chance per minute
        // Complete the order
        const user = await User.findById(order.userId);
        if (!user) continue;
        if (order.type === 'sell') {
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
        } else {
          if (user.usdtBalance < order.usdtAmount) continue;
          user.usdtBalance -= order.usdtAmount;
          user.spotBalance += order.spotAmount;
          user.recentTransactions = user.recentTransactions || [];
          user.recentTransactions.push({
            type: 'P2P Buy',
            amount: order.spotAmount,
            currency: 'SPOT',
            date: new Date(),
            note: `Bought from ${order.buyerUsername || ''}`
          });
        }
        await user.save();
        order.status = 'completed';
        order.completedAt = new Date();
        await order.save();
      }
    }
  } catch (err) {
    console.error('[Random Complete Orders] Error:', err);
  }
});

// --- Start FLEX profit monitor on server startup ---

app.use('/api/portfolio', portfolioRoutes);

const startFlexProfitMonitor = () => {
  setInterval(() => {
    monitorFlexProfit().catch((err: any) => console.error('[FLEX PROFIT MONITOR ERROR]', err));
  }, 60000); // every 60 seconds
};

startFlexProfitMonitor();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Catch-all 404 logger (should be last middleware before app.listen)
app.use((req, res) => {
  console.log(`🚨 404 - No route found for ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found' });
});

// Helper to generate new random limits (same logic as your generation)
function getRandomLimits() {
  const minLimitBuckets = [
    { min: 30, max: 150 },
    { min: 150, max: 500 },
    { min: 500, max: 1000 },
    { min: 1000, max: 2000 },
    { min: 2000, max: 5000 },
  ];
  const bucket = minLimitBuckets[Math.floor(Math.random() * minLimitBuckets.length)];
  const minLimit = Math.floor(Math.random() * (bucket.max - bucket.min + 1)) + bucket.min;
  const maxLimit = Math.floor(minLimit * (2 + Math.random() * 2)); // 2x to 4x
  return { minLimit, maxLimit };
}