// src/components/strategyConstructor/StrategyConstructorPanel.jsx
//
// "Strategy constructor" tab (screener architect.md "Конструктор стратегий" §4.9, BA spec §4.2):
// the list of constructed strategies, the rule editor (rule = AND-ed screener comparisons → one
// signal type), "import from a screener filter" (a copy, no live link), the preview without merge
// and the attempt counter (Q14). Save → 201 / 200 (+ versionChanged), 409 NAME_EXISTS → rename;
// delete → soft delete; with references the backend answers 409 HAS_REFERENCES: the references are
// listed and "Delete anyway" confirms (O4). The URL names the strategy open in the editor
// (#/constructor?id=12).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConstructedStrategyList from './ConstructedStrategyList';
import RuleEditor from './RuleEditor';
import ImportFromFilterDialog from './ImportFromFilterDialog';
import ConstructedPreview from './ConstructedPreview';
import {
  DEFAULT_META, getConstructedMeta, listConstructed, getConstructed, createConstructed, updateConstructed,
  deleteConstructed, previewConstructed, toConstructedRequest, toRuleRequest, normalizeMeta, referenceCount,
} from '../../api/constructedApi';
import { describeApiError } from '../../api/httpClient';
import { exchangeToday, addYearsIso, fmtExchangeIntl } from '../../utils/dates';
import {
  newDraft, newRule, rulesSignature, validateDraft, runTfsOf, runTfError,
} from './constructedFormat';

const input = 'w-full p-2 border rounded';
const label = 'block text-sm font-medium text-gray-700 mb-1';
const fmtWhen = (v) => (v ? fmtExchangeIntl(v, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}, 'en-CA') : '—');

const defaultPreviewForm = () => {
  const today = exchangeToday();
  return { ticker: 'SPY', timeFrame: 'DAY', startDay: addYearsIso(today, -5), endDay: today };
};

/** References of a strategy as list items (cases, watches, parameter profiles). */
function ReferencesList({ references }) {
  return (
    <ul className="mt-1 list-disc pl-5 text-sm">
      {references.cases.map((c) => (
        <li key={`c${c.id}`}>case «{c.name || `#${c.id}`}»{c.version != null ? ` (v${c.version})` : ''}</li>
      ))}
      {references.watches.map((w) => (
        <li key={`w${w.id}`}>watch «{w.name || `#${w.id}`}»{w.status ? ` · ${w.status}` : ''}</li>
      ))}
      {references.profiles.map((p, i) => (
        <li key={`p${i}`}>parameter profile {p.ticker} {p.timeframe}{p.strategyKey ? ` · ${p.strategyKey}` : ''}</li>
      ))}
    </ul>
  );
}

/**
 * @param {Object} props
 * @param {{id: number|null}|null} props.route the URL's strategy (null while the tab is hidden)
 * @param {(id: number|null, opts?: {replace?: boolean}) => void} props.onRouteChange
 * @param {() => void} props.onStrategiesChanged a strategy was saved / deleted (the backtester
 *   reloads its available strategies)
 * @param {string[]} props.tickers
 */
