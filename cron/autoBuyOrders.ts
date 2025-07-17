import User from '../models/User';
import Bot from '../models/Bot';
import Order from '../models/Order';

import BuyerModel from '../models/Buyermodel';

import { createBuyOrder, createSellOrder } from '../services/orderService';


// Fetch online buyers with matching vipLevel and return their trade limits
async function getOnlineBuyTraders(vipLevel: number) {
  const buyers = await BuyerModel.find({
    status: 'online',
    vipLevel: vipLevel
  });
  // Map to expected format
  return buyers.map(buyer => ({
    _id: buyer._id,
    userId: buyer.userId, // Add userId for type safety
    tradeLimit: { min: buyer.minLimit, max: buyer.maxLimit },
    vipLevel: buyer.vipLevel,
    username: buyer.username,
    price: buyer.price
  }));
}

// This cron will run periodically to place buy orders for users subscribed to bots
export default async function autoBuyOrdersCron() {
  const users = await User.find({ 'botSubscriptions.isActive': true });
  for (let user of users) {
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

    // --- FLEX PROFIT ACTIVATION ---
    // Activate flex profit if not already active (track USDT before buy order)
    if (!user.flexProfitActive) {
      user.flexProfitActive = true;
      user.flexProfitUsdtRecord = user.usdtBalance ?? 0;
      await user.save();
    }

    // Calculate order amount (respect bot and trader limits)
    let orderAmount = Math.min(usdtBalance, maxTrade, trader.tradeLimit.max);
    if (orderAmount < minTrade) continue;

    // Place the order with all required fields
    const price = trader.price;
    const usdtAmount = orderAmount;
    const spotAmount = usdtAmount / price;
    try {
      await createBuyOrder({
        userId: user._id,
        botId: bot._id,
        buyerId: trader.userId,
        buyerUsername: trader.username,
        price,
        spotAmount,
        usdtAmount,
        isBot: true
      });
    } catch (err) {
      // Optionally log error
      console.error('[Bot Auto Buy Orders] Error:', err);
    }
    // Optionally, deduct balance, send notification, etc.
  }
  // --- SELL ORDER LOGIC (bot) ---
  for (let user of users) {
    // Find the active bot subscription
    const activeSub = (user.botSubscriptions || []).find((sub: any) => sub.isActive);
    if (!activeSub) continue;
    const bot = await Bot.findById(activeSub.botId);
    if (!bot || !bot.isActive) continue;

    // Check daily sell order limit (1 per day, pending or completed)
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const existingSellOrderToday = await Order.findOne({
      userId: user._id,
      type: 'sell',
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });
    if (existingSellOrderToday) {
      console.log(`[Bot SellOrder] User ${user._id} already has a sell order today.`);
      continue;
    }

    // Allow sell order if user has any SPOT (from a buy order or otherwise)
    const spotBalance = user.spotBalance || 0;
    console.log(`[Bot SellOrder] User ${user._id} spotBalance: ${spotBalance}`);

    // Check bot's min/max sell (optional, if you want to keep this logic)
    const minSell = bot.rules?.minSell || 0;
    const maxSell = bot.rules?.maxSell || bot.tradeLimit;
    console.log(`[Bot SellOrder] Bot minSell: ${minSell}, maxSell: ${maxSell}`);
    if (spotBalance < minSell) {
      console.log(`[Bot SellOrder] User ${user._id} spotBalance (${spotBalance}) < bot minSell (${minSell})`);
      continue;
    }

    // Find an online seller with a matching trade limit and user's vip level
    const SellerModel = require('../models/Sellermodel').default;
    const vipLevel = user.vipLevel || 1;
    const onlineSellers = await SellerModel.find({ status: 'online', vipLevel });
    console.log(`[Bot SellOrder] Found ${onlineSellers.length} online sellers for VIP ${vipLevel}`);
    const seller = onlineSellers.find((s: any) => {
      const spotAsUsdt = spotBalance * s.price;
      const match = spotAsUsdt >= s.minLimit && spotAsUsdt <= s.maxLimit;
      console.log(`[Bot SellOrder] Checking seller ${s.userId}: spotBalance ${spotBalance} * price ${s.price} = ${spotAsUsdt} USDT, minLimit: ${s.minLimit}, maxLimit: ${s.maxLimit}, match: ${match}`);
      return match;
    });
    if (!seller) {
      console.log(`[Bot SellOrder] No seller found for user ${user._id} with spotBalance ${spotBalance} (converted to USDT)`);
      continue;
    }
    console.log(`[Bot SellOrder] Selected seller ${seller.userId} minLimit: ${seller.minLimit}, maxLimit: ${seller.maxLimit}, price: ${seller.price}`);

    // Calculate sell order amount (respect bot and seller limits)
    let sellAmount = Math.min(spotBalance, maxSell, seller.maxLimit);
    if (sellAmount < minSell) {
      console.log(`[Bot SellOrder] Calculated sellAmount (${sellAmount}) < bot minSell (${minSell})`);
      continue;
    }
    console.log(`[Bot SellOrder] Final sellAmount: ${sellAmount}`);

    // Place the sell order
    const price = seller.price;
    const usdtAmount = sellAmount * price;
    console.log(`[Bot SellOrder] Placing sell order: user ${user._id}, seller ${seller.userId}, spotAmount ${sellAmount}, usdtAmount ${usdtAmount}, price ${price}`);
    const displayCountdownEndsAt = new Date(Date.now() + 10 * 60 * 1000);
    const minMs = 1 * 60 * 1000, maxMs = 10 * 60 * 1000;
    const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    const autoCompleteAt = new Date(Date.now() + randomMs);
    try {
      await createSellOrder({
        userId: user._id,
        botId: bot._id,
        buyerId: seller.userId, // Fix: use buyerId for Order model
        buyerUsername: seller.username, // Fix: use buyerUsername for Order model
        sellerId: user._id,
        sellerUsername: user.fullName || user.email,
        price,
        spotAmount: sellAmount,
        usdtAmount,
        isBot: true
      });
    } catch (err) {
      // Optionally log error
      console.error('[Bot Auto Sell Orders] Error:', err);
    }

    // --- FLEX PROFIT CREDIT/DEACTIVATE ---
    // After sell order, if flexProfitActive and profit made, credit flex and deactivate
    // Re-fetch user from DB to get latest balances
    const freshUser = await User.findById(user._id);
    if (!freshUser) continue;
    user = freshUser;
    if (user.flexProfitActive && typeof user.flexProfitUsdtRecord === 'number') {
      let profit = +(user.usdtBalance - user.flexProfitUsdtRecord).toFixed(2);
      if (profit > 0) {
        // Deduct bot commission percent from profit
        const commissionPercent = bot.commissionPercent || 0; // e.g. 4 for 4%
        const commission = +(profit * (commissionPercent / 100)).toFixed(2);
        const netProfit = +(profit - commission).toFixed(2);
        if (netProfit > 0) {
          user.flexBalance = (user.flexBalance || 0) + netProfit;
          user.usdtBalance = (user.usdtBalance || 0) - netProfit;
        }
        // Optionally: store/log commission somewhere if needed
      }
      user.flexProfitActive = false;
      user.flexProfitUsdtRecord = 0;
      await user.save();
    }
    // Optionally, send notification, etc.
  }
}
