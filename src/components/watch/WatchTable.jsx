// src/components/watch/WatchTable.jsx
//
// Watch table of the Watchlist tab (architect.md "Signal watch" §6.1), grouped by ticker. A row
// click opens the watch's run in Backtest (deep link); the action buttons stop the click.
import { Fragment, useState } from 'react';
import './watch.css';
import '../nextTriggers/nextBarCard.css';
import NextBarCard from '../nextTriggers/NextBarCard';
import { adaptNextTriggers } from '../nextTriggers/nextTriggersAdapter';
import { compactSummary, fmtBarKey } from '../nextTriggers/nextTriggersFormat';
import {
  HEALTH_INFO, actionOf, describeCode, fmtDay, fmtTs, modeLabel, positionText, signalPriceText, zoneShort,
} from './format';

const STATUS_CLS = {
  ACTIVE: 'bg-green-50 text-green-800 border-green-300',
  PAUSED: 'bg-gray-100 text-gray-700 border-gray-300',
  CLOSED: 'bg-gray-50 text-gray-500 border-gray-200',
  BROKEN: 'bg-red-50 text-red-700 border-red-300',
};

/**
 * The persisted estimate is older than what the table shows: the latest check failed (the previous
 * estimate is kept, OQ4), or a newer closed bar exists than the estimate's basis bar.
 */
const isStaleEstimate = (w, nt) => {
  if (!nt) return false;
  if (w.lastError) return true;
  const basis = typeof nt.basisBarDate === 'string' ? nt.basisBarDate.substring(0, 10) : null;
  const last = typeof w.lastBarDate === 'string' ? w.lastBarDate.substring(0, 10) : null;
  return Boolean(basis && last && last > basis && !nt.nextBar.inProgress);
};

/** "Next bar" cell: the merged estimate in one short line, the full sentence as tooltip. */
const NextBarCell = ({ nt, stale, expanded, onToggle }) => {
  if (!nt) return <span className="text-gray-400">—</span>;
  const c = compactSummary(nt);
  const title = [
    c.title,
    nt.basisBarDate ? `From the ${fmtBarKey(nt, nt.basisBarDate)} close (${nt.position || '—'})` : null,
    stale ? 'Earlier estimate — the latest check did not produce a new one' : null,
  ].filter(Boolean).join('\n');
  return (
    <span className={stale ? 'nbt-cell--stale' : ''} data-testid="watch-next-bar" data-tone={c.tone}>
      <span className={`nbt-cell-${c.tone}`} title={title}>{c.text}</span>
      {c.more > 0 && <span className="ml-1 text-xs text-gray-500" title={title}>+{c.more}</span>}
      {c.partial && <span className="ml-1 nbt-badge nbt-badge--partial" title={title}>partial</span>}
      {stale && <span className="ml-1 nbt-badge nbt-badge--stale">as of {fmtBarKey(nt, nt.basisBarDate)}</span>}
      <button
        type="button"
        className="ml-1 nbt-toggle"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        title="Show the next-bar card: all lines, distances, per-strategy breakdown"
        data-testid="watch-next-bar-toggle"
      >
        {expanded ? 'hide' : 'details'}
      </button>
    </span>
  );
};

const btn = 'px-2 py-0.5 rounded border text-xs whitespace-nowrap disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent';

const HealthCell = ({ w }) => {
  const h = w.health || {};
  const info = HEALTH_INFO[h.status];
  if (!info) return <span className="text-gray-400">—</span>;
  const tip = [
    h.message,
    h.tickerLastBar ? `${w.ticker} last bar ${fmtDay(h.tickerLastBar)}` : null,
    h.referenceTicker && h.referenceLastBar ? `${h.referenceTicker} last bar ${fmtDay(h.referenceLastBar)}` : null,
    w.lastError ? `Error: ${w.lastError}` : null,
  ].filter(Boolean).join('\n');
  return (
    <span className={`watch-health ${info.cls}`} title={tip || info.label} data-testid="watch-health" data-health={h.status}>
      <span aria-hidden="true">{info.icon}</span>
      {info.label}
    </span>
  );
};

