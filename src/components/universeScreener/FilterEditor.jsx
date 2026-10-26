// src/components/universeScreener/FilterEditor.jsx
//
// Filter constructor (architect.md "Universe screener rev 1" §2.3, spec §9.2): name, note, start
// date of the channel detection window, detector params (the Channel Explorer's
// RecursiveParamsPanel; logPrice is hidden and always true), active flag, schedule assignments and
// the AND-ed condition rows with live captions. Client validation mirrors the server's
// FilterValidator; the server's 400 text is shown as is. "Preview" evaluates the unsaved filter
// (optionally as of a past New York date-time) without storing a run.
import { useEffect, useMemo, useRef, useState } from 'react';
import RecursiveParamsPanel from '../channelExplorer/RecursiveParamsPanel';
import { MetricConditionRow, CompareConditionRow } from './ConditionRows';
import RunResults from './RunResults';
import {
  createFilter, updateFilter, startPreview, getPreview, toFilterRequest, RUN_TERMINAL,
} from '../../api/screenerApi';
import { describeApiError } from '../../api/httpClient';
import { exchangeToday } from '../../utils/dates';
import {
  evalTfOf, validateFilter, newMetricCondition, newCompareCondition,
} from './conditionFormat';
import { pollUntil } from './poll';

const input = 'w-full p-2 border rounded';
const label = 'block text-sm font-medium text-gray-700 mb-1';

/**
 * @param {Object} props
 * @param {Object} props.initialDraft editor draft (fromFilterDTO / a new one)
 * @param {Object} props.detectorDefaults detector params of "Reset to defaults"
 * @param {Array<{id, name, enabled, timeFrame, portfolios}>} props.schedules download schedules
 * @param {(saved: Object, warnings: string[]) => void} props.onSaved
 * @param {() => void} props.onCancel
 * @param {(row, run, draft) => void} props.onOpenTicker → Channel Explorer
 */
