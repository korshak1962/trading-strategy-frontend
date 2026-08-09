import { useState, useEffect } from 'react';
import { detectChannels, fetchPrices } from '../../api/channelApi';
import { getAvailableTickers } from '../../api/strategyApi';
import ChannelExplorerChart, { TF_LINE_WIDTH } from './ChannelExplorerChart';
import RecursiveParamsPanel, { RECURSIVE_DEFAULT_PARAMS } from './RecursiveParamsPanel';
import './ChannelExplorer.css';

const TIMEFRAMES = [
  { value: 'MIN5',  label: '5 Min' },
  { value: 'HOUR',  label: 'Hour' },
  { value: 'DAY',   label: 'Day' },
  { value: 'WEEK',  label: 'Week' },
  { value: 'MONTH', label: 'Month' },
];

// Coarseness ranking shared by finestTf (below) — used to pick which timeframe's
// candles are drawn on the combined chart: the finest of the timeframes *chosen for
// detection*, so e.g. selecting HOUR alongside DAY shows hour candles instead of day
// candles. This is independent of which channel tabs are later toggled visible.
const TF_RANK = { MIN5: 0, HOUR: 1, DAY: 2, WEEK: 3, MONTH: 4 };

const finestTf = (tfs) =>
  (!tfs || !tfs.length) ? null : tfs.reduce((a, b) => (TF_RANK[b] < TF_RANK[a] ? b : a));

const DIRECTION_LABEL = { 1: '▲ Ascending', '-1': '▼ Descending', 0: '→ Flat' };
const DIRECTION_COLOR = { 1: '#26a69a', '-1': '#ef5350', 0: '#787b86' };

const today = new Date().toISOString().substring(0, 10);
const twoYearsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 2))
  .toISOString().substring(0, 10);

