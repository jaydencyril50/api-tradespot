"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var mongoose_1 = require("mongoose");
var cors_1 = require("cors");
var bcryptjs_1 = require("bcryptjs");
var jsonwebtoken_1 = require("jsonwebtoken");
var dotenv = require("dotenv");
var node_cron_1 = require("node-cron");
var nodemailer_1 = require("nodemailer");
dotenv.config();
var app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
var MONGO_URI = process.env.MONGO_URI;
var JWT_SECRET = process.env.JWT_SECRET;
mongoose_1.default.connect(MONGO_URI)
    .then(function () { return console.log('MongoDB connected'); })
    .catch(function (err) { return console.error('MongoDB connection error:', err); });
var userSchema = new mongoose_1.default.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    wallet: String,
    usdtBalance: { type: Number, default: 0 },
    spotBalance: { type: Number, default: 0 },
    recentTransactions: {
        type: [
            {
                type: { type: String },
                amount: Number,
                currency: String,
                date: Date
            }
        ],
        default: []
    },
    profilePicture: String, // Add profilePicture field to schema
    referralCode: { type: String, unique: true, required: true },
    referredBy: String, // referral code of the user who referred
    teamMembers: [
        {
            userId: mongoose_1.default.Schema.Types.ObjectId,
            joinedAt: Date
        }
    ],
    spotid: { type: String, unique: true, required: true } // Add spotid field
});
var User = mongoose_1.default.model('User', userSchema);
// Stock schema (available stocks in the market)
var stockSchema = new mongoose_1.default.Schema({
    name: String,
    price: Number, // price in SPOT
    profit: { type: Number, default: 0.02 }, // daily profit rate (2%)
    purchaseAmount: Number, // minimum purchase amount in SPOT
    durationDays: { type: Number, default: 365 }, // e.g. 365
    createdAt: { type: Date, default: Date.now }
});
var Stock = mongoose_1.default.model('Stock', stockSchema);
// StockPurchase schema (user's purchased stocks)
var stockPurchaseSchema = new mongoose_1.default.Schema({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    stockId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Stock' },
    purchaseAmount: Number, // in SPOT
    profit: Number, // daily profit rate
    startDate: { type: Date, default: Date.now },
    expiresAt: Date,
    completed: { type: Boolean, default: false },
    lastCredited: Date, // last date profit was credited
    totalCredited: { type: Number, default: 0 }
});
var StockPurchase = mongoose_1.default.model('StockPurchase', stockPurchaseSchema);
app.post('/auth/register', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, fullName, email, password, wallet, referredBy, referrer, existing, walletExists, referralCode, chars, hash, user;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, fullName = _a.fullName, email = _a.email, password = _a.password, wallet = _a.wallet, referredBy = _a.referredBy;
                if (!fullName || !email || !password || !wallet || !referredBy) {
                    res.status(400).json({ error: 'All fields required, including referral link' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, User.findOne({ referralCode: referredBy })];
            case 1:
                referrer = _b.sent();
                if (!referrer) {
                    res.status(400).json({ error: 'Referral link is invalid or does not exist' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, User.findOne({ email: email })];
            case 2:
                existing = _b.sent();
                if (existing) {
                    res.status(400).json({ error: 'Email already exists' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, User.findOne({ wallet: wallet })];
            case 3:
                walletExists = _b.sent();
                if (walletExists) {
                    res.status(400).json({ error: 'Wallet address already exists' });
                    return [2 /*return*/];
                }
                chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                _b.label = 4;
            case 4:
                referralCode = Array.from({ length: 6 }, function () { return chars[Math.floor(Math.random() * chars.length)]; }).join('');
                _b.label = 5;
            case 5: return [4 /*yield*/, User.findOne({ referralCode: referralCode })];
            case 6:
                if (_b.sent()) return [3 /*break*/, 4];
                _b.label = 7;
            case 7: return [4 /*yield*/, bcryptjs_1.default.hash(password, 10)];
            case 8:
                hash = _b.sent();
                user = new User({ fullName: fullName, email: email, password: hash, wallet: wallet, usdtBalance: 0, spotBalance: 0, referralCode: referralCode, referredBy: referredBy });
                return [4 /*yield*/, user.save()];
            case 9:
                _b.sent();
                // Add this user to the referrer's teamMembers
                referrer.teamMembers.push({ userId: user._id, joinedAt: new Date() });
                return [4 /*yield*/, referrer.save()];
            case 10:
                _b.sent();
                res.json({ message: 'User registered successfully', referralCode: referralCode });
                return [2 /*return*/];
        }
    });
}); });
app.post('/auth/login', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, password, user, valid, token;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, email = _a.email, password = _a.password;
                return [4 /*yield*/, User.findOne({ email: email })];
            case 1:
                user = _b.sent();
                if (!user || !user.password) {
                    res.status(400).json({ error: 'Invalid credentials' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcryptjs_1.default.compare(password, user.password)];
            case 2:
                valid = _b.sent();
                if (!valid) {
                    res.status(400).json({ error: 'Invalid credentials' });
                    return [2 /*return*/];
                }
                token = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
                res.json({ token: token, user: { id: user._id, fullName: user.fullName, email: user.email, wallet: user.wallet, usdtBalance: user.usdtBalance, spotBalance: user.spotBalance } });
                return [2 /*return*/];
        }
    });
}); });
// JWT authentication middleware
function authenticateToken(req, res, next) {
    var authHeader = req.headers['authorization'];
    var token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, function (err, user) {
        if (err) {
            res.status(403).json({ error: 'Invalid token' });
            return;
        }
        req.user = user;
        next();
        return;
    });
}
// Example protected route
app.get('/api/portfolio', authenticateToken, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, user;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = req.user.userId;
                return [4 /*yield*/, User.findById(userId)];
            case 1:
                user = _a.sent();
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return [2 /*return*/];
                }
                res.json({
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    wallet: user.wallet,
                    usdtBalance: user.usdtBalance,
                    spotBalance: user.spotBalance,
                    recentTransactions: user.recentTransactions ? user.recentTransactions.slice(-5).reverse() : [],
                    profilePicture: user.profilePicture // Include profilePicture in response
                });
                return [2 /*return*/];
        }
    });
}); });
app.put('/api/portfolio', authenticateToken, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, profilePicture, user, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = req.user.userId;
                profilePicture = req.body.profilePicture;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                return [4 /*yield*/, User.findById(userId)];
            case 2:
                user = _a.sent();
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return [2 /*return*/];
                }
                if (profilePicture) {
                    user.profilePicture = profilePicture;
                }
                return [4 /*yield*/, user.save()];
            case 3:
                _a.sent();
                res.json({ message: 'Profile updated', profilePicture: user.profilePicture });
                return [3 /*break*/, 5];
            case 4:
                err_1 = _a.sent();
                res.status(500).json({ error: 'Failed to update profile' });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Convert endpoint: USDT <-> SPOT
