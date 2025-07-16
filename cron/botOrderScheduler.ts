import cron from 'node-cron';
import User from '../models/User';
import Order from '../models/Order';

/**
 * Simulate placing an order and returning profit
 * Replace with your actual order placement logic
 */
async function placeOrderForUser(user: any, type: 'buy' | 'sell', amount: number): Promise<number> {
    // TODO: Integrate with your order system
    // For now, simulate a profit
    const profit = Math.round(amount * (Math.random() * 0.05 + 0.01) * 100) / 100; // 1-6% profit
    // Example: await Order.create({ userId: user._id, type, amount, ... })
    return profit;
}

/**
 * Main bot scheduler logic
 */
async function runBotOrders() {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Math.floor(now.getMinutes() / 10) * 10, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + 10 * 60000);
    const users = await User.find({ botEnabled: true });
    for (const user of users) {
        // Check if user has a settled order in this 10-min window
        const existingOrder = await Order.findOne({
            userId: user._id,
            createdAt: { $gte: windowStart, $lt: windowEnd },
            status: { $in: ['pending', 'completed'] }
        });
        if (existingOrder) {
            // Already settled for this window
            continue;
        }
        // Place orders for user
        let totalProfit = 0;
        if (user.botOrderType === 'buy' || user.botOrderType === 'both') {
            totalProfit += await placeOrderForUser(user, 'buy', user.botDailyOrderAmount);
        }
        if (user.botOrderType === 'sell' || user.botOrderType === 'both') {
            totalProfit += await placeOrderForUser(user, 'sell', user.botDailyOrderAmount);
        }
        // Credit profit
        user.flexBalance += totalProfit;
        user.botLastRun = now;
        await user.save();
        // Optionally, log or notify user
        console.log(`Bot placed order for user ${user.email}: profit ${totalProfit}`);
    }
}

// Schedule to run every 10 minutes
cron.schedule('*/10 * * * *', () => {
    runBotOrders().catch(console.error);
});

export default runBotOrders;
