import SellerModel from '../models/Sellermodel';

// This function cycles the status of all sellers in a fixed order:
// online (2h), recently (30m), offline (30m), then repeat
export async function randomizeSellerStatuses() {
  const sellers = await SellerModel.find();
  // Determine the current phase based on the time since a fixed epoch
  // online: 0-2h, recently: 2h-2.5h, offline: 2.5h-3h, then repeat
  const now = Date.now();
  const cycleMs = 3 * 60 * 60 * 1000; // 3 hours in ms
  const phase = (now % cycleMs);
  let newStatus: 'online' | 'recently' | 'offline';
  if (phase < 2 * 60 * 60 * 1000) {
    newStatus = 'online';
  } else if (phase < 2.5 * 60 * 60 * 1000) {
    newStatus = 'recently';
  } else {
    newStatus = 'offline';
  }
  for (const seller of sellers) {
    if (seller.status !== newStatus) {
      seller.status = newStatus;
      await seller.save();
    }
  }
  console.log(`Seller statuses set to '${newStatus}' at`, new Date().toISOString());
}
