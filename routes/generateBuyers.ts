import express from 'express';
import BuyerModel from '../models/Buyermodel';
import { faker } from '@faker-js/faker';

const router = express.Router();

const generateUniqueId = () => Math.floor(1000 + Math.random() * 9000).toString();

router.post('/generate-buyers', async (req, res) => {
  try {
    const buyers = [];

    for (let i = 0; i < 200; i++) {
      buyers.push({
        username: faker.internet.userName() + i,
        userId: generateUniqueId(),
        vipLevel: Math.ceil(Math.random() * 3),
        spotBalance: Math.floor(Math.random() * 5000) + 100, // 100–5100
        minLimit: Math.floor(Math.random() * 100) + 10,      // 10–110
        maxLimit: Math.floor(Math.random() * 900) + 100,     // 100–1000
        status: ['online', 'offline', 'recently'][Math.floor(Math.random() * 3)],
        rating: +(Math.random() * 1 + 4).toFixed(2), // 4.00 – 5.00
        reviews: [
          faker.lorem.words(3),
          faker.lorem.words(5),
        ],
      });
    }

    await BuyerModel.insertMany(buyers);
    res.json({ message: '200 simulated buyers generated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
