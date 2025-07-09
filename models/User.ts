import mongoose, { Document, Types } from "mongoose";
import bcrypt from 'bcryptjs';

// 1. Define WebAuthnCredential interface (now extends Types.Subdocument)
export interface WebAuthnCredential extends Types.Subdocument {
    credentialID: Buffer;
    publicKey: Buffer;
    counter: number;
    transports?: string[];
    credentialType?: string;
    createdAt?: Date;
    nickname?: string;
}

// 2. Define UserDocument interface
export interface UserDocument extends Document {
    fullName: string;
    email: string;
    password: string;
    wallet?: string;
    usdtBalance: number;
    spotBalance: number;
    flexBalance: number;
    referralCode: string;
    spotid: string;
    fundsLocked: boolean;
    isAdmin: boolean;
    webauthnCredentials: Types.DocumentArray<WebAuthnCredential>;
    webauthnSettings: {
        transfer: boolean;
        withdraw: boolean;
        convert: boolean;
    };
    webauthnCredentialsPlain: Array<{
        credentialID: string;
        publicKey: string;
        counter: number;
        transports?: string[];
        credentialType?: string;
        createdAt?: Date;
        nickname?: string;
    }>;

    // Extend with more fields as needed
}

// 3. Define WebAuthnCredentialSchema as a subdocument schema
const WebAuthnCredentialSchema = new mongoose.Schema({
    credentialID: { type: Buffer, required: true },
    publicKey: { type: Buffer, required: true },
    counter: { type: Number, required: true },
    transports: [String],
    credentialType: { type: String },
    createdAt: { type: Date, default: Date.now },
    nickname: { type: String },
}, { _id: false });

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
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Number },
    validMember: { type: Boolean, default: false }, // Admin sets this
    vipLevel: { type: Number, enum: [1, 2, 3], default: 1 },
    flexProfitActive: { type: Boolean, default: false },
    flexProfitUsdtRecord: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false }, // New field for admin users
    banned: { type: Boolean, default: false }, // Add banned field
    webauthnCredentials: {
        type: [WebAuthnCredentialSchema],
        default: []
    },
    webauthnSettings: {
        transfer: { type: Boolean, default: false },
        withdraw: { type: Boolean, default: false },
        convert: { type: Boolean, default: false }
    },
});

// Add toJSON transform to auto-handle Buffers for webauthnCredentials
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        if (ret.webauthnCredentials) {
            // @ts-expect-error: webauthnCredentialsPlain is added dynamically for serialization
            ret.webauthnCredentialsPlain = ret.webauthnCredentials.map((cred: any) => ({
                credentialID: cred.credentialID?.toString('base64url'),
                publicKey: cred.publicKey?.toString('base64url'),
                counter: cred.counter,
                transports: cred.transports,
                credentialType: cred.credentialType,
                createdAt: cred.createdAt,
                nickname: cred.nickname,
            }));
            delete ret.webauthnCredentials;
        }
        return ret;
    },
});

// Add a virtual for webauthnCredentialsPlain
userSchema.virtual('webauthnCredentialsPlain').get(function (this: any) {
    if (!this.webauthnCredentials) return [];
    return this.webauthnCredentials.map((cred: any) => ({
        credentialID: cred.credentialID?.toString('base64url'),
        publicKey: cred.publicKey?.toString('base64url'),
        counter: cred.counter,
        transports: cred.transports,
        credentialType: cred.credentialType,
        createdAt: cred.createdAt,
        nickname: cred.nickname,
    }));
});

// Add comparePassword method to userSchema
userSchema.methods.comparePassword = async function (candidatePassword: string) {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

// 4. Use correct generic when defining your model (with global hot-reload support)
const User = (global as any).User || mongoose.model<UserDocument>('User', userSchema);
(global as any).User = User;
export default User;
