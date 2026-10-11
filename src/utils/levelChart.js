// src/utils/levelChart.js
//
// Pure helpers for the LevelBreakoutRetest buy / sell annotations (screener
// TASK_level_chart_ux.md rev. 2.1 §3-§4, logs/agents/architect.md §3.2). No React, no canvas.
//
// Transport: ChartDataDTO.levelChart - optional and additive; null / absent for other strategies
// and older backends, in which case normalizeLevelChart returns null and the chart is unchanged.
//   {
//     setupWindows: [{ zoneId, zoneLow, zoneHigh, breakoutDate, endDate, outcome, traded,
//                      notTradedReason, touchDate,
//                      points: [{ date, touchLine, runawayLine, confirmLine, failLine, phase }] }],
//     trades:   [{ entryDate, entryPrice, entryTrigger, entryZoneId, entryZoneLow, entryZoneHigh,
//                  initialStop, initialExitLine, exitDate, exitPrice, exitReason,
//                  supportUpgrades, mfeClose }],   // mfeClose = max(close) / entryPrice - 1
//     supportSegments: [{ zoneId, from, to, low, high }],
//     upgrades: [{ date, fromZoneId, toZoneId, newExitLine }],
//     events:   [{ date, type, zoneId, price }],
//     atr:      [number|null]          // ATR(t-1) per price bar, null before warm-up
//     params:   { supportTracking, maxRetestBars, maxDwellBars, confirmMode, runawayAtr, ... }
//   }
// - Dates are the bar's exchange-local wall clock, the same wire format as prices[].date
//   (parsed with parseExchangeTs, decision 0.18). A null endDate / exitDate = still open.
// - NaN arrives as null. Every numeric field is read through num(): null / non-numeric -> NaN.
// - Field and params names are exactly LevelChartDTO's (camelCase); no aliases. baseMinBars,
//   CONFIRMED_BASE and the BASE entry trigger are rev 2.9 placeholders and are simply absent today.
// - atr is used only when its length equals the number of price bars (design n7); otherwise no
//   ATR distances are shown and nothing else changes.

import { parseExchangeTs } from './dates';
import { slotEdges } from './levelZones';

/** Text labels on entry / exit markers only while at most this many markers are in view (§4.4). */
export const MARKER_LABEL_LIMIT = 40;

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const msOf = (v) => (v === null || v === undefined || v === '' ? NaN : parseExchangeTs(v).getTime());

export const OUTCOME_TEXT = Object.freeze({
  CONFIRMED_RETEST: 'confirmed (retest)',
  CONFIRMED_RUNAWAY: 'confirmed (runaway)',
  CONFIRMED_BASE: 'confirmed (base)',
  FAILED: 'failed (close below the fail line)',
  MISSED_TIMEOUT: 'missed: no retest in time',
  MISSED_DWELL: 'missed: no confirm in time after the touch',
  DROPPED: 'dropped (zone pruned or merged)',
  OPEN: 'still open at the last bar',
});

export const NOT_TRADED_TEXT = Object.freeze({
  ALREADY_LONG: 'already in position',
  EXITED_THIS_BAR: 'exited on this bar',
  REGIME: 'regime filter',
  LOWER_ZONE_ENTERED: 'a lower zone took the entry',
});

export const ENTRY_TRIGGER_TEXT = Object.freeze({ RETEST: 'Retest', RUNAWAY: 'Runaway', BASE: 'Base' });
export const EXIT_REASON_TEXT = Object.freeze({ STOP: 'Stop', SUPPORT_BREAK: 'Support', TAKE_PROFIT: 'TP' });
export const EXIT_REASON_LONG_TEXT = Object.freeze({
  STOP: 'Stop (close below the initial stop)',
  SUPPORT_BREAK: 'Support break (close below the support line)',
  TAKE_PROFIT: 'Take profit',
});

export const EVENT_TEXT = Object.freeze({
  BROKEN_UP: { short: 'BU', long: 'Broken up (breakout)' },
  FAILED: { short: 'F', long: 'Failed' },
  MISSED_TIMEOUT: { short: 'MT', long: 'Missed (timeout)' },
  MISSED_DWELL: { short: 'MD', long: 'Missed (dwell)' },
  BROKEN_DOWN: { short: 'BD', long: 'Broken down' },
});

