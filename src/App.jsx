import { useState, useEffect, useMemo, useRef } from 'react';
import { useFullscreen } from './hooks/useFullscreen';
import { useElementSize } from './hooks/useElementSize';
import { useIndicatorSelection } from './hooks/useIndicatorSelection';
import './ChartFullscreen.css';
import './ResultsTabs.css';
import Header from './components/Header';
import StrategySelector from './components/StrategySelector';
import StrategyConfig from './components/StrategyConfig';
import DateRangePicker from './components/DateRangePicker';
import ReporterStyleChart from './components/ReporterStyleChart';
import StrategyResults from './components/StrategyResults';
import IndicatorPicker from './components/IndicatorPicker';
import TradesTable from './components/TradesTable';
import PerformanceMetricsTable from './components/PerformanceMetricsTable';
import TradeStatisticsTable from './components/TradeStatisticsTable';
import {
  getAvailableStrategies, getAvailableTickers, submitStrategies, formatStrategyConfig,
  startOptimization, fetchOptimizationJob, fetchCurrentOptimizationJob, fetchOptimizationResult,
  stopOptimization,
} from './api/strategyApi';
import OptimizationProgress from './components/OptimizationProgress';
import TickerCombobox from './components/TickerCombobox';
import ChannelExplorer from './components/channelExplorer/ChannelExplorer';
import DownloaderPanel from './components/downloader/DownloaderPanel';
import { calendarDayKey, exchangeTodayLocalDate, exchangeZoneForTicker } from './utils/dates';

// .chart-toolbar bottom margin (see fullscreenChartHeight).
const CHART_TOOLBAR_MARGIN_PX = 16;

// Async optimization job (TASK_optimization_progress.md §3.3).
const POLL_MS = 1000;
const OPT_ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const OPT_TERMINAL_STATUSES = new Set(['DONE', 'FAILED', 'CANCELLED']);
const OPT_CLIENT_LOG_MAX = 2000; // client-side cap, oldest lines dropped first
const OPT_JOB_LOST_MESSAGE = 'The optimization job was lost (backend restarted?)';
const OPT_CONFLICT_NOTICE = 'An optimization is already running — showing its progress';

// Appends polled log lines, de-duplicated by seq (lines arrive oldest first), capped.
const mergeLogLines = (prev, incoming) => {
  if (!incoming || incoming.length === 0) return prev;
  const lastSeq = prev.length ? prev[prev.length - 1].seq : 0;
  const fresh = incoming.filter((l) => l.seq > lastSeq);
  if (fresh.length === 0) return prev;
  const merged = prev.concat(fresh);
  return merged.length > OPT_CLIENT_LOG_MAX ? merged.slice(merged.length - OPT_CLIENT_LOG_MAX) : merged;
};

