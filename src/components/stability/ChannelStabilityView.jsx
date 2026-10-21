// src/components/stability/ChannelStabilityView.jsx
//
// Body of the Channels tab: "Parameter stability by channel" (screener TASK_channel_param_stability.md
// §6, architect.md §6 items 2-6). Works for a live optimize-job result and for a stored case
// (`stored` set: the snapshot saved with the case is shown, the detector is never called).
//
// - caption + hindsight note; banners: stopped early, unverified causality, snapshot warnings
// - the chain table (ChannelChainTable), root first
// - level switcher (opens on level 0; "↑ wider" / "↓ deeper"; a row click also selects)
// - the chart of the selected level: one Backtest of the job's request with that level's Fit-best
//   params, run on the first visit of the level and cached per level (Q5); the Fit / Check bands and
//   the midpoint line are drawn on the price pane (no channel lines in v1)
// - "Apply params": the level's Fit-best params into the form (Backtest mode); on an INCONCLUSIVE
//   level it stays enabled with a "parameters not verified" warning

import { useEffect, useMemo, useRef, useState } from 'react';
import ReporterStyleChart from '../ReporterStyleChart';
import IndicatorPicker from '../IndicatorPicker';
import ChannelChainTable from './ChannelChainTable';
import { submitStrategies } from '../../api/strategyApi';
import { useElementSize } from '../../hooks/useElementSize';
import { useIndicatorSelection } from '../../hooks/useIndicatorSelection';
import {
  VERDICT_STYLE, fmtDelta, fmtDetectorParams, fmtDirection, fmtFitCheckTrades, fmtParams, fmtPctPlain,
  fmtPctSigned, fmtRatio, fmtSliceTrades, fmtTs, isNum, levelBacktestConfig, missingParams,
} from './stabilityFormat';

const CHART_HEIGHT = 520;

/** Metrics block of one slice (Fit / Check / whole node) for the selected-level panel. */
const SliceCard = ({ title, metrics, bh, tone }) => (
  <div className={`p-2 rounded border ${tone}`}>
    <div className="text-xs font-semibold text-gray-700">{title}</div>
    {metrics ? (
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums text-gray-700">
        <span>{fmtTs(metrics.from)} → {fmtTs(metrics.to)}</span>
        <span>{isNum(metrics.bars) ? `${metrics.bars} bars` : ''}</span>
        <span>PnL {fmtPctSigned(metrics.pnlPercent)}</span>
        <span>Annual {fmtPctSigned(metrics.annualPercent)}</span>
        <span>Max DD {fmtPctPlain(metrics.maxDdPercent)}</span>
        <span>Objective {isNum(metrics.objective) ? metrics.objective.toFixed(3) : 'n/a'}</span>
        <span>Trades {fmtSliceTrades(metrics)}</span>
        <span>Win rate {isNum(metrics.winRate) ? `${Math.round(metrics.winRate * 100)} %` : 'n/a'}</span>
        {bh && <span className="col-span-2 text-gray-500">Buy &amp; hold {fmtPctSigned(bh.pnlPercent)} · max DD {fmtPctPlain(bh.maxDdPercent)}</span>}
        {isNum(metrics.carriedIn) && metrics.carriedIn > 0 && (
          <span className="col-span-2 text-gray-500">
            Carried in: entry {fmtTs(metrics.carriedInEntryDate)} @ {isNum(metrics.carriedInEntryPrice) ? metrics.carriedInEntryPrice.toFixed(2) : 'n/a'}
            {' '}· period entry {isNum(metrics.periodEntryPrice) ? metrics.periodEntryPrice.toFixed(2) : 'n/a'}
          </span>
        )}
        {metrics.carriedOut && (
          <span className="col-span-2 text-gray-500">{metrics.openAtEnd ? 'Open at the last bar' : 'Carried out (valued at the last close of the slice)'}</span>
        )}
      </div>
    ) : (
      <div className="mt-1 text-xs text-gray-400">n/a</div>
    )}
  </div>
);

/**
 * @param {Object} props
 * @param {Object} props.stability ChannelStabilityDTO
 * @param {Object|null} props.baseConfig the job's request (StrategiesConfigDTO) for the per-level Backtest
 * @param {(params: Object) => void} props.onApplyParams receives NodeBestDTO.params of the level
 * @param {{name?: string, savedAt?: string}|null} [props.stored] stored-case mode
 * @param {(() => void)|null} [props.onRedetect] stored mode: "Re-detect on current data"
 * @param {boolean} [props.busy] a run is in progress: Apply / Re-detect disabled
 * @param {number|null} [props.totalCombinations] grid size, for the stopped-early banner
 */
