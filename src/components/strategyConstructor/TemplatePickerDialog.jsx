// src/components/strategyConstructor/TemplatePickerDialog.jsx
//
// "Create from template" (stage 3a, screener architect.md §4.3, BA spec §3.4 / Q7): the code
// templates (GET /constructed/templates: "Price vs MA", "MA crossover", …) with their rules and
// axes; Create → POST /templates/{id}/create {name?} → an ordinary constructed strategy v1 that is
// then edited like any other. 409 NAME_EXISTS → choose another name; 404 → the template is gone.
import { useEffect, useState } from 'react';
import { listTemplates, createFromTemplate } from '../../api/constructedApi';
import { describeApiError } from '../../api/httpClient';
import { AXIS_KIND_LABEL, ruleCaption } from './constructedFormat';
import { fmtNum } from '../universeScreener/conditionFormat';
import '../watch/watch.css';

const sel = 'p-2 border rounded text-sm bg-white';

const gridText = (a) => (Number(a.max) > Number(a.min)
  ? `${fmtNum(a.min)}..${fmtNum(a.max)} step ${fmtNum(a.step)}`
  : 'fixed');

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

  useEffect(() => {
    let alive = true;
    listTemplates()
      .then((list) => {
        if (!alive) return;
        setTemplates(list);
        if (list.length) { setTemplateId(list[0].templateId); setName(list[0].name); }
      })
      .catch((err) => { if (alive) { setTemplates([]); setError(describeApiError(err)); } });
    return () => { alive = false; };
  }, []);

  const template = (templates || []).find((t) => t.templateId === templateId) || null;

  const choose = (id) => {
    setTemplateId(id);
    const t = (templates || []).find((x) => x.templateId === id);
    if (t) setName(t.name);
    setError(null);
  };

  const doCreate = async () => {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const dto = await createFromTemplate(template.templateId, name);
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
            <div className="text-sm font-medium text-gray-700 mb-1">Rules</div>
            <ul className="text-xs font-mono space-y-1 mb-2" data-testid="template-rules">
              {template.rules.map((r, i) => <li key={i}>{ruleCaption(r, 'DAY', template.axes)}</li>)}
            </ul>
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
            <p className="mt-2 text-xs text-gray-500">
              RUN operands use the TF of the run, so the strategy works on any timeframe (MIN5 … MONTH).
            </p>

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
