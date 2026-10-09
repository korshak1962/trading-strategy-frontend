// src/utils/indicatorDescriptions.js
// Human-readable descriptions of the indicator series (and level zone bands) drawn on the
// Strategy Backtester result chart, shown as hover tooltips on the IndicatorPicker chips - both
// the picker above the chart and the legend next to the price pane. Sourced from the backend
// strategies that emit them (serviceImpl/strategy/*.java, calc/PnLServiceImpl.java) and, for
// LevelBreakoutRetest, from its spec (TASK_level_breakout_retest_strategy.md §0.1d, §E.1).
//
// Series names are the keys of chartDataDTO.priceIndicators / .indicators. Exact names are looked
// up first, then generic name patterns (SMA_50, MA20, RSI14, ...), then a kind-based fallback.

const EXACT_DESCRIPTIONS = {
  // --- LevelBreakoutRetest: exit levels, written at the end of bar t and acting from bar t+1 ---
  effectiveExit: 'LevelBreakoutRetest: the drawn exit line of the open long. With sticky support (SupportTracking ≠ 0) it is max(stopLevel, supportExitLine) and a close below it exits (STOP or SUPPORT_BREAK); with SupportTracking = 0 it equals stopLevel, and the dynamic support-zone break (not drawn) can exit earlier. Take-profit (TakeProfitStrength > 0) can also exit in either mode and is not drawn. Written at the end of bar t, applies from bar t+1; empty while flat.',
  supportExitLine: 'LevelBreakoutRetest: sticky support exit line (SupportTracking ≠ 0). Starts at entry zone.low − BreakBuffer×ATR and never moves down: it steps up when price climbs fully above a higher zone passing the strength gate (SupportStrength under SupportBreakMode 2, MinStrength otherwise), and can also rise without a zone upgrade when ATR shrinks or the support band shifts up. A close below it exits (SUPPORT_BREAK). Written at the end of bar t, applies from t+1; empty while flat or with SupportTracking = 0.',
  stopLevel: 'LevelBreakoutRetest: protective stop of the open long, fixed at entry. Retest entries: min(retest low, zone.low) − StopBuffer×ATR; runaway entries: zone.low − StopBuffer×ATR. A close below it exits (STOP). Written at the end of bar t, applies from t+1; empty while flat.',
  // --- LevelBreakoutRetest: trigger lines, dated by the bar whose close they decide ---
  resistanceTrigger: 'LevelBreakoutRetest: breakout line = zone.high + BreakBuffer×ATR(t−1) of the lowest ARMED zone whose line is at or above the previous close. A close above it is a breakout of that zone - the entry setup that then waits for a retest (or a runaway close). Dated by the bar whose close it decides; empty when no armed zone is above.',
  supportTrigger: 'LevelBreakoutRetest: breakdown line = zone.low − BreakBuffer×ATR(t−1) of the highest strong zone whose line is at or below the previous close. A close below it breaks that zone down (a pending setup fails, a traded zone re-arms). With sticky support it is not the position exit - see effectiveExit. Dated by the bar whose close it decides; empty (a gap) when no qualifying zone exists below.',
  // --- PnL series (PnLServiceImpl), in price units per share ---
  'long PnL': 'Cumulative realized PnL of the long leg, in price units per share: the running sum of (close − open) of every closed long trade, stepping on each trade’s close date. A still-open position is marked to the last bar.',
  'current PnL': 'Cumulative realized PnL of the short leg, in price units per share: the running sum of (open − close) of every closed short trade, stepping on each trade’s close date. A still-open short is marked to the last bar.',
  // --- MeanReversion ---
  'Upper Band': 'MeanReversion: upper Bollinger band, rolling mean + 2 standard deviations of the close over the lookback window.',
  'Lower Band': 'MeanReversion: lower Bollinger band, rolling mean − 2 standard deviations of the close over the lookback window.',
  'Z-Score': 'MeanReversion: how many standard deviations the close is from its rolling mean, (close − mean) / std over the lookback window. Entries need it below zEntry, exits above zExit.',
};

// Generic name patterns: [regex, (match) => description].
const PATTERN_DESCRIPTIONS = [
  [/^SMA_(\d+)$/i, (m) => `Simple moving average of the close over the last ${m[1]} bars. Used by the MA-based strategies (MaCrossover fast/slow MA, PriceAboveMa, Tilt) as the trend reference.`],
  [/^MA\s*(\d+)$/i, (m) => `Rolling mean of the close over the last ${m[1]} bars (MeanReversion’s lookback mean, the middle of its Bollinger bands).`],
  [/^RSI\s*(\d+)$/i, (m) => `Relative Strength Index over ${m[1]} bars (0–100). Low values mean oversold, high values overbought; MeanReversion uses it with rsiBuy / rsiSell as an entry / exit filter.`],
];

const KIND_LABELS = {
  price: 'drawn on the price axis, over the candles',
  sub: 'drawn on the indicator pane below the PnL panes (own axis)',
};

/**
 * Description of an indicator series.
 * @param {string} name - series name (key of priceIndicators / indicators)
 * @returns {string|null} null when nothing specific is known
 */
export function getIndicatorDescription(name) {
  if (!name) return null;
  if (EXACT_DESCRIPTIONS[name]) return EXACT_DESCRIPTIONS[name];
  for (const [pattern, describe] of PATTERN_DESCRIPTIONS) {
    const match = pattern.exec(name);
    if (match) return describe(match);
  }
  return null;
}

/**
 * Full tooltip text for an indicator chip: name, where it is drawn, and its description.
 * @param {{name: string, kind: 'price'|'sub'}} series
 * @returns {string}
 */
export function getIndicatorTooltip(series) {
  const where = KIND_LABELS[series.kind] || '';
  const description = getIndicatorDescription(series.name)
    || 'Indicator series emitted by the strategy; no description available.';
  return `${series.name}${where ? ` (${where})` : ''}\n\n${description}`;
}

// Level zone bands (LevelBreakoutRetest, chartDataDTO.levelZones), for the legend swatches.
export const LEVEL_ZONE_DESCRIPTIONS = {
  strong: 'Strong zone: a support/resistance price band with strength ≥ MinStrength and enough touches. Only strong zones can be traded on a breakout and provide supportTrigger. Drawn per bar: the zone containing the previous close plus the N nearest above and below (see "Level zones").',
  weak: 'Weak zone: an active support/resistance band below the MinStrength / touch-count gate. Ignored by the strategy; shown only with "Show weak zones" (own N nearest).',
  trigger: 'Resistance trigger zone: the zone that produces resistanceTrigger on that bar - the lowest ARMED zone at or above the previous close. Its dashed top edge is zone.high; a close above zone.high + BreakBuffer×ATR breaks it out. Always drawn, even outside the N nearest.',
};
