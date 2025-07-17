import BuyerModel from '../models/Buyermodel';

// Randomize each buyer's status independently every hour
export async function randomizeBuyerStatuses() {
  const buyers = await BuyerModel.find();
  const statuses: Array<'online' | 'recently' | 'offline'> = ['online', 'recently', 'offline'];
  // Get the current hour since epoch
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  for (const buyer of buyers) {
    // Use a seeded random function based on buyer id and hour
    const seed = `${buyer._id}-${hour}`;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rand = (h >>> 0) / 4294967295;
    const randomStatus = statuses[Math.floor(rand * statuses.length)];
    if (buyer.status !== randomStatus) {
      buyer.status = randomStatus;
      await buyer.save();
    }
  }
  console.log(`Buyer statuses randomized per hour at`, new Date().toISOString());
}
