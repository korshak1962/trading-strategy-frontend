// src/components/signals/SignalPane.jsx
import { useMemo } from 'react';
import ReporterStyleChart from '../ReporterStyleChart';
import IndicatorPicker from '../IndicatorPicker';
import { RANGE_SLIDER_HEIGHT, RANGE_SLIDER_DATES_HEIGHT } from '../charts/RangeSlider';
import { useIndicatorSelection } from '../../hooks/useIndicatorSelection';
import {
  toPaneData, mergedPaneData, normalizeVotes, executionSummary, formatParams
} from './signalPanes';

/**
 * One price pane of the Signals mode (screener TASK_position_dependable_and_signals_tab.md §2.5):
 * a strategy's own signals and overlays (indicators, level zones, level chart - nothing from the
 * other strategies), or the merged result (`merged`). The zoom window is controlled by
 * SignalChartsView, so every pane shows the same dates; the vertical zoom stays per pane.
 *
 * @param {Object} props.charts - adaptSignalCharts() result (shared prices, longOnly)
 * @param {Object} [props.pane] - one of charts.strategies (omitted for the merged pane)
 * @param {boolean} [props.merged=false]
 * @param {Object} props.geometry - barGeometry(charts.prices)
 * @param {Array} props.positionSpans - merged position, normalized (shaded on every pane)
 * @param {[Date, Date]} props.dateRange - the shared zoom window
 * @param {(range: [Date, Date]) => void} props.onDateRangeChange - stable setter
 * @param {boolean} props.showRangeSlider - only the last pane carries the slider
 * @param {number} props.height - pane block height (price pane + indicator pane + slider)
 */
// What ReporterStyleChart takes off `height` for its range slider (RANGE_SLIDER_BLOCK_PX there):
// added back on the slider pane, so its price pane is as tall as the others.
const SLIDER_BLOCK_PX = RANGE_SLIDER_HEIGHT + 2 + RANGE_SLIDER_DATES_HEIGHT + 16;

const SignalPane = ({
  charts, pane = null, merged = false, geometry, positionSpans, dateRange, onDateRangeChange,
  showRangeSlider, height
}) => {
  const paneData = useMemo(
    () => (merged ? mergedPaneData(charts) : toPaneData(charts, pane)),
    [charts, pane, merged]
  );
  const votes = useMemo(
    () => (merged || !pane ? null : normalizeVotes(pane.votes, geometry)),
    [merged, pane, geometry]
  );

  // Own indicator selection per pane (its series only), reset to the defaults per result.
  const {
    seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup, visibleSeries,
  } = useIndicatorSelection(paneData);
  const indicatorSelection = useMemo(() => ({
    seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup,
  }), [seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup]);
  // Sub-pane series cannot be toggled from the price legend (it lists the price series only), so a
  // pane that has some gets the full picker above it.
  const hasSubSeries = seriesList.some(series => series.kind === 'sub');

  const signals = paneData.signals;
  const summary = useMemo(() => executionSummary(signals), [signals]);
  const params = merged ? '' : formatParams(pane.params);
  const noSignals = !merged && (pane.hasSignals === false || signals.length === 0);

  const title = (
    <div className="signal-pane__title" data-testid="signal-pane-title">
      <h3 className="chart-title signal-pane__name">
        {merged ? 'Merged result' : pane.key}
        {!merged && pane.strategyClass && pane.strategyClass !== pane.key && (
          <span className="signal-pane__class"> ({pane.strategyClass})</span>
        )}
      </h3>
      {params && <span className="signal-pane__params" title={params}>{params}</span>}
      {!merged && pane.positionDependent && (
        <span
          className="signal-badge signal-badge--pd"
          title="Position-dependent: the strategy runs bar by bar on the merged position"
        >
          position-dependent
        </span>
      )}
      {noSignals && <span className="signal-badge signal-badge--muted">no signals</span>}
      {!merged && !noSignals && (
        <span className="signal-badge" title="Signals that became a trade in the merged result">
          {summary.executed} of {summary.total} executed
        </span>
      )}
      {merged && signals.length === 0 && <span className="signal-badge signal-badge--muted">no merged trades</span>}
      {merged && signals.length > 0 && (
        <span className="signal-badge">{signals.length} signal{signals.length === 1 ? '' : 's'}</span>
      )}
    </div>
  );

  return (
    <section
      className={`signal-pane${merged ? ' signal-pane--merged' : ''}`}
      data-testid={merged ? 'signal-pane-merged' : 'signal-pane'}
      data-pane-key={merged ? 'merged' : pane.key}
    >
      {hasSubSeries && (
        <IndicatorPicker
          seriesList={seriesList}
          showIndicators={showIndicators}
          onToggleShow={setShowIndicators}
          selectedIds={selectedIds}
          onToggleSeries={toggleSeries}
          onToggleGroup={toggleGroup}
          testId={merged ? 'indicator-picker-merged' : `indicator-picker-${pane.key}`}
        />
      )}
      <ReporterStyleChart
        data={paneData}
        width={1200}
        height={height + (showRangeSlider ? SLIDER_BLOCK_PX : 0)}
        visibleSeries={visibleSeries}
        indicatorSelection={indicatorSelection}
        panes="signals"
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        showRangeSlider={showRangeSlider}
        votes={votes}
        positionSpans={positionSpans}
        longOnly={charts.longOnly}
        priceTitle={title}
        showInstructions={false}
      />
    </section>
  );
};

export default SignalPane;
