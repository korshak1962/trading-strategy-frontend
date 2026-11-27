// src/utils/levelZones.js
//
// Pure selection of the level zones drawn on the price chart of a strategy result that sends
// `levelZones[]` (screener logs/agents/architect.md, option B, §3.2; the LevelBreakoutRetest class
// that first sent them is removed, the contract stays). No React, no canvas.
//
// Transport (ChartDataDTO.levelZones, optional - other strategies send [] or nothing):
//   [{ zoneId, from, to, low, high, strong, armed, trigger,
//      center, touchCount, flipCount, firstTouchDate, lastTouchDate, strengthAtFrom }]
//   - from / to: bar dates (same wire format as prices[].date, parsed with parseExchangeTs).
//     Both inclusive. The state on date t is the zone map after t-1 (plus overlay), i.e. what
//     decided close(t) - the same dating as the resistanceTrigger series.
//     The backend never sends a null `to`; a missing / unparseable one is still tolerated and
//     means "open until the last bar".
//   - strong: strength(z, t-1) >= MinStrength && touchCount >= minTouches; weak otherwise.
//   - armed: the zone's breakout tracker is ARMED on those bars.
//   - trigger: this zone produces resistanceTrigger on those bars (at most one per bar), on every
//     bar - long or flat (TASK_level_lines_always_zone_hover_fullscreen.md §B1; it used to be
//     false while long). (The former supportTrigger series and its zone are gone.)
//   - center, touchCount, flipCount, firstTouchDate, lastTouchDate, strengthAtFrom: the zone's
//     characteristics, constant within the segment (§B3), for the zone tooltip only. strengthAtFrom
//     is strength(z, from - 1); the strength on a later bar of the segment follows pure decay:
//     F + (strengthAtFrom - F)·exp(-(i - fromIndex) / decayBars), F = flipBonus·flipCount.
//     Absent on an older backend: NaN (numbers) / NaN ms (dates) - the tooltip shows "–".
//   - breakouts {up, down, failed, last} (optional, level range zones stage 2): breakout history of
//     the zone over the 250 bars up to and including `from`; absent -> null (normalizeBreakouts).
//
// Each run keeps a reference to its normalized segment (`run.segment`) for the zone tooltip.
//
// Per bar t (index i >= 1), with ref = close(t-1) and the segments covering t:
//   - containing: low <= ref <= high
//   - N nearest above: low > ref, ascending low
//   - N nearest below: high < ref, descending high
// done separately for strong and weak zones (weak only when showWeak). With allStrong every
// strong segment covering t is drawn; the strong ones that are neither among the N nearest nor the
// trigger zone are flagged `faint` (drawn as faint context, one fill without stacking - constructor
// editor UX Stage B, B4). The segment flagged `trigger` (the zone the resistanceTrigger line comes
// from) is outlined and always drawn, regardless of N.
// ref = close(t-1) matches the backend's dating: a segment dated t is the map that decided close(t).
//
// Consecutive bars showing the same segment with the same faint state merge into one run,
// returned with its x extent in ms (bar-slot edges), so the canvas draws one fillRect per run;
// a segment that turns faint (or back) on a bar starts a new run there.
// Without allStrong the runs carry no `faint` key: the output is exactly the pre-B4 one (gate GB8).

import { parseExchangeTs } from './dates';

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const msOf = (v) => (v === null || v === undefined || v === '' ? NaN : parseExchangeTs(v).getTime());

export const LEVEL_ZONES_MAX_N = 5;
export const LEVEL_ZONES_DEFAULT_SETTINGS = Object.freeze({ nearestN: 1, showWeak: false, allStrong: false });

/** Coerce a stored / user-typed N into 0..LEVEL_ZONES_MAX_N (default 1). */
export const clampNearestN = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return LEVEL_ZONES_DEFAULT_SETTINGS.nearestN;
  return Math.min(LEVEL_ZONES_MAX_N, Math.max(0, n));
};

/**
 * The strategy chart's zone settings as read from storage (a JSON string or null): nearestN and
 * showWeak are kept, allStrong is session-only and always starts off (B4: one debug click must not
 * make every later chart dense). Unreadable input gives the defaults.
 */