/**
 * @param {Object} props
 * @param {Array<Object>} props.watches WatchDTO[]
 * @param {number|null} props.busyId watch with an action in flight
 * @param {Object<number, {kind: 'ok'|'error', text: string}>} props.rowMessages per-watch result line
 * @param {(w: Object) => void} props.onOpen row click → Backtest deep link
 * @param {(w: Object, status: string) => void} props.onSetStatus ACTIVE | PAUSED | CLOSED
 * @param {(w: Object) => void} props.onCheck Check now
 * @param {(w: Object) => void} props.onDelete
 */
const WatchTable = ({ watches, busyId, rowMessages = {}, onOpen, onSetStatus, onCheck, onDelete }) => {
  // Group by ticker, keeping the backend order (by ticker, then id).
  const groups = [];
  watches.forEach((w) => {
    const last = groups[groups.length - 1];
    if (last && last.ticker === w.ticker) last.rows.push(w);
    else groups.push({ ticker: w.ticker, rows: [w] });
  });

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  // Watches whose next-bar card is expanded (detail row under the watch)
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpanded = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-200" data-testid="watch-table">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">TF</th>
            <th className="text-left px-3 py-2 font-semibold">Name</th>
            <th className="text-left px-3 py-2 font-semibold">Mode</th>
            <th className="text-left px-3 py-2 font-semibold">Status</th>
            <th className="text-left px-3 py-2 font-semibold">Model position</th>
            <th className="text-left px-3 py-2 font-semibold">Last signal</th>
            <th className="text-left px-3 py-2 font-semibold" title="The merged trigger price(s) for the next bar, from the last closed bar">Next bar</th>
            <th className="text-left px-3 py-2 font-semibold">Health</th>
            <th className="text-left px-3 py-2 font-semibold">Linked</th>
            <th className="text-left px-3 py-2 font-semibold">Trade start</th>
            <th className="text-left px-3 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.ticker}>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={11} className="px-3 py-1.5 font-semibold text-gray-800">{g.ticker}</td>
              </tr>
              {g.rows.map((w) => {
                const zone = zoneShort(w.zone, w.ticker);
                const busy = busyId === w.id;
                const inactive = w.status === 'CLOSED' || w.status === 'BROKEN';
                const msg = rowMessages[w.id];
                const warnings = Array.isArray(w.warnings) ? w.warnings : [];
                const pos = w.position || null;
                const ls = w.lastSignal || null;
                const nt = adaptNextTriggers(w.nextTriggers);
                const ntStale = isStaleEstimate(w, nt);
                const ntOpen = nt !== null && expanded.has(w.id);
                return (
                  <Fragment key={w.id}>
                    <tr
                      className={`watch-row border-t border-gray-100 align-top ${inactive ? 'watch-row--inactive' : ''}`}
                      onClick={() => onOpen(w)}
                      title="Open this watch's run in Backtest"
                      data-testid="watch-row"
                      data-watch-id={w.id}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{w.timeFrame}</td>
                      <td className="px-3 py-2 min-w-[10rem]">
                        <span className="font-medium" title={w.note || undefined}>{w.name}</span>
                        {w.sourceCaseName && (
                          <span className="block text-xs text-gray-500">
                            case {w.sourceCaseName}{w.sourceCaseExists === false ? ' (deleted)' : ''}
                          </span>
                        )}
                        {w.unreadNotifications > 0 && (
                          <span className="inline-block mt-0.5 px-1.5 rounded-full bg-red-600 text-white text-xs">
                            {w.unreadNotifications} unread
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {modeLabel(w.mode)}
                        {w.mode === 'HOLDING' && (
                          <span className="block text-xs text-gray-500">
                            bought {fmtDay(w.entryDate)} @ {w.entryPrice ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 rounded border text-xs ${STATUS_CLS[w.status] || STATUS_CLS.CLOSED}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" data-testid="watch-position">
                        <span className={pos?.side === 'LONG' ? 'font-semibold text-green-700' : ''}>{positionText(pos)}</span>
                        {pos?.seeded && <span className="ml-1 watch-flag" title="Your own entry (seeded position)">seeded</span>}
                        {pos?.provisional && (
                          <span className="ml-1 watch-state-badge watch-state-badge--PROVISIONAL" title="The last signal is on a bar that has not closed yet">
                            provisional
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {ls ? (
                          <span className={`watch-sig--${ls.state}`}>
                            <span className={`watch-action--${actionOf(ls)}`}>{actionOf(ls)}</span>{' '}
                            {fmtDay(ls.barDate)} {signalPriceText(ls)}
                            <span className={`ml-1 watch-state-badge watch-state-badge--${ls.state}`}>{(ls.state || '').toLowerCase()}</span>
                          </span>
                        ) : <span className="text-gray-400">none</span>}
                      </td>
                      <td className="px-3 py-2 min-w-[12rem]">
                        <NextBarCell nt={nt} stale={ntStale} expanded={ntOpen} onToggle={() => toggleExpanded(w.id)} />
                      </td>
                      <td className="px-3 py-2"><HealthCell w={w} /></td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtTs(w.linkedAt)} {zone}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(w.tradeStart)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1">
                          {w.status === 'ACTIVE' && (
                            <button type="button" disabled={busy} onClick={stop(() => onSetStatus(w, 'PAUSED'))}
                              className={`${btn} border-gray-500 text-gray-700 hover:bg-gray-50`} data-testid="watch-pause">
                              Pause
                            </button>
                          )}
                          {w.status === 'PAUSED' && (
                            <button type="button" disabled={busy} onClick={stop(() => onSetStatus(w, 'ACTIVE'))}
                              className={`${btn} border-green-600 text-green-700 hover:bg-green-50`} data-testid="watch-resume">
                              Resume
                            </button>
                          )}
                          {w.status === 'ACTIVE' && (
                            <button type="button" disabled={busy} onClick={stop(() => onCheck(w))}
                              className={`${btn} border-blue-600 text-blue-600 hover:bg-blue-50`} data-testid="watch-check"
                              title="Re-run the watch on the data in the database now">
                              Check now
                            </button>
                          )}
                          {(w.status === 'ACTIVE' || w.status === 'PAUSED') && (
                            <button type="button" disabled={busy} onClick={stop(() => onSetStatus(w, 'CLOSED'))}
                              className={`${btn} border-amber-600 text-amber-700 hover:bg-amber-50`} data-testid="watch-close"
                              title="I exited / stop watching. The history is kept.">
                              Close
                            </button>
                          )}
                          <button type="button" disabled={busy} onClick={stop(() => onDelete(w))}
                            className={`${btn} border-red-600 text-red-600 hover:bg-red-50`} data-testid="watch-delete">
                            Delete
                          </button>
                          {busy && <span className="text-xs text-gray-500">working…</span>}
                        </div>
                      </td>
                    </tr>
                    {(msg || w.lastError || warnings.length > 0) && (
                      <tr className="border-t border-gray-50">
                        <td />
                        <td colSpan={10} className="px-3 pb-2 text-xs">
                          {w.lastError && <div className="text-red-700">Last check failed: {w.lastError}</div>}
                          {warnings.map((wr, i) => (
                            <div key={i} className="text-amber-700">{describeCode(wr.code, wr.message)}</div>
                          ))}
                          {msg && (
                            <div className={msg.kind === 'error' ? 'text-red-700' : 'text-blue-800'} role="status" data-testid="watch-row-message">
                              {msg.text}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {ntOpen && (
                      <tr className="border-t border-gray-50" data-testid="watch-next-bar-detail">
                        <td />
                        <td colSpan={10} className="px-3 pb-3">
                          <NextBarCard nt={nt} compact stale={ntStale} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WatchTable;