export default function StrategyConstructorPanel({ route, onRouteChange, onStrategiesChanged, tickers = [] }) {
  const [meta, setMeta] = useState(DEFAULT_META);
  const [items, setItems] = useState(null);
  const [listError, setListError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleteBlock, setDeleteBlock] = useState(null); // {item, references}
  const [notice, setNotice] = useState(null);

  const [draft, setDraft] = useState(null);           // null = no editor open
  const [saved, setSaved] = useState(null);           // the stored version open in the editor (DTO)
  const [loadError, setLoadError] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const [previewForm, setPreviewForm] = useState(defaultPreviewForm);
  const [preview, setPreview] = useState(null);
  const [previewSig, setPreviewSig] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const previewSeq = useRef(0);
  const loadSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    getConstructedMeta()
      .then((m) => { if (alive) setMeta(m); })
      .catch(() => { if (alive) setMeta(normalizeMeta(null)); });
    return () => { alive = false; };
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const list = await listConstructed();
      setItems(list);
      setListError(null);
    } catch (err) {
      setItems((prev) => prev ?? []);
      setListError(describeApiError(err));
    }
  }, []);
  useEffect(() => { refreshList(); }, [refreshList]);

  const resetEditorState = () => {
    setShowErrors(false);
    setSaveError(null);
    setSaveMessage(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewSig(null);
    previewSeq.current += 1;
  };

  const openStrategy = useCallback(async (id) => {
    const seq = ++loadSeq.current;
    setLoadError(null);
    try {
      const dto = await getConstructed(id);
      if (seq !== loadSeq.current) return;
      setSaved(dto);
      setDraft({ ...dto, rules: dto.rules });
      resetEditorState();
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setLoadError(err.status === 404 ? `Strategy #${id} does not exist (or was deleted).` : describeApiError(err));
      setSaved(null);
      setDraft(null);
    }
  }, []);

  // The URL's strategy (Back / Forward / a pasted link): open it, or close a stored one.
  const routeId = route ? route.id ?? null : undefined;
  useEffect(() => {
    if (routeId === undefined) return; // tab hidden
    if (routeId != null && routeId !== draft?.id) openStrategy(routeId);
    if (routeId == null && draft?.id != null) { setDraft(null); setSaved(null); }
    // draft?.id only: the editor's own saves change the URL through onRouteChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, openStrategy]);

  const dirtyRules = !!draft && (!saved || rulesSignature(draft.rules) !== rulesSignature(saved.rules));
  const dirty = !!draft && (dirtyRules || !saved || (draft.name || '') !== (saved.name || '') || (draft.note || '') !== (saved.note || ''));
  const validation = useMemo(
    () => (draft ? validateDraft(draft, { allowedTypes: meta.signalTypes, maxRules: meta.maxRules, maxConditions: meta.maxConditions }) : null),
    [draft, meta],
  );
  const runTfs = draft ? runTfsOf(draft.rules) : ['DAY', 'WEEK'];
  const previewTfs = meta.timeframes.filter((tf) => ['DAY', 'WEEK'].includes(tf));
  const evalTf = previewForm.timeFrame;

  const confirmDiscard = () => !dirty || window.confirm('Discard the unsaved changes of this strategy?');

  const handleNew = () => {
    if (!confirmDiscard()) return;
    loadSeq.current += 1;
    setSaved(null);
    setDraft(newDraft());
    setLoadError(null);
    resetEditorState();
    if (routeId != null) onRouteChange(null);
  };

  const handleEdit = (id) => {
    if (id === draft?.id) return;
    if (!confirmDiscard()) return;
    onRouteChange(id);
  };

  const handleClose = () => {
    if (!confirmDiscard()) return;
    loadSeq.current += 1;
    setDraft(null);
    setSaved(null);
    resetEditorState();
    if (routeId != null) onRouteChange(null);
  };

  // ---- rules ----
  const setRule = (i, rule) => setDraft((d) => ({ ...d, rules: d.rules.map((r, j) => (j === i ? rule : r)) }));
  const removeRule = (i) => setDraft((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }));
  const moveRule = (i, delta) => setDraft((d) => {
    const rs = [...d.rules];
    const j = i + delta;
    if (j < 0 || j >= rs.length) return d;
    [rs[i], rs[j]] = [rs[j], rs[i]];
    return { ...d, rules: rs };
  });
  const addRule = () => setDraft((d) => ({ ...d, rules: [...d.rules, newRule(meta.signalTypes[0] || 'LongOpen')] }));

  const handleImport = ({ ruleIndex, signalType }, conditions, source) => {
    const rows = conditions.map((condition) => ({ id: null, condition }));
    setDraft((d) => {
      if (ruleIndex == null) {
        return { ...d, rules: [...d.rules, { id: null, signalType, note: `copied from filter ${source}`, conditions: rows }] };
      }
      return { ...d, rules: d.rules.map((r, j) => (j === ruleIndex ? { ...r, conditions: [...r.conditions, ...rows] } : r)) };
    });
    setImportOpen(false);
  };

  // ---- save ----
  const handleSave = async () => {
    setShowErrors(true);
    setSaveError(null);
    setSaveMessage(null);
    if (!validation.ok) return;
    setSaving(true);
    try {
      const req = toConstructedRequest(draft);
      const isNew = draft.id == null;
      const dto = isNew ? await createConstructed(req) : await updateConstructed(draft.id, req);
      setSaved(dto);
      setDraft(dto);
      setShowErrors(false);
      if (isNew) setSaveMessage(`Saved as v${dto.version}.`);
      else if (dto.versionChanged === false) setSaveMessage(`Saved. The rules did not change: still v${dto.version}.`);
      else setSaveMessage(`Saved as v${dto.version}. The backtester, cases and watches keep the version they use.`);
      refreshList();
      onStrategiesChanged?.();
      if (isNew && dto.id != null) onRouteChange(dto.id, { replace: routeId == null });
    } catch (err) {
      setSaveError(err.status === 409
        ? `A strategy named "${draft.name.trim()}" already exists — choose another name.`
        : describeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  // ---- delete ----
  const finishDelete = async (item) => {
    setDeleteBlock(null);
    setNotice(`Deleted «${item.name}».`);
    if (draft?.id === item.id) {
      setDraft(null);
      setSaved(null);
      resetEditorState();
      if (routeId != null) onRouteChange(null, { replace: true });
    }
    await refreshList();
    onStrategiesChanged?.();
  };

  const handleDelete = async (item, confirmed = false) => {
    if (!confirmed && !window.confirm(`Delete the strategy «${item.name}»? Its versions stay readable for saved cases.`)) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await deleteConstructed(item.id, confirmed);
      if (res.blocked) setDeleteBlock({ item, references: res.references });
      else await finishDelete(item);
    } catch (err) {
      setNotice(`Delete failed: ${describeApiError(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  // ---- preview ----
  const handlePreview = async () => {
    setShowErrors(true);
    setPreviewError(null);
    const v = validateDraft(draft, {
      allowedTypes: meta.signalTypes, maxRules: meta.maxRules, maxConditions: meta.maxConditions, requireName: false,
    });
    if (!v.ok) { setPreviewError('Fix the rules first (see the messages above).'); return; }
    const tfErr = runTfError(draft.rules, previewForm.timeFrame);
    if (tfErr) { setPreviewError(tfErr); return; }
    const ticker = (previewForm.ticker || '').trim().toUpperCase();
    if (!ticker) { setPreviewError('Ticker is required'); return; }
    if (!previewForm.startDay || !previewForm.endDay || previewForm.startDay > previewForm.endDay) {
      setPreviewError('Start date must be on or before end date');
      return;
    }
    const seq = ++previewSeq.current;
    const sig = rulesSignature(draft.rules);
    setPreviewBusy(true);
    try {
      const useKey = !!saved && !dirtyRules && !!saved.key;
      const p = await previewConstructed({
        key: useKey ? saved.key : null,
        definition: useKey ? null : { rules: draft.rules.map(toRuleRequest) },
        ticker,
        timeFrame: previewForm.timeFrame,
        startDay: previewForm.startDay,
        endDay: previewForm.endDay,
      });
      if (seq !== previewSeq.current) return;
      setPreview(p);
      setPreviewSig(sig);
    } catch (err) {
      if (seq !== previewSeq.current) return;
      setPreview(null);
      setPreviewError(`Preview failed: ${describeApiError(err)}`);
    } finally {
      if (seq === previewSeq.current) setPreviewBusy(false);
    }
  };

  // Inline "last preview" line per rule (by permanent id; unsaved rules have none)
  const statsByRule = useMemo(() => {
    const m = new Map();
    (preview?.rules || []).forEach((r) => { if (r.ruleId != null) m.set(r.ruleId, { ...r, bars: preview.bars }); });
    return m;
  }, [preview]);

  const usage = saved?.usage || [];
  const backtests = usage.reduce((s, u) => s + u.backtests, 0);
  const optimizations = usage.reduce((s, u) => s + u.optimizations, 0);
  const err = (x) => (showErrors ? x : null);

  return (
    <div className="flex flex-col gap-6" data-testid="strategy-constructor">
      {listError && <div className="form-error" role="alert">Loading the strategies failed: {listError}</div>}
      {notice && (
        <div className="p-3 rounded bg-blue-50 border border-blue-300 text-blue-900 text-sm flex justify-between gap-2" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {deleteBlock && (
        <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-900 text-sm" role="alert" data-testid="delete-references">
          <div className="font-medium">
            «{deleteBlock.item.name}» is used by {referenceCount(deleteBlock.references)} item
            {referenceCount(deleteBlock.references) === 1 ? '' : 's'}:
          </div>
          <ReferencesList references={deleteBlock.references} />
          <p className="mt-2">
            After deleting, these cases load with a warning and do not run; the watches become BROKEN.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => handleDelete(deleteBlock.item, true)} disabled={busyId === deleteBlock.item.id}
              className="py-1 px-3 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 text-sm" data-testid="delete-anyway">
              Delete anyway
            </button>
            <button type="button" onClick={() => setDeleteBlock(null)} className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm">
              Keep it
            </button>
          </div>
        </div>
      )}

      <ConstructedStrategyList
        items={items}
        selectedId={draft?.id ?? null}
        busyId={busyId}
        onNew={handleNew}
        onEdit={handleEdit}
        onDelete={(s) => handleDelete(s)}
        onRefresh={refreshList}
      />

      {loadError && <div className="form-error" role="alert">{loadError}</div>}

      {draft && (
        <div className="bg-white p-6 rounded-lg shadow" data-testid="constructed-editor">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold">
              {draft.id != null ? `Edit strategy (v${saved?.version ?? draft.version})` : 'New strategy'}
              {dirtyRules && draft.id != null && (
                <span className="ml-2 text-sm font-normal text-amber-700">rules changed: saving creates v{(saved?.version ?? 0) + 1}</span>
              )}
            </h2>
            <div className="text-sm text-gray-600" data-testid="constructed-run-tfs">
              Runs on <b>{runTfs.join(' or ')}</b>
              <span className="ml-1 text-xs text-gray-500">
                {runTfs.length === 1 ? '(it has DAY conditions)' : '(only WEEK conditions)'} · request key{' '}
                <code>{saved?.key || 'assigned on save'}</code>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className={label} htmlFor="cs-name">Name</label>
              <input id="cs-name" className={input} value={draft.name} maxLength={128}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. SMA200 regime block"
                data-testid="constructed-name" />
            </div>
            <div className="md:col-span-8">
              <label className={label} htmlFor="cs-note">Description</label>
              <input id="cs-note" className={input} value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
            </div>
          </div>

          {saved && (
            <div className="mt-3 text-sm text-gray-600" data-testid="constructed-attempts">
              <span className="font-medium text-gray-800">Attempts</span> (how many times its versions were tested):{' '}
              {saved.version} version{saved.version === 1 ? '' : 's'} · {backtests} backtest{backtests === 1 ? '' : 's'} ·{' '}
              {optimizations} optimization{optimizations === 1 ? '' : 's'}
              <span className="ml-1 text-xs text-gray-500">(previews and the Signals tab are not counted)</span>
              {usage.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-blue-700">by version, ticker and TF</summary>
                  <table className="mt-1 text-xs">
                    <thead><tr className="text-gray-500">
                      <th className="pr-3 text-left">Version</th><th className="pr-3 text-left">Ticker</th><th className="pr-3 text-left">TF</th>
                      <th className="pr-3 text-right">Backtests</th><th className="pr-3 text-right">Optimizations</th>
                      <th className="pr-3 text-right">Combinations</th><th className="text-left">Last run</th>
                    </tr></thead>
                    <tbody>
                      {usage.map((u, i) => (
                        <tr key={i}>
                          <td className="pr-3">v{u.version}</td><td className="pr-3">{u.ticker}</td><td className="pr-3">{u.timeframe}</td>
                          <td className="pr-3 text-right">{u.backtests}</td><td className="pr-3 text-right">{u.optimizations}</td>
                          <td className="pr-3 text-right">{u.combinations.toLocaleString('en-US')}</td><td>{fmtWhen(u.lastRunAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mt-6 mb-2">
            <h3 className="text-lg font-semibold">
              Rules <span className="text-sm font-normal text-gray-500">(several rules on one bar → one signal: the first in ShortOpen &lt; ShortClose &lt; LongClose &lt; LongBlock &lt; LongOpen)</span>
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {draft.rules.map((r, i) => (
              <RuleEditor
                key={r.id != null ? `r${r.id}` : `n${i}`}
                rule={r}
                index={i}
                count={draft.rules.length}
                onChange={(x) => setRule(i, x)}
                onRemove={() => removeRule(i)}
                onMove={(d) => moveRule(i, d)}
                signalTypes={meta.signalTypes}
                maxConditions={meta.maxConditions}
                evalTf={evalTf}
                errors={err(validation.rules[i])}
                stats={r.id != null && previewSig === rulesSignature(draft.rules) ? statsByRule.get(r.id) || null : null}
                disabled={saving}
              />
            ))}
            {draft.rules.length === 0 && <p className="text-sm text-gray-500">No rules yet.</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={addRule} disabled={saving || draft.rules.length >= meta.maxRules}
              className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400" data-testid="constructed-add-rule">
              + Rule
            </button>
            <button type="button" onClick={() => setImportOpen(true)} disabled={saving}
              className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm" data-testid="constructed-import">
              Import from a screener filter…
            </button>
            <span className="text-xs text-gray-500 self-center">
              Thresholds (tolerance %, SMA lengths, constants) become parameters fixed at these values; set a range in Optimize to sweep one.
            </span>
          </div>

          {showErrors && validation.general.length > 0 && (
            <ul className="mt-4 text-sm text-red-600 list-disc list-inside" data-testid="constructed-errors">
              {validation.general.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {saveError && <div className="form-error mt-4" role="alert" data-testid="constructed-save-error">{saveError}</div>}
          {saveMessage && <div className="mt-4 text-sm text-green-700" role="status" data-testid="constructed-save-message">{saveMessage}</div>}

          <div className="mt-6 flex flex-wrap items-end gap-3 border-t pt-4">
            <button type="button" onClick={handleSave} disabled={saving || (!dirty && draft.id != null)}
              className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400" data-testid="constructed-save">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={handleClose} disabled={saving} className="py-2 px-4 border rounded text-gray-700 hover:bg-gray-100">
              Close
            </button>
          </div>
        </div>
      )}

      {draft && (
        <ConstructedPreview
          form={previewForm}
          onFormChange={(patch) => setPreviewForm((f) => ({ ...f, ...patch }))}
          onRun={handlePreview}
          busy={previewBusy}
          error={previewError}
          preview={preview}
          stale={!!preview && previewSig !== rulesSignature(draft.rules)}
          tickers={tickers}
          timeframes={previewTfs.length ? previewTfs : ['DAY', 'WEEK']}
          stateRuleFireRate={meta.stateRuleFireRate}
        />
      )}

      {importOpen && draft && (
        <ImportFromFilterDialog
          rules={draft.rules}
          signalTypes={meta.signalTypes}
          maxConditions={meta.maxConditions}
          onImport={handleImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
