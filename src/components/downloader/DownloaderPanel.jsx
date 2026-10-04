// src/components/downloader/DownloaderPanel.jsx
//
// "Downloader" tab: pick market / portfolio / tickers / raw timeframe / source / dates /
// indicators, start an asynchronous backend job (download → aggregate → recalc indicators)
// and poll it. Contract: screener logs/agents/architect.md §4.6, §4.9 and
// TASK_downloader_tab.md §B, §F, decision 0.17 (history limits); "Data check" section:
// TASK_downloader_gaps.md §3.
import { useState, useEffect, useRef } from 'react';
import {
  fetchPortfolios, fetchSources, startDownload, fetchJob, fetchCurrentJob, cancelJob,
} from '../../api/downloaderApi';
import { exchangeZoneForMarket, exchangeToday, exchangeStartOfYear, daysAgoIso } from '../../utils/dates';
import TickerChips from './TickerChips';
import DownloadJobTable, { StatusBadge } from './DownloadJobTable';
import DataCheckPanel from './DataCheckPanel';

const MARKETS = ['US', 'MOEX'];

const TIMEFRAMES = [
  { value: 'MIN5', label: '5 Minutes' },
  { value: 'HOUR', label: 'Hour' },
  { value: 'DAY', label: 'Day' },
];

const INDICATORS = [
  { value: 'SMA', label: 'SMA' },
  { value: 'ATR', label: 'ATR' },
  { value: 'RSI', label: 'RSI' },
  { value: 'HV', label: 'HV' },
  { value: 'TREND', label: 'Trend' },
];

const DEFAULT_PORTFOLIO = 'BEST_ETF';
const DEFAULT_SOURCE = 'yahooDownloader';
const DEFAULT_TIMEFRAME = 'DAY';
const POLL_MS = 1000;
const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);

const JOB_LOST_MESSAGE =
  'The job was lost — the backend restarted. Data saved before the restart is kept; run the download again to finish.';

const MIN5_TOOLTIP =
  'MIN5 backfill is month-granular: it covers whole months, so From is effectively rounded down to the 1st of its month.';

// Timeframe for a source (architect.md S2): keep `preferred` if the source serves it,
// otherwise DAY if it serves DAY, otherwise its first supported timeframe (HOUR for MOEX).
const pickTimeFrame = (preferred, source) => {
  const tfs = source?.supportedTimeFrames || [];
  if (tfs.length === 0 || tfs.includes(preferred)) return preferred;
  if (tfs.includes(DEFAULT_TIMEFRAME)) return DEFAULT_TIMEFRAME;
  return tfs[0];
};

// Wording for the F.4 history-limit warning (decision 0.17).
const TF_HISTORY_NOUN = { MIN5: '5-minute', HOUR: 'hourly', DAY: 'daily' };
const TF_COARSER_HINT = { MIN5: 'Use HOUR or DAY for older history.', HOUR: 'Use DAY for older history.' };

// Decision 0.17: the source's history limit (days) for a timeframe. `historyLimitDays` is a
// map {MIN5: 60, HOUR: 730}; an absent TF means no known limit. Older backends only send
// `maxIntradayHistoryDays`, which is the MIN5 value.
const historyLimitFor = (source, tf) => {
  const map = source?.historyLimitDays;
  if (map && typeof map === 'object') {
    const n = map[tf];
    return typeof n === 'number' && n > 0 ? n : null;
  }
  return tf === 'MIN5' && source?.maxIntradayHistoryDays > 0 ? source.maxIntradayHistoryDays : null;
};

// "Yahoo (yfinance)" → "Yahoo"
const shortLabel = (source) => (source?.label || source?.id || 'This source').split(' (')[0];

