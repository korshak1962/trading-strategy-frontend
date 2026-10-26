// src/components/universeScreener/FilterList.jsx
//
// The list of screener filters (spec §9.1): name, active toggle, assigned schedules, the last run
// (basis, PASS count, +entered / −exited) and the row actions Run now / Results / Edit /
// Duplicate / Delete (soft: the runs and versions stay).
import { fmtDay } from '../watch/format';

const btn = 'py-0.5 px-2 text-xs border rounded hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-white';

const RUN_STATUS_CLASS = {
  DONE: 'text-green-700',
  PARTIAL: 'text-amber-700',
  FAILED: 'text-red-700',
  RUNNING: 'text-blue-700',
  QUEUED: 'text-blue-700',
};

function LastRun({ run }) {
  if (!run) return <span className="text-gray-400">never run</span>;
  const pass = run.passCount ?? null;
  const entered = run.enteredCount ?? null;
  const exited = run.exitedCount ?? null;
  return (
    <span className="whitespace-nowrap">
      <span className={RUN_STATUS_CLASS[run.status] || ''}>{run.status === 'DONE' ? '' : `${run.status} · `}</span>
      {fmtDay(run.basisDay)}
      {pass != null && <> · <b>PASS {pass}</b></>}
      {(entered != null || exited != null) && (
        <>
          {' · '}
          <span className="text-green-700">+{entered ?? 0}</span>
          {' / '}
          <span className="text-red-700">−{exited ?? 0}</span>
        </>
      )}
    </span>
  );
}

/**
 * @param {Object} props
 * @param {Array} props.filters FilterDTO[]
 * @param {Map<number, Object>} props.schedulesById
 * @param {number|null} props.busyId
 * @param {Object<number, {kind, text}>} props.rowMessages
 */
export default function FilterList({
  filters, schedulesById, busyId, rowMessages, onNew, onRunNow, onResults, onEdit, onDuplicate, onDelete, onToggleActive,
}) {
  return (
    <div className="bg-white p-6 rounded-lg shadow" data-testid="filter-list">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold">Filters</h2>
        <button type="button" onClick={onNew}
          className="py-1 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm" data-testid="filter-new">
          + New filter
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        Each active filter is evaluated on the universe after the downloads it is assigned to; “Run now” evaluates it at once.
        Conditions are AND-ed: channel metrics (semantics A, as the Explorer shows) and price / SMA comparisons.
      </p>
      {filters.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="filter-list-empty">No filters yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left">Name</th>
                <th className="px-2 py-1.5 text-left">Active</th>
                <th className="px-2 py-1.5 text-left">Schedules</th>
                <th className="px-2 py-1.5 text-left">Conditions</th>
                <th className="px-2 py-1.5 text-left">Last run</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filters.map((f) => {
                // FilterDTO carries scheduleIds only; names come from /meta.schedules.
                const ids = Array.isArray(f.scheduleIds) ? f.scheduleIds : [];
                const names = ids.map((id) => schedulesById.get(id)?.name || `#${id}`);
                const busy = busyId === f.id;
                const msg = rowMessages[f.id];
                return (
                  <tr key={f.id} className={`border-t align-top ${f.active ? '' : 'text-gray-500'}`} data-testid="filter-row">
                    <td className="px-2 py-1.5">
                      <button type="button" className="font-semibold text-blue-700 hover:underline text-left" onClick={() => onResults(f)}>
                        {f.name}
                      </button>
                      {f.version != null && <span className="ml-1 text-xs text-gray-400">v{f.version}</span>}
                      {f.note && <div className="text-xs text-gray-500 break-words">{f.note}</div>}
                      {msg && <div className={`text-xs mt-1 ${msg.kind === 'error' ? 'text-red-600' : 'text-blue-700'}`}>{msg.text}</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={!!f.active} disabled={busy} onChange={(e) => onToggleActive(f, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600" aria-label="Active" data-testid="filter-active" />
                    </td>
                    <td className="px-2 py-1.5">{names.length ? names.join(', ') : <span className="text-gray-400">manual only</span>}</td>
                    <td className="px-2 py-1.5">{Array.isArray(f.conditions) ? f.conditions.length : '—'}</td>
                    <td className="px-2 py-1.5"><LastRun run={f.lastRun} /></td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button type="button" className={`${btn} border-blue-600 text-blue-600`} disabled={busy} onClick={() => onRunNow(f)} data-testid="filter-run">Run now</button>
                        <button type="button" className={btn} onClick={() => onResults(f)}>Results</button>
                        <button type="button" className={btn} disabled={busy} onClick={() => onEdit(f)} data-testid="filter-edit">Edit</button>
                        <button type="button" className={btn} disabled={busy} onClick={() => onDuplicate(f)}>Duplicate</button>
                        <button type="button" className={`${btn} text-red-600`} disabled={busy} onClick={() => onDelete(f)}>Delete</button>
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
  );
}
