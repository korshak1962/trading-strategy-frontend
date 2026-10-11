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

// Fixed palette, assigned by position in the series list (series without a SERIES_STYLE entry).
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

/** Group of the series that are hidden by default and toggled together ("Details"). */
export const DETAILS_GROUP = 'details';
export const SERIES_GROUP_LABELS = Object.freeze({ [DETAILS_GROUP]: 'Details' });

// Per-name display style (screener TASK_level_chart_ux.md §4.0). Backend keys stay unchanged; this
// only sets the legend label, the colour, step rendering, default visibility and the group.
// Names not listed here keep today's look: their own name as label, the positional palette
// colour, a straight polyline, visible by default, no group.
//   - effectiveExit: the one sell line of LevelBreakoutRetest, red, stepped (it moves in steps).
//   - resistanceTrigger: the breakout line, in the orange it always had (palette slot 1).
//   - stopLevel / supportExitLine: the two inputs of effectiveExit, hidden under "Details".
// `redundantWith: <name>`: the series is dropped from the list (picker, legend, drawing) for a
// result in which it equals that series on every bar where both have a value - it would only be
// drawn exactly on top of it. With SupportTracking = 1 the Support line usually IS the Exit line
// (Exit line = max(Initial stop, Support line) and the stop is rarely above it); it stays offered
// whenever it differs somewhere, or when the two never overlap (e.g. SupportTracking = 0).
export const SERIES_STYLE = Object.freeze({
  effectiveExit: { label: 'Exit line', color: '#d62728', stepped: true },
  resistanceTrigger: { label: 'Breakout line', color: '#ff7f0e' },
  stopLevel: {
    label: 'Initial stop', color: '#6b7280', stepped: true, defaultHidden: true, group: DETAILS_GROUP,
    redundantWith: 'effectiveExit',
  },
  supportExitLine: {
    label: 'Support line', color: '#2ca02c', stepped: true, defaultHidden: true, group: DETAILS_GROUP,
    redundantWith: 'effectiveExit',
  },
});

const isValue = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * True when `points` equals `refPoints` on every date where both have a value, with at least one
 * such date. Values are compared with a tiny relative tolerance (JSON doubles).
 * @param {Array<{date, value}>} points
 * @param {Array<{date, value}>} refPoints
 */
export const isSeriesRedundant = (points, refPoints) => {
  if (!Array.isArray(points) || !Array.isArray(refPoints) || refPoints.length === 0) return false;
  const refByDate = new Map();
  refPoints.forEach(point => { if (point && isValue(point.value)) refByDate.set(point.date, Number(point.value)); });
  let common = 0;
  for (const point of points) {
    if (!point || !isValue(point.value) || !refByDate.has(point.date)) continue;
    const a = Number(point.value);
    const b = refByDate.get(point.date);
    if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
    common += 1;
  }
  return common > 0;
};

// Numeric-aware, case-insensitive sort so that SMA_10 < SMA_50 < SMA_200.
const numericAwareCompare = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Builds the ordered list of selectable series for a ChartDataDTO.
 * Price-axis overlays come first (sorted numeric-aware), then sub-pane indicators (sorted).
 * @param {Object|null|undefined} chartDataDTO - `{ prices, signals, indicators, priceIndicators, ... }`
 * Styles come from SERIES_STYLE by name; any other series gets the palette colour of its position in
 * the FULL list (known names included), exactly as before, so other strategies look unchanged.
 * A series styled `redundantWith` is left out when isSeriesRedundant against that series (same kind).
 * @returns {Array<{id: string, name: string, kind: 'price'|'sub', color: string, label: string,
 *   stepped: boolean, defaultHidden: boolean, group: string|null}>}
 */
export const buildSeriesList = (chartDataDTO) => {
  if (!chartDataDTO) return [];
  const priceNames = Object.keys(chartDataDTO.priceIndicators || {}).sort(numericAwareCompare);
  const subNames = Object.keys(chartDataDTO.indicators || {}).sort(numericAwareCompare);

  const list = [];
  priceNames.forEach(name => list.push({ kind: 'price', name }));
  subNames.forEach(name => list.push({ kind: 'sub', name }));

  const sourceOf = (kind) => (kind === 'price' ? chartDataDTO.priceIndicators : chartDataDTO.indicators) || {};
  const redundant = (entry) => {
    const ref = SERIES_STYLE[entry.name]?.redundantWith;
    if (!ref) return false;
    const source = sourceOf(entry.kind);
    return Array.isArray(source[ref]) && isSeriesRedundant(source[entry.name], source[ref]);
  };

  return list.map((entry, index) => {
    if (redundant(entry)) return null; // after the palette index is taken, so colours do not shift
    const style = SERIES_STYLE[entry.name] || {};
    return {
      id: seriesId(entry.kind, entry.name),
      name: entry.name,
      kind: entry.kind,
      color: style.color || INDICATOR_PALETTE[index % INDICATOR_PALETTE.length],
      label: style.label || entry.name,
      stepped: style.stepped === true,
      defaultHidden: style.defaultHidden === true,
      group: style.group || null,
    };
  }).filter(Boolean);
};

/** Display name of a series entry (legend, chips, tooltip). */
export const seriesLabel = (series) => series?.label || series?.name || '';

/** Ids selected for a fresh result: every series except the default-hidden ones. */
export const defaultSelectedIds = (seriesList) =>
  new Set((seriesList || []).filter(series => !series.defaultHidden).map(series => series.id));

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
