// src/components/strategyConstructor/StrategyConstructorPanel.jsx
//
// "Strategy constructor" tab (screener architect.md "Конструктор стратегий" §4.9, BA spec §4.2):
// the list of constructed strategies, the rule editor (rule = AND-ed screener comparisons → one
// signal type), "import from a screener filter" (a copy, no live link), the preview without merge
// and the attempt counter (Q14). Save → 201 / 200 (+ versionChanged), 409 NAME_EXISTS → rename;
// delete → soft delete; with references the backend answers 409 HAS_REFERENCES: the references are
// listed and "Delete anyway" confirms (O4). The URL names the strategy open in the editor
// (#/constructor?id=12).
// Stage 3a (architect.md §2-§4): axes and linked thresholds (AxesEditor / LinkPicker), the RUN
// operand TF (any run TF for RUN-only strategies), "Create from template" (TemplatePickerDialog)
// and hints under the stage-3a 400s (UNIT_MISMATCH, "not supported yet", grid points).
// Stage 3b-2 (architect F12): axis constraints (`$TiltSell ≤ $TiltBuy`) in AxesEditor; a rename
// of an axis follows into them, removing an axis removes its constraints; a PUT always sends the
// full list and `[]` only when the user removed every stored constraint (a missing field keeps them).
// Stage 4a (architect "этап 4a" §6): channel conditions - meta.channel goes to RuleEditor and the
// client validation; the static "channel LongBlock without an EXISTS = 0 rule" warning shows under
// the rules (the preview repeats the backend's copy); an axis removed from a channel bound leaves
// its value in min / max.
// Preview = Backtest, row click (screener architect_constructor_preview_backtest_v1.md §3.3,
// designer_constructor_preview_v1.md §2): a row click opens the editor and the list is hidden while
// it is open; the editor is left with Close ✕ / Close / "← Strategies" / Escape, a dirty draft asks
// in the in-app "Unsaved changes" dialog (no window.confirm; editorLeave.js). Escape goes through
// the escape stack (innermost first: that dialog, the template / import dialogs, an open link
// editor, then the editor; the first Escape in a text field only blurs it).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { problemReducer, withProblem } from '../common/problemError';
import { locateRuleProblem } from '../../utils/problemPath';
import ConstructedStrategyList from './ConstructedStrategyList';
import RuleEditor from './RuleEditor';
import ImportFromFilterDialog from './ImportFromFilterDialog';
import ConstructedPreview from './ConstructedPreview';
import { previewSettingsOf, previewStaleReason } from './previewFormat';
import AxesEditor from './AxesEditor';
import TemplatePickerDialog from './TemplatePickerDialog';
import PositionDependentBadge from './PositionDependentBadge';
import UnsavedChangesDialog from './UnsavedChangesDialog';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { ESCAPE_LEVEL } from '../../utils/escapeStack';
import { levelsLegendText } from '../../utils/displayLabels';
import {
  afterSaveAndClose, editorEscapeAction, isTextField, leaveDirty, requestLeave, resolveLeave,
} from './editorLeave';
import {
  DEFAULT_META, getConstructedMeta, listConstructed, getConstructed, createConstructed, updateConstructed,
  deleteConstructed, previewConstructed, toConstructedRequest, toDefinitionRequest, normalizeMeta, referenceCount,
  CONSTRUCTED_TFS, linkValue, setThreshold,
} from '../../api/constructedApi';
import { describeApiError } from '../../api/httpClient';
import { exchangeToday, addYearsIso, fmtExchangeIntl } from '../../utils/dates';
import {
  newDraft, newRule, definitionSignature, validateDraft, runTfsOf, runTfsHint, runTfError, strategyLabel, axisUsage, newAxis,
  axisHintFor, lastLevelsTemplate, applyLevelsToAll,
  constructedErrorHint, channelBlockWarnings, levelsTakeProfitWarnings, levelsLegendLines,
  usesPosition, positionRuleWarnings,
} from './constructedFormat';