export const isConfirmedOutcome = (outcome) => typeof outcome === 'string' && outcome.startsWith('CONFIRMED');

// baseMinBars: rev 2.9 placeholder (NaN until the backend sends it).
const PARAM_KEYS = [
  'supportTracking', 'maxRetestBars', 'maxDwellBars', 'confirmMode', 'runawayAtr',
  'touchTolerance', 'breakBuffer', 'baseMinBars',
];

const normalizeParams = (raw) => {
  const out = {};
  PARAM_KEYS.forEach(key => { out[key] = raw ? num(raw[key]) : NaN; });
  return out;
};

/** Waiting windows on a bar, lowest zone first - the strategy's own order (zone.low, then id). */
export const byZoneLowThenId = (a, b) =>
  (a.zoneLow - b.zoneLow) || (Number(a.zoneId) - Number(b.zoneId)) || 0;

/** Index of the bar at exactly `ms`, else -1. */
const barIndexOf = (indexByMs, ms) => (Number.isNaN(ms) ? -1 : (indexByMs.get(ms) ?? -1));

/**
 * Normalizes chartData.levelChart against the result's price bars. Returns null when there is
 * nothing to draw (no levelChart, or no bars) - every caller treats null as "not a level chart".
 *
 * @param {Object|null|undefined} rawLevelChart - chartData.levelChart
 * @param {Array<{date, close}>} prices - chartData.prices (ascending)
 * @returns {Object|null}
 */
