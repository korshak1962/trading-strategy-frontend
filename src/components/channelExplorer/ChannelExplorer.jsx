import { useState, useEffect, useMemo, useRef } from 'react';
import { detectChannels, fetchPrices, normalizeViewInfo, CHANNEL_VIEW } from '../../api/channelApi';
import { getAvailableTickers } from '../../api/strategyApi';
import ChannelExplorerChart, { TF_LINE_WIDTH } from './ChannelExplorerChart';
import RecursiveParamsPanel, { RECURSIVE_DEFAULT_PARAMS } from './RecursiveParamsPanel';
import { exchangeToday, exchangeZoneForTicker, addYearsIso } from '../../utils/dates';
import { isProvisional, formatStatus, formatAge, formatBarDate, formatExitSide } from './format';
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

// A / B view toggle (screener TASK_incremental_channels rev 2, §8 look-ahead caption).
const VIEW_OPTIONS = [
  { value: CHANNEL_VIEW.FULL, label: 'A · As seen today',
    title: 'Full detection over the whole range: past channels are drawn knowing the bars that came after them (look-ahead by meaning). Good for analysis, not for judging signals by eye.' },
  { value: CHANNEL_VIEW.INCREMENTAL, label: 'B · As the strategy saw them',
    title: 'The bar-by-bar replay the channel strategies trade on: the tree after the last closed bar of the range. Confirmed channels never change afterwards.' },
];

// Replays on intraday timeframes over long ranges take seconds (architect.md §2.4: SPY HOUR 6 years ≈ 4 s).
const SLOW_REPLAY_TFS = new Set(['MIN5', 'HOUR']);

// Decision 0.18: default range in the EXCHANGE's calendar (the default ticker SPY trades in
// New York), never toISOString() (UTC) or the browser's date. Computed per mount.
const defaultTo = () => exchangeToday(exchangeZoneForTicker('SPY'));
const defaultFrom = () => addYearsIso(defaultTo(), -2);

const DETECTOR_PARAM_KEYS = ['coveragePct', 'minBars', 'minWidthPct', 'minAnnualYieldPct', 'maxAnnualYieldPct'];

/**
 * @param {Object} props
 * @param {{ticker: string, timeframe?: string, startDate: string, endDate: string, params?: Object,
 *   view?: string, nonce: number}|null} [props.initialRequest] deep link (Screener → Channels): a new
 *   `nonce` fills the form with it and runs the detection once
 * @param {() => void} [props.onInitialRequestConsumed] called once the request was applied
 */
