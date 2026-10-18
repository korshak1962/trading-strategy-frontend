// src/components/signals/SignalChartsView.jsx
import { useMemo, useState } from 'react';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useElementSize } from '../../hooks/useElementSize';
import { parseExchangeTs, fmtBarTimestamp } from '../../utils/dates';
import { initialWindowRange, preWindowSpan } from '../../utils/ChartDataUtils';
import SignalPane from './SignalPane';
import {
  barGeometry, normalizePositionSpans, LARGE_RANGE_BARS, VOTE_COLORS, voteText
} from './signalPanes';
import '../../ChartFullscreen.css';
import './SignalChartsView.css';

// Pane block height outside fullscreen (price pane + its sub-pane, if any); the slider pane adds the slider.
const PANE_HEIGHT_PX = 380;
const MIN_FULLSCREEN_PANE_PX = 320;
// Fullscreen: toolbar + legend + per-pane chrome taken off the screen before splitting it.
const FULLSCREEN_CHROME_PX = 160;
// Fullscreen: this many panes share the first screen; the rest scroll.
const PANES_PER_SCREEN = 2;

// Legend glyph mirroring drawSignals / drawHollowSignal (ChartDrawingUtils): filled = executed long,
// hollow = white body (not-executed long), outline = executed short, dashed = not-executed short.
const Triangle = ({ color, hollow = false, outline = false, dashed = false, down = false }) => (
  <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="signals-legend__glyph">
    <polygon
      points={down ? '1.5,1.5 12.5,1.5 7,10.5' : '7,1.5 12.5,10.5 1.5,10.5'}
      fill={outline || dashed ? 'none' : hollow ? '#fff' : color}
      stroke={color}
      strokeWidth={outline ? 2 : 1.5}
      strokeDasharray={dashed ? '3,2' : undefined}
    />
  </svg>
);

/**
 * Signals mode result (screener TASK_position_dependable_and_signals_tab.md §2.5): a toolbar
 * (summary, fullscreen), the legend, one SignalPane per strategy and the merged pane at the bottom
 * (when the backend sends one - not for a single strategy). One zoom window is shared by all panes;
 * the range slider sits under the last pane. App remounts this view (key) per response, which
 * resets the window to the full range - or, with a warm-up before tradeStart, to the trading window
 * plus some context (initialWindowRange); the warm-up is shaded on every pane.
 * @param {Object} props.charts - adaptSignalCharts() result
 */