app.post('/api/convert', authenticateToken, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, _a, direction, amount, CONVERT_RATE, user, err_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                userId = req.user.userId;
                _a = req.body, direction = _a.direction, amount = _a.amount;
                CONVERT_RATE = 1;
                if (!direction || !amount || isNaN(amount) || amount <= 0) {
                    res.status(400).json({ error: 'Invalid conversion request' });
                    return [2 /*return*/];
                }
                _b.label = 1;
            case 1:
                _b.trys.push([1, 8, , 9]);
                return [4 /*yield*/, User.findById(userId)];
            case 2:
                user = _b.sent();
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return [2 /*return*/];
                }
                // USDT_TO_SPOT
                if (direction === 'USDT_TO_SPOT') {
                    if (user.usdtBalance < amount) {
                        res.status(400).json({ error: 'Insufficient USDT balance' });
                        return [2 /*return*/];
                    }
                    user.usdtBalance -= amount;
                    user.spotBalance += amount / CONVERT_RATE;
                    user.recentTransactions.push({ type: 'Convert', amount: amount / CONVERT_RATE, currency: 'SPOT', date: new Date() });
                    return [4 /*yield*/, user.save()];
                }
                // SPOT_TO_USDT
                if (direction === 'SPOT_TO_USDT') {
                    if (user.spotBalance < amount) {
                        res.status(400).json({ error: 'Insufficient SPOT balance' });
                        return [2 /*return*/];
                    }
                    user.spotBalance -= amount;
                    user.usdtBalance += amount * CONVERT_RATE;
                    user.recentTransactions.push({ type: 'Convert', amount: amount, currency: 'USDT', date: new Date() });
                    return [4 /*yield*/, user.save()];
                }
                res.status(400).json({ error: 'Invalid conversion direction' });
                _b.label = 7;
            case 7: return [3 /*break*/, 9];
            case 8:
                err_2 = _b.sent();
                res.status(500).json({ error: 'Conversion failed' });
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
// Team info endpoint
app.get('/api/team', authenticateToken, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, user, referralLink, members;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = req.user.userId;
                return [4 /*yield*/, User.findById(userId)];
            case 1:
                user = _a.sent();
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return [2 /*return*/];
                }
                referralLink = "".concat(process.env.FRONTEND_URL || 'http://localhost:3000', "/register?ref=").concat(user.referralCode);
                return [4 /*yield*/, Promise.all((user.teamMembers || []).map(function (tm) { return __awaiter(void 0, void 0, void 0, function () {
                        var member, hasActiveStock;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, User.findById(tm.userId)];
                                case 1:
                                    member = _a.sent();
                                    if (!member)
                                        return [2 /*return*/, null];
                                    return [4 /*yield*/, StockPurchase.exists({ userId: member._id, completed: false })];
                                case 2:
                                    hasActiveStock = _a.sent();
                                    return [2 /*return*/, {
                                            id: member._id,
                                            fullName: member.fullName,
                                            email: member.email,
                                            joinedAt: tm.joinedAt,
                                            activeStock: !!hasActiveStock
                                        }];
                            }
                        });
                    }); }))];
            case 2:
                members = _a.sent();
                res.json({ referralLink: referralLink, members: members.filter(Boolean) });
                return [2 /*return*/];
        }
    });
}); });
// Validate referral code endpoint
app.get('/api/validate-referral/:code', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var code, user;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                code = req.params.code;
                return [4 /*yield*/, User.findOne({ referralCode: { $regex: "^".concat(code, "$"), $options: 'i' } })];
            case 1:
                user = _a.sent();
                if (user) {
                    res.json({ valid: true });
                }
                else {
                    res.json({ valid: false });
                }
                return [2 /*return*/];
        }
    });
}); });
app.post('/api/transfer', authenticateToken, function (req, res) {
    (function () { return __awaiter(void 0, void 0, void 0, function () {
        var senderId, _a, recipientEmail, amount, sender, recipient, err_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    senderId = req.user.userId;
                    _a = req.body, recipientEmail = _a.recipientEmail, amount = _a.amount;
                    if (!recipientEmail || !amount || isNaN(amount) || amount <= 0) {
                        res.status(400).json({ error: 'Recipient email and valid amount are required' });
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, User.findById(senderId)];
                case 1:
                    sender = _b.sent();
                    if (!sender) {
                        res.status(404).json({ error: 'Sender not found' });
                        return [2 /*return*/];
                    }
                    if (sender.email === recipientEmail) {
                        res.status(400).json({ error: 'Cannot transfer to yourself' });
                        return [2 /*return*/];
                    }
                    if (sender.spotBalance < amount) {
                        res.status(400).json({ error: 'Insufficient SPOT balance' });
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, User.findOne({ email: recipientEmail })];
                case 2:
                    recipient = _b.sent();
                    if (!recipient) {
                        res.status(404).json({ error: 'Recipient not found' });
                        return [2 /*return*/];
                    }
                    sender.spotBalance -= amount;
                    recipient.spotBalance += amount;
                    sender.recentTransactions.push({ type: 'Transfer Out', amount: amount, currency: 'SPOT', date: new Date(), to: recipientEmail });
                    recipient.recentTransactions.push({ type: 'Transfer In', amount: amount, currency: 'SPOT', date: new Date(), from: sender.email });
                    return [4 /*yield*/, sender.save()];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, recipient.save()];
                case 4:
                    _b.sent();
                    res.json({ message: "Transferred ".concat(amount, " SPOT to ").concat(recipientEmail) });
                    return [3 /*break*/, 6];
                case 5:
                    err_3 = _b.sent();
                    res.status(500).json({ error: 'Transfer failed' });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); })();
});
// Endpoint to send verification code for name change
app.post('/api/send-name-verification', authenticateToken, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, user, code, transporter, err_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = req.user.userId;
                return [4 /*yield*/, User.findById(userId)];
            case 1:
                user = _a.sent();
                if (!user || typeof user.email !== 'string') {
                    res.status(404).json({ error: 'User not found' });
                    return [2 /*return*/];
                }
                code = Math.floor(100000 + Math.random() * 900000).toString();
                // Store code in memory (for demo, should use DB or cache in production)
                global.nameChangeCodes = global.nameChangeCodes || {};
                global.nameChangeCodes[user.email] = code;
                _a.label = 2;
            case 2:
                _a.trys.push([2, 4, , 5]);
                transporter = nodemailer_1.default.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });
                return [4 /*yield*/, transporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: user.email,
                        subject: 'Your Name Change Verification Code',
                        text: "Your verification code is: ".concat(code)
                    })];
            case 3:
                _a.sent();
                res.json({ message: 'Verification code sent' });
                return [3 /*break*/, 5];
            case 4:
                err_4 = _a.sent();
                res.status(500).json({ error: 'Failed to send email' });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Endpoint to change name after verifying code
app.post('/api/change-name', authenticateToken, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, _a, newName, code, user, codes;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                userId = req.user.userId;
                _a = req.body, newName = _a.newName, code = _a.code;
                return [4 /*yield*/, User.findById(userId)];
            case 1:
                user = _b.sent();
                if (!user || typeof user.email !== 'string') {
                    res.status(404).json({ error: 'User not found' });
                    return [2 /*return*/];
                }
                codes = global.nameChangeCodes || {};
                if (!codes[user.email] || codes[user.email] !== code) {
                    res.status(400).json({ error: 'Invalid or expired verification code' });
                    return [2 /*return*/];
                }
                user.fullName = newName;
                return [4 /*yield*/, user.save()];
            case 2:
                _b.sent();
                delete codes[user.email];
                res.json({ message: 'Name updated successfully' });
                return [2 /*return*/];
        }
    });
}); });
app.listen(5000, function () { return console.log('Server running on port 5000'); });
