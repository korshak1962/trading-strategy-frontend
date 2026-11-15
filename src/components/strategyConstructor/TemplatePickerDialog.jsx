// src/components/strategyConstructor/TemplatePickerDialog.jsx
//
// "Create from template" (stage 3a, screener architect.md §4.3, BA spec §3.4 / Q7): the code
// templates (GET /constructed/templates: "Price vs MA", "MA crossover", …) with their rules and
// axes; Create → POST /templates/{id}/create {name?} → an ordinary constructed strategy v1 that is
// then edited like any other. 409 NAME_EXISTS → choose another name; 404 → the template is gone.
// Stage 3b-2: the template's axis constraints ("SMA tilt": $TiltSell ≤ $TiltBuy) are listed too.
// Stage 4b: a template's create options (`level-breakout-bricks`: take profit R5 / regime filter on
// R1) as checkboxes, sent as `options: {key: true|false}`; the listed rules are the no-option variant.
// Re-arm round: an option starts at its `defaultValue` (`rearm` on) and every option is sent explicitly.
// Stage 4c-1: the listed rules are the variant with the options at their defaults (`entryAnchor` on:
// R2–R4 read the trade's entry); a template whose rules read the trade carries the PD badge.
import { useEffect, useState } from 'react';
import { listTemplates, createFromTemplate } from '../../api/constructedApi';
import { describeApiError } from '../../api/httpClient';
import {
  AXIS_KIND_LABEL, constraintText, ruleCaption, runTfsOf, runTfsHint, levelsCaptionOpts, levelsLegendLines, usesPosition,
} from './constructedFormat';
import PositionDependentBadge from './PositionDependentBadge';
import { fmtNum } from '../universeScreener/conditionFormat';
import '../watch/watch.css';

const sel = 'p-2 border rounded text-sm bg-white';

const gridText = (a) => (Number(a.max) > Number(a.min)
  ? `${fmtNum(a.min)}..${fmtNum(a.max)} step ${fmtNum(a.step)}`
  : 'fixed');

/**
 * The template's run timeframes, derived from its rules like the editor's "Runs on …" line
 * (runTfsOf / runTfsHint): channel conditions or RUN offsets → DAY / WEEK, a DAY operand → DAY.
 */
const templateRunTfsText = (rules) => {
  const tfs = runTfsOf(rules || []);
  if (!tfs.length) return 'No timeframe can run all of its conditions.';
  const which = tfs.length === 1 ? `on ${tfs[0]} only` : `on ${tfs.join(' / ')}`;
  return `Runs ${which} ${runTfsHint(tfs, rules)}.`;
};

/**
 * @param {Object} props
 * @param {(dto: Object) => void} props.onCreated the created strategy (normalized DTO)
 * @param {() => void} props.onClose
 */
