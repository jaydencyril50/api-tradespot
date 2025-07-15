import SellerModel from '../models/Sellermodel';
import { fetchMarketPrice } from '../utils/fetchMarketPrice';

export async function updateFakeSellerPrices() {
  try {
    const marketPrice = await fetchMarketPrice();
    const sellers = await SellerModel.find({});
    for (const seller of sellers) {
      let minPercent = 0, maxPercent = 0;
      if (seller.vipLevel === 1) {
        minPercent = 1.0;
        maxPercent = 1.15;
      } else if (seller.vipLevel === 2) {
        minPercent = 1.2;
        maxPercent = 1.35;
      } else {
        minPercent = 1.35;
        maxPercent = 1.6;
      }
      const percent = Math.random() * (maxPercent - minPercent) + minPercent;
      const newPrice = +(marketPrice * (1 + percent / 100)).toFixed(2);
      seller.price = newPrice;
      await seller.save();
    }
    console.log(`[FakeSellerCron] Updated ${sellers.length} sellers' prices (market: ${marketPrice})`);
  } catch (err) {
    console.error('[FakeSellerCron] Error updating fake seller prices:', err);
  }
}
