// src/components/OptimizationProgress.jsx
//
// Live view of an async optimization job (TASK_optimization_progress.md §3.2):
// phase + Stop button, progress bar, best-so-far card, scrolling log.
// App.jsx owns the polling; this component only renders the job it is given.
// Once the job is terminal the whole panel collapses into a <details> (closed when the job has
// a result, so the result below gets the room; open otherwise, so the log / error is visible).

import { useState, useRef, useLayoutEffect } from 'react';
import './OptimizationProgress.css';

const TERMINAL = new Set(['DONE', 'FAILED', 'CANCELLED']);

const OBJECTIVE_LABELS = {
  LONG_PNL: 'Long PnL',
  ANNUAL_RETURN: 'Annual return',
  COMPLEX_YIELD: 'Complex yield',
  CALMAR: 'Calmar',
  SHARPE: 'Sharpe',
};

const PHASE_TEXT = {
  QUEUED: 'Queued…',
  PREPARING: 'Loading prices and preparing the grid…',
  GRID: 'Testing combinations',
  FINALIZING: 'Building the result for the best combination…',
};

const STATUS_TEXT = {
  DONE: 'Optimization done',
  CANCELLED: 'Optimization stopped',
  FAILED: 'Optimization failed',
};

const LEVEL_CLASS = {
  BEST: 'text-green-400',
  WARN: 'text-amber-300',
  ERROR: 'text-red-400',
};

// ---- formatting ----

const objectiveLabel = (objective) =>
  OBJECTIVE_LABELS[objective]
  || (objective
    ? objective.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : 'Objective');

// m:ss, or h:mm:ss from one hour on. Elapsed offsets only, never wall-clock times.
const fmtElapsed = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '—');

// 2 decimals; the objective can be ±Double.MAX_VALUE/2 for SHARPE edge cases → shown as n/a.
const fmt2 = (v) => (Number.isFinite(v) && Math.abs(v) < 1e12 ? v.toFixed(2) : 'n/a');

const fmtPct = (v) => (Number.isFinite(v) ? `${v.toFixed(2)} %` : 'n/a');

// Integers without decimals, other values with at most 4 significant decimals.
const fmtParam = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
};

// ---- pieces ----

// One stat of the best-so-far card. The value span is keyed on its text so the flash animation
// restarts whenever it changes; `flash` is false for the first snapshot.
const Stat = ({ label, value, sub, flash, title }) => (
  <div className="p-2 rounded border border-gray-200 bg-gray-50" title={title}>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="text-sm font-semibold tabular-nums">
      <span key={value} className={flash ? 'opt-flash' : undefined}>{value}</span>
    </div>
    {sub && <div className="text-[11px] text-gray-400 leading-tight">{sub}</div>}
  </div>
);

