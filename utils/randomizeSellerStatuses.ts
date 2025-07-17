import SellerModel from '../models/Sellermodel';

// This function cycles the status of all sellers in a fixed order:
// online (2h), recently (30m), offline (30m), then repeat
export async function randomizeSellerStatuses() {
  const sellers = await SellerModel.find();
  const statuses: Array<'online' | 'recently' | 'offline'> = ['online', 'recently', 'offline'];
  for (const seller of sellers) {
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    if (seller.status !== randomStatus) {
      seller.status = randomStatus;
      await seller.save();
    }
  }
  console.log(`Seller statuses randomized individually at`, new Date().toISOString());
}
