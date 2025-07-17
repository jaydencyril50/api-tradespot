import dotenv from 'dotenv';
dotenv.config();

// Fix: Add types for Express handlers and callbacks
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
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
import rewardRouter from './routes/reward';
import Withdrawal from './models/Withdrawal';
import adminRouter from './routes/admin';
import fundsRouter from './routes/funds';
import userSettingsRouter from './routes/userSettings';
import messagesRouter from './routes/messages';
import authRouter from './routes/auth';
import announcementRouter from './routes/announcement';
import { startCronJobs } from './cronJobs';
import botRouter from './routes/bot';
import { asyncHandler, logActivity, ActivityType } from './utils/utility';
import { healthCheckHandler, notFoundHandler } from './utils/handlers';
import webauthnSettingsRouter from './routes/webauthnSettings';
const flexDropLinkRouter = require('./routes/flexDropLink'); 

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
  'https://localhost',
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

// Remove redundant CORS here:
app.get('/auth/google',
  (req: Request, res: Response, next: NextFunction) => {
    console.log('[Google OAuth] /auth/google called');
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Health check route for backend or uptime monitoring
app.get('/', healthCheckHandler);

// Mount chat routes for ProChat functionality
app.use('/api', checkEmailRouter);
app.use('/api', validateRouter);
app.use('/api/team', teamRouter);
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
app.use('/api/announcement', announcementRouter);
app.use('/api/admin/trash', trashRoutes);
app.use('/api/auth', authRouter);
app.use('/api/webauthn-settings', webauthnSettingsRouter);
app.use('/api/flex-drop', flexDropLinkRouter);

// Mount bot routes
app.use('/api/bot', botRouter);

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

// Start cron jobs
startCronJobs();

const startFlexProfitMonitor = () => {
  setInterval(() => {
    monitorFlexProfit().catch((err: any) => console.error('[FLEX PROFIT MONITOR ERROR]', err));
  }, 60000); // every 60 seconds
};

startFlexProfitMonitor();

// Trust proxy to handle X-Forwarded-For header for express-rate-limit (secure setting)
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Catch-all 404 logger (should be last middleware before app.listen)
app.use(notFoundHandler);
