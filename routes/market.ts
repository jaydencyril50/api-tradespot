import express from 'express';
import mongoose from 'mongoose';
import CandleOrig from '../models/Candle';
const Candle: any = CandleOrig;

const router = express.Router();

const CANDLE_COUNT = 60;

let stableCandles: { timestamp: Date; open: number; high: number; low: number; close: number; volume: number }[] = [];

// On server start, load latest candles from DB and only add missing ones
(async function initializeCandles() {
  try {
    // Find the latest candle in the DB
    let candles = await Candle.find({})
      .sort({ timestamp: 1 })
      .lean()
      .exec();
    // Filter out invalid candles loaded from DB
    candles = candles.filter((c: any) => {
      if (!isValidCandle(c)) {
        console.warn('[CANDLE] Skipping invalid candle from DB:', c);
        return false;
      }
      return true;
    });
    let last = candles[candles.length - 1] || {
      timestamp: new Date(Date.now() - (CANDLE_COUNT - 1) * 60000),
      open: 500, high: 500, low: 500, close: 500, volume: 1000
    };
    // Generate and insert only missing candles (no replacement)
    let missing = 0;
    if (candles.length < CANDLE_COUNT) {
      missing = CANDLE_COUNT - candles.length;
    } else {
      // Check for any missing minutes (gaps)
      for (let i = 1; i < candles.length; i++) {
        const prev = new Date(candles[i - 1].timestamp).getTime();
        const curr = new Date(candles[i].timestamp).getTime();
        if (curr - prev > 60000) {
          missing += Math.floor((curr - prev) / 60000) - 1;
        }
      }
    }
    // Add missing candles
    for (let i = 0; i < missing; i++) {
      const newCandle = {
        timestamp: new Date(new Date(last.timestamp).getTime() + 60000),
        open: last.close,
        high: last.close * (1 + Math.random() * 0.01),
        low: last.close * (1 - Math.random() * 0.01),
        close: last.close * (1 + (Math.random() - 0.5) * 0.01),
        volume: Math.round(1000 + Math.random() * 500)
      };
      if (!isValidCandle(newCandle)) {
        console.warn('[CANDLE] Skipping invalid generated candle:', newCandle);
        continue;
      }
      const createdCandle = await Candle.create(newCandle);
      candles.push(createdCandle.toObject());
      last = createdCandle.toObject();
    }
    // Only keep the latest CANDLE_COUNT in memory (but DB has all)
    stableCandles = candles.slice(-CANDLE_COUNT).map(c => ({
      timestamp: new Date(c.timestamp),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume)
    }));
  } catch (err) {
    stableCandles = [];
  }
})();

// --- CHAOTIC CANDLE GENERATION START ---
// Helper for random sign
function randSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

// State for chaos
let chaosState = {
  trend: 0, // persistent trend
  volatility: 0.0025,
  fakeoutTimer: 0,
  lastEvent: null as null | string,
  lastEventTime: 0,
  lastVolume: 1000,
  lastClose: 500,
  rareEventCooldown: 0
};

