// server/utils/fetchMarketPrice.ts
import axios from 'axios';

export async function fetchMarketPrice(): Promise<number> {
  // Fetch the latest market price from the external API
  const url = 'https://market-egl7.onrender.com/api/market/candles';
  try {
    const response = await axios.get(url);
    // Assuming the response contains an array of candles, and the latest price is in the last candle's 'close' field
    const candles = response.data;
    if (Array.isArray(candles) && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      return Number(lastCandle.close);
    }
    throw new Error('Invalid market data format');
  } catch (error) {
    console.error('Error fetching market price:', error);
    throw error;
  }
}