export default function FilterEditor({ initialDraft, detectorDefaults, schedules, onSaved, onCancel, onOpenTicker }) {
  const [draft, setDraft] = useState(initialDraft);
  const [showParams, setShowParams] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [asOf, setAsOf] = useState('');
  const [previewTickers, setPreviewTickers] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewDraft, setPreviewDraft] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const previewSeq = useRef(0);
  useEffect(() => () => { previewSeq.current += 1; }, []);

  const today = exchangeToday();
  const evalTf = evalTfOf(draft.conditions);
  const validation = useMemo(() => validateFilter(draft, today), [draft, today]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setParam = (key, value) => setDraft((d) => ({ ...d, detectorParams: { ...d.detectorParams, [key]: value } }));
  const setCondition = (i, c) => setDraft((d) => ({ ...d, conditions: d.conditions.map((x, j) => (j === i ? c : x)) }));
  const removeCondition = (i) => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }));
  const moveCondition = (i, delta) => setDraft((d) => {
    const cs = [...d.conditions];
    const j = i + delta;
    if (j < 0 || j >= cs.length) return d;
    [cs[i], cs[j]] = [cs[j], cs[i]];
    return { ...d, conditions: cs };
  });
  const addCondition = (c) => setDraft((d) => ({ ...d, conditions: [...d.conditions, c] }));
  const toggleSchedule = (id) => setDraft((d) => {
    const has = d.scheduleIds.includes(id);
    return { ...d, scheduleIds: has ? d.scheduleIds.filter((x) => x !== id) : [...d.scheduleIds, id] };
  });

  const handleSave = async () => {
    setShowErrors(true);
    setSaveError(null);
    if (!validation.ok) return;
    setSaving(true);
    try {
      const req = toFilterRequest(draft);
      const saved = draft.id != null ? await updateFilter(draft.id, req) : await createFilter(req);
      onSaved(saved, Array.isArray(saved?.warnings) ? saved.warnings : []);
    } catch (err) {
      setSaveError(err.status === 409
        ? `A filter named "${draft.name.trim()}" already exists — choose another name.`
        : describeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setShowErrors(true);
    setPreviewError(null);
    // The name is not needed for a preview; everything else is.
    const v = validateFilter({ ...draft, name: draft.name || 'preview' }, today);
    if (!v.ok) return;
    const seq = ++previewSeq.current;
    setPreviewBusy(true);
    setPreview(null);
    const snapshot = draft;
    try {
      const req = toFilterRequest({ ...draft, name: draft.name || 'preview' });
      const tickers = previewTickers.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
      const started = await startPreview(req, asOf ? `${asOf}:00` : null, tickers);
      const previewId = started?.previewId;
      if (previewId == null) throw new Error('The backend did not return a preview id');
      const final = await pollUntil({
        load: () => getPreview(previewId),
        isDone: (p) => RUN_TERMINAL.has(p?.status),
        onUpdate: (p) => { if (seq === previewSeq.current) setPreview(p); },
        isCancelled: () => seq !== previewSeq.current,
      });
      if (final && seq === previewSeq.current) {
        setPreviewDraft(snapshot);
        if (final.status === 'FAILED') setPreviewError(`Preview failed: ${final.message || 'unknown error'}`);
      }
    } catch (err) {
      if (seq === previewSeq.current) {
        setPreviewError(err.status === 409
          ? 'Another preview is running — try again in a moment.'
          : `Preview failed: ${describeApiError(err)}`);
      }
    } finally {
      if (seq === previewSeq.current) setPreviewBusy(false);
    }
  };

  const err = (cond) => (showErrors ? cond : []);
  const progress = preview && !RUN_TERMINAL.has(preview.status)
    ? (Number.isFinite(preview.done) && Number.isFinite(preview.total) ? ` ${preview.done}/${preview.total}` : '')
    : '';

  return (
    <div className="flex flex-col gap-6" data-testid="filter-editor">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">
            {draft.id != null ? `Edit filter${draft.version != null ? ` (v${draft.version})` : ''}` : 'New filter'}
          </h2>
          <div className="text-sm text-gray-600">
            Evaluated on <b>{evalTf}</b> closes
            <span className="ml-1 text-xs text-gray-500">(DAY when any condition or operand is on DAY)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4">
            <label className={label} htmlFor="sf-name">Name</label>
            <input id="sf-name" className={input} value={draft.name} maxLength={128}
              onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Rising channel, near lower line" data-testid="filter-name" />
          </div>
          <div className="md:col-span-3">
            <label className={label} htmlFor="sf-start">Channel window start</label>
            <input id="sf-start" type="date" className={input} value={draft.startDate} max={today}
              onChange={(e) => set({ startDate: e.target.value })} />
            <p className="mt-1 text-xs text-gray-500">Detection boundary, as the Explorer's “From”.</p>
          </div>
          <div className="md:col-span-5">
            <label className={label} htmlFor="sf-note">Note</label>
            <input id="sf-note" className={input} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
          </div>

          <div className="md:col-span-4">
            <span className={label}>Run after downloads</span>
            <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1" data-testid="filter-schedules">
              {schedules.length === 0 ? <p className="text-sm text-gray-500">No schedules.</p> : schedules.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={draft.scheduleIds.includes(s.id)} onChange={() => toggleSchedule(s.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  <span className="truncate">{s.name}</span>
                  {s.enabled === false && <span className="text-xs text-gray-400">(disabled)</span>}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">No schedule = manual runs only.</p>
          </div>
          <div className="md:col-span-8 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              Active (runs after the assigned downloads)
            </label>
            <div>
              <button type="button" className={`ta-params-toggle${showParams ? ' ta-params-toggle--open' : ''}`}
                onClick={() => setShowParams((v) => !v)}>
                Detector params {showParams ? '▲' : '▼'}
              </button>
              <span className="ml-2 text-xs text-gray-500">Same fields and defaults as the Channel Explorer; log price always on.</span>
            </div>
          </div>
        </div>

        {showParams && (
          <div className="mt-4">
            <RecursiveParamsPanel
              params={draft.detectorParams}
              setParam={setParam}
              onReset={() => set({ detectorParams: { ...detectorDefaults, logPrice: true } })}
            />
          </div>
        )}

        <h3 className="text-lg font-semibold mt-6 mb-2">Conditions <span className="text-sm font-normal text-gray-500">(all must hold)</span></h3>
        <div className="flex flex-col gap-2">
          {draft.conditions.map((c, i) => {
            const shell = {
              index: i, count: draft.conditions.length, disabled: saving,
              errors: err(validation.conditions[i] || []),
              onRemove: () => removeCondition(i), onMove: (d) => moveCondition(i, d),
            };
            return c.type === 'CHANNEL_METRIC'
              ? <MetricConditionRow key={i} condition={c} evalTf={evalTf} onChange={(x) => setCondition(i, x)} {...shell} />
              : <CompareConditionRow key={i} condition={c} evalTf={evalTf} onChange={(x) => setCondition(i, x)} {...shell} />;
          })}
          {draft.conditions.length === 0 && <p className="text-sm text-gray-500">No conditions yet.</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => addCondition(newMetricCondition())}
            className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm" data-testid="add-metric">
            + Channel metric
          </button>
          <button type="button" onClick={() => addCondition(newCompareCondition())}
            className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm" data-testid="add-compare">
            + Comparison
          </button>
        </div>

        {showErrors && validation.general.length > 0 && (
          <ul className="mt-4 text-sm text-red-600 list-disc list-inside" data-testid="filter-errors">
            {validation.general.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {saveError && <div className="form-error mt-4" role="alert">{saveError}</div>}

        <div className="mt-6 flex flex-wrap items-end gap-3 border-t pt-4">
          <button type="button" onClick={handleSave} disabled={saving}
            className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400" data-testid="filter-save">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className="py-2 px-4 border rounded text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="sf-asof" title="Evaluate as of a past moment (New York time): bars up to then, membership then, closedness at that moment">
                Preview as of (ET, optional)
              </label>
              <input id="sf-asof" type="datetime-local" className="p-2 border rounded text-sm" value={asOf}
                onChange={(e) => setAsOf(e.target.value)} data-testid="preview-asof" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="sf-ptickers" title="Evaluate only these tickers (members or not); empty = the whole universe">
                Only tickers (optional)
              </label>
              <input id="sf-ptickers" className="p-2 border rounded text-sm w-40" value={previewTickers} placeholder="e.g. SPY, QQQ"
                onChange={(e) => setPreviewTickers(e.target.value)} data-testid="preview-tickers" />
            </div>
            <button type="button" onClick={handlePreview} disabled={previewBusy}
              className="py-2 px-4 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              data-testid="filter-preview">
              {previewBusy ? `Previewing…${progress}` : 'Preview'}
            </button>
          </div>
        </div>
      </div>

      {(preview || previewError) && (
        <div className="bg-white p-6 rounded-lg shadow" data-testid="filter-preview-results">
          <h3 className="text-lg font-semibold mb-1">Preview <span className="text-sm font-normal text-gray-500">(not stored)</span></h3>
          {previewError && <div className="form-error mb-3" role="alert">{previewError}</div>}
          {preview && RUN_TERMINAL.has(preview.status) && preview.status !== 'FAILED' && (
            <RunResults
              run={preview}
              conditions={(previewDraft || draft).conditions}
              labels={preview.conditionLabels}
              evalTf={preview.evalTf || evalTfOf((previewDraft || draft).conditions)}
              onOpenTicker={(row) => onOpenTicker(row, preview, previewDraft || draft)}
            />
          )}
          {preview && !RUN_TERMINAL.has(preview.status) && <p className="text-sm text-gray-500">Evaluating the universe…{progress}</p>}
        </div>
      )}
    </div>
  );
}
