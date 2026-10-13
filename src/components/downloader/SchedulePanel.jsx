// src/components/downloader/SchedulePanel.jsx
//
// "Scheduled jobs" section of the Downloader tab: create, enable/disable, run now and delete
// scheduled forward-only downloads. Self-contained, with its own Market select (it does not
// follow the manual form's market). All schedule rules (slots, retries, catch-up) live in the
// backend; this panel only displays them.
// Contract: screener TASK_download_schedule.md §3.5 (API) and §5.3 (UI).
import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import {
  fetchPortfolios, fetchSources, fetchSchedules, createSchedule, setScheduleEnabled,
  runScheduleNow, deleteSchedule, fetchJob,
} from '../../api/downloaderApi';
import { StatusBadge } from './DownloadJobTable';
import { TIMEFRAMES, pickTimeFrame } from './timeFrames';

const MARKETS = ['US', 'MOEX'];
const REFRESH_MS = 30000;
const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);

// Defaults per market (§1): the exchange wall clock, never the browser's zone.
const MARKET_INFO = {
  US: {
    zoneShort: 'ET',
    zoneLong: 'ET (New York)',
    defaultRunAt: '16:35',
    defaultSource: 'yahooDownloader',
    hint: 'after the 16:00 close + 30 min settle',
  },
  MOEX: {
    zoneShort: 'MSK',
    zoneLong: 'MSK (Moscow)',
    defaultRunAt: '00:15',
    defaultSource: 'moexDownloader',
    hint: "after the evening session (close 23:50 + 20 min settle); a run after midnight covers the previous day's session",
  },
};

const marketInfo = (m) => MARKET_INFO[m] || MARKET_INFO.US;

// The zone label of a schedule row: from its market, else from its `timeZone`.
const zoneShortOf = (s) =>
  s?.market === 'MOEX' || s?.timeZone === 'Europe/Moscow' ? 'MSK' : 'ET';

// "2026-10-13T16:35:00" → "2026-10-13 16:35"
const fmtTs = (v) => {
  if (v == null || v === '') return '—';
  return String(v).replace('T', ' ').replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?$/, '$1');
};

// "2026-10-13T16:35:00" → "16:35"
const fmtTime = (v) => {
  const m = /T?(\d{2}:\d{2})(:\d{2})?(\.\d+)?$/.exec(String(v ?? ''));
  return m ? m[1] : fmtTs(v);
};

// "DESKTOP-A:1f2e3d4c" → "DESKTOP-A"
const hostOf = (owner) => (owner ? String(owner).split(':')[0] : 'another computer');

// The common default source of the selected portfolios: { id } (null when none selected),
// or { conflict: [a, b] } when their defaults differ.
const commonDefault = (names, portfolios) => {
  const defs = [...new Set(names
    .map((n) => portfolios.find((p) => p.name === n)?.defaultSource)
    .filter(Boolean))];
  if (defs.length > 1) return { conflict: defs };
  return { id: defs[0] || null };
};

// The source the form follows until the user picks one (sourceTouched): the selected
// portfolios' common default; '' ("choose a source") when their defaults differ or the default
// is not offered; with nothing selected, the market's default (else the first source).
const autoSourceFor = (names, pList, sList, m) => {
  const c = commonDefault(names, pList);
  if (c.conflict) return '';
  const id = c.id || (names.length === 0 ? marketInfo(m).defaultSource : null);
  if (id && sList.some((s) => s.id === id)) return id;
  return names.length === 0 ? (sList[0]?.id || '') : '';
};

/**
 * @param {(jobId: string) => void} onJobStarted attach the job panel to a job (Run now, auto-attach)
 * @param {string|undefined} currentJobId the job the job panel shows
 * @param {boolean} jobActive the job panel's job is QUEUED/RUNNING
 */
