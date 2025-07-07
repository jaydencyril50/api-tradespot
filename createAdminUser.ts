const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User').default || require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tradespot';

async function createAdmin() {
  await mongoose.connect(MONGO_URI);
  const email = process.env.ADMIN_EMAIL || 'admin@tradespot.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hashed = await bcrypt.hash(password, 10);
  const admin = await User.findOneAndUpdate(
    { email },
    {
      email,
      password: hashed,
      fullName: 'Admin',
      isAdmin: true,
      referralCode: 'adminref',
      spotid: 'adminspotid',
      validMember: true
    },
    { upsert: true, new: true }
  );
  console.log('Admin user created/updated:', admin.email);
  await mongoose.disconnect();
}

createAdmin().catch(e => { console.error(e); process.exit(1); });
