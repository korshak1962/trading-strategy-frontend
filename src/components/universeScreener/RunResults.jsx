// src/components/universeScreener/RunResults.jsx
//
// Results of one screener run (stored run or unsaved preview): basis, counts, the diff blocks
// (entered / exited / undetermined / new in universe), and the per-ticker table — status, reason,
// provisional, close, one column per condition (value + ✓ / ✗ / —), flags. Sortable by any column;
// status filter all / PASS / FAIL / not evaluated (PASS by default); "hide duplicates" folds index
// duplicates under their primary member ("SPY +3", expandable). Click a ticker → Channel Explorer.
import { Fragment, useMemo, useState } from 'react';
import {
  conditionShort, conditionCaption, STATUS_CLASS, STATUS_LABEL, reasonText,
} from './conditionFormat';
import { fmtDay, fmtTs } from '../watch/format';

const STATUS_FILTERS = [
  { value: 'PASS', label: 'PASS' },
  { value: 'FAIL', label: 'FAIL' },
  { value: 'NOT_EVALUATED', label: 'Not evaluated' },
  { value: 'ALL', label: 'All' },
];

const STATUS_ORDER = { PASS: 0, FAIL: 1, NOT_EVALUATED: 2 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const fmtVal = (v) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1000) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
};

const mark = (s) => (s === 'PASS' ? '✓' : s === 'FAIL' ? '✗' : '—');
const markClass = (s) => (s === 'PASS' ? 'text-green-700' : s === 'FAIL' ? 'text-red-700' : 'text-gray-400');

/** Sortable value of a condition result: the metric value, else the left operand. */
const condSortValue = (cr) => (cr ? (isNum(cr.value) ? cr.value : cr.left?.value ?? null) : null);

function ConditionCell({ cr, cond, tickerReason }) {
  if (!cr) return <td className="px-2 py-1 text-gray-300">—</td>;
  const isMetric = cond?.type === 'CHANNEL_METRIC';
  const tip = [
    reasonText(cr.reason),
    cr.left ? `left ${fmtVal(cr.left.value)} @ ${fmtDay(cr.left.date)}${cr.left.provisional ? ' (provisional)' : ''}` : null,
    cr.right ? `right ${fmtVal(cr.right.value)}${cr.right.date ? ` @ ${fmtDay(cr.right.date)}` : ''}${cr.right.provisional ? ' (provisional)' : ''}` : null,
    cr.channel ? `channel ${cr.channel.id ?? ''} from ${fmtDay(cr.channel.startDate)}${cr.channel.level != null ? `, level ${cr.channel.level}` : ''}` : null,
    cr.lastBar ? `last bar of the series ${fmtDay(cr.lastBar)}` : null,
    cr.missingDates ? `${cr.missingDates} SPY date(s) without a bar in the window` : null,
  ].filter(Boolean).join('\n');
  return (
    <td className="px-2 py-1 whitespace-nowrap" title={tip || undefined}>
      <span className={`font-semibold mr-1 ${markClass(cr.status)}`}>{mark(cr.status)}</span>
      {isMetric || isNum(cr.value)
        ? <span className="font-mono">{fmtVal(cr.value)}</span>
        : (
          <span className="font-mono">
            {fmtVal(cr.left?.value)}<span className="text-gray-400"> vs </span>{fmtVal(cr.right?.value)}
          </span>
        )}
      {cr.provisional && <span className="ml-1 text-xs text-gray-500" title="A provisional (forming) WEEK[0] took part">ᴾ</span>}
      {cr.status !== 'PASS' && cr.reason && cr.reason !== tickerReason && <div className="text-[11px] text-gray-500">{reasonText(cr.reason)}</div>}
    </td>
  );
}

