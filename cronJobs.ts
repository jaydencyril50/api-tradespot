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

// --- CRON JOB: Automated bot trading for users with botEnabled ---
cron.schedule('*/10 * * * *', async () => {
  try {
    const User = (await import('./models/User')).default;
    const users = await User.find({ botEnabled: true });
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const isBuyWindow = Math.floor(now.getMinutes() / 10) % 2 === 0;
    for (const user of users) {
      const { usdtBalance, spotBalance, vipLevel } = user;
      let profit = 0;
      // Only 1 buy and 1 sell order per user per day
      // BUY WINDOW
      if (isBuyWindow) {
        const buyOrderToday = await Order.findOne({
          userId: user._id,
          type: 'buy',
          note: 'BotOrder',
          createdAt: { $gte: new Date(todayStr), $lt: new Date(now.getTime() + 24*60*60*1000) }
        });
        if (!buyOrderToday && usdtBalance > 0) {
          const buyer = await findMatchingOnlineBuyer(usdtBalance, vipLevel);
          if (buyer) {
            const order = await Order.create({
              userId: user._id,
              buyerId: buyer.userId,
              buyerUsername: buyer.username,
              price: buyer.price,
              spotAmount: usdtBalance / buyer.price,
              usdtAmount: usdtBalance,
              status: 'pending',
              displayCountdownEndsAt: new Date(Date.now() + 10 * 60 * 1000),
              autoCompleteAt: new Date(Date.now() + Math.floor(Math.random() * (10 * 60 * 1000 - 1 * 60 * 1000 + 1)) + 1 * 60 * 1000),
              type: 'buy',
              note: 'BotOrder',
              createdAt: now
            });
            // Simulate instant completion for automation
            user.usdtBalance -= order.usdtAmount;
            user.spotBalance += order.spotAmount;
            profit += (order.spotAmount * order.price);
          }
        }
      } else {
        // SELL WINDOW
        const sellOrderToday = await Order.findOne({
          userId: user._id,
          type: 'sell',
          note: 'BotOrder',
          createdAt: { $gte: new Date(todayStr), $lt: new Date(now.getTime() + 24*60*60*1000) }
        });
        if (!sellOrderToday && spotBalance > 0) {
          const seller = await findMatchingOnlineSeller(spotBalance, vipLevel);
          if (seller) {
            const order = await Order.create({
              userId: user._id,
              buyerId: seller.userId,
              buyerUsername: seller.username,
              sellerId: user._id,
              sellerUsername: user.fullName || user.email,
              price: seller.price,
              spotAmount: spotBalance,
              usdtAmount: spotBalance * seller.price,
              status: 'pending',
              displayCountdownEndsAt: new Date(Date.now() + 10 * 60 * 1000),
              autoCompleteAt: new Date(Date.now() + Math.floor(Math.random() * (10 * 60 * 1000 - 1 * 60 * 1000 + 1)) + 1 * 60 * 1000),
              type: 'sell',
              note: 'BotOrder',
              createdAt: now
            });
            // Simulate instant completion for automation
            user.spotBalance -= order.spotAmount;
            user.usdtBalance += order.usdtAmount;
            profit += (order.price * order.spotAmount);
          }
        }
      }
      // Deduct bot commission and credit profit to FLEX balance if any
      if (profit > 0) {
        const botPercent = user.botPercent ?? 4;
        const commission = (profit * botPercent) / 100;
        const netProfit = profit - commission;
        if (netProfit > 0) {
          await creditFlexProfit(user, netProfit);
        }
      } else {
        await user.save();
      }
      user.botLastRun = now;
      await user.save();
    }
    console.log('[Bot Cron] Automated bot trading completed');
  } catch (err) {
    console.error('[Bot Cron] Error:', err);
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
