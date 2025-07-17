import BuyerModel from '../models/Buyermodel';

// Randomize each buyer's status independently every hour
export async function randomizeBuyerStatuses() {
  const buyers = await BuyerModel.find();
  const statuses: Array<'online' | 'recently' | 'offline'> = ['online', 'recently', 'offline'];
  // Get the current hour since epoch
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  for (const buyer of buyers) {
    // Use a seeded hash with more entropy for better spread
    const seed = `${buyer._id}-${buyer.userId}-${hour}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    const index = Math.abs(h) % statuses.length;
    const randomStatus = statuses[index];
    if (buyer.status !== randomStatus) {
      buyer.status = randomStatus;
      await buyer.save();
    }
  }
  // Log the spread for debugging
  const count = { online: 0, recently: 0, offline: 0 };
  buyers.forEach(b => count[b.status as keyof typeof count]++);
  console.log('Status spread:', count);
  console.log(`Buyer statuses randomized per hour at`, new Date().toISOString());
}
