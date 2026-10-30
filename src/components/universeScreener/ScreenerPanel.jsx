// src/components/universeScreener/ScreenerPanel.jsx
//
// Screener tab (screener logs/agents/architect.md "Universe screener rev 1" §2.3; spec §9): the
// daily universe screener with the sub-tabs Filters (list + constructor), Results (runs of a
// filter, diff vs the previous run, per-ticker table) and Universe (composition). A ticker click
// opens the Channel Explorer with the filter's window and detector params ending at the run's
// basis (onOpenInChannels); "Backtest" prepares the full indicator set of a MINIMAL universe ticker
// first, then opens the Strategy Backtester (onOpenInBacktest).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './screener.css';
import '../watch/watch.css';
import {
  getScreenerMeta, listFilters, getFilter, patchFilter, duplicateFilter, deleteFilter, runFilterNow,
  listFilterRuns, getRun, getRunDiff, fromFilterDTO, RUN_TERMINAL, DEFAULT_START_DATE,
} from '../../api/screenerApi';
import { fetchSchedules } from '../../api/downloaderApi';
import { listMembers } from '../../api/universeApi';
import { describeApiError } from '../../api/httpClient';
import { RECURSIVE_DEFAULT_PARAMS } from '../channelExplorer/RecursiveParamsPanel';
import { exchangeToday } from '../../utils/dates';
import { fmtDay } from '../watch/format';
import FilterList from './FilterList';
import FilterEditor from './FilterEditor';
import RunResults from './RunResults';
import UniversePanel from './UniversePanel';
import { evalTfOf } from './conditionFormat';
import { pollUntil } from './poll';
import { prepareAndWait } from './prepareFlow';

const VIEWS = [
  { value: 'filters', label: 'Filters' },
  { value: 'results', label: 'Results' },
  { value: 'universe', label: 'Universe' },
];

const NOT_AVAILABLE = 'The backend does not serve the screener API (404) — restart it with the universe screener feature.';

const DETECTOR_KEYS = ['coveragePct', 'minBars', 'minWidthPct', 'minAnnualYieldPct', 'maxAnnualYieldPct'];

/** Detector defaults: the backend's (meta) over the Explorer's, logPrice always true. */
const detectorDefaultsOf = (meta) => {
  const d = { ...RECURSIVE_DEFAULT_PARAMS };
  const src = meta?.detectorDefaults || null;
  if (src) DETECTOR_KEYS.forEach((k) => { if (typeof src[k] === 'number') d[k] = src[k]; });
  d.logPrice = true;
  return d;
};

/** The filter definition a run was evaluated with: RunDTO.definition (its version snapshot), else the current filter. */
const runDefinition = (run, filter) => run?.definition || filter || null;

/**
 * @param {Object} props
 * @param {(req: {ticker, timeframe, startDate, endDate, params, view}) => void} props.onOpenInChannels
 * @param {(ticker: string) => void} props.onOpenInBacktest
 * @param {(runs: Array) => void} [props.onSeenRuns] the latest runs are on screen (clears the badge)
 * @param {number|null} [props.latestRunId] bumps (badge poll) → reload the list
 * @param {{view: string, filterId: number|null, runId: number|null}|null} [props.route] the
 *   Screener part of the current history entry (navigation/route.js); null while the tab is hidden.
 *   A route that differs from what is on screen (Back / Forward, a reload, a pasted link) is
 *   applied; one that matches changes nothing (no new requests)
 * @param {(route: {view, filterId?, runId?}, opts?: {replace?: boolean}) => void} [props.onRouteChange]
 *   a deliberate move (sub-tab, filter, run, Run now) pushes an entry; the auto-chosen latest run and
 *   corrected ids replace the current one
 */
