// src/components/SavedCasesPanel.jsx
//
// Collapsible "Saved cases" list at the top of the form column (screener
// TASK_saved_optimization_cases.md §3.4). Lists the cases (filtered to the current ticker by
// default), loads one into the form through `onLoad`, deletes one after a confirm.
// Refresh: on mount, on a ticker / filter change (ticker changes debounced) and whenever App's
// `casesVersion` changes (after a save in SaveCaseControl, or a delete here via `onChanged`),
// and on the header's ↻ button (cases added outside the UI).

import { useEffect, useRef, useState } from 'react';
import { deleteCase, getCase, listCases } from '../api/strategyApi';
import { fmtExchangeIntl } from '../utils/dates';

const TICKER_DEBOUNCE_MS = 300;

const OBJECTIVE_LABELS = {
  LONG_PNL: 'Long PnL',
  ANNUAL_RETURN: 'Annual return',
  COMPLEX_YIELD: 'Complex yield',
  CALMAR: 'Calmar',
  SHARPE: 'Sharpe',
};

const objectiveLabel = (objective) =>
  OBJECTIVE_LABELS[objective]
  || objective.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt2 = (v) => (isNum(v) && Math.abs(v) < 1e12 ? v.toFixed(2) : 'n/a');
const fmtPct = (v) => (isNum(v) ? `${v.toFixed(2)} %` : '—');
// API LocalDateTime → the calendar day as sent (no zone conversion).
const dayOf = (v) => (typeof v === 'string' ? v.substring(0, 10) : fmtExchangeIntl(v, { dateStyle: 'short' }));
// saved_at is the server's wall clock: shown as received.
const fmtSavedAt = (v) => fmtExchangeIntl(v, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}, 'en-CA');

/**
 * @param {Object} props
 * @param {string} props.ticker the form's ticker
 * @param {number} props.casesVersion bumped by App after every save / delete → refetch
 * @param {() => void} props.onChanged called after a delete (App bumps casesVersion)
 * @param {(caseDto: Object) => void} props.onLoad receives the StrategyCaseDTO of a loaded case
 * @param {boolean} props.disabled a run is in progress: Load / Delete are disabled
 * @param {number} props.runStarts bumped by App on every run start; a Load response that arrives
 *   after a run started while it was pending is ignored, even if that run has already finished
 */
