// src/utils/levelZones.js
//
// Pure selection of the level zones drawn on the price chart for the LevelBreakoutRetest
// strategy (screener logs/agents/architect.md, option B, §3.2). No React, no canvas.
//
// Transport (ChartDataDTO.levelZones, optional - other strategies send [] or nothing):
//   [{ zoneId, from, to, low, high, strong, armed, trigger }]
//   - from / to: bar dates (same wire format as prices[].date, parsed with parseExchangeTs).
//     Both inclusive. The state on date t is the zone map after t-1 (plus overlay), i.e. what
//     decided close(t) - the same dating as the resistanceTrigger series.
//     The backend never sends a null `to`; a missing / unparseable one is still tolerated and
//     means "open until the last bar".
//   - strong: strength(z, t-1) >= MinStrength && touchCount >= minTouches; weak otherwise.
//   - armed: the zone's breakout tracker is ARMED on those bars.
//   - trigger: this zone produces resistanceTrigger on those bars (at most one per bar). False on
//     every bar that starts long, exactly where resistanceTrigger is empty (TASK_level_chart_ux.md
//     §2.3). (The former supportTrigger series and its zone are gone.)
//
// Per bar t (index i >= 1), with ref = close(t-1) and the segments covering t:
//   - containing: low <= ref <= high
//   - N nearest above: low > ref, ascending low
//   - N nearest below: high < ref, descending high
// done separately for strong and weak zones (weak only when showWeak). With allStrong every
// strong segment covering t is drawn. The segment flagged `trigger` (the zone the
// resistanceTrigger line comes from) is outlined and always drawn, regardless of N.
// ref = close(t-1) matches the backend's dating: a segment dated t is the map that decided close(t).
//
// Consecutive bars showing the same segment with the same outline flag merge into one run,
// returned with its x extent in ms (bar-slot edges), so the canvas draws one fillRect per run.

import { parseExchangeTs } from './dates';

export const LEVEL_ZONES_MAX_N = 5;
export const LEVEL_ZONES_DEFAULT_SETTINGS = Object.freeze({ nearestN: 1, showWeak: false, allStrong: false });

/** Coerce a stored / user-typed N into 0..LEVEL_ZONES_MAX_N (default 1). */
export const clampNearestN = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return LEVEL_ZONES_DEFAULT_SETTINGS.nearestN;
  return Math.min(LEVEL_ZONES_MAX_N, Math.max(0, n));
};

/** True when the chart data carries at least one zone segment. */
export const hasLevelZones = (chartData) =>
  Array.isArray(chartData?.levelZones) && chartData.levelZones.length > 0;

/**
 * Normalizes the raw DTO list: parsed ms bounds, numeric band, boolean flags. Malformed entries
 * (no from date, non-numeric low/high) are dropped instead of breaking the chart.
 */
const normalizeSegments = (rawSegments) => {
  const out = [];
  (rawSegments || []).forEach((seg, index) => {
    if (!seg) return;
    const fromMs = parseExchangeTs(seg.from).getTime();
    if (Number.isNaN(fromMs)) return;
    const parsedTo = parseExchangeTs(seg.to).getTime();
    const toMs = Number.isNaN(parsedTo) ? Infinity : parsedTo;
    const low = Number(seg.low);
    const high = Number(seg.high);
    if (!Number.isFinite(low) || !Number.isFinite(high) || toMs < fromMs) return;
    out.push({
      key: index,
      zoneId: seg.zoneId,
      fromMs,
      toMs,
      low: Math.min(low, high),
      high: Math.max(low, high),
      strong: seg.strong === true,
      armed: seg.armed === true,
      trigger: seg.trigger === true,
    });
  });
  return out.sort((a, b) => a.fromMs - b.fromMs);
};

/**
 * Containing zone(s) + N nearest above + N nearest below `ref`, among `segments`.
 * @returns {Array} the selected segments
 */
export const selectNearest = (segments, ref, nearestN) => {
  const containing = [];
  const above = [];
  const below = [];
  segments.forEach(seg => {
    if (seg.low <= ref && ref <= seg.high) containing.push(seg);
    else if (seg.low > ref) above.push(seg);
    else below.push(seg); // high < ref
  });
  if (nearestN <= 0) return containing;
  above.sort((a, b) => a.low - b.low);
  below.sort((a, b) => b.high - a.high);
  return [...containing, ...above.slice(0, nearestN), ...below.slice(0, nearestN)];
};

