import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  stopOptimization, fetchSignalCharts, startScreening, fetchScreeningResult, getProfileByKey, deleteProfile,
} from './api/strategyApi';
import SignalChartsView from './components/signals/SignalChartsView';
import { adaptSignalCharts } from './components/signals/signalPanes';
import { adaptNextTriggers, chartTriggers } from './components/nextTriggers/nextTriggersAdapter';
import OptimizationProgress from './components/OptimizationProgress';
import SaveCaseControl from './components/SaveCaseControl';
import SavedCasesPanel from './components/SavedCasesPanel';
import TickerCombobox from './components/TickerCombobox';
import ChannelExplorer from './components/channelExplorer/ChannelExplorer';
import DownloaderPanel from './components/downloader/DownloaderPanel';
import WatchlistPanel from './components/watch/WatchlistPanel';
import WatchToasts from './components/watch/WatchToasts';
import ScreenerPanel from './components/universeScreener/ScreenerPanel';
import PrepareStrategiesHint from './components/universeScreener/PrepareStrategiesHint';
import { isMinimalIndicatorsError } from './components/universeScreener/prepareFlow';
import { useScreenerLatest } from './hooks/useScreenerLatest';
import { useWatchNotifications } from './hooks/useWatchNotifications';
import { getWatchBacktestConfig, markNotificationRead } from './api/watchApi';
import { describeError, fmtDay, fmtPrice, modeLabel } from './components/watch/format';
import {
  calendarDayKey, exchangeTodayLocalDate, exchangeZoneForTicker, localDateFromIso, toLocalIsoDate, fmtBarTimestamp,
} from './utils/dates';
import { DEFAULT_OBJECTIVE, OBJECTIVES, normalizeObjective } from './utils/objectives';
import ChannelLayerControl from './components/charts/ChannelLayerControl';
import { useStrategyChannelLayer } from './hooks/useStrategyChannelLayer';
import { resolveChannelSource, isChannelSemanticsWarning } from './utils/channelLayer';
import { CHANNEL_VIEW } from './api/channelApi';
import StabilitySettings from './components/stability/StabilitySettings';
import ChannelStabilityView from './components/stability/ChannelStabilityView';
import {
  defaultStabilitySettings, isCoarserTimeFrame, settingsFromRequest, stabilityRequest, stabilityValidationError,
  withParamValues,
} from './components/stability/stabilityFormat';
import ScreeningSettings from './components/screening/ScreeningSettings';
import SensitivityView from './components/screening/SensitivityView';
import ProfileBanner from './components/screening/ProfileBanner';
import {
  batchInfo, defaultScreeningSettings, effectivePlan, formGridSize, formMatchesSearchSpace, profileChips, profileKey,
  profileProvenance, provisionalClean, screeningRequest, screeningSettingsFromRequest, screeningValidationError, searchSpaceToForm,
  tunableCount, withDefaultRanges,
} from './components/screening/screeningFormat';

// .chart-toolbar bottom margin (see fullscreenChartHeight).
const CHART_TOOLBAR_MARGIN_PX = 16;

// Async optimization job (TASK_optimization_progress.md §3.3).
const POLL_MS = 1000;
const OPT_ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const OPT_TERMINAL_STATUSES = new Set(['DONE', 'FAILED', 'CANCELLED']);
const OPT_CLIENT_LOG_MAX = 2000; // client-side cap, oldest lines dropped first
const OPT_JOB_LOST_MESSAGE = 'The optimization job was lost (backend restarted?)';
const OPT_CONFLICT_NOTICE = 'An optimization is already running — showing its progress';
// Parameter screening job (screener BA-021 §3a): same slot / registry / polling as an optimize job.
const SCREENING_JOB_LOST_MESSAGE = 'The screening job was lost (the server restarted). Nothing was saved — start it again.';
const PROFILE_LOOKUP_DEBOUNCE_MS = 300;

