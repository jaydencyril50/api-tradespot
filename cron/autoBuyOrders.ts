import User from '../models/User';
import Bot from '../models/Bot';
import Order from '../models/Order';
import mongoose from 'mongoose';

// TEMP: Stub for getOnlineBuyTraders. Replace with real implementation.
// Accepts vipLevel and returns only traders matching that level
async function getOnlineBuyTraders(vipLevel: number) {
  // Should return array of { _id, tradeLimit: { min, max }, vipLevel, ... }
  // Example: return await Trader.find({ online: true, vipLevel });
  return [];
}

// This cron will run periodically to place buy orders for users subscribed to bots
export default async function autoBuyOrdersCron() {
  const users = await User.find({ 'botSubscriptions.isActive': true });
  for (const user of users) {
    // Find the active bot subscription
    const activeSub = (user.botSubscriptions || []).find((sub: any) => sub.isActive);
    if (!activeSub) continue;
    const bot = await Bot.findById(activeSub.botId);
    if (!bot || !bot.isActive) continue;

    // Check user's USDT balance and VIP level
    const vipLevel = user.vipLevel || 1;
    const usdtBalance = user.usdtBalance || 0;
    const minTrade = bot.rules?.minTrade || 0;
    const maxTrade = bot.rules?.maxTrade || bot.tradeLimit;
    if (usdtBalance < minTrade) continue; // Not enough to trade

    // Find an online buy trader with a matching trade limit and user's vip level
    const onlineTraders = await getOnlineBuyTraders(vipLevel); // Should return array of { _id, tradeLimit, vipLevel, ... }
    const trader = onlineTraders.find(t => usdtBalance >= t.tradeLimit.min && usdtBalance <= t.tradeLimit.max);
    if (!trader) continue;

    // Check daily buy order limit (1 per day)
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const completedToday = await Order.findOne({
      userId: user._id,
      type: { $in: [null, 'buy'] },
      status: 'completed',
      completedAt: { $gte: startOfDay, $lte: endOfDay }
    });
    if (completedToday) continue;

    // Calculate order amount (respect bot and trader limits)
    let orderAmount = Math.min(usdtBalance, maxTrade, trader.tradeLimit.max);
    if (orderAmount < minTrade) continue;

    // Deduct commission if needed (not implemented here)
    // Place the order
    await Order.create({
      userId: user._id,
      botId: bot._id,
      traderId: trader._id,
      amount: orderAmount,
      type: 'buy',
      status: 'pending',
      createdAt: new Date(),
      // ...other fields as needed
    });
    // Optionally, deduct balance, send notification, etc.
  }
}
