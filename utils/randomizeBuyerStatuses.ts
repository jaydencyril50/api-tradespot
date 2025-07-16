import BuyerModel from '../models/Buyermodel';

// This function cycles the status of all buyers in a fixed order:
// online (2h), recently (30m), offline (30m), then repeat
export async function randomizeBuyerStatuses() {
  const buyers = await BuyerModel.find();
  // Determine the current phase based on the time since a fixed epoch
  // online: 0-2h, recently: 2h-3h, offline: 3h-4h, then repeat
  const now = Date.now();
  const cycleMs = 4 * 60 * 60 * 1000; // 4 hours in ms
  const phase = (now % cycleMs);
  let newStatus: 'online' | 'recently' | 'offline';
  if (phase < 2 * 60 * 60 * 1000) {
    newStatus = 'online';
  } else if (phase < 3 * 60 * 60 * 1000) {
    newStatus = 'recently';
  } else {
    newStatus = 'offline';
  }
  for (const buyer of buyers) {
    if (buyer.status !== newStatus) {
      buyer.status = newStatus;
      await buyer.save();
    }
  }
  console.log(`Buyer statuses set to '${newStatus}' at`, new Date().toISOString());
}