export const normalizeLevelChart = (rawLevelChart, prices) => {
  const bars = prices || [];
  if (!rawLevelChart || typeof rawLevelChart !== 'object' || bars.length === 0) return null;

  const barTimes = bars.map(price => parseExchangeTs(price.date).getTime());
  const indexByMs = new Map();
  barTimes.forEach((ms, i) => { if (!Number.isNaN(ms)) indexByMs.set(ms, i); });
  const { left, right } = slotEdges(barTimes);
  const closes = bars.map(price => num(price.close));
  const lastIndex = bars.length - 1;

  // ATR(t-1) per bar - only when aligned with the bars
  const rawAtr = Array.isArray(rawLevelChart.atr) ? rawLevelChart.atr : null;
  const atr = rawAtr && rawAtr.length === bars.length ? rawAtr.map(num) : null;

  const params = normalizeParams(rawLevelChart.params);

  // --- setup windows (§3.2) ---
  const windows = [];
  (rawLevelChart.setupWindows || []).forEach((w, key) => {
    if (!w) return;
    const breakoutMs = msOf(w.breakoutDate);
    const endMs = msOf(w.endDate);
    const touchMs = msOf(w.touchDate);
    const points = [];
    (w.points || []).forEach((p, pointIndex) => {
      if (!p) return;
      const ms = msOf(p.date);
      const barIndex = barIndexOf(indexByMs, ms);
      if (barIndex === -1) return;
      points.push({
        pointIndex,
        ms,
        barIndex,
        touchLine: num(p.touchLine),
        runawayLine: num(p.runawayLine),
        confirmLine: num(p.confirmLine),
        failLine: num(p.failLine),
        phase: p.phase === 'TOUCHED' ? 'TOUCHED' : 'AWAIT',
      });
    });
    windows.push({
      key,
      zoneId: w.zoneId,
      zoneLow: num(w.zoneLow),
      zoneHigh: num(w.zoneHigh),
      breakoutMs,
      breakoutIndex: barIndexOf(indexByMs, breakoutMs),
      endMs,
      endIndex: barIndexOf(indexByMs, endMs),
      touchMs,
      touchIndex: barIndexOf(indexByMs, touchMs),
      outcome: typeof w.outcome === 'string' ? w.outcome : 'OPEN',
      traded: w.traded === true,
      notTradedReason: w.notTradedReason || null,
      points,
      firstIndex: points.length > 0 ? points[0].barIndex : barIndexOf(indexByMs, breakoutMs),
      lastIndex: points.length > 0 ? points[points.length - 1].barIndex : barIndexOf(indexByMs, endMs),
    });
  });

  // bar index -> [{window, point}] of the windows waiting on that bar
  const windowPointsByBar = new Map();
  windows.forEach(win => {
    win.points.forEach(point => {
      if (!windowPointsByBar.has(point.barIndex)) windowPointsByBar.set(point.barIndex, []);
      windowPointsByBar.get(point.barIndex).push({ window: win, point });
    });
  });
  // bar index -> windows that ended on that bar (their glyph sits there)
  const windowsEndingAt = new Map();
  windows.forEach(win => {
    if (win.endIndex === -1) return;
    if (!windowsEndingAt.has(win.endIndex)) windowsEndingAt.set(win.endIndex, []);
    windowsEndingAt.get(win.endIndex).push(win);
  });

  // --- trades (§3.3) ---
  const trades = [];
  (rawLevelChart.trades || []).forEach((t, key) => {
    if (!t) return;
    const entryMs = msOf(t.entryDate);
    const entryIndex = barIndexOf(indexByMs, entryMs);
    if (Number.isNaN(entryMs)) return;
    const exitMs = msOf(t.exitDate);
    trades.push({
      key,
      entryMs,
      entryIndex,
      entryPrice: num(t.entryPrice),
      entryTrigger: t.entryTrigger || null,
      entryZoneId: t.entryZoneId,
      entryZoneLow: num(t.entryZoneLow),
      entryZoneHigh: num(t.entryZoneHigh),
      initialStop: num(t.initialStop),
      initialExitLine: num(t.initialExitLine),
      exitMs,
      exitIndex: barIndexOf(indexByMs, exitMs),
      exitPrice: num(t.exitPrice),
      exitReason: t.exitReason || null,
      open: Number.isNaN(exitMs),
      supportUpgrades: num(t.supportUpgrades),
      mfeClose: num(t.mfeClose),
    });
  });
  const tradeByEntryMs = new Map();
  const tradeByExitMs = new Map();
  trades.forEach(trade => {
    tradeByEntryMs.set(trade.entryMs, trade);
    if (!trade.open) tradeByExitMs.set(trade.exitMs, trade);
  });

  // §4.1 clutter rule: a window that ended on a bar the position was LONG throughout (long at the
  // start and still long at the end - in practice notTradedReason = ALREADY_LONG) is drawn, and
  // hit-tested, only while "Events" is on. Every other window is unaffected.
  const longThroughout = (barIndex) => barIndex !== -1 && trades.some(trade =>
    trade.entryIndex !== -1 && trade.entryIndex < barIndex
    && (trade.open || trade.exitIndex === -1 || barIndex < trade.exitIndex));
  windows.forEach(win => {
    win.endsWhileLong = win.notTradedReason === 'ALREADY_LONG' || longThroughout(win.endIndex);
  });

  // Position shading spans, in ms (bar-slot edges): entry bar to exit bar, an open trade to the last bar
  const positionSpans = trades
    .filter(trade => trade.entryIndex !== -1)
    .map(trade => {
      const endIndex = trade.open || trade.exitIndex === -1 ? lastIndex : trade.exitIndex;
      return { startMs: left[trade.entryIndex], endMs: right[Math.max(trade.entryIndex, endIndex)] };
    });

  // --- sticky support segments (§3.4) ---
  const supportSegments = [];
  (rawLevelChart.supportSegments || []).forEach((seg, key) => {
    if (!seg) return;
    const fromMs = msOf(seg.from);
    const fromIndex = barIndexOf(indexByMs, fromMs);
    if (fromIndex === -1) return;
    const toMs = msOf(seg.to);
    const toIndexRaw = barIndexOf(indexByMs, toMs);
    const toIndex = toIndexRaw === -1 ? lastIndex : toIndexRaw;
    const low = num(seg.low);
    const high = num(seg.high);
    if (!Number.isFinite(low) || !Number.isFinite(high) || toIndex < fromIndex) return;
    supportSegments.push({
      key,
      zoneId: seg.zoneId,
      fromIndex,
      toIndex,
      startMs: left[fromIndex],
      endMs: right[toIndex],
      low: Math.min(low, high),
      high: Math.max(low, high),
    });
  });

  // --- upgrade markers and events (§3.4, §3.5) ---
  const upgrades = [];
  (rawLevelChart.upgrades || []).forEach((u, key) => {
    if (!u) return;
    const ms = msOf(u.date);
    const newExitLine = num(u.newExitLine);
    if (Number.isNaN(ms) || !Number.isFinite(newExitLine)) return;
    upgrades.push({ key, ms, barIndex: barIndexOf(indexByMs, ms), fromZoneId: u.fromZoneId, toZoneId: u.toZoneId, newExitLine });
  });
  const events = [];
  (rawLevelChart.events || []).forEach((e, key) => {
    if (!e) return;
    const ms = msOf(e.date);
    const price = num(e.price);
    if (Number.isNaN(ms) || !Number.isFinite(price)) return;
    events.push({ key, ms, barIndex: barIndexOf(indexByMs, ms), type: e.type, zoneId: e.zoneId, price });
  });

  return {
    barTimes,
    indexByMs,
    slotLeft: left,
    slotRight: right,
    closes,
    atr,
    params,
    windows,
    windowPointsByBar,
    windowsEndingAt,
    trades,
    tradeByEntryMs,
    tradeByExitMs,
    positionSpans,
    supportSegments,
    upgrades,
    events,
  };
};

