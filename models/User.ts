import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    wallet: String,
    usdtBalance: { type: Number, default: 0 },
    spotBalance: { type: Number, default: 0 },
    flexBalance: { type: Number, default: 0 }, // Added flexBalance field
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
    profilePicture: String,
    referralCode: { type: String, unique: true, required: true },
    referredBy: String,
    teamMembers: [
        {
            userId: mongoose.Schema.Types.ObjectId,
            joinedAt: Date
        }
    ],
    spotid: { type: String, unique: true, required: true },
    fundsLocked: { type: Boolean, default: false },
    twoFA: {
        enabled: { type: Boolean, default: false },
        secret: { type: String, default: '' },
    },
    // Add sessions array for JWT device/session tracking
    sessions: [
        {
            tokenId: { type: String }, // Unique identifier for JWT (jti)
            device: { type: String }, // Optional: device info (user-agent, etc)
            issuedAt: { type: Date, default: Date.now }
        }
    ],
    passwordResetCode: { type: String }, // For password reset/verification code
    validMember: { type: Boolean, default: false }, // Admin sets this
    vipLevel: { type: Number, enum: [1, 2, 3], default: 1 },
    flexProfitActive: { type: Boolean, default: false },
    flexProfitUsdtRecord: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false }, // New field for admin users
});

// Use global to avoid OverwriteModelError in dev/hot-reload and production
const User = (global as any).User || mongoose.models.User || mongoose.model('User', userSchema);
(global as any).User = User;
export default User;