function generateChaoticCandle(prevCandle: any, basePrice = 500) {
  const now = new Date();
  let { trend, volatility, fakeoutTimer, lastEvent, lastEventTime, lastVolume, lastClose, rareEventCooldown } = chaosState;

  // Randomly flip trend (simulate sudden sentiment change)
  if (Math.random() < 0.08) {
    trend = (Math.random() - 0.5) * 0.012 * randSign();
  } else if (Math.random() < 0.03) {
    trend *= -1; // sudden reversal
  }

  // Rare chaotic event: flash crash, pump, or dead cat bounce
  let event = null;
  if (rareEventCooldown <= 0 && Math.random() < 0.012) {
    const eventType = Math.random();
    if (eventType < 0.33) {
      // Flash crash
      trend = -Math.abs((Math.random() * 0.04 + 0.01));
      volatility *= 3;
      event = 'flash_crash';
    } else if (eventType < 0.66) {
      // Pump
      trend = Math.abs((Math.random() * 0.04 + 0.01));
      volatility *= 3;
      event = 'pump';
    } else {
      // Dead cat bounce
      trend = -Math.abs((Math.random() * 0.02 + 0.01));
      volatility *= 2;
      event = 'dead_cat';
    }
    rareEventCooldown = 20 + Math.floor(Math.random() * 20); // 20-40 candles cooldown
    lastEvent = event;
    lastEventTime = now.getTime();
  } else {
    rareEventCooldown--;
  }

  // Fakeout: sudden move then revert
  if (fakeoutTimer <= 0 && Math.random() < 0.03) {
    trend += (Math.random() - 0.5) * 0.03;
    fakeoutTimer = 2 + Math.floor(Math.random() * 2);
    lastEvent = 'fakeout';
    lastEventTime = now.getTime();
  } else if (fakeoutTimer > 0) {
    trend *= -1.2; // revert direction
    fakeoutTimer--;
  }

  // Volatility regime changes
  if (Math.random() < 0.04) {
    volatility = 0.002 + Math.random() * 0.008;
  }

  // Simulate price move
  let drift = trend + (Math.random() - 0.5) * volatility * (1 + Math.random() * 1.5);
  // Clamp drift to ±3.5%
  drift = Math.max(-0.035, Math.min(0.035, drift));

  const open = prevCandle ? prevCandle.close : lastClose;
  let close = open * (1 + drift);
  close = Math.max(basePrice * 0.8, Math.min(basePrice * 1.2, close));

  // --- PATCH: Always add random wicks for realism ---
  // Calculate base high/low
  let baseHigh = Math.max(open, close);
  let baseLow = Math.min(open, close);
  // Add random wick above high (up to 0.2-0.7% extra)
  const highWick = baseHigh * (1 + 0.002 + Math.random() * 0.005);
  // Add random wick below low (down to 0.2-0.7% less)
  const lowWick = baseLow * (1 - 0.002 - Math.random() * 0.005);
  const high = parseFloat(highWick.toFixed(2));
  const low = parseFloat(lowWick.toFixed(2));

  // Fake volume spikes
  let volume = lastVolume * (0.95 + Math.random() * 0.12);
  if (event === 'flash_crash' || event === 'pump') volume *= 2.5 + Math.random();
  if (Math.random() < 0.04) volume *= 1.5 + Math.random();
  volume = Math.max(200, Math.min(8000, volume));

  // Update chaos state
  chaosState = {
    trend,
    volatility,
    fakeoutTimer,
    lastEvent,
    lastEventTime,
    lastVolume: volume,
    lastClose: close,
    rareEventCooldown
  };

  return {
    timestamp: now,
    open: parseFloat(open.toFixed(2)),
    high,
    low,
    close: parseFloat(close.toFixed(2)),
    volume: Math.round(volume)
  };
}

// Replace 1-minute candle generation
setInterval(async () => {
  if (stableCandles.length === 0) return;
  const last = stableCandles[stableCandles.length - 1];
  const newCandle = generateChaoticCandle(last, 500);
  if (!isValidCandle(newCandle)) {
    console.warn('[CANDLE] Skipping invalid generated candle (chaotic):', newCandle);
    return;
  }
  stableCandles.push(newCandle);
  if (stableCandles.length > CANDLE_COUNT) stableCandles.shift();
  await saveCandleToDB(newCandle);
}, 60000);

// Replace intra-candle update (simulate wild price ticks)
setInterval(() => {
  if (!stableCandles.length) return;
  const lastIdx = stableCandles.length - 1;
  const last = stableCandles[lastIdx];
  // Simulate a wild tick within the current candle
  let tickVol = chaosState.volatility * (0.5 + Math.random() * 2.5);
  let tickMove = (Math.random() - 0.5) * tickVol * randSign();
  let newClose = last.close * (1 + tickMove);
  // Clamp to high/low range
  newClose = Math.max(last.low, Math.min(last.high, newClose));
  stableCandles[lastIdx] = {
    ...last,
    close: parseFloat(newClose.toFixed(2)),
    high: Math.max(last.high, newClose),
    low: Math.min(last.low, newClose)
  };
  // Optionally update in DB
  Candle.updateOne({ timestamp: last.timestamp }, {
    $set: { close: parseFloat(newClose.toFixed(2)), high: Math.max(last.high, newClose), low: Math.min(last.low, newClose) }
  }).catch(() => {});
}, 5000);
// --- CHAOTIC CANDLE GENERATION END ---

