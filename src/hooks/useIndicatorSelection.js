// src/hooks/useIndicatorSelection.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { buildSeriesList, visibleSeriesOf } from '../utils/indicatorSeries';

/**
 * Lifted indicator-selection state for the result chart (owned by App, rendered by IndicatorPicker).
 *
 * Owns the master "Show indicators" toggle plus a Set of selected series ids. Every time a new
 * chartDataDTO arrives (new backtest / optimize result) the selection resets to "all on";
 * entering/leaving fullscreen does not touch it and nothing is persisted.
 *
 * `visibleSeries` is memoised so charts wrapped in memo / effects keyed on it do not re-run on
 * unrelated App re-renders.
 *
 * @param {Object|null|undefined} chartDataDTO - `results.chartDataDTO`
 * @returns {{
 *   seriesList: Array,
 *   showIndicators: boolean,
 *   setShowIndicators: Function,
 *   selectedIds: Set<string>,
 *   toggleSeries: Function,
 *   visibleSeries: Array
 * }}
 */
export function useIndicatorSelection(chartDataDTO) {
  const seriesList = useMemo(() => buildSeriesList(chartDataDTO), [chartDataDTO]);

  // Lazily seeded from the first seriesList so the very first render already shows everything;
  // the effect below keeps it in sync for every subsequent result.
  const [showIndicators, setShowIndicators] = useState(() => seriesList.length > 0);
  const [selectedIds, setSelectedIds] = useState(() => new Set(seriesList.map(series => series.id)));

  // Reset to "all on" whenever the underlying result changes.
  useEffect(() => {
    setShowIndicators(seriesList.length > 0);
    setSelectedIds(new Set(seriesList.map(series => series.id)));
  }, [seriesList]);

  const toggleSeries = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const visibleSeries = useMemo(
    () => visibleSeriesOf(seriesList, { showIndicators, selectedIds }),
    [seriesList, showIndicators, selectedIds]
  );

  return { seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, visibleSeries };
}
