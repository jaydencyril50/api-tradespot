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
      let minPercent = 0, maxPercent = 0;
      if (buyer.vipLevel === 1) {
        minPercent = 0;
        maxPercent = 1.0;
      } else if (buyer.vipLevel === 2) {
        minPercent = 0;
        maxPercent = 1.2;
      } else {
        minPercent = 0;
        maxPercent = 1.5;
      }
      const percent = Math.random() * (maxPercent - minPercent) + minPercent;
      const newPrice = +(marketPrice * (1 - percent / 100)).toFixed(2);
      buyer.price = newPrice;
      await buyer.save();
    }
    console.log(`[FakeBuyerCron] Updated ${buyers.length} buyers' prices (market: ${marketPrice})`);
  } catch (err) {
    console.error('[FakeBuyerCron] Error updating fake buyer prices:', err);
  }
}