export const levelZoneSettingsFromStored = (raw) => {
  try {
    if (!raw) return { ...LEVEL_ZONES_DEFAULT_SETTINGS };
    const stored = JSON.parse(raw) || {};
    return {
      nearestN: clampNearestN(stored.nearestN ?? LEVEL_ZONES_DEFAULT_SETTINGS.nearestN),
      showWeak: stored.showWeak === true,
      allStrong: false,
    };
  } catch {
    return { ...LEVEL_ZONES_DEFAULT_SETTINGS };
  }
};

/** The JSON string stored for the zone settings: nearestN and showWeak only (never allStrong). */
export const levelZoneSettingsToStore = (settings) =>
  JSON.stringify({ nearestN: settings.nearestN, showWeak: settings.showWeak === true });

/**
 * Indicators Chart only (TASK_level_zone_hover_select §1.3): the Levels overlay draws the zone map
 * as of `to`, where a HOUR map can hold many zones, so its N goes up to 20 (plus an "all zones"
 * switch). The Backtest chart keeps LEVEL_ZONES_MAX_N.
 */
export const LEVEL_CHART_MAX_N = 20;

/** Coerce the Indicators Chart's N into 0..LEVEL_CHART_MAX_N (`fallback` when unreadable). */
export const clampChartNearestN = (value, fallback = 2) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LEVEL_CHART_MAX_N, Math.max(0, n));
};

/** True when the chart data carries at least one zone segment. */
export const hasLevelZones = (chartData) =>
  Array.isArray(chartData?.levelZones) && chartData.levelZones.length > 0;

/**
 * A segment's `breakouts` {up, down, failed, last} (level range zones stage 2: counts over the 250
 * bars up to and including the segment's `from`). The key is absent for a
 * strategy without breakout history and on an older backend: null, and the tooltip shows nothing.
 */
export const normalizeBreakouts = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const count = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);
  return { up: count(raw.up), down: count(raw.down), failed: count(raw.failed), lastMs: msOf(raw.last) };
};

const fmtBandPrice = (v) => Number(v).toFixed(2);
const datePart = (v) => (typeof v === 'string' && v.length >= 10 ? v.substring(0, 10) : null);

/**
 * The extra lines of an as-of map zone (GET /api/levels/{ticker}/as-of, level range zones stage 2)
 * for the zone card and the level layer's tooltip:
 *   crossings: 'crossed 5× (penalised 3), last 2026-09-18' when crossings.count > 0, else null
 *   rawBand:   'raw band 12.30–12.95' when rawLow / rawHigh differ from low / high, else null
 * Absent fields (older backend, LEGACY: 0 crossings, raw = trading band) give null for both, so
 * those zones look exactly as before. Pure.
 */
export const levelZoneExtras = (zone) => {
  const c = zone?.crossings;
  const n = Number(c?.count);
  let crossings = null;
  if (Number.isFinite(n) && n > 0) {
    const pen = Number(c.penalised);
    const last = datePart(c.last);
    crossings = `crossed ${n}×${Number.isFinite(pen) ? ` (penalised ${pen})` : ''}${last ? `, last ${last}` : ''}`;
  }
  let rawBand = null;
  const rl = Number(zone?.rawLow);
  const rh = Number(zone?.rawHigh);
  const lo = Number(zone?.low);
  const hi = Number(zone?.high);
  const given = zone?.rawLow !== null && zone?.rawLow !== undefined && zone?.rawHigh !== null && zone?.rawHigh !== undefined;
  if (given && [rl, rh, lo, hi].every(Number.isFinite)
    && (Math.abs(Math.min(rl, rh) - Math.min(lo, hi)) > 1e-9 || Math.abs(Math.max(rl, rh) - Math.max(lo, hi)) > 1e-9)) {
    rawBand = `raw band ${fmtBandPrice(Math.min(rl, rh))}–${fmtBandPrice(Math.max(rl, rh))}`;
  }
  return { crossings, rawBand };
};

/**
 * Normalizes the raw DTO list: parsed ms bounds, numeric band, boolean flags. Malformed entries
 * (no from date, non-numeric low/high) are dropped instead of breaking the chart.
 */
