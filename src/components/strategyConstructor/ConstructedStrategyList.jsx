// src/components/strategyConstructor/ConstructedStrategyList.jsx
//
// The list of constructed strategies (non-deleted, newest first): name, current version, number of
// rules, the signal types they emit, last change; Edit / Delete per row.
import { fmtExchangeIntl } from '../../utils/dates';
import { SIGNAL_TYPE_CLASS } from './constructedFormat';

const btn = 'py-0.5 px-2 text-xs border rounded hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-white';
// updated_at is the server's wall clock: shown as received.
const fmtUpdated = (v) => (v ? fmtExchangeIntl(v, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}, 'en-CA') : '—');

/**
 * @param {Object} props
 * @param {Array|null} props.items summaries (null while loading)
 * @param {number|null} props.selectedId the strategy open in the editor
 * @param {number|null} props.busyId row being deleted
 */
export default function ConstructedStrategyList({ items, selectedId, busyId, onNew, onEdit, onDelete, onRefresh }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow" data-testid="constructed-list">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold">Constructed strategies</h2>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} className="py-1 px-2 border rounded text-gray-700 hover:bg-gray-100 text-sm"
            title="Reload the list" aria-label="Reload the list">↻</button>
          <button type="button" onClick={onNew}
            className="py-1 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm" data-testid="constructed-new">
            + New strategy
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        A strategy is a set of rules “conditions → signal type”, evaluated on every bar with the screener's conditions.
        Every edit of the rules creates a new version; the backtester, cases and watches keep the version they use.
      </p>
      {items == null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="constructed-list-empty">No constructed strategies yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left">Name</th>
                <th className="px-2 py-1.5 text-left">Version</th>
                <th className="px-2 py-1.5 text-left">Rules</th>
                <th className="px-2 py-1.5 text-left">Signal types</th>
                <th className="px-2 py-1.5 text-left">Changed</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className={`border-t ${s.id === selectedId ? 'bg-blue-50' : ''}`} data-testid="constructed-row">
                  <td className="px-2 py-1.5 font-medium">{s.name}</td>
                  <td className="px-2 py-1.5">v{s.version}</td>
                  <td className="px-2 py-1.5">{s.ruleCount ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex flex-wrap gap-1">
                      {s.signalTypes.map((t) => (
                        <span key={t} className={`px-1.5 rounded border text-xs ${SIGNAL_TYPE_CLASS[t] || ''}`}>{t}</span>
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{fmtUpdated(s.updatedAt)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <button type="button" className={btn} onClick={() => onEdit(s.id)} disabled={busyId === s.id}>Edit</button>
                      <button type="button" className={`${btn} text-red-700`} onClick={() => onDelete(s)} disabled={busyId === s.id}
                        data-testid="constructed-delete">
                        {busyId === s.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
