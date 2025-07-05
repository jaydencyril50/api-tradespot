import express from 'express';
import SellerModel from '../models/Sellermodel';
import { faker } from '@faker-js/faker';
import { fetchMarketPrice } from '../utils/fetchMarketPrice';

const router = express.Router();

const generateUniqueId = () => Math.floor(1000 + Math.random() * 9000).toString();

const generate300UniqueIds = async (): Promise<string[]> => {
  const ids = new Set<string>();

  while (ids.size < 300) {
    ids.add(generateUniqueId());
  }

  // Check DB for duplicates
  const existing = await SellerModel.find({ userId: { $in: Array.from(ids) } }).select('userId');
  const existingIds = new Set(existing.map(b => b.userId));

  const filtered = Array.from(ids).filter(id => !existingIds.has(id));

  // If we don't have 300 clean IDs, retry
  if (filtered.length < 300) {
    return await generate300UniqueIds();
  }

  return filtered.slice(0, 300);
};

const reviewSamples1 = [
  'Fast transaction!',
  'Trusted seller \uD83D\uDCAF',
  'Great service, thanks!',
  'Smooth and quick.',
  'Highly recommended!',
  'No delay. All good.',
  'Legit and responsive.',
  'Thanks boss, 5 star!',
  'Good rate. Will use again.',
  'Fast payment. Respect!',
];

const reviewSamples2 = [
  'Awesome guy.',
  'Instant delivery!',
  'Very professional.',
  'This is my plug now.',
  'Reliable and honest!',
  'Worked like magic.',
  'Great communication.',
  'Super friendly dude.',
  'Realest vendor here.',
  'Verified! \uD83D\uDD25',
];

router.post('/generate-sellers', async (_req, res) => {
  try {
    const existingCount = await SellerModel.countDocuments();
    if (existingCount >= 300) {
      return res.status(400).json({ error: 'Sellers already generated.' });
    }
    const sellers = [];
    const userIds = await generate300UniqueIds();
    const marketPrice = await fetchMarketPrice();

    for (let i = 0; i < 300; i++) {
      // Use more small trade limits for minLimit
      const smallLimits = [30, 50, 100, 250];
      const minLimit = smallLimits[Math.floor(Math.random() * smallLimits.length)];
      // maxLimit is a bit higher than minLimit, but still not huge
      const maxLimit = minLimit + Math.floor(Math.random() * 200 + 1); // 1 to 200 USDT above minLimit

      // Price: random 1% to 2% ABOVE market price
      const percent = 1 + Math.random() * 1; // 1% to 2%
      const price = +(marketPrice * (1 + percent / 100)).toFixed(2);

      // Helper to format numbers with K/M/B suffix
      function formatNumber(n: number): string {
        if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + 'B';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(2).replace(/\.00$/, '') + 'K';
        return n.toString();
      }

      // Assign VIP level: 0-99 => 1, 100-199 => 2, 200-299 => 3
      const vipLevel = i < 100 ? 1 : i < 200 ? 2 : 3;

      sellers.push({
        username: faker.internet.userName() + i,
        userId: userIds[i],
        vipLevel,
        spotBalance: Math.floor(Math.random() * 296) + 5, // 5 to 300 spot
        minLimit,
        maxLimit,
        minLimitDisplay: formatNumber(minLimit),
        maxLimitDisplay: formatNumber(maxLimit),
        price, // Add price to each seller
        status: ['online', 'offline', 'recently'][Math.floor(Math.random() * 3)],
        rating: +(Math.random() * 1 + 4).toFixed(2),
        reviews: [
          faker.helpers.arrayElement(reviewSamples1),
          faker.helpers.arrayElement(reviewSamples2),
        ],
      });
    }

    await SellerModel.insertMany(sellers);
    res.json({ message: '✅ 300 unique simulated sellers created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sellers', async (_req, res) => {
  try {
    const sellers = await SellerModel.find().limit(300);
    res.json(sellers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/test-sell', (_req, res) => {
  res.send('✅ generate-sellers route is alive');
});

export default router;
