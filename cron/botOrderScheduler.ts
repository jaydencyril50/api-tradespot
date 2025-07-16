import cron from 'node-cron';
import User from '../models/User';
// import Order from '../models/Order'; // Uncomment and use your actual order model

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
    const users = await User.find({ botEnabled: true });
    for (const user of users) {
        // Check if bot should run (compare botRunTime and botLastRun)
        const runTime = user.botRunTime || '09:00';
        const [runHour, runMinute] = runTime.split(':').map(Number);
        const lastRun = user.botLastRun ? new Date(user.botLastRun) : null;
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), runHour, runMinute);
        if (lastRun && lastRun >= today) continue; // Already ran today
        if (now.getHours() !== runHour || now.getMinutes() !== runMinute) continue; // Not time yet
        // Place orders
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
        console.log(`Bot ran for user ${user.email}: profit ${totalProfit}`);
    }
}

// Schedule to run every minute (can be optimized)
cron.schedule('* * * * *', () => {
    runBotOrders().catch(console.error);
});

export default runBotOrders;
