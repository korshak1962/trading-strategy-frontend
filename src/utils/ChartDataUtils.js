// src/utils/ChartDataUtils.js
import { parseExchangeTs } from './dates';

// Extract trades from signals
export const extractTradesFromSignals = (signals) => {
    const extractedTrades = [];
    const openSignals = {};
  
    // Sort signals by date
    const sortedSignals = [...signals].sort((a, b) => 
      parseExchangeTs(a.date) - parseExchangeTs(b.date)
    );
  
    sortedSignals.forEach(signal => {
      if (signal.type === 'LongOpen') {
        // Store open signal
        openSignals['Long'] = signal;
      } 
      else if (signal.type === 'LongClose' && openSignals['Long']) {
        // Create a trade
        const openSignal = openSignals['Long'];
        const profit = signal.price - openSignal.price;
        
        extractedTrades.push({
          type: 'Long',
          openDate: parseExchangeTs(openSignal.date),
          closeDate: parseExchangeTs(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit
        });
        
        // Clear open signal
        delete openSignals['Long'];
      }
      else if (signal.type === 'ShortOpen') {
        // Store open signal
        openSignals['Short'] = signal;
      }
      else if (signal.type === 'ShortClose' && openSignals['Short']) {
        // Create a trade
        const openSignal = openSignals['Short'];
        const profit = openSignal.price - signal.price; // Reversed for short
        
        extractedTrades.push({
          type: 'Short',
          openDate: parseExchangeTs(openSignal.date),
          closeDate: parseExchangeTs(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit
        });
        
        // Clear open signal
        delete openSignals['Short'];
      }
    });
  
    return extractedTrades;
  };

/**
 * Realized cumulative PnL per bar: each closed trade's PnL is booked on the bar it closed on
 * and carried forward. Feeds the Reporter-style chart's cumulative PnL pane.
 * @param {number} length - number of bars
 * @param {Array<{index: number, pnl: number}>} closes - bar index each trade closed on + its PnL
 * @returns {number[]} running total, one value per bar
 */
export const cumulativeClosedPnLByBar = (length, closes) => {
  const pnlAtBar = new Array(length).fill(0);
  (closes || []).forEach(({ index, pnl }) => {
    if (index >= 0 && index < length && Number.isFinite(pnl)) pnlAtBar[index] += pnl;
  });
  let running = 0;
  return pnlAtBar.map(value => (running += value));
};

/**
 * Index of the first bar at or after `ms` (binary search over ascending bar timestamps);
 * -1 when `ms` is after the last bar.
 */
export const barIndexAtOrAfter = (barTimes, ms) => {
  let lo = 0;
  let hi = barTimes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid] >= ms) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
};

// ---------------------------------------------------------------------------------------------
// Trading window (screener tradeStart): the bars before `windowStart` are warm-up only - the
// strategies see them but hold no position. `windowStart` is the backend's first bar of the
// window (StrategyResultDTO / SignalChartsDTO.windowStart); without a tradeStart it is the first
// bar, and an older backend omits it - both mean "no warm-up", so the helpers return null.
// ---------------------------------------------------------------------------------------------

// Initial zoom: this many bars of warm-up context left of the window, at least
// (owner's decision: max(20 bars, 10% of the window's bars)).
export const WINDOW_CONTEXT_MIN_BARS = 20;
export const WINDOW_CONTEXT_FRACTION = 0.1;

/** Index of the first window bar in `prices`, or -1 when there is no warm-up before it. */
const windowStartIndex = (prices, windowStart) => {
  if (!windowStart || !Array.isArray(prices) || prices.length === 0) return -1;
  const windowMs = parseExchangeTs(windowStart).getTime();
  if (Number.isNaN(windowMs)) return -1;
  const barTimes = prices.map(price => parseExchangeTs(price.date).getTime());
  const index = barIndexAtOrAfter(barTimes, windowMs);
  return index > 0 ? index : -1;
};

/**
 * Warm-up span to shade: everything left of the boundary between the last warm-up bar and the
 * first window bar (the midpoint, so neither candle is cut by the edge).
 * @returns {{endMs: number, windowStartMs: number}|null} null without a warm-up
 */
export const preWindowSpan = (prices, windowStart) => {
  const index = windowStartIndex(prices, windowStart);
  if (index === -1) return null;
  const lastWarmupMs = parseExchangeTs(prices[index - 1].date).getTime();
  const windowStartMs = parseExchangeTs(prices[index].date).getTime();
  return { endMs: (lastWarmupMs + windowStartMs) / 2, windowStartMs };
};

/**
 * Initial zoom window of a result with a warm-up: the trading window plus
 * max(WINDOW_CONTEXT_MIN_BARS, 10% of the window's bars) bars of warm-up on the left.
 * @returns {[Date, Date]|null} null without a warm-up (the caller shows the full range)
 */
export const initialWindowRange = (prices, windowStart) => {
  const index = windowStartIndex(prices, windowStart);
  if (index === -1) return null;
  const windowBars = prices.length - index;
  const context = Math.max(WINDOW_CONTEXT_MIN_BARS, Math.round(WINDOW_CONTEXT_FRACTION * windowBars));
  const startIndex = Math.max(0, index - context);
  return [parseExchangeTs(prices[startIndex].date), parseExchangeTs(prices[prices.length - 1].date)];
};
