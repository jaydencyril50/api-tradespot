import express from 'express';
import BuyerModel from '../models/Buyermodel';
import { faker } from '@faker-js/faker';

const router = express.Router();

const generateUniqueId = () => Math.floor(1000 + Math.random() * 9000).toString();

const generate200UniqueIds = async (): Promise<string[]> => {
  const ids = new Set<string>();

  while (ids.size < 200) {
    ids.add(generateUniqueId());
  }

  // Check DB for duplicates
  const existing = await BuyerModel.find({ userId: { $in: Array.from(ids) } }).select('userId');
  const existingIds = new Set(existing.map(b => b.userId));

  const filtered = Array.from(ids).filter(id => !existingIds.has(id));

  // If we don't have 200 clean IDs, retry
  if (filtered.length < 200) {
    return await generate200UniqueIds();
  }

  return filtered.slice(0, 200);
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

router.post('/generate-buyers', async (_req, res) => {
  try {
    const buyers = [];
    const userIds = await generate200UniqueIds();

    for (let i = 0; i < 200; i++) {
      buyers.push({
        username: faker.internet.userName() + i,
        userId: userIds[i],
        vipLevel: Math.ceil(Math.random() * 3),
        spotBalance: Math.floor(Math.random() * 5000) + 100,
        minLimit: Math.floor(Math.random() * 100) + 10,
        maxLimit: Math.floor(Math.random() * 900) + 100,
        status: ['online', 'offline', 'recently'][Math.floor(Math.random() * 3)],
        rating: +(Math.random() * 1 + 4).toFixed(2),
        reviews: [
          faker.helpers.arrayElement(reviewSamples1),
          faker.helpers.arrayElement(reviewSamples2),
        ],
      });
    }

    await BuyerModel.insertMany(buyers);
    res.json({ message: '✅ 200 unique simulated buyers created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/buyers', async (_req, res) => {
  try {
    const buyers = await BuyerModel.find().limit(200);
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/test', (_req, res) => {
  res.send('✅ generate-buyers route is alive');
});

export default router;
