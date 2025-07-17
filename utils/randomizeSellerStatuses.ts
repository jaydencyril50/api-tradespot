import SellerModel from '../models/Sellermodel';

// Randomize each seller's status independently every hour
export async function randomizeSellerStatuses() {
  const sellers = await SellerModel.find();
  const statuses: Array<'online' | 'recently' | 'offline'> = ['online', 'recently', 'offline'];
  // Get the current hour since epoch
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  for (const seller of sellers) {
    // Use a seeded random function based on seller id, userId, and hour for more entropy
    const seed = `${seller._id}-${seller.userId || ''}-${hour}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    const index = Math.abs(h) % statuses.length;
    const randomStatus = statuses[index];
    if (seller.status !== randomStatus) {
      seller.status = randomStatus;
      await seller.save();
    }
  }
  // Log the spread for verification
  const count = { online: 0, recently: 0, offline: 0 };
  sellers.forEach(s => count[s.status as keyof typeof count]++);
  console.log('Seller status spread:', count);
  console.log(`Seller statuses randomized per hour at`, new Date().toISOString());
}