const BestCard = ({ best, objective }) => {
  // Keep the previous snapshot to flash only the values that changed since the last poll
  // (React's "adjust state while rendering" pattern; every poll brings a new `best` object).
  const [snap, setSnap] = useState({ best, prev: null });
  if (snap.best !== best) setSnap({ best, prev: snap.best });
  const prev = snap.prev;
  const changed = (...keys) => !!prev && keys.some((k) => prev[k] !== best[k]);

  const params = best.params || {};

  return (
    <div className="mt-4 p-4 rounded border border-green-200 bg-white">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">Best so far</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        <Stat
          label={objectiveLabel(objective)}
          value={fmt2(best.objective)}
          flash={changed('objective')}
          title="Value of the optimised objective"
        />
        <Stat
          label="Long PnL"
          value={`${fmt2(best.longPnL)} (${fmtPct(best.longPnLPercent)})`}
          flash={changed('longPnL', 'longPnLPercent')}
        />
        <Stat
          label="Annual yield"
          value={fmtPct(best.annualYield)}
          sub="simple, calendar-annualised, long side"
          flash={changed('annualYield')}
        />
        <Stat
          label="In-market yield"
          value={fmtPct(best.actualYield)}
          flash={changed('actualYield')}
        />
        <Stat
          label="Max drawdown"
          value={`${fmt2(best.maxDrawdown)} (${fmtPct(best.maxDrawdownPercent)})`}
          flash={changed('maxDrawdown', 'maxDrawdownPercent')}
        />
        <Stat label="Trades" value={fmtInt(best.trades)} flash={changed('trades')} />
        <Stat label="Found at" value={`combination #${fmtInt(best.combination)}`} flash={changed('combination')} />
      </div>

      {Object.keys(params).length > 0 && (
        <div className="mt-3 text-sm text-gray-700 space-y-0.5">
          {Object.entries(params).map(([strategy, values]) => (
            <div key={strategy}>
              <span className="font-medium">{strategy}:</span>{' '}
              {Object.entries(values || {})
                .map(([name, v]) => `${name} ${fmtParam(v)}`)
                .join(' · ') || '—'}
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-gray-500">
        Long side only during the search; short leg and buy-and-hold are added to the final result.
      </p>
    </div>
  );
};

const LogPanel = ({ lines, truncated }) => {
  const boxRef = useRef(null);
  // Sticks to the bottom while the user is at the bottom; scrolling up pauses it.
  const [stick, setStick] = useState(true);

  const scrollToBottom = () => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    if (stick) scrollToBottom();
  }, [lines, stick]);

  const handleScroll = () => {
    const el = boxRef.current;
    if (!el || el.clientHeight === 0) return; // collapsed <details>
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
  };

  return (
    <details
      open
      className="mt-4"
      onToggle={(e) => { if (e.currentTarget.open && stick) scrollToBottom(); }}
    >
      <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:underline select-none">
        Log ({lines.length} line{lines.length === 1 ? '' : 's'})
      </summary>
      <div className="relative mt-2">
        <div
          ref={boxRef}
          onScroll={handleScroll}
          className="opt-log-box bg-gray-900 text-gray-100 text-xs font-mono p-3 rounded"
          data-testid="optimization-log"
        >
          {truncated && <div className="text-gray-500">… older lines dropped</div>}
          {lines.length === 0 && !truncated && <div className="text-gray-500">(empty)</div>}
          {lines.map((l) => (
            <div key={l.seq} className={LEVEL_CLASS[l.level] || undefined} data-level={l.level}>
              [{fmtElapsed(l.elapsedMs)}] {l.text}
            </div>
          ))}
        </div>
        {!stick && (
          <button
            type="button"
            onClick={() => setStick(true)}
            className="opt-jump-latest px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white shadow hover:bg-blue-700"
          >
            ↓ Jump to latest
          </button>
        )}
      </div>
    </details>
  );
};

// ---- main component ----

/**
 * @param {Object} props
 * @param {Object} props.job        the last polled job JSON (§2.6), or a placeholder right after start
 * @param {Array}  props.logLines   accumulated log lines `{seq, elapsedMs, level, text}`, oldest first
 * @param {boolean} props.logTruncated  some lines were dropped by the backend ring buffer
 * @param {Function} props.onStop   Stop button handler
 * @param {boolean} props.stopping  Stop was clicked (button disabled, reads "Stopping…")
 * @param {string|null} props.warning  transient poll failure text
 * @param {string|null} [props.notice] informational notice (e.g. attached to an already running job)
 * @param {boolean} [props.lost]    the job is gone from the backend (404)
 */
const OptimizationProgress = ({ job, logLines, logTruncated, onStop, stopping, warning, notice, lost = false }) => {
  const status = job?.status || 'QUEUED';
  const terminal = TERMINAL.has(status) || lost;
  const phase = job?.phase || (status === 'QUEUED' ? 'QUEUED' : null);

  const total = Number.isFinite(job?.total) ? job.total : 0;
  const done = Number.isFinite(job?.done) ? job.done : 0;
  const percent = Number.isFinite(job?.percent) ? Math.min(100, Math.max(0, job.percent)) : 0;
  const indeterminate = !terminal && (status === 'QUEUED' || phase === 'PREPARING' || phase === 'QUEUED');
  const barPercent = !terminal && phase === 'FINALIZING' ? 100 : percent;
  // Hidden once terminal or FINALIZING (a stop there has no effect: the grid is complete).
  const showStop = !terminal && phase !== 'FINALIZING';
  const stopDisabled = stopping || !!job?.cancelRequested;

  const headerText = lost
    ? 'Optimization job lost'
    : terminal
      ? STATUS_TEXT[status]
      : (PHASE_TEXT[phase] || 'Starting…');

  const body = (
    <>
      {notice && (
        <div className="mb-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm" role="status">
          {notice}
        </div>
      )}

      {/* 1. Header row: phase + Stop */}
      {!terminal && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{headerText}</h2>
            {job?.ticker && (
              <span className="text-sm text-gray-500">
                {[job.ticker, job.timeFrame, job.objective && objectiveLabel(job.objective)].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {showStop && (
            <button
              type="button"
              onClick={onStop}
              disabled={stopDisabled}
              title="Stops the search after the current combination and shows the best result found so far"
              className="py-2 px-4 rounded font-semibold bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {stopDisabled ? 'Stopping…' : 'Stop — keep best so far'}
            </button>
          )}
        </div>
      )}

      {/* 2. Progress bar + counters */}
      <div
        role="progressbar"
        aria-label="Optimization progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Number(barPercent.toFixed(2))}
        className="relative h-3 w-full overflow-hidden rounded-full bg-gray-200"
      >
        {indeterminate
          ? <div className="opt-progress-indeterminate" />
          : (
            <div
              className={`opt-progress-fill h-full rounded-full ${status === 'FAILED' || lost ? 'bg-red-500' : status === 'CANCELLED' ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${barPercent}%` }}
            />
          )}
      </div>
      <p className="mt-1 text-sm text-gray-700 tabular-nums">
        {fmtInt(done)} / {fmtInt(total)} combinations ({percent.toFixed(1)} %)
        {' · '}Elapsed {fmtElapsed(job?.elapsedMs ?? 0)}
        {!terminal && job?.etaMs !== null && job?.etaMs !== undefined && <> · ETA {fmtElapsed(job.etaMs)}</>}
      </p>

      {/* 3. Best so far */}
      {job?.best && <BestCard best={job.best} objective={job.objective} />}

      {/* 4. Log */}
      <LogPanel lines={logLines || []} truncated={!!logTruncated} />

      {/* 5. Transient poll failure */}
      {warning && (
        <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status">
          {warning}
        </div>
      )}
    </>
  );

  if (!terminal) {
    return <div className="bg-white p-6 rounded-lg shadow" data-testid="optimization-progress">{body}</div>;
  }

  // Terminal: keep the run (final best card + log) available, collapsed when a result is shown.
  const summaryTone = lost || status === 'FAILED'
    ? 'text-red-700'
    : status === 'CANCELLED' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className="bg-white p-4 rounded-lg shadow" data-testid="optimization-progress">
      <details open={!job?.hasResult}>
        <summary className={`cursor-pointer select-none text-sm font-semibold ${summaryTone}`}>
          {headerText} — {fmtInt(done)} / {fmtInt(total)} combinations ({percent.toFixed(1)} %)
          {' '}in {fmtElapsed(job?.elapsedMs ?? 0)}
          <span className="ml-2 font-normal text-gray-500">(best so far &amp; log)</span>
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    </div>
  );
};

export default OptimizationProgress;
