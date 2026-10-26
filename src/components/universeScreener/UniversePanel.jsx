// src/components/universeScreener/UniversePanel.jsx
//
// Universe view of the Screener tab (architect.md "Universe screener rev 1" §4, §6, §8.1; spec
// §9.5): summary + the UNIVERSE_US daily schedule (created disabled — enabled by the owner after
// the initial history load), monthly composition refresh with a dry run, history load, indicator
// recalc, manual add, and the member table (status ACTIVE / INACTIVE / EXCLUDED, source AUTO /
// MANUAL) with Exclude / Include / Remove manual / duplicate mark / Load history / Prepare for
// strategies. Download-slot actions are ordinary download jobs: polled at /api/downloader/jobs.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getUniverseSummary, listMembers, addMember, excludeMember, includeMember, removeManualMember, markDuplicate,
  loadMemberHistory, prepareForStrategies, loadAllPendingHistory, recalcUniverseIndicators, startRefresh,
  getRefreshJob, normalizeFlags, UNIVERSE_CODE, REFRESH_TERMINAL,
} from '../../api/universeApi';
import { setScheduleEnabled } from '../../api/downloaderApi';
import { describeApiError } from '../../api/httpClient';
import { fmtDay, fmtTs } from '../watch/format';
import { pollUntil, waitForDownloadJob } from './poll';

const STATUS_FILTERS = ['ACTIVE', 'INACTIVE', 'EXCLUDED', 'ALL'];
const btn = 'py-0.5 px-2 text-xs border rounded hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-white';
const actionBtn = 'py-1 px-3 border rounded text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-white';

const MEMBER_STATUS_CLASS = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  EXCLUDED: 'bg-red-100 text-red-800',
};

const fmtMoney = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toFixed(0);
};

const PLAN_LISTS = [
  ['added', 'Added'],
  ['deactivated', 'Deactivated (AUTO dropped out)'],
  ['reactivated', 'Reactivated'],
  ['autoStocks', 'AUTO stocks'],
  ['autoEtfs', 'AUTO ETFs'],
];

/** RefreshPlanDTO `{sourceVersion, autoStocks[], autoEtfs[], added[], deactivated[], reactivated[],
 * excluded[{symbol, kind, rank, flags[], reason}], duplicates[{primary, members[]}],
 * duplicatePairs[{ticker, primary, correlation, manual}], errors[]}`. */
function RefreshPlan({ plan }) {
  if (!plan || typeof plan !== 'object') return null;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const excluded = arr(plan.excluded);
  const groups = arr(plan.duplicates);
  const pairs = arr(plan.duplicatePairs);
  const errors = arr(plan.errors);
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm" data-testid="refresh-plan">
      {plan.sourceVersion && <div className="md:col-span-2 text-xs text-gray-500">Source: {plan.sourceVersion}</div>}
      {PLAN_LISTS.map(([k, title]) => (
        <div key={k}>
          <div className="text-xs font-semibold text-gray-600">{title} ({arr(plan[k]).length})</div>
          <div className="text-xs text-gray-800 break-words">{arr(plan[k]).length ? arr(plan[k]).join(', ') : '—'}</div>
        </div>
      ))}
      <div className="md:col-span-2">
        <div className="text-xs font-semibold text-gray-600">Excluded candidates ({excluded.length})</div>
        <div className="text-xs text-gray-800 break-words">
          {excluded.length === 0 ? '—' : excluded.map((x) => `${x.symbol}${normalizeFlags(x.flags).length ? ` [${normalizeFlags(x.flags).join(',')}]` : ''}${x.reason ? ` (${x.reason})` : ''}`).join(', ')}
        </div>
      </div>
      <div className="md:col-span-2">
        <div className="text-xs font-semibold text-gray-600">Duplicate groups ({groups.length})</div>
        <ul className="text-xs text-gray-800">
          {groups.map((g) => <li key={g.primary}>{g.primary} ← {arr(g.members).join(', ')}</li>)}
        </ul>
        {pairs.length > 0 && (
          <div className="text-xs text-gray-600 mt-1">
            Pairs: {pairs.map((x) => `${x.ticker}→${x.primary}${typeof x.correlation === 'number' ? ` ${x.correlation.toFixed(4)}` : ''}${x.manual ? ' (manual)' : ''}`).join(', ')}
          </div>
        )}
      </div>
      {errors.length > 0 && (
        <div className="md:col-span-2 text-xs text-red-700">Errors: {errors.join('; ')}</div>
      )}
    </div>
  );
}

