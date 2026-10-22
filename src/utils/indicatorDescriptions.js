// src/utils/indicatorDescriptions.js
// Human-readable descriptions of the indicator series (and level zone bands) drawn on the
// Strategy Backtester result chart, shown as hover tooltips on the IndicatorPicker chips - both
// the picker above the chart and the legend next to the price pane. Sourced from the backend
// strategies that emit them (serviceImpl/strategy/*.java, calc/PnLServiceImpl.java) and, for
// LevelBreakoutRetest, from its specs (TASK_level_breakout_retest_strategy.md §0.1d, §E.1;
// TASK_level_chart_ux.md §2, §4; TASK_level_lines_always_zone_hover_fullscreen.md §F1).
//
// Series names are the keys of chartDataDTO.priceIndicators / .indicators. Exact names are looked
// up first, then generic name patterns (SMA_50, MA20, RSI14, ...), then a kind-based fallback.

const EXACT_DESCRIPTIONS = {
  // --- LevelBreakoutRetest: exit levels, written at the end of bar t and acting from bar t+1 ---
  effectiveExit: 'LevelBreakoutRetest "Exit line": the one sell line of the open long - a close below it exits (STOP or SUPPORT_BREAK). Drawn as steps. With sticky support (SupportTracking = 1) it is max(Initial stop, Support line): written at the end of bar t, it applies from bar t+1; it steps up on a support upgrade (marked "↑") and can also step without one when ATR shrinks or the support band shifts (no "↑" then). With SupportTracking = 0 it is max(Initial stop, legacy line), where the legacy line is zone.low − BreakBuffer×ATR of the zone the legacy rule checked on that bar (Initial stop on the entry bar and when no zone was found). Legacy rule: line shown on the bar it decided (one bar earlier than sticky mode). Empty while flat and on every exit bar - there the dashed red "Exit line (flat)" continues it, so a red line shows on every bar (solid while long, dashed while flat). Take-profit (TakeProfitStrength > 0) can also exit and is not drawn. In a merged run it follows the merged (final) position, not only LevelBreakoutRetest’s own trades: a long opened by another strategy is adopted (entry "Adopted", line hung from the nearest strong zone below price - none drawn when no zone qualifies), and a close by another strategy ends it (exit "Other strategy").',
  projectedExit: 'LevelBreakoutRetest "Exit line (flat)" (dashed red): hypothetical - no position is open; a real Exit line replaces it on entry. Where the exit line would hang if we were long now: zone.low − BreakBuffer×ATR of the highest-low active zone lying fully below this bar’s close (zone.high < close) that passes the strength gate (SupportStrength under SupportBreakMode 2, MinStrength otherwise, plus the minimum touch count). With SupportTracking = 0 the legacy support-zone rule picks the zone instead. Re-selected on every bar, so unlike the real Exit line it can move down. Written at the end of bar t, applies from t+1; empty while long (the entry bar included) and when no zone qualifies. Defined on the exit bar. In a merged run it follows the merged (final) position: drawn on the bars where the merged position is flat, whichever strategy closed it.',
  supportExitLine: 'LevelBreakoutRetest "Support line" (Details): sticky support exit line (SupportTracking = 1). Starts at entry zone.low − BreakBuffer×ATR and never moves down: it steps up when price climbs fully above a higher zone passing the strength gate (SupportStrength under SupportBreakMode 2, MinStrength otherwise), and can also rise without a zone upgrade when ATR shrinks or the support band shifts up. The green band on the chart is the zone it hangs from. Written at the end of bar t, applies from t+1; empty while flat or with SupportTracking = 0. Offered here only when it differs from the Exit line somewhere in this result: the Exit line is max(Initial stop, Support line), so when the stop never sits above it the two are identical on every bar and this chip is left out (it would only be drawn on top of the red line).',
  stopLevel: 'LevelBreakoutRetest "Initial stop" (Details): protective stop of the open long, fixed at entry and never moved. Retest entries: min(retest low, zone.low) − StopBuffer×ATR; runaway entries: zone.low − StopBuffer×ATR. A close below it exits (STOP). Written at the end of bar t, applies from t+1; empty while flat. Adopted longs (opened by another strategy in a merged run): zone.low − StopBuffer×ATR of the adopted support zone, empty when no zone qualified. Follows the merged (final) position. Offered here only when it differs from the Exit line somewhere in this result.',
  // --- LevelBreakoutRetest: trigger line, dated by the bar whose close it decides ---
  resistanceTrigger: 'LevelBreakoutRetest "Breakout line": zone.high + BreakBuffer×ATR(t−1) of the lowest ARMED zone whose line is at or above the previous close. A close above it is a breakout of that zone - the setup that then waits for a retest (green retest band) or a runaway close (dashed orange line). When flat with no armed setup, its value for the coming bar is drawn dotted in the next-bar slot ("breakout >"), with the runaway price after a breakout ("runaway ≈", dotted orange) - where the line would be, not orders for the next bar. Dated by the bar whose close it decides; drawn on every bar, long or flat - empty only when no armed zone is above. While long it is the next breakout above: a close above it still breaks the zone out (shown as a setup window), but it does not enter - the strategy is already in position.',
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
  strong: 'Strong zone: a support/resistance price band with strength ≥ MinStrength and enough touches. Only strong zones can be traded on a breakout. Drawn per bar: the zone containing the previous close plus the N nearest above and below (see "Level zones").',
  weak: 'Weak zone: an active support/resistance band below the MinStrength / touch-count gate. Ignored by the strategy; shown only with "Show weak zones" (own N nearest).',
  trigger: 'Resistance trigger zone: the zone that produces the Breakout line on that bar - the lowest ARMED zone at or above the previous close. Its dashed top edge is zone.high; a close above zone.high + BreakBuffer×ATR breaks it out. Always drawn, even outside the N nearest, on every bar the Breakout line is drawn (long or flat).',
};

