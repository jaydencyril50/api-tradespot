import mongoose from 'mongoose';
import Order from './models/Order'; // Adjust the path if needed

const MONGO_URI = 'mongodb+srv://User:admin@cluster0.hgfr5.mongodb.net/tradespot?retryWrites=true&w=majority&appName=Cluster0';

async function deleteOrdersByUserId(userId: string) {
  await mongoose.connect(MONGO_URI);
  const result = await Order.deleteMany({ userId });
  console.log(`Deleted ${result.deletedCount} orders for userId ${userId}`);
  await mongoose.disconnect();
}

deleteOrdersByUserId('684705a30404daa7974e6383');