const App = () => {
  // Top-level tab: 'backtest' (strategy configure/run/results flow), 'channels' (channel
  // explorer) or 'downloader' (price download + indicator recalc jobs). The tabs are
  // functionally independent and don't share state.
  const [activeTab, setActiveTab] = useState('backtest');

  // State for available strategies
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [availableTickers, setAvailableTickers] = useState([]);
  
  // State for selected strategies
  const [selectedStrategies, setSelectedStrategies] = useState({});
  
  // State for ticker and timeframe
  const [ticker, setTicker] = useState('SPY');
  const [timeFrame, setTimeFrame] = useState('DAY');
  // Long-only evaluation: backend skips the short leg entirely. Sent with both
  // backtest and optimize requests via formatStrategyConfig.
  const [longOnly, setLongOnly] = useState(false);

  // State for date range
  const [startDate, setStartDate] = useState(new Date(2023, 0, 1));
  // Decision 0.18: default end = the exchange's today (US default ticker), not the browser's.
  const [endDate, setEndDate] = useState(() => exchangeTodayLocalDate());
  
  // State for mode, loading and results
  const [mode, setMode] = useState('backtest'); // 'backtest' | 'optimize'
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // ---- Async optimization job (Optimize mode only; Backtest stays synchronous) ----
  const [optJobId, setOptJobId] = useState(null);
  const [optJob, setOptJob] = useState(null);           // last polled job JSON
  const [optPolling, setOptPolling] = useState(false);  // poll loop running
  const [optLog, setOptLog] = useState([]);             // accumulated log lines
  const [optLogTruncated, setOptLogTruncated] = useState(false);
  const [optWarning, setOptWarning] = useState(null);   // transient poll failure
  const [optNotice, setOptNotice] = useState(null);     // e.g. attached to an already running job
  const [optBanner, setOptBanner] = useState(null);     // "Stopped at x % — …" above a partial result
  const [optLost, setOptLost] = useState(false);        // job 404 (backend restarted)
  const [stopRequested, setStopRequested] = useState(false);
  const optLastSeq = useRef(0);                         // highest log seq received
  const pollInFlight = useRef(false);
  const optAttached = useRef(false);                    // guards the on-mount reattach
  const optActive = optPolling && !optLost;

  // Unified indicator selection (master toggle + per-series checkboxes) for the result chart,
  // reset to the per-series defaults (indicatorSeries.js SERIES_STYLE) whenever a new result arrives.
  const {
    seriesList: indicatorSeriesList,
    showIndicators,
    setShowIndicators,
    selectedIds: selectedIndicatorIds,
    toggleSeries: toggleIndicatorSeries,
    toggleGroup: toggleIndicatorGroup,
    visibleSeries: visibleIndicatorSeries,
  } = useIndicatorSelection(results?.chartDataDTO);
  // One object per selection change (not per App render), so the chart's legend memos keyed on it
  // only recompute when the selection actually changes.
  const indicatorSelection = useMemo(() => ({
    seriesList: indicatorSeriesList,
    showIndicators,
    setShowIndicators,
    selectedIds: selectedIndicatorIds,
    toggleSeries: toggleIndicatorSeries,
    toggleGroup: toggleIndicatorGroup,
  }), [
    indicatorSeriesList, showIndicators, setShowIndicators, selectedIndicatorIds, toggleIndicatorSeries,
    toggleIndicatorGroup,
  ]);

  // Fullscreen mode: fullscreens the whole results area - toolbar, charts and the
  // StrategyResults tabs below them. The charts fill the first screen; the element scrolls
  // vertically down to the result tabs, which then span the full screen width.
  // Callback-refs (state), not useRef: these elements only mount once `results` is set, and a
  // plain ref's effects wouldn't re-run to notice that later mount.
  const [chartAreaNode, setChartAreaNode] = useState(null);
  const [chartToolbarNode, setChartToolbarNode] = useState(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(chartAreaNode);
  const chartAreaSize = useElementSize(chartAreaNode);
  // Toolbar (indicator picker + fullscreen button) height is measured, since the picker wraps.
  const chartToolbarSize = useElementSize(chartToolbarNode);
  // Chart block height = the fullscreen content box (viewport minus padding) minus the toolbar
  // row and its margin. ReporterStyleChart (fitHeight) fits its panes, titles and slider into it,
  // so the charts exactly fill the first screen and the StrategyResults tabs start just below.
  const fullscreenChartHeight = Math.max(
    400,
    Math.floor(chartAreaSize.height - chartToolbarSize.height - CHART_TOOLBAR_MARGIN_PX)
  );
  const fullscreenChartWidth = Math.max(600, chartAreaSize.width - 20);

  // Fetch available strategies on component mount
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const strategies = await getAvailableStrategies();
        setAvailableStrategies(strategies);
      } catch (err) {
        setError('Failed to load available strategies');
        console.error(err);
      }
    };

    const fetchTickers = async () => {
      try {
        const tickers = await getAvailableTickers();
        setAvailableTickers(tickers);
      } catch (err) {
        console.error('Failed to load tickers:', err);
      }
    };

    fetchStrategies();
    fetchTickers();
  }, []);

  // Shows a job right away and starts polling it. `initial` is either a placeholder (just started:
  // the first poll asks logSince=0 for all retained lines) or a full job JSON fetched with
  // logSince=0 (reattach on mount: its log is taken as is).
  const attachOptimizationJob = (initial, { notice = null } = {}) => {
    optAttached.current = true;
    optLastSeq.current = Number.isFinite(initial.lastLogSeq) ? initial.lastLogSeq : 0;
    setOptLog(mergeLogLines([], initial.log || []));
    setOptLogTruncated(!!initial.logTruncated);
    setOptWarning(null);
    setOptNotice(notice);
    setOptBanner(null);
    setOptLost(false);
    setStopRequested(!!initial.cancelRequested);
    setOptJob(initial);
    setOptJobId(initial.jobId);
    setOptPolling(true);
    setLoading(true);
  };

  // On mount: reattach to a QUEUED/RUNNING optimization (e.g. after a page reload).
  // A finished old job is not auto-loaded.
  useEffect(() => {
    let cancelled = false;
    fetchCurrentOptimizationJob(0)
      .then((job) => {
        if (cancelled || !job || optAttached.current || !OPT_ACTIVE_STATUSES.has(job.status)) return;
        setMode('optimize');
        setResults(null);
        attachOptimizationJob(job);
      })
      .catch((err) => console.error('Failed to fetch current optimization job:', err));
    return () => { cancelled = true; };
    // Runs once on mount; attachOptimizationJob only uses state setters and refs.
  }, []);

  // Poll the job every second while it runs. Polls never overlap; the loop stops on a terminal
  // status, on a lost job (404) and on unmount. Each poll asks for the log lines after the last
  // seq seen and appends them.
  useEffect(() => {
    if (!optJobId || !optPolling) return undefined;
    let cancelled = false;

    // Terminal status: fetch and show the result (DONE, or CANCELLED with a best-so-far result).
    const finish = async (job) => {
      try {
        if (job.status === 'DONE' || (job.status === 'CANCELLED' && job.hasResult)) {
          const result = await fetchOptimizationResult(job.jobId);
          if (cancelled) return;
          setResults(result);
          setError(null);
          if (job.status === 'CANCELLED') {
            const pct = Number.isFinite(job.percent) ? job.percent.toFixed(1) : '?';
            const done = Number.isFinite(job.done) ? job.done.toLocaleString('en-US') : '?';
            setOptBanner(`Stopped at ${pct} % — best of the ${done} combinations tested`);
          }
        } else if (job.status === 'CANCELLED') {
          setResults(null);
          setError('Optimization stopped before any combination finished');
        } else {
          setResults(null);
          setError('Optimization failed: ' + (job.error || 'unknown error'));
        }
      } catch (err) {
        if (cancelled) return;
        setResults(null);
        setError('Optimization failed: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const tick = async () => {
      if (pollInFlight.current) return; // never overlap polls
      pollInFlight.current = true;
      try {
        const job = await fetchOptimizationJob(optJobId, optLastSeq.current);
        if (cancelled) return;
        setOptJob(job);
        setOptLog((prev) => mergeLogLines(prev, job.log));
        if (job.logTruncated) setOptLogTruncated(true);
        if (Number.isFinite(job.lastLogSeq)) optLastSeq.current = Math.max(optLastSeq.current, job.lastLogSeq);
        setOptWarning(null);
        if (OPT_TERMINAL_STATUSES.has(job.status)) {
          // Fetch the result first: stopping the loop re-runs this effect's cleanup, which
          // would mark the in-flight result fetch as cancelled. Ticks meanwhile are skipped
          // by the in-flight guard.
          await finish(job);
          if (!cancelled) setOptPolling(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setOptLost(true);
          setOptPolling(false);
          setOptWarning(null);
          setResults(null);
          setError(OPT_JOB_LOST_MESSAGE);
          setLoading(false);
        } else {
          setOptWarning(`Cannot reach the backend, retrying… (${err.message})`);
        }
      } finally {
        pollInFlight.current = false;
      }
    };

    tick(); // first poll right away, then once a second
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [optJobId, optPolling]);

  const handleStopOptimization = async () => {
    if (!optJobId) return;
    setStopRequested(true);
    try {
      await stopOptimization(optJobId);
    } catch (err) {
      if (err.status === 404) {
        setOptLost(true);
        setOptPolling(false);
        setError(OPT_JOB_LOST_MESSAGE);
        setLoading(false);
      } else {
        setStopRequested(false);
        setOptWarning(`Stop failed: ${err.message}`);
      }
    }
  };

  // Optimize mode: start an async job and attach to it (or to the already running one on 409).
  const runOptimization = async (config) => {
    // A new run clears the previous run's panel, log and result.
    setResults(null);
    setOptJob(null);
    setOptJobId(null);
    setOptLog([]);
    setOptBanner(null);
    setOptNotice(null);
    setOptLost(false);
    try {
      const res = await startOptimization(config);
      if (res.conflict) {
        if (!res.jobId) throw new Error(res.error || 'An optimization is already running');
        attachOptimizationJob({ jobId: res.jobId, status: 'RUNNING' }, { notice: OPT_CONFLICT_NOTICE });
      } else {
        attachOptimizationJob({ jobId: res.jobId, status: 'QUEUED', total: res.total, done: 0, percent: 0 });
      }
    } catch (err) {
      setResults(null);
      setError('Optimization failed: ' + err.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Client-side validation. Every error clears the previous result so a stale result is
    // never shown next to an error message.
    if (!ticker || !ticker.trim()) {
      setResults(null);
      setError('Ticker is required');
      return;
    }
    // Compare calendar days, not instants: a start and end on the same day are valid
    // (formatStrategyConfig sends T00:00:00 and T23:59:59).
    if (calendarDayKey(startDate) > calendarDayKey(endDate)) {
      setResults(null);
      setError('Start date must be on or before end date');
      return;
    }
    setLoading(true);
    setError(null);

    const config = formatStrategyConfig(ticker, timeFrame, startDate, endDate, selectedStrategies, longOnly);
    if (mode === 'optimize') {
      // Async job: `loading` stays true until the poll loop sees a terminal status.
      await runOptimization(config);
      return;
    }

    try {
      const result = await submitStrategies(config);
      setResults(result);
    } catch (err) {
      setResults(null);
      setError('Backtest failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Rewrites every param's timeframe in a selectedStrategies map to `tf`.
  // The backend runs all sub-strategies on the global timeFrame (Reporter.configureMerger passes
  // config.getTimeFrame() into addStrategyToMerger), so the per-param timeframe must mirror it
  // rather than drift. Per-param timeframes are a future feature; until then these stay in sync.
  const withTimeframe = (strategies, tf) =>
    Object.fromEntries(
      Object.entries(strategies).map(([name, params]) => [
        name,
        Object.fromEntries(
          Object.entries(params).map(([paramName, param]) => [
            paramName,
            { ...param, timeframe: tf },
          ])
        ),
      ])
    );

  const handleTimeFrameChange = (tf) => {
    setTimeFrame(tf);
    setResults(null);
    setSelectedStrategies(prev => withTimeframe(prev, tf));
  };

  // Add strategy to selected strategies
  const handleAddStrategy = (strategy) => {
    setResults(null);
    setSelectedStrategies(prev => ({
      ...prev,
      // available-strategies advertises params with timeframe == null
      // (StrategyProviderImpl builds them as new ParamVO(name, class, null)), so stamp the
      // current global timeFrame on them instead of letting the UI fall back to 'DAY'.
      [strategy.name]: strategy.parameters.reduce((acc, param) => {
        acc[param.paramName] = { ...param, timeframe: timeFrame };
        return acc;
      }, {})
    }));
  };

  // Remove strategy from selected strategies
  const handleRemoveStrategy = (strategyName) => {
    setResults(null);
    setSelectedStrategies(prev => {
      const newStrategies = { ...prev };
      delete newStrategies[strategyName];
      return newStrategies;
    });
  };

  // field: 'value' | 'min' | 'max' | 'step' | 'timeframe'
  const handleUpdateParam = (strategyName, paramName, field, value) => {
    setResults(null);
    setSelectedStrategies(prev => ({
      ...prev,
      [strategyName]: {
        ...prev[strategyName],
        [paramName]: {
          ...prev[strategyName][paramName],
          [field]: field === 'timeframe' ? value : Number(value)
        }
      }
    }));
  };

  const showOptPanel = mode === 'optimize' && !!optJob;

  const renderMain = () => {
    switch (activeTab) {
      case 'channels':
        return (
          <main className="flex-grow w-full px-4 py-8">
            <ChannelExplorer />
          </main>
        );
      case 'downloader':
        return (
          <main className="flex-grow w-full px-4 py-8">
            <DownloaderPanel />
          </main>
        );
      default:
        return (
      // Full page width (like the other tabs): a fixed-width parameters column flush at the
      // left gutter, results take all the remaining width. Single column below lg. 410px is the
      // narrowest width (measured) at which the DateRangePicker quick-range buttons stay on one line.
      <main className="flex-grow w-full px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[410px_minmax(0,1fr)] gap-6">
          {/* Configuration Panel */}
          <div className="bg-white p-6 rounded-lg shadow">
            {/* Mode Toggle */}
            <div className="mb-6">
              <div className="flex border-2 border-blue-600 rounded overflow-hidden">
                <button
                  type="button"
                  className={mode === 'backtest'
                    ? 'flex-1 py-2 text-sm font-semibold bg-blue-600 text-white'
                    : 'flex-1 py-2 text-sm font-medium bg-white text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-white'}
                  onClick={() => { setMode('backtest'); setResults(null); }}
                  disabled={optActive}
                  title={optActive ? 'An optimization is running — stop it or wait for it to finish' : undefined}
                >
                  Backtest
                </button>
                <button
                  type="button"
                  className={mode === 'optimize'
                    ? 'flex-1 py-2 text-sm font-semibold bg-blue-600 text-white'
                    : 'flex-1 py-2 text-sm font-medium bg-white text-blue-600 hover:bg-blue-50'}
                  onClick={() => { setMode('optimize'); setResults(null); }}
                >
                  Optimize
                </button>
              </div>
              {mode === 'optimize' && (
                <p className="mt-1 text-xs text-gray-500">Set Min/Max/Step for each parameter to grid-search the best combination.</p>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {/* Ticker and TimeFrame */}
              <div className="mb-6">
                <label htmlFor="ticker-input" className="block text-sm font-medium text-gray-700 mb-2">Ticker</label>
                <TickerCombobox
                  id="ticker-input"
                  value={ticker}
                  onChange={(val) => { setTicker(val); setResults(null); }}
                  tickers={availableTickers}
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Frame</label>
                <select
                  value={timeFrame}
                  onChange={(e) => handleTimeFrameChange(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="MIN5">5 Minutes</option>
                  <option value="HOUR">Hour</option>
                  <option value="DAY">Day</option>
                  <option value="WEEK">Week</option>
                  <option value="MONTH">Month</option>
                </select>
              </div>

              {/* Long only toggle */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={longOnly}
                    onChange={(e) => { setLongOnly(e.target.checked); setResults(null); }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Long only
                </label>
                <p className="mt-1 text-xs text-gray-500">Ignore short signals; only the long leg is evaluated.</p>
              </div>

              {/* Date Range Picker */}
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                zone={exchangeZoneForTicker(ticker)}
              />
              
              {/* Strategy Selector */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Strategies</h3>
                <StrategySelector
                  availableStrategies={availableStrategies}
                  onAddStrategy={handleAddStrategy}
                />
              </div>
              
              {/* Selected Strategies Configuration */}
              {Object.keys(selectedStrategies).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Configure Strategies</h3>
                  <StrategyConfig
                    selectedStrategies={selectedStrategies}
                    onRemoveStrategy={handleRemoveStrategy}
                    onUpdateParam={handleUpdateParam}
                    mode={mode}
                    timeFrame={timeFrame}
                  />
                </div>
              )}
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || Object.keys(selectedStrategies).length === 0}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading
                  ? (mode === 'optimize'
                    ? (optActive && Number.isFinite(optJob?.percent) ? `Optimizing… ${Math.floor(optJob.percent)} %` : 'Optimizing…')
                    : 'Processing…')
                  : (mode === 'optimize' ? 'Run Optimization' : 'Run Backtest')}
              </button>
              
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
            </form>
          </div>
          
          {/* Results Panel */}
          <div className="min-w-0">
            {/* Optimize mode: live progress of the async job; after it ends, the collapsed run
                (final best card + log) stays above the result until the next run. */}
            {showOptPanel && (
              <div className={results ? 'mb-6' : ''}>
                <OptimizationProgress
                  job={optJob}
                  logLines={optLog}
                  logTruncated={optLogTruncated}
                  onStop={handleStopOptimization}
                  stopping={stopRequested}
                  warning={optWarning}
                  notice={optNotice}
                  lost={optLost}
                />
              </div>
            )}
            {results ? (
              <div className="bg-white p-6 rounded-lg shadow">
                {mode === 'optimize' && optBanner && (
                  <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium" role="status">
                    {optBanner}
                  </div>
                )}
                <h2 className="text-xl font-bold mb-4">
                  {mode === 'optimize' ? 'Optimization Results' : 'Results'} for {results.ticker}
                </h2>
                
                {/* Results area - the element fullscreened by the toggle. In fullscreen the charts
                    fill the first screen and StrategyResults follows below at full width. */}
                <div ref={setChartAreaNode} className={isFullscreen ? 'chart-fullscreen-active' : ''}>
                  {/* Toolbar: indicator picker + fullscreen toggle (also inside fullscreen) */}
                  <div ref={setChartToolbarNode} className="chart-toolbar">
                    <IndicatorPicker
                      seriesList={indicatorSeriesList}
                      showIndicators={showIndicators}
                      onToggleShow={setShowIndicators}
                      selectedIds={selectedIndicatorIds}
                      onToggleSeries={toggleIndicatorSeries}
                      onToggleGroup={toggleIndicatorGroup}
                    />
                    <button
                      type="button"
                      className="fullscreen-toggle-btn"
                      onClick={toggleFullscreen}
                      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreen ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}
                    </button>
                  </div>

                  {/* Chart */}
                  <div className="mb-6">
                    <ReporterStyleChart
                      data={results.chartDataDTO}
                      width={isFullscreen ? fullscreenChartWidth : 1200}
                      height={isFullscreen ? fullscreenChartHeight : 600}
                      fitHeight={isFullscreen}
                      visibleSeries={visibleIndicatorSeries}
                      indicatorSelection={indicatorSelection}
                      longLegOnly={results.longOnly !== true && results.chartDataDTO?.includesShortSignals !== true}
                    />
                  </div>

                  {/* Results Summary - same element position in and out of fullscreen, so its
                      active tab survives the toggle */}
                  <StrategyResults
                    results={results}
                    mode={mode}
                    fileContext={{ ticker, timeFrame, selectedStrategies, startDate, endDate }}
                  />
                </div>
              </div>
            ) : !showOptPanel && (
              <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64">
                <p className="text-gray-500">
                  {loading ? 'Processing your request...' : 'Configure and run a strategy to see results'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header activeTab={activeTab} onChangeTab={setActiveTab} />

      {renderMain()}

      <footer className="py-4 bg-gray-800 text-white text-center">
        <p>Strategy Backtesting Tool &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;