// LevelBreakoutRetest buy / sell annotations (chartDataDTO.levelChart), for the legend swatches.
export const LEVEL_CHART_DESCRIPTIONS = {
  retestBand: 'Setup window after a breakout: the green retest band runs from the confirm line up to the touch line (a low at or below the touch line is a retest touch). The dashed orange line is the runaway line (a close above it enters without a retest; only while waiting for the touch), the short-dashed blue line is the base high (BaseMinBars > 0: from BaseMinBars bars after the breakout, a close above it enters as a base, again only while waiting for the touch), the faint red line the fail line (a close below it fails the setup). Hidden with "Show indicators". The glyph where the window ended: filled circle = confirmed (green: traded, amber: not traded), × = failed, hollow circle = missed (timeout / dwell), dash = dropped (zone pruned or merged).',
  supportZone: 'Sticky support zone (SupportTracking = 1): the zone the Support line hangs from while long. A new band starts on entry, on an upgrade ("↑") and when the band shifts. Stays visible when "Show indicators" is off.',
  position: 'In position: light background from the entry bar to the exit bar (an open trade runs to the last bar).',
  events: 'Events: BU = broken up (breakout), F = failed, MT = missed (timeout), MD = missed (dwell), BD = broken down. Off by default.',
};

// Next-bar trigger prices (StrategyResultDTO / SignalChartsDTO.nextTriggers), for the legend.
export const NEXT_BAR_DESCRIPTIONS = {
  lines: 'Next-bar triggers: the prices at which the model would act on the next bar, from the state at the last closed bar. '
    + 'Short segments one bar wide in the empty slot after the last bar (or on the last bar while it is in progress). '
    + 'Green = BUY, red = SELL; dashed = close-based (acts on the close), dotted = conditional (needs an intrabar fact too, marked *), '
    + 'solid = intrabar stop (fills at the line). Grey shading: a veto region (no buy there) or a channel band inside which no '
    + 'signal is possible. A black dot = the real close of that bar, for a run that ended in the past. '
    + 'Estimates of the rule, not predictions: details and the execution note are on the Summary tab.',
  info: 'Informational next-bar lines (LevelBreakoutRetest): where a setup arms (entry not before the bar after next), '
    + 'the initial stop if bought, the close below which a setup fails. Never a signal for the next bar.',
  preview: 'Setup preview (LevelBreakoutRetest, flat, no armed setup): nothing can buy on the next bar. '
    + 'Dotted in the next-bar slot: green "breakout >" = where the Breakout line would be (a close above it breaks the zone out; '
    + 'that bar itself does not buy); orange "runaway ≈" = from the bar after the breakout, a close above it buys without a '
    + 'retest (approximate: the ATR will have changed). A retest of the zone after the breakout can buy too. '
    + 'Not orders for the next bar; drawn even with "setup info" off.',
};
