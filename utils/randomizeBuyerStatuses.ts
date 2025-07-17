import BuyerModel from '../models/Buyermodel';

export async function randomizeBuyerStatuses() {
  const buyers = await BuyerModel.find();
  const statuses: Array<'online' | 'recently' | 'offline'> = ['online', 'recently', 'offline'];
  for (const buyer of buyers) {
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    if (buyer.status !== randomStatus) {
      buyer.status = randomStatus;
      await buyer.save();
    }
  }
  console.log(`Buyer statuses randomized individually at`, new Date().toISOString());
}