/**
 * Bar-slot edges in ms: halfway to each neighbour, half the neighbour spacing at the ends.
 * Adjacent bars share an edge, so a zone held over consecutive bars draws as one solid band.
 */
export const slotEdges = (barTimes) => {
  const n = barTimes.length;
  const left = new Array(n);
  const right = new Array(n);
  const fallbackHalf = 12 * 60 * 60 * 1000;
  for (let i = 0; i < n; i++) {
    const prevHalf = i > 0 ? (barTimes[i] - barTimes[i - 1]) / 2 : null;
    const nextHalf = i < n - 1 ? (barTimes[i + 1] - barTimes[i]) / 2 : null;
    left[i] = barTimes[i] - (prevHalf ?? nextHalf ?? fallbackHalf);
    right[i] = barTimes[i] + (nextHalf ?? prevHalf ?? fallbackHalf);
  }
  return { left, right };
};

/**
 * Builds the drawable zone runs for a result.
 *
 * @param {Array<{date, close}>} prices - chartData.prices (ascending)
 * @param {Array} rawSegments - chartData.levelZones
 * @param {Object} options
 * @param {number} [options.nearestN=1] - N nearest above / below, 0..5
 * @param {boolean} [options.showWeak=false] - also draw weak zones (own N nearest)
 * @param {boolean} [options.allStrong=false] - every strong zone, no nearest filter (debug)
 * @returns {Array<{zoneId, low: number, high: number, strong: boolean, armed: boolean, outlined: boolean,
 *   startMs: number, endMs: number, startIndex: number, endIndex: number}>}
 */
export const buildLevelZoneRuns = (prices, rawSegments, options = {}) => {
  const bars = prices || [];
  if (bars.length < 2 || !rawSegments || rawSegments.length === 0) return [];
  const nearestN = clampNearestN(options.nearestN ?? LEVEL_ZONES_DEFAULT_SETTINGS.nearestN);
  const showWeak = options.showWeak === true;
  const allStrong = options.allStrong === true;

  const segments = normalizeSegments(rawSegments);
  if (segments.length === 0) return [];

  const barTimes = bars.map(price => parseExchangeTs(price.date).getTime());
  const { left, right } = slotEdges(barTimes);

  const runs = [];
  const openRuns = new Map(); // segment key -> run still being extended
  let active = [];
  let next = 0; // sweep pointer into segments (sorted by fromMs)

  for (let i = 0; i < bars.length; i++) {
    const t = barTimes[i];
    if (Number.isNaN(t)) continue;
    while (next < segments.length && segments[next].fromMs <= t) active.push(segments[next++]);
    active = active.filter(seg => seg.toMs >= t);
    if (i === 0) continue; // no close(t-1) for the first bar

    const ref = Number(bars[i - 1].close);
    if (!Number.isFinite(ref) || active.length === 0) continue;

    const covering = active; // fromMs <= t <= toMs
    const strong = covering.filter(seg => seg.strong);
    const weak = covering.filter(seg => !seg.strong);

    const selected = new Set(allStrong ? strong : selectNearest(strong, ref, nearestN));
    if (showWeak) selectNearest(weak, ref, nearestN).forEach(seg => selected.add(seg));

    // The trigger zone is always shown (outlined), even outside the N nearest / when weak.
    covering.forEach(seg => { if (seg.trigger) selected.add(seg); });

    selected.forEach(seg => {
      const open = openRuns.get(seg.key);
      if (open && open.endIndex === i - 1) {
        open.endIndex = i;
        open.endMs = right[i];
      } else {
        const run = {
          zoneId: seg.zoneId,
          low: seg.low,
          high: seg.high,
          strong: seg.strong,
          armed: seg.armed,
          outlined: seg.trigger,
          startIndex: i,
          endIndex: i,
          startMs: left[i],
          endMs: right[i],
        };
        runs.push(run);
        openRuns.set(seg.key, run);
      }
    });
  }
  return runs;
};