// (Remove or comment out the old candle generation and intra-candle update intervals above)

// --- Signal logic with 50% accuracy ---
let lastCandleDirection: 'up' | 'down' = 'up';
let lastSignal: { direction: 'up' | 'down', correct: boolean } | null = null;

function getCandleDirection(prev: any, curr: any) {
  if (!prev || !curr) return 'up';
  return curr.close > prev.close ? 'up' : 'down';
}

function generateSignal() {
  const willBeCorrect = Math.random() < 0.5;
  lastSignal = {
    direction: willBeCorrect ? lastCandleDirection : (lastCandleDirection === 'up' ? 'down' : 'up'),
    correct: willBeCorrect
  };
  if (lastSignal.direction === 'up') {
    return '🚀 Signal: Market expected to rise soon.';
  } else {
    return '🔻 Signal: Market expected to fall soon.';
  }
}

router.get('/signal', (req, res) => {
  const msg = generateSignal();
  res.json({ message: msg, direction: lastSignal?.direction, correct: lastSignal?.correct });
});

setInterval(() => {
  if (stableCandles.length < 2) return;
  const prev = stableCandles[stableCandles.length - 2];
  const last = stableCandles[stableCandles.length - 1];
  lastCandleDirection = getCandleDirection(prev, last);
}, 60000);

// Helper to load candles from the database
async function loadCandlesFromDB(count: number) {
  // Find the latest 'count' candles, sorted by timestamp ascending
  const candles = await Candle.find({})
    .sort({ timestamp: 1 })
    .limit(count)
    .lean()
    .exec();
  return candles;
}

// --- Candle validation utility ---
function isValidCandle(candle: any): boolean {
  if (!candle) return false;
  const required = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
  for (const k of required) {
    if (
      candle[k] === null ||
      candle[k] === undefined ||
      (typeof candle[k] === 'number' && isNaN(candle[k]))
    ) {
      return false;
    }
    // timestamp must be a valid date
    if (k === 'timestamp') {
      const t = new Date(candle[k]);
      if (!(t instanceof Date) || isNaN(t.getTime())) return false;
    }
  }
  return true;
}

// --- PATCH: Validate before saving, updating, or returning candles ---

// Helper to save a candle to the database (with validation)
async function saveCandleToDB(candle: any) {
  if (!isValidCandle(candle)) {
    console.warn('[CANDLE] Attempted to save invalid candle:', candle);
    return;
  }
  try {
    await Candle.updateOne(
      { timestamp: candle.timestamp },
      { $set: candle },
      { upsert: true }
    );
  } catch (err) {
    // Optionally log or handle the error
  }
}

// --- PATCH: Validate before creating new candles ---
// In all places where Candle.create or stableCandles.push is called, validate first

// --- Real-time price update for the current candle ---
// This simulates price movement within the current minute, updating the last candle
function updateLiveCandle(newPrice: number) {
  if (!stableCandles.length) return;
  const last = stableCandles[stableCandles.length - 1];
  last.close = newPrice;
  if (newPrice > last.high) last.high = newPrice;
  if (newPrice < last.low) last.low = newPrice;
  // Optionally update in DB as well
  Candle.updateOne({ timestamp: last.timestamp }, {
    $set: { close: last.close, high: last.high, low: last.low }
  }).catch(() => {});
}

