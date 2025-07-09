import SellerModel from '../models/Sellermodel';
import { fetchMarketPrice } from '../utils/fetchMarketPrice';

/**
 * Updates all fake sellers' prices to a random value between 1% and 2.5% below the latest market price.
 */
export async function updateFakeSellerPrices() {
  try {
    const marketPrice = await fetchMarketPrice();
    const sellers = await SellerModel.find({});
    for (const seller of sellers) {
      let percent;
      if (seller.vipLevel === 1) percent = 2.0;
      else if (seller.vipLevel === 2) percent = 2.3;
      else percent = 3.2;
      const newPrice = +(marketPrice * (1 + percent / 100)).toFixed(2);
      seller.price = newPrice;
      await seller.save();
    }
    console.log(`[FakeSellerCron] Updated ${sellers.length} sellers' prices (market: ${marketPrice})`);
  } catch (err) {
    console.error('[FakeSellerCron] Error updating fake seller prices:', err);
  }
}
