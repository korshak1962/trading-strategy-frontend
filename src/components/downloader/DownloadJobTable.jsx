// src/components/downloader/DownloadJobTable.jsx
import { useState } from 'react';
import { jobElapsedMs } from '../../utils/dates';

// Item statuses: QUEUED | DOWNLOADING | CALCULATING | DONE | FAILED | CANCELLED | SKIPPED
// Job statuses:  QUEUED | RUNNING | DONE | FAILED | CANCELLED (+ LOST in the UI: job gone after a restart)
// Schedule statuses (lastStatus / manualStatus, TASK_download_schedule.md §2.2):
//   QUEUED | RUNNING | DONE | PARTIAL | FAILED | CANCELLED | LOST | RETRY_PENDING | WAITING | MISSED
const STATUS_CLASS = {
  PARTIAL: 'bg-amber-100 text-amber-800',
  RETRY_PENDING: 'bg-amber-100 text-amber-800',
  LOST: 'bg-rose-100 text-rose-800',
  MISSED: 'bg-gray-100 text-gray-600',
  WAITING: 'bg-slate-100 text-slate-600',
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

// ---- Refill report (architect_refill_gaps.md §5) ----
// The shape is read defensively: maps {key: n} and arrays of objects are both accepted.

const firstNum = (o, keys) => keys.map((k) => o?.[k]).find((v) => typeof v === 'number');
const firstStr = (o, keys) => keys.map((k) => o?.[k]).find((v) => typeof v === 'string' && v);

// Ratio DTO {numerator, denominator, pct, text} (or a legacy string) → "78 / 78 (100.0%)".
const ratioStr = (v) => {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object') {
    if (typeof v.text === 'string' && v.text) return v.text;
    if (typeof v.numerator === 'number' && typeof v.denominator === 'number') {
      return `${fmtNum(v.numerator)} / ${fmtNum(v.denominator)}`
        + (v.denominator > 0 ? ` (${((100 * v.numerator) / v.denominator).toFixed(1)}%)` : '');
    }
  }
  return null;
};

// RefillReportDTO.indicators: kind → timeframe → rows, e.g. {SMA: {HOUR: 120, DAY: 40}}.
const toIndicatorRows = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return toCountRows(v);
  return Object.entries(v).flatMap(([kind, byTf]) => {
    if (typeof byTf === 'number') return [{ name: kind, n: byTf }];
    if (!byTf || typeof byTf !== 'object') return [];
    return Object.entries(byTf)
      .filter(([, n]) => typeof n === 'number')
      .map(([tf, n]) => ({ name: kind, timeFrame: tf, n }));
  });
};

// {price_min5: 780} | [{table, action?, rows|count|inserted, of?, keyMoved?}] → rows
const toCountRows = (v) => {
  if (Array.isArray(v)) {
    return v
      .map((r) => ({
        name: firstStr(r, ['table', 'name', 'kind', 'indicator']) ?? '?',
        timeFrame: firstStr(r, ['timeFrame', 'tf']),
        action: firstStr(r, ['action', 'op']),
        n: firstNum(r, ['rows', 'count', 'inserted', 'created', 'rebuilt', 'written', 'n']),
        of: firstNum(r, ['of', 'expected', 'total', 'probed']),
        keyMoved: firstNum(r, ['keyMoved', 'keysMoved']),
      }))
      .filter((r) => typeof r.n === 'number');
  }
  if (v && typeof v === 'object') {
    return Object.entries(v)
      .filter(([, n]) => typeof n === 'number')
      .map(([name, n]) => ({ name, n }));
  }
  return [];
};

// {MIN5: '2020-12-22T09:30:00'} | [{timeFrame, date|from}] → [{tf, date}]
const toFirstAffected = (v) => {
  if (Array.isArray(v)) {
    return v.map((r) => ({ tf: firstStr(r, ['timeFrame', 'tf']) ?? '?', date: firstStr(r, ['date', 'from', 'firstDate']) }));
  }
  if (v && typeof v === 'object') return Object.entries(v).map(([tf, date]) => ({ tf, date }));
  return [];
};

