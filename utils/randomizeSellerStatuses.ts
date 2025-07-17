import SellerModel from '../models/Sellermodel';

// This function cycles the status of all sellers in a fixed order:
// online (2h), recently (30m), offline (30m), then repeat
export async function randomizeSellerStatuses() {
  const sellers = await SellerModel.find();
  const statuses: Array<'online' | 'recently' | 'offline'> = ['online', 'recently', 'offline'];
  // Get the current hour since epoch
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  // Simple deterministic pseudo-random function
  function seededRandom(seed: string) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }
  for (const seller of sellers) {
    const seed = `${seller.userId || seller._id}-${hour}`;
    const rand = seededRandom(seed);
    const randomStatus = statuses[Math.floor(rand * statuses.length)];
    if (seller.status !== randomStatus) {
      seller.status = randomStatus;
      await seller.save();
    }
  }
  console.log(`Seller statuses randomized per hour at`, new Date().toISOString());
}
