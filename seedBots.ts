import 'dotenv/config';
import mongoose from 'mongoose';
import Bot from './models/Bot';

const bots = [
  {
    name: 'AlphaBot',
    description: 'AlphaBot: 1-50 USDT, 4% commission',
    isActive: true,
    tradeLimit: 50,
    commissionPercent: 4,
    strategy: 'basic',
    rules: { minTrade: 1, maxTrade: 50 },
  },
  {
    name: 'Fireblaze',
    description: 'Fireblaze: 51-150 USDT, 5% commission',
    isActive: true,
    tradeLimit: 150,
    commissionPercent: 5,
    strategy: 'basic',
    rules: { minTrade: 51, maxTrade: 150 },
  },
  {
    name: 'SignalCore',
    description: 'SignalCore: 151-300 USDT, 6% commission',
    isActive: true,
    tradeLimit: 300,
    commissionPercent: 6,
    strategy: 'basic',
    rules: { minTrade: 151, maxTrade: 300 },
  },
  {
    name: 'ProfitPilot',
    description: 'ProfitPilot: 301-500 USDT, 7% commission',
    isActive: true,
    tradeLimit: 500,
    commissionPercent: 7,
    strategy: 'basic',
    rules: { minTrade: 301, maxTrade: 500 },
  },
  {
    name: 'VoltaEdge',
    description: 'VoltaEdge: 501-1000 USDT, 8% commission',
    isActive: true,
    tradeLimit: 1000,
    commissionPercent: 8,
    strategy: 'basic',
    rules: { minTrade: 501, maxTrade: 1000 },
  },
  {
    name: 'ProVoltage',
    description: 'ProVoltage: 1001-2000 USDT, 9% commission',
    isActive: true,
    tradeLimit: 2000,
    commissionPercent: 9,
    strategy: 'basic',
    rules: { minTrade: 1001, maxTrade: 2000 },
  },
  {
    name: 'QuantumBot',
    description: 'QuantumBot: 2001-MAX USDT, 10% commission',
    isActive: true,
    tradeLimit: 1000000,
    commissionPercent: 10,
    strategy: 'basic',
    rules: { minTrade: 2001, maxTrade: 1000000 },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tradespot');
  await Bot.deleteMany({});
  await Bot.insertMany(bots);
  console.log('Bots seeded!');
  process.exit();
}

seed();