const SignalChartsView = ({ charts }) => {
  const geometry = useMemo(() => barGeometry(charts.prices), [charts]);
  const positionSpans = useMemo(
    () => normalizePositionSpans(charts.positionSpans, geometry),
    [charts, geometry]
  );
  const [dateRange, setDateRange] = useState(() => {
    const prices = charts.prices;
    if (!prices.length) return null;
    return initialWindowRange(prices, charts.windowStart)
      || [parseExchangeTs(prices[0].date), parseExchangeTs(prices[prices.length - 1].date)];
  });
  // A warm-up before the trading window exists (tradeStart after the first bar)
  const hasWarmup = useMemo(() => preWindowSpan(charts.prices, charts.windowStart) !== null, [charts]);
  const warnings = charts.warnings || [];

  const [areaNode, setAreaNode] = useState(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(areaNode);
  const areaSize = useElementSize(areaNode);

  const strategies = charts.strategies;
  const merged = charts.merged;
  const paneCount = strategies.length + (merged ? 1 : 0);
  const paneHeight = isFullscreen
    ? Math.max(
      MIN_FULLSCREEN_PANE_PX,
      Math.floor((areaSize.height - FULLSCREEN_CHROME_PX) / Math.max(1, Math.min(paneCount, PANES_PER_SCREEN)))
    )
    : PANE_HEIGHT_PX;

  const hasVotes = strategies.some(s => Array.isArray(s.votes));
  const voteTypes = charts.longOnly
    ? ['LongOpen', 'LongClose', 'ShortOpen']
    : ['LongOpen', 'LongClose', 'ShortOpen', 'ShortClose'];
  const largeRange = charts.prices.length > LARGE_RANGE_BARS;

  return (
    <div
      ref={setAreaNode}
      className={`signals-view${isFullscreen ? ' chart-fullscreen-active' : ''}`}
      data-testid="signals-view"
    >
      <div className="chart-toolbar">
        <div className="signals-view__summary">
          <span className="font-semibold">{paneCount} pane{paneCount === 1 ? '' : 's'}</span>
          {' · '}{charts.prices.length.toLocaleString('en-US')} bars
          {charts.longOnly && <>{' · '}long only</>}
          {' · '}{positionSpans.length} merged position{positionSpans.length === 1 ? '' : 's'}
          {charts.tradeStart && charts.windowStart && (
            <span data-testid="signals-trading-window">
              {' · '}Trading window: {fmtBarTimestamp(charts.windowStart)}
              {charts.prices.length > 0 && <> → {fmtBarTimestamp(charts.prices[charts.prices.length - 1].date)}</>}
              {charts.prices.length > 0 && <> · warm-up from {fmtBarTimestamp(charts.prices[0].date)}</>}
            </span>
          )}
        </div>
        <button
          type="button"
          className="fullscreen-toggle-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}
        </button>
      </div>

      {warnings.length > 0 && (
        <div
          className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm"
          role="status"
          data-testid="signals-warnings"
        >
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {largeRange && (
        <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status">
          {charts.prices.length.toLocaleString('en-US')} bars × {paneCount} panes: zooming and panning may be slow.
          A shorter date range keeps the view responsive.
        </div>
      )}

      <div className="signals-legend" data-testid="signals-legend">
        <span
          className="signals-legend__item"
          title={charts.longOnly
            ? "The strategy's signal became a trade in the merged result"
            : "The strategy's signal became a trade in the merged result. Longs are filled (green open / red close); "
              + 'shorts are drawn as outlines (blue ▼ open / orange ▲ close)'}
        >
          <Triangle color="green" /><Triangle color="red" down />
          {!charts.longOnly && <><Triangle color="blue" outline down /><Triangle color="orange" outline /></>}
          {' '}executed
        </span>
        <span
          className="signals-legend__item"
          title={charts.longOnly
            ? 'The strategy emitted the signal, but the merge did not trade it (vetoed / no transition)'
            : 'The strategy emitted the signal, but the merge did not trade it (vetoed / no transition). '
              + 'Longs get a white body; shorts get a dashed outline'}
        >
          <Triangle color="green" hollow /><Triangle color="red" hollow down />
          {!charts.longOnly && <><Triangle color="blue" dashed down /><Triangle color="orange" dashed /></>}
          {' '}not executed
        </span>
        {hasWarmup && (
          <span
            className="signals-legend__item"
            title="Proposed on a warm-up bar before trade start: no position may open there, so it was not executed"
            data-testid="signals-legend-warmup"
          >
            <span className="signals-legend__swatch signals-legend__swatch--warmup" />
            <span className="signals-legend__muted"><Triangle color="green" hollow /><Triangle color="red" hollow down /></span>
            {' '}muted = before trade start (warm-up)
          </span>
        )}
        <span className="signals-legend__item">
          <span className="signals-legend__swatch signals-legend__swatch--long" /> merged long position
        </span>
        {!charts.longOnly && (
          <span className="signals-legend__item">
            <span className="signals-legend__swatch signals-legend__swatch--short" /> merged short position
          </span>
        )}
        {hasVotes && (
          <span className="signals-legend__item signals-legend__votes" title="Strip under a pane: what the strategy votes on each bar">
            vote strip:
            {voteTypes.map(type => (
              <span key={type} className="signals-legend__vote">
                <span className="vote-swatch" style={{ backgroundColor: VOTE_COLORS[type] }} />
                {voteText(type, charts.longOnly)}
              </span>
            ))}
          </span>
        )}
      </div>

      <p className="zoom-instructions signals-view__help">
        All panes share one time window: drag on any pane to zoom, use the wheel to zoom in / out, or the
        slider under the last pane. The price axis zooms per pane (drag the price labels, Shift/Ctrl + wheel).
      </p>

      {paneCount === 0 && (
        <div className="p-6 text-gray-500">No strategy panes in the response.</div>
      )}

      {strategies.map((strategy, index) => (
        <SignalPane
          key={strategy.key}
          charts={charts}
          pane={strategy}
          geometry={geometry}
          positionSpans={positionSpans}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          showRangeSlider={!merged && index === strategies.length - 1}
          height={paneHeight}
          windowStart={charts.windowStart}
        />
      ))}
      {merged && (
        <SignalPane
          key="__merged__"
          charts={charts}
          merged
          geometry={geometry}
          positionSpans={positionSpans}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          showRangeSlider
          height={paneHeight}
          windowStart={charts.windowStart}
        />
      )}
    </div>
  );
};

export default SignalChartsView;
