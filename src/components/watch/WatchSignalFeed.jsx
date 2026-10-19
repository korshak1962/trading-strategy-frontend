// src/components/watch/WatchSignalFeed.jsx
//
// Signal feed of the Watchlist tab (architect.md "Signal watch" §6.1), newest bar first.
// States: CONFIRMED normal, PROVISIONAL grey, RETRACTED struck through, BASELINE muted; flags
// late / superseded / reappeared. A row click opens the watch's run in Backtest focused on the
// signal's bar (deep link with signalId).
import './watch.css';
import {
  BIG_BAR_CHANGE_PCT, STATE_LABELS, actionOf, fmtDay, fmtPct, fmtPrice, fmtTs, signalPrices, zoneShort,
} from './format';

const FLAG_TITLES = {
  late: 'Appeared on a bar older than the last closed bar of the previous check (the past was repainted)',
  superseded: 'A later signal of the same check replaced it — see the latest one',
  reappeared: 'Withdrawn earlier, back again',
};

/**
 * @param {Object} props
 * @param {Array<Object>} props.signals WatchSignalDTO[]
 * @param {Array<Object>} props.watches WatchDTO[] (filter options)
 * @param {number|null} props.filterWatchId
 * @param {(id: number|null) => void} props.onFilterChange
 * @param {boolean} props.includeBaseline
 * @param {(v: boolean) => void} props.onIncludeBaselineChange
 * @param {(s: Object) => void} props.onOpen
 * @param {boolean} props.loading
 */
const WatchSignalFeed = ({
  signals, watches, filterWatchId, onFilterChange, includeBaseline, onIncludeBaselineChange, onOpen, loading,
}) => (
  <div>
    <div className="flex flex-wrap items-center gap-4 mb-3">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        Watch
        <select
          value={filterWatchId ?? ''}
          onChange={(e) => onFilterChange(e.target.value === '' ? null : Number(e.target.value))}
          className="p-1.5 border rounded"
          data-testid="feed-filter-watch"
        >
          <option value="">All watches</option>
          {watches.map((w) => (
            <option key={w.id} value={w.id}>{w.ticker} {w.timeFrame} · {w.name}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={includeBaseline}
          onChange={(e) => onIncludeBaselineChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          data-testid="feed-include-baseline"
        />
        Show BASELINE
      </label>
      {loading && <span className="text-xs text-gray-500">Loading…</span>}
    </div>

    {signals.length === 0 ? (
      <p className="text-sm text-gray-500">{loading ? 'Loading…' : 'No signals yet.'}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border border-gray-200" data-testid="signal-feed">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Bar</th>
              <th className="text-left px-3 py-2 font-semibold">Watch</th>
              <th className="text-left px-3 py-2 font-semibold">Signal</th>
              <th className="text-left px-3 py-2 font-semibold">Price</th>
              <th className="text-left px-3 py-2 font-semibold" title="close / previous close − 1">Bar change</th>
              <th className="text-left px-3 py-2 font-semibold" title="Open of the next bar: an estimate of the real fill">Next open</th>
              <th className="text-left px-3 py-2 font-semibold">State</th>
              <th className="text-left px-3 py-2 font-semibold">Reason</th>
              <th className="text-left px-3 py-2 font-semibold">Seen</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => {
              const action = actionOf(s);
              const p = signalPrices(s);
              const chg = s.barChangePercent;
              const bigChange = typeof chg === 'number' && Math.abs(chg) > BIG_BAR_CHANGE_PCT;
              const zone = zoneShort(s.zone, s.ticker);
              return (
                <tr
                  key={s.id}
                  className={`watch-row border-t border-gray-100 align-top watch-sig--${s.state}`}
                  onClick={() => onOpen(s)}
                  title="Open in Backtest, focused on this bar"
                  data-testid="signal-row"
                  data-signal-id={s.id}
                  data-state={s.state}
                >
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(s.barDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {s.ticker} {s.timeFrame}
                    {s.watchName && <span className="block text-xs text-gray-500">{s.watchName}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`watch-action--${action}`}>{action}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {p.primary}
                    {p.close && (
                      <span className="block text-xs text-gray-500">
                        {p.isStop ? 'stop level; ' : ''}close {p.close}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${bigChange ? 'text-red-600 font-semibold' : ''}`}
                    title={bigChange ? 'Unusually large move — a split? Check before acting.' : undefined}>
                    {fmtPct(chg)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtPrice(s.nextOpen)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1" style={{ textDecoration: 'none' }}>
                      <span className={`watch-state-badge watch-state-badge--${s.state}`}>{STATE_LABELS[s.state] || s.state}</span>
                      {['late', 'superseded', 'reappeared'].filter((f) => s[f]).map((f) => (
                        <span key={f} className="watch-flag" title={FLAG_TITLES[f]} data-testid={`flag-${f}`}>{f}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="text-xs break-words line-clamp-2" title={s.comment || undefined}>{s.comment || '—'}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums">
                    {fmtTs(s.firstSeenAt)} {zone}
                    {s.confirmedAt && <span className="block">confirmed {fmtTs(s.confirmedAt)}</span>}
                    {s.retractedAt && <span className="block">withdrawn {fmtTs(s.retractedAt)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
    <p className="mt-2 text-xs text-gray-500">
      Prices are the backtest fill at the signal bar&apos;s close (or the stop level). Act at the next session.
      Times are exchange-local.
    </p>
  </div>
);

export default WatchSignalFeed;