export default function DownloaderPanel() {
  // ---- form state ----
  const [market, setMarket] = useState('US');
  const [portfolios, setPortfolios] = useState([]);
  const [portfolio, setPortfolio] = useState('');
  const [tickers, setTickers] = useState([]);
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [timeFrame, setTimeFrame] = useState(DEFAULT_TIMEFRAME);
  // Decision 0.18: default dates are the EXCHANGE's calendar (US market by default), not the browser's.
  const [from, setFrom] = useState(() => exchangeStartOfYear(exchangeZoneForMarket('US')));
  const [useTo, setUseTo] = useState(false);
  const [to, setTo] = useState(() => exchangeToday(exchangeZoneForMarket('US')));
  const [indicators, setIndicators] = useState(() => INDICATORS.map((i) => i.value));
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [starting, setStarting] = useState(false);

  // ---- job state ----
  const [job, setJob] = useState(null);
  const [jobLost, setJobLost] = useState(false);
  const [pollWarning, setPollWarning] = useState(null);
  const [cancelRequestedFor, setCancelRequestedFor] = useState(null);
  const pollInFlight = useRef(false);

  const jobId = job?.jobId ?? null;
  const isActive = !!job && ACTIVE_STATUSES.has(job.status) && !jobLost;

  const selectedSource = sources.find((s) => s.id === sourceId) || null;
  const selectedPortfolio = portfolios.find((p) => p.name === portfolio) || null;
  // The selected market's current date (America/New_York or Europe/Moscow), decision 0.18.
  const exchangeZone = exchangeZoneForMarket(market);
  const today = exchangeToday(exchangeZone);
  const isMin5 = timeFrame === 'MIN5';

  // Market change: refetch portfolios + sources, reset chips, source and timeframe.
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(null);
    Promise.all([fetchPortfolios(market), fetchSources(market)])
      .then(([ps, ss]) => {
        if (cancelled) return;
        const pList = Array.isArray(ps) ? ps : [];
        const sList = Array.isArray(ss) ? ss : [];
        const p = pList.find((x) => x.name === DEFAULT_PORTFOLIO) || pList[0] || null;
        const s = sList.find((x) => x.id === DEFAULT_SOURCE) || sList[0] || null;
        setPortfolios(pList);
        setPortfolio(p?.name || '');
        setTickers(p ? [...(p.tickers || [])] : []);
        setSources(sList);
        setSourceId(s?.id || '');
        setTimeFrame(pickTimeFrame(DEFAULT_TIMEFRAME, s));
      })
      .catch((err) => {
        if (cancelled) return;
        setPortfolios([]);
        setPortfolio('');
        setTickers([]);
        setSources([]);
        setSourceId('');
        setOptionsError(err.message);
      })
      .finally(() => { if (!cancelled) setOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [market]);

  // On mount: reattach to the running (or most recent) job, e.g. after a page reload.
  useEffect(() => {
    let cancelled = false;
    fetchCurrentJob()
      .then((j) => { if (!cancelled && j) setJob((prev) => prev ?? j); })
      .catch((err) => console.error('Failed to fetch current download job:', err));
    return () => { cancelled = true; };
  }, []);

  // Poll the job every second while it is QUEUED/RUNNING. The interval is cleared on a
  // terminal status, on a lost job (404), on job change and on unmount.
  useEffect(() => {
    if (!jobId || !isActive) return undefined;
    const id = setInterval(async () => {
      if (pollInFlight.current) return; // never overlap polls
      pollInFlight.current = true;
      try {
        const j = await fetchJob(jobId);
        setJob((prev) => (prev && prev.jobId === jobId ? j : prev));
        setPollWarning(null);
      } catch (err) {
        if (err.status === 404) {
          setJobLost(true);
          setPollWarning(null);
        } else {
          setPollWarning(`Cannot reach the backend, retrying… (${err.message})`);
        }
      } finally {
        pollInFlight.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [jobId, isActive]);

  // Show a job right away (placeholder), then load its real state once.
  const attachToJob = async (id, placeholderStatus) => {
    setJobLost(false);
    setPollWarning(null);
    setCancelRequestedFor(null);
    setJob({ jobId: id, status: placeholderStatus, items: [], log: [] });
    try {
      const j = await fetchJob(id);
      setJob((prev) => (prev && prev.jobId === id ? j : prev));
    } catch (err) {
      if (err.status === 404) setJobLost(true);
      // anything else: the poll loop retries
    }
  };

  const handleSourceChange = (id) => {
    setSourceId(id);
    setTimeFrame((tf) => pickTimeFrame(tf, sources.find((s) => s.id === id)));
  };

  const handlePortfolioChange = (name) => {
    setPortfolio(name);
    const p = portfolios.find((x) => x.name === name);
    setTickers(p ? [...(p.tickers || [])] : []);
  };

  const toggleIndicator = (value) =>
    setIndicators((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        // keep the canonical order SMA, ATR, RSI, HV, TREND
        : INDICATORS.map((i) => i.value).filter((v) => v === value || prev.includes(v)));

  const handleDownload = async (e) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);

    const sendTo = useTo && !isMin5;
    const end = sendTo ? to : today;
    if (tickers.length === 0) { setFormError('Add at least one ticker'); return; }
    if (!selectedSource) { setFormError('Select a source'); return; }
    if (!(selectedSource.supportedTimeFrames || []).includes(timeFrame)) {
      setFormError(`${selectedSource.label} cannot serve ${timeFrame}`);
      return;
    }
    if (!from) { setFormError('From date is required'); return; }
    if (from > end) {
      setFormError(sendTo ? 'From must be on or before To' : 'From cannot be in the future');
      return;
    }

    // architect.md S12: always send the chips as `tickers`, never `portfolio`.
    const body = { market, source: sourceId, tickers, timeFrame, from, indicators };
    if (sendTo) body.to = to; // omitted ⇒ backend uses today

    setStarting(true);
    try {
      const res = await startDownload(body);
      if (res.conflict) {
        if (res.jobId) {
          setNotice('A download is already running — showing that job.');
          await attachToJob(res.jobId, 'RUNNING');
        } else {
          // No running job id: something else blocks the start (e.g. a delete in progress).
          // Show the backend's reason; never attach to the last *finished* job.
          setFormError(res.error || 'The backend refused to start the download (409 Conflict)');
          const current = await fetchCurrentJob();
          if (current && (current.status === 'RUNNING' || current.status === 'QUEUED')) {
            setJobLost(false);
            setPollWarning(null);
            setCancelRequestedFor(null);
            setJob(current);
          }
        }
      } else if (res.jobId) {
        await attachToJob(res.jobId, 'QUEUED');
      } else {
        setFormError('The backend did not return a job id');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    setCancelRequestedFor(jobId);
    try {
      await cancelJob(jobId);
      setNotice('Cancel requested — the stage in progress finishes first, remaining tickers are cancelled.');
    } catch (err) {
      setCancelRequestedFor(null);
      if (err.status === 404) setJobLost(true);
      else setFormError(err.message);
    }
  };

  // F.4 / decision 0.17: history-limit warning for the selected timeframe (MIN5 and HOUR
  // for Yahoo; not visible with the defaults).
  const maxDays = historyLimitFor(selectedSource, timeFrame);
  // Same horizon as the backend (DownloaderProperties: today − N + 1, exchange "today"), so a
  // `from` the backend would clamp always shows the warning (reviewer F2).
  const retentionCutoff = maxDays ? daysAgoIso(maxDays - 1, exchangeZone) : null;
  const showIntradayWarning = !!maxDays && !!from && from < retentionCutoff;
  const safeDays = maxDays ? Math.max(1, maxDays - 1) : null;

  const controlsDisabled = isActive || starting;

  return (
    <div className="container mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Configuration panel */}
        <div className="lg:col-span-4 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Download prices</h2>
          <form onSubmit={handleDownload} noValidate>
            <fieldset disabled={controlsDisabled} className="min-w-0">
              {/* Market */}
              <div className="mb-4">
                <label htmlFor="dl-market" className="block text-sm font-medium text-gray-700 mb-2">Market</label>
                <select
                  id="dl-market"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Portfolio */}
              <div className="mb-4">
                <label htmlFor="dl-portfolio" className="block text-sm font-medium text-gray-700 mb-2">Portfolio</label>
                <select
                  id="dl-portfolio"
                  value={portfolio}
                  onChange={(e) => handlePortfolioChange(e.target.value)}
                  className="w-full p-2 border rounded"
                  disabled={optionsLoading || portfolios.length === 0}
                >
                  {portfolios.length === 0 && <option value="">{optionsLoading ? 'Loading…' : 'No portfolios'}</option>}
                  {portfolios.map((p) => (
                    <option key={p.name} value={p.name}>{p.name} ({(p.tickers || []).length})</option>
                  ))}
                </select>
              </div>

              {/* Tickers */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Tickers</label>
                <TickerChips
                  tickers={tickers}
                  onChange={setTickers}
                  onReset={() => setTickers(selectedPortfolio ? [...(selectedPortfolio.tickers || [])] : [])}
                  disabled={controlsDisabled}
                />
              </div>

              {/* Source */}
              <div className="mb-4">
                <label htmlFor="dl-source" className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                <select
                  id="dl-source"
                  value={sourceId}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  className="w-full p-2 border rounded"
                  disabled={optionsLoading || sources.length === 0}
                >
                  {sources.length === 0 && <option value="">{optionsLoading ? 'Loading…' : 'No sources'}</option>}
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.label || s.id}</option>)}
                </select>
              </div>

              {/* Timeframe (raw download granularity) */}
              <div className="mb-4">
                <label htmlFor="dl-timeframe" className="block text-sm font-medium text-gray-700 mb-2">Timeframe</label>
                <select
                  id="dl-timeframe"
                  value={timeFrame}
                  onChange={(e) => setTimeFrame(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {TIMEFRAMES.map((tf) => {
                    const supported = !selectedSource
                      || (selectedSource.supportedTimeFrames || []).includes(tf.value);
                    return (
                      <option
                        key={tf.value}
                        value={tf.value}
                        disabled={!supported}
                        title={supported ? undefined : `${shortLabel(selectedSource)} cannot download ${tf.label}`}
                      >
                        {tf.label}{supported ? '' : ' (not supported)'}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-xs text-gray-500">Raw download granularity; higher timeframes are aggregated from it.</p>
              </div>

              {/* From */}
              <div className="mb-4">
                <label htmlFor="dl-from" className="block text-sm font-medium text-gray-700 mb-2">
                  From
                  {isMin5 && (
                    <span className="ml-1 text-gray-400 cursor-help" title={MIN5_TOOLTIP}>ⓘ</span>
                  )}
                </label>
                <input
                  id="dl-from"
                  type="date"
                  value={from}
                  max={useTo && !isMin5 ? to : today}
                  onChange={(e) => { if (e.target.value) setFrom(e.target.value); }}
                  title={isMin5 ? MIN5_TOOLTIP : 'Historical backfill target: older bars are prepended'}
                  className="w-full p-2 border rounded"
                />
                {isMin5 && <p className="mt-1 text-xs text-gray-500">{MIN5_TOOLTIP}</p>}
              </div>

              {/* F.4 intraday retention warning */}
              {showIntradayWarning && (
                <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="note">
                  <p>
                    {shortLabel(selectedSource)} keeps only ~{maxDays} days of {TF_HISTORY_NOUN[timeFrame] || timeFrame}{' '}
                    history; data before {retentionCutoff} will not be requested and the backfill will stop there.
                    {TF_COARSER_HINT[timeFrame] ? ` ${TF_COARSER_HINT[timeFrame]}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setFrom(daysAgoIso(safeDays, exchangeZone))}
                    className="mt-2 px-2 py-1 rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 text-xs font-medium"
                  >
                    Use last {safeDays} days
                  </button>
                  <p className="mt-2 text-xs">
                    Note: a forward update of a ticker whose latest {timeFrame} bar is older than {retentionCutoff}{' '}
                    fails with &ldquo;would leave a gap — use another source or timeframe&rdquo;.
                  </p>
                </div>
              )}

              {/* To (optional; hidden for MIN5, whose forward-fill has no end date) */}
              {!isMin5 && (
                <div className="mb-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useTo}
                      onChange={(e) => setUseTo(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Specify end date
                  </label>
                  {useTo ? (
                    <input
                      type="date"
                      aria-label="To"
                      value={to}
                      min={from}
                      max={today}
                      onChange={(e) => { if (e.target.value) setTo(e.target.value); }}
                      className="mt-2 w-full p-2 border rounded"
                    />
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">Downloads up to today.</p>
                  )}
                </div>
              )}

              {/* Indicators */}
              <div className="mb-6">
                <span className="block text-sm font-medium text-gray-700 mb-2">Indicators</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {INDICATORS.map((ind) => (
                    <label key={ind.value} className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={indicators.includes(ind.value)}
                        onChange={() => toggleIndicator(ind.value)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {ind.label}
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={controlsDisabled || optionsLoading || !selectedSource}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isActive || starting ? 'Downloading…' : 'Download'}
              </button>
              {isActive && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelRequestedFor === jobId}
                  className="py-2 px-4 rounded border border-red-600 text-red-600 hover:bg-red-50 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                >
                  {cancelRequestedFor === jobId ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>

            {optionsError && <div className="form-error" role="alert">{optionsError}</div>}
            {formError && <div className="form-error" role="alert">{formError}</div>}
            {notice && (
              <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm" role="status">
                {notice}
              </div>
            )}
          </form>
        </div>

        {/* Job panel */}
        <div className="lg:col-span-8 min-w-0">
          {job ? (
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-xl font-bold">Download job</h2>
                <StatusBadge status={jobLost ? 'LOST' : job.status} />
                <span className="text-xs text-gray-500 break-all">{job.jobId}</span>
              </div>
              {(job.market || job.source || job.timeFrame) && (
                <p className="mb-3 text-sm text-gray-600">
                  {[job.market, job.source, job.timeFrame].filter(Boolean).join(' · ')}
                  {job.from && <> · {job.from} → {job.to || 'today'}</>}
                </p>
              )}
              {jobLost && (
                <div className="mb-3 p-3 rounded bg-red-50 border border-red-300 text-red-800 text-sm" role="alert">
                  {JOB_LOST_MESSAGE}
                </div>
              )}
              {pollWarning && !jobLost && (
                <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status">
                  {pollWarning}
                </div>
              )}
              <DownloadJobTable job={job} />
            </div>
          ) : (
            <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64">
              <p className="text-gray-500">
                {starting ? 'Starting download…' : 'Configure and press Download to fetch prices and recalculate indicators'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Data check: gap finder + one-sided delete (TASK_downloader_gaps.md §3) */}
      <DataCheckPanel tickers={tickers} market={market} jobActive={isActive} />
    </div>
  );
}
