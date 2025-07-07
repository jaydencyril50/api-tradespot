import BuyerModel from '../models/Buyermodel';

// This function randomizes the status of all buyers every 2 hours
export async function randomizeBuyerStatuses() {
  const statuses = ['online', 'offline', 'recently'];
  const buyers = await BuyerModel.find();
  for (const buyer of buyers) {
    let newStatus = statuses[Math.floor(Math.random() * statuses.length)] as 'online' | 'offline' | 'recently';
    // Avoid repeating the same status
    while (newStatus === buyer.status && statuses.length > 1) {
      newStatus = statuses[Math.floor(Math.random() * statuses.length)] as 'online' | 'offline' | 'recently';
    }
    buyer.status = newStatus;
    await buyer.save();
  }
  console.log('Buyer statuses randomized at', new Date().toISOString());
}
