// src/components/downloader/DownloadJobTable.jsx
import { useState } from 'react';
import { jobElapsedMs } from '../../utils/dates';

// Item statuses: QUEUED | DOWNLOADING | CALCULATING | DONE | FAILED | CANCELLED | SKIPPED
// Job statuses:  QUEUED | RUNNING | DONE | FAILED | CANCELLED
const STATUS_CLASS = {
  DONE: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-amber-100 text-amber-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  DOWNLOADING: 'bg-blue-100 text-blue-800',
  CALCULATING: 'bg-blue-100 text-blue-800',
  QUEUED: 'bg-slate-100 text-slate-600',
};

const ROW_CLASS = {
  FAILED: 'bg-red-50',
  DOWNLOADING: 'bg-blue-50',
  CALCULATING: 'bg-blue-50',
};

export const StatusBadge = ({ status }) => (
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_CLASS[status] || 'bg-gray-100 text-gray-700'}`}>
    {status || '—'}
  </span>
);

const fmtNum = (n) => (n == null ? '0' : Number(n).toLocaleString());

const formatDuration = (ms) => {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${(ms / 1000).toFixed(1)} s`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = String(totalSec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// startedAt / finishedAt are operational job timestamps (not market data, decision 0.18) and are
// never displayed — only used for the elapsed time. They are zone-less wall-clock times in the
// server zone the job JSON names in `timeZone` (e.g. "America/New_York"). A running job is
// measured against that zone's current wall clock (jobElapsedMs in utils/dates.js), so the
// elapsed time is right in any browser zone. Without `timeZone` it falls back to browser-local
// parsing, exact only while the browser runs in the server's zone.
const wallClockMs = (job) => jobElapsedMs(job.startedAt, job.finishedAt, job.timeZone);

const DownloadJobTable = ({ job }) => {
  const [logOpen, setLogOpen] = useState(true);
  const items = job.items || [];
  const totals = job.totals || {};
  const log = job.log || [];

  return (
    <div>
      {/* Totals line */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-sm text-gray-700">
        <span>
          <span className="font-semibold">{totals.done ?? 0} / {totals.tickers ?? items.length}</span> done
          {totals.failed > 0 && <span className="text-red-700"> · {totals.failed} failed</span>}
        </span>
        <span>
          Bars new <span className="font-semibold">{fmtNum(totals.barsNew)}</span>
          {' / '}updated <span className="font-semibold">{fmtNum(totals.barsUpdated)}</span>
        </span>
        <span>Elapsed <span className="font-semibold">{formatDuration(wallClockMs(job))}</span></span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border border-gray-200">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Ticker</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Stage</th>
              <th className="text-right px-3 py-2 font-semibold" title="backfilled / new / updated">
                Bars (backfill / new / updated)
              </th>
              <th className="text-right px-3 py-2 font-semibold">Elapsed</th>
              <th className="text-left px-3 py-2 font-semibold">Error</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-3 text-center text-gray-500">No tickers yet…</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.dbTicker || it.ticker} className={`border-t border-gray-200 ${ROW_CLASS[it.status] || ''}`}>
                <td className="px-3 py-2 font-medium">
                  {it.ticker}
                  {it.dbTicker && it.dbTicker !== it.ticker && (
                    <span className="block text-xs text-gray-500">{it.dbTicker}</span>
                  )}
                </td>
                <td className="px-3 py-2"><StatusBadge status={it.status} /></td>
                <td className="px-3 py-2 text-gray-700">{it.stage || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtNum(it.barsBackfilled)} / {fmtNum(it.barsNew)} / {fmtNum(it.barsUpdated)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDuration(it.elapsedMs)}</td>
                <td className="px-3 py-2">
                  {it.error && <span className="text-red-700 break-words">{it.error}</span>}
                  {(it.stopReason || it.stoppedAt) && (
                    <span className="block text-xs text-gray-500">
                      Backfill stopped{it.stoppedAt ? ` at ${it.stoppedAt}` : ''}{it.stopReason ? `: ${it.stopReason}` : ''}
                    </span>
                  )}
                  {!it.error && !it.stopReason && !it.stoppedAt && <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Collapsible log pane */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setLogOpen((o) => !o)}
          className="text-sm font-medium text-blue-600 hover:underline"
          aria-expanded={logOpen}
        >
          {logOpen ? '▾' : '▸'} Log ({log.length} line{log.length === 1 ? '' : 's'})
        </button>
        {logOpen && (
          <pre className="mt-2 max-h-72 overflow-auto bg-gray-900 text-gray-100 text-xs p-3 rounded whitespace-pre-wrap">
            {log.length ? log.join('\n') : '(empty)'}
          </pre>
        )}
      </div>
    </div>
  );
};

export default DownloadJobTable;
