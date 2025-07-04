import mongoose from "mongoose";

const sellerSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  userId: { type: String, unique: true }, // 4-digit string
  vipLevel: Number,
  spotBalance: Number,
  minLimit: Number,
  maxLimit: Number,
  status: { type: String, enum: ['online', 'offline', 'recently'] },
  rating: Number, // e.g., 4.8
  reviews: [String],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("SellerModel", sellerSchema);