// Appends polled log lines, de-duplicated by seq (lines arrive oldest first), capped.
const mergeLogLines = (prev, incoming) => {
  if (!incoming || incoming.length === 0) return prev;
  const lastSeq = prev.length ? prev[prev.length - 1].seq : 0;
  const fresh = incoming.filter((l) => l.seq > lastSeq);
  if (fresh.length === 0) return prev;
  const merged = prev.concat(fresh);
  return merged.length > OPT_CLIENT_LOG_MAX ? merged.slice(merged.length - OPT_CLIENT_LOG_MAX) : merged;
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

const App = () => {
  // Top-level tab: 'backtest' (strategy configure/run/results flow), 'channels' (channel
  // explorer), 'screener' (universe screener: filters, results, universe), 'downloader' (price
  // download + indicator recalc jobs) or 'watchlist' (signal watches). The tabs are functionally
  // independent; the Watchlist only opens a watch's run in Backtest (deep link,
  // openWatchInBacktest), the Screener opens a ticker in Channels (initialRequest) or Backtest.
  const [activeTab, setActiveTab] = useState('backtest');

  // ---- Universe screener (screener architect.md "Universe screener rev 1" §2.3) ----
  // Badge "new results", polled from any tab; seen once the Screener tab is open.
  const screenerLatest = useScreenerLatest();
  const markScreenerSeen = screenerLatest.markSeen;
  useEffect(() => {
    if (activeTab === 'screener') markScreenerSeen();
  }, [activeTab, markScreenerSeen, screenerLatest.latestRunId]);
  // Screener → Channels: the request the Explorer fills its form with and detects once ({ticker,
  // timeframe, startDate, endDate, params, view, nonce}); cleared when the Explorer consumed it so
  // returning to the tab later does not re-run it.
  const [channelsRequest, setChannelsRequest] = useState(null);
  const openInChannels = useCallback((req) => {
    setChannelsRequest({ ...req, nonce: Date.now() });
    setActiveTab('channels');
  }, []);
  const consumeChannelsRequest = useCallback(() => setChannelsRequest(null), []);

  // ---- Signal watch (screener architect.md "Signal watch — design rev 1" §6.2) ----
  // Badge + toasts: polled from any tab.
  const watchNotifications = useWatchNotifications();
  // The watch whose run the Backtest form holds (deep link): {watchId, watchName, mode,
  // initialPosition, focusBarDate, tradeStart, edited}. Its initialPosition is sent with Backtest /
  // Signals runs only (never Optimize). A ticker / timeframe change or a loaded case drops it; any
  // other form edit sets `edited` (the run may then differ from the watch: E1 holds only unedited).
  const [watchContext, setWatchContext] = useState(null);
  const [watchLinkError, setWatchLinkError] = useState(null);
  const [watchLinkBusy, setWatchLinkBusy] = useState(false);
  // Deep link auto-run: set together with the form; the effect below submits once the form state
  // has rendered, through the same handleSubmit as a manual run.
  const pendingAutoRun = useRef(false);
  const [autoRunTick, setAutoRunTick] = useState(0);
  const markWatchEdited = () => setWatchContext((c) => (c && !c.edited ? { ...c, edited: true } : c));

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
  // Optimization objective (OptimizationObjective name), sent as objectiveFunction with Optimize
  // requests only. Restored from a loaded case and from a reattached job.
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const selectedObjective = OBJECTIVES.find((o) => o.value === objective);

  // ---- Parameter stability by channel (screener TASK_channel_param_stability.md, architect.md §6) ----
  // Optimize-form section {enabled, channelTimeFrame, params}; sent as channelStability with Optimize
  // requests only, and only when enabled. Restored from a reattached job and from a loaded case.
  const [stabilitySettings, setStabilitySettings] = useState(() => defaultStabilitySettings('DAY'));
  // A loaded case's stored stability block {stability, config, name, savedAt}: shown in Optimize mode
  // while no live result is on screen (the detector is not called). Cleared on a ticker / timeframe
  // change, another case and any new optimization run.
  const [storedStability, setStoredStability] = useState(null);
  // The request of the optimization job whose result is on screen (for the per-level Backtests and
  // Apply params of the Channels tab). null after a reattach (the job DTO does not echo the request).
  const optConfigRef = useRef(null);

  // State for date range
  const [startDate, setStartDate] = useState(new Date(2023, 0, 1));
  // Decision 0.18: default end = the exchange's today (US default ticker), not the browser's.
  const [endDate, setEndDate] = useState(() => exchangeTodayLocalDate());

  // Trade start (screener tradeStart): positions open only from this day, the bars before it are
  // warm-up. Until the user sets it (tradeStartTouched) it follows startDate and is not sent at
  // all; once set, a date-range change that leaves it outside [startDate, endDate] clamps it to
  // the nearest bound, with tradeStartHint saying so.
  const [tradeStart, setTradeStart] = useState(null);
  const [tradeStartTouched, setTradeStartTouched] = useState(false);
  const [tradeStartHint, setTradeStartHint] = useState(null);
  // Latest dates for the clamp, written by the handlers as they run: the quick-range buttons call
  // the start and the end handler in one event, so state read there would still be stale.
  const datesRef = useRef(null);
  if (datesRef.current === null) {
    datesRef.current = { start: startDate, end: endDate, tradeStart: null, touched: false };
  }
  const effectiveTradeStart = tradeStartTouched && tradeStart ? tradeStart : startDate;
  
  // State for mode, loading and results
  const [mode, setMode] = useState('backtest'); // 'backtest' | 'optimize' | 'signals'
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // ---- Signals mode (screener TASK_position_dependable_and_signals_tab.md §2.5) ----
  // Its own result (adaptSignalCharts of POST /signal-charts), never mixed with `results`. Cleared
  // whenever the form changes (ticker, timeframe, dates, strategies, params, long-only, a loaded
  // case) and on a mode switch. signalSeq numbers the requests: a response is dropped if the form
  // was changed (or another request started) while it was in flight, and it keys the view, so a
  // new response starts at the full date range.
  const [signalCharts, setSignalCharts] = useState(null);
  const signalSeq = useRef(0);
  const clearSignalCharts = () => {
    signalSeq.current += 1;
    setSignalCharts(null);
  };

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
  const optSyncForm = useRef(false);                    // reattach: copy ticker/timeFrame from the first job poll
  const optActive = optPolling && !optLost;
  // Kind of the attached job ('OPTIMIZE' | 'SCREENING'; null until the first poll of a 409 attach).
  // The ref mirrors it for the poll loop's closures.
  const [jobKind, setJobKindState] = useState(null);
  const jobKindRef = useRef(null);
  const setJobKind = (k) => { jobKindRef.current = k; setJobKindState(k); };
  const jobLostMessage = () => (jobKindRef.current === 'SCREENING' ? SCREENING_JOB_LOST_MESSAGE : OPT_JOB_LOST_MESSAGE);

  // ---- Parameter screening + profiles (screener BA-021, architect.md rev 3 §1.2 / §5) ----
  // Screening settings of the Optimize form (own objective, default CALMAR). Restored on reattach.
  const [screeningSettings, setScreeningSettings] = useState(defaultScreeningSettings);
  // The Sensitivity view on screen: {result, jobId, profile, lookupKey}; jobId null = a stored profile.
  // Shown in Optimize mode instead of the optimize result.
  const [screeningView, setScreeningView] = useState(null);
  // Where each strategy's min / max / step came from: 'default' (added from available-strategies),
  // 'edited', 'case' (a saved case / watch / job config), 'profile' (applied), 'screening' (Apply of a
  // live screening). Auto-apply of a profile happens only when every strategy is 'default'.
  const [rangeOrigin, setRangeOrigin] = useState({});
  // Last profile lookup {lookupKey, profile|null}; profileVersion re-runs the lookup (save / delete).
  const [profileState, setProfileState] = useState(null);
  const [profileVersion, setProfileVersion] = useState(0);
  // The profile applied to the form {lookupKey, profile, missing}.
  const [appliedProfile, setAppliedProfile] = useState(null);
  // lookupKey whose auto-apply was declined by "Revert to defaults".
  const suppressAutoApply = useRef(null);

  // ---- Saved cases (screener TASK_saved_optimization_cases.md §3.3-3.5) ----
  // Bumped after every save / delete; SavedCasesPanel refetches when it changes.
  const [casesVersion, setCasesVersion] = useState(0);
  const bumpCasesVersion = () => setCasesVersion((v) => v + 1);
  const [caseWarnings, setCaseWarnings] = useState(null); // reconcile warnings of the last loaded case
  // Bumped on every run start (backtest and optimize). SavedCasesPanel ignores a Load response if
  // a run started while it was pending, even when that run has already finished.
  const [runStarts, setRunStarts] = useState(0);
  // Config of the backtest whose results are on screen (the form can drift from it: the date
  // pickers do not clear results). Recorded at submit; read by SaveCaseControl at save time.
  const backtestConfigRef = useRef(null);
  const backtestRunSeq = useRef(0); // remount key of SaveCaseControl per backtest run

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

  // Channel tree layer of the result chart (screener TASK_incremental_channels rev 2): only for a
  // result whose config contains a channel strategy, built from the first one; A by default, B by
  // the toggle. The source is the backend's channelSource, else the request of the result (the
  // recorded backtest config / optimize job request with the best values).
  const [channelLayerOn, setChannelLayerOn] = useState(true);
  const [channelLayerView, setChannelLayerView] = useState(CHANNEL_VIEW.FULL);
  const channelSource = useMemo(() => {
    if (!results || mode === 'signals') return null;
    const cfg = mode === 'optimize' ? optConfigRef.current : backtestConfigRef.current;
    return resolveChannelSource(results, cfg);
    // The refs are set together with `results` (they are not render state)
  }, [results, mode]);
  const channelLayer = useStrategyChannelLayer(channelSource, { enabled: channelLayerOn, view: channelLayerView });

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

  // Sets the trade start state (and datesRef) in one go; touched false = follow startDate.
  // Only state setters and a ref: safe to call from the poll loop.
  const applyTradeStart = (date, touched) => {
    datesRef.current.tradeStart = touched ? date : null;
    datesRef.current.touched = touched;
    setTradeStart(touched ? date : null);
    setTradeStartTouched(touched);
    setTradeStartHint(null);
  };

  // Shows a job right away and starts polling it. `initial` is either a placeholder (just started:
  // the first poll asks logSince=0 for all retained lines) or a full job JSON fetched with
  // logSince=0 (reattach on mount: its log is taken as is).
  // syncForm (reattach on mount / 409): set the form's ticker and timeFrame from the job, so the
  // form and the Trades export reflect the job's run. The strategy list is not restored (the job
  // DTO does not echo the request). Applied by the first poll (made right away), which also covers
  // the 409 placeholder that carries no ticker yet.
  const attachOptimizationJob = (initial, { notice = null, syncForm = false } = {}) => {
    optAttached.current = true;
    setJobKind(initial.kind || null);
    optSyncForm.current = syncForm;
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
        attachOptimizationJob(job, { syncForm: true });
      })
      .catch((err) => console.error('Failed to fetch current optimization job:', err));
    return () => { cancelled = true; };
    // Runs once on mount; attachOptimizationJob only uses state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the job every second while it runs. Polls never overlap; the loop stops on a terminal
  // status, on a lost job (404) and on unmount. Each poll asks for the log lines after the last
  // seq seen and appends them.
  useEffect(() => {
    if (!optJobId || !optPolling) return undefined;
    let cancelled = false;

    // Terminal status: fetch and show the result (DONE, or CANCELLED with a best-so-far result).
    const finish = async (job) => {
      if (job.kind === 'SCREENING') {
        try {
          if (job.status === 'DONE' || (job.status === 'CANCELLED' && job.hasResult)) {
            const result = await fetchScreeningResult(job.jobId);
            if (cancelled) return;
            setResults(null);
            setScreeningView({ result, jobId: job.jobId, profile: null, lookupKey: null });
            setError(null);
          } else if (job.status === 'CANCELLED') {
            setScreeningView(null);
            setError('Screening stopped before any sample finished');
          } else {
            setScreeningView(null);
            setError('Screening failed: ' + (job.error || 'unknown error'));
          }
        } catch (err) {
          if (cancelled) return;
          setScreeningView(null);
          setError('Screening failed: ' + err.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
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
        if (job.kind && job.kind !== jobKindRef.current) setJobKind(job.kind);
        if (optSyncForm.current && job.ticker && job.kind === 'SCREENING') {
          // Reattach to a screening job: the form follows its ticker / timeframe and the screening
          // settings follow its request echo. The Optimize objective and stability section are kept.
          optSyncForm.current = false;
          setTicker(job.ticker);
          if (job.screening) setScreeningSettings((prev) => screeningSettingsFromRequest(job.screening, prev));
          if (job.timeFrame) {
            setTimeFrame(job.timeFrame);
            setSelectedStrategies((prev) => withTimeframe(prev, job.timeFrame));
          }
        } else if (optSyncForm.current && job.ticker) {
          // Reattach: the form follows the job. Results are not cleared here (unlike
          // handleTimeFrameChange): finish() below may set them in this same tick.
          optSyncForm.current = false;
          setTicker(job.ticker);
          if (job.objective) setObjective(normalizeObjective(job.objective));
          // The job's channel-stability request (absent on an older backend / when off)
          {
            const restored = settingsFromRequest(job.channelStability, job.timeFrame || 'DAY');
            setStabilitySettings((prev) => restored || { ...prev, enabled: false });
          }
          if (job.timeFrame) {
            setTimeFrame(job.timeFrame);
            setSelectedStrategies((prev) => withTimeframe(prev, job.timeFrame));
          }
          // The job's trade start (null = traded from its start date). The job does not echo its
          // date range, so a restored day outside the form's range is clamped (with the hint).
          const jobTradeStart = job.tradeStart ? localDateFromIso(job.tradeStart) : null;
          if (jobTradeStart && !Number.isNaN(jobTradeStart.getTime())) {
            applyTradeStart(jobTradeStart, true);
            clampTradeStart();
          } else {
            applyTradeStart(null, false);
          }
        }
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
          setError(jobLostMessage());
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
        setError(jobLostMessage());
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
    setStoredStability(null);
    setScreeningView(null);
    optConfigRef.current = null;
    try {
      const res = await startOptimization(config);
      if (res.conflict) {
        if (!res.jobId) throw new Error(res.error || 'An optimization is already running');
        // Another job (its request is not ours): optConfigRef stays null. The slot is shared with
        // screening jobs: the backend message says which kind runs and for how long.
        attachOptimizationJob({ jobId: res.jobId, status: 'RUNNING' },
          { notice: res.error ? `${res.error} — showing its progress` : OPT_CONFLICT_NOTICE, syncForm: true });
      } else {
        optConfigRef.current = config;
        attachOptimizationJob({ jobId: res.jobId, status: 'QUEUED', total: res.total, done: 0, percent: 0, kind: 'OPTIMIZE' });
      }
    } catch (err) {
      setResults(null);
      setError('Optimization failed: ' + err.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
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
    // tradeStart is sent only when the user set a day other than the start date, so a default
    // request (and a case saved from it) is exactly the pre-feature one. A watch run (deep link,
    // Backtest / Signals) always sends the watch's trade start, even when it equals the start
    // date: a seeded position requires one (400 INITIAL_POSITION_REQUIRES_TRADE_START otherwise).
    const watchRun = !!watchContext && mode !== 'optimize';
    const requestTradeStart = tradeStartTouched && tradeStart
      && (watchRun || calendarDayKey(tradeStart) !== calendarDayKey(startDate)) ? tradeStart : null;
    // Never in Optimize (400 INITIAL_POSITION_NOT_SUPPORTED_IN_OPTIMIZE).
    const requestInitialPosition = watchRun ? (watchContext.initialPosition || null) : null;
    if (requestTradeStart && (calendarDayKey(requestTradeStart) < calendarDayKey(startDate)
      || calendarDayKey(requestTradeStart) > calendarDayKey(endDate))) {
      setResults(null);
      setError('Trade start must be inside the date range');
      return;
    }
    const stabilityError = mode === 'optimize' ? stabilityValidationError(stabilitySettings, timeFrame) : null;
    if (stabilityError) {
      setResults(null);
      setError(stabilityError);
      return;
    }
    setLoading(true);
    setError(null);
    setRunStarts((n) => n + 1);

    const config = formatStrategyConfig(
      ticker, timeFrame, startDate, endDate, selectedStrategies, longOnly, requestTradeStart,
      requestInitialPosition, mode === 'optimize' ? objective : null,
      mode === 'optimize' ? stabilityRequest(stabilitySettings) : null,
      mode === 'optimize' ? appliedProfileRef : null
    );
    if (mode === 'signals') {
      clearSignalCharts();
      const seq = signalSeq.current;
      try {
        const raw = await fetchSignalCharts(config);
        if (seq !== signalSeq.current) return; // the form changed meanwhile
        setSignalCharts({ seq, charts: adaptSignalCharts(raw) });
      } catch (err) {
        if (seq !== signalSeq.current) return;
        setSignalCharts(null);
        setError('Signals failed: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (mode === 'optimize') {
      // Async job: `loading` stays true until the poll loop sees a terminal status.
      await runOptimization(config);
      return;
    }

    try {
      const result = await submitStrategies(config);
      // Record the config only together with its results: while this run is in flight the
      // previous results (and their Save) stay on screen and must keep saving the previous config.
      backtestConfigRef.current = config;
      backtestRunSeq.current += 1;
      setResults(result);
    } catch (err) {
      backtestConfigRef.current = null;
      setResults(null);
      setError('Backtest failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // "Screen parameters" (Optimize mode): an async screening job on the form's config. Same client
  // checks as Optimize; the channels come from the stability section when it is enabled (otherwise
  // the backend uses strategy TF + detector defaults). The screening objective is its own field.
  const handleScreen = async () => {
    if (loading || optActive) return;
    const fail = (msg) => { setScreeningView(null); setError(msg); };
    if (!ticker || !ticker.trim()) { fail('Ticker is required'); return; }
    if (calendarDayKey(startDate) > calendarDayKey(endDate)) { fail('Start date must be on or before end date'); return; }
    const requestTradeStart = tradeStartTouched && tradeStart
      && calendarDayKey(tradeStart) !== calendarDayKey(startDate) ? tradeStart : null;
    if (requestTradeStart && (calendarDayKey(requestTradeStart) < calendarDayKey(startDate)
      || calendarDayKey(requestTradeStart) > calendarDayKey(endDate))) {
      fail('Trade start must be inside the date range');
      return;
    }
    const stabilityError = stabilityValidationError(stabilitySettings, timeFrame);
    if (stabilityError) { fail(stabilityError); return; }
    const settingsError = screeningValidationError(screeningSettings);
    if (settingsError) { fail(settingsError); return; }

    const config = formatStrategyConfig(
      ticker, timeFrame, startDate, endDate, selectedStrategies, longOnly, requestTradeStart
    );
    const req = screeningRequest(config, stabilityRequest(stabilitySettings), screeningSettings);
    setLoading(true);
    setError(null);
    setRunStarts((n) => n + 1);
    setResults(null);
    setScreeningView(null);
    setStoredStability(null);
    setOptJob(null);
    setOptJobId(null);
    setOptLog([]);
    setOptBanner(null);
    setOptNotice(null);
    setOptLost(false);
    optConfigRef.current = null;
    try {
      const res = await startScreening(req);
      if (res.conflict) {
        if (!res.jobId) throw new Error(res.error || 'A job is already running');
        attachOptimizationJob({ jobId: res.jobId, status: 'RUNNING' },
          { notice: `${res.error || 'A job is already running'} — showing its progress`, syncForm: true });
      } else {
        attachOptimizationJob({ jobId: res.jobId, status: 'QUEUED', total: res.total, done: 0, percent: 0, kind: 'SCREENING' });
      }
    } catch (err) {
      setError('Screening failed: ' + err.message);
      setLoading(false);
    }
  };

  // Clamps a user-set trade start into [start, end] (datesRef: the values just set), with a hint.
  const clampTradeStart = () => {
    const dates = datesRef.current;
    if (!dates.touched || !dates.tradeStart) return;
    let next = dates.tradeStart;
    if (calendarDayKey(next) < calendarDayKey(dates.start)) next = dates.start;
    else if (calendarDayKey(next) > calendarDayKey(dates.end)) next = dates.end;
    if (next === dates.tradeStart) return;
    dates.tradeStart = next;
    setTradeStart(next);
    setTradeStartHint(`Trade start moved to ${toLocalIsoDate(next)} to stay inside the date range`);
  };

  const handleStartDateChange = (d) => {
    markWatchEdited();
    datesRef.current.start = d;
    setStartDate(d);
    clearSignalCharts();
    clampTradeStart();
  };

  const handleEndDateChange = (d) => {
    markWatchEdited();
    datesRef.current.end = d;
    setEndDate(d);
    clearSignalCharts();
    clampTradeStart();
  };

  // A trade start change clears the results like any other form field.
  const handleTradeStartChange = (d) => {
    markWatchEdited();
    applyTradeStart(d, true);
    setResults(null);
    clearSignalCharts();
    clampTradeStart(); // a typed day can bypass the input's min / max
  };

  const handleTradeStartReset = () => {
    const changed = datesRef.current.touched;
    if (changed) markWatchEdited();
    applyTradeStart(null, false);
    if (changed) {
      setResults(null);
      clearSignalCharts();
    }
  };

  const handleTimeFrameChange = (tf) => {
    setWatchContext(null); // another timeframe is not the watch's run
    setTimeFrame(tf);
    setResults(null);
    setStoredStability(null);
    // The channel timeframe must not be coarser than the strategy's: follow a finer strategy TF.
    setStabilitySettings((s) => (isCoarserTimeFrame(s.channelTimeFrame, tf) ? { ...s, channelTimeFrame: tf } : s));
    clearSignalCharts();
    setSelectedStrategies(prev => withTimeframe(prev, tf));
  };

  // Add strategy to selected strategies
  const handleAddStrategy = (strategy) => {
    markWatchEdited();
    setResults(null);
    clearSignalCharts();
    setRangeOrigin((prev) => ({ ...prev, [strategy.name]: 'default' }));
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
    markWatchEdited();
    setResults(null);
    clearSignalCharts();
    setSelectedStrategies(prev => {
      const newStrategies = { ...prev };
      delete newStrategies[strategyName];
      return newStrategies;
    });
    setRangeOrigin((prev) => {
      const next = { ...prev };
      delete next[strategyName];
      return next;
    });
  };

  // field: 'value' | 'min' | 'max' | 'step' | 'timeframe'
  const handleUpdateParam = (strategyName, paramName, field, value) => {
    markWatchEdited();
    if (field === 'min' || field === 'max' || field === 'step') {
      setRangeOrigin((prev) => ({ ...prev, [strategyName]: 'edited' }));
    }
    setResults(null);
    clearSignalCharts();
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

  // Puts a StrategiesConfigDTO into the form (a saved case, or a watch's run). `fallback` fills
  // fields the config lacks (the case summary's ticker / timeframe / dates). forceTradeStart: keep
  // the config's trade start as a user-set one even when it equals the start date (a watch run
  // always sends it). Results and signal charts are cleared.
  // keepStability: leave the channel-stability section as it is (Apply params); otherwise it follows
  // cfg.channelStability (off when the config has none).
  const applyConfig = (cfg, { fallback = {}, forceTradeStart = false, keepStability = false } = {}) => {
    const tf = cfg.timeFrame || fallback.timeframe || timeFrame;
    if (!keepStability) {
      const restored = settingsFromRequest(cfg.channelStability, tf);
      setStabilitySettings((prev) => restored
        || { ...prev, enabled: false, channelTimeFrame: isCoarserTimeFrame(prev.channelTimeFrame, tf) ? tf : prev.channelTimeFrame });
    }
    setTicker(cfg.ticker || fallback.ticker || ticker);
    setTimeFrame(tf);
    setLongOnly(!!cfg.longOnly);
    const start = localDateFromIso(cfg.startDate ?? fallback.startDate);
    const end = localDateFromIso(cfg.endDate ?? fallback.endDate);
    if (!Number.isNaN(start.getTime())) {
      setStartDate(start);
      datesRef.current.start = start;
    }
    if (!Number.isNaN(end.getTime())) {
      setEndDate(end);
      datesRef.current.end = end;
    }
    // Saved trade start: null (older case, or saved without one) = trade from the start date.
    const caseTradeStart = cfg.tradeStart ? localDateFromIso(cfg.tradeStart) : null;
    if (caseTradeStart && !Number.isNaN(caseTradeStart.getTime())
      && (forceTradeStart || calendarDayKey(caseTradeStart) !== calendarDayKey(datesRef.current.start))) {
      applyTradeStart(caseTradeStart, true);
      clampTradeStart();
    } else {
      applyTradeStart(null, false);
    }
    setSelectedStrategies(withTimeframe(cfg.strategyNameToParams || {}, tf));
    // A loaded case / watch / job config is never silently replaced by a profile (§5.1)
    setRangeOrigin(Object.fromEntries(Object.keys(cfg.strategyNameToParams || {}).map((n) => [n, 'case'])));
    setAppliedProfile(null);
    setResults(null);
    clearSignalCharts();
    setError(null);
  };

  // Load a saved case (StrategyCaseDTO) into the form. The mode is kept; the stored objective is
  // applied (Long PnL when the case has none). Reconcile warnings are shown above the form.
  const handleLoadCase = (savedCase) => {
    applyConfig(savedCase?.config || {}, { fallback: savedCase || {} });
    setObjective(normalizeObjective(savedCase?.config?.objectiveFunction ?? savedCase?.objective));
    setWatchContext(null);
    setCaseWarnings(Array.isArray(savedCase.warnings) && savedCase.warnings.length > 0 ? savedCase.warnings : null);
    // A case saved from an optimize job with channel stability carries the stored snapshot + results
    setStoredStability(savedCase?.channelStability
      ? { stability: savedCase.channelStability, config: savedCase.config || null, name: savedCase.name || null, savedAt: savedCase.savedAt || null }
      : null);
  };

  // Request of the result on screen, for the Channels tab: the recorded job request, else (reattach)
  // rebuilt from the snapshot (the job's dates) and the form's strategies.
  const stabilityBaseConfig = (() => {
    if (mode !== 'optimize' || !results?.channelStability) return null;
    if (optConfigRef.current) return optConfigRef.current;
    const snap = results.channelStability.snapshot || {};
    const cfg = {
      ticker: results.ticker || ticker,
      timeFrame: snap.strategyTimeFrame || timeFrame,
      startDate: snap.startDate,
      endDate: snap.endDate,
      strategyNameToParams: selectedStrategies,
      longOnly: results.longOnly === true,
    };
    if (snap.tradeStart) cfg.tradeStart = snap.tradeStart;
    return cfg;
  })();

  // "Apply params" of a chain level: the job's request with the level's Fit-best values into the form,
  // Backtest mode (results cleared by applyConfig; ranges min / max / step kept).
  const applyStabilityParams = (baseConfig, params) => {
    if (!baseConfig) return;
    applyConfig({ ...baseConfig, strategyNameToParams: withParamValues(baseConfig.strategyNameToParams, params) },
      { keepStability: true });
    setWatchContext(null);
    setMode('backtest');
  };

  // Stored case: "Re-detect on current data" = a new optimize job with the case's config (new
  // snapshot, new result; saving follows the existing name / 409 rules).
  const handleRedetect = async () => {
    if (!storedStability?.config || loading || optActive) return;
    const caseCfg = storedStability.config;
    const snap = storedStability.stability?.snapshot || {};
    const channelStability = caseCfg.channelStability
      || (snap.channelTimeFrame ? { channelTimeFrame: snap.channelTimeFrame, detectorParams: snap.detectorParams || null } : null);
    // eslint-disable-next-line no-unused-vars
    const { initialPosition, ...rest } = caseCfg;
    const config = { ...rest, ...(channelStability ? { channelStability } : {}) };
    setMode('optimize');
    setLoading(true);
    setError(null);
    setRunStarts((n) => n + 1);
    await runOptimization(config);
  };

  // Watchlist deep link (architect.md "Signal watch" §3.8, §6.2): the watch's own config comes
  // from the server whole (snapshot params, startDate, endDate = now, tradeStart, longOnly,
  // initialPosition) - nothing is recomputed here (E1). Opens Backtest, fills the form, runs it
  // once and focuses the signal's bar.
  const openWatchInBacktest = async (watchId, signalId = null) => {
    setWatchLinkError(null);
    if (loading || optActive) {
      setWatchLinkError('A run is in progress in the Strategy Backtester — wait for it to finish, then open the watch again.');
      return;
    }
    setWatchLinkBusy(true);
    try {
      const dto = await getWatchBacktestConfig(watchId, signalId);
      const cfg = dto?.config || {};
      setActiveTab('backtest');
      setMode('backtest');
      applyConfig(cfg, { forceTradeStart: true });
      setCaseWarnings(null);
      setWatchContext({
        watchId,
        watchName: dto?.watchName || `#${watchId}`,
        mode: dto?.mode || null,
        initialPosition: cfg.initialPosition || null,
        focusBarDate: dto?.focusBarDate || null,
        tradeStart: cfg.tradeStart || null,
        linkedAt: dto?.linkedAt || null,
        edited: false,
      });
      pendingAutoRun.current = true;
      setAutoRunTick((t) => t + 1);
    } catch (err) {
      setWatchLinkError(err.status === 404 && !err.code
        ? 'The watch or its signal no longer exists (or the backend has no watch API).'
        : `Could not open the watch in Backtest: ${describeError(err)}`);
    } finally {
      setWatchLinkBusy(false);
    }
  };

  // Screener → Backtest (after "Prepare for strategies" when needed): the Backtest form with the
  // ticker on DAY (universe tickers have DAY history only); the strategy setup stays as it is and
  // nothing runs by itself.
  const openScreenerTickerInBacktest = (t) => {
    if (loading || optActive) {
      setActiveTab('backtest');
      return; // a run is in flight: do not swap the ticker under it
    }
    setActiveTab('backtest');
    setMode('backtest');
    setTicker(t);
    if (timeFrame !== 'DAY') handleTimeFrameChange('DAY');
    setWatchContext(null);
    setResults(null);
    setStoredStability(null);
    setError(null);
    clearSignalCharts();
  };

  // Deep link auto-run: once the form state set by openWatchInBacktest has rendered.
  useEffect(() => {
    if (!pendingAutoRun.current) return;
    pendingAutoRun.current = false;
    handleSubmit();
    // handleSubmit of this render holds the form just applied; only a new deep link re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunTick]);

  // Toast click: open the Watchlist and mark the notification read.
  const handleOpenToast = (n) => {
    watchNotifications.dismiss(n.id);
    setActiveTab('watchlist');
    markNotificationRead(n.id).catch(() => {}).finally(() => watchNotifications.refresh());
  };

  const clearWatchPosition = () => {
    setWatchContext((c) => (c ? { ...c, initialPosition: null, edited: true } : c));
    setResults(null);
    clearSignalCharts();
  };

  // ---- Parameter profile of the current key (BA-021 §5.1) ----
  const strategyKey = useMemo(() => profileKey(selectedStrategies), [selectedStrategies]);
  const lookupKey = mode === 'optimize' && strategyKey && ticker && ticker.trim()
    ? `${ticker.trim()}|${strategyKey}|${timeFrame}` : null;

  // Lookup, debounced: Optimize mode only; 404 → no banner. A failed lookup is logged, not shown.
  useEffect(() => {
    if (!lookupKey) return undefined;
    let cancelled = false;
    const id = setTimeout(() => {
      const [t, k, tf] = lookupKey.split('|');
      getProfileByKey({ ticker: t, strategyKey: k, timeframe: tf })
        .then((profile) => { if (!cancelled) setProfileState({ lookupKey, profile }); })
        .catch((err) => {
          console.error('Failed to fetch the parameter profile:', err);
          if (!cancelled) setProfileState({ lookupKey, profile: null });
        });
    }, PROFILE_LOOKUP_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [lookupKey, profileVersion]);

  const currentProfile = profileState && profileState.lookupKey === lookupKey ? profileState.profile : null;
  const appliedValid = !!(appliedProfile && currentProfile && appliedProfile.lookupKey === lookupKey
    && appliedProfile.profile.id === currentProfile.id && appliedProfile.profile.version === currentProfile.version);
  const profileBannerState = !currentProfile ? null
    : appliedValid
      ? (formMatchesSearchSpace(selectedStrategies, currentProfile.searchSpace) ? 'applied' : 'edited')
      : 'available';
  const currentProfilePeriod = currentProfile ? profileProvenance(currentProfile).period : null;
  // Sent with Optimize requests only together with channelStability (formatStrategyConfig).
  const appliedProfileRef = appliedValid && stabilitySettings.enabled
    ? { profileId: currentProfile.id, version: currentProfile.version, fitEnd: currentProfilePeriod?.fitEnd ?? null }
    : null;
  const formProfileChips = useMemo(
    () => (appliedValid ? profileChips(selectedStrategies, currentProfile.searchSpace) : null),
    [appliedValid, selectedStrategies, currentProfile]
  );
  const stabilityProfileBadge = appliedValid && stabilitySettings.enabled
    ? provisionalClean({
      startDay: toLocalIsoDate(startDate),
      endDay: toLocalIsoDate(endDate),
      tradeStartDay: tradeStartTouched && tradeStart ? toLocalIsoDate(tradeStart) : null,
      channelTimeFrame: stabilitySettings.channelTimeFrame,
    }, currentProfilePeriod)
    : null;

  // Applies a profile's search space to the form: min / max / step only (Q3), Optimize mode.
  const applyProfile = (profile) => {
    if (!profile || !lookupKey) return;
    const { next, missing } = searchSpaceToForm(selectedStrategies, profile.searchSpace);
    setSelectedStrategies(next);
    setRangeOrigin(Object.fromEntries(Object.keys(next).map((n) => [n, 'profile'])));
    setAppliedProfile({ lookupKey, profile, missing });
    suppressAutoApply.current = null;
    markWatchEdited();
    setResults(null);
    clearSignalCharts();
  };

  // Auto-apply when every strategy of the form still holds its untouched default ranges.
  useEffect(() => {
    if (!currentProfile || !lookupKey || appliedValid) return;
    if (suppressAutoApply.current === lookupKey) return;
    const names = Object.keys(selectedStrategies);
    if (names.length === 0 || !names.every((n) => rangeOrigin[n] === 'default')) return;
    applyProfile(currentProfile);
    // applyProfile only reads the state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile, lookupKey, appliedValid, rangeOrigin, selectedStrategies]);

  const revertProfile = () => {
    setSelectedStrategies((prev) => withDefaultRanges(prev, availableStrategies));
    setRangeOrigin(Object.fromEntries(Object.keys(selectedStrategies).map((n) => [n, 'default'])));
    setAppliedProfile(null);
    suppressAutoApply.current = lookupKey;
    markWatchEdited();
    setResults(null);
    clearSignalCharts();
  };

  const removeProfile = async () => {
    if (!lookupKey) return;
    const [t, k, tf] = lookupKey.split('|');
    await deleteProfile({ ticker: t, strategyKey: k, timeframe: tf });
    setAppliedProfile(null);
    setScreeningView((v) => (v?.profile ? null : v));
    setProfileVersion((n) => n + 1);
  };

  const viewProfile = () => {
    if (!currentProfile?.result) return;
    setScreeningView({ result: currentProfile.result, jobId: null, profile: currentProfile, lookupKey });
  };

  // "Apply to Optimize form" of the Sensitivity view. A stored profile that is the current one is
  // applied as the profile (banner "applied"); a live screening fills the ranges only.
  const applyScreeningSearchSpace = (searchSpace) => {
    const sv = screeningView;
    if (sv?.profile && currentProfile && sv.profile.id === currentProfile.id && sv.profile.version === currentProfile.version) {
      applyProfile(currentProfile);
      return;
    }
    const { next } = searchSpaceToForm(selectedStrategies, searchSpace);
    setSelectedStrategies(next);
    setRangeOrigin(Object.fromEntries(Object.keys(next).map((n) => [n, 'screening'])));
    setAppliedProfile(null);
    markWatchEdited();
    setResults(null);
    clearSignalCharts();
  };

  // "Apply as Backtest values" of a top sample: values only (ranges kept), Backtest mode.
  const applyBacktestValues = (params) => {
    setSelectedStrategies((prev) => withParamValues(prev, params));
    setWatchContext(null);
    setMode('backtest');
    setResults(null);
    clearSignalCharts();
  };

  const screeningActive = optActive && jobKind === 'SCREENING';
  const screeningBatch = screeningActive
    ? batchInfo(optJob?.total, effectivePlan(screeningSettings, optJob?.timeFrame || timeFrame))
    : null;
  const formGrid = useMemo(() => formGridSize(selectedStrategies), [selectedStrategies]);
  const formTunable = useMemo(() => tunableCount(selectedStrategies), [selectedStrategies]);
  // A stored-profile view belongs to its key; a live screening result stays until the next run.
  const showScreeningView = mode === 'optimize' && !!screeningView
    && (!screeningView.profile || screeningView.lookupKey === lookupKey);

  const showOptPanel = mode === 'optimize' && !!optJob;
  // Trading window line and warnings of the result on screen (absent from an older backend).
  const resultPrices = results?.chartDataDTO?.prices || [];
  const resultWarnings = Array.isArray(results?.warnings)
    ? results.warnings.filter((w) => typeof w === 'string' && w.length > 0)
    : [];
  // Next-bar trigger lines of the merged estimate for the main chart (null: older backend,
  // Optimize results - the chart then draws exactly as before)
  const resultTriggers = useMemo(
    () => chartTriggers(adaptNextTriggers(results?.nextTriggers)),
    [results]
  );
  // Save is offered whenever results are on screen: optimize mode needs the job with a result,
  // backtest mode the recorded config of the run.
  const canSaveCase = mode === 'optimize'
    ? !!optJobId && !!optJob?.hasResult
    : !!backtestConfigRef.current;

  const renderMain = () => {
    switch (activeTab) {
      case 'channels':
        return (
          <main className="flex-grow w-full px-4 py-8">
            <ChannelExplorer initialRequest={channelsRequest} onInitialRequestConsumed={consumeChannelsRequest} />
          </main>
        );
      case 'screener':
        return (
          <main className="flex-grow w-full px-4 py-8">
            <ScreenerPanel
              onOpenInChannels={openInChannels}
              onOpenInBacktest={openScreenerTickerInBacktest}
              onSeenRuns={markScreenerSeen}
              latestRunId={screenerLatest.latestRunId}
            />
          </main>
        );
      case 'downloader':
        return (
          <main className="flex-grow w-full px-4 py-8">
            <DownloaderPanel />
          </main>
        );
      case 'watchlist':
        return (
          <main className="flex-grow w-full px-4 py-8">
            {watchLinkError && (
              <div className="form-error mb-4" role="alert" data-testid="watch-link-error">{watchLinkError}</div>
            )}
            {watchLinkBusy && <p className="mb-4 text-sm text-gray-500">Opening the watch in Backtest…</p>}
            <WatchlistPanel
              onOpenInBacktest={openWatchInBacktest}
              latestNotificationId={watchNotifications.latestId}
              onNotificationsChanged={watchNotifications.refresh}
            />
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
            {/* Saved cases: load a stored configuration into the form, or delete one */}
            <SavedCasesPanel
              ticker={ticker}
              casesVersion={casesVersion}
              onChanged={bumpCasesVersion}
              onLoad={handleLoadCase}
              disabled={loading}
              runStarts={runStarts}
              onOpenWatchlist={() => setActiveTab('watchlist')}
            />

            {/* Watch run banner (deep link from the Watchlist) */}
            {watchContext && (
              <div className="mb-6 p-3 rounded bg-blue-50 border border-blue-300 text-blue-900 text-sm" role="status" data-testid="watch-banner">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">Watch run «{watchContext.watchName}»</span>
                    {watchContext.mode && <> · {modeLabel(watchContext.mode)}</>}
                    {watchContext.initialPosition ? (
                      <div data-testid="watch-banner-position">
                        Seeded position: LONG from {fmtDay(watchContext.initialPosition.entryDate)} at{' '}
                        {fmtPrice(watchContext.initialPosition.entryPrice)}
                      </div>
                    ) : (
                      <div>Starts flat{watchContext.tradeStart ? ` · trading from ${fmtDay(watchContext.tradeStart)}` : ''}</div>
                    )}
                    {watchContext.edited && (
                      <div className="mt-1 text-amber-800" data-testid="watch-banner-edited">
                        Edited — the run may not match the watch.
                      </div>
                    )}
                    {mode === 'optimize' && watchContext.initialPosition && (
                      <div className="mt-1 text-amber-800">The seeded position is not used in Optimize.</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setWatchContext(null)}
                    className="text-blue-700 hover:text-blue-900 leading-none"
                    aria-label="Close the watch run"
                    title="Close (keeps the form)"
                    data-testid="watch-banner-close"
                  >
                    ✕
                  </button>
                </div>
                {watchContext.initialPosition && (
                  <button
                    type="button"
                    onClick={clearWatchPosition}
                    className="mt-2 py-0.5 px-2 text-xs border border-blue-600 text-blue-700 rounded bg-white hover:bg-blue-100"
                    data-testid="watch-banner-clear-position"
                  >
                    Clear position
                  </button>
                )}
              </div>
            )}

            {caseWarnings && (
              <div className="mb-6 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    {caseWarnings.every(isChannelSemanticsWarning)
                      ? 'The saved case was computed with the old channel semantics:'
                      : caseWarnings.some(isChannelSemanticsWarning)
                        ? 'The saved case was adjusted to the current strategies and channel semantics:'
                        : 'The saved case was adjusted to the current strategies:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCaseWarnings(null)}
                    className="text-amber-700 hover:text-amber-900 leading-none"
                    aria-label="Dismiss"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
                <ul className="mt-1 list-disc pl-5">
                  {caseWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Mode Toggle */}
            <div className="mb-6">
              <div className="flex border-2 border-blue-600 rounded overflow-hidden">
                <button
                  type="button"
                  className={mode === 'backtest'
                    ? 'flex-1 py-2 text-sm font-semibold bg-blue-600 text-white'
                    : 'flex-1 py-2 text-sm font-medium bg-white text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-white'}
                  onClick={() => { setMode('backtest'); setResults(null); clearSignalCharts(); }}
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
                  onClick={() => { setMode('optimize'); setResults(null); clearSignalCharts(); }}
                >
                  Optimize
                </button>
                <button
                  type="button"
                  className={mode === 'signals'
                    ? 'flex-1 py-2 text-sm font-semibold bg-blue-600 text-white'
                    : 'flex-1 py-2 text-sm font-medium bg-white text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-white'}
                  onClick={() => { setMode('signals'); setResults(null); clearSignalCharts(); }}
                  disabled={optActive}
                  title={optActive
                    ? 'An optimization is running — stop it or wait for it to finish'
                    : 'Each strategy\'s own signals on its own chart, and the merged result'}
                  data-testid="mode-signals"
                >
                  Signals
                </button>
              </div>
              {mode === 'optimize' && (
                <p className="mt-1 text-xs text-gray-500">Set Min/Max/Step for each parameter to grid-search the best combination.</p>
              )}
              {mode === 'signals' && (
                <p className="mt-1 text-xs text-gray-500">One chart per strategy with its own signals, and the merged result below. No PnL.</p>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {/* Ticker and TimeFrame */}
              <div className="mb-6">
                <label htmlFor="ticker-input" className="block text-sm font-medium text-gray-700 mb-2">Ticker</label>
                <TickerCombobox
                  id="ticker-input"
                  value={ticker}
                  onChange={(val) => { setTicker(val); setWatchContext(null); setResults(null); setStoredStability(null); clearSignalCharts(); }}
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
                    onChange={(e) => { markWatchEdited(); setLongOnly(e.target.checked); setResults(null); clearSignalCharts(); }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Long only
                </label>
                <p className="mt-1 text-xs text-gray-500">Ignore short signals; only the long leg is evaluated.</p>
              </div>

              {/* Optimization objective (Optimize mode only; not sent otherwise) */}
              {mode === 'optimize' && (
                <div className="mb-6">
                  <label htmlFor="objective-select" className="block text-sm font-medium text-gray-700 mb-2">Optimize for</label>
                  <select
                    id="objective-select"
                    data-testid="objective-select"
                    value={objective}
                    onChange={(e) => { setObjective(e.target.value); setResults(null); }}
                    className="w-full p-2 border rounded"
                    title={selectedObjective?.description}
                  >
                    {OBJECTIVES.map((o) => (
                      <option key={o.value} value={o.value} title={o.description}>{o.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">{selectedObjective?.description}</p>
                </div>
              )}

              {/* Parameter stability by channel (Optimize mode only; not sent otherwise) */}
              {mode === 'optimize' && (
                <StabilitySettings
                  settings={stabilitySettings}
                  onChange={(next) => { setStabilitySettings(next); setResults(null); }}
                  strategyTimeFrame={timeFrame}
                  disabled={optActive}
                  profileBadge={stabilityProfileBadge}
                />
              )}

              {/* Parameter screening (Optimize mode only): its own job, its own objective */}
              {mode === 'optimize' && (
                <ScreeningSettings
                  settings={screeningSettings}
                  onChange={setScreeningSettings}
                  timeFrame={timeFrame}
                  grid={formGrid}
                  tunable={formTunable}
                  stability={stabilitySettings}
                  onRun={handleScreen}
                  disabled={loading || optActive}
                  activeJob={screeningActive ? optJob : null}
                />
              )}

              {/* Date Range Picker */}
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={handleStartDateChange}
                onEndDateChange={handleEndDateChange}
                zone={exchangeZoneForTicker(ticker)}
                tradeStart={effectiveTradeStart}
                onTradeStartChange={handleTradeStartChange}
                onTradeStartReset={handleTradeStartReset}
                tradeStartHint={tradeStartHint}
              />
              
              {/* Strategy Selector */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Strategies</h3>
                <StrategySelector
                  availableStrategies={availableStrategies}
                  onAddStrategy={handleAddStrategy}
                />
              </div>
              
              {/* Parameter profile of the key (Optimize mode only) */}
              {mode === 'optimize' && currentProfile && profileBannerState && (
                <ProfileBanner
                  profile={currentProfile}
                  state={profileBannerState}
                  missing={appliedValid ? appliedProfile.missing : []}
                  onApply={() => applyProfile(currentProfile)}
                  onRevert={revertProfile}
                  onDelete={removeProfile}
                  onView={currentProfile.result ? viewProfile : null}
                  busy={loading || optActive}
                />
              )}

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
                    profileChips={mode === 'optimize' ? formProfileChips : null}
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
                    ? (jobKind === 'SCREENING'
                      ? (optActive && Number.isFinite(optJob?.percent) ? `Screening… ${Math.floor(optJob.percent)} %` : 'Screening…')
                      : (optActive && Number.isFinite(optJob?.percent) ? `Optimizing… ${Math.floor(optJob.percent)} %` : 'Optimizing…'))
                    : 'Processing…')
                  : (mode === 'optimize' ? 'Run Optimization' : mode === 'signals' ? 'Show Signals' : 'Run Backtest')}
              </button>
              
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {error && isMinimalIndicatorsError(error) && ticker && (
                <PrepareStrategiesHint key={ticker} ticker={ticker.trim()} />
              )}
            </form>
          </div>
          
          {/* Results Panel */}
          <div className="min-w-0">
            {/* Optimize mode: live progress of the async job; after it ends, the collapsed run
                (final best card + log) stays above the result until the next run. */}
            {showOptPanel && (
              <div className={results || showScreeningView || (mode === 'optimize' && storedStability) ? 'mb-6' : ''}>
                <OptimizationProgress
                  job={optJob}
                  logLines={optLog}
                  logTruncated={optLogTruncated}
                  onStop={handleStopOptimization}
                  stopping={stopRequested}
                  warning={optWarning}
                  notice={optNotice}
                  lost={optLost}
                  batch={screeningBatch}
                />
              </div>
            )}
            {mode === 'signals' ? (
              signalCharts ? (
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-bold mb-4">
                    Signals for {signalCharts.charts.ticker || ticker}
                    {signalCharts.charts.timeFrame && (
                      <span className="text-base font-normal text-gray-500"> · {signalCharts.charts.timeFrame}</span>
                    )}
                  </h2>
                  <SignalChartsView key={signalCharts.seq} charts={signalCharts.charts} />
                </div>
              ) : (
                <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64">
                  <p className="text-gray-500">
                    {loading ? 'Processing your request...' : 'Configure strategies and press Show Signals'}
                  </p>
                </div>
              )
            ) : showScreeningView ? (
              <SensitivityView
                key={screeningView.jobId ? `job-${screeningView.jobId}` : `profile-${screeningView.profile?.id}-${screeningView.profile?.version}`}
                result={screeningView.result}
                jobId={screeningView.jobId}
                profile={screeningView.profile}
                onApply={applyScreeningSearchSpace}
                onApplyBacktestValues={applyBacktestValues}
                onSaved={() => setProfileVersion((n) => n + 1)}
                onClose={screeningView.profile ? () => setScreeningView(null) : null}
                busy={loading || optActive}
              />
            ) : results ? (
              <div className="bg-white p-6 rounded-lg shadow">
                {mode === 'optimize' && optBanner && (
                  <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium" role="status">
                    {optBanner}
                  </div>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <h2 className="text-xl font-bold">
                    {mode === 'optimize' ? 'Optimization Results' : 'Results'} for {results.ticker}
                  </h2>
                  {canSaveCase && (
                    <SaveCaseControl
                      key={mode === 'optimize' ? `job-${optJobId}` : `bt-${backtestRunSeq.current}`}
                      mode={mode}
                      jobId={optJobId}
                      getConfig={() => backtestConfigRef.current}
                      onSaved={bumpCasesVersion}
                      getCaseMeta={() => (mode === 'optimize'
                        ? { ticker, timeframe: timeFrame, longOnly, startDate: toLocalIsoDate(startDate) }
                        : null)}
                      onOpenWatchlist={() => setActiveTab('watchlist')}
                    />
                  )}
                </div>
                

                {/* Trading window (screener tradeStart): the backend's first bar of the window, shown
                    only when the run had a tradeStart. Bars before it are warm-up (shaded). */}
                {results.tradeStart && results.windowStart && (
                  <p className="mb-3 text-sm text-gray-600" data-testid="trading-window">
                    <span className="font-medium text-gray-800">Trading window:</span>{' '}
                    {fmtBarTimestamp(results.windowStart)}
                    {resultPrices.length > 0 && <> → {fmtBarTimestamp(resultPrices[resultPrices.length - 1].date)}</>}
                    {resultPrices.length > 0 && <> · warm-up from {fmtBarTimestamp(resultPrices[0].date)}</>}
                  </p>
                )}

                {/* Seeded entry of a watch run (StrategyResultDTO.seededEntry; absent on an older backend) */}
                {results.seededEntry && (
                  <p className="mb-3 text-sm text-gray-600" data-testid="seeded-entry">
                    <span className="font-medium text-gray-800">Seeded entry (your position):</span>{' '}
                    {fmtBarTimestamp(results.seededEntry.date)} @ {fmtPrice(results.seededEntry.price)}
                  </p>
                )}

                {/* Backend warnings (e.g. a short warm-up before tradeStart): informational only */}
                {resultWarnings.length > 0 && (
                  <div
                    className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm"
                    role="status"
                    data-testid="result-warnings"
                  >
                    {resultWarnings.map((w, i) => <div key={i}>{w}</div>)}
                  </div>
                )}

                {/* Results area - the element fullscreened by the toggle. In fullscreen the charts
                    fill the first screen and StrategyResults follows below at full width. */}
                <div ref={setChartAreaNode} className={isFullscreen ? 'chart-fullscreen-active' : ''}>
                  {/* Toolbar: indicator picker + fullscreen toggle (also inside fullscreen) */}
                  <div ref={setChartToolbarNode} className={`chart-toolbar${channelSource ? ' chart-toolbar--wrap' : ''}`}>
                    <IndicatorPicker
                      seriesList={indicatorSeriesList}
                      showIndicators={showIndicators}
                      onToggleShow={setShowIndicators}
                      selectedIds={selectedIndicatorIds}
                      onToggleSeries={toggleIndicatorSeries}
                      onToggleGroup={toggleIndicatorGroup}
                    />
                    {channelSource && (
                      <ChannelLayerControl
                        source={channelSource}
                        enabled={channelLayerOn}
                        onToggle={setChannelLayerOn}
                        view={channelLayerView}
                        onViewChange={setChannelLayerView}
                        layer={channelLayer}
                      />
                    )}
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
                      windowStart={results.windowStart ?? null}
                      focusDate={mode === 'backtest' && watchContext && !watchContext.edited ? watchContext.focusBarDate : null}
                      nextTriggers={resultTriggers}
                      channelTree={channelSource && channelLayerOn && channelLayer.channels.length > 0 ? channelLayer.channels : null}
                    />
                  </div>

                  {/* Results Summary - same element position in and out of fullscreen, so its
                      active tab survives the toggle */}
                  <StrategyResults
                    results={results}
                    mode={mode}
                    fileContext={{ ticker, timeFrame, selectedStrategies, startDate, endDate }}
                    stability={results.channelStability ? {
                      baseConfig: stabilityBaseConfig,
                      onApplyParams: (params) => applyStabilityParams(stabilityBaseConfig, params),
                      busy: loading || optActive,
                      totalCombinations: Number.isFinite(optJob?.total) ? optJob.total : null,
                    } : null}
                  />
                </div>
              </div>
            ) : mode === 'optimize' && storedStability && !optActive ? (
              <ChannelStabilityView
                key={`stored-${storedStability.stability?.snapshot?.detectedAt || ''}-${storedStability.name || ''}`}
                stability={storedStability.stability}
                baseConfig={storedStability.config}
                onApplyParams={(params) => applyStabilityParams(storedStability.config, params)}
                stored={{ name: storedStability.name, savedAt: storedStability.savedAt }}
                onRedetect={storedStability.config ? handleRedetect : null}
                busy={loading || optActive}
              />
            ) : !showOptPanel && (
              <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64">
                <p className="text-gray-500">
                  {loading ? 'Processing your request...' : 'Configure and run a strategy to see results'}
                  {!loading && storedStability && mode !== 'optimize' && (
                    <span className="block mt-2 text-sm" data-testid="stored-stability-hint">
                      The loaded case has a stored channel-stability result — switch to Optimize to view it.
                    </span>
                  )}
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
      <Header
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        watch={watchNotifications.available ? watchNotifications : null}
        screenerNew={screenerLatest.available && activeTab !== 'screener' ? screenerLatest.newCount : 0}
      />
      <WatchToasts
        toasts={watchNotifications.toasts}
        onOpen={handleOpenToast}
        onDismiss={watchNotifications.dismiss}
        onDismissAll={watchNotifications.dismissAll}
      />

      {renderMain()}

      <footer className="py-4 bg-gray-800 text-white text-center">
        <p>Strategy Backtesting Tool &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;