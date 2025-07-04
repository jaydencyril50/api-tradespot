import mongoose from 'mongoose';

const CandleSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true, unique: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, default: 0 }
});

const Candle = mongoose.models.Candle || mongoose.model('Candle', CandleSchema);

export default Candle;