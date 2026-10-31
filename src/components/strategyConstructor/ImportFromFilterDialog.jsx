// src/components/strategyConstructor/ImportFromFilterDialog.jsx
//
// "Import from a screener filter" (BA spec §2.5, Q3): the filter's COMPARE conditions are COPIED
// into a rule of the constructed strategy - there is no live link, a later edit of the filter does
// not change the strategy. Channel conditions (CHANNEL_METRIC) are skipped with a note: they arrive
// in constructed strategies in stage 4 (Q1).
import { useEffect, useState } from 'react';
import { listFilters, getFilter, fromConditionDTO } from '../../api/screenerApi';
import { describeApiError } from '../../api/httpClient';
import { conditionCaption, evalTfOf } from '../universeScreener/conditionFormat';
import '../watch/watch.css';

const sel = 'p-2 border rounded text-sm bg-white';

/**
 * @param {Object} props
 * @param {Array<{id, signalType}>} props.rules rules of the draft (targets "append to rule")
 * @param {string[]} props.signalTypes allowed types (meta) for a new rule
 * @param {number} props.maxConditions
 * @param {(target: {ruleIndex: number|null, signalType: string}, conditions: Object[], source: string) => void} props.onImport
 *   ruleIndex null = a new rule of `signalType`; conditions are editor conditions
 * @param {() => void} props.onClose
 */
export default function ImportFromFilterDialog({ rules, signalTypes, maxConditions, onImport, onClose }) {
  const [filters, setFilters] = useState(null);
  const [filterId, setFilterId] = useState('');
  const [filter, setFilter] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('new');
  const [signalType, setSignalType] = useState(signalTypes[0] || 'LongOpen');

  useEffect(() => {
    let alive = true;
    listFilters()
      .then((list) => { if (alive) setFilters(list); })
      .catch((err) => { if (alive) { setFilters([]); setError(describeApiError(err)); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!filterId) { setFilter(null); return undefined; }
    let alive = true;
    setBusy(true);
    setError(null);
    getFilter(filterId)
      .then((f) => { if (alive) setFilter(f); })
      .catch((err) => { if (alive) { setFilter(null); setError(describeApiError(err)); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [filterId]);

  const conditions = Array.isArray(filter?.conditions) ? filter.conditions.map(fromConditionDTO) : [];
  const evalTf = evalTfOf(conditions);
  const importable = conditions.filter((c) => c.type === 'COMPARE');
  const skipped = conditions.length - importable.length;
  const targetRule = target === 'new' ? null : rules[Number(target)];
  const room = targetRule ? maxConditions - targetRule.conditions.length : maxConditions;
  const tooMany = importable.length > room;

  const doImport = () => {
    if (importable.length === 0 || tooMany) return;
    onImport(
      { ruleIndex: target === 'new' ? null : Number(target), signalType },
      importable.map((c) => JSON.parse(JSON.stringify(c))),
      `${filter?.name || 'filter'}${filter?.version != null ? ` v${filter.version}` : ''}`,
    );
  };

  return (
    <div className="watch-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="watch-modal" role="dialog" aria-modal="true" aria-labelledby="import-filter-title" data-testid="import-filter-dialog">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 id="import-filter-title" className="text-lg font-bold">Import conditions from a screener filter</h2>
            <p className="text-sm text-gray-600">
              The conditions are copied. Later edits of the filter do not change this strategy.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="import-filter">Filter</label>
        <select id="import-filter" className={`${sel} w-full`} value={filterId} onChange={(e) => setFilterId(e.target.value)}
          disabled={filters == null} data-testid="import-filter-select">
          <option value="">{filters == null ? 'Loading filters…' : filters.length === 0 ? 'No filters' : 'Choose a filter'}</option>
          {(filters || []).map((f) => (
            <option key={f.id} value={f.id}>{f.name}{f.version != null ? ` (v${f.version})` : ''}</option>
          ))}
        </select>

        {busy && <p className="mt-2 text-sm text-gray-500">Loading the filter…</p>}
        {filter && !busy && (
          <div className="mt-3">
            <div className="text-sm font-medium text-gray-700 mb-1">Conditions</div>
            <ul className="text-xs font-mono space-y-1" data-testid="import-filter-conditions">
              {conditions.map((c, i) => (
                <li key={i}>
                  <span className={c.type === 'COMPARE' ? 'text-gray-800' : 'text-gray-400 line-through'}>
                    {conditionCaption(c, evalTf)}
                  </span>
                  {c.type !== 'COMPARE' && (
                    <span className="ml-2 text-amber-700">skipped: channel conditions arrive in stage 4</span>
                  )}
                </li>
              ))}
            </ul>
            {skipped > 0 && (
              <p className="mt-2 text-xs text-amber-700" data-testid="import-filter-skipped">
                {skipped} of {conditions.length} condition{conditions.length === 1 ? '' : 's'} skipped (channel metric).
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1" htmlFor="import-target">Into</label>
                <select id="import-target" className={sel} value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">a new rule</option>
                  {rules.map((r, i) => (
                    <option key={i} value={String(i)}>
                      rule {r.id != null ? `R${r.id}` : `#${i + 1} (new)`} · {r.signalType} (append)
                    </option>
                  ))}
                </select>
              </div>
              {target === 'new' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1" htmlFor="import-type">emitting</label>
                  <select id="import-type" className={sel} value={signalType} onChange={(e) => setSignalType(e.target.value)}>
                    {signalTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
            {tooMany && (
              <p className="mt-2 text-xs text-red-600">
                Too many conditions: the rule can take {room} more (at most {maxConditions} in a rule).
              </p>
            )}
          </div>
        )}
        {error && <div className="form-error mt-3" role="alert">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="py-2 px-4 border rounded text-gray-700 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={doImport} disabled={importable.length === 0 || tooMany}
            className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400" data-testid="import-filter-apply">
            Copy {importable.length} condition{importable.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
