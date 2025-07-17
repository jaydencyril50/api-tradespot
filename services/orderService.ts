import Order from '../models/Order';
import User from '../models/User';

/**
 * Shared order creation logic for both API and bot/cron.
 * Throws on error, returns the created order on success.
 */
export async function createBuyOrder({
  userId,
  buyerId,
  buyerUsername,
  price,
  spotAmount,
  usdtAmount,
  botId,
  isBot = false
}: {
  userId: any,
  buyerId: any,
  buyerUsername: string,
  price: number,
  spotAmount: number,
  usdtAmount: number,
  botId?: any,
  isBot?: boolean
}) {
  // Restrict: Only 1 completed buy order per UTC day
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const startOfDayUTC = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0));
  const endOfDayUTC = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999));

  // --- BOT LOGIC: Only place order with online traders and matching VIP level ---
  if (isBot) {
    // Get the trader (buyer) info
    const BuyerModel = require('../models/Buyermodel').default;
    const UserModel = require('../models/User').default;
    const trader = await BuyerModel.findOne({ userId: buyerId });
    if (!trader) {
      throw new Error('Trader not found');
    }
    // Check trader is online
    if (trader.status !== 'online') {
      throw new Error('Trader is not online');
    }
    // Get logged-in user's vipLevel
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (trader.vipLevel !== user.vipLevel) {
      throw new Error('Trader VIP level does not match user VIP level');
    }
    // Check if user's USDT balance (or order amount) is within trader's min/max trade limits
    const minTrade = trader.rules?.minTrade || 0;
    const maxTrade = trader.rules?.maxTrade || Number.MAX_SAFE_INTEGER;
    // Use usdtAmount for the order amount check
    if (usdtAmount < minTrade || usdtAmount > maxTrade) {
      throw new Error(`Trader's trade limit is ${minTrade}-${maxTrade} USDT. Your order amount is not within this range.`);
    }
  }
  const completedToday = await Order.findOne({
    userId,
    type: { $in: [null, 'buy'] },
    status: 'completed',
    completedAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
  });
  if (completedToday) {
    throw new Error('You can only complete 1 buy order per day (00:00 UTC - 23:59 UTC).');
  }
  // Check user balance
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.usdtBalance < usdtAmount) {
    throw new Error('Insufficient USDT balance');
  }
  // Set display countdown: always 10 min from now
  const displayCountdownEndsAt = new Date(Date.now() + 10 * 60 * 1000);
  // Set auto-complete time: random 1-10 min from now
  const min = 1 * 60 * 1000, max = 10 * 60 * 1000;
  const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
  const autoCompleteAt = new Date(Date.now() + randomMs);
  const order = await Order.create({
    userId,
    buyerId,
    buyerUsername,
    price,
    spotAmount,
    usdtAmount,
    botId,
    status: 'pending',
    displayCountdownEndsAt,
    autoCompleteAt,
    createdAt: new Date(),
    // ...other fields as needed
  });
  // Optionally, deduct balance, send notification, etc.
  return order;
}
