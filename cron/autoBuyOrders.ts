import User from '../models/User';
import Bot from '../models/Bot';
import Order from '../models/Order';

import BuyerModel from '../models/Buyermodel';


// Fetch online buyers with matching vipLevel and return their trade limits
async function getOnlineBuyTraders(vipLevel: number) {
  const buyers = await BuyerModel.find({
    status: 'online',
    vipLevel: vipLevel
  });
  // Map to expected format
  return buyers.map(buyer => ({
    _id: buyer._id,
    tradeLimit: { min: buyer.minLimit, max: buyer.maxLimit },
    vipLevel: buyer.vipLevel,
    username: buyer.username,
    price: buyer.price
  }));
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
    // Place the order with all required fields
    const price = trader.price;
    const usdtAmount = orderAmount;
    const spotAmount = usdtAmount / price;
    await Order.create({
      userId: user._id,
      botId: bot._id,
      // traderId is not in Order schema, use buyerId and buyerUsername as required
      buyerId: trader._id,
      buyerUsername: trader.username,
      price,
      spotAmount,
      usdtAmount,
      type: 'buy',
      status: 'pending',
      createdAt: new Date(),
      // ...other fields as needed
    });
    // Optionally, deduct balance, send notification, etc.
  }
}
