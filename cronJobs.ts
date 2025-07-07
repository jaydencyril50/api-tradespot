import cron from 'node-cron';
import BuyerModel from './models/Buyermodel';
import SellerModel from './models/Sellermodel';
import Order from './models/Order';
import User from './models/User';
import { updateFakeBuyerPrices } from './cron/updateFakeBuyerPrices';
import { updateFakeSellerPrices } from './cron/updateFakeSellerPrices';
import { randomizeBuyerStatuses } from './utils/randomizeBuyerStatuses';
import { randomizeSellerStatuses } from './utils/randomizeSellerStatuses';

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

  // --- CRON JOB: Randomize buyer statuses every 2 hours ---
  cron.schedule('0 */2 * * *', async () => {
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
