// src/utils/indicatorDescriptions.js
// Human-readable descriptions of the indicator series (and level zone bands) drawn on the
// Strategy Backtester result chart, shown as hover tooltips on the IndicatorPicker chips - both
// the picker above the chart and the legend next to the price pane. Sourced from the backend
// strategies that emit them (serviceImpl/strategy/*.java, calc/PnLServiceImpl.java).
//
// Series names are the keys of chartDataDTO.priceIndicators / .indicators. Exact names are looked
// up first, then generic name patterns (SMA_50, MA20, RSI14, ...), then a kind-based fallback.

const EXACT_DESCRIPTIONS = {
  // --- PnL series (PnLServiceImpl), in price units per share ---
  'long PnL': 'Cumulative realized PnL of the long leg, in price units per share: the running sum of (close − open) of every closed long trade, stepping on each trade’s close date. A still-open position is marked to the last bar.',
  'current PnL': 'Despite its name, this is the SHORT side’s cumulative realized PnL (PnLServiceImpl, short pass), in price units per share: the running sum of (open − close) of every closed short trade, stepping on each trade’s close date; a still-open short is marked to the last bar. It is not the current (open-trade) PnL and not the long PnL. For long-only results the short side is not evaluated, so this series is not meaningful there.',
  // --- MeanReversion ---
  'Upper Band': 'MeanReversion: upper Bollinger band, rolling mean + 2 standard deviations of the close over the lookback window.',
  'Lower Band': 'MeanReversion: lower Bollinger band, rolling mean − 2 standard deviations of the close over the lookback window.',
  'Z-Score': 'MeanReversion: how many standard deviations the close is from its rolling mean, (close − mean) / std over the lookback window. Entries need it below zEntry, exits above zExit.',
};

// Generic name patterns: [regex, (match) => description].
const PATTERN_DESCRIPTIONS = [
  [/^SMA_(\d+)$/i, (m) => `Simple moving average of the close over the last ${m[1]} bars. Used as the trend reference by the MA-based strategies (the constructed templates 'Price vs MA', 'MA crossover' and 'SMA tilt').`],
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

// Level zone bands (chartDataDTO.levelZones of a strategy that sends them), for the legend swatches.
export const LEVEL_ZONE_DESCRIPTIONS = {
  strong: 'Strong zone: a support/resistance price band that passes the strategy’s strength and touch-count gate. Only strong zones can be traded on a breakout. Drawn per bar: the zone containing the previous close plus the N nearest above and below (see "Level zones").',
  weak: 'Weak zone: an active support/resistance band below the strategy’s strength / touch-count gate. Not traded; shown only with "Show weak zones" (own N nearest).',
  trigger: 'Resistance trigger zone: the zone that produces the breakout line on that bar - the lowest ARMED zone at or above the previous close. Its dashed top edge is zone.high; a close above zone.high plus the break buffer breaks it out. Always drawn, even outside the N nearest.',
};

// Next-bar trigger prices (StrategyResultDTO / SignalChartsDTO.nextTriggers), for the legend.
export const NEXT_BAR_DESCRIPTIONS = {
  lines: 'Next-bar triggers: the prices at which the model would act on the next bar, from the state at the last closed bar. '
    + 'Short segments one bar wide in the empty slot after the last bar (or on the last bar while it is in progress). '
    + 'Green = BUY, red = SELL; dashed = close-based (acts on the close), dotted = conditional (needs an intrabar fact too, marked *), '
    + 'solid = intrabar stop (fills at the line). Grey shading: a veto region (no buy there) or a channel band inside which no '
    + 'signal is possible. A black dot = the real close of that bar, for a run that ended in the past. '
    + 'Estimates of the rule, not predictions: details and the execution note are on the Summary tab.',
  info: 'Informational next-bar lines: context for the next bar, never a signal for it.',
};
