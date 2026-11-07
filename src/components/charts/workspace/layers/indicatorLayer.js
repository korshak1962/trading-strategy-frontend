// src/components/charts/workspace/layers/indicatorLayer.js
//
// One registry indicator instance on PriceWorkspaceChart (architect design §6.2, §5): a LineSeries
// in the pane of its group (panes.js paneKeyOf: PRICE on the candles, a bounded scale in a shared
// pane with a fixed lo..hi range, an unbounded one in a pane of its own), plus a short dashed
// series for the provisional tail (Q8).
//
// Gaps (Q7): a null value never becomes 0. lightweight-charts 5.2.1 draws a LineSeries straight
// across whitespace points, so a whitespace point alone does not break the line (F0 spike); the
// point before a gap gets colour 'transparent' - a point's colour paints the segment that STARTS
// at it - so the line visibly stops there and resumes at the next value.
//
// data: {
//   label, color,              // 'SMA(50)'; a token reference 'var(--chart-series-N)' or a hex
//   hidden,                    // drawn nothing, no tooltip row
//   paneKey, range,            // pane group; {minValue, maxValue} for a bounded pane, else null
//   unit, warmup,              // descriptor.unit / descriptor.warmup (value format, reason text)
//   series: {                  // one indicator of GET /api/indicators/series, or null (not loaded / inactive)
//     times,                   //   bar times (Unix s) of the response's dates
//     values, reasons,         //   values[i] or null; reasons: {"<index>": REASON} - keys are STRINGS
//     provisional,             //   indices whose value may still change
//     status, stale,           //   OK | STALE | NOT_STORED | ERROR; the stale tail {storedTo, ...}
//   },
// }
import { LineSeries } from 'lightweight-charts';
import { resolveColor } from '../../../../theme/theme';
import { PRICE_PANE_KEY } from '../panes';
import { formatBarKey } from '../bars';

const LINE_DASHED = 2;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const PRECISION = { PRICE: 2, PRICE_RANGE: 2, PERCENT: 2, RATIO: 3 };

/** A value in its unit: 728.14, 0.009, 1.23%. */
export const formatIndicatorValue = (v, unit) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
  const digits = PRECISION[unit] ?? 4;
  // The typographic minus, as the tooltip's Change line (m6).
  const text = Math.abs(v).toFixed(digits);
  const signed = v < 0 && Number(text) !== 0 ? `−${text}` : text;
  return unit === 'PERCENT' ? `${signed}%` : signed;
};

/** Why a value is missing, in words (Q7). */
export const reasonText = (reason, { warmup = null, stale = null, timeframe = null } = {}) => {
  switch (reason) {
    case 'INSUFFICIENT_HISTORY': return warmup ? `warm-up, needs ${warmup}` : 'warm-up';
    case 'ZERO_RANGE': return 'zero range (high = low)';
    case 'INDICATOR_MISSING': return 'not computed';
    case 'WEEK_INCONSISTENT': return 'week bars inconsistent';
    case 'DATA_GAP': return 'data gap';
    case 'STALE_TAIL': return stale?.storedTo ? `stale: stored to ${formatBarKey(stale.storedTo, timeframe)}` : 'stale tail';
    default: return reason ? String(reason).toLowerCase().replace(/_/g, ' ') : 'no value';
  }
};

/**
 * The line data of one series on the candle grid: {main, prov} (lightweight-charts points).
 * Pure: exported for tests. `candleTimes` ascending; values off the grid are dropped (they would
 * add a phantom slot to the shared time axis).
 */
export const buildIndicatorPoints = (candleTimes, series) => {
  const main = [];
  const prov = [];
  if (!series || !Array.isArray(series.values) || !Array.isArray(series.times)) return { main, prov };
  const byTime = new Map();
  series.times.forEach((t, i) => byTime.set(t, i));
  const provSet = new Set((series.provisional || []).map(Number));
  let lastMain = null;
  let provStarted = false;
  for (const time of candleTimes) {
    const i = byTime.get(time);
    const v = i === undefined ? null : series.values[i];
    const has = typeof v === 'number' && Number.isFinite(v);
    if (has && i !== undefined && provSet.has(i)) {
      if (!provStarted) {
        provStarted = true;
        if (lastMain) prov.push({ time: lastMain.time, value: lastMain.value });
      }
      prov.push({ time, value: v });
      main.push({ time });
      continue;
    }
    if (has) {
      const p = { time, value: v };
      main.push(p);
      lastMain = p;
    } else {
      main.push({ time });
      if (provStarted) prov.push({ time });
    }
  }
  // The point before a gap paints the segment across it: transparent.
  for (let k = 0; k < main.length - 1; k++) {
    if (main[k].value !== undefined && main[k + 1].value === undefined) main[k] = { ...main[k], color: TRANSPARENT };
  }
  // Trim trailing whitespace of the provisional series.
  while (prov.length && prov[prov.length - 1].value === undefined) prov.pop();
  return { main, prov };
};