const input = 'w-full p-2 border rounded';
const label = 'block text-sm font-medium text-gray-700 mb-1';
const fmtWhen = (v) => (v ? fmtExchangeIntl(v, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}, 'en-CA') : '—');

const defaultPreviewForm = () => {
  const today = exchangeToday();
  // longOnly: the Backtest form's default (off)
  return { ticker: 'SPY', timeFrame: 'DAY', startDay: addYearsIso(today, -5), endDay: today, longOnly: false };
};

/** A server error with the stage-3a hint under it (by `reason` first, Stage B3). */
function ErrorWithHint({ text, reason = null, testId }) {
  const hint = constructedErrorHint(text, reason);
  return (
    <div className="form-error mt-4" role="alert" data-testid={testId}>
      {text}
      {hint && <div className="mt-1 text-xs font-normal" data-testid="constructed-error-hint">{hint}</div>}
    </div>
  );
}

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
        <li key={`p${i}`}>parameter profile {p.ticker} {p.timeframe}{p.strategyKey ? ` · ${String(p.strategyKey).split('+').map((x) => strategyLabel(x)).join(' + ')}` : ''}</li>
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
  // Stage B3: the errors keep the backend's `{path, reason}` (problemError.js)
  const [saveProblem, setSaveError] = useReducer(problemReducer, null);
  const saveError = saveProblem?.text ?? null;
  const [saveMessage, setSaveMessage] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const [previewForm, setPreviewForm] = useState(defaultPreviewForm);
  const [preview, setPreview] = useState(null);
  const [previewSig, setPreviewSig] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewProblem, setPreviewError] = useReducer(problemReducer, null);
  const previewError = previewProblem?.text ?? null;
  const previewSeq = useRef(0);
  const loadSeq = useRef(0);
  const [leaveOpen, setLeaveOpen] = useState(false);       // the "Unsaved changes" dialog
  const [focusTarget, setFocusTarget] = useState(null);    // list row (id) / 'new' to focus after Close
  const [lastClosedId, setLastClosedId] = useState(null);  // keeps its bg-blue-50 in the list
  const [editorSession, setEditorSession] = useState(0);   // a new open → the preview's tabs reset
  const editorRef = useRef(null);
  const clearFocusTarget = useCallback(() => setFocusTarget(null), []);

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
    setLeaveOpen(false);
    setEditorSession((n) => n + 1);
    previewSeq.current += 1;
  };

  const openStrategy = useCallback(async (id) => {
    const seq = ++loadSeq.current;
    setLoadError(null);
    try {
      const dto = await getConstructed(id);
      if (seq !== loadSeq.current) return;
      setSaved(dto);
      setDraft({ ...dto, rules: dto.rules, axes: dto.axes || [], constraints: dto.constraints || [] });
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

  const draftSig = draft ? definitionSignature(draft) : null;
  const dirtyRules = !!draft && (!saved || draftSig !== definitionSignature(saved));
  const dirty = !!draft && (dirtyRules || !saved || (draft.name || '') !== (saved.name || '') || (draft.note || '') !== (saved.note || ''));
  const validation = useMemo(
    () => (draft ? validateDraft(draft, {
      allowedTypes: meta.signalTypes, maxRules: meta.maxRules, maxConditions: meta.maxConditions, channelMeta: meta.channel,
      levelsMeta: meta.levels, bricksMeta: meta.bricks, positionMeta: meta.position, maxAxes: meta.maxAxes,
    }) : null),
    [draft, meta],
  );
  const runTfs = draft ? runTfsOf(draft.rules) : ['DAY', 'WEEK'];
  const previewTfs = meta.timeframes.filter((tf) => CONSTRUCTED_TFS.includes(tf));
  const usage = useMemo(() => axisUsage(draft?.rules), [draft]);
  const channelWarnings = useMemo(() => channelBlockWarnings(draft?.rules), [draft]);
  // stage 4c-1: a LongOpen / LongBlock rule reading the trade changes nothing; PD = a rule reads the trade
  const positionWarnings = useMemo(() => positionRuleWarnings(draft?.rules), [draft]);
  const draftIsPd = useMemo(() => usesPosition(draft?.rules), [draft]);
  // re-arm round: the Levels take-profit vs the take-profit rule (non-blocking), and the Levels legend (@L2 tags)
  const levelsWarnings = useMemo(
    () => levelsTakeProfitWarnings(draft?.rules, draft?.axes || [], meta.levels?.defaults), [draft, meta]);
  const levelsLegendCode = useMemo(() => levelsLegendLines(draft?.rules, draft?.axes || [], meta.levels?.defaults), [draft, meta]);
  // Stage B (B2): the plain-English legend (`Levels: default settings · re-arm`, `Levels axes: …` once); code in the title
  const levelsLegend = useMemo(() => levelsLegendText(draft?.rules, draft?.axes || []), [draft]);
  // stage 4b: the Levels spec / links a new Levels occurrence copies (the strategy's last one)
  const levelsTemplate = useMemo(() => lastLevelsTemplate(draft?.rules, meta.levels?.defaults), [draft, meta]);
  const evalTf = previewForm.timeFrame;

  // Leave question: a new draft nobody typed into is clean (designer §2.4 p. 4)
  const askOnLeave = leaveDirty({ draft, saved, dirty });

  // The list is hidden while the editor is open, so New / From template / another row are only
  // reachable with no draft open: nothing to discard there.
  const handleNew = () => {
    loadSeq.current += 1;
    setSaved(null);
    setDraft(newDraft());
    setLoadError(null);
    resetEditorState();
    if (routeId != null) onRouteChange(null);
  };

  const handleEdit = (id) => {
    if (id === draft?.id) return;
    if ((items || []).some((s) => s.id === id && s.unreadable)) return; // stage 3b-0: Delete only
    onRouteChange(id);
  };

  /** Closes the editor now (no question); focus returns to the row of `focusId` (or "+ New strategy"). */
  const closeEditor = (focusId = draft?.id ?? null) => {
    loadSeq.current += 1;
    setDraft(null);
    setSaved(null);
    resetEditorState();
    setLastClosedId(focusId);
    setFocusTarget(focusId ?? 'new');
    if (routeId != null) onRouteChange(null);
  };

  /** Close ✕ / Close / ← Strategies / Escape: close a clean draft, ask about a dirty one. */
  const requestClose = () => {
    const step = requestLeave({ dirty: askOnLeave, saving });
    if (step === 'close') closeEditor();
    else if (step === 'confirm') setLeaveOpen(true);
  };

  const handleLeaveChoice = async (choice) => {
    setLeaveOpen(false);
    const next = resolveLeave(choice);
    if (next === 'close') closeEditor();
    else if (next === 'save') {
      const dto = await handleSave({ thenClose: true });
      if (afterSaveAndClose(!!dto) === 'close') closeEditor(dto.id ?? null);
    }
  };

  // Escape on the editor (the innermost layer below the dialogs): only while the tab is visible
  useEscapeLayer(() => {
    const active = document.activeElement;
    const action = editorEscapeAction({
      fullscreen: !!document.fullscreenElement,
      priceOnly: !!document.querySelector('.reporter-chart-container--price-only'),
      modalOpen: !!document.querySelector('[aria-modal="true"]'),
      focusInTextField: isTextField(active),
      dirty: askOnLeave,
      saving,
    });
    if (action === 'pass') return false;
    if (action === 'blur') {
      active?.blur?.();
      editorRef.current?.focus({ preventScroll: true });
    } else if (action === 'close') closeEditor();
    else if (action === 'confirm') setLeaveOpen(true);
    return true;
  }, { enabled: !!draft && routeId !== undefined, level: ESCAPE_LEVEL.EDITOR });

  // A newly opened editor scrolls into view (the list above it is gone)
  const editorOpen = !!draft;
  useEffect(() => {
    if (editorOpen) editorRef.current?.scrollIntoView?.({ block: 'start' });
  }, [editorOpen, editorSession]);

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

  // ---- axes (stage 3a) ----
  const mapConditions = (d, fn) => ({
    ...d,
    rules: d.rules.map((r) => ({ ...r, conditions: r.conditions.map((c) => fn(c)) })),
  });
  const addAxis = (axis) => setDraft((d) => ({ ...d, axes: [...(d.axes || []), axis] }));
  // A rename follows into every link; a kind change is only offered while the axis is unused
  const setAxis = (i, patch) => setDraft((d) => {
    const old = d.axes[i];
    const axes = d.axes.map((a, j) => (j === i ? { ...a, ...patch } : a));
    const next = { ...d, axes };
    if (patch.name == null || patch.name === old.name || axes.some((a, j) => j !== i && a.name === old.name)) return next;
    next.constraints = (d.constraints || []).map((c) => ({
      ...c,
      left: c.left === old.name ? patch.name : c.left,
      right: c.right === old.name ? patch.name : c.right,
    }));
    return mapConditions(next, (c) => ({
      ...c,
      links: Object.fromEntries(Object.entries(c.links || {}).map(([sfx, terms]) => [sfx,
        terms.map((t) => (t.axis === old.name ? { ...t, axis: patch.name } : t))])),
    }));
  });
  // Removing an axis unlinks its thresholds; each keeps the value it had through the link
  const removeAxis = (i) => {
    const axis = draft.axes[i];
    const n = usage[axis.name] || 0;
    const nc = (draft.constraints || []).filter((c) => c.left === axis.name || c.right === axis.name).length;
    const parts = [];
    if (n > 0) parts.push(`is used by ${n} threshold${n === 1 ? '' : 's'} (unlinked, they keep the current value)`);
    if (nc > 0) parts.push(`is in ${nc} constraint${nc === 1 ? '' : 's'} (removed with it)`);
    if (parts.length && !window.confirm(`${axis.name} ${parts.join(' and ')}. Remove it?`)) return;
    setDraft((d) => {
      const kept = mapConditions(d, (c) => {
        const links = { ...(c.links || {}) };
        let cond = c.condition;
        Object.entries(c.links || {}).forEach(([sfx, terms]) => {
          if (!terms.some((t) => t.axis === axis.name)) return;
          const v = linkValue(terms, d.axes);
          if (v != null) cond = setThreshold(cond, sfx, v); // COMPARE thresholds and channel min / max
          delete links[sfx];
        });
        return { ...c, condition: cond, links };
      });
      return {
        ...kept,
        axes: kept.axes.filter((_, j) => j !== i),
        constraints: (kept.constraints || []).filter((c) => c.left !== axis.name && c.right !== axis.name),
      };
    });
  };
  // "link" on a threshold with no axis of its kind yet: a new fixed axis from its current value
  const createAxisFrom = (kind, value, suffix = null) => {
    if ((draft?.axes || []).length >= meta.maxAxes) { // m9: say why instead of silently exceeding the cap
      setNotice(`At most ${meta.maxAxes} axes per strategy: remove an axis, or link this threshold to an existing one.`);
      return null;
    }
    const axis = newAxis(draft?.axes || [], kind, value, axisHintFor(suffix));
    addAxis(axis);
    return axis.name;
  };

  // stage 4b: "Apply to all Levels in this strategy" - the spec / links of one occurrence into every one
  const applyLevelsEverywhere = (ri, ci, prefix) => {
    const { draft: next, count } = applyLevelsToAll(draft, ri, ci, prefix);
    setDraft(next);
    setNotice(`Levels params applied to ${count} Levels occurrence${count === 1 ? '' : 's'} of this strategy.`);
  };

  const handleTemplateCreated = async (dto) => {
    setTemplateOpen(false);
    setNotice(`Created «${dto.name}» v${dto.version} from the template.`);
    loadSeq.current += 1;
    setSaved(dto);
    setDraft(dto);
    setLoadError(null);
    resetEditorState();
    await refreshList();
    onStrategiesChanged?.();
    if (dto.id != null) onRouteChange(dto.id);
  };

  const handleImport = ({ ruleIndex, signalType }, conditions, source) => {
    const rows = conditions.map((condition) => ({ id: null, condition, links: {} }));
    setDraft((d) => {
      if (ruleIndex == null) {
        return { ...d, rules: [...d.rules, { id: null, signalType, note: `copied from filter ${source}`, conditions: rows }] };
      }
      return { ...d, rules: d.rules.map((r, j) => (j === ruleIndex ? { ...r, conditions: [...r.conditions, ...rows] } : r)) };
    });
    setImportOpen(false);
  };

  // ---- save ----
  /** Save; resolves the saved DTO, or null (validation error / server error shown in the editor). */
  const handleSave = async ({ thenClose = false } = {}) => {
    setShowErrors(true);
    setSaveError(null);
    setSaveMessage(null);
    if (!validation.ok) return null;
    setSaving(true);
    try {
      const req = toConstructedRequest(draft, saved);
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
      // Save and close of a new strategy: the editor closes right away, the URL stays on the list
      if (isNew && dto.id != null && !thenClose) onRouteChange(dto.id, { replace: routeId == null });
      return dto;
    } catch (err) {
      setSaveError(err.status === 409 && (!err.code || err.code === 'NAME_EXISTS')
        ? `A strategy named "${draft.name.trim()}" already exists — choose another name.`
        : withProblem(describeApiError(err), err));
      return null;
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
      channelMeta: meta.channel, levelsMeta: meta.levels, bricksMeta: meta.bricks, positionMeta: meta.position, maxAxes: meta.maxAxes,
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
    const sig = definitionSignature(draft);
    setPreviewBusy(true);
    try {
      const useKey = !!saved && !dirtyRules && !!saved.key;
      const p = await previewConstructed({
        key: useKey ? saved.key : null,
        definition: useKey ? null : toDefinitionRequest(draft),
        ticker,
        timeFrame: previewForm.timeFrame,
        startDay: previewForm.startDay,
        endDay: previewForm.endDay,
        longOnly: !!previewForm.longOnly,
      });
      if (seq !== previewSeq.current) return;
      setPreview({ ...p, longOnlyRequested: !!previewForm.longOnly, ranWith: previewSettingsOf(previewForm) });
      setPreviewSig(sig);
    } catch (err) {
      if (seq !== previewSeq.current) return;
      setPreview(null);
      setPreviewError(withProblem(`Preview failed: ${describeApiError(err)}`, err));
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

  // Stage B3: the rule / condition the last server error's `path` names (ids as the backend gives
  // them, new rules included); null on an older backend (no path) or a client-side error
  const problemTarget = useMemo(
    () => locateRuleProblem(saveProblem?.path || previewProblem?.path || null, draft?.rules, saved),
    [saveProblem, previewProblem, draft?.rules, saved],
  );

  const runs = saved?.usage || [];
  const backtests = runs.reduce((s, u) => s + u.backtests, 0);
  const optimizations = runs.reduce((s, u) => s + u.optimizations, 0);
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

      {!draft && (
        <ConstructedStrategyList
          items={items}
          selectedId={lastClosedId}
          busyId={busyId}
          onNew={handleNew}
          onFromTemplate={() => setTemplateOpen(true)}
          onEdit={handleEdit}
          onDelete={(s) => handleDelete(s)}
          onRefresh={refreshList}
          focusTarget={focusTarget}
          onFocusDone={clearFocusTarget}
        />
      )}

      {loadError && <div className="form-error" role="alert">{loadError}</div>}

      {draft && (
        <div ref={editorRef} tabIndex={-1} className="bg-white p-6 rounded-lg shadow focus:outline-none" data-testid="constructed-editor">
          {/* Close ✕ stays top right: the title and "Runs on" wrap inside the left block, never Close */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <h2 className="text-xl font-bold">
                  <button type="button" onClick={requestClose} disabled={saving}
                    className="mr-1 text-base font-normal text-gray-500 hover:text-gray-800 hover:underline disabled:hover:no-underline"
                    title="Back to the list of strategies (Esc)" data-testid="constructed-breadcrumb">← Strategies /</button>
                  <span data-testid="constructed-editor-title">{draft.id != null ? (saved?.name || draft.name || `#${draft.id}`) : 'New strategy'}</span>
                  {draft.id != null && (
                    <span className="ml-1 text-base font-normal text-gray-500">v{saved?.version ?? draft.version}</span>
                  )}
                  {saved?.templateId && (
                    <span className="ml-2 px-1.5 rounded bg-indigo-100 text-indigo-800 text-xs font-medium align-middle"
                      title={`Created from the template «${saved.templateId}»`} data-testid="constructed-template-badge">template</span>
                  )}
                  {draftIsPd && <PositionDependentBadge testId="constructed-pd-badge" long />}
                  {askOnLeave && (
                    <span className="ml-2 text-sm font-normal text-amber-700" data-testid="constructed-unsaved">● Unsaved changes</span>
                  )}
                </h2>
                {dirtyRules && draft.id != null && (
                  <div className="text-sm text-amber-700">definition changed: saving creates v{(saved?.version ?? 0) + 1}</div>
                )}
              </div>
              <div className="text-sm text-gray-600" data-testid="constructed-run-tfs">
                Runs on <b>{runTfs.join(' or ')}</b>
                <span className="ml-1 text-xs text-gray-500">
                  {runTfsHint(runTfs, draft.rules)} · request key{' '}
                  <code>{saved?.key || 'assigned on save'}</code>
                </span>
              </div>
            </div>
            <button type="button" onClick={requestClose} disabled={saving}
              className="ml-auto shrink-0 py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap disabled:text-gray-400"
              title="Close (Esc)" aria-label="Close the editor" aria-keyshortcuts="Escape" data-testid="constructed-close-top">
              Close ✕
            </button>
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
              {runs.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-blue-700">by version, ticker and TF</summary>
                  <table className="mt-1 text-xs">
                    <thead><tr className="text-gray-500">
                      <th className="pr-3 text-left">Version</th><th className="pr-3 text-left">Ticker</th><th className="pr-3 text-left">TF</th>
                      <th className="pr-3 text-right">Backtests</th><th className="pr-3 text-right">Optimizations</th>
                      <th className="pr-3 text-right">Combinations</th><th className="text-left">Last run</th>
                    </tr></thead>
                    <tbody>
                      {runs.map((u, i) => (
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
                problem={problemTarget?.ruleIndex === i ? problemTarget : null}
                stats={r.id != null && previewSig === draftSig ? statsByRule.get(r.id) || null : null}
                disabled={saving}
                axes={draft.axes || []}
                onCreateAxis={createAxisFrom}
                channelMeta={meta.channel}
                allRules={draft.rules}
                levelsMeta={meta.levels}
                bricksMeta={meta.bricks}
                levelsTemplate={levelsTemplate}
                positionMeta={meta.position}
                onApplyLevelsToAll={(ci, prefix) => applyLevelsEverywhere(i, ci, prefix)}
              />
            ))}
            {draft.rules.length === 0 && <p className="text-sm text-gray-500">No rules yet.</p>}
          </div>
          {levelsLegend.length > 0 && (
            <div className="mt-3 text-xs text-gray-600" data-testid="constructed-levels-legend"
              title={`The Levels settings of this strategy (changed fields only).\n\ncode: ${levelsLegendCode.join(' | ')}`}>
              {levelsLegend.map((l) => <div key={l}>{l}</div>)}
            </div>
          )}
          {levelsWarnings.length > 0 && (
            <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status"
              data-testid="constructed-levels-warnings">
              {levelsWarnings.map((w) => <div key={w}>{w}</div>)}
            </div>
          )}
          {draftIsPd && (
            <div className="mt-3 text-xs text-purple-800" data-testid="constructed-position-note">
              Position operands read the trade: LONG only (in FLAT / SHORT their conditions fail, NOT_LONG). A percent stop
              {' '}<code>close &lt; AT_ENTRY(close)</code> with tolerance −5 is measured from the entry bar&apos;s close; on a seeded
              watch (“I already hold it”) that is the seed bar&apos;s close, not the price you paid. Runs on DAY / WEEK.
            </div>
          )}
          {positionWarnings.length > 0 && (
            <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status"
              data-testid="constructed-position-warnings">
              {positionWarnings.map((w) => <div key={w}>{w}</div>)}
            </div>
          )}
          {channelWarnings.length > 0 && (
            <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status"
              data-testid="constructed-channel-warnings">
              {channelWarnings.map((w) => <div key={w}>{w}</div>)}
            </div>
          )}
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
              Thresholds (tolerance %, SMA lengths, constants, channel min / max) become parameters fixed at these values; set a range in Optimize to sweep one.
              “link” makes several thresholds one parameter (an axis below). TF “RUN” = the TF the strategy runs on.
            </span>
          </div>

          <AxesEditor
            axes={draft.axes || []}
            onChange={setAxis}
            onAdd={addAxis}
            onRemove={removeAxis}
            usage={usage}
            errors={showErrors ? validation.axes : null}
            disabled={saving}
            constraints={draft.constraints || []}
            onConstraintsChange={(constraints) => setDraft((d) => ({ ...d, constraints }))}
            constraintErrors={showErrors ? validation.constraints : null}
            constraintWarnings={validation.constraintWarnings}
            maxAxes={meta.maxAxes}
          />

          {showErrors && validation.general.length > 0 && (
            <ul className="mt-4 text-sm text-red-600 list-disc list-inside" data-testid="constructed-errors">
              {validation.general.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {saveError && <ErrorWithHint text={saveError} reason={saveProblem.reason} testId="constructed-save-error" />}
          {saveMessage && <div className="mt-4 text-sm text-green-700" role="status" data-testid="constructed-save-message">{saveMessage}</div>}

          <div className="mt-6 flex flex-wrap items-end gap-3 border-t pt-4">
            <button type="button" onClick={() => handleSave()} disabled={saving || (!dirty && draft.id != null)}
              className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400" data-testid="constructed-save">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={requestClose} disabled={saving} title="Close (Esc)"
              className="py-2 px-4 border rounded text-gray-700 hover:bg-gray-100" data-testid="constructed-close">
              Close
            </button>
          </div>
        </div>
      )}

      {draft && (
        <ConstructedPreview
          key={editorSession}
          strategyName={draft.name || saved?.name || ''}
          form={previewForm}
          onFormChange={(patch) => setPreviewForm((f) => ({ ...f, ...patch }))}
          onRun={handlePreview}
          busy={previewBusy}
          error={previewError}
          preview={preview}
          stale={preview ? previewStaleReason({ previewSig, draftSig, ranWith: preview.ranWith, form: previewForm }) : null}
          tickers={tickers}
          timeframes={previewTfs.length ? previewTfs : [...CONSTRUCTED_TFS]}
          runTfs={runTfs}
          errorHint={constructedErrorHint(previewError, previewProblem?.reason)}
          stateRuleFireRate={meta.stateRuleFireRate}
        />
      )}

      {leaveOpen && draft && (
        <UnsavedChangesDialog
          name={draft.id != null ? (saved?.name || draft.name || `#${draft.id}`) : (draft.name.trim() || 'New strategy')}
          nextVersion={dirtyRules && draft.id != null ? (saved?.version ?? 0) + 1 : null}
          canSave={!!validation?.ok}
          onChoice={handleLeaveChoice}
        />
      )}

      {templateOpen && (
        <TemplatePickerDialog onCreated={handleTemplateCreated} onClose={() => setTemplateOpen(false)} />
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
