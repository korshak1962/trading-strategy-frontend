// src/components/downloader/RefillPanel.jsx
//
// "Refill" block of the Data check section: probe (read-only dry run) → per-gap review →
// apply (a download job with trigger REFILL) → refill report + automatic re-scan.
// Contract: screener logs/agents/architect_refill_gaps.md §2.2, §3.3, §5, §7.1, §7.3 and the
// owner's decisions of 2026-10-30 (thresholds OK ≤ 0.2 %, SUSPECT ≤ 2 % only with an explicit
// checkbox, > 2 % refused; probe lives 30 min; partial days reported only; reference tickers
// need an explicit confirmation and an explicit day list).
import { useState, useEffect, useRef, Fragment } from 'react';
import {
  fetchSources, probeRefill, fetchRefillProbe, applyRefill, fetchReferenceHints,
} from '../../api/downloaderApi';
import { exchangeToday, exchangeZoneForMarket } from '../../utils/dates';
import { StatusBadge, RefillReport } from './DownloadJobTable';
import { REFILL_TIMEFRAMES, REFERENCE_TICKERS } from './timeFrames';

const PROBE_POLL_MS = 1000;
const PROBE_TTL_MS = 30 * 60 * 1000;
const TERMINAL = new Set(['DONE', 'FAILED', 'CANCELLED']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const VERDICT_CLASS = {
  OK: 'bg-green-100 text-green-800',
  FULL: 'bg-green-100 text-green-800',
  FILLABLE: 'bg-green-100 text-green-800',
  SUSPECT: 'bg-amber-100 text-amber-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  NO_OVERLAP: 'bg-slate-100 text-slate-700',
  EMPTY: 'bg-gray-100 text-gray-600',
  SCALE_MISMATCH: 'bg-red-100 text-red-800',
  REFUSED: 'bg-red-100 text-red-800',
};

const Verdict = ({ v, title }) => (
  <span title={title} className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${VERDICT_CLASS[v] || 'bg-gray-100 text-gray-700'}`}>
    {v || '—'}
  </span>
);

const marketOf = (ticker) => (ticker.endsWith('_MOEX') ? 'MOEX' : 'US');

const fmtBar = (s) => (s == null || s === ''
  ? '—'
  : String(s).replace('T', ' ').replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?$/, '$1').replace(/ 00:00$/, ''));
const dayOf = (s) => String(s || '').slice(0, 10);
const fmtInt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const pct = (n, d) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const ratioText = (n, d) => `${fmtInt(n)} / ${fmtInt(d)} (${pct(n, d)})`;

// A coverage value from the backend: a ready string ("78 / 78 (100%)") or an object
// {numerator|count|n, denominator|total|of}. Never a bare count.
const fmtCoverage = (v) => {
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof v.text === 'string' && v.text) return v.text; // Ratio DTO
  if (v && typeof v === 'object') {
    const n = [v.numerator, v.count, v.n, v.value].find((x) => typeof x === 'number');
    const d = [v.denominator, v.total, v.of, v.expected].find((x) => typeof x === 'number');
    if (typeof n === 'number' && typeof d === 'number') return ratioText(n, d);
  }
  return '—';
};

const dayCoverage = (d) => (d.coverage ? fmtCoverage(d.coverage)
  : (typeof d.bars === 'number' && typeof d.expectedBars === 'number' ? ratioText(d.bars, d.expectedBars) : '—'));

// medianCloseRatio 1.00002 → "×1.00002 (+0.002 %)"
const fmtRatio = (r) => {
  if (typeof r !== 'number') return '—';
  const dev = (r - 1) * 100;
  return `×${r.toFixed(5)} (${dev >= 0 ? '+' : ''}${dev.toFixed(3)} %)`;
};

const daysBetween = (isoA, isoB) => Math.round((Date.parse(`${isoB}T00:00:00Z`) - Date.parse(`${isoA}T00:00:00Z`)) / 86400000);

// Decision 0.17: the source's history limit (days) for a timeframe; absent = no known limit.
const historyLimitFor = (source, tf) => {
  const map = source?.historyLimitDays;
  if (map && typeof map === 'object') {
    const n = map[tf];
    return typeof n === 'number' && n > 0 ? n : null;
  }
  return tf === 'MIN5' && source?.maxIntradayHistoryDays > 0 ? source.maxIntradayHistoryDays : null;
};

// What apply may do with a probed gap (§3.3): ok / suspect / unverified need a FULL day;
// a scale mismatch is refused without override; partial days are never written in v1.
const assessGap = (g) => {
  const days = Array.isArray(g.days) ? g.days : [];
  const full = days.filter((d) => d.verdict === 'FULL');
  const partial = days.filter((d) => d.verdict === 'PARTIAL');
  const nv = g.neighbourCheck?.verdict;
  // RefillGapDTO is authoritative when it says so: `applicable` + `needs`
  // (null | "acceptSuspect" | "acceptUnverified").
  if (typeof g.applicable === 'boolean') {
    if (!g.applicable) {
      const refused = g.verdict === 'REFUSED' || nv === 'SCALE_MISMATCH';
      return {
        mode: refused ? 'refused' : 'none', full, partial,
        reason: g.reason || g.neighbourCheck?.reason || (refused
          ? 'Scale differs from the stored neighbours by more than 2 % — refused, no override.'
          : (partial.length > 0 ? 'Only partial days — partial days are not refilled in v1.' : 'Nothing to write.')),
      };
    }
    if (g.needs === 'acceptSuspect') return { mode: 'suspect', full, partial };
    if (g.needs === 'acceptUnverified') return { mode: 'unverified', full, partial };
    return { mode: 'ok', full, partial };
  }
  if (g.verdict === 'REFUSED' || nv === 'SCALE_MISMATCH') {
    return { mode: 'refused', full, partial, reason: g.reason || 'Scale differs from the stored neighbours by more than 2 % — refused, no override.' };
  }
  if (g.verdict === 'EMPTY' || full.length === 0) {
    return {
      mode: 'none', full, partial,
      reason: g.reason || (partial.length > 0
        ? 'Only partial days — partial days are not refilled in v1.'
        : 'The source returned no bars for these days.'),
    };
  }
  if (nv === 'SUSPECT') return { mode: 'suspect', full, partial };
  if (nv === 'NO_OVERLAP') return { mode: 'unverified', full, partial };
  return { mode: 'ok', full, partial };
};

const NeighbourSide = ({ label, side }) => {
  if (!side || typeof side !== 'object') return <div className="text-xs text-gray-500">{label}: —</div>;
  return (
    <div className="text-xs whitespace-nowrap">
      {label}{side.day ? ` ${side.day}` : ''}: {side.matched ? <>{fmtCoverage(side.matched)} keys</> : '—'}
      {side.verdict && <> <Verdict v={side.verdict} /></>}
      <span className="block text-gray-600">
        close {fmtRatio(side.medianCloseRatio)}
        {side.withinHalfPct && <> · within 0.5 %: {fmtCoverage(side.withinHalfPct)}</>}
      </span>
    </div>
  );
};

/**
 * @param {string}   ticker       scanned ticker as stored
 * @param {Array}    blocks       the /gaps result of that ticker
 * @param {string}   initialTf    timeframe the panel opens with
 * @param {string[]} initialGaps  lastBefore of the gaps to probe (null = all of the TF)
 * @param {boolean}  jobActive    a download job is QUEUED/RUNNING → Probe / Apply disabled
 * @param {Object}   job          the job shown in the job panel (to see the refill job finish)
 * @param {Function} onJobStarted (jobId, placeholderStatus) → the job panel attaches to it
 * @param {Function} onRescan     re-runs Find gaps for this ticker
 * @param {Function} onClose
 */
export default function RefillPanel({
  ticker, blocks, initialTf, initialGaps, jobActive, job, onJobStarted, onRescan, onClose,
}) {
  const isReference = REFERENCE_TICKERS.has(ticker);
  const market = marketOf(ticker);
  const zone = exchangeZoneForMarket(market);
  const blockByTf = Object.fromEntries((blocks || []).map((b) => [b.timeFrame, b]));
  const gapsOf = (t) => (Array.isArray(blockByTf[t]?.gaps) ? blockByTf[t].gaps : []);
  const tfChoices = REFILL_TIMEFRAMES.filter((t) => (isReference ? blockByTf[t]?.bars > 0 : gapsOf(t).length > 0));
  const lowestGapTf = REFILL_TIMEFRAMES.find((t) => gapsOf(t).length > 0) || null;

  const rootRef = useRef(null);
  const [tf, setTf] = useState(initialTf || tfChoices[0] || 'DAY');
  const [selected, setSelected] = useState(() =>
    new Set(initialGaps && initialTf ? initialGaps : gapsOf(initialTf || tfChoices[0]).map((g) => g.lastBefore)));
  const [sources, setSources] = useState([]);
  const [sourcesError, setSourcesError] = useState(null);
  const [sourceId, setSourceId] = useState(''); // '' = the market's default, picked by the backend

  // reference ticker
  const [daysText, setDaysText] = useState('');
  const [hints, setHints] = useState(null); // null = not loaded; [] = none; 'n/a' = not offered
  const [hintsLoading, setHintsLoading] = useState(false);
  const [hintsError, setHintsError] = useState(null);
  const [confirmReference, setConfirmReference] = useState(false);

  // probe
  const [probeId, setProbeId] = useState(null);
  const [probeStartedMs, setProbeStartedMs] = useState(null);
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState({}); // lastBefore → apply this gap
  const pollInFlight = useRef(false);

  // apply
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [refillJobId, setRefillJobId] = useState(null);
  const [finished, setFinished] = useState(null); // { status, report }
  const handledJob = useRef(null);

  useEffect(() => { rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSources(market)
      .then((s) => { if (!cancelled) setSources(Array.isArray(s) ? s : []); })
      .catch((err) => { if (!cancelled) setSourcesError(err.message); });
    return () => { cancelled = true; };
  }, [market]);

  // Poll the probe while it is RUNNING.
  const probeRunning = !!probeId && (!probe || probe.status === 'RUNNING') && !expired;
  useEffect(() => {
    if (!probeRunning) return undefined;
    const id = setInterval(async () => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        const p = await fetchRefillProbe(probeId);
        if (p.status !== 'RUNNING') {
          // Default choice: gaps whose neighbours check OK; SUSPECT / NO_OVERLAP need a tick.
          const init = {};
          (p.gaps || []).forEach((g) => { init[g.lastBefore] = assessGap(g).mode === 'ok'; });
          setChoice(init);
        }
        setProbe(p);
        setProbeError(null);
      } catch (err) {
        if (err.status === 404) setExpired(true);
        else setProbeError(`Cannot reach the backend, retrying… (${err.message})`);
      } finally {
        pollInFlight.current = false;
      }
    }, PROBE_POLL_MS);
    return () => clearInterval(id);
  }, [probeId, probeRunning]);

  // Clock for the 30-minute probe lifetime.
  useEffect(() => {
    if (!probeStartedMs || expired || refillJobId) return undefined;
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, [probeStartedMs, expired, refillJobId]);

  // The refill job finished → keep its report and re-scan the gaps once.
  useEffect(() => {
    if (!refillJobId || job?.jobId !== refillJobId || !TERMINAL.has(job.status)) return;
    if (handledJob.current === refillJobId) return;
    handledJob.current = refillJobId;
    setFinished({ status: job.status, report: job.refillReport || null });
    onRescan();
  }, [job, refillJobId, onRescan]);

  const remainingMs = probeStartedMs ? probeStartedMs + PROBE_TTL_MS - now : null;
  // RefillProbeDTO.expired is the backend's own TTL verdict (apply → 410); the local clock only
  // drives the "valid for ~N min" hint between polls.
  const ttlOver = expired || probe?.expired === true || (remainingMs != null && remainingMs <= 0);

  // ---- inputs ----
  const tokens = daysText.split(/[\s,;]+/).filter(Boolean);
  const badTokens = tokens.filter((t) => !DAY_RE.test(t));
  const days = [...new Set(tokens.filter((t) => DAY_RE.test(t)))].sort();

  const resetProbe = () => {
    setProbeId(null);
    setProbe(null);
    setProbeStartedMs(null);
    setExpired(false);
    setProbeError(null);
    setApplyError(null);
    setChoice({});
  };

  const changeTf = (t) => {
    setTf(t);
    setSelected(new Set(gapsOf(t).map((g) => g.lastBefore)));
    resetProbe();
  };

  const toggleSelected = (lb) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(lb)) next.delete(lb); else next.add(lb);
    return next;
  });

  // Oldest day the source has to reach, for the history-limit check.
  const oldestDay = isReference
    ? days[0]
    : gapsOf(tf).filter((g) => selected.has(g.lastBefore)).map((g) => dayOf(g.lastBefore)).sort()[0];
  const today = exchangeToday(zone);
  const sourceProblem = (s) => {
    if (!(s.supportedTimeFrames || []).includes(tf)) return `cannot serve ${tf}`;
    const limit = historyLimitFor(s, tf);
    if (limit && oldestDay) {
      const age = daysBetween(oldestDay, today);
      if (age > limit - 1) return `history limit ${limit} days, ${oldestDay} is ${age} days old`;
    }
    return null;
  };
  const chosenSource = sources.find((s) => s.id === sourceId) || null;
  const chosenSourceProblem = chosenSource ? sourceProblem(chosenSource) : null;

  const lowerTfWithGaps = !isReference && lowestGapTf && REFILL_TIMEFRAMES.indexOf(lowestGapTf) < REFILL_TIMEFRAMES.indexOf(tf);

  const loadHints = async () => {
    setHintsLoading(true);
    setHintsError(null);
    try {
      const h = await fetchReferenceHints(ticker);
      setHints(h === null ? 'n/a' : (Array.isArray(h) ? h : []));
    } catch (err) {
      setHintsError(err.message);
    } finally {
      setHintsLoading(false);
    }
  };

  const addDays = (list) => {
    const merged = [...new Set([...days, ...list])].sort();
    setDaysText(merged.join('\n'));
    resetProbe();
  };

  // ---- probe ----
  const probeBlocker = (() => {
    if (jobActive) return 'A download job is running — probe and apply are disabled until it finishes.';
    if (isReference) {
      if (badTokens.length) return `Not a date (yyyy-MM-dd): ${badTokens.slice(0, 5).join(', ')}`;
      if (days.length === 0) return `${ticker} is the reference calendar and cannot see its own gaps: enter the days to refill.`;
    } else if (selected.size === 0) {
      return 'Select at least one gap.';
    }
    if (chosenSourceProblem) return `${chosenSource.label || chosenSource.id}: ${chosenSourceProblem}`;
    return null;
  })();

  const handleProbe = async () => {
    resetProbe();
    setFinished(null);
    setRefillJobId(null);
    setProbing(true);
    const body = { ticker, timeFrame: tf };
    if (sourceId) body.source = sourceId;
    if (isReference) {
      body.days = days;
      if (confirmReference) body.confirmReference = true;
    } else {
      body.gaps = gapsOf(tf).map((g) => g.lastBefore).filter((lb) => selected.has(lb));
    }
    try {
      const res = await probeRefill(body);
      if (!res?.probeId) throw new Error('The backend did not return a probe id');
      setProbeStartedMs(Date.now());
      setNow(Date.now());
      setProbeId(res.probeId);
    } catch (err) {
      if (err.status === 409 && err.probeId) {
        setProbeError(`${err.detail || 'Another probe is running'} — showing that probe.`);
        setProbeStartedMs(Date.now());
        setProbeId(err.probeId);
      } else if (err.status === 409) {
        setProbeError(err.detail || 'A download job or gap delete is running — try again when it finishes.');
      } else {
        setProbeError(err.detail || err.message);
      }
    } finally {
      setProbing(false);
    }
  };

  // ---- apply ----
  const probeGaps = Array.isArray(probe?.gaps) ? probe.gaps : [];
  const assessed = probeGaps.map((g) => ({ g, a: assessGap(g) }));
  const applicable = assessed.filter(({ a }) => a.mode !== 'refused' && a.mode !== 'none');
  const chosen = applicable.filter(({ g }) => choice[g.lastBefore]);
  const chosenDays = chosen.reduce((n, { a }) => n + a.full.length, 0);
  const allDays = probeGaps.reduce((n, g) => n + (g.days?.length || 0), 0);
  const chosenBars = chosen.reduce((n, { g, a }) => n + (typeof g.barsToWrite === 'number'
    ? g.barsToWrite
    : a.full.reduce((s, d) => s + (d.bars || 0), 0)), 0);
  const chosenExpected = chosen.reduce((n, { a }) => n + a.full.reduce((s, d) => s + (d.expectedBars || 0), 0), 0);
  const partialDays = assessed.reduce((n, { a }) => n + a.partial.length, 0);
  const probeWarnings = [
    ...(Array.isArray(probe?.warnings) ? probe.warnings : []),
    ...(probe?.gridWarning ? [probe.gridWarning] : []),
  ].filter((w) => typeof w === 'string' && w);

  const applyBlocker = (() => {
    if (!probe || probe.status !== 'DONE') return 'Run a probe first.';
    if (refillJobId) return 'This probe was applied.';
    if (ttlOver) return 'The probe expired (30 min) — run a new probe.';
    if (jobActive) return 'A download job is running — apply after it finishes.';
    if (chosen.length === 0) return 'Nothing selected to apply.';
    if (isReference && !confirmReference) return `Tick the ${ticker} confirmation first.`;
    return null;
  })();

  const handleApply = async () => {
    setApplyError(null);
    setApplying(true);
    const body = {
      gaps: chosen.map(({ g }) => g.lastBefore),
      acceptSuspect: chosen.filter(({ a }) => a.mode === 'suspect').map(({ g }) => g.lastBefore),
      acceptUnverified: chosen.filter(({ a }) => a.mode === 'unverified').map(({ g }) => g.lastBefore),
      includePartial: false,
    };
    if (isReference) body.confirmReference = true;
    try {
      const res = await applyRefill(probeId, body);
      if (!res?.jobId) throw new Error('The backend did not return a job id');
      handledJob.current = null;
      setRefillJobId(res.jobId);
      onJobStarted(res.jobId, 'QUEUED');
    } catch (err) {
      if (err.status === 404 || err.status === 410) {
        setExpired(true);
        setApplyError('The probe is gone (expired after 30 min, or the backend restarted) — run a new probe.');
      } else if (err.status === 409 && err.jobId) {
        setApplyError(`${err.detail || 'A download job is already running'} — showing that job. Apply again when it finishes.`);
        onJobStarted(err.jobId, 'RUNNING');
      } else if (err.status === 409) {
        setApplyError(err.detail || 'The backend refused to start the refill (409 Conflict).');
      } else {
        setApplyError(err.detail || err.message);
      }
    } finally {
      setApplying(false);
    }
  };

  const refillJobRunning = !!refillJobId && !finished;

  return (
    <div ref={rootRef} className="mt-4 p-4 rounded-lg border border-blue-200 bg-blue-50/40" data-testid="refill-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="font-semibold text-lg">Refill missing days · {ticker}</h3>
        <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:underline">Close</button>
      </div>
      <p className="mb-3 text-sm text-gray-600">
        Step 1 — <b>Probe</b> asks the source for the missing days and writes nothing. Step 2 — <b>Apply</b> inserts
        exactly what the probe showed (existing rows are never overwritten); higher timeframes are aggregated and
        indicators recalculated. Partial days are only reported, not refilled.
      </p>

      {/* ---- inputs ---- */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rf-tf" className="block text-sm font-medium text-gray-700 mb-1">Fill timeframe</label>
          <select
            id="rf-tf"
            value={tf}
            onChange={(e) => changeTf(e.target.value)}
            disabled={probing || refillJobRunning}
            className="p-2 border rounded bg-white"
          >
            {tfChoices.length === 0 && <option value={tf}>{tf}</option>}
            {tfChoices.map((t) => (
              <option key={t} value={t}>
                {t}{!isReference ? ` — ${gapsOf(t).length} gap${gapsOf(t).length === 1 ? '' : 's'}` : ''}
                {t === lowestGapTf && !isReference ? ' (lowest)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[16rem]">
          <label htmlFor="rf-source" className="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <select
            id="rf-source"
            value={sourceId}
            onChange={(e) => { setSourceId(e.target.value); resetProbe(); }}
            disabled={probing || refillJobRunning}
            className="w-full p-2 border rounded bg-white"
          >
            <option value="">Market default (backend picks one that can serve {tf})</option>
            {sources.map((s) => {
              const problem = sourceProblem(s);
              return (
                <option key={s.id} value={s.id} disabled={!!problem} title={problem || undefined}>
                  {s.label || s.id}{problem ? ` — ${problem}` : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      {sourcesError && <div className="form-error" role="alert">{sourcesError}</div>}
      {lowerTfWithGaps && (
        <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="note">
          {lowestGapTf} has gaps too. Filling at {tf} closes the gap in {tf} and above only — it stays in {lowestGapTf}
          {' '}and Find gaps keeps showing it there. Fill at {lowestGapTf} unless its source cannot reach these days.
        </div>
      )}

      {!isReference && (
        <div className="mt-3">
          <p className="text-sm font-medium text-gray-700 mb-1">
            Gaps to probe: {selected.size} / {gapsOf(tf).length} selected
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {gapsOf(tf).map((g) => (
              <label key={g.lastBefore} className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(g.lastBefore)}
                  onChange={() => { toggleSelected(g.lastBefore); resetProbe(); }}
                  disabled={probing || refillJobRunning}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {fmtBar(g.lastBefore)} → {fmtBar(g.firstAfter)}
                <span className="text-gray-500">({fmtInt(g.missingDays)} day{g.missingDays === 1 ? '' : 's'})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {isReference && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="rf-days" className="block text-sm font-medium text-gray-700 mb-1">
              Days to refill (yyyy-MM-dd, one per line or comma-separated)
            </label>
            <textarea
              id="rf-days"
              rows={5}
              value={daysText}
              onChange={(e) => { setDaysText(e.target.value); resetProbe(); }}
              disabled={probing || refillJobRunning}
              placeholder="2020-02-18"
              className="w-full p-2 border rounded font-mono text-sm bg-white"
            />
            <p className="text-xs text-gray-500">
              {days.length} valid day{days.length === 1 ? '' : 's'}
              {badTokens.length > 0 && <span className="text-red-700"> · {badTokens.length} not a date</span>}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-700">Hint list</span>
              <button
                type="button"
                onClick={loadHints}
                disabled={hintsLoading}
                className="px-2 py-0.5 rounded border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs disabled:border-gray-300 disabled:text-gray-400"
              >
                {hintsLoading ? 'Loading…' : (hints ? 'Reload' : 'Load')}
              </button>
              {Array.isArray(hints) && hints.length > 0 && (
                <button
                  type="button"
                  onClick={() => addDays(hints.map((h) => dayOf(h.day ?? h.date)))}
                  disabled={refillJobRunning}
                  className="px-2 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                >
                  Add all
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-1">
              Days where ≥ 50 % of the market&apos;s tickers have a bar and {ticker} does not.
            </p>
            {hintsError && <div className="form-error" role="alert">{hintsError}</div>}
            {hints === 'n/a' && <p className="text-sm text-gray-500">The backend does not offer the hint list — enter the days manually.</p>}
            {Array.isArray(hints) && hints.length === 0 && <p className="text-sm text-green-700">No such days.</p>}
            {Array.isArray(hints) && hints.length > 0 && (
              <ul className="max-h-32 overflow-auto text-sm border rounded bg-white divide-y">
                {hints.map((h) => {
                  const d = dayOf(h.day ?? h.date);
                  const n = h.tickersWithBar ?? h.withBar ?? h.count;
                  const total = h.tickersTotal ?? h.total ?? h.of;
                  const shareText = fmtCoverage(h.share); // ReferenceHintDTO.share (Ratio)
                  return (
                    <li key={d} className="flex items-center justify-between px-2 py-0.5">
                      <span>
                        {d}{' '}
                        {shareText !== '—'
                          ? <span className="text-gray-500">— {shareText} tickers have a bar</span>
                          : typeof n === 'number' && typeof total === 'number' && (
                            <span className="text-gray-500">— {ratioText(n, total)} tickers have a bar</span>
                          )}
                      </span>
                      <button
                        type="button"
                        onClick={() => addDays([d])}
                        disabled={days.includes(d) || refillJobRunning}
                        className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                      >
                        {days.includes(d) ? 'added' : 'Add'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <label className="md:col-span-2 flex items-start gap-2 p-2 rounded bg-red-50 border border-red-300 text-red-800 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={confirmReference}
              onChange={(e) => setConfirmReference(e.target.checked)}
              disabled={refillJobRunning}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>
              I understand that {ticker} is the trading calendar of the whole {market} market: refilling it changes the
              calendar of every {market} ticker (other tickers may suddenly show gaps on these days) and shifts the
              golden regression tests built on {ticker}.
            </span>
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleProbe}
          disabled={!!probeBlocker || probing || probeRunning || refillJobRunning}
          title={probeBlocker || undefined}
          className="bg-blue-600 text-white py-1.5 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {probing || probeRunning ? 'Probing…' : (probe ? 'Probe again' : 'Probe')}
        </button>
        {probeBlocker && !probing && <span className="text-sm text-gray-600">{probeBlocker}</span>}
      </div>
      {probeError && <div className="form-error" role="alert">{probeError}</div>}

      {/* ---- probe result ---- */}
      {probeId && (
        <div className="mt-4" data-testid="refill-probe">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-sm">
            <span className="font-semibold">Probe</span>
            <StatusBadge status={expired ? 'LOST' : (probe?.status || 'RUNNING')} />
            {probe && <span className="text-gray-600">{[probe.ticker, probe.timeFrame, probe.source].filter(Boolean).join(' · ')}</span>}
            {probe?.status === 'DONE' && !refillJobId && (
              <span className={ttlOver ? 'text-red-700' : 'text-gray-500'}>
                {ttlOver
                  ? 'expired — run a new probe'
                  : `valid for ~${Math.max(1, Math.ceil(remainingMs / 60000))} more min (probes expire 30 min after start)`}
              </span>
            )}
          </div>
          {expired && !applyError && (
            <div className="mb-2 p-2 rounded bg-red-50 border border-red-300 text-red-800 text-sm" role="alert">
              The probe is gone (expired after 30 min, or the backend restarted) — run a new probe.
            </div>
          )}
          {probe?.status === 'FAILED' && (
            <div className="form-error" role="alert">Probe failed{probe.error || probe.message ? `: ${probe.error || probe.message}` : ''}</div>
          )}

          {probe && probe.status !== 'RUNNING' && (
            <>
              {probe.totals && (
                <p className="mb-2 text-sm text-gray-700 flex flex-wrap gap-x-5">
                  <span>Gaps <span className="font-semibold">{fmtCoverage(probe.totals.gaps)}</span></span>
                  <span>Days <span className="font-semibold">{fmtCoverage(probe.totals.days)}</span></span>
                  <span>Bars <span className="font-semibold">{fmtCoverage(probe.totals.bars)}</span></span>
                </p>
              )}
              {probe.dayOnlyFallback && (
                <div className="mb-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="note">
                  Fill level {probe.timeFrame} is above the lowest timeframe with this hole: the lower timeframes keep it.
                </div>
              )}
              {probeWarnings.map((w) => (
                <div key={w} className="mb-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="note">{w}</div>
              ))}
              {partialDays > 0 && (
                <div className="mb-2 p-2 rounded bg-slate-50 border border-slate-300 text-slate-700 text-sm" role="note">
                  {partialDays} partial day{partialDays === 1 ? '' : 's'} (fewer bars than the reference): shown for
                  information only — partial days are not refilled in v1.
                </div>
              )}

              {probeGaps.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border bg-white">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-2 py-1 text-left border-b">Gap</th>
                        <th className="px-2 py-1 text-left border-b">Days: bars / expected</th>
                        <th className="px-2 py-1 text-left border-b" title="Source bars of the stored neighbour days vs. the stored ones: OK ≤ 0.2 %, SUSPECT ≤ 2 %, above refused">
                          Neighbours check
                        </th>
                        <th className="px-2 py-1 text-left border-b">Flags</th>
                        <th className="px-2 py-1 text-left border-b">Verdict</th>
                        <th className="px-2 py-1 text-left border-b">Apply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessed.map(({ g, a }) => {
                        const jump = g.continuity?.jumpPct;
                        const jumpFlag = typeof jump === 'number' && (g.continuity?.flagged ?? Math.abs(jump) > 10);
                        const vol = g.volumeRatio;
                        const volFlag = typeof vol === 'number'
                          && (typeof g.volumeFlagged === 'boolean' ? g.volumeFlagged : (vol < 0.33 || vol > 3));
                        const gapWarnings = Array.isArray(g.warnings) ? g.warnings.filter((w) => typeof w === 'string' && w) : [];
                        const canTick = a.mode === 'ok' || a.mode === 'suspect' || a.mode === 'unverified';
                        return (
                          <Fragment key={g.lastBefore}>
                            <tr className="border-b align-top">
                              <td className="px-2 py-1 whitespace-nowrap">
                                {fmtBar(g.lastBefore)}
                                <span className="block text-gray-500">→ {fmtBar(g.firstAfter)}</span>
                              </td>
                              <td className="px-2 py-1">
                                <ul>
                                  {(g.days || []).map((d) => (
                                    <li key={d.day} className="whitespace-nowrap">
                                      {dayOf(d.day)} <span className="tabular-nums">{dayCoverage(d)}</span>{' '}
                                      <Verdict v={d.verdict} title={d.verdict === 'PARTIAL' ? 'Not refilled in v1' : undefined} />
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="px-2 py-1">
                                <NeighbourSide label="before" side={g.neighbourCheck?.before} />
                                <NeighbourSide label="after" side={g.neighbourCheck?.after} />
                                {g.neighbourCheck?.verdict && <div className="mt-0.5"><Verdict v={g.neighbourCheck.verdict} /></div>}
                                {g.neighbourCheck?.reason && (
                                  <span className="block text-xs text-gray-600 max-w-xs">{g.neighbourCheck.reason}</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-xs">
                                {typeof jump === 'number' && (
                                  <span className={`block ${jumpFlag ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}
                                    title="|first new open / last close before the gap − 1|; flagged above 10 %">
                                    jump {jump.toFixed(2)} %{jumpFlag ? ' ⚠' : ''}
                                  </span>
                                )}
                                {typeof vol === 'number' && (
                                  <span className={`block ${volFlag ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}
                                    title="Volume of the new days vs. the neighbours' median; flagged outside 0.33…3 (sources count volume differently)">
                                    volume ×{vol.toFixed(2)}{volFlag ? ' ⚠' : ''}
                                  </span>
                                )}
                                {g.hourGrid && (
                                  <span className="block text-gray-600" title="HOUR grid the new days get (decision В4)">
                                    HOUR grid {g.hourGrid === 'CLOCK' ? ':00' : g.hourGrid === 'SESSION' ? ':30' : g.hourGrid}
                                  </span>
                                )}
                                {gapWarnings.map((w) => <span key={w} className="block text-amber-700">{w}</span>)}
                                {typeof jump !== 'number' && typeof vol !== 'number' && !g.hourGrid && gapWarnings.length === 0
                                  && <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-2 py-1">
                                <Verdict v={g.verdict} />
                                {g.reason && <span className="block text-xs text-gray-600 max-w-xs">{g.reason}</span>}
                              </td>
                              <td className="px-2 py-1">
                                {canTick ? (
                                  <label className="flex items-start gap-1 text-xs text-gray-700 cursor-pointer max-w-[14rem]">
                                    <input
                                      type="checkbox"
                                      checked={!!choice[g.lastBefore]}
                                      onChange={() => setChoice((c) => ({ ...c, [g.lastBefore]: !c[g.lastBefore] }))}
                                      disabled={!!refillJobId}
                                      className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>
                                      {a.mode === 'ok' && <>apply {a.full.length} full day{a.full.length === 1 ? '' : 's'}</>}
                                      {a.mode === 'suspect' && <>accept SUSPECT scale (0.2–2 %) and apply {a.full.length} day{a.full.length === 1 ? '' : 's'}</>}
                                      {a.mode === 'unverified' && <>accept unverified (no neighbour bars to compare) and apply {a.full.length} day{a.full.length === 1 ? '' : 's'}</>}
                                    </span>
                                  </label>
                                ) : (
                                  <span className={`text-xs ${a.mode === 'refused' ? 'text-red-700' : 'text-gray-500'}`}>{a.reason}</span>
                                )}
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {probe.status === 'DONE' && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!!applyBlocker || applying}
                    title={applyBlocker || undefined}
                    className="bg-emerald-600 text-white py-1.5 px-4 rounded hover:bg-emerald-700 disabled:bg-gray-400"
                  >
                    {applying ? 'Starting…' : 'Apply'}
                  </button>
                  <span className="text-sm text-gray-700">
                    Gaps <span className="font-semibold">{ratioText(chosen.length, probeGaps.length)}</span>
                    {' · '}days <span className="font-semibold">{ratioText(chosenDays, allDays)}</span>
                    {' · '}bars <span className="font-semibold">{ratioText(chosenBars, chosenExpected)}</span> of expected
                  </span>
                  {applyBlocker && !refillJobId && <span className="text-sm text-gray-600">{applyBlocker}</span>}
                </div>
              )}
              {applyError && <div className="form-error" role="alert">{applyError}</div>}
            </>
          )}
        </div>
      )}

      {/* ---- refill job ---- */}
      {refillJobRunning && (
        <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm" role="status">
          Refill job {refillJobId} is running — progress is shown in the Download job panel above.
        </div>
      )}
      {finished && (
        <div className="mt-3">
          <p className="mb-2 text-sm">
            Refill job <StatusBadge status={finished.status} /> — gaps re-scanned.
          </p>
          {finished.report
            ? <RefillReport report={finished.report} />
            : <p className="text-sm text-gray-500">The job returned no refill report.</p>}
        </div>
      )}
    </div>
  );
}