function ScreenerPanel({
  onOpenInChannels, onOpenInBacktest, onSeenRuns, latestRunId = null, route = null, onRouteChange = null,
}) {
  const [view, setView] = useState(() => route?.view || 'filters');
  const [meta, setMeta] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [filters, setFilters] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rowMessages, setRowMessages] = useState({});
  const [editorDraft, setEditorDraft] = useState(null);
  const [editorKey, setEditorKey] = useState(0);

  // Results view
  const [resultsFilterId, setResultsFilterId] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [diff, setDiff] = useState(null);
  const [runError, setRunError] = useState(null);
  const [backtestBusy, setBacktestBusy] = useState(null);
  const [backtestMsg, setBacktestMsg] = useState(null);
  const [indicatorSets, setIndicatorSets] = useState(() => new Map());
  const runSeq = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; runSeq.current += 1; }; }, []);

  // Latest route / callback for the async loaders (an auto-chosen run is written into the entry only
  // while that entry is still the one on screen).
  const routeRef = useRef(route);
  const onRouteChangeRef = useRef(onRouteChange);
  useEffect(() => { routeRef.current = route; onRouteChangeRef.current = onRouteChange; }, [route, onRouteChange]);
  const pushRoute = (next) => onRouteChange?.(next);

  const detectorDefaults = useMemo(() => detectorDefaultsOf(meta), [meta]);
  const schedulesById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const loadFilters = useCallback(async () => {
    try {
      const fs = await listFilters();
      if (!alive.current) return;
      setFilters(fs);
      setLoadError(null);
      onSeenRuns?.(fs.map((f) => f.lastRun).filter(Boolean));
    } catch (err) {
      if (!alive.current) return;
      setFilters((prev) => prev ?? []);
      setLoadError(err.status === 404 && !err.detail ? NOT_AVAILABLE : `Could not load filters: ${describeApiError(err)}`);
    }
  }, [onSeenRuns]);

  useEffect(() => {
    getScreenerMeta().then((m) => alive.current && setMeta(m)).catch(() => {});
    loadFilters();
    // Indicator set per universe member: decides whether "Backtest" prepares first.
    listMembers().then((ms) => {
      if (alive.current) setIndicatorSets(new Map(ms.map((m) => [m.ticker, m.indicatorSet])));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Schedules: from meta when it lists them, else the Downloader's list.
  useEffect(() => {
    if (Array.isArray(meta?.schedules) && meta.schedules.length) {
      setSchedules(meta.schedules);
      return;
    }
    fetchSchedules().then((s) => alive.current && setSchedules(Array.isArray(s) ? s : [])).catch(() => {});
  }, [meta]);

  // A new run appeared (badge poll) → reload the list.
  const lastLatest = useRef(latestRunId);
  useEffect(() => {
    if (lastLatest.current === latestRunId) return;
    lastLatest.current = latestRunId;
    loadFilters();
  }, [latestRunId, loadFilters]);

  const setRowMessage = (id, msg) => setRowMessages((prev) => ({ ...prev, [id]: msg }));

  // ---- results ----

  const filterById = (id) => (filters || []).find((f) => f.id === id) || null;

  const showRun = useCallback(async (id) => {
    const seq = ++runSeq.current;
    setRunId(id);
    setRun(null);
    setDiff(null);
    setRunError(null);
    setBacktestMsg(null);
    if (id == null) return;
    try {
      const final = await pollUntil({
        load: () => getRun(id),
        isDone: (r) => RUN_TERMINAL.has(r?.status),
        onUpdate: (r) => { if (seq === runSeq.current) setRun(r); },
        isCancelled: () => seq !== runSeq.current,
        intervalMs: 2000,
      });
      if (!final || seq !== runSeq.current) return;
      if (final.status === 'FAILED') {
        setRunError(`The run failed: ${final.message || 'unknown error'}`);
        return;
      }
      // RunDTO embeds the diff of a finished run; /diff is the fallback.
      if (final.diff) {
        setDiff(final.diff);
      } else {
        try {
          const d = await getRunDiff(id);
          if (seq === runSeq.current) setDiff(d);
        } catch (err) {
          if (seq === runSeq.current && err.status !== 404) setRunError(`Diff: ${describeApiError(err)}`);
        }
      }
      loadFilters();
    } catch (err) {
      if (seq !== runSeq.current) return;
      if (err.status === 404) {
        // An unknown run id (a stale or hand-edited link): say so and drop it from the URL.
        setRunId(null);
        setRunError(`Run #${id} not found.`);
        const r = routeRef.current;
        if (r?.view === 'results' && r.runId === id) {
          onRouteChangeRef.current?.({ view: 'results', filterId: r.filterId, runId: null }, { replace: true });
        }
        return;
      }
      setRunError(describeApiError(err));
    }
  }, [loadFilters]);

  const openResults = useCallback(async (filterId, preferRunId = null) => {
    setView('results');
    setResultsFilterId(filterId);
    setRuns([]);
    // The run is known (or "none yet") right away, so the route reconciliation below sees the
    // state it asked for and does not load the run a second time.
    runSeq.current += 1;
    // Any later showRun / openResults / route reset bumps runSeq: this list response is then stale.
    const seq = runSeq.current;
    setRunId(preferRunId);
    setRun(null);
    setDiff(null);
    setRunError(null);
    if (filterId == null) { showRun(null); return; }
    try {
      const rs = await listFilterRuns(filterId, 30);
      if (!alive.current || seq !== runSeq.current) return;
      setRuns(rs);
      const target = preferRunId ?? rs[0]?.id ?? null;
      showRun(target);
      // The latest run was chosen for a bare "?filter=": write it into the same history entry.
      const r = routeRef.current;
      if (preferRunId == null && target != null && r?.view === 'results' && r.filterId === filterId && r.runId == null) {
        onRouteChangeRef.current?.({ view: 'results', filterId, runId: target }, { replace: true });
      }
    } catch (err) {
      if (!alive.current || seq !== runSeq.current) return;
      setRunError(describeApiError(err));
      if (preferRunId != null) showRun(preferRunId);
    }
  }, [showRun]);

  // ---- filter actions ----

  const rowAction = async (f, fn) => {
    setBusyId(f.id);
    setRowMessage(f.id, null);
    try {
      const msg = await fn();
      if (msg) setRowMessage(f.id, { kind: 'ok', text: msg });
    } catch (err) {
      setRowMessage(f.id, { kind: 'error', text: describeApiError(err) });
    } finally {
      setBusyId(null);
      loadFilters();
    }
  };

  const handleRunNow = async (f) => {
    setBusyId(f.id);
    setRowMessage(f.id, null);
    try {
      const r = await runFilterNow(f.id);
      setBusyId(null);
      const newRunId = r?.runId ?? r?.id ?? null;
      openResults(f.id, newRunId);
      pushRoute({ view: 'results', filterId: f.id, runId: newRunId });
    } catch (err) {
      setBusyId(null);
      if (err.status === 409 && err.runId != null) {
        openResults(f.id, err.runId);
        pushRoute({ view: 'results', filterId: f.id, runId: err.runId });
        return;
      }
      setRowMessage(f.id, { kind: 'error', text: err.status === 409 ? 'This filter is already queued or running.' : describeApiError(err) });
    }
  };

  const handleToggleActive = (f, active) => rowAction(f, async () => {
    await patchFilter(f.id, { active });
    return null;
  });

  const handleDuplicate = (f) => {
    const name = window.prompt('Name of the copy:', `${f.name} (copy)`);
    if (!name || !name.trim()) return;
    rowAction(f, async () => {
      try {
        await duplicateFilter(f.id, name.trim());
      } catch (err) {
        if (err.status === 409) throw new Error(`A filter named "${name.trim()}" already exists.`);
        throw err;
      }
      return `Copied as "${name.trim()}"`;
    });
  };

  const handleDelete = (f) => {
    if (!window.confirm(`Delete the filter "${f.name}"? It disappears from the list; its past runs are kept.`)) return;
    rowAction(f, async () => {
      try {
        await deleteFilter(f.id);
      } catch (err) {
        if (err.status !== 404) throw err;
      }
      if (resultsFilterId === f.id) setResultsFilterId(null);
      return null;
    });
  };

  const openEditor = (draft) => {
    setEditorDraft(draft);
    setEditorKey((k) => k + 1);
    setView('filters');
  };

  const handleNew = () => openEditor({
    id: null, name: '', note: '', startDate: meta?.defaultStartDate || DEFAULT_START_DATE, detectorParams: { ...detectorDefaults },
    active: true, scheduleIds: [], conditions: [], version: null,
  });

  const handleEdit = async (f) => {
    setBusyId(f.id);
    try {
      const full = await getFilter(f.id).catch(() => f); // the list DTO is the fallback
      openEditor(fromFilterDTO(full || f, detectorDefaults));
    } finally {
      setBusyId(null);
    }
  };

  const handleSaved = (saved, warnings) => {
    setEditorDraft(null);
    setNotice(warnings.length
      ? { kind: 'warn', text: `Saved "${saved?.name ?? ''}". ${warnings.join(' ')}` }
      : { kind: 'ok', text: `Saved "${saved?.name ?? ''}"${saved?.version != null ? ` (v${saved.version})` : ''}.` });
    loadFilters();
  };

  // ---- transitions ----

  const resultsFilter = filterById(resultsFilterId);
  const definition = runDefinition(run, resultsFilter);
  const resultsDraft = useMemo(() => (definition ? fromFilterDTO(definition, detectorDefaults) : null), [definition, detectorDefaults]);
  const versionMismatch = run?.filterVersion != null && resultsFilter?.version != null
    && run.filterVersion !== resultsFilter.version && !run?.definition;

  // Explorer: TF of the first channel-metric condition (else DAY), the filter's start date and
  // detector params, end = the run's basis day — the channel the metric was computed on.
  const openInChannels = (row, r, draft) => {
    if (!draft) return;
    const metric = (draft.conditions || []).find((c) => c.type === 'CHANNEL_METRIC');
    const timeframe = metric?.tf || 'DAY';
    const endDate = r?.basisDay ? fmtDay(r.basisDay) : exchangeToday();
    onOpenInChannels({
      ticker: row.ticker,
      timeframe,
      startDate: draft.startDate,
      endDate,
      params: { ...draft.detectorParams, logPrice: true },
      view: 'FULL',
    });
  };

  const handleBacktest = async (row) => {
    setBacktestMsg(null);
    const set = row.indicatorSet || indicatorSets.get(row.ticker) || null;
    if (set === 'FULL') { onOpenInBacktest(row.ticker); return; }
    setBacktestBusy(row.ticker);
    const result = await prepareAndWait(row.ticker, { isCancelled: () => !alive.current });
    if (!alive.current) return;
    setBacktestBusy(null);
    if (result.status === 'READY' || result.status === 'NOT_MEMBER') {
      setIndicatorSets((prev) => new Map(prev).set(row.ticker, 'FULL'));
      onOpenInBacktest(row.ticker);
      return;
    }
    setBacktestMsg({ ticker: row.ticker, text: result.text });
  };

  // Deliberate moves: the state changes here and an entry is pushed with the same values, so the
  // reconciliation below finds nothing to do.
  const switchView = (v) => {
    if (v === view) return;
    setView(v);
    if (v !== 'results') { pushRoute({ view: v }); return; }
    if (resultsFilterId == null && filters?.length) {
      openResults(filters[0].id);
      pushRoute({ view: 'results', filterId: filters[0].id, runId: null });
      return;
    }
    pushRoute({ view: 'results', filterId: resultsFilterId, runId: resultsFilterId != null ? runId : null });
  };

  const selectFilter = (filterId) => {
    openResults(filterId);
    pushRoute({ view: 'results', filterId, runId: null });
  };

  const selectRun = (id) => {
    showRun(id);
    pushRoute({ view: 'results', filterId: resultsFilterId, runId: id });
  };

  // Route → state (Back / Forward, a reload, a pasted link). Waits for the filter list to check the
  // filter id; an unknown one is reported and dropped from the URL (replace).
  const filtersLoaded = filters !== null;
  useEffect(() => {
    if (!route) return; // hidden tab: nothing to apply
    if (route.view !== view) setView(route.view);
    if (route.view !== 'results') return;
    const clearResults = () => {
      runSeq.current += 1;
      setResultsFilterId(null);
      setRuns([]);
      setRunId(null);
      setRun(null);
      setDiff(null);
    };
    if (route.filterId == null) {
      if (resultsFilterId != null) clearResults();
      return;
    }
    if (route.filterId !== resultsFilterId) {
      if (!filtersLoaded) return;
      if (!(filters || []).some((f) => f.id === route.filterId)) {
        clearResults();
        setRunError(`Filter #${route.filterId} not found.`);
        onRouteChange?.({ view: 'results', filterId: null, runId: null }, { replace: true });
        return;
      }
      openResults(route.filterId, route.runId);
      return;
    }
    if (route.runId != null && route.runId !== runId) showRun(route.runId);
    // Only a route change (or the filter list arriving) is applied; the panel's own moves already
    // match the route they push.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, filtersLoaded]);

  return (
    <div className="flex flex-col gap-6" data-testid="screener-panel">
      <div className="screener-subtabs" role="tablist" aria-label="Screener views">
        {VIEWS.map((v) => (
          <button key={v.value} type="button" role="tab" aria-selected={view === v.value}
            className={`screener-subtab${view === v.value ? ' screener-subtab--active' : ''}`}
            onClick={() => switchView(v.value)} data-testid={`screener-view-${v.value}`}>
            {v.label}
          </button>
        ))}
      </div>

      {loadError && view !== 'universe' && <div className="form-error" role="alert" data-testid="screener-error">{loadError}</div>}
      {notice && view === 'filters' && !editorDraft && (
        <div className={`p-2 rounded text-sm border ${notice.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`} role="status">
          {notice.text}
          <button type="button" className="ml-2 text-xs underline" onClick={() => setNotice(null)}>dismiss</button>
        </div>
      )}

      {view === 'filters' && (editorDraft ? (
        <FilterEditor
          key={editorKey}
          initialDraft={editorDraft}
          detectorDefaults={detectorDefaults}
          schedules={schedules}
          onSaved={handleSaved}
          onCancel={() => setEditorDraft(null)}
          onOpenTicker={openInChannels}
        />
      ) : filters === null ? <p className="text-sm text-gray-500">Loading…</p> : (
        <FilterList
          filters={filters}
          schedulesById={schedulesById}
          busyId={busyId}
          rowMessages={rowMessages}
          onNew={handleNew}
          onRunNow={handleRunNow}
          onResults={(f) => selectFilter(f.id)}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
        />
      ))}

      {view === 'results' && (
        <div className="bg-white p-6 rounded-lg shadow" data-testid="screener-results">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="sr-filter">Filter</label>
              <select id="sr-filter" className="p-2 border rounded text-sm bg-white min-w-[14rem]" value={resultsFilterId ?? ''}
                onChange={(e) => selectFilter(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">—</option>
                {(filters || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="sr-run">Run</label>
              <select id="sr-run" className="p-2 border rounded text-sm bg-white min-w-[16rem]" value={runId ?? ''}
                onChange={(e) => selectRun(e.target.value === '' ? null : Number(e.target.value))} disabled={!runs.length && runId == null}>
                {runId != null && !runs.some((r) => r.id === runId) && <option value={runId}>#{runId} (current)</option>}
                {runId == null && <option value="">{runs.length ? '—' : 'no runs'}</option>}
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} · {fmtDay(r.basisDay)} · {r.status}{r.passCount != null ? ` · PASS ${r.passCount}` : ''}{r.triggerKind ? ` · ${r.triggerKind}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {resultsFilter && (
              <button type="button" className="py-2 px-3 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 text-sm"
                onClick={() => handleRunNow(resultsFilter)} disabled={busyId === resultsFilter.id}>
                Run now
              </button>
            )}
          </div>

          {runError && <div className="form-error mb-3" role="alert">{runError}</div>}
          {versionMismatch && (
            <div className="mb-3 text-xs text-amber-700">
              This run used filter v{run.filterVersion}; the columns follow the current v{resultsFilter.version}.
            </div>
          )}
          {backtestMsg && (
            <div className="mb-3 p-2 rounded text-sm border bg-amber-50 border-amber-200 text-amber-800" role="status">
              {backtestMsg.text}
              <button type="button" className="ml-2 underline text-xs" onClick={() => onOpenInBacktest(backtestMsg.ticker)}>Open Backtest anyway</button>
            </div>
          )}

          {resultsFilterId == null ? (
            <p className="text-sm text-gray-500">Choose a filter.</p>
          ) : runId == null ? (
            runs.length === 0 && !runError
              ? <p className="text-sm text-gray-500">This filter has no runs yet — press “Run now”.</p>
              : <p className="text-sm text-gray-500">Choose a run.</p>
          ) : !run ? (
            <p className="text-sm text-gray-500">Loading the run…</p>
          ) : !RUN_TERMINAL.has(run.status) ? (
            <p className="text-sm text-gray-500" data-testid="screener-run-progress">
              Run #{run.id ?? runId}: {run.status}
              {Number.isFinite(run.done) && Number.isFinite(run.total) ? ` — ${run.done}/${run.total} tickers` : ''}…
            </p>
          ) : run.status === 'FAILED' ? null : (
            <RunResults
              run={run}
              diff={diff}
              conditions={resultsDraft?.conditions || []}
              labels={run.conditionLabels}
              evalTf={run.evalTf || evalTfOf(resultsDraft?.conditions || [])}
              onOpenTicker={(row) => openInChannels(row, run, resultsDraft)}
              onBacktest={handleBacktest}
              busyTicker={backtestBusy}
            />
          )}
        </div>
      )}

      {view === 'universe' && <UniversePanel />}
    </div>
  );
}

export default memo(ScreenerPanel);