export default function SchedulePanel({ onJobStarted, currentJobId, jobActive }) {
  // ---- create form ----
  const [market, setMarket] = useState('US');
  const [portfolios, setPortfolios] = useState([]);
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState([]); // portfolio names, in the order they were ticked
  const [sourceId, setSourceId] = useState('');
  const [sourceTouched, setSourceTouched] = useState(false);
  const [timeFrame, setTimeFrame] = useState('HOUR');
  const [runAt, setRunAt] = useState(MARKET_INFO.US.defaultRunAt);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createNotice, setCreateNotice] = useState(null);

  // ---- list ----
  const [schedules, setSchedules] = useState(null); // null = not loaded yet
  const [listError, setListError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState(null); // { id, message }
  const [pendingDelete, setPendingDelete] = useState(null); // schedule id awaiting the 2nd click
  // Sources of every market, for the list's labels (rows of both markets coexist).
  const [sourcesByMarket, setSourcesByMarket] = useState({});
  const [remoteJobs, setRemoteJobs] = useState(() => new Set()); // job ids not on this backend

  // Latest props for the refresh loop, so the interval is not re-created on every render.
  const latest = useRef({ onJobStarted, currentJobId, jobActive });
  useEffect(() => {
    latest.current = { onJobStarted, currentJobId, jobActive };
  });
  const refreshInFlight = useRef(false);

  const info = marketInfo(market);
  const selectedSource = sources.find((s) => s.id === sourceId) || null;
  const auto = commonDefault(selected, portfolios);
  // The option labelled "(portfolio default)": the selected portfolios' common default, else the
  // market's default while nothing is selected.
  const defaultOptionId = auto.conflict ? null : (auto.id || (selected.length === 0 ? info.defaultSource : null));

  const applySource = (id, sList) => {
    setSourceId(id);
    const src = sList.find((s) => s.id === id);
    if (src) setTimeFrame((tf) => pickTimeFrame(tf, src, 'HOUR'));
  };

  // Market change: refetch portfolios + sources, clear the selection, reset source / time.
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(null);
    setSelected([]);
    setSourceTouched(false);
    setRunAt(marketInfo(market).defaultRunAt);
    Promise.all([fetchPortfolios(market), fetchSources(market)])
      .then(([ps, ss]) => {
        if (cancelled) return;
        const pList = Array.isArray(ps) ? ps : [];
        const sList = Array.isArray(ss) ? ss : [];
        setPortfolios(pList);
        setSources(sList);
        const id = autoSourceFor([], pList, sList, market);
        setSourceId(id);
        // Hour by default; stays Hour on a market switch if the source serves it.
        setTimeFrame((tf) => pickTimeFrame(tf, sList.find((s) => s.id === id), 'HOUR'));
      })
      .catch((err) => {
        if (cancelled) return;
        setPortfolios([]);
        setSources([]);
        setSourceId('');
        setOptionsError(err.message);
      })
      .finally(() => { if (!cancelled) setOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [market]);

  // Load the sources of every market once, for the list's source labels. Best effort: a
  // failure only leaves the raw source id in the list.
  useEffect(() => {
    let cancelled = false;
    Promise.all(MARKETS.map((m) => fetchSources(m).then((l) => [m, Array.isArray(l) ? l : []]).catch(() => [m, []])))
      .then((pairs) => { if (!cancelled) setSourcesByMarket(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, []);

  // Load the schedule list; auto-attach the job panel to a scheduled job running on this backend.
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const list = await fetchSchedules();
      const rows = Array.isArray(list) ? list : [];
      setSchedules(rows);
      setListError(null);

      const remote = new Set();
      let attached = false;
      for (const s of rows) {
        if (!s.lastJobId || !ACTIVE_STATUSES.has(s.lastStatus)) continue;
        try {
          await fetchJob(s.lastJobId); // present → the job runs on this backend
          const { onJobStarted: attach, currentJobId: cur, jobActive: active } = latest.current;
          if (!attached && !active && s.lastJobId !== cur) {
            attached = true;
            attach?.(s.lastJobId);
          }
        } catch (err) {
          if (err.status === 404) remote.add(s.lastJobId);
        }
      }
      setRemoteJobs(remote);
    } catch (err) {
      setListError(err.message);
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  // Refresh on mount and every 30 s while the tab is open (the panel unmounts with the tab).
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const togglePortfolio = (name) => {
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
    setSelected(next);
    if (!sourceTouched) applySource(autoSourceFor(next, portfolios, sources, market), sources);
  };

  const handleSourceChange = (id) => {
    setSourceTouched(true);
    applySource(id, sources);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setCreateNotice(null);
    if (selected.length === 0) { setCreateError('Select at least one portfolio'); return; }
    if (!/^\d{2}:\d{2}$/.test(runAt)) { setCreateError('Enter a time (HH:mm)'); return; }

    const body = { market, portfolios: selected, runAt, timeFrame };
    if (sourceId) body.source = sourceId; // omitted → the portfolios' common default (backend)

    setCreating(true);
    try {
      const created = await createSchedule(body);
      setCreateNotice(`Created "${created?.name || selected.join(' + ')}".`);
      setSelected([]);
      setSourceTouched(false);
      applySource(autoSourceFor([], portfolios, sources, market), sources);
      await refresh();
    } catch (err) {
      // 400 / 409: the backend's text verbatim.
      setCreateError(err.detail || err.message);
    } finally {
      setCreating(false);
    }
  };

  const rowAction = async (id, fn) => {
    setRowError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      setRowError({ id, message: err.detail || err.message });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  const handleToggleEnabled = (s) => rowAction(s.id, () => setScheduleEnabled(s.id, !s.enabled));

  const handleRunNow = (s) => rowAction(s.id, async () => {
    const res = await runScheduleNow(s.id);
    if (res?.jobId) onJobStarted?.(res.jobId);
  });

  const handleDelete = (s) => rowAction(s.id, async () => {
    await deleteSchedule(s.id);
    setPendingDelete(null);
  });

  // Portfolio summary under the checkbox list.
  const uniqueTickers = new Set(selected.flatMap((n) => portfolios.find((p) => p.name === n)?.tickers || []));

  // Source label for the form (its current market's sources).
  const sourceLabel = (id) => sources.find((x) => x.id === id)?.label || id;
  // Source label for a list row, resolved against that row's own market (not the form's).
  const rowSourceLabel = (row) =>
    (sourcesByMarket[row.market] || []).find((x) => x.id === row.source)?.label
    || sources.find((x) => x.id === row.source)?.label
    || row.source;

  return (
    <div className="bg-white p-6 rounded-lg shadow mt-8">
      <h2 className="text-xl font-bold mb-1">Scheduled jobs</h2>
      <p className="mb-4 text-sm text-gray-600">
        US runs Mon–Fri, MOEX every night. Updates to today; does not backfill — load history once with
        Download above. If the time has already passed today and today&apos;s run has not happened, it runs right away.
      </p>

      {/* Create form */}
      <form onSubmit={handleCreate} noValidate>
        <fieldset disabled={creating} className="min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* Market. Column spans: one row on xl; two rows on md/lg so the Source select stays wide
              enough for "Yahoo (yfinance) (portfolio default)". */}
          <div className="md:col-span-2 xl:col-span-1">
            <label htmlFor="sch-market" className="block text-sm font-medium text-gray-700 mb-2">Market</label>
            <select
              id="sch-market"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Portfolios */}
          <div className="md:col-span-5 xl:col-span-3 min-w-0">
            <span className="block text-sm font-medium text-gray-700 mb-2">Portfolios</span>
            <div
              className="max-h-56 overflow-y-auto border rounded p-2 space-y-1"
              role="group"
              aria-label="Portfolios"
            >
              {portfolios.length === 0 && (
                <p className="text-sm text-gray-500">{optionsLoading ? 'Loading…' : 'No portfolios'}</p>
              )}
              {portfolios.map((p) => {
                const n = (p.tickers || []).length;
                return (
                  <label
                    key={p.name}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    title={(p.tickers || []).join(', ')}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(p.name)}
                      onChange={() => togglePortfolio(p.name)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{p.name} ({n} ticker{n === 1 ? '' : 's'})</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {selected.length} portfolio{selected.length === 1 ? '' : 's'}, {uniqueTickers.size} unique ticker
              {uniqueTickers.size === 1 ? '' : 's'}
            </p>
          </div>

          {/* Source */}
          <div className="md:col-span-5 xl:col-span-3 min-w-0">
            <label htmlFor="sch-source" className="block text-sm font-medium text-gray-700 mb-2">Source</label>
            <select
              id="sch-source"
              value={sourceId}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="w-full p-2 border rounded"
              disabled={optionsLoading || sources.length === 0}
            >
              {sources.length === 0 && <option value="">{optionsLoading ? 'Loading…' : 'No sources'}</option>}
              {sources.length > 0 && sourceId === '' && <option value="">choose a source</option>}
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || s.id}{s.id === defaultOptionId ? ' (portfolio default)' : ''}
                </option>
              ))}
            </select>
            {auto.conflict && !sourceId && (
              <p className="mt-1 text-xs text-amber-700">
                The portfolios default to {auto.conflict.map(sourceLabel).join(' and ')}: choose a source.
              </p>
            )}
          </div>

          {/* Timeframe */}
          <div className="md:col-span-3 xl:col-span-2">
            <label htmlFor="sch-timeframe" className="block text-sm font-medium text-gray-700 mb-2">Timeframe</label>
            <select
              id="sch-timeframe"
              value={timeFrame}
              onChange={(e) => setTimeFrame(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {TIMEFRAMES.map((tf) => {
                const supported = !selectedSource
                  || (selectedSource.supportedTimeFrames || []).includes(tf.value);
                return (
                  <option key={tf.value} value={tf.value} disabled={!supported}>
                    {tf.label}{supported ? '' : ' (not supported)'}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Time (exchange wall clock) */}
          <div className="md:col-span-5 xl:col-span-3">
            <label htmlFor="sch-runat" className="block text-sm font-medium text-gray-700 mb-2">Time</label>
            <div className="flex items-center gap-2">
              <input
                id="sch-runat"
                type="time"
                step="60"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value.slice(0, 5))}
                className="p-2 border rounded"
              />
              <span className="text-sm text-gray-700 whitespace-nowrap">{info.zoneLong}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{info.hint}</p>
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={creating || optionsLoading || selected.length === 0}
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {creating ? 'Creating…' : 'Create job'}
          </button>
        </div>

        {optionsError && <div className="form-error" role="alert">{optionsError}</div>}
        {createError && <div className="form-error" role="alert">{createError}</div>}
        {createNotice && (
          <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm" role="status">
            {createNotice}
          </div>
        )}
      </form>

      {/* List */}
      <div className="mt-6">
        {listError && <div className="form-error" role="alert">{listError}</div>}
        {schedules && schedules.length === 0 && !listError && (
          <p className="text-sm text-gray-500">No scheduled jobs</p>
        )}
        {schedules === null && !listError && <p className="text-sm text-gray-500">Loading…</p>}
        {schedules && schedules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Name / portfolios</th>
                  <th className="text-left px-3 py-2 font-semibold">Source · TF</th>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-left px-3 py-2 font-semibold">Next run</th>
                  <th className="text-left px-3 py-2 font-semibold">Last run</th>
                  <th className="text-left px-3 py-2 font-semibold">Enabled</th>
                  <th className="text-left px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const zone = zoneShortOf(s);
                  const busy = busyId === s.id;
                  const isPendingDelete = pendingDelete === s.id;
                  const err = rowError?.id === s.id ? rowError.message : null;
                  const portfolioNames = Array.isArray(s.portfolios) ? s.portfolios : [];
                  const warnings = Array.isArray(s.warnings) ? s.warnings : [];
                  const runningRemote = ACTIVE_STATUSES.has(s.lastStatus) && s.lastJobId && remoteJobs.has(s.lastJobId);
                  return (
                    <Fragment key={s.id}>
                      <tr className={`border-t border-gray-200 align-top ${s.enabled ? '' : 'text-gray-500'}`}>
                        {/* Name / portfolios */}
                        <td className="px-3 py-2">
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-xs text-gray-500">
                            {s.market} · {portfolioNames.join(', ')}
                            {typeof s.tickerCount === 'number' && ` · ${s.tickerCount} ticker${s.tickerCount === 1 ? '' : 's'}`}
                          </span>
                          {warnings.map((w) => (
                            <span key={w} className="block text-xs text-amber-700">{w}</span>
                          ))}
                        </td>

                        {/* Source · TF */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {rowSourceLabel(s)}{s.sourceIsDefault ? ' (default)' : ''} · {s.timeFrame}
                        </td>

                        {/* Time */}
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{s.runAt} {zone}</td>

                        {/* Next run */}
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {!s.enabled || !s.nextRunAt ? '—' : (s.dueNow ? 'now' : `${fmtTs(s.nextRunAt)} ${zone}`)}
                          {s.enabled && s.nextRunAt && s.market === 'MOEX' && s.nextSessionDate && (
                            <span className="block text-xs text-gray-500">(session {s.nextSessionDate})</span>
                          )}
                        </td>

                        {/* Last run */}
                        <td className="px-3 py-2">
                          {s.lastStatus ? (
                            <div className="flex flex-wrap items-center gap-2" title={s.lastMessage || undefined}>
                              <span className="whitespace-nowrap tabular-nums">{fmtTs(s.lastRunAt)}</span>
                              <StatusBadge status={s.lastStatus} />
                            </div>
                          ) : (
                            <span className="text-gray-400">never</span>
                          )}
                          {s.lastStatus === 'RETRY_PENDING' && (
                            <span className="block text-xs text-amber-700">
                              attempt {s.attempt}/{s.maxAttempts}
                              {s.nextRetryAt && `, next retry ${fmtTime(s.nextRetryAt)} ${zone}`}
                            </span>
                          )}
                          {runningRemote && (
                            <span className="block text-xs text-gray-500">running on {hostOf(s.ownerInstance)}</span>
                          )}
                          {s.lastMessage && s.lastStatus !== 'DONE' && (
                            <span className="block text-xs text-gray-500 break-words max-w-xs">{s.lastMessage}</span>
                          )}
                          {s.manualStatus && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-600">
                              Run now: <StatusBadge status={s.manualStatus} />
                              <span className="tabular-nums">{fmtTs(s.manualRunAt)}</span>
                            </div>
                          )}
                        </td>

                        {/* Enabled */}
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!!s.enabled}
                            aria-label={`${s.enabled ? 'Disable' : 'Enable'} ${s.name}`}
                            onClick={() => handleToggleEnabled(s)}
                            disabled={busy}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${s.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
                            />
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRunNow(s)}
                              disabled={busy}
                              title="Start a forward-only run now (does not use up the scheduled run)"
                              className="px-2 py-0.5 rounded border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs whitespace-nowrap disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                            >
                              Run now
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRowError(null); setPendingDelete(s.id); }}
                              disabled={busy}
                              className="px-2 py-0.5 rounded border border-red-600 text-red-600 hover:bg-red-50 text-xs disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                            >
                              Delete
                            </button>
                            {busy && <span className="text-xs text-gray-500">working…</span>}
                          </div>
                        </td>
                      </tr>
                      {(isPendingDelete || err) && (
                        <tr className="border-t border-gray-100">
                          <td colSpan={7} className="px-3 py-2">
                            {isPendingDelete && (
                              <div className="p-3 rounded bg-red-50 border border-red-300 text-red-800 text-sm" role="alertdialog" aria-label="Confirm delete">
                                <p className="font-medium">Delete the scheduled job &ldquo;{s.name}&rdquo;?</p>
                                <p className="mt-1 text-xs">A download it already started keeps running.</p>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(s)}
                                    disabled={busy}
                                    className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400"
                                  >
                                    {busy ? 'Deleting…' : 'Confirm delete'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete(null)}
                                    disabled={busy}
                                    className="px-3 py-1 rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:text-gray-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                            {err && <div className="form-error" role="alert">{err}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