const fmtTs = (s) => (s ? String(s).replace('T', ' ').replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?$/, '$1').replace(/ 00:00$/, '') : '—');

const countText = (r) => {
  const base = typeof r.of === 'number' && r.of > 0
    ? `${fmtNum(r.n)} / ${fmtNum(r.of)} (${((100 * r.n) / r.of).toFixed(1)}%)`
    : fmtNum(r.n);
  return r.keyMoved ? `${base}, ${fmtNum(r.keyMoved)} with key moved` : base;
};

const AFFECTED_GROUPS = [
  { keys: ['cases', 'strategyCases'], label: 'Saved cases', hint: 'stored result summary is stale — re-run to update' },
  { keys: ['profiles', 'paramProfiles'], label: 'Parameter profiles', hint: 'fitted on the old data' },
  { keys: ['zones', 'levelZones'], label: 'Level zones', hint: 'calculated before the refill' },
  { keys: ['watches', 'signalWatches'], label: 'Signal watches', hint: 're-evaluated automatically' },
  { keys: ['screenRuns', 'screens'], label: 'Screener runs', hint: 'historical runs stay as they were' },
];

const affectedLabel = (o) => {
  if (o == null) return '?';
  if (typeof o !== 'object') return String(o);
  const name = firstStr(o, ['name', 'label', 'strategyKey', 'title']);
  const id = o.id ?? o.profileId ?? o.caseId;
  const extra = [o.timeFrame, o.status].filter(Boolean).join(' ');
  return [name || (id != null ? `#${id}` : '?'), extra && `(${extra})`].filter(Boolean).join(' ');
};

const toWarnings = (o) => {
  const list = [];
  if (Array.isArray(o?.warnings)) list.push(...o.warnings.filter((w) => typeof w === 'string' && w));
  if (typeof o?.gridWarning === 'string' && o.gridWarning) list.push(o.gridWarning);
  return list;
};