/**
 * The level-strategy trade a marker belongs to, matched on (date, type) only (§4.5): a LongOpen
 * on a trade's entry bar, a LongClose on its exit bar. Anything else - other strategies' markers
 * in a merged run, short markers - gets null and renders exactly as before.
 * @returns {{trade: Object, role: 'entry'|'exit'}|null}
 */
export const matchTradeAnnotation = (levelChart, signal) => {
  if (!levelChart || !signal) return null;
  const ms = parseExchangeTs(signal.date).getTime();
  if (Number.isNaN(ms)) return null;
  if (signal.type === 'LongOpen') {
    const trade = levelChart.tradeByEntryMs.get(ms);
    return trade ? { trade, role: 'entry' } : null;
  }
  if (signal.type === 'LongClose') {
    const trade = levelChart.tradeByExitMs.get(ms);
    return trade ? { trade, role: 'exit' } : null;
  }
  return null;
};

/** Short label drawn next to a matched marker: "Retest" / "Runaway" / "Stop" / "Support" / "TP". */
export const markerLabel = (match) => {
  if (!match) return null;
  if (match.role === 'entry') return ENTRY_TRIGGER_TEXT[match.trade.entryTrigger] || null;
  return EXIT_REASON_TEXT[match.trade.exitReason] || null;
};

const fmtPrice = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');

/** "(+0.4 ATR)" / "(−2.0 ATR)" distance of `level` from `ref`, or '' without a usable ATR. */
const atrDistance = (level, ref, atr) => {
  if (!Number.isFinite(level) || !Number.isFinite(ref) || !Number.isFinite(atr) || atr <= 0) return '';
  const d = (level - ref) / atr;
  const sign = d >= 0 ? '+' : '−';
  return ` (${sign}${Math.abs(d).toFixed(1)} ATR)`;
};

/** The trade holding the position during bar i (entry bar .. bar before the exit), or null. */
const tradeHoldingAt = (levelChart, barIndex) => levelChart.trades.find(trade =>
  trade.entryIndex !== -1 && trade.entryIndex <= barIndex
  && (trade.open || trade.exitIndex === -1 || barIndex < trade.exitIndex)) || null;

/**
 * The one-line strategy status for the bar tooltip (§4.3, design n6), built from the result's own
 * series values (`seriesValueAt(name, barIndex)` - effectiveExit, resistanceTrigger), the setup
 * window points and atr[]. Distances in ATR are from this bar's close, in ATR(t-1).
 *
 * @param {Object|null} levelChart - from normalizeLevelChart
 * @param {number} barIndex - index into prices
 * @param {(name: string, barIndex: number) => number} seriesValueAt - NaN when absent
 * @returns {{text: string, note: string|null}|null}
 */