export const normalizeLevelZoneSegments = (rawSegments) => {
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
      // §B3 characteristics (tooltip only); NaN when an older backend does not send them
      center: num(seg.center),
      touchCount: num(seg.touchCount),
      flipCount: num(seg.flipCount),
      firstTouchMs: msOf(seg.firstTouchDate),
      lastTouchMs: msOf(seg.lastTouchDate),
      strengthAtFrom: num(seg.strengthAtFrom),
      breakouts: normalizeBreakouts(seg.breakouts),
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
 * @param {boolean} [options.allStrong=false] - every strong zone; the ones outside the N nearest
 *   (and not the trigger zone) come back `faint: true`
 * @returns {Array<{zoneId, low: number, high: number, strong: boolean, armed: boolean, outlined: boolean,
 *   startMs: number, endMs: number, startIndex: number, endIndex: number, segment: Object, faint?: boolean}>}
 *   `segment`: the normalized segment the run draws (all its fields, for the zone tooltip);
 *   `faint`: present only with allStrong (true / false)
 */
export const buildLevelZoneRuns = (prices, rawSegments, options = {}) => {
  const bars = prices || [];
  if (bars.length < 2 || !rawSegments || rawSegments.length === 0) return [];
  const nearestN = clampNearestN(options.nearestN ?? LEVEL_ZONES_DEFAULT_SETTINGS.nearestN);
  const showWeak = options.showWeak === true;
  const allStrong = options.allStrong === true;

  const segments = normalizeLevelZoneSegments(rawSegments);
  if (segments.length === 0) return [];

  const barTimes = bars.map(price => parseExchangeTs(price.date).getTime());
  const { left, right } = slotEdges(barTimes);

  const runs = [];
  const openRuns = new Map(); // segment key (+ ':f' when faint) -> run still being extended
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

    const nearest = selectNearest(strong, ref, nearestN);
    const nearestSet = new Set(nearest);
    const selected = new Set(allStrong ? strong : nearest);
    if (showWeak) selectNearest(weak, ref, nearestN).forEach(seg => selected.add(seg));

    // The trigger zone is always shown (outlined), even outside the N nearest / when weak.
    covering.forEach(seg => { if (seg.trigger) selected.add(seg); });

    selected.forEach(seg => {
      // Faint: a strong zone drawn only because of allStrong (weak ones come from showWeak's own N)
      const faint = allStrong && seg.strong && !seg.trigger && !nearestSet.has(seg);
      const runKey = faint ? `${seg.key}:f` : seg.key;
      const open = openRuns.get(runKey);
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
          segment: seg,
        };
        if (allStrong) run.faint = faint;
        runs.push(run);
        openRuns.set(runKey, run);
      }
    });
  }
  return runs;
};

// ---------------------------------------------------------------------------------------------
// Zone tooltip (screener TASK_level_lines_always_zone_hover_fullscreen.md §B3 / §F2). Moved here
// from the former utils/levelChart.js when the LevelBreakoutRetest class and its buy / sell
// annotations were removed (screener architect_lbr_removal_v1.md §7): the zone bands and their
// tooltip stay for strategies that send `levelZones[]`.
// ---------------------------------------------------------------------------------------------

/** Zones on one bar, lowest first: zone.low, then id (objects with `zoneLow` / `zoneId`). */
export const byZoneLowThenId = (a, b) =>
  (a.zoneLow - b.zoneLow) || (Number(a.zoneId) - Number(b.zoneId)) || 0;

/**
 * Strength of a zone segment on bar `barIndex`. Within a segment the strength follows pure decay
 * from strengthAtFrom: F + (strengthAtFrom − F)·exp(−(barIndex − fromIndex) / decayBars),
 * F = flipBonus·flipCount.
 * @returns {{value: number, exact: boolean}} exact = false: the value is strengthAtFrom ("at segment
 *   start") because fromIndex / decayBars / flipBonus could not be resolved; NaN when not sent.
 */
