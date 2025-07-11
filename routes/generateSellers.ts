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

    // For each VIP level, generate 100 users with 5 buckets of minLimit
    const minLimitBuckets = [
      { min: 30, max: 150 },
      { min: 150, max: 500 },
      { min: 500, max: 1000 },
      { min: 1000, max: 2000 },
      { min: 2000, max: 5000 },
    ];
    let userIdx = 0;
    for (let vipLevel = 1; vipLevel <= 3; vipLevel++) {
      let minPercent, maxPercent;
      if (vipLevel === 1) {
        minPercent = 0.9;
        maxPercent = 1.0;
      } else if (vipLevel === 2) {
        minPercent = 1.2;
        maxPercent = 1.25;
      } else {
        minPercent = 1.4;
        maxPercent = 1.5;
      }
      for (let bucket = 0; bucket < minLimitBuckets.length; bucket++) {
        for (let j = 0; j < 20; j++) {
          const { min, max } = minLimitBuckets[bucket];
          const minLimit = Math.floor(Math.random() * (max - min + 1)) + min;
          // maxLimit: random between 2x and 4x minLimit (same as buyers)
          const maxLimit = Math.floor(minLimit * (2 + Math.random() * 2)); // 2x to 4x
          // Price: random percent ABOVE market price by VIP level
          const percent = Math.random() * (maxPercent - minPercent) + minPercent;
          const price = +(marketPrice * (1 + percent / 100)).toFixed(2);
          function formatNumber(n: number): string {
            if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + 'B';
            if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
            if (n >= 1_000) return (n / 1_000).toFixed(2).replace(/\.00$/, '') + 'K';
            return n.toString();
          }
          sellers.push({
            username: faker.internet.userName() + userIdx,
            userId: userIds[userIdx],
            vipLevel,
            minLimit,
            maxLimit,
            minLimitDisplay: formatNumber(minLimit),
            maxLimitDisplay: formatNumber(maxLimit),
            price,
            status: ['online', 'offline', 'recently'][Math.floor(Math.random() * 3)],
            rating: +(Math.random() * 1 + 4).toFixed(2),
            reviews: [
              faker.helpers.arrayElement(reviewSamples1),
              faker.helpers.arrayElement(reviewSamples2),
            ],
          });
          userIdx++;
        }
      }
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
