// src/components/strategyConstructor/ConstructedStrategyList.jsx
//
// The list of constructed strategies (non-deleted, newest first): name, current version, number of
// rules, the signal types they emit, last change; Delete per row. A click on the row (Enter / Space
// when it has focus) opens the strategy in the editor; Ctrl / Cmd + click or a middle click opens it
// in a new browser tab (designer_constructor_preview_v1.md §2.1, listRowIntent.js).
// Stage 3b-0: a row whose current version this server cannot read (`unreadable`, saved by a newer
// server) carries the badge and offers Delete only (it does not open; it is not in
// available-strategies, so it cannot be run, optimized, watched or saved in a case either).
// Stage 4c-1: a position-dependent current version (a rule reads the trade) carries the PD badge.
import { useEffect, useRef } from 'react';
import { fmtExchangeIntl } from '../../utils/dates';
import UnreadableBadge from '../UnreadableBadge';
import { SIGNAL_TYPE_CLASS } from './constructedFormat';
import PositionDependentBadge from './PositionDependentBadge';
import { rowClickIntent, rowKeyIntent, strategyEditorUrl } from './listRowIntent';

const btn = 'py-0.5 px-2 text-xs border rounded hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-white';
// updated_at is the server's wall clock: shown as received.
const UNREADABLE_ROW_TITLE = "Saved by a newer server version: it can't be opened here. Only Delete is available.";
const hasTextSelection = () => {
  try { return !!window.getSelection && String(window.getSelection() || '').length > 0; } catch { return false; }
};

const fmtUpdated = (v) => (v ? fmtExchangeIntl(v, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}, 'en-CA') : '—');

/**
 * @param {Object} props
 * @param {Array|null} props.items summaries (null while loading)
 * @param {number|null} props.selectedId the strategy open in the editor
 * @param {number|null} props.busyId row being deleted
 * @param {(id: number) => void} props.onEdit opens the strategy in the editor
 * @param {number|'new'|null} [props.focusTarget] after the editor closed: the row (id) or
 *   "+ New strategy" ('new') to focus once; onFocusDone clears it
 */
export default function ConstructedStrategyList({
  items, selectedId, busyId, onNew, onFromTemplate = null, onEdit, onDelete, onRefresh, focusTarget = null, onFocusDone = null,
}) {
  const rowRefs = useRef(new Map());
  const newRef = useRef(null);
  // Focus returns to the strategy just closed (scrolled into view), or to "+ New strategy"
  useEffect(() => {
    if (focusTarget == null || items == null) return;
    const el = focusTarget === 'new' ? newRef.current : rowRefs.current.get(focusTarget);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: 'nearest' });
    }
    onFocusDone?.();
  }, [focusTarget, items, onFocusDone]);

  const onRowClick = (e, s) => {
    const intent = rowClickIntent(e, { unreadable: !!s.unreadable, busy: busyId === s.id, hasSelection: hasTextSelection() });
    if (intent === 'newTab') {
      e.preventDefault();
      window.open(strategyEditorUrl(s.id), '_blank', 'noopener');
    } else if (intent === 'open') {
      onEdit(s.id);
    }
  };
  const onRowKey = (e, s) => {
    if (rowKeyIntent(e, { unreadable: !!s.unreadable, busy: busyId === s.id }) !== 'open') return;
    e.preventDefault();
    onEdit(s.id);
  };
  // A middle-button press would start autoscroll; the new tab opens on auxclick
  const onRowMouseDown = (e, s) => { if (e.button === 1 && !s.unreadable) e.preventDefault(); };

  return (
    <div className="bg-white p-6 rounded-lg shadow" data-testid="constructed-list">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold">Constructed strategies</h2>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} className="py-1 px-2 border rounded text-gray-700 hover:bg-gray-100 text-sm"
            title="Reload the list" aria-label="Reload the list">↻</button>
          {onFromTemplate && (
            <button type="button" onClick={onFromTemplate}
              className="py-1 px-3 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 text-sm"
              title="Create a strategy from a code template (Price vs MA, MA crossover, …)" data-testid="constructed-from-template">
              Create from template…
            </button>
          )}
          <button type="button" onClick={onNew} ref={newRef}
            className="py-1 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm" data-testid="constructed-new">
            + New strategy
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        A strategy is a set of rules “conditions → signal type”, evaluated on every bar with the screener's conditions.
        Every edit of the rules creates a new version; the backtester, cases and watches keep the version they use.
        {' '}Click a strategy to open it.
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
              {items.map((s) => {
                const openable = !s.unreadable;
                const busy = busyId === s.id;
                const rowTitle = openable ? `Open «${s.name}» in the editor` : UNREADABLE_ROW_TITLE;
                const rowClass = `border-t ${s.id === selectedId ? 'bg-blue-50' : ''} ${s.unreadable ? 'text-gray-500' : ''}`
                  + (openable
                    ? ` ${busy ? 'cursor-wait' : 'cursor-pointer hover:bg-gray-50'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ring-inset`
                    : '');
                return (
                  <tr key={s.id}
                    ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
                    className={rowClass}
                    tabIndex={openable && !busy ? 0 : undefined}
                    title={rowTitle}
                    onClick={(e) => onRowClick(e, s)}
                    onAuxClick={(e) => onRowClick(e, s)}
                    onMouseDown={(e) => onRowMouseDown(e, s)}
                    onKeyDown={(e) => onRowKey(e, s)}
                    data-testid="constructed-row" data-unreadable={s.unreadable ? 'true' : undefined}>
                    <td className="px-2 py-1.5 font-medium" aria-label={openable ? rowTitle : undefined}>
                      {s.name}
                      {s.unreadable && <UnreadableBadge reason={s.unreadable} testId="constructed-row-unreadable" />}
                      {s.templateId && (
                        <span className="ml-1 px-1.5 rounded bg-indigo-100 text-indigo-800 text-xs font-normal"
                          title={`Created from the template «${s.templateId}»`} data-testid="constructed-row-template">template</span>
                      )}
                      {s.positionDependent && <PositionDependentBadge testId="constructed-row-pd" />}
                    </td>
                    <td className="px-2 py-1.5">v{s.version}</td>
                    <td className="px-2 py-1.5">{s.unreadable ? '—' : (s.ruleCount ?? '—')}</td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex flex-wrap gap-1">
                        {s.signalTypes.map((t) => (
                          <span key={t} className={`px-1.5 rounded border text-xs ${SIGNAL_TYPE_CLASS[t] || ''}`}>{t}</span>
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{fmtUpdated(s.updatedAt)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <button type="button" className={`${btn} text-red-700`} disabled={busy}
                        onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                        onAuxClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        title={`Delete «${s.name}»`}
                        data-testid="constructed-delete">
                        {busy ? 'Deleting…' : 'Delete'}
                      </button>
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