/** Creates an indicator layer instance (PriceWorkspaceChart layer contract). */
export function createIndicatorLayer() {
  let ctx = null;
  let data = null;
  let mainSeries = null;
  let provSeries = null;
  let seriesPane = null;
  let indexByCandle = null; // candle index -> response index

  const colorOf = () => resolveColor(data?.color) || '#888888';

  const removeSeries = () => {
    if (mainSeries) ctx?.removePaneSeries(mainSeries);
    if (provSeries) ctx?.removePaneSeries(provSeries);
    mainSeries = null;
    provSeries = null;
    seriesPane = null;
  };

  const seriesOptions = (provisional) => {
    const color = colorOf();
    const inPrice = data.paneKey === PRICE_PANE_KEY;
    const range = data.range;
    return {
      color,
      lineWidth: 2,
      lineStyle: provisional ? LINE_DASHED : 0,
      priceLineVisible: false,
      lastValueVisible: !inPrice && !provisional,
      crosshairMarkerVisible: !provisional,
      pointMarkersVisible: provisional,
      pointMarkersRadius: provisional ? 3 : undefined,
      title: '',
      priceFormat: { type: 'price', precision: PRECISION[data.unit] ?? 4, minMove: 10 ** -(PRECISION[data.unit] ?? 4) },
      // A3: overlays never move the price axis; a bounded pane shows exactly lo..hi.
      autoscaleInfoProvider: inPrice
        ? ctx.overlayAutoscale
        : range ? () => ({ priceRange: { ...range } }) : undefined,
    };
  };

  function render() {
    if (!ctx) return;
    const visible = data && !data.hidden && data.series && Array.isArray(data.series.values)
      && data.series.values.some(v => typeof v === 'number');
    if (!visible) {
      removeSeries();
      indexByCandle = null;
      return;
    }
    if (seriesPane !== null && seriesPane !== data.paneKey) removeSeries();
    const candleTimes = ctx.candleData().map(c => c.time);
    const { main, prov } = buildIndicatorPoints(candleTimes, data.series);
    if (!mainSeries) {
      mainSeries = ctx.addPaneSeries(data.paneKey, LineSeries, seriesOptions(false));
      seriesPane = data.paneKey;
    } else {
      mainSeries.applyOptions(seriesOptions(false));
    }
    mainSeries.setData(main);
    if (prov.length > 1 || (prov.length === 1 && main.every(p => p.value === undefined))) {
      if (!provSeries) provSeries = ctx.addPaneSeries(data.paneKey, LineSeries, seriesOptions(true));
      else provSeries.applyOptions(seriesOptions(true));
      provSeries.setData(prov);
    } else if (provSeries) {
      ctx.removePaneSeries(provSeries);
      provSeries = null;
    }
    const byTime = new Map();
    data.series.times.forEach((t, i) => byTime.set(t, i));
    indexByCandle = candleTimes.map(t => byTime.get(t) ?? -1);
  }

  return {
    attach(c) {
      ctx = c;
    },
    update(d) {
      data = d;
      render();
    },
    applyTheme() {
      if (!data) return;
      mainSeries?.applyOptions({ color: colorOf() });
      provSeries?.applyOptions({ color: colorOf() });
    },
    tooltipRows(barIndex) {
      if (!data || data.hidden || !data.series || !indexByCandle) return [];
      const i = indexByCandle[barIndex];
      if (i === undefined || i < 0) return [];
      const s = data.series;
      const v = s.values[i];
      const has = typeof v === 'number' && Number.isFinite(v);
      // reasons arrives as a JSON object: its keys are strings ("25"), never numbers.
      const reason = s.reasons ? s.reasons[String(i)] : undefined;
      const provisional = has && (s.provisional || []).some(p => Number(p) === i);
      let note;
      if (!has) note = reasonText(reason, { warmup: data.warmup, stale: s.stale, timeframe: data.timeframe });
      else if (provisional) note = 'provisional — bar not closed, value will change';
      return [{
        label: data.label,
        value: has ? formatIndicatorValue(v, data.unit) : '–',
        color: colorOf(),
        note,
      }];
    },
    detach() {
      removeSeries();
      indexByCandle = null;
      ctx = null;
    },
  };
}