export const zoneStrengthAt = (segment, barIndex, fromIndex, params) => {
  const start = segment ? segment.strengthAtFrom : NaN;
  if (!Number.isFinite(start)) return { value: NaN, exact: false };
  const decay = params ? params.decayBars : NaN;
  const flips = segment.flipCount;
  const floor = flips === 0 ? 0 : (Number.isFinite(flips) && Number.isFinite(params?.flipBonus) ? params.flipBonus * flips : NaN);
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || barIndex < fromIndex
    || !Number.isFinite(decay) || decay <= 0 || !Number.isFinite(floor)) {
    return { value: start, exact: false };
  }
  return { value: floor + (start - floor) * Math.exp(-(barIndex - fromIndex) / decay), exact: true };
};

/**
 * Everything the zone tooltip shows for one hovered zone on bar `barIndex`. Pure; every missing
 * input gives NaN / null and the tooltip shows "–" for it.
 *
 * @param {{segment: Object|null, band: {zoneId, low: number, high: number}}} hit - the normalized
 *   levelZones segment (normalizeLevelZoneSegments, may be null) and the band that was hit
 * @param {number} barIndex - index into prices
 * @param {Object} context
 * @param {Array<number>} context.closes - close per price bar
 * @param {Map<number, number>} context.barIndexByMs - bar time (ms) -> bar index
 * @param {number} context.breakoutLine - the breakout line on this bar (NaN when empty)
 * @param {Object} [context.params] - optional strategy parameters {decayBars, flipBonus, minStrength,
 *   minTouches, breakBuffer}; absent: strength at segment start, no gate / minimum / fail line
 * @param {Array<number>} [context.atr] - optional ATR(t-1) per price bar; absent: no ATR distances
 * @returns {Object}
 */
export const describeZone = ({ segment, band }, barIndex, { closes, barIndexByMs, breakoutLine, params = null, atr = null }) => {
  const source = segment || band || {};
  const low = Number(source.low);
  const high = Number(source.high);
  const zoneId = source.zoneId ?? band?.zoneId;
  const p = params || {};
  const atrValue = Array.isArray(atr) && atr.length === (closes ? closes.length : -1) ? Number(atr[barIndex]) : NaN;
  const atrOk = Number.isFinite(atrValue) && atrValue > 0;

  // Position against close(t-1) - the same ref the zone selection (buildLevelZoneRuns) uses
  const ref = barIndex > 0 && closes ? Number(closes[barIndex - 1]) : NaN;
  let position = null;
  if (Number.isFinite(ref) && ref > 0 && Number.isFinite(low) && Number.isFinite(high)) {
    if (low <= ref && ref <= high) position = { side: 'contains' };
    else {
      const edge = low > ref ? low : high;
      position = {
        side: low > ref ? 'above' : 'below',
        atr: atrOk ? (edge - ref) / atrValue : NaN,
        pct: (edge - ref) / ref,
      };
    }
  }

  const fromIndex = segment && barIndexByMs ? barIndexByMs.get(segment.fromMs) : undefined;
  const strength = zoneStrengthAt(segment, barIndex, fromIndex, p);
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const breakBuffer = num(p.breakBuffer);

  const width = high - low;
  return {
    zoneId,
    hasSegment: Boolean(segment),
    strong: segment ? segment.strong : null,
    armed: segment ? segment.armed : null,
    trigger: segment ? segment.trigger : null,
    low,
    high,
    width,
    widthAtr: atrOk && Number.isFinite(width) ? width / atrValue : NaN,
    center: segment ? segment.center : NaN,
    position,
    strength: strength.value,
    strengthExact: strength.exact,
    strengthGate: num(p.minStrength),
    touchCount: segment ? segment.touchCount : NaN,
    minTouches: num(p.minTouches),
    flipCount: segment ? segment.flipCount : NaN,
    firstTouchMs: segment ? segment.firstTouchMs : NaN,
    lastTouchMs: segment ? segment.lastTouchMs : NaN,
    breakoutLine: segment && segment.trigger ? breakoutLine : NaN,
    failLine: atrOk && Number.isFinite(breakBuffer) && Number.isFinite(low) ? low - breakBuffer * atrValue : NaN,
    fromMs: segment ? segment.fromMs : NaN,
    toMs: segment ? segment.toMs : NaN,
    // {up, down, failed, lastMs} over the 250 bars up to `from`, or null (absent on the wire)
    breakouts: segment?.breakouts ?? null,
  };
};