// --- Real-time update of the last candle (every 20 seconds) ---
setInterval(async () => {
  if (stableCandles.length === 0) return;
  const lastIdx = stableCandles.length - 1;
  const last = stableCandles[lastIdx];
  // Use previous 3 moves for momentum if available
  let momentum = 0;
  if (stableCandles.length > 4) {
    const prevMoves = [
      stableCandles[lastIdx].close - stableCandles[lastIdx - 1].close,
      stableCandles[lastIdx - 1].close - stableCandles[lastIdx - 2].close,
      stableCandles[lastIdx - 2].close - stableCandles[lastIdx - 3].close
    ];
    momentum = 0.6 * momentum + 0.2 * (prevMoves[0] / last.close) + 0.1 * (prevMoves[1] / last.close) + 0.1 * (prevMoves[2] / last.close);
    momentum = Math.max(-0.006, Math.min(0.006, momentum));
  }
  // Small random walk for intra-candle movement
  let volatility = 0.001 + Math.random() * 0.0008;
  if (Math.random() < 0.01) volatility *= 4;
  let drift = momentum + (Math.random() - 0.5) * volatility;
  drift = Math.max(-0.003, Math.min(0.003, drift));
  let newClose = last.close * (1 + drift);
  // Clamp to ±10% of 500
  newClose = Math.max(450, Math.min(550, newClose));
  // Update high/low if needed
  let newHigh = Math.max(last.high, newClose);
  let newLow = Math.min(last.low, newClose);
  // Clamp wicks to ±1% from open/close
  const wickLimit = 0.01; // 1%
  const base = last.open;
  newHigh = Math.min(newHigh, base * (1 + wickLimit), newClose * (1 + wickLimit));
  newLow = Math.max(newLow, base * (1 - wickLimit), newClose * (1 - wickLimit));
  // Simulate small wicks (but within clamp)
  if (Math.random() < 0.3) newHigh = Math.min(Math.max(newHigh, newClose * (1 + Math.random() * 0.001)), base * (1 + wickLimit));
  if (Math.random() < 0.3) newLow = Math.max(Math.min(newLow, newClose * (1 - Math.random() * 0.001)), base * (1 - wickLimit));
  // Update in memory
  const updatedCandle = {
    ...last,
    close: parseFloat(newClose.toFixed(2)),
    high: parseFloat(newHigh.toFixed(2)),
    low: parseFloat(newLow.toFixed(2))
  };
  if (!isValidCandle(updatedCandle)) {
    console.warn('[CANDLE] Skipping invalid update to last candle (20s):', updatedCandle);
    return;
  }
  stableCandles[lastIdx] = updatedCandle;
  // Update in DB (find by timestamp)
  try {
    await Candle.updateOne(
      { timestamp: last.timestamp },
      { $set: { close: parseFloat(newClose.toFixed(2)), high: parseFloat(newHigh.toFixed(2)), low: parseFloat(newLow.toFixed(2)) } }
    );
  } catch (err) {
    // Ignore DB errors for real-time updates
  }
}, 20000); // 20 seconds

// --- Generate a new candle every 2 minutes ---
setInterval(async () => {
  if (!stableCandles.length) return;
  const last = stableCandles[stableCandles.length - 1];
  const now = new Date();
  const newTimestamp = new Date(last.timestamp.getTime() + 2 * 60000); // 2 minutes after last
  const open = last.close;
  const close = parseFloat((open * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2));
  // --- PATCH: Always add random wicks for realism ---
  let baseHigh = Math.max(open, close);
  let baseLow = Math.min(open, close);
  const highWick = baseHigh * (1 + 0.002 + Math.random() * 0.005);
  const lowWick = baseLow * (1 - 0.002 - Math.random() * 0.005);
  const high = parseFloat(highWick.toFixed(2));
  const low = parseFloat(lowWick.toFixed(2));
  const volume = Math.round(1000 + Math.random() * 500);
  const newCandle = {
    timestamp: newTimestamp,
    open,
    high,
    low,
    close,
    volume
  };
  if (!isValidCandle(newCandle)) {
    console.warn('[CANDLE] Skipping invalid generated candle (2min):', newCandle);
    return;
  }
  await Candle.create(newCandle);
  stableCandles.push(newCandle);
  if (stableCandles.length > CANDLE_COUNT) stableCandles.shift();
}, 120000); // 2 minutes

// PATCH: Filter out invalid candles before returning from API
router.get('/candles', async (req, res) => {
  console.log('[API] /api/market/candles endpoint hit');
  try {
    let candles = await loadCandlesFromDB(CANDLE_COUNT);
    // Filter out invalid candles before sending
    const validCandles = candles.filter((c: any) => {
      if (!isValidCandle(c)) {
        console.warn('[API] Filtering out invalid candle before sending:', c);
        return false;
      }
      return true;
    });
    console.log(`[API] Returning ${validCandles.length} valid candles`);
    res.json(validCandles);
  } catch (err: any) {
    console.error('[API] Error loading candles:', err);
    res.status(500).json({ error: 'Failed to load candles', details: err?.message });
  }
});

export default router;
