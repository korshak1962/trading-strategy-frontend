// src/components/strategyConstructor/ConstructedPreview.jsx
//
// Preview of a constructed strategy = the Backtest of this strategy alone on the preview window
// (screener architect_constructor_preview_backtest_v1.md §3.2, designer_constructor_preview_v1.md §1):
// ticker / run TF / dates / Long only → the backend runs the Backtest path once and returns, next to
// the per-rule statistics, `backtest` (the StrategyResultDTO of submitStrategies). It is drawn with
// the Backtest's own components, as is: ReporterStyleChart `panes="full"` (price with the executed
// trades, Individual Trade PnL, Cumulative PnL) and StrategyResults (Summary / Performance / Trades)
// plus a "Rules" tab (fired / not met / not evaluated per rule, the state-rule warnings, the Levels
// legend). The vote strip under the price pane shows what the strategy emits on each bar, or one
// rule's fired bars ("Show on the chart"); the selector never changes the trades or a PnL number.
// Not counted as an attempt (O3). Without `backtest` (an older backend) the signals-only view of
// before is drawn.
import { useMemo, useState } from 'react';
import ReporterStyleChart from '../ReporterStyleChart';
import StrategyResults from '../StrategyResults';
import TickerCombobox from '../TickerCombobox';
import { barGeometry, normalizeVotes } from '../signals/signalPanes';
import { adaptNextTriggers, chartTriggers } from '../nextTriggers/nextTriggersAdapter';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useElementSize } from '../../hooks/useElementSize';
import { parseExchangeTs } from '../../utils/dates';
import { ofBars, reasonsText, stateRuleWarning, deadEntryRuleWarning, SIGNAL_TYPE_CLASS } from './constructedFormat';
import { mergedPreviewWarnings, noTradesMessage, previewTradeCount, rulesWithWarnings } from './previewFormat';
import PositionDependentBadge from './PositionDependentBadge';
import '../../ChartFullscreen.css';

const label = 'block text-xs text-gray-600 mb-1';
// .chart-toolbar bottom margin (as App.jsx: the fullscreen chart height leaves room for it)
const CHART_TOOLBAR_MARGIN_PX = 16;

/** Consecutive bars with the same type → vote runs `{from, to, type}` (dates of `prices`). */
const runsOf = (prices, items) => {
  if (!prices.length || !items.length) return [];
  const index = new Map(prices.map((p, i) => [parseExchangeTs(p.date).getTime(), i]));
  const marks = items
    .map((it) => ({ i: index.get(parseExchangeTs(it.date).getTime()), type: it.type }))
    .filter((m) => m.i !== undefined)
    .sort((a, b) => a.i - b.i);
  const runs = [];
  marks.forEach((m) => {
    const last = runs[runs.length - 1];
    if (last && last.type === m.type && last.toIndex === m.i - 1) {
      last.toIndex = m.i;
      last.to = prices[m.i].date;
    } else {
      runs.push({ from: prices[m.i].date, to: prices[m.i].date, toIndex: m.i, type: m.type });
    }
  });
  return runs.map(({ from, to, type }) => ({ from, to, type }));
};

