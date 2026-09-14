// src/utils/indicatorSeries.js
//
// Pure helpers describing the indicator series a strategy result exposes, shared by the
// IndicatorPicker and all three result charts so that one series has the same id, label and
// colour everywhere (picker chip, line, legend, tooltip).
//
// The backend's ChartDataDTO carries two maps of `{date, value}` point lists:
//   - priceIndicators: drawn ON the price axis (moving averages, bands, ...)  -> kind 'price'
//   - indicators:      drawn on a secondary axis / sub-pane                   -> kind 'sub'
// A series is identified by `kind + ':' + name` so a same-named entry in both maps stays
// unambiguous.

// Fixed palette, assigned by position in the series list.
export const INDICATOR_PALETTE = [
  '#1f77b4', // blue
  '#ff7f0e', // orange
  '#2ca02c', // green
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#17becf', // cyan
  '#bcbd22', // olive
];

export const seriesId = (kind, name) => `${kind}:${name}`;

// Numeric-aware, case-insensitive sort so that SMA_10 < SMA_50 < SMA_200.
const numericAwareCompare = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Builds the ordered list of selectable series for a ChartDataDTO.
 * Price-axis overlays come first (sorted numeric-aware), then sub-pane indicators (sorted).
 * @param {Object|null|undefined} chartDataDTO - `{ prices, signals, indicators, priceIndicators, ... }`
 * @returns {Array<{id: string, name: string, kind: 'price'|'sub', color: string}>}
 */
export const buildSeriesList = (chartDataDTO) => {
  if (!chartDataDTO) return [];
  const priceNames = Object.keys(chartDataDTO.priceIndicators || {}).sort(numericAwareCompare);
  const subNames = Object.keys(chartDataDTO.indicators || {}).sort(numericAwareCompare);

  const list = [];
  priceNames.forEach(name => list.push({ kind: 'price', name }));
  subNames.forEach(name => list.push({ kind: 'sub', name }));

  return list.map((entry, index) => ({
    id: seriesId(entry.kind, entry.name),
    name: entry.name,
    kind: entry.kind,
    color: INDICATOR_PALETTE[index % INDICATOR_PALETTE.length],
  }));
};

/**
 * Map from raw backend date string -> value, for exact alignment against `prices[].date`
 * (both come from the same LocalDateTime serialisation, so the strings match on every timeframe).
 * @param {Array<{date: string, value: number}>|null|undefined} points
 * @returns {Map<string, number>}
 */
export const buildDateLookup = (points) => {
  const lookup = new Map();
  (points || []).forEach(point => {
    if (point && point.date !== undefined && point.date !== null) {
      lookup.set(point.date, point.value);
    }
  });
  return lookup;
};

/**
 * Returns the point list backing a series entry from the DTO's two maps.
 * @param {Object|null|undefined} chartDataDTO
 * @param {{name: string, kind: 'price'|'sub'}} series
 * @returns {Array<{date: string, value: number}>}
 */
export const pointsForSeries = (chartDataDTO, series) => {
  if (!chartDataDTO || !series) return [];
  const source = series.kind === 'price'
    ? (chartDataDTO.priceIndicators || {})
    : (chartDataDTO.indicators || {});
  return source[series.name] || [];
};

/**
 * Filters the series list down to what should be drawn.
 * @param {Array} seriesList - from buildSeriesList
 * @param {{showIndicators: boolean, selectedIds: Set<string>}} selection
 * @returns {Array} empty when the master toggle is off
 */
export const visibleSeriesOf = (seriesList, selection) => {
  if (!selection || !selection.showIndicators) return [];
  const selectedIds = selection.selectedIds || new Set();
  return (seriesList || []).filter(series => selectedIds.has(series.id));
};
