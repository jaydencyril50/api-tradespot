import express, { Request, Response } from 'express';
import User from '../models/User';
import DepositSession from '../models/DepositSession';
import Activity from '../models/Activity';
import Withdrawal from '../models/Withdrawal';
import Notification from '../models/Notification';
import authenticateToken from '../middleware/authenticateToken';

const router = express.Router();

// --- ADMIN: GET ALL USERS ---
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
    try {
        const users = await User.find({}, 'fullName email spotid wallet usdtBalance spotBalance flexBalance faceStatus faceImage');
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
        // Return array of { spotid, email }
        const members = (user.teamMembers || []).map((tm: any) => ({
            spotid: tm.userId?.spotid,
            email: tm.userId?.email
        }));
        res.json({ members });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch team members' });
    }
});

export default router;