/** The per-rule table (the Rules tab; above the chart in the fallback view) and the Levels legend. */
function RulesTable({ preview, warningsOf, stateRuleFireRate }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow" data-testid="preview-rules-tab">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" data-testid="preview-rules">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left">Rule</th>
              <th className="px-2 py-1.5 text-left">Fired</th>
              <th className="px-2 py-1.5 text-left">Not met</th>
              <th className="px-2 py-1.5 text-left">Not evaluated</th>
            </tr>
          </thead>
          <tbody>
            {preview.rules.map((r) => (
              <tr key={r.ruleId ?? r.label} className="border-t align-top" data-testid="preview-rule-row">
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold">R{r.ruleId}</span>
                    <span className={`px-1.5 rounded border text-xs ${SIGNAL_TYPE_CLASS[r.signalType] || ''}`}>{r.signalType}</span>
                    {r.stateRule && (
                      <span className="px-1.5 rounded bg-amber-100 text-amber-800 text-xs"
                        title={`Fires on more than ${Math.round(stateRuleFireRate * 100)} % of the bars`}>state rule</span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-gray-600 mt-0.5 break-words">{r.label}</div>
                  {warningsOf(r).map((w, i) => (
                    <div key={i} className="mt-1 text-xs text-amber-800" data-testid="preview-rule-warning">{w}</div>
                  ))}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{ofBars(r.fired, preview.bars)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{ofBars(r.failed, preview.bars)}</td>
                <td className="px-2 py-1.5">
                  <div className="whitespace-nowrap">{ofBars(r.notEvaluated, preview.bars)}</div>
                  {r.notEvaluated > 0 && (
                    <div className="text-xs text-gray-500">{reasonsText(r.notEvaluatedByReason)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.levelsLegend.length > 0 && (
        <div className="mt-2 text-xs font-mono text-gray-600" data-testid="preview-levels-legend"
          title="The Levels params of the rules above (the labels carry @L1, @L2, … when there are several specs)">
          {preview.levelsLegend.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.form {ticker, timeFrame, startDay, endDay, longOnly}
 * @param {(patch: Object) => void} props.onFormChange
 * @param {() => void} props.onRun
 * @param {boolean} props.busy
 * @param {string|null} props.error
 * @param {Object|null} props.preview normalizePreview() result (+ `longOnlyRequested`)
 * @param {boolean} props.stale the draft or Long only changed after this preview
 * @param {string[]} props.tickers
 * @param {string[]} props.timeframes run TFs (meta)
 * @param {number} props.stateRuleFireRate
 * @param {string[]} [props.runTfs] the TFs this strategy can run on (stage 3a: RUN-only → any TF)
 * @param {string|null} [props.errorHint] a plain-language hint under the error (stage-3a 400s)
 * @param {string} [props.strategyName] the name in the Trades export
 */
export default function ConstructedPreview({
  form, onFormChange, onRun, busy, error, preview, stale, tickers, timeframes, stateRuleFireRate, runTfs = null, errorHint = null,
  strategyName = '',
}) {
  const [ruleFilter, setRuleFilter] = useState('all');

  const prices = useMemo(() => preview?.prices || [], [preview]);
  const geometry = useMemo(() => barGeometry(prices), [prices]);
  const selectedRule = ruleFilter === 'all' ? null : (preview?.rules || []).find((r) => String(r.ruleId) === ruleFilter) || null;
  const backtest = preview?.backtest || null;

  // Fullscreen: the chart and the tabs below it, as the Backtest (App.jsx)
  const [areaNode, setAreaNode] = useState(null);
  const [toolbarNode, setToolbarNode] = useState(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(areaNode);
  const areaSize = useElementSize(areaNode);
  const toolbarSize = useElementSize(toolbarNode);
  const fullscreenHeight = Math.max(400, Math.floor(areaSize.height - toolbarSize.height - CHART_TOOLBAR_MARGIN_PX));
  const fullscreenWidth = Math.max(600, areaSize.width - 20);

  // Fallback (no `backtest`): markers = the strategy's signals (one per bar) or the selected rule's
  // fired bars. LongBlock is never a marker (it is not an order): it shows on the strip only.
  const signalsChartData = useMemo(() => {
    if (!preview || backtest) return null;
    let signals = preview.signals;
    if (selectedRule) {
      const close = new Map(prices.map((p) => [parseExchangeTs(p.date).getTime(), p.close]));
      signals = selectedRule.firedDates
        .map((d) => ({ date: d, price: Number(close.get(parseExchangeTs(d).getTime())), type: selectedRule.signalType, comment: selectedRule.label }))
        .filter((s) => Number.isFinite(s.price));
    }
    return {
      prices,
      signals: signals.filter((s) => s.type !== 'LongBlock'),
      priceIndicators: {},
      indicators: {},
      channels: [],
      levelZones: [],
      includesShortSignals: true,
    };
  }, [preview, backtest, prices, selectedRule]);

  const votes = useMemo(() => {
    if (!preview) return null;
    const items = selectedRule
      ? selectedRule.firedDates.map((d) => ({ date: d, type: selectedRule.signalType }))
      : preview.signals;
    return normalizeVotes(runsOf(prices, items), geometry);
  }, [preview, prices, geometry, selectedRule]);

  const typeCounts = useMemo(() => {
    const c = {};
    (preview?.signals || []).forEach((s) => { c[s.type] = (c[s.type] || 0) + 1; });
    return c;
  }, [preview]);

  const tradeCount = useMemo(() => previewTradeCount(backtest), [backtest]);
  const triggers = useMemo(() => chartTriggers(adaptNextTriggers(backtest?.nextTriggers)), [backtest]);
  const warnings = useMemo(() => mergedPreviewWarnings(preview), [preview]);
  const warningsOf = (r) => (r.warnings.length > 0
    ? r.warnings
    : [stateRuleWarning(r, preview.bars, stateRuleFireRate), deadEntryRuleWarning(r, preview.bars)].filter(Boolean));
  const warnedRules = preview ? rulesWithWarnings(preview.rules, warningsOf) : 0;
  const longOnlyShown = backtest ? backtest.longOnly === true : preview?.longOnlyRequested === true;

  const extraTabs = preview ? [{
    id: 'rules',
    testId: 'preview-tab-rules',
    title: warnedRules > 0 ? `${warnedRules} rule${warnedRules === 1 ? '' : 's'} with warnings` : undefined,
    label: (
      <>
        Rules
        {warnedRules > 0 && (
          <span className="ml-1 px-1.5 rounded bg-amber-100 text-amber-800 text-xs" data-testid="preview-rules-warn-chip">⚠ {warnedRules}</span>
        )}
      </>
    ),
    render: () => <RulesTable preview={preview} warningsOf={warningsOf} stateRuleFireRate={stateRuleFireRate} />,
  }] : [];

  const ruleSelector = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="cp-rule" className="text-gray-600">Show on the chart:</label>
      <select id="cp-rule" className="p-1 border rounded text-sm bg-white" value={ruleFilter}
        onChange={(e) => setRuleFilter(e.target.value)} data-testid="preview-rule-filter"
        title={backtest
          ? "The strip under the price chart. The trade markers, the PnL charts and the tabs always show the strategy's trades."
          : 'Markers on the price chart and the strip under it.'}>
        <option value="all">the strategy&apos;s signals (one per bar)</option>
        {preview?.rules.map((r) => (
          <option key={r.ruleId} value={String(r.ruleId)}>R{r.ruleId} {r.signalType}: every bar it fired</option>
        ))}
      </select>
      <span className="text-xs text-gray-500">
        Strip under the price chart: what the strategy emits on each bar (LongBlock shows only there).
      </span>
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-lg shadow" data-testid="constructed-preview">
      <h3 className="text-lg font-semibold mb-1">
        Preview <span className="text-sm font-normal text-gray-500">(this strategy alone, run like a Backtest; not counted as an attempt)</span>
      </h3>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="w-36">
          <label className={label} htmlFor="cp-ticker">Ticker</label>
          <TickerCombobox id="cp-ticker" value={form.ticker} tickers={tickers}
            onChange={(v) => onFormChange({ ticker: v })} />
        </div>
        <div>
          <label className={label} htmlFor="cp-tf">Run TF</label>
          <select id="cp-tf" className="p-2 border rounded text-sm bg-white" value={form.timeFrame}
            onChange={(e) => onFormChange({ timeFrame: e.target.value })} data-testid="preview-tf">
            {timeframes.map((tf) => (
              <option key={tf} value={tf}>{tf}{runTfs && !runTfs.includes(tf) ? ' (not for these conditions)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="cp-from">From</label>
          <input id="cp-from" type="date" className="p-2 border rounded text-sm" value={form.startDay}
            onChange={(e) => onFormChange({ startDay: e.target.value })} data-testid="preview-from" />
        </div>
        <div>
          <label className={label} htmlFor="cp-to">To</label>
          <input id="cp-to" type="date" className="p-2 border rounded text-sm" value={form.endDay}
            onChange={(e) => onFormChange({ endDay: e.target.value })} data-testid="preview-to" />
        </div>
        <div className="max-w-56">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={!!form.longOnly}
              onChange={(e) => onFormChange({ longOnly: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-testid="preview-long-only" />
            Long only
          </label>
          <p className="mt-1 text-xs text-gray-500">Ignore short signals; only the long leg is evaluated.</p>
        </div>
        <button type="button" onClick={onRun} disabled={busy}
          className="py-2 px-4 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
          data-testid="constructed-preview-run">
          {busy ? 'Previewing…' : 'Preview'}
        </button>
      </div>

      {error && (
        <div className="form-error mb-3" role="alert" data-testid="preview-error">
          {error}
          {errorHint && <div className="mt-1 text-xs font-normal" data-testid="preview-error-hint">{errorHint}</div>}
        </div>
      )}
      {!preview && !error && !busy && (
        <p className="text-sm text-gray-500" data-testid="preview-empty">
          Run a preview to see the strategy&apos;s trades and PnL, as a Backtest of it alone would show them, and the signals of every rule.
        </p>
      )}
      {!preview && busy && (
        <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64" data-testid="preview-loading">
          <p className="text-gray-500">Running the preview…</p>
        </div>
      )}

      {preview && (
        <div className={busy ? 'opacity-60' : ''} aria-busy={busy || undefined}>
          {stale && (
            <div className="mb-3 p-2 rounded bg-gray-50 border text-sm text-gray-600" role="status" data-testid="preview-stale">
              The rules changed after this preview — run it again.
            </div>
          )}
          {busy ? (
            <p className="text-sm text-gray-700 mb-2" role="status" data-testid="preview-updating">Updating the preview…</p>
          ) : (
            <p className="text-sm text-gray-700 mb-2" data-testid="preview-summary">
              <b>{preview.ticker}</b> · {preview.timeFrame} · {preview.bars} bars ·{' '}
              {preview.signals.length} signal{preview.signals.length === 1 ? '' : 's'}
              {Object.keys(typeCounts).length > 0 && (
                <> ({Object.entries(typeCounts).map(([t, n]) => `${t} ${n}`).join(', ')})</>
              )}
              {tradeCount != null && <> · <span data-testid="preview-trade-count">{tradeCount} trade{tradeCount === 1 ? '' : 's'}</span></>}
              {' · '}thresholds in sweep: {preview.sweepThresholds}
              {longOnlyShown && ' · long only'}
              {preview.positionDependent && (
                <PositionDependentBadge testId="preview-pd-badge" long
                  title="Position-dependent: the preview runs the strategy alone (solo) on its own position; in a case the position is shared, so the counts of rules with position operands may differ." />
              )}
            </p>
          )}
          {preview.positionDependent && !preview.warnings.some((w) => /POSITION_SOLO/.test(w)) && (
            <p className="mb-2 text-xs text-purple-800" data-testid="preview-position-solo">
              Solo run: the position operands read this strategy&apos;s own position; in a case the position is shared, so the counts may differ.
            </p>
          )}
          {warnings.length > 0 && (
            <div className="mb-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="preview-warnings">
              {warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {prices.length === 0 ? (
            <p className="text-sm text-gray-500">No bars in the range.</p>
          ) : backtest ? (
            <>
              {tradeCount === 0 && (
                <div className="mb-3 p-2 rounded bg-gray-50 border text-sm text-gray-600" role="status" data-testid="preview-no-trades">
                  {noTradesMessage(preview.rules)}
                </div>
              )}
              {/* The Backtest's results area: toolbar, chart, tabs (fullscreened together) */}
              <div ref={setAreaNode} className={isFullscreen ? 'chart-fullscreen-active' : ''}>
                <div ref={setToolbarNode} className="chart-toolbar">
                  {ruleSelector}
                  <button type="button" className="fullscreen-toggle-btn" onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} data-testid="preview-fullscreen">
                    {isFullscreen ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}
                  </button>
                </div>
                <div className="mb-6">
                  <ReporterStyleChart
                    key={`${preview.ticker}-${preview.timeFrame}-${prices.length}`}
                    data={backtest.chartDataDTO}
                    width={isFullscreen ? fullscreenWidth : 1200}
                    height={isFullscreen ? fullscreenHeight : 600}
                    fitHeight={isFullscreen}
                    panes="full"
                    votes={votes}
                    longLegOnly={backtest.longOnly !== true && backtest.chartDataDTO?.includesShortSignals !== true}
                    windowStart={backtest.windowStart ?? null}
                    nextTriggers={triggers}
                  />
                </div>
                <StrategyResults
                  results={backtest}
                  mode="backtest"
                  constructed={null}
                  fileContext={{
                    ticker: preview.ticker,
                    timeFrame: preview.timeFrame,
                    selectedStrategies: { [strategyName || 'preview']: {} },
                    startDate: form.startDay,
                    endDate: form.endDay,
                  }}
                  extraTabs={extraTabs}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <RulesTable preview={preview} warningsOf={warningsOf} stateRuleFireRate={stateRuleFireRate} />
              </div>
              <div className="mb-2">{ruleSelector}</div>
              <ReporterStyleChart
                key={`${preview.ticker}-${preview.timeFrame}-${prices.length}`}
                data={signalsChartData}
                width={1200}
                height={420}
                panes="signals"
                votes={votes}
                priceTitle={selectedRule ? `R${selectedRule.ruleId} ${selectedRule.signalType}` : 'Signals of the strategy'}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