export default function ChannelExplorer() {
  const [ticker, setTicker] = useState('SPY');
  const [tickers, setTickers] = useState([]);
  const [from, setFrom] = useState(twoYearsAgo);
  const [to, setTo] = useState(today);
  const [selectedTfs, setSelectedTfs] = useState(['DAY']);
  const [visibleTfs, setVisibleTfs] = useState(new Set(['DAY']));

  // "Last actual channels" declutter filter — relies on the recursion-tree parent links the
  // detector attaches to every Channel. Defaults to checked per the original task doc - a
  // frontend-only default, the backend's own default for an omitted/false field stays the
  // full unfiltered list.
  const [lastActualChannelsOnly, setLastActualChannelsOnly] = useState(true);

  const [recursiveParams, setRecursiveParams] = useState({ ...RECURSIVE_DEFAULT_PARAMS });
  const [showParams, setShowParams] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [prices, setPrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  // Bumped on every successful detection run — passed to ChannelExplorerChart as `runId` so it
  // knows when to reset chart-side channel edits (selection/extension/deletion), which
  // are otherwise session-only scratch state that must not survive a fresh detection.
  const [detectionRunId, setDetectionRunId] = useState(0);

  useEffect(() => {
    getAvailableTickers().then(ts => setTickers([...ts].sort())).catch(() => {});
  }, []);

  // Candle timeframe follows the finest of the *selected* (chosen for detection)
  // timeframes, not the post-detection visibility tabs — so it's fixed once
  // detection runs and toggling a channel tab afterward only adds/removes lines
  // via channelsForChart, never changes which candles are drawn.
  const chartTf = finestTf(selectedTfs);

  useEffect(() => {
    if (!result) return;
    loadPrices(chartTf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTf, ticker, from, to]);

  const setRecursiveParam = (key, value) => setRecursiveParams(p => ({ ...p, [key]: value }));

  const toggleTf = (tf) =>
    setSelectedTfs(prev => prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]);

  // Inclusive show/hide toggle for the combined chart — refuses to hide the
  // last remaining visible timeframe so the chart is never left empty.
  const toggleVisibleTf = (tf) =>
    setVisibleTfs(prev => {
      if (prev.has(tf)) {
        if (prev.size === 1) return prev;
        const next = new Set(prev);
        next.delete(tf);
        return next;
      }
      return new Set(prev).add(tf);
    });

  const loadPrices = async (tf) => {
    setPricesLoading(true);
    try {
      const data = await fetchPrices(ticker, tf, from, to);
      setPrices(data);
    } catch {
      setPrices([]);
    } finally {
      setPricesLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTfs.length) { setError('Select at least one timeframe.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    setPrices([]);

    const apiParams = {
      coveragePct:       recursiveParams.coveragePct,
      minBars:           recursiveParams.minBars,
      minWidthPct:       recursiveParams.minWidthPct,
      minAnnualYieldPct: recursiveParams.minAnnualYieldPct,
      maxAnnualYieldPct: recursiveParams.maxAnnualYieldPct,
      logPrice:          true,
    };

    try {
      const data = await detectChannels(
        ticker, from, to, selectedTfs, apiParams, lastActualChannelsOnly
      );
      setResult(data);
      setDetectionRunId(id => id + 1);
      setVisibleTfs(new Set(selectedTfs));
      await loadPrices(finestTf(selectedTfs));
    } catch (err) {
      setError('Channel detection failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const channelsForChart = result
    ? selectedTfs
        .filter(tf => visibleTfs.has(tf))
        .flatMap(tf => result.channelsByTimeframe?.[tf] ?? [])
    : [];

  // Union of ALL detected channels across every selected timeframe, regardless
  // of current visibility — used only to compute the chart's auto-zoom range
  // so toggling a timeframe tab never shifts the viewport (see ChannelExplorerChart's
  // `zoomChannels` prop). Only changes when `result` or `selectedTfs` change,
  // i.e. on a fresh detection run, not when `visibleTfs` toggles.
  const allChannelsForChart = result
    ? selectedTfs.flatMap(tf => result.channelsByTimeframe?.[tf] ?? [])
    : [];

  return (
    <div className="channel-explorer">
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ce-ticker">Ticker</label>
          <input
            id="ce-ticker"
            list="ce-ticker-list"
            value={ticker}
            onChange={e => { setTicker(e.target.value.toUpperCase()); setResult(null); }}
            placeholder="e.g. SPY"
            autoComplete="off"
            required
          />
          <datalist id="ce-ticker-list">
            {tickers.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>

        <div className="form-group">
          <label htmlFor="ce-from">From</label>
          <input id="ce-from" type="date" value={from} onChange={e => setFrom(e.target.value)} required />
        </div>

        <div className="form-group">
          <label htmlFor="ce-to">To</label>
          <input id="ce-to" type="date" value={to} onChange={e => setTo(e.target.value)} required />
        </div>

        <div className="form-group ta-tf-group">
          <label>Timeframes</label>
          <div className="ta-tf-toggles">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                type="button"
                className={`ta-tf-btn${selectedTfs.includes(tf.value) ? ' ta-tf-btn--active' : ''}`}
                onClick={() => toggleTf(tf.value)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group ta-last-actual-group">
          <label className="ta-checkbox-label" htmlFor="ce-last-actual-only">
            <input
              id="ce-last-actual-only"
              type="checkbox"
              checked={lastActualChannelsOnly}
              onChange={e => setLastActualChannelsOnly(e.target.checked)}
            />
            Show only last actual channels
          </label>
        </div>

        <div className="ta-form-actions">
          <button type="submit" className="find-btn" disabled={loading || !selectedTfs.length}>
            {loading ? 'Detecting…' : 'Find Channels'}
          </button>
          <button
            type="button"
            className={`ta-params-toggle${showParams ? ' ta-params-toggle--open' : ''}`}
            onClick={() => setShowParams(v => !v)}
          >
            Params {showParams ? '▲' : '▼'}
          </button>
        </div>
      </form>

      {/* Detection parameters panel */}
      {showParams && (
        <RecursiveParamsPanel
          params={recursiveParams}
          setParam={setRecursiveParam}
          onReset={() => setRecursiveParams({ ...RECURSIVE_DEFAULT_PARAMS })}
        />
      )}

      {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}
      {loading && <div className="status-msg">Detecting channels…</div>}

      {result && (
        <>
          <div className="ta-tf-tabs">
            {selectedTfs.map(tf => (
              <button
                key={tf}
                className={`ta-tab${visibleTfs.has(tf) ? ' ta-tab--active' : ''}`}
                onClick={() => toggleVisibleTf(tf)}
                title={`Toggle ${tf} channels on the combined chart`}
              >
                <span
                  className="ta-tab-width-swatch"
                  style={{ height: `${TF_LINE_WIDTH[tf] ?? 1}px` }}
                />
                {tf}
                <span className="ta-tab-count">
                  {result.channelsByTimeframe?.[tf]?.length ?? 0}
                </span>
              </button>
            ))}
          </div>

          {pricesLoading
            ? <div className="status-msg">Loading prices…</div>
            : <ChannelExplorerChart prices={prices} channels={channelsForChart} zoomChannels={allChannelsForChart} runId={detectionRunId} />
          }

          {channelsForChart.length > 0 && (
            <div className="ta-ch-summary">
              {channelsForChart.map((ch, i) => (
                <div key={i} className="ta-ch-card">
                  <span className="ta-ch-dir" style={{ color: DIRECTION_COLOR[ch.direction] }}>
                    {DIRECTION_LABEL[ch.direction]}
                    <span className="ta-ch-tf">{ch.timeframe}</span>
                  </span>
                  <span className="ta-ch-meta">
                    Score {ch.score?.toFixed(1)} · Width {ch.widthAtr?.toFixed(2)} ATR ·
                    Touches {ch.touchesUpper}↑ {ch.touchesLower}↓
                  </span>
                  <span className="ta-ch-dates">
                    {ch.startDate?.substring(0, 10)} → {ch.endDate?.substring(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {channelsForChart.length === 0 && !pricesLoading && (
            <div className="status-msg">No channels detected for the selected timeframe(s) in this range.</div>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="empty-state">
          Enter a ticker and date range, select timeframes, then click <strong>Find Channels</strong>.
        </div>
      )}
    </div>
  );
}
