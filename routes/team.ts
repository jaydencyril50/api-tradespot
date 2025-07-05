import { Router, Request, Response } from 'express';
import authenticateToken from '../middleware/authenticateToken'; // Adjust path if needed
import User from '../models/User';

const router = Router();

// Team info endpoint
router.get('/', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId);
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Build referral link
    const referralLink = `https://www.tradespot.online/register?ref=${user.referralCode}`;
    // Get team members' info
    const members = await Promise.all(
        (user.teamMembers || []).map(async (tm: any) => {
            const member = await User.findById(tm.userId);
            if (!member) return null;
            return {
                id: member._id,
                fullName: member.fullName,
                email: member.email,
                joinedAt: tm.joinedAt,
                validMember: member.validMember // Add validMember field
            };
        })
    );
    res.json({ referralLink, members: members.filter(Boolean) });
});

// Validate referral code endpoint
router.get('/validate-referral/:code', async (req: Request, res: Response) => {
    const code = req.params.code;
    // Case-insensitive match for referral code
    const user = await User.findOne({ referralCode: { $regex: `^${code}$`, $options: 'i' } });
    if (user) {
        res.json({ valid: true });
    } else {
        res.json({ valid: false });
    }
});

export default router;