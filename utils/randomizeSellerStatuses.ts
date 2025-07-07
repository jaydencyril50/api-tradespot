import SellerModel from '../models/Sellermodel';

// This function randomizes the status of all sellers every 2 hours
export async function randomizeSellerStatuses() {
  const statuses = ['online', 'offline', 'recently'];
  const sellers = await SellerModel.find();
  for (const seller of sellers) {
    let newStatus = statuses[Math.floor(Math.random() * statuses.length)] as 'online' | 'offline' | 'recently';
    // Avoid repeating the same status
    while (newStatus === seller.status && statuses.length > 1) {
      newStatus = statuses[Math.floor(Math.random() * statuses.length)] as 'online' | 'offline' | 'recently';
    }
    seller.status = newStatus;
    await seller.save();
  }
  console.log('Seller statuses randomized at', new Date().toISOString());
}