export default function ChannelExplorer({ initialRequest = null, onInitialRequestConsumed = null }) {
  const [ticker, setTicker] = useState('SPY');
  const [tickers, setTickers] = useState([]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedTfs, setSelectedTfs] = useState(['DAY']);
  const [visibleTfs, setVisibleTfs] = useState(new Set(['DAY']));

  // "Last actual channels" declutter filter — relies on the recursion-tree parent links the
  // detector attaches to every Channel. Defaults to checked per the original task doc - a
  // frontend-only default, the backend's own default for an omitted/false field stays the
  // full unfiltered list.
  const [lastActualChannelsOnly, setLastActualChannelsOnly] = useState(true);

  // A (FULL, default) / B (INCREMENTAL). `resultView` is the view the result on screen was
  // computed with; `resultRequest` its detection inputs, so the A/B toggle re-runs exactly that
  // request (not half-edited form fields).
  const [view, setView] = useState(CHANNEL_VIEW.FULL);
  const [resultView, setResultView] = useState(null);
  const [resultRequest, setResultRequest] = useState(null);

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

  // The range defaults to the form's; runDetection passes the request's own (a deep link sets the
  // form and detects in the same tick, before the new form state is visible here).
  const loadPrices = async (tf, t = ticker, f = from, e = to) => {
    setPricesLoading(true);
    try {
      const data = await fetchPrices(t, tf, f, e);
      setPrices(data);
    } catch {
      setPrices([]);
    } finally {
      setPricesLoading(false);
    }
  };

  const runDetection = async (request) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPrices([]);
    try {
      const data = await detectChannels(
        request.ticker, request.from, request.to, request.timeframes, request.params,
        request.lastActualChannelsOnly, request.view
      );
      setResult(data);
      setResultView(request.view);
      setResultRequest(request);
      setDetectionRunId(id => id + 1);
      setVisibleTfs(new Set(request.timeframes));
      await loadPrices(finestTf(request.timeframes), request.ticker, request.from, request.to);
    } catch (err) {
      setResultView(null);
      setResultRequest(null);
      setError('Channel detection failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Deep link: fill the form with the request and detect once per nonce (the ref also absorbs
  // StrictMode's double effect run).
  const appliedNonce = useRef(null);
  useEffect(() => {
    if (!initialRequest || appliedNonce.current === initialRequest.nonce) return;
    appliedNonce.current = initialRequest.nonce;
    const tf = TIMEFRAMES.some(x => x.value === initialRequest.timeframe) ? initialRequest.timeframe : 'DAY';
    const params = { ...RECURSIVE_DEFAULT_PARAMS };
    DETECTOR_PARAM_KEYS.forEach(k => {
      if (typeof initialRequest.params?.[k] === 'number') params[k] = initialRequest.params[k];
    });
    params.logPrice = true;
    const nextView = initialRequest.view === CHANNEL_VIEW.INCREMENTAL ? CHANNEL_VIEW.INCREMENTAL : CHANNEL_VIEW.FULL;
    const request = {
      ticker: String(initialRequest.ticker || '').toUpperCase(),
      from: initialRequest.startDate,
      // Through the END of the basis day: DAY bars are stamped 09:00, and a bare date is sent as
      // T00:00:00, which would drop the basis bar itself (the screener's channel then differs).
      to: /^\d{4}-\d{2}-\d{2}$/.test(initialRequest.endDate || '') ? `${initialRequest.endDate}T23:59:59` : initialRequest.endDate,
      timeframes: [tf],
      params,
      lastActualChannelsOnly,
      view: nextView,
    };
    setTicker(request.ticker);
    setFrom(request.from);
    setTo(String(request.to || '').substring(0, 10));
    setSelectedTfs([tf]);
    setRecursiveParams(params);
    setView(nextView);
    runDetection(request);
    onInitialRequestConsumed?.();
    // Keyed on the nonce only: one detection per deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequest?.nonce]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTfs.length) { setError('Select at least one timeframe.'); return; }
    const apiParams = {
      coveragePct:       recursiveParams.coveragePct,
      minBars:           recursiveParams.minBars,
      minWidthPct:       recursiveParams.minWidthPct,
      minAnnualYieldPct: recursiveParams.minAnnualYieldPct,
      maxAnnualYieldPct: recursiveParams.maxAnnualYieldPct,
      logPrice:          true,
    };
    await runDetection({
      ticker, from, to, timeframes: selectedTfs, params: apiParams, lastActualChannelsOnly, view,
    });
  };

  // Switching A <-> B with a result on screen re-runs the same request in the other view, so the
  // two can be compared directly; without a result it only selects the view of the next run.
  const changeView = (next) => {
    if (next === view || loading) return;
    setView(next);
    if (resultRequest) runDetection({ ...resultRequest, view: next });
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

  // viewInfo per detected timeframe (info = null per TF on an older backend).
  const viewInfos = useMemo(
    () => (result && resultRequest
      ? resultRequest.timeframes.map(tf => ({ tf, info: normalizeViewInfo(result, tf) }))
      : []),
    [result, resultRequest]
  );

  // Read-only confirmation constants for the params panel: the first timeframe that reports them.
  const constants = viewInfos.find(v => v.info?.constants)?.info.constants || null;

  // Last exits per depth of the visible timeframes - B only (A has no replay, hence no exits).
  // Memoised: the chart effect depends on it, a new array each render would rebuild the chart.
  const exitsForChart = useMemo(() => (
    resultView === CHANNEL_VIEW.INCREMENTAL
      ? viewInfos.filter(v => visibleTfs.has(v.tf)).flatMap(v => v.info?.lastExits || [])
      : []
  ), [viewInfos, visibleTfs, resultView]);

  const slowReplay = view === CHANNEL_VIEW.INCREMENTAL && selectedTfs.some(tf => SLOW_REPLAY_TFS.has(tf));

  return (
    <div className="channel-explorer">
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ce-ticker">Ticker</label>
          <input
            id="ce-ticker"
            list="ce-ticker-list"
            value={ticker}
            onChange={e => { setTicker(e.target.value.toUpperCase()); setResult(null); setResultRequest(null); }}
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

        <div className="form-group ta-view-group">
          <label>Channels view</label>
          <div className="ta-view-toggle" role="group" aria-label="Channels view" data-testid="ce-view-toggle">
            {VIEW_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`ta-view-btn${view === opt.value ? ' ta-view-btn--active' : ''}`}
                aria-pressed={view === opt.value}
                disabled={loading}
                title={opt.title}
                data-testid={`ce-view-${opt.value}`}
                onClick={() => changeView(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ta-view-caption" data-testid="ce-view-caption">
            By default the channels are drawn <strong>as they are seen today</strong>: one detection over the whole
            range, which already knows how every past channel continued. <strong>The strategy saw different
            ones</strong> — B shows the channels it traded on (bar by bar, closed bars only). Judge trades by eye only in B.
          </div>
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
          constants={constants}
        />
      )}

      {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}
      {loading && (
        <div className="status-msg" data-testid="ce-loading">
          {view === CHANNEL_VIEW.INCREMENTAL ? 'Replaying channels bar by bar…' : 'Detecting channels…'}
          {slowReplay && ' (an intraday replay over a long range can take several seconds)'}
        </div>
      )}

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

          <ViewInfoBlock viewInfos={viewInfos} resultView={resultView} result={result} />

          {pricesLoading
            ? <div className="status-msg">Loading prices…</div>
            : <ChannelExplorerChart prices={prices} channels={channelsForChart} zoomChannels={allChannelsForChart} runId={detectionRunId} exits={exitsForChart} />
          }

          {channelsForChart.length > 0 && (
            <div className="ta-ch-summary">
              {channelsForChart.map((ch, i) => (
                <div
                  key={i}
                  className={`ta-ch-card${isProvisional(ch) ? ' ta-ch-card--provisional' : ''}${ch.current ? ' ta-ch-card--current' : ''}`}
                  data-testid="ce-channel-card"
                  data-status={ch.status || ''}
                >
                  <span className="ta-ch-dir" style={{ color: DIRECTION_COLOR[ch.direction] }}>
                    {DIRECTION_LABEL[ch.direction]}
                    <span className="ta-ch-tf">{ch.timeframe}</span>
                    {typeof ch.depth === 'number' && ch.depth >= 0 && <span className="ta-ch-tf">d{ch.depth}</span>}
                    {formatStatus(ch) && (
                      <span className={`ta-ch-badge${isProvisional(ch) ? ' ta-ch-badge--provisional' : ''}`}>{formatStatus(ch)}</span>
                    )}
                    {ch.current && <span className="ta-ch-badge ta-ch-badge--current">current</span>}
                  </span>
                  <span className="ta-ch-meta">
                    Score {ch.score?.toFixed(1)} · Width {ch.widthAtr?.toFixed(2)} ATR ·
                    Touches {ch.touchesUpper}↑ {ch.touchesLower}↓
                  </span>
                  <span className="ta-ch-dates">
                    {ch.startDate?.substring(0, 10)} → {ch.endDate?.substring(0, 10)}
                    {formatAge(ch.ageBars) && ` · age ${formatAge(ch.ageBars)}`}
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

const VIEW_NAME = { FULL: 'A · as seen today', INCREMENTAL: 'B · as the strategy saw them' };

const fmtMs = (ms) => (ms === null ? null : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

// Per-timeframe facts of the result on screen (viewInfo): what was processed, the bar that is
// still forming (B: drawn as a candle, not processed), the current channel and its age, the last
// exits, the replay time, and the "too few bars" message (E20). Renders nothing on an older
// backend that sends no viewInfo.
function ViewInfoBlock({ viewInfos, resultView, result }) {
  const shown = viewInfos.filter(v => v.info);
  if (shown.length === 0) return null;
  return (
    <div className="ta-view-info" data-testid="ce-view-info">
      {shown.map(({ tf, info }) => {
        const channels = result?.channelsByTimeframe?.[tf] || [];
        const current = channels.find(c => c.current)
          || (info.currentChannelId ? channels.find(c => c.id === info.currentChannelId) : null)
          || null;
        return (
          <div key={tf} className="ta-view-info-card" data-testid={`ce-view-info-${tf}`}>
            <span><strong>{tf}</strong> · {VIEW_NAME[info.view || resultView] || info.view || '?'}</span>
            {info.message && <span className="ta-view-info-warn" data-testid="ce-view-message">{info.message}</span>}
            <span>
              Bars {formatBarDate(info.firstBarDate)} → {formatBarDate(info.lastProcessedBarDate)}
              {info.barCount !== null && ` (${info.barCount} processed)`}
            </span>
            {info.formingBarDate && (
              <span data-testid="ce-forming-bar">
                Forming bar {formatBarDate(info.formingBarDate)}: drawn, not processed
              </span>
            )}
            <span data-testid="ce-current-channel">
              {current ? (
                <>
                  Current channel: from {formatBarDate(current.startDate)}
                  {formatAge(current.ageBars) ? `, age ${formatAge(current.ageBars)}` : ''}
                  {typeof current.depth === 'number' && current.depth >= 0 ? `, depth ${current.depth}` : ''}
                </>
              ) : info.currentChannelId ? (
                <>
                  Current channel {info.currentChannelId}
                  {formatAge(info.currentChannelAgeBars) ? `, age ${formatAge(info.currentChannelAgeBars)}` : ''} (not in the drawn set)
                </>
              ) : (
                <>No current channel</>
              )}
            </span>
            {info.lastExits.length > 0 && (
              <span data-testid="ce-last-exits">
                Last exits: {info.lastExits.map(e => `d${e.depth ?? '?'} ${formatExitSide(e.side)} ${formatBarDate(e.barDate)}`).join(' · ')}
              </span>
            )}
            {(info.view || resultView) === CHANNEL_VIEW.INCREMENTAL && fmtMs(info.replayMs) && <span>Replay {fmtMs(info.replayMs)}</span>}
          </div>
        );
      })}
    </div>
  );
}