const ChannelStabilityView = ({
  stability, baseConfig, onApplyParams, stored = null, onRedetect = null, busy = false, totalCombinations = null,
}) => {
  const nodes = useMemo(
    () => (Array.isArray(stability?.nodes) ? [...stability.nodes].sort((a, b) => a.level - b.level) : []),
    [stability]
  );
  const snapshot = stability?.snapshot || {};
  const [selected, setSelected] = useState(0); // opens on the root (A9)
  const node = nodes[selected] || null;

  // Per-level Backtest cache: level → {status: 'loading'|'done'|'error', result?, error?}
  const [levelRuns, setLevelRuns] = useState({});
  const [retryTick, setRetryTick] = useState(0); // "Retry" after a failed level Backtest
  const requested = useRef(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const strategyMap = baseConfig?.strategyNameToParams || null;
  const nodeMissing = useMemo(
    () => (node ? missingParams(strategyMap, node.fitBest?.params) : []),
    [node, strategyMap]
  );

  useEffect(() => {
    if (!node || !baseConfig || nodeMissing.length > 0 || !node.fitBest?.params) return;
    const level = node.level;
    if (requested.current.has(level)) return;
    requested.current.add(level);
    setLevelRuns((prev) => ({ ...prev, [level]: { status: 'loading' } }));
    submitStrategies(levelBacktestConfig(baseConfig, node.fitBest.params))
      .then((result) => {
        if (mounted.current) setLevelRuns((prev) => ({ ...prev, [level]: { status: 'done', result } }));
      })
      .catch((err) => {
        requested.current.delete(level); // a later visit retries
        if (mounted.current) setLevelRuns((prev) => ({ ...prev, [level]: { status: 'error', error: err.message } }));
      });
  }, [node, baseConfig, nodeMissing, retryTick]);

  const run = node ? levelRuns[node.level] : null;
  const chartResult = run?.status === 'done' ? run.result : null;

  const {
    seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup, visibleSeries,
  } = useIndicatorSelection(chartResult?.chartDataDTO);
  const indicatorSelection = useMemo(() => ({
    seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup,
  }), [seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries, toggleGroup]);

  const [chartNode, setChartNode] = useState(null);
  const chartSize = useElementSize(chartNode);
  const chartWidth = Math.max(600, Math.floor(chartSize.width || 1200));

  const band = node ? { start: node.start, mid: node.mid, end: node.end } : null;

  if (nodes.length === 0) {
    return (
      <div className="bg-white p-4 rounded-lg shadow text-sm text-gray-600" data-testid="stability-view">
        The channel snapshot has no chain levels.
      </div>
    );
  }

  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.filter(Boolean) : [];
  const unverified = stability?.causality && stability.causality.verified === false;
  const unverifiedList = Array.isArray(stability?.causality?.unverifiedStrategies)
    ? stability.causality.unverifiedStrategies : [];
  const inconclusive = node?.verdict === 'INCONCLUSIVE';
  const canApply = !!node?.fitBest?.params && !busy;

  return (
    <div className="bg-white p-4 rounded-lg shadow" data-testid="stability-view">
      {/* Caption (TASK §6) */}
      <h3 className="text-lg font-medium text-gray-900" data-testid="stability-caption">
        Parameter stability by channel (snapshot {fmtTs(snapshot.detectedAt)})
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        {snapshot.channelTimeFrame || '?'} channels for a {snapshot.strategyTimeFrame || '?'} strategy
        {' '}· {fmtTs(snapshot.startDate)} → {fmtTs(snapshot.endDate)}
        {snapshot.tradeStart ? ` · trade start ${fmtTs(snapshot.tradeStart)}` : ''}
        {' '}· detector params: {fmtDetectorParams(snapshot.detectorParams)}
        {stability?.objective ? ` · objective ${stability.objective}` : ''}
        {isNum(stability?.combinationsTested) ? ` · ${stability.combinationsTested.toLocaleString('en-US')} combinations` : ''}
      </p>
      <p className="mt-1 text-xs text-gray-500" data-testid="stability-hindsight">
        Channel starts come from today&apos;s detection and may move as new bars arrive. Every channel ends at the
        end date; the params are fitted on the Fit half only and checked on the Check half, but the channel
        start itself is found with hindsight over the whole history — this is not a walk-forward test.
      </p>

      {stored && (
        <div className="mt-3 p-3 rounded bg-blue-50 border border-blue-300 text-blue-900 text-sm flex flex-wrap items-center justify-between gap-2" role="status" data-testid="stability-stored">
          <span>
            Stored snapshot of {fmtTs(snapshot.detectedAt)}{stored.name ? ` (case «${stored.name}»)` : ''} — the detector was not
            called. The chart re-runs a Backtest on today&apos;s data in the same range; the stored metrics stay the reference.
          </span>
          {onRedetect && (
            <button
              type="button"
              onClick={onRedetect}
              disabled={busy}
              className="py-1 px-3 text-sm border border-blue-600 text-blue-700 rounded bg-white hover:bg-blue-100 disabled:text-gray-400 disabled:border-gray-300"
              data-testid="stability-redetect"
            >
              Re-detect on current data
            </button>
          )}
        </div>
      )}

      {stability?.stoppedEarly && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium" role="status" data-testid="stability-stopped-early">
          Stopped early — the chain is computed from {isNum(stability.combinationsTested) ? stability.combinationsTested.toLocaleString('en-US') : '?'}
          {isNum(totalCombinations) ? ` of ${totalCombinations.toLocaleString('en-US')}` : ''} combinations tested.
        </div>
      )}
      {unverified && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="stability-unverified">
          <span className="font-medium">Unverified causality:</span>{' '}
          {unverifiedList.length > 0 ? unverifiedList.join(', ') : 'some strategies'} — not proven to ignore later
          bars, so a Fit slice may not equal a run truncated at its end.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="stability-warnings">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Chain table */}
      <div className="mt-4">
        <ChannelChainTable nodes={nodes} selectedIndex={selected} onSelect={setSelected} />
        {isNum(stability?.thresholds?.wfe) && (
          <p className="mt-1 text-xs text-gray-500">
            STABLE = WFE ≥ {stability.thresholds.wfe}, regret ≥ {stability.thresholds.regret} and Δ(Fit↔Check) ≤ {stability.thresholds.deltaSteps} steps for every param.
            INCONCLUSIVE = a half with &lt; 2 bars or a Fit-best without a closed trade in a half. Deep levels have few
            trades: read the Δ trend across levels rather than one row.
          </p>
        )}
      </div>

      {/* Level switcher + selected level */}
      {node && (
        <div className="mt-5" data-testid="stability-level">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected((i) => Math.max(0, i - 1))}
              disabled={selected === 0}
              className="py-1 px-3 text-sm border border-blue-600 text-blue-700 rounded hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
              title="The wider (longer) channel"
              data-testid="stability-level-up"
            >
              ↑ wider
            </button>
            <button
              type="button"
              onClick={() => setSelected((i) => Math.min(nodes.length - 1, i + 1))}
              disabled={selected >= nodes.length - 1}
              className="py-1 px-3 text-sm border border-blue-600 text-blue-700 rounded hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
              title="The deeper (shorter) channel"
              data-testid="stability-level-down"
            >
              ↓ deeper
            </button>
            <span className="text-sm font-semibold text-gray-800" data-testid="stability-level-label">
              Level {node.level} of {nodes.length - 1}
            </span>
            <span className={`px-1.5 py-0.5 rounded border text-xs font-semibold ${VERDICT_STYLE[node.verdict] || VERDICT_STYLE.INCONCLUSIVE}`}>
              {node.verdict || 'n/a'}
            </span>
            <span className="text-xs text-gray-500">trades (Fit / Check) {fmtFitCheckTrades(node)}</span>
          </div>

          <div className="mt-2 text-sm text-gray-700">
            {fmtTs(node.start)} → {fmtTs(node.end)} · {isNum(node.bars) ? node.bars : '?'} bars · {fmtDirection(node)}
            {' '}· Fit {isNum(node.fitBars) ? node.fitBars : '?'} bars, Check from {fmtTs(node.mid)} ({isNum(node.checkBars) ? node.checkBars : '?'} bars)
            {snapshot.channelTimeFrame && snapshot.channelTimeFrame !== snapshot.strategyTimeFrame && (
              <> · {snapshot.channelTimeFrame} channel from {fmtTs(node.channelStart)} ({isNum(node.channelBars) ? node.channelBars : '?'} bars)</>
            )}
            {node.clippedByTradeStart && <span className="text-amber-700"> · clipped by the trade start</span>}
            {node.sameStartAsPrevious && <span className="text-gray-500"> · same start as the previous level</span>}
          </div>
          <div className="mt-1 text-sm text-gray-700">
            WFE {fmtRatio(node.wfe)} · regret {fmtRatio(node.regret)} · Δ(Fit↔Check) {fmtDelta(node.deltaFitCheck)}
            {node.level > 0 && <> · Δ prev level: node {fmtDelta(node.deltaPrevLevelNode)}, fit {fmtDelta(node.deltaPrevLevelFit)}</>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm">
              <span className="text-gray-500">Fit-best:</span>{' '}
              <span className="font-semibold text-blue-700">{fmtParams(node.fitBest?.params)}</span>
              <span className="text-gray-500"> · Check-best: </span>{fmtParams(node.checkBest?.params)}
              <span className="text-gray-500"> · Node-best: </span>{fmtParams(node.nodeBest?.params)}
            </span>
            <button
              type="button"
              onClick={() => onApplyParams(node.fitBest.params)}
              disabled={!canApply}
              className="py-1 px-3 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              title="Put this level's Fit-best params into the form (Backtest mode)"
              data-testid="stability-apply"
            >
              Apply params
            </button>
            {inconclusive && (
              <span className="text-xs text-amber-700 font-medium" data-testid="stability-apply-warning">
                ⚠ parameters not verified (INCONCLUSIVE level)
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <SliceCard title="Fit half (Fit-best)" metrics={node.fitBest?.fit} bh={node.buyAndHold?.fit} tone="border-blue-200 bg-blue-50/40" />
            <SliceCard title="Check half (Fit-best)" metrics={node.fitBest?.check} bh={node.buyAndHold?.check} tone="border-amber-200 bg-amber-50/40" />
            <SliceCard title="Whole channel (Fit-best)" metrics={node.fitBest?.node} bh={node.buyAndHold?.node} tone="border-gray-200" />
          </div>

          {/* Chart of the level: Backtest with its Fit-best params */}
          <div className="mt-4" ref={setChartNode}>
            <p className="mb-2 text-xs text-gray-500">
              Trades on the chart: one Backtest over the job&apos;s range with this level&apos;s Fit-best params
              (run on the first visit of a level, then cached). Shaded: Fit half (blue), Check half (amber), dashed line = midpoint.
            </p>
            {!baseConfig ? (
              <div className="p-3 rounded bg-gray-50 border text-sm text-gray-600">
                The request of this result is not available, so the level&apos;s Backtest cannot be run.
              </div>
            ) : nodeMissing.length > 0 ? (
              <div className="p-3 rounded bg-amber-50 border border-amber-300 text-sm text-amber-800" role="status">
                The form does not hold these params ({nodeMissing.join(', ')}); the level&apos;s Backtest cannot be run.
              </div>
            ) : !run || run.status === 'loading' ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-500" data-testid="stability-chart-loading">
                Running the Backtest of level {node.level}…
              </div>
            ) : run.status === 'error' ? (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
                Backtest of level {node.level} failed: {run.error}{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setRetryTick((t) => t + 1)}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div data-testid="stability-chart">
                <div className="chart-toolbar">
                  <IndicatorPicker
                    seriesList={seriesList}
                    showIndicators={showIndicators}
                    onToggleShow={setShowIndicators}
                    selectedIds={selectedIds}
                    onToggleSeries={toggleSeries}
                    onToggleGroup={toggleGroup}
                  />
                </div>
                <ReporterStyleChart
                  data={chartResult.chartDataDTO}
                  width={chartWidth}
                  height={CHART_HEIGHT}
                  visibleSeries={visibleSeries}
                  indicatorSelection={indicatorSelection}
                  longLegOnly={chartResult.longOnly !== true && chartResult.chartDataDTO?.includesShortSignals !== true}
                  windowStart={chartResult.windowStart ?? null}
                  priceTitle={`Level ${node.level} · ${fmtParams(node.fitBest?.params)}`}
                  stabilityBand={band}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelStabilityView;
