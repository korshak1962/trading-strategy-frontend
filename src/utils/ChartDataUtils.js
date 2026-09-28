// src/utils/ChartDataUtils.js

// Extract trades from signals
export const extractTradesFromSignals = (signals) => {
    const extractedTrades = [];
    const openSignals = {};
  
    // Sort signals by date
    const sortedSignals = [...signals].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
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
          openDate: new Date(openSignal.date),
          closeDate: new Date(signal.date),
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
          openDate: new Date(openSignal.date),
          closeDate: new Date(signal.date),
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
 * and carried forward. Shared by the Enhanced chart (Recharts line) and the Reporter-style
 * chart (canvas pane) so both show the exact same curve.
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
