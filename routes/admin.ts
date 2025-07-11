import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import DepositSession from '../models/DepositSession';
import Activity from '../models/Activity';
import Withdrawal from '../models/Withdrawal';
import Notification from '../models/Notification';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// --- ADMIN: SEND FUNDS TO USER BY EMAIL ---
router.post('/send-funds', authenticateToken, async (req: Request, res: Response) => {
    // Only allow admin
    const { userId, isAdmin } = req.user as { userId: string; isAdmin: boolean };
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: Admins only' });
    const adminUser = await User.findById(userId);
    if (!adminUser) {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    const { email, amount, currency, tag } = req.body;
    if (!email || !amount || !currency || !tag) {
        return res.status(400).json({ error: 'Missing required fields: email, amount, currency, tag' });
    }
    if (!['FLEX', 'USDT', 'SPOT'].includes(currency)) {
        return res.status(400).json({ error: 'Invalid currency' });
    }
    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    // Update balance
    switch (currency) {
        case 'FLEX':
            user.flexBalance = (user.flexBalance || 0) + Number(amount);
            break;
        case 'USDT':
            user.usdtBalance = (user.usdtBalance || 0) + Number(amount);
            break;
        case 'SPOT':
            user.spotBalance = (user.spotBalance || 0) + Number(amount);
            break;
    }
    // Log transaction
    user.recentTransactions = user.recentTransactions || [];
    user.recentTransactions.push({
        type: tag,
        amount: Number(amount),
        currency,
        date: new Date(),
        note: `Admin sent funds: ${tag}`
    });
    await user.save();
    // Optionally, notify user
    try {
        await Notification.create({
            userId: user._id,
            message: `${tag} ${amount} ${currency}`
        });
    } catch (e) {}
    res.json({ message: `Funds sent to ${email} (${amount} ${currency}) with tag '${tag}'` });
});
// --- ADMIN: GET ALL USERS ---
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
    try {
        // Sort users by createdAt descending (newest first)
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// --- ADMIN: UPDATE USER ---
router.put('/users/:id', authenticateToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fullName, email, spotid, wallet, usdtBalance, spotBalance, flexBalance } = req.body;
    try {
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.fullName = fullName;
        user.email = email;
        user.spotid = spotid;
        user.wallet = wallet;
        user.usdtBalance = usdtBalance;
        user.spotBalance = spotBalance;
        user.flexBalance = flexBalance;
        await user.save();
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// --- ADMIN: DELETE USER ---
router.delete('/users/:id', authenticateToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- ADMIN: GET ALL DEPOSIT REQUESTS ---
router.get('/deposits', authenticateToken, async (req: Request, res: Response) => {
    try {
        const deposits = await DepositSession.find({ status: 'pending' })
            .populate('userId', 'email spotid')
            .sort({ createdAt: -1 });
        res.json({ deposits });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch deposit requests' });
    }
});

// --- ADMIN: GET RECENT ACTIVITIES ---
router.get('/recent-activities', authenticateToken, async (req: Request, res: Response) => {
    try {
        const activities = await Activity.find({}).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ activities });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// --- ADMIN: GET ALL WITHDRAWALS ---
router.get('/withdrawals', authenticateToken, async (req: Request, res: Response) => {
    const withdrawals = await Withdrawal.find().populate('userId', 'spotid wallet email');
    res.json({ withdrawals });
});

// --- ADMIN: APPROVE WITHDRAWAL ---
router.post('/withdrawals/:id/approve', authenticateToken, async (req: Request, res: Response) => {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    withdrawal.status = 'approved';
    withdrawal.updatedAt = new Date();
    await withdrawal.save();
    await Notification.create({
        userId: withdrawal.userId,
        message: `withdrawal of ${withdrawal.amount} USDT Successful✅.`
    });
    res.json({ message: 'Withdrawal approved' });
});

// --- ADMIN: REJECT WITHDRAWAL ---
router.post('/withdrawals/:id/reject', authenticateToken, async (req: Request, res: Response) => {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status === 'rejected') {
        return res.status(400).json({ error: 'Withdrawal already rejected' });
    }
    withdrawal.status = 'rejected';
    withdrawal.updatedAt = new Date();
    await withdrawal.save();
    const user = await User.findById(withdrawal.userId);
    if (user) {
        user.usdtBalance += withdrawal.amount ?? 0;
        user.recentTransactions = user.recentTransactions || [];
        user.recentTransactions.push({
            type: 'Withdrawal Refund',
            amount: withdrawal.amount ?? 0,
            currency: 'USDT',
            date: new Date(),
            note: 'Withdrawal rejected by admin'
        });
        await user.save();
    }
    await Notification.create({
        userId: withdrawal.userId,
        message: `Withdrawal of ${withdrawal.amount} USDT rejected❌.`
    });
    res.json({ message: 'Withdrawal rejected, user notified, and amount refunded' });
});

// --- ADMIN: GET ALL TEAM USERS (with team info) ---
router.get('/team-users', authenticateToken, async (req: Request, res: Response) => {
    try {
        // Get all users with their teamMembers populated (basic info)
        const users = await User.find({}, 'fullName email spotid teamMembers')
            .populate({
                path: 'teamMembers.userId',
                select: 'spotid email'
            });
        // Format for frontend: id, fullName, email, teamCount
        const formatted = users.map((u: any) => ({
            id: u._id,
            fullName: u.fullName,
            email: u.email,
            teamCount: (u.teamMembers || []).length
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch team users' });
    }
});

// --- ADMIN: GET TEAM MEMBERS FOR A USER ---
router.get('/team-members/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.params.id).populate({
            path: 'teamMembers.userId',
            model: 'User',
            select: 'spotid email'
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        // Return array of { spotid, email }, filter out incomplete/null
        const members = (user.teamMembers || [])
            .filter((tm: any) => tm.userId && tm.userId.spotid)
            .map((tm: any) => ({
                spotid: tm.userId.spotid,
                email: tm.userId.email
            }));
        res.json({ members });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch team members' });
    }
});

// --- ADMIN: TOGGLE VALID MEMBER ---
router.post('/users/:id/toggle-valid-member', authenticateToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.validMember = !user.validMember;
        await user.save();
        res.json({ validMember: user.validMember });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle valid member status' });
    }
});

// --- ADMIN: APPROVE DEPOSIT ---
router.post('/deposits/:id/approve', authenticateToken, async (req: Request, res: Response) => {
    try {
        const deposit = await DepositSession.findById(req.params.id);
        if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
        if (deposit.status === 'approved') {
            return res.status(400).json({ error: 'Deposit already approved' });
        }
        deposit.status = 'approved';
        deposit.updatedAt = new Date();
        await deposit.save();
        const user = await User.findById(deposit.userId);
        if (user) {
            user.flexBalance = (user.flexBalance || 0) + (deposit.amount ?? 0);
            user.recentTransactions = user.recentTransactions || [];
            user.recentTransactions.push({
                type: 'Deposit',
                amount: deposit.amount ?? 0,
                currency: 'FLEX',
                date: new Date(),
                note: 'Deposit approved by admin'
            });
            await user.save();
        }
        await Notification.create({
            userId: deposit.userId,
            message: `Deposit of ${deposit.amount} FLEX approved and credited.`
        });
        res.json({ message: 'Deposit approved and credited to FLEX balance' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to approve deposit' });
    }
});

// --- ADMIN: GET PLATFORM STATS ---
router.get('/platform-stats', authenticateToken, async (req: Request, res: Response) => {
    try {
        const [totalDeposits, totalWithdrawals, totalUsers, totalP2P] = await Promise.all([
            DepositSession.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),
            Withdrawal.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),
            User.countDocuments({}),
            require('../models/Order').default.countDocuments({ status: 'completed' })
        ]);
        res.json({
            totalDeposits: totalDeposits[0]?.total || 0,
            totalWithdrawals: totalWithdrawals[0]?.total || 0,
            totalUsers,
            totalP2PTrades: totalP2P
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
});

export default router;