function TickerChips({ title, tickers, tone, onOpen, testId }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-600 mb-1">{title} ({tickers.length})</div>
      {tickers.length === 0 ? <div className="text-xs text-gray-400">—</div> : (
        <div className="flex flex-wrap gap-1">
          {tickers.map((t) => (
            <button key={t} type="button" onClick={() => onOpen(t)}
              className={`px-1.5 py-0.5 rounded text-xs border ${tone}`} title="Open in Channel Explorer">
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.run normalized RunDTO / preview
 * @param {Object|null} props.diff normalized DiffDTO (stored runs only)
 * @param {Array} props.conditions the run's filter conditions (editor shape), for column headers
 * @param {string[]} [props.labels] RunDTO.conditionLabels (the backend's caption per condition), as header tooltips
 * @param {string} props.evalTf DAY | WEEK
 * @param {(row: Object) => void} props.onOpenTicker → Channel Explorer
 * @param {(row: Object) => void} [props.onBacktest] → Backtest (with "Prepare for strategies" first)
 * @param {string|null} [props.busyTicker] the row whose Backtest transition is running
 */
export default function RunResults({ run, diff = null, conditions = [], labels = null, evalTf = 'DAY', onOpenTicker, onBacktest = null, busyTicker = null }) {
  const [statusFilter, setStatusFilter] = useState('PASS');
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [sort, setSort] = useState({ key: 'ticker', dir: 1 });
  const [expanded, setExpanded] = useState(() => new Set());

  const rows = useMemo(() => run?.results || [], [run]);
  const byTicker = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);

  const counts = useMemo(() => {
    const c = { PASS: 0, FAIL: 0, NOT_EVALUATED: 0, provisional: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; if (r.provisional) c.provisional += 1; });
    return {
      PASS: run?.passCount ?? c.PASS,
      FAIL: run?.failCount ?? c.FAIL,
      NOT_EVALUATED: run?.neCount ?? c.NOT_EVALUATED,
      provisional: run?.provisionalCount ?? c.provisional,
      total: run?.membersTotal ?? rows.length,
    };
  }, [rows, run]);

  // Duplicate groups: primary → [duplicates]. A duplicate whose primary is not in the run stays a
  // standalone row.
  const groups = useMemo(() => {
    const g = new Map();
    rows.forEach((r) => {
      if (r.primaryTicker && r.primaryTicker !== r.ticker && byTicker.has(r.primaryTicker)) {
        if (!g.has(r.primaryTicker)) g.set(r.primaryTicker, []);
        g.get(r.primaryTicker).push(r);
      }
    });
    return g;
  }, [rows, byTicker]);
  const isFolded = (r) => hideDuplicates && r.primaryTicker && r.primaryTicker !== r.ticker && byTicker.has(r.primaryTicker);

  const sortValue = (r, key) => {
    if (key === 'status') return STATUS_ORDER[r.status] ?? 9;
    if (key === 'provisional') return r.provisional ? 1 : 0;
    if (key === 'flags') return r.flags.join(',');
    if (key.startsWith('cond:')) return condSortValue(r.conditions[Number(key.substring(5))]);
    return r[key];
  };

  const cmp = (a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb == null) return a.ticker.localeCompare(b.ticker);
    if (va == null) return 1; // empty values last in both directions
    if (vb == null) return -1;
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return d !== 0 ? d * sort.dir : a.ticker.localeCompare(b.ticker);
  };

  const visible = useMemo(() => rows
    .filter((r) => !isFolded(r))
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .sort(cmp),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, statusFilter, hideDuplicates, sort, groups]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'ticker' || key === 'name' ? 1 : -1 }));
  const toggleExpanded = (t) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  const openByTicker = (t) => onOpenTicker(byTicker.get(t) || { ticker: t });

  const th = (k, children, title = undefined) => (
    <th key={k} className="px-2 py-1.5 text-left font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100"
      onClick={() => toggleSort(k)} title={title} aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {children}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const renderRow = (r, { child = false } = {}) => {
    const dups = groups.get(r.ticker) || [];
    return (
      <tr key={`${child ? 'd-' : ''}${r.ticker}`} className={`border-t ${child ? 'bg-gray-50 text-gray-600' : 'hover:bg-blue-50'}`} data-testid="screener-result-row">
        <td className="px-2 py-1 whitespace-nowrap">
          {child && <span className="text-gray-400 mr-1">↳</span>}
          <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onOpenTicker(r)}
            title="Open in Channel Explorer with the filter's start date, detector params and the run's basis">
            {r.ticker}
          </button>
          {!child && hideDuplicates && dups.length > 0 && (
            <button type="button" className="ml-1 px-1 rounded text-xs bg-gray-200 text-gray-700 hover:bg-gray-300"
              onClick={() => toggleExpanded(r.ticker)} title={`Index duplicates: ${dups.map((d) => d.ticker).join(', ')}`}
              data-testid="duplicates-toggle">
              +{dups.length}
            </button>
          )}
        </td>
        <td className="px-2 py-1 max-w-[14rem] truncate" title={r.name || ''}>{r.name || '—'}</td>
        <td className="px-2 py-1">{r.kind || '—'}</td>
        <td className="px-2 py-1 whitespace-nowrap">
          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${STATUS_CLASS[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span>
          {r.reason && <div className="text-[11px] text-gray-500">{reasonText(r.reason)}</div>}
        </td>
        <td className="px-2 py-1">{r.provisional ? <span className="watch-state-badge watch-state-badge--PROVISIONAL">prov.</span> : ''}</td>
        <td className="px-2 py-1 font-mono text-right">{fmtVal(r.close)}</td>
        {conditions.map((c, i) => <ConditionCell key={i} cr={r.conditions[i]} cond={c} tickerReason={r.reason} />)}
        <td className="px-2 py-1">
          <div className="flex flex-wrap gap-1">
            {r.flags.map((f) => <span key={f} className="watch-flag">{f}</span>)}
            {r.primaryTicker && r.primaryTicker !== r.ticker && <span className="watch-flag" title="Index duplicate">dup of {r.primaryTicker}</span>}
          </div>
        </td>
        {onBacktest && (
          <td className="px-2 py-1 whitespace-nowrap">
            <button type="button" className="py-0.5 px-2 text-xs border border-blue-600 text-blue-600 rounded hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              onClick={() => onBacktest(r)} disabled={!!busyTicker}
              title="Open in the Strategy Backtester (prepares the full indicator set first when the ticker has only the minimal one)">
              {busyTicker === r.ticker ? 'Preparing…' : 'Backtest'}
            </button>
          </td>
        )}
      </tr>
    );
  };

  if (!run) return null;
  return (
    <div className="flex flex-col gap-4" data-testid="screener-run-results">
      {/* Basis + counts */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span><span className="text-gray-500">Basis day</span> <b>{fmtDay(run.basisDay)}</b></span>
        <span><span className="text-gray-500">Basis week</span> <b>{fmtDay(run.basisWeek)}</b></span>
        <span><span className="text-gray-500">Eval TF</span> <b>{run.evalTf || evalTf}</b></span>
        {run.asOf && <span><span className="text-gray-500">As of</span> {fmtTs(run.asOf)} ET</span>}
        {run.filterVersion != null && <span><span className="text-gray-500">Filter</span> v{run.filterVersion}</span>}
        {run.basisUnchanged && <span className="watch-flag" title="Same basis as the previous run of this filter">basis unchanged</span>}
      </div>
      <div className="flex flex-wrap gap-2 text-sm" data-testid="screener-counts">
        <span className="px-2 py-0.5 rounded bg-green-100 text-green-800">PASS {counts.PASS}</span>
        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800">FAIL {counts.FAIL}</span>
        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">not evaluated {counts.NOT_EVALUATED}</span>
        <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-600 border">provisional {counts.provisional}</span>
        <span className="text-gray-500">of {counts.total} members</span>
      </div>
      {run.message && <div className="text-sm text-amber-700">{run.message}</div>}

      {/* Diff vs the previous run */}
      {diff && (
        <div className="border rounded p-3 bg-white" data-testid="screener-diff">
          <div className="text-xs text-gray-500 mb-2">
            {diff.prevRunId ? `Compared with run #${diff.prevRunId}` : 'No previous run with another basis — nothing to compare'}
            {diff.filterChanged && (
              <span className="ml-2 watch-flag">filter changed v{diff.filterChanged.from} → v{diff.filterChanged.to}</span>
            )}
            <span className="ml-2">Duplicates are counted once, by their primary member.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <TickerChips title="Entered" tickers={diff.entered} tone="border-green-300 bg-green-50 text-green-800 hover:bg-green-100" onOpen={openByTicker} testId="diff-entered" />
            <TickerChips title="Exited" tickers={diff.exited} tone="border-red-300 bg-red-50 text-red-800 hover:bg-red-100" onOpen={openByTicker} testId="diff-exited" />
            <TickerChips title="Undetermined (data)" tickers={diff.undetermined} tone="border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100" onOpen={openByTicker} testId="diff-undetermined" />
            <TickerChips title="New in universe" tickers={diff.newMembers} tone="border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100" onOpen={openByTicker} testId="diff-new" />
          </div>
        </div>
      )}

      {/* Table controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded border overflow-hidden" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 text-sm ${statusFilter === f.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              aria-pressed={statusFilter === f.value} data-testid={`status-filter-${f.value}`}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={hideDuplicates} onChange={(e) => setHideDuplicates(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" data-testid="hide-duplicates" />
          Hide duplicates
        </label>
        <span className="text-xs text-gray-500">{visible.length} row(s)</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {th('ticker', 'Ticker')}
              {th('name', 'Name')}
              {th('kind', 'Kind')}
              {th('status', 'Status')}
              {th('provisional', 'Prov.', 'A provisional (forming) WEEK[0] took part in the evaluation')}
              {th('close', 'Close')}
              {conditions.map((c, i) => (
                th(`cond:${i}`, conditionShort(c, i), (Array.isArray(labels) && labels[i]) || conditionCaption(c, evalTf))
              ))}
              {th('flags', 'Flags')}
              {onBacktest && <th className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={7 + conditions.length + (onBacktest ? 1 : 0)} className="px-2 py-4 text-center text-gray-500">
                {rows.length === 0 ? 'No results yet.' : 'No rows match the filter.'}
              </td></tr>
            ) : visible.map((r) => (
              <Fragment key={r.ticker}>
                {renderRow(r)}
                {hideDuplicates && expanded.has(r.ticker) && (groups.get(r.ticker) || []).map((d) => renderRow(d, { child: true }))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Values: channel metrics as defined in the spec (width and slope in %, position 0 = lower line, 1 = upper line);
        comparisons show left vs right. Hover a cell for the bar dates and the reason.
      </p>
    </div>
  );
}