export default function UniversePanel({ code = UNIVERSE_CODE }) {
  const [summary, setSummary] = useState(null);
  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [kindFilter, setKindFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyTicker, setBusyTicker] = useState(null);
  const [rowMessages, setRowMessages] = useState({});
  const [notice, setNotice] = useState(null); // {kind, text}

  const [addTicker, setAddTicker] = useState('');
  const [addKind, setAddKind] = useState('');
  const [addNote, setAddNote] = useState('');
  const [adding, setAdding] = useState(false);

  const [refreshJob, setRefreshJob] = useState(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [downloadJob, setDownloadJob] = useState(null); // {label, job}
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    const [s, m] = await Promise.allSettled([getUniverseSummary(code), listMembers({ code })]);
    if (!alive.current) return;
    if (s.status === 'fulfilled') setSummary(s.value);
    if (m.status === 'fulfilled') {
      setMembers(m.value);
      setLoadError(null);
    } else {
      setMembers((prev) => prev ?? []);
      setLoadError(m.reason?.status === 404 && !m.reason?.detail
        ? 'The backend does not serve the universe API (404) — restart it with the universe screener feature.'
        : `Could not load the universe: ${describeApiError(m.reason)}`);
    }
  }, [code]);

  useEffect(() => { refresh(); }, [refresh]);

  const setRowMessage = (t, msg) => setRowMessages((prev) => ({ ...prev, [t]: msg }));

  // A download-slot job (history / prepare / recalc): show it and poll until it ends.
  const followDownloadJob = async (label, jobId) => {
    setDownloadJob({ label, job: { id: jobId, status: 'QUEUED' } });
    try {
      const final = await waitForDownloadJob(jobId, {
        onUpdate: (job) => alive.current && setDownloadJob({ label, job }),
        isCancelled: () => !alive.current,
      });
      if (final && alive.current) refresh();
    } catch (err) {
      if (alive.current) setDownloadJob({ label, job: { id: jobId, status: err.status === 404 ? 'LOST' : 'UNKNOWN' } });
    }
  };

  // 409 of a download-slot action: the slot is busy.
  const slotBusyText = (err, extra = '') => `The download slot is busy${err.jobId ? ` (job ${err.jobId})` : ''}${err.detail ? `: ${err.detail}` : ''}.${extra}`;

  const rowAction = async (m, fn) => {
    setBusyTicker(m.ticker);
    setRowMessage(m.ticker, null);
    try {
      const msg = await fn();
      if (msg) setRowMessage(m.ticker, { kind: 'ok', text: msg });
    } catch (err) {
      setRowMessage(m.ticker, { kind: 'error', text: describeApiError(err) });
    } finally {
      setBusyTicker(null);
      refresh();
    }
  };

  const handleExclude = (m) => {
    if (!window.confirm(`Exclude ${m.ticker} from the universe? It stays out of the automatic set until you include it again.`)) return;
    rowAction(m, async () => { await excludeMember(m.ticker, code); return 'Excluded'; });
  };
  const handleInclude = (m) => rowAction(m, async () => { await includeMember(m.ticker, code); return 'Included (manual)'; });
  const handleRemove = (m) => {
    if (!window.confirm(`Remove the manual member ${m.ticker}? It becomes INACTIVE; its price history stays.`)) return;
    rowAction(m, async () => {
      try {
        await removeManualMember(m.ticker, code);
      } catch (err) {
        if (err.status === 409 && (err.code === 'AUTO_MEMBER' || !err.code)) throw new Error('An automatic member cannot be removed — use Exclude.');
        throw err;
      }
      return 'Removed (INACTIVE)';
    });
  };
  const handleDuplicate = (m) => {
    const answer = window.prompt(
      `${m.ticker}: primary member it duplicates (e.g. SPY).\nEmpty = "not a duplicate" (manual), "auto" = back to the automatic rule.`,
      m.duplicateOf || '',
    );
    if (answer === null) return;
    const v = answer.trim().toUpperCase();
    rowAction(m, async () => {
      if (v === 'AUTO') { await markDuplicate(m.ticker, { reset: true }, code); return 'Duplicate mark: automatic'; }
      if (!v) { await markDuplicate(m.ticker, { primary: null }, code); return 'Marked: not a duplicate'; }
      await markDuplicate(m.ticker, { primary: v }, code);
      return `Marked as a duplicate of ${v}`;
    });
  };
  const handleLoadHistory = (m) => rowAction(m, async () => {
    try {
      const r = await loadMemberHistory(m.ticker, code);
      if (r?.jobId) followDownloadJob(`History ${m.ticker}`, r.jobId);
      return 'History download started';
    } catch (err) {
      if (err.status === 409) return slotBusyText(err, ' Pending history is picked up by the next universe download.');
      throw err;
    }
  });
  const handlePrepare = (m) => rowAction(m, async () => {
    try {
      const r = await prepareForStrategies(m.ticker, code);
      if (r?.jobId) followDownloadJob(`Prepare ${m.ticker}`, r.jobId);
      return 'Computing the full indicator set…';
    } catch (err) {
      if (err.status === 409) return slotBusyText(err, ' FULL is recorded: the next universe download computes it.');
      throw err;
    }
  });

  const slotAction = async (label, fn) => {
    setNotice(null);
    try {
      const r = await fn();
      if (r?.jobId) followDownloadJob(label, r.jobId);
      else setNotice({ kind: 'ok', text: `${label}: started` });
    } catch (err) {
      setNotice({ kind: 'error', text: err.status === 409 ? slotBusyText(err) : describeApiError(err) });
    }
  };

  const handleRefresh = async (dryRun) => {
    if (!dryRun && !window.confirm('Refresh the universe composition now? New members are added, dropped AUTO members become INACTIVE. Run a dry run first to see the plan.')) return;
    setNotice(null);
    setRefreshBusy(true);
    let jobId = null;
    try {
      const r = await startRefresh({ dryRun, code });
      jobId = r?.jobId ?? null;
    } catch (err) {
      if (err.status === 409 && err.jobId) {
        jobId = err.jobId;
        setNotice({ kind: 'ok', text: 'A refresh is already running — showing it.' });
      } else {
        setNotice({ kind: 'error', text: describeApiError(err) });
        setRefreshBusy(false);
        return;
      }
    }
    if (jobId == null) { setRefreshBusy(false); return; }
    try {
      await pollUntil({
        load: () => getRefreshJob(jobId),
        isDone: (j) => REFRESH_TERMINAL.has(j?.status),
        onUpdate: (j) => alive.current && setRefreshJob(j),
        isCancelled: () => !alive.current,
        intervalMs: 2000,
      });
      if (alive.current && !dryRun) refresh();
    } catch (err) {
      if (alive.current) setNotice({ kind: 'error', text: `Refresh job: ${describeApiError(err)}` });
    } finally {
      if (alive.current) setRefreshBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const t = addTicker.trim().toUpperCase();
    if (!t) return;
    setAdding(true);
    setNotice(null);
    try {
      await addMember({ ticker: t, kind: addKind || null, note: addNote.trim() || null }, code);
      setNotice({ kind: 'ok', text: `${t} added (MANUAL). Its history is loaded by "Load history" or the next universe download.` });
      setAddTicker('');
      setAddNote('');
      refresh();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err.status === 409 ? `${t} is already an active member.` : describeApiError(err),
      });
    } finally {
      setAdding(false);
    }
  };

  const schedule = summary?.schedule || null;
  const toggleSchedule = async () => {
    if (!schedule?.id) return;
    const enable = !schedule.enabled;
    if (enable && !window.confirm('Enable the daily UNIVERSE_US download (DAY, 17:30 New York)? Do it after the initial history load.')) return;
    try {
      await setScheduleEnabled(schedule.id, enable);
      refresh();
    } catch (err) {
      setNotice({ kind: 'error', text: describeApiError(err) });
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return (members || [])
      .filter((m) => statusFilter === 'ALL' || m.status === statusFilter)
      .filter((m) => !kindFilter || m.kind === kindFilter)
      .filter((m) => !q || m.ticker.toUpperCase().includes(q) || (m.longName || '').toUpperCase().includes(q))
      .sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || (a.rankNo ?? 1e9) - (b.rankNo ?? 1e9) || a.ticker.localeCompare(b.ticker));
  }, [members, statusFilter, kindFilter, search]);

  const counts = useMemo(() => {
    const c = { ACTIVE: 0, INACTIVE: 0, EXCLUDED: 0, pending: 0, minimal: 0 };
    (members || []).forEach((m) => {
      c[m.status] = (c[m.status] || 0) + 1;
      if (m.historyPending && m.status === 'ACTIVE') c.pending += 1;
      if (m.indicatorSet === 'MINIMAL' && m.status === 'ACTIVE') c.minimal += 1;
    });
    return c;
  }, [members]);

  const lastRefresh = summary?.lastRefresh || null;
  const dj = downloadJob?.job;

  return (
    <div className="flex flex-col gap-6" data-testid="universe-panel">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <h2 className="text-xl font-bold">Universe {code}</h2>
          <button type="button" onClick={refresh} className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm">↻ Refresh view</button>
        </div>
        <p className="mb-3 text-sm text-gray-600">
          Top 100 US stocks and top 100 ETFs (automatic, refreshed monthly) plus manual members. Universe tickers keep a
          minimal indicator set (SMA lengths used by active filters); use <b>Prepare for strategies</b> before backtesting one.
        </p>
        {loadError && <div className="form-error mb-3" role="alert">{loadError}</div>}

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-3" data-testid="universe-summary">
          <span>Active <b>{counts.ACTIVE}</b></span>
          <span>Inactive <b>{counts.INACTIVE}</b></span>
          <span>Excluded <b>{counts.EXCLUDED}</b></span>
          <span>History pending <b>{counts.pending}</b></span>
          <span>Minimal indicators <b>{counts.minimal}</b></span>
          {summary?.duplicateGroups != null && <span>Duplicate groups <b>{summary.duplicateGroups}</b></span>}
          {lastRefresh?.yfinanceVersion && <span className="text-gray-500">yfinance {lastRefresh.yfinanceVersion}</span>}
          {lastRefresh && (
            <span>Last refresh <b>{fmtTs(lastRefresh.startedAt || lastRefresh.finishedAt)}</b> {lastRefresh.status}</span>
          )}
          {summary?.nextRefreshDate && <span>Next refresh <b>{fmtDay(summary.nextRefreshDate)}</b></span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm mb-4 p-2 rounded border bg-gray-50" data-testid="universe-schedule">
          <span className="font-medium">Daily download {schedule?.name || 'UNIVERSE_US'}:</span>
          {schedule ? (
            <>
              <span className={schedule.enabled ? 'text-green-700' : 'text-amber-700'}>
                {schedule.enabled ? 'enabled' : 'disabled'}
              </span>
              {schedule.runAt && <span className="text-gray-500">at {schedule.runAt} ET</span>}
              {schedule.lastStatus && <span className="text-gray-500">· last {schedule.lastStatus} {fmtTs(schedule.lastRunAt)}</span>}
              <button type="button" className={btn} onClick={toggleSchedule}>{schedule.enabled ? 'Disable' : 'Enable'}</button>
              {!schedule.enabled && (
                <span className="text-xs text-gray-500">Created disabled: enable it after the initial history load.</span>
              )}
            </>
          ) : <span className="text-gray-500">not reported by the backend (see Downloader → Scheduled jobs)</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={actionBtn} disabled={refreshBusy} onClick={() => handleRefresh(true)} data-testid="universe-refresh-dry">
            Refresh — dry run
          </button>
          <button type="button" className={`${actionBtn} border-blue-600 text-blue-600`} disabled={refreshBusy} onClick={() => handleRefresh(false)} data-testid="universe-refresh">
            Refresh now
          </button>
          <button type="button" className={actionBtn} onClick={() => slotAction('Load history', () => loadAllPendingHistory(code))} data-testid="universe-load-history">
            Load history{counts.pending ? ` (${counts.pending} pending)` : ''}
          </button>
          <button type="button" className={actionBtn} onClick={() => slotAction('Recalc indicators', () => recalcUniverseIndicators(code))}
            title="Bring the universe's minimal indicators up to the SMA lengths of the active filters (no download)">
            Recalc indicators
          </button>
        </div>

        {notice && (
          <div className={`mt-3 p-2 rounded text-sm border ${notice.kind === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`} role="status">
            {notice.text}
          </div>
        )}
        {dj && (
          <div className="mt-3 text-sm text-gray-700" data-testid="universe-download-job">
            {downloadJob.label}: job {dj.id || dj.jobId} — <b>{dj.status}</b>
            {Number.isFinite(dj.percent) ? ` ${Math.floor(dj.percent)} %` : ''}
            {dj.status === 'LOST' && ' (the backend no longer knows the job — it may have restarted)'}
            <span className="ml-1 text-xs text-gray-500">(details in the Downloader tab)</span>
          </div>
        )}
        {refreshJob && (
          <div className="mt-3 border rounded p-3" data-testid="universe-refresh-job">
            <div className="text-sm">
              {refreshJob.dryRun ? 'Dry run' : 'Refresh'} — <b>{refreshJob.status}</b>
              {refreshJob.message && <span className="ml-2 text-gray-600">{refreshJob.message}</span>}
            </div>
            {Array.isArray(refreshJob.log) && refreshJob.log.length > 0 && (
              <pre className="mt-2 max-h-40 overflow-y-auto text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">{refreshJob.log.slice(-30).join('\n')}</pre>
            )}
            <RefreshPlan plan={refreshJob.plan} />
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <form className="flex flex-wrap items-end gap-2 mb-4" onSubmit={handleAdd} data-testid="universe-add">
          <div>
            <label className="block text-xs text-gray-600 mb-1" htmlFor="um-ticker">Add ticker (manual)</label>
            <input id="um-ticker" className="p-2 border rounded text-sm w-32" value={addTicker} placeholder="e.g. TSM"
              onChange={(e) => setAddTicker(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1" htmlFor="um-kind">Kind</label>
            <select id="um-kind" className="p-2 border rounded text-sm bg-white" value={addKind} onChange={(e) => setAddKind(e.target.value)}>
              <option value="">auto (from the last refresh)</option>
              <option value="STOCK">STOCK</option>
              <option value="ETF">ETF</option>
            </select>
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs text-gray-600 mb-1" htmlFor="um-note">Note</label>
            <input id="um-note" className="w-full p-2 border rounded text-sm" value={addNote} onChange={(e) => setAddNote(e.target.value)} />
          </div>
          <button type="submit" disabled={adding || !addTicker.trim()} className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm">
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="inline-flex rounded border overflow-hidden" role="group" aria-label="Member status">
            {STATUS_FILTERS.map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-sm ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                aria-pressed={statusFilter === s}>
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}{s !== 'ALL' && members ? ` (${counts[s] || 0})` : ''}
              </button>
            ))}
          </div>
          <select className="p-1 border rounded text-sm bg-white" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Kind">
            <option value="">Stocks + ETFs</option>
            <option value="STOCK">Stocks</option>
            <option value="ETF">ETFs</option>
          </select>
          <input className="p-1 border rounded text-sm" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="text-xs text-gray-500">{visible.length} member(s)</span>
        </div>

        {members === null ? <p className="text-sm text-gray-500">Loading…</p> : (
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Ticker', 'Name', 'Kind', 'Source', 'Status', 'Rank', 'Size', 'Flags', 'Data', 'Indicators', ''].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={11} className="px-2 py-4 text-center text-gray-500">No members.</td></tr>
                ) : visible.map((m) => {
                  const flags = normalizeFlags(m.flags);
                  const busy = busyTicker === m.ticker;
                  const msg = rowMessages[m.ticker];
                  return (
                    <tr key={m.ticker} className="border-t align-top" data-testid="universe-member-row">
                      <td className="px-2 py-1 font-semibold whitespace-nowrap">{m.ticker}</td>
                      <td className="px-2 py-1 max-w-[16rem]">
                        <div className="truncate" title={m.longName || ''}>{m.longName || '—'}</div>
                        {m.category && <div className="text-xs text-gray-500 truncate">{m.category}</div>}
                        {m.note && <div className="text-xs text-gray-500 break-words">{m.note}</div>}
                        {msg && <div className={`text-xs mt-0.5 ${msg.kind === 'error' ? 'text-red-600' : 'text-blue-700'}`}>{msg.text}</div>}
                      </td>
                      <td className="px-2 py-1">{m.kind || '—'}</td>
                      <td className="px-2 py-1">{m.source || '—'}</td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${MEMBER_STATUS_CLASS[m.status] || ''}`}>{m.status}</span>
                      </td>
                      <td className="px-2 py-1 text-right">{m.rankNo ?? '—'}</td>
                      <td className="px-2 py-1 text-right" title="Market cap / net assets at the rank date">{fmtMoney(m.rankValue)}</td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => <span key={f} className="watch-flag">{f}</span>)}
                          {m.duplicateOf && (
                            <span className="watch-flag" title={m.duplicateManual === true || m.duplicateManual === 1 ? 'Manual mark' : 'Automatic (correlation rule)'}>
                              dup of {m.duplicateOf}{m.duplicateManual === true || m.duplicateManual === 1 ? ' (manual)' : ''}
                            </span>
                          )}
                          {m.staleDays > 0 && <span className="watch-flag">stale {m.staleDays}d</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap text-xs">
                        {m.firstDate || m.lastDate ? `${fmtDay(m.firstDate)} … ${fmtDay(m.lastDate)}` : <span className="text-gray-400">no DAY data</span>}
                        {m.historyPending && <div className="text-amber-700">history pending</div>}
                      </td>
                      <td className="px-2 py-1 text-xs">{m.indicatorSet || '—'}</td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap justify-end gap-1">
                          {m.status === 'EXCLUDED'
                            ? <button type="button" className={btn} disabled={busy} onClick={() => handleInclude(m)}>Include</button>
                            : <button type="button" className={btn} disabled={busy} onClick={() => handleExclude(m)}>Exclude</button>}
                          {m.source === 'MANUAL' && m.status === 'ACTIVE' && (
                            <button type="button" className={`${btn} text-red-600`} disabled={busy} onClick={() => handleRemove(m)}>Remove</button>
                          )}
                          <button type="button" className={btn} disabled={busy} onClick={() => handleDuplicate(m)}>Duplicate…</button>
                          {m.status === 'ACTIVE' && (
                            <button type="button" className={btn} disabled={busy} onClick={() => handleLoadHistory(m)}>Load history</button>
                          )}
                          {m.status === 'ACTIVE' && m.indicatorSet !== 'FULL' && (
                            <button type="button" className={`${btn} border-blue-600 text-blue-600`} disabled={busy} onClick={() => handlePrepare(m)}
                              title="Compute the full indicator set (all SMA 5..100, ATR, RSI, HV, trend) so strategies can run on this ticker">
                              Prepare for strategies
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
