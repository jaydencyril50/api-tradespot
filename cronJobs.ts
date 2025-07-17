import cron from 'node-cron';
import BuyerModel from './models/Buyermodel';
import SellerModel from './models/Sellermodel';
import Order from './models/Order';
import User from './models/User';
import { updateFakeBuyerPrices } from './cron/updateFakeBuyerPrices';
import { updateFakeSellerPrices } from './cron/updateFakeSellerPrices';
import { randomizeBuyerStatuses } from './utils/randomizeBuyerStatuses';
import { randomizeSellerStatuses } from './utils/randomizeSellerStatuses';
import { fetchMarketPrice } from './utils/fetchMarketPrice';

// Helper: Find an online buyer whose min/max limit matches the user's USDT balance
async function findMatchingOnlineBuyer(usdtBalance, vipLevel) {
  const BuyerModel = (await import('./models/Buyermodel')).default;
  return BuyerModel.findOne({
    status: 'online',
    vipLevel,
    minLimit: { $lte: usdtBalance },
    maxLimit: { $gte: usdtBalance },
  });
}

// Helper: Find an online seller whose min/max limit matches the user's SPOT balance
async function findMatchingOnlineSeller(spotBalance, vipLevel) {
  const SellerModel = (await import('./models/Sellermodel')).default;
  return SellerModel.findOne({
    status: 'online',
    vipLevel,
    minLimit: { $lte: spotBalance },
    maxLimit: { $gte: spotBalance },
  });
}

// Helper: Place a buy order for the user
async function placeBuyOrder(user, buyer) {
  const Order = (await import('./models/Order')).default;
  const price = buyer.price;
  const spotAmount = user.usdtBalance / price;
  const usdtAmount = user.usdtBalance;
  // Set countdowns
  const displayCountdownEndsAt = new Date(Date.now() + 10 * 60 * 1000);
  const min = 1 * 60 * 1000, max = 10 * 60 * 1000;
  const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
  const autoCompleteAt = new Date(Date.now() + randomMs);
  return Order.create({
    userId: user._id,
    buyerId: buyer.userId,
    buyerUsername: buyer.username,
    price,
    spotAmount,
    usdtAmount,
    status: 'pending',
    displayCountdownEndsAt,
    autoCompleteAt,
    type: 'buy',
  });
}

// Helper: Place a sell order for the user
async function placeSellOrder(user, seller) {
  const Order = (await import('./models/Order')).default;
  const price = seller.price;
  const spotAmount = user.spotBalance;
  const usdtAmount = user.spotBalance * price;
  // Set countdowns
  const displayCountdownEndsAt = new Date(Date.now() + 10 * 60 * 1000);
  const min = 1 * 60 * 1000, max = 10 * 60 * 1000;
  const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
  const autoCompleteAt = new Date(Date.now() + randomMs);
  return Order.create({
    userId: user._id,
    buyerId: seller.userId,
    buyerUsername: seller.username,
    sellerId: user._id,
    sellerUsername: user.fullName || user.email,
    price,
    spotAmount,
    usdtAmount,
    status: 'pending',
    displayCountdownEndsAt,
    autoCompleteAt,
    type: 'sell',
  });
}

// Helper: Credit profit to user's FLEX balance
async function creditFlexProfit(user, profit) {
  user.flexBalance = (user.flexBalance || 0) + profit;
  user.recentTransactions = user.recentTransactions || [];
  user.recentTransactions.push({
    type: 'Bot Profit',
    amount: profit,
    currency: 'FLEX',
    date: new Date(),
    note: 'Automated bot trading profit',
  });
  await user.save();
}

// ...existing code...

import Bot from './models/Bot';

// --- CRON JOB: Place daily buy order for users with enabled bots ---
cron.schedule('0 9 * * *', async () => {
  try {
    // Find all active bots with userId in settings
    const bots = await Bot.find({ isActive: true });
    for (const bot of bots) {
      const { userId, vipLevel } = bot.settings || {};
      if (!userId) continue;
      const user = await User.findById(userId);
      if (!user || !user.botEnabled) continue;
      const usdtBalance = user.usdtBalance || 0;
      // Only place order if within bot's trade limit
      if (usdtBalance < bot.tradeLimit) continue;
      // Find a matching online buyer (trader) within trade limit
      const buyer = await BuyerModel.findOne({
        status: 'online',
        vipLevel: vipLevel || user.vipLevel,
        minLimit: { $lte: usdtBalance },
        maxLimit: { $gte: usdtBalance },
      });
      if (!buyer) continue;
      // Place buy order
      const price = buyer.price;
      const spotAmount = usdtBalance / price;
      const order = await Order.create({
        userId: user._id,
        buyerId: buyer.userId,
        buyerUsername: buyer.username,
        price,
        spotAmount,
        usdtAmount: usdtBalance,
        status: 'pending',
        displayCountdownEndsAt: new Date(Date.now() + 10 * 60 * 1000),
        autoCompleteAt: new Date(Date.now() + Math.floor(Math.random() * (10 * 60 * 1000 - 1 * 60 * 1000 + 1)) + 1 * 60 * 1000),
        type: 'buy',
        note: 'BotOrder',
        createdAt: new Date(),
      });
      // Update user balances
      user.usdtBalance -= order.usdtAmount;
      user.spotBalance += order.spotAmount;
      await user.save();
    }
    console.log('[Bot Cron] Daily bot buy orders placed');
  } catch (err) {
    console.error('[Bot Cron] Error placing daily bot buy orders:', err);
  }
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

export function startCronJobs() {
  // --- CRON: Randomly update trade limits every 24 hours
  cron.schedule('0 0 * * *', async () => {
    const buyers = await BuyerModel.find();
    for (const buyer of buyers) {
      const { minLimit, maxLimit } = getRandomLimits();
      buyer.minLimit = minLimit;
      buyer.maxLimit = maxLimit;
      await buyer.save();
    }
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

  // --- CRON JOB: Randomize buyer statuses every 20 minutes ---
  cron.schedule('*/20 * * * *', async () => {
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

  // --- CRON JOB: Randomly complete pending orders every minute ---
  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = new Date();
      const pendingOrders = await Order.find({
        status: 'pending',
        autoCompleteAt: { $gt: now }
      });
      for (const order of pendingOrders) {
        if (Math.random() < 0.12) {
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
}
