// server/cron/updateFakeBuyerPrices.ts
import BuyerModel from '../models/Buyermodel';
import { fetchMarketPrice } from '../utils/fetchMarketPrice';

/**
 * Updates all fake buyers' prices to a random value between 1% and 2% below the latest market price.
 */
export async function updateFakeBuyerPrices() {
  try {
    const marketPrice = await fetchMarketPrice();
    const buyers = await BuyerModel.find({});
    for (const buyer of buyers) {
      // Random percent between 1% and 2% BELOW market
      const percent = 1 + Math.random() * 1; // 1% to 2%
      const newPrice = +(marketPrice * (1 - percent / 100)).toFixed(2);
      buyer.price = newPrice;
      await buyer.save();
    }
    console.log(`[FakeBuyerCron] Updated ${buyers.length} buyers' prices (market: ${marketPrice})`);
  } catch (err) {
    console.error('[FakeBuyerCron] Error updating fake buyer prices:', err);
  }
}