export const statusLine = (levelChart, barIndex, seriesValueAt) => {
  if (!levelChart || barIndex < 0 || barIndex >= levelChart.barTimes.length) return null;
  const close = levelChart.closes[barIndex];
  const atr = levelChart.atr ? levelChart.atr[barIndex] : NaN;
  const { params } = levelChart;

  // LONG: the exit line, and the support zone it hangs from
  const exitLine = seriesValueAt('effectiveExit', barIndex);
  const holding = tradeHoldingAt(levelChart, barIndex);
  if (Number.isFinite(exitLine) || holding) {
    let text = 'In position.';
    if (Number.isFinite(exitLine)) text += ` Exit below ${fmtPrice(exitLine)}${atrDistance(exitLine, close, atr)}.`;
    const segment = levelChart.supportSegments.find(seg => seg.fromIndex <= barIndex && barIndex <= seg.toIndex);
    if (segment) text += ` Support zone ${fmtPrice(segment.low)}–${fmtPrice(segment.high)}`;
    const note = params.supportTracking === 0
      ? 'Legacy rule: line shown on the bar it decided (one bar earlier than sticky mode).'
      : null;
    return { text: text.trim(), note };
  }

  // Exit bar: the position closed on this bar's close (effectiveExit / resistanceTrigger are
  // empty here by design, so neither the LONG nor the flat text applies)
  const exited = levelChart.tradeByExitMs.get(levelChart.barTimes[barIndex]);
  if (exited) {
    const reason = EXIT_REASON_LONG_TEXT[exited.exitReason] || exited.exitReason || 'exit';
    return { text: `Exited on this bar: ${reason} at ${fmtPrice(exited.exitPrice)}`, note: null };
  }

  // Waiting: the lowest zone's open window (it enters first), plus "(+N more)"
  const waiting = (levelChart.windowPointsByBar.get(barIndex) || [])
    .slice()
    .sort((a, b) => byZoneLowThenId(a.window, b.window));
  if (waiting.length > 0) {
    const { window: win, point } = waiting[0];
    const more = waiting.length > 1 ? ` (+${waiting.length - 1} more)` : '';
    let text;
    if (point.phase === 'TOUCHED') {
      const count = win.touchIndex !== -1 ? barIndex - win.touchIndex : NaN;
      const max = params.maxDwellBars;
      const counter = Number.isFinite(count)
        ? (Number.isFinite(max) && count > max ? `timed out, bar ${count} of ${max}` : `bar ${count}${Number.isFinite(max) ? ` of ${max}` : ''}`)
        : '';
      text = `Retest touched: confirm on close above ${fmtPrice(point.confirmLine)}${counter ? ` (${counter})` : ''}`;
    } else {
      const count = point.pointIndex + 1;
      const max = params.maxRetestBars;
      const counter = Number.isFinite(max) && count > max
        ? `timed out (bar ${count} of ${max})`
        : `bar ${count}${Number.isFinite(max) ? ` of ${max}` : ''}`;
      text = `Waiting for retest: ${counter}. Retest below ${fmtPrice(point.touchLine)}`;
      if (Number.isFinite(point.runawayLine)) text += `, runaway above ${fmtPrice(point.runawayLine)}`;
    }
    if (win.endIndex === barIndex) text += `. Ended here: ${OUTCOME_TEXT[win.outcome] || win.outcome}`;
    return { text: text + more, note: null };
  }

  // Flat: the next breakout line
  const breakout = seriesValueAt('resistanceTrigger', barIndex);
  if (Number.isFinite(breakout)) {
    return { text: `Flat. Next breakout above ${fmtPrice(breakout)}${atrDistance(breakout, close, atr)}`, note: null };
  }
  return { text: 'Flat. No armed zone above.', note: null };
};

/** Bars held (exit bar index - entry bar index), NaN when unknown. */
export const barsHeld = (trade) =>
  (trade && trade.entryIndex !== -1 && trade.exitIndex !== -1 ? trade.exitIndex - trade.entryIndex : NaN);
