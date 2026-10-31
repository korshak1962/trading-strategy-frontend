// src/components/strategyConstructor/ConstructedPreview.jsx
//
// Preview of a constructed strategy WITHOUT merge (screener architect.md §4.8, BA spec §4.2 p. 5):
// ticker / run TF (DAY | WEEK) / dates → the strategy's own signals on the canvas price chart
// (the backtester's ReporterStyleChart) with a vote strip of what it emits on each bar, and a table
// per rule: "fired N of M bars (x %), not evaluated K of M (reasons)", the state-rule warnings
// (fire rate > 20 %, Q11) and the thresholds in the sweep. Not counted as an attempt (O3).
import { useMemo, useState } from 'react';
import ReporterStyleChart from '../ReporterStyleChart';
import TickerCombobox from '../TickerCombobox';
import { barGeometry, normalizeVotes } from '../signals/signalPanes';
import { parseExchangeTs } from '../../utils/dates';
import { ofBars, reasonsText, stateRuleWarning, SIGNAL_TYPE_CLASS } from './constructedFormat';

const label = 'block text-xs text-gray-600 mb-1';

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

/**
 * @param {Object} props
 * @param {Object} props.form {ticker, timeFrame, startDay, endDay}
 * @param {(patch: Object) => void} props.onFormChange
 * @param {() => void} props.onRun
 * @param {boolean} props.busy
 * @param {string|null} props.error
 * @param {Object|null} props.preview normalizePreview() result
 * @param {boolean} props.stale the draft changed after this preview
 * @param {string[]} props.tickers
 * @param {string[]} props.timeframes run TFs (meta)
 * @param {number} props.stateRuleFireRate
 */
export default function ConstructedPreview({
  form, onFormChange, onRun, busy, error, preview, stale, tickers, timeframes, stateRuleFireRate,
}) {
  const [ruleFilter, setRuleFilter] = useState('all');

  const prices = useMemo(() => preview?.prices || [], [preview]);
  const geometry = useMemo(() => barGeometry(prices), [prices]);
  const selectedRule = ruleFilter === 'all' ? null : (preview?.rules || []).find((r) => String(r.ruleId) === ruleFilter) || null;

  // Markers: the strategy's signals (one per bar), or the selected rule's fired bars. LongBlock is
  // never a marker (it is not an order): it shows on the strip only.
  const chartData = useMemo(() => {
    if (!preview) return null;
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
      levelChart: null,
      includesShortSignals: true,
    };
  }, [preview, prices, selectedRule]);

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

  return (
    <div className="bg-white p-6 rounded-lg shadow" data-testid="constructed-preview">
      <h3 className="text-lg font-semibold mb-1">Preview <span className="text-sm font-normal text-gray-500">(this strategy alone, no merge; not counted as a backtest)</span></h3>
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
            {timeframes.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
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
        <button type="button" onClick={onRun} disabled={busy}
          className="py-2 px-4 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
          data-testid="constructed-preview-run">
          {busy ? 'Previewing…' : 'Preview'}
        </button>
      </div>

      {error && <div className="form-error mb-3" role="alert" data-testid="preview-error">{error}</div>}
      {!preview && !error && !busy && <p className="text-sm text-gray-500">Run a preview to see the signals of every rule.</p>}

      {preview && (
        <>
          {stale && (
            <div className="mb-3 p-2 rounded bg-gray-50 border text-sm text-gray-600" role="status">
              The rules changed after this preview — run it again.
            </div>
          )}
          <p className="text-sm text-gray-700 mb-2" data-testid="preview-summary">
            <b>{preview.ticker}</b> · {preview.timeFrame} · {preview.bars} bars ·{' '}
            {preview.signals.length} signal{preview.signals.length === 1 ? '' : 's'}
            {Object.keys(typeCounts).length > 0 && (
              <> ({Object.entries(typeCounts).map(([t, n]) => `${t} ${n}`).join(', ')})</>
            )}
            {' · '}thresholds in sweep: {preview.sweepThresholds}
          </p>
          {preview.warnings.length > 0 && (
            <div className="mb-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="preview-warnings">
              {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          <div className="overflow-x-auto mb-4">
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
                {preview.rules.map((r) => {
                  const warnings = r.warnings.length > 0
                    ? r.warnings
                    : [stateRuleWarning(r, preview.bars, stateRuleFireRate)].filter(Boolean);
                  return (
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
                        <div className="text-xs font-mono text-gray-600 mt-0.5">{r.label}</div>
                        {warnings.map((w, i) => (
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {prices.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                <label htmlFor="cp-rule" className="text-gray-600">Show on the chart:</label>
                <select id="cp-rule" className="p-1 border rounded text-sm bg-white" value={ruleFilter}
                  onChange={(e) => setRuleFilter(e.target.value)} data-testid="preview-rule-filter">
                  <option value="all">the strategy's signals (one per bar)</option>
                  {preview.rules.map((r) => (
                    <option key={r.ruleId} value={String(r.ruleId)}>R{r.ruleId} {r.signalType}: every bar it fired</option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">Strip under the chart: what is emitted on each bar (LongBlock shows only there).</span>
              </div>
              <ReporterStyleChart
                key={`${preview.ticker}-${preview.timeFrame}-${prices.length}`}
                data={chartData}
                width={1200}
                height={420}
                panes="signals"
                votes={votes}
                priceTitle={selectedRule ? `R${selectedRule.ruleId} ${selectedRule.signalType}` : 'Signals of the strategy'}
              />
            </>
          ) : (
            <p className="text-sm text-gray-500">No bars in the range.</p>
          )}
        </>
      )}
    </div>
  );
}
