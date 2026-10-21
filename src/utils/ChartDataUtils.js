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

// ---------------------------------------------------------------------------------------------
// Parameter stability by channel (screener architect.md §6 item 4): the selected chain node's
// Fit half [start, mid) and Check half [mid, end] on the price chart. The node dates are
// strategy-TF bar timestamps (ChainNodeDTO start / mid / end).
// ---------------------------------------------------------------------------------------------

// Initial zoom: this fraction of the node's length as context left of the node start.
export const STABILITY_CONTEXT_FRACTION = 0.1;

/** Boundary just left of bar `index`: midway to the previous bar, so no candle is cut. */
const boundaryBefore = (barTimes, index) =>
  (index > 0 ? (barTimes[index - 1] + barTimes[index]) / 2 : barTimes[index]);

/**
 * Time span of a stability band on the chart's bars.
 * @param {Array<{date}>} prices the chart's bars
 * @param {{start, mid, end}|null} band ChainNodeDTO dates (API LocalDateTime)
 * @returns {{startMs, midMs, endMs}|null} null when the band or the prices are missing / unparseable
 */
export const stabilityBandSpan = (prices, band) => {
  if (!band || !Array.isArray(prices) || prices.length === 0) return null;
  const startMs = parseExchangeTs(band.start).getTime();
  const midMs = parseExchangeTs(band.mid).getTime();
  const endMs = parseExchangeTs(band.end).getTime();
  if ([startMs, midMs].some((v) => Number.isNaN(v))) return null;
  const barTimes = prices.map(price => parseExchangeTs(price.date).getTime());
  const lastIndex = barTimes.length - 1;
  const startIndex = barIndexAtOrAfter(barTimes, startMs);
  const midIndex = barIndexAtOrAfter(barTimes, midMs);
  const endIndex = Number.isNaN(endMs) ? lastIndex : barIndexAtOrAfter(barTimes, endMs);
  const bandEnd = endIndex === -1 || endIndex >= lastIndex ? barTimes[lastIndex]
    : (barTimes[endIndex] + barTimes[endIndex + 1]) / 2;
  return {
    startMs: startIndex === -1 ? startMs : boundaryBefore(barTimes, startIndex),
    midMs: midIndex === -1 ? midMs : boundaryBefore(barTimes, midIndex),
    endMs: bandEnd,
  };
};

/**
 * Initial zoom of a stability chart: the node plus STABILITY_CONTEXT_FRACTION of its length on the
 * left (never before the first bar), to the last bar.
 * @returns {[Date, Date]|null}
 */
export const stabilityInitialRange = (prices, band) => {
  if (!band || !Array.isArray(prices) || prices.length === 0) return null;
  const firstMs = parseExchangeTs(prices[0].date).getTime();
  const lastMs = parseExchangeTs(prices[prices.length - 1].date).getTime();
  const startMs = parseExchangeTs(band.start).getTime();
  const endMs = parseExchangeTs(band.end).getTime();
  if ([firstMs, lastMs, startMs].some((v) => Number.isNaN(v))) return null;
  const nodeEnd = Number.isNaN(endMs) ? lastMs : Math.min(endMs, lastMs);
  const from = Math.max(firstMs, startMs - STABILITY_CONTEXT_FRACTION * Math.max(0, nodeEnd - startMs));
  return [new Date(from), new Date(lastMs)];
};