const SavedCasesPanel = ({ ticker, casesVersion, onChanged, onLoad, disabled, runStarts = 0 }) => {
  const [expanded, setExpanded] = useState(true);
  const [onlyTicker, setOnlyTicker] = useState(true);
  const [cases, setCases] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);       // row being loaded / deleted
  const requestSeq = useRef(0);                     // newest list request; older responses are dropped
  const lastTickerFilter = useRef(undefined);       // ticker of the last request (debounce only ticker edits)
  const [refreshTick, setRefreshTick] = useState(0); // bumped by the ↻ button → immediate refetch
  // Current `disabled` / `runStarts` for async code: a Load response is ignored if a run is in
  // progress when it arrives, or if a run started (and maybe already finished) while it was pending.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const runStartsRef = useRef(runStarts);
  runStartsRef.current = runStarts;

  const tickerFilter = onlyTicker ? ticker.trim() : null;

  useEffect(() => {
    // Every filter / version change makes any request still in flight stale right away.
    const seq = ++requestSeq.current;
    if (onlyTicker && !tickerFilter) {
      // "Only <ticker>" with an empty ticker: nothing to list.
      lastTickerFilter.current = tickerFilter;
      setCases([]);
      setListLoading(false);
      return undefined;
    }
    const tickerChanged = onlyTicker && lastTickerFilter.current !== undefined
      && lastTickerFilter.current !== tickerFilter;
    const timer = setTimeout(async () => {
      if (seq !== requestSeq.current) return;
      lastTickerFilter.current = tickerFilter;
      setListLoading(true);
      try {
        const list = await listCases(tickerFilter ? { ticker: tickerFilter } : {});
        if (seq !== requestSeq.current) return;
        setCases(Array.isArray(list) ? list : []);
        setError(null);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(`Could not load saved cases: ${err.message}`);
      } finally {
        if (seq === requestSeq.current) setListLoading(false);
      }
    }, tickerChanged ? TICKER_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [onlyTicker, tickerFilter, casesVersion, refreshTick]);

  const handleLoad = async (c) => {
    setBusyId(c.id);
    setError(null);
    const runStartsAtRequest = runStartsRef.current;
    try {
      const dto = await getCase(c.id);
      if (disabledRef.current || runStartsRef.current !== runStartsAtRequest) {
        // A run started while the case was loading: the form now holds that run's config.
        setError(`Load of "${c.name}" was ignored because a run started`);
        return;
      }
      onLoad(dto);
    } catch (err) {
      if (err.status === 404) {
        setError(`Case "${c.name}" no longer exists`);
        onChanged();
      } else {
        setError(`Load failed: ${err.message}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete case "${c.name}"?`)) return;
    setBusyId(c.id);
    setError(null);
    try {
      await deleteCase(c.id);
    } catch (err) {
      // 404: already gone — the refresh below shows that.
      if (err.status !== 404) setError(`Delete failed: ${err.message}`);
    } finally {
      setBusyId(null);
      onChanged();
    }
  };

  return (
    <div className="mb-6 border border-gray-200 rounded">
      {/* Header: expand toggle + ↻ refresh as sibling buttons (a button may not contain a button). */}
      <div className="flex items-stretch bg-gray-50 rounded-t">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center justify-between px-3 py-2 hover:bg-gray-100 rounded-tl text-left"
          aria-expanded={expanded}
        >
          <span className="text-sm font-semibold text-gray-800">
            Saved cases{!listLoading && cases.length > 0 ? ` (${cases.length})` : ''}
          </span>
          <span className="text-xs text-gray-500">{expanded ? '▼' : '►'}</span>
        </button>
        <button
          type="button"
          title="Refresh"
          aria-label="Refresh saved cases"
          onClick={(e) => {
            e.stopPropagation();
            setRefreshTick((t) => t + 1);
          }}
          disabled={listLoading}
          className="px-3 text-sm text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-tr disabled:text-gray-300 disabled:hover:bg-gray-50"
        >
          ↻
        </button>
      </div>

      {expanded && (
        <div className="p-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={onlyTicker}
              onChange={(e) => setOnlyTicker(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Only {ticker.trim() || 'this ticker'}
          </label>

          {error && (
            <div className="mb-2 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs" role="alert">
              {error}
            </div>
          )}

          {listLoading && cases.length === 0 ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : onlyTicker && !tickerFilter ? (
            <p className="text-xs text-gray-500">Enter a ticker to list its saved cases.</p>
          ) : cases.length === 0 ? (
            <p className="text-xs text-gray-500">No saved cases{onlyTicker ? ` for ${tickerFilter}` : ''}.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100">
              {cases.map((c) => (
                <li key={c.id} className="py-2" title={c.note || undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 break-words">{c.name}</div>
                      <div className="text-xs text-gray-500">
                        {c.ticker} {c.timeframe} · {dayOf(c.startDate)}..{dayOf(c.endDate)}
                        {/* null = traded from the start date (older cases, or saved without one) */}
                        {c.tradeStart ? ` · trade from ${dayOf(c.tradeStart)}` : ''}
                        {c.longOnly ? ' · long only' : ''}
                      </div>
                      <div className="text-xs text-gray-500">Saved {fmtSavedAt(c.savedAt)}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoad(c)}
                        disabled={disabled || busyId !== null}
                        className="py-0.5 px-2 text-xs border border-blue-600 text-blue-600 rounded hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-white"
                      >
                        {busyId === c.id ? '…' : 'Load'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        disabled={disabled || busyId !== null}
                        className="py-0.5 px-2 text-xs border border-red-500 text-red-600 rounded hover:bg-red-50 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-700 tabular-nums">
                    {c.objective && isNum(c.objectiveValue) && (
                      <span>{objectiveLabel(c.objective)} = {fmt2(c.objectiveValue)}</span>
                    )}
                    {isNum(c.longPnlPercent) && <span>Long PnL {fmtPct(c.longPnlPercent)}</span>}
                    {isNum(c.maxDrawdownPercent) && <span>Max DD {fmtPct(c.maxDrawdownPercent)}</span>}
                    {isNum(c.trades) && <span>{c.trades} trades</span>}
                    {c.stoppedEarly && (
                      <span className="px-1.5 rounded bg-amber-100 text-amber-800 border border-amber-300">stopped early</span>
                    )}
                    {c.source === 'MANUAL' && (
                      <span className="text-gray-500">manual</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default SavedCasesPanel;