export default function TemplatePickerDialog({ onCreated, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState({}); // stage 4b: {takeProfit: true, …} of the chosen template
  /** The options of a template at their defaults (`defaultValue`, re-arm round). */
  const defaultOptions = (t) => Object.fromEntries((t?.options || []).map((o) => [o.key, o.defaultValue === true]));

  useEffect(() => {
    let alive = true;
    listTemplates()
      .then((list) => {
        if (!alive) return;
        setTemplates(list);
        if (list.length) { setTemplateId(list[0].templateId); setName(list[0].name); setOptions(defaultOptions(list[0])); }
      })
      .catch((err) => { if (alive) { setTemplates([]); setError(describeApiError(err)); } });
    return () => { alive = false; };
  }, []);

  const template = (templates || []).find((t) => t.templateId === templateId) || null;

  const choose = (id) => {
    setTemplateId(id);
    const t = (templates || []).find((x) => x.templateId === id);
    if (t) setName(t.name);
    setOptions(defaultOptions(t));
    setError(null);
  };

  const doCreate = async () => {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      // options only for a template that has them (the backend answers 400 otherwise)
      const opts = template.options.length
        ? Object.fromEntries(template.options.map((o) => [o.key, (options[o.key] ?? o.defaultValue) === true]))
        : null;
      const dto = await createFromTemplate(template.templateId, name, opts);
      onCreated(dto);
    } catch (err) {
      if (err.status === 409) setError(`A strategy named "${(name || template.name).trim()}" already exists — choose another name.`);
      else if (err.status === 404) setError(`The template "${template.name}" no longer exists.`);
      else setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="watch-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="watch-modal" role="dialog" aria-modal="true" aria-labelledby="template-title" data-testid="template-dialog">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 id="template-title" className="text-lg font-bold">Create a strategy from a template</h2>
            <p className="text-sm text-gray-600">
              The template is copied into a new constructed strategy (v1). Edit it afterwards like any other; the template itself does not change.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="template-select">Template</label>
        <select id="template-select" className={`${sel} w-full`} value={templateId} onChange={(e) => choose(e.target.value)}
          disabled={templates == null || templates.length === 0} data-testid="template-select">
          {templates == null && <option value="">Loading templates…</option>}
          {templates != null && templates.length === 0 && <option value="">No templates</option>}
          {(templates || []).map((t) => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}
        </select>

        {template && (
          <div className="mt-3" data-testid="template-details">
            {template.description && <p className="text-sm text-gray-700 mb-2">{template.description}</p>}
            <div className="text-sm font-medium text-gray-700 mb-1">
              Rules
              {usesPosition(template.rules) && (
                <PositionDependentBadge testId="template-pd-badge" long
                  title="These rules read the trade (AT_ENTRY / MAX_SINCE_ENTRY, LONG only): the strategy is position dependent. Unticking an option that adds them (entryAnchor) gives a stateless variant." />
              )}
            </div>
            <ul className="text-xs font-mono space-y-1 mb-2" data-testid="template-rules">
              {template.rules.map((r, i) => (
                <li key={i}>{ruleCaption(r, 'DAY', template.axes, levelsCaptionOpts(template.rules, template.axes))}</li>
              ))}
            </ul>
            {levelsLegendLines(template.rules, template.axes).map((l) => (
              <p key={l} className="text-xs font-mono text-gray-500 mb-1" data-testid="template-levels-legend">{l}</p>
            ))}
            {template.axes.length > 0 && (
              <>
                <div className="text-sm font-medium text-gray-700 mb-1">Axes (the parameters Optimize sweeps)</div>
                <ul className="text-xs space-y-1" data-testid="template-axes">
                  {template.axes.map((a) => (
                    <li key={a.name}>
                      <span className="font-mono font-semibold">{a.name}</span>
                      {' '}· {AXIS_KIND_LABEL[a.kind] || a.kind} · default {fmtNum(a.value)} · grid {gridText(a)}
                      {(a.lo !== '' || a.hi !== '') && <> · bounds {a.lo !== '' ? `≥ ${fmtNum(a.lo)}` : ''}{a.lo !== '' && a.hi !== '' ? ', ' : ''}{a.hi !== '' ? `≤ ${fmtNum(a.hi)}` : ''}</>}
                      {a.note && <span className="text-gray-500"> — {a.note}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {template.constraints.length > 0 && (
              <>
                <div className="text-sm font-medium text-gray-700 mt-2 mb-1">
                  Constraints between axes <span className="font-normal text-gray-500">(every grid point in Optimize must satisfy them)</span>
                </div>
                <ul className="text-xs font-mono space-y-1" data-testid="template-constraints">
                  {template.constraints.map((c, i) => <li key={i}>{constraintText(c)}</li>)}
                </ul>
              </>
            )}
            <p className="mt-2 text-xs text-gray-500" data-testid="template-run-tfs">
              {templateRunTfsText(template.rules)}
            </p>
            {template.options.length > 0 && (
              <fieldset className="mt-3" data-testid="template-options">
                <legend className="text-sm font-medium text-gray-700 mb-1">
                  Options <span className="font-normal text-gray-500">(the rules above are the variant with the options at their defaults)</span>
                </legend>
                {template.options.map((o) => (
                  <label key={o.key} className="flex items-start gap-2 text-sm text-gray-700 mb-1" title={o.hint || undefined}>
                    <input type="checkbox" className="mt-1" checked={(options[o.key] ?? o.defaultValue) === true}
                      onChange={(e) => setOptions((x) => ({ ...x, [o.key]: e.target.checked }))}
                      data-testid={`template-option-${o.key}`} />
                    <span>
                      {o.label}
                      {o.defaultValue && <span className="ml-1 text-xs text-gray-500">(on by default)</span>}
                      {o.hint && <span className="block text-xs text-gray-500">{o.hint}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <label className="block text-sm font-medium text-gray-700 mt-3 mb-1" htmlFor="template-name">Name of the new strategy</label>
            <input id="template-name" className="w-full p-2 border rounded" value={name} maxLength={128}
              onChange={(e) => setName(e.target.value)} data-testid="template-name" />
          </div>
        )}
        {error && <div className="form-error mt-3" role="alert" data-testid="template-error">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="py-2 px-4 border rounded text-gray-700 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={doCreate} disabled={!template || busy || !name.trim()}
            className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400" data-testid="template-create">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
