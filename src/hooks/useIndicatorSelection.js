// src/hooks/useIndicatorSelection.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { buildSeriesList, visibleSeriesOf, defaultSelectedIds } from '../utils/indicatorSeries';

/**
 * Lifted indicator-selection state for the result chart (owned by App, rendered by IndicatorPicker).
 *
 * Owns the master "Show indicators" toggle plus a Set of selected series ids. Every time a new
 * chartDataDTO arrives (new backtest / optimize result) the selection resets to the defaults:
 * every series on except those styled `defaultHidden` (utils/indicatorSeries.js SERIES_STYLE, e.g.
 * the LevelBreakoutRetest "Details" series). The user's toggles then hold until the next result;
 * entering/leaving fullscreen does not touch them and nothing is persisted.
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
 *   toggleGroup: Function,
 *   visibleSeries: Array
 * }}
 */
export function useIndicatorSelection(chartDataDTO) {
  const seriesList = useMemo(() => buildSeriesList(chartDataDTO), [chartDataDTO]);

  // Lazily seeded from the first seriesList so the very first render already shows the defaults;
  // the effect below keeps it in sync for every subsequent result.
  const [showIndicators, setShowIndicators] = useState(() => seriesList.length > 0);
  const [selectedIds, setSelectedIds] = useState(() => defaultSelectedIds(seriesList));

  // Reset to the defaults whenever the underlying result changes.
  useEffect(() => {
    setShowIndicators(seriesList.length > 0);
    setSelectedIds(defaultSelectedIds(seriesList));
  }, [seriesList]);

  const toggleSeries = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Group toggle ("Details"): turns every series of the group on, or all of them off.
  const toggleGroup = useCallback((group, on) => {
    const ids = seriesList.filter(series => series.group === group).map(series => series.id);
    if (ids.length === 0) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => { if (on) next.add(id); else next.delete(id); });
      return next;
    });
  }, [seriesList]);

  const visibleSeries = useMemo(
    () => visibleSeriesOf(seriesList, { showIndicators, selectedIds }),
    [seriesList, showIndicators, selectedIds]
  );

  return { seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup, visibleSeries };
}