/** Refill job outcome: rows per table, first affected date per TF, affected saved objects. */
export const RefillReport = ({ report }) => {
  if (!report || typeof report !== 'object') return null;
  const affectedSrc = report.affected && typeof report.affected === 'object' ? report.affected : report;
  const rows = toCountRows(report.rows ?? report.tables ?? report.prices ?? report.counts);
  const indicators = toIndicatorRows(report.indicators ?? report.indicatorRows);
  const first = toFirstAffected(report.firstAffected ?? report.firstAffectedByTimeFrame ?? report.firstAffectedDates);
  const skipped = Array.isArray(report.filledMeanwhile ?? report.skippedDays)
    ? (report.filledMeanwhile ?? report.skippedDays) : [];
  const written = Array.isArray(report.daysWritten) ? report.daysWritten : [];
  const warnings = toWarnings(report);
  // RefillReportDTO: days = written / asked, bars = inserted / asked (Ratio objects).
  const coverage = [
    ['Gaps', report.gaps], ['Days', report.days], ['Bars', report.bars],
  ].map(([k, v]) => [k, ratioStr(v)]).filter(([, v]) => v);

  return (
    <div className="mb-4 p-3 rounded border border-emerald-200 bg-emerald-50 text-sm text-gray-800" data-testid="refill-report">
      <h3 className="font-semibold mb-2">Refill report</h3>
      {coverage.length > 0 && (
        <p className="mb-2">
          {coverage.map(([k, v]) => <span key={k} className="mr-4">{k} written <span className="font-semibold">{v}</span></span>)}
        </p>
      )}
      {written.length > 0 && (
        <p className="mb-2 text-gray-700">Days written: {written.map((d) => fmtTs(d)).join(', ')}</p>
      )}
      {report.dayOnlyFallback && (
        <p className="mb-2 text-amber-800">Filled at DAY only: the gap stays in MIN5 / HOUR and Find gaps keeps showing it there.</p>
      )}
      {warnings.map((w) => (
        <p key={w} className="mb-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800" role="note">{w}</p>
      ))}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="font-medium mb-1">Price rows</p>
          {rows.length === 0 ? <p className="text-gray-500">—</p> : (
            <ul className="space-y-0.5">
              {rows.map((r) => (
                <li key={`${r.name}|${r.action || ''}|${r.timeFrame || ''}`}>
                  <span className="font-mono text-xs">{r.name}</span>{r.timeFrame ? ` ${r.timeFrame}` : ''}
                  {r.action ? ` ${r.action.toLowerCase()}` : ''}: <span className="font-semibold tabular-nums">{countText(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="font-medium mb-1">Indicator rows rewritten</p>
          {indicators.length === 0 ? <p className="text-gray-500">—</p> : (
            <ul className="space-y-0.5">
              {indicators.map((r) => (
                <li key={`${r.name}|${r.timeFrame || ''}`}>
                  <span className="font-mono text-xs">{r.name}</span>{r.timeFrame ? ` ${r.timeFrame}` : ''}:{' '}
                  <span className="font-semibold tabular-nums">{countText(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="font-medium mb-1">First affected bar per timeframe</p>
          {first.length === 0 ? <p className="text-gray-500">—</p> : (
            <ul className="space-y-0.5">
              {first.map((f) => <li key={f.tf}>{f.tf}: <span className="font-semibold">{fmtTs(f.date)}</span></li>)}
            </ul>
          )}
        </div>
      </div>
      {skipped.length > 0 && (
        <p className="mt-2 text-gray-700">
          Skipped (filled meanwhile by another job): {skipped.map((d) => fmtTs(typeof d === 'string' ? d : d?.day)).join(', ')}
        </p>
      )}
      <div className="mt-3">
        <p className="font-medium mb-1">Affected saved objects of this ticker</p>
        <ul className="space-y-1">
          {AFFECTED_GROUPS.map((g) => {
            // RefillReportDTO.Group {count, hint, names (≤ 20)}; a plain array is accepted too.
            const raw = g.keys.map((k) => affectedSrc[k]).find((v) => v != null);
            let count;
            let names = [];
            let hint = g.hint;
            if (Array.isArray(raw)) {
              count = raw.length;
              names = raw;
            } else if (raw && typeof raw === 'object') {
              count = typeof raw.count === 'number' ? raw.count : (Array.isArray(raw.names) ? raw.names.length : null);
              names = Array.isArray(raw.names) ? raw.names : [];
              if (typeof raw.hint === 'string' && raw.hint) hint = raw.hint;
            } else {
              count = firstNum(affectedSrc, g.keys.map((k) => `${k}Count`));
            }
            if (count == null) return null;
            return (
              <li key={g.label}>
                {g.label}: <span className="font-semibold">{fmtNum(count)}</span>
                {count > 0 && hint && <span className="text-gray-600"> — {hint}</span>}
                {names.length > 0 && (
                  <span className="block text-xs text-gray-600 break-words">
                    {names.slice(0, 20).map(affectedLabel).join(', ')}
                    {count > Math.min(names.length, 20) ? `, … (+${count - Math.min(names.length, 20)})` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

const DownloadJobTable = ({ job }) => {
  const [logOpen, setLogOpen] = useState(true);
  const items = job.items || [];
  const totals = job.totals || {};
  const log = job.log || [];

  return (
    <div>
      {job.refillReport && <RefillReport report={job.refillReport} />}
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
              <th className="text-left px-3 py-2 font-semibold">Error / note</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-3 text-center text-gray-500">No tickers yet…</td></tr>
            )}
            {items.map((it) => {
              // Informational per-ticker note (e.g. "source history starts at 2021-06-14 (...)").
              const note = typeof it.note === 'string' ? it.note.trim() : '';
              return (
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
                  {note && (
                    <span className="block text-xs text-gray-500 break-words">Note: {note}</span>
                  )}
                  {!it.error && !it.stopReason && !it.stoppedAt && !note && <span className="text-gray-400">—</span>}
                </td>
              </tr>
              );
            })}
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
