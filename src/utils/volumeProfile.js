// src/utils/volumeProfile.js
//
// Volume profile (TASK_indicators_chart_volume, architect design rev 2 D3): the volume of a set of
// bars aggregated by price rows, like TradingView's "Visible Range Volume Profile". Pure: no React,
// no chart. Simplified granularity (owner's decision): the chart's own bars, no intrabar data - a
// bar's volume is spread evenly over its low..high range, proportionally to the overlap with each
// row; a bar with low == high puts all its volume in one row.
//
// Rows are equal in PRICE (not in log-price): the numbers never depend on the Log / Linear display.
// The result keeps every row (not pixels), so POC (argmax row total) and Value Area (grow from the
// POC to 70 % of the total) can later be read off the same `rows` without touching this function.

export const VP_ROWS_MIN = 6;
export const VP_ROWS_MAX = 200;
export const VP_ROWS_DEFAULT = 24;
export const VP_WIDTH_MIN = 10;
export const VP_WIDTH_MAX = 60;
export const VP_WIDTH_DEFAULT = 30;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The row index of price `p`: clamp(floor((p - lo) / rowHeight), 0, R - 1), so p == hi is the top
 * row. Exported for the layer (tooltip row under the cursor). `rowHeight` 0 (flat range) -> 0.
 */
/** Residue tolerance relative to the row's volume (see clampResidue). */
const RESIDUE_REL = 1e-9;

/** `x` or 0 when it is negative or a floating leftover below RESIDUE_REL of |x| + |other|. */
export const clampResidue = (x, other) => (x < RESIDUE_REL * (Math.abs(x) + Math.abs(other)) ? 0 : x);

/**
 * A share `part / whole` in percent, clamped to [0, 100] and rounded to `digits`; never "-0".
 * 0 when `whole` is not positive.
 */
export const formatShare = (part, whole, digits = 0) => {
  const v = whole > 0 ? (part / whole) * 100 : 0;
  const c = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
  const s = c.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
};

export const rowIndexOf = (p, lo, rowHeight, rowCount) => {
  if (!(rowHeight > 0)) return 0;
  const i = Math.floor((p - lo) / rowHeight);
  return i < 0 ? 0 : i >= rowCount ? rowCount - 1 : i;
};

/**
 * @param {Array<{low:number, high:number, open:number, close:number, volume:?number}>} bars - the
 *   visible bars, any order. A bar with a non-finite open / high / low / close is ignored entirely;
 *   a bar whose volume is not a finite number >= 0 still defines the price range (it is on screen)
 *   but adds no volume (`barsNoVolume`); volume 0 adds nothing (`barsZeroVolume`).
 * @param {{rows?: number}} [opts] - row count, rounded and clamped to 1..VP_ROWS_MAX (default 24).
 *   The UI range VP_ROWS_MIN..VP_ROWS_MAX is enforced by the params (sanitizeVolumeProfileParams);
 *   the function itself takes fewer rows too (the design's reference vector uses 4).
 * @returns {null | {lo:number, hi:number, rowHeight:number,
 *   rows: Array<{lo:number, hi:number, up:number, down:number, total:number}>,
 *   total:number, up:number, down:number, maxRowTotal:number,
 *   barsUsed:number, barsZeroVolume:number, barsNoVolume:number}}
 *   rows[0] is the lowest price; null when no bar has a finite OHLC. Direction: close >= open = up.
 *   Invariant: sum of rows' totals == sum of the used bars' volumes; up + down == total.
 */
export function computeVolumeProfile(bars, opts = {}) {
  const list = Array.isArray(bars) ? bars : [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of list) {
    if (!b || !finite(b.low) || !finite(b.high) || !finite(b.open) || !finite(b.close)) continue;
    const l = Math.min(b.low, b.high);
    const h = Math.max(b.low, b.high);
    if (l < lo) lo = l;
    if (h > hi) hi = h;
  }
  if (!(lo <= hi)) return null;

  const reqRows = Math.round(Number(opts.rows));
  const R0 = Number.isFinite(reqRows)
    ? Math.min(VP_ROWS_MAX, Math.max(1, reqRows))
    : VP_ROWS_DEFAULT;
  // Every visible bar flat at one price: a single row [lo, hi].
  const R = hi > lo ? R0 : 1;
  const rh = hi > lo ? (hi - lo) / R : 0;

  const up = new Float64Array(R);
  const down = new Float64Array(R);
  // Difference arrays for the fully covered middle rows (O(1) per bar).
  const upDiff = new Float64Array(R + 1);
  const downDiff = new Float64Array(R + 1);

  let barsUsed = 0;
  let barsZeroVolume = 0;
  let barsNoVolume = 0;

  for (const b of list) {
    if (!b || !finite(b.low) || !finite(b.high) || !finite(b.open) || !finite(b.close)) continue;
    const v = b.volume;
    if (!finite(v) || v < 0) { barsNoVolume++; continue; }
    if (v === 0) { barsZeroVolume++; continue; }
    barsUsed++;
    const isUp = b.close >= b.open;
    const acc = isUp ? up : down;
    const diff = isUp ? upDiff : downDiff;
    const l = Math.min(b.low, b.high);
    const h = Math.max(b.low, b.high);
    if (!(h > l) || rh === 0) {
      acc[rowIndexOf(l, lo, rh, R)] += v;
      continue;
    }
    const i0 = rowIndexOf(l, lo, rh, R);
    const i1 = rowIndexOf(h, lo, rh, R);
    if (i0 === i1) {
      acc[i0] += v;
      continue;
    }
    const d = v / (h - l);
    // The bottom row gets the part from the bar's low to the row's top, the top row the part from
    // its bottom to the bar's high. Row edges as lo + i * rh (the last top is exactly hi).
    const top0 = i0 + 1 === R ? hi : lo + (i0 + 1) * rh;
    const bottom1 = lo + i1 * rh;
    acc[i0] += d * (top0 - l);
    acc[i1] += d * (h - bottom1);
    if (i1 - i0 > 1) {
      // The middle rows split the rest equally: exactly v minus the two edge parts, so the sum
      // stays exact even when the edges are rounded.
      const middle = (v - d * (top0 - l) - d * (h - bottom1)) / (i1 - i0 - 1);
      diff[i0 + 1] += middle;
      diff[i1] -= middle;
    }
  }

  const rows = new Array(R);
  let runUp = 0;
  let runDown = 0;
  let totalUp = 0;
  let totalDown = 0;
  let maxRowTotal = 0;
  for (let i = 0; i < R; i++) {
    runUp += upDiff[i];
    runDown += downDiff[i];
    // Difference-array residue (e.g. -1.49e-8 on an up-only row) is clamped to 0: a side is
    // never negative, and a leftover below 1e-9 of the row is not a volume.
    const u = clampResidue(up[i] + runUp, down[i] + runDown);
    const dn = clampResidue(down[i] + runDown, up[i] + runUp);
    const t = u + dn;
    totalUp += u;
    totalDown += dn;
    if (t > maxRowTotal) maxRowTotal = t;
    rows[i] = {
      lo: R === 1 ? lo : lo + i * rh,
      hi: R === 1 || i === R - 1 ? hi : lo + (i + 1) * rh,
      up: u,
      down: dn,
      total: t,
    };
  }

  return {
    lo, hi, rowHeight: rh, rows,
    total: totalUp + totalDown, up: totalUp, down: totalDown, maxRowTotal,
    barsUsed, barsZeroVolume, barsNoVolume,
  };
}
