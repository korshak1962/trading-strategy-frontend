// src/components/strategyConstructor/LinkPicker.jsx
//
// Link of one threshold of a rule condition to the strategy's axes (stage 3a, screener
// architect.md §3.1, BA spec §3.2 Q2): `±$A` or `±$A ± $B`, only axes of the threshold's kind
// (a length with a length axis, a tolerance with a tolerance axis, a constant with a
// constant axis). Rendered next to the threshold's input by CompareConditionRow (renderLink).
import { useState } from 'react';
import { MAX_LINK_TERMS } from '../../api/constructedApi';
import { AXIS_KIND_LABEL, linkText, suffixKind } from './constructedFormat';

const sel = 'p-0.5 border rounded text-xs bg-white';
const chip = 'px-1.5 py-0.5 rounded border text-xs font-mono';

/**
 * @param {Object} props
 * @param {string} props.suffix `left.n` | `right.n` | `right.const` | `tolerancePct`
 * @param {Array|null} props.terms the link `[{sign, axis}]`, null / empty when not linked
 * @param {Array} props.axes the draft's axes
 * @param {(terms: Array|null) => void} props.onChange null = unlink
 * @param {(kind: string) => string|null} props.onCreateAxis creates an axis of `kind` from the
 *   threshold's current value and returns its name
 * @param {boolean} props.disabled
 */
export default function LinkPicker({ suffix, terms, axes, onChange, onCreateAxis, disabled }) {
  const [open, setOpen] = useState(false);
  const kind = suffixKind(suffix);
  const candidates = (axes || []).filter((a) => a.kind === kind);
  const linked = Array.isArray(terms) && terms.length > 0;

  const setTerm = (i, patch) => onChange(terms.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const removeTerm = (i) => {
    const next = terms.filter((_, j) => j !== i);
    onChange(next.length ? next : null);
  };
  const startLink = () => {
    if (candidates.length) onChange([{ sign: 1, axis: candidates[0].name }]);
    else {
      const name = onCreateAxis?.(kind);
      if (name) onChange([{ sign: 1, axis: name }]);
    }
    setOpen(true);
  };

  if (!linked) {
    return (
      <button type="button" disabled={disabled} onClick={startLink}
        className="px-1 text-xs text-indigo-700 hover:underline disabled:text-gray-400"
        title={candidates.length
          ? `Link this ${AXIS_KIND_LABEL[kind]} to an axis`
          : `Create a ${AXIS_KIND_LABEL[kind]} axis from this value and link it`}
        data-testid={`link-${suffix}`}>
        link
      </button>
    );
  }

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}
        className={`${chip} bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100`}
        title="Linked threshold: its value comes from the axes. Click to edit the link."
        data-testid={`link-chip-${suffix}`}>
        = {linkText(terms)}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1 px-1 py-0.5 rounded border border-indigo-300 bg-indigo-50"
      data-testid={`link-editor-${suffix}`}>
      <span className="text-xs text-indigo-900">=</span>
      {terms.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          <select className={sel} value={t.sign < 0 ? '-1' : '1'} disabled={disabled}
            onChange={(e) => setTerm(i, { sign: Number(e.target.value) })} aria-label="sign">
            <option value="1">+</option>
            <option value="-1">−</option>
          </select>
          <select className={`${sel} font-mono`} value={t.axis} disabled={disabled}
            onChange={(e) => setTerm(i, { axis: e.target.value })} aria-label="axis">
            {candidates.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            {!candidates.some((a) => a.name === t.axis) && <option value={t.axis}>{t.axis} (missing)</option>}
          </select>
          {terms.length > 1 && (
            <button type="button" className="px-0.5 text-xs text-gray-500 hover:text-gray-800" disabled={disabled}
              onClick={() => removeTerm(i)} aria-label="Remove the term" title="Remove the term">✕</button>
          )}
        </span>
      ))}
      {terms.length < MAX_LINK_TERMS && candidates.length > 0 && (
        <button type="button" className="px-1 text-xs text-indigo-700 hover:underline" disabled={disabled}
          onClick={() => onChange([...terms, { sign: 1, axis: candidates[0].name }])}
          title="Add a second axis: e.g. slow length = $FastLength + $Spread">+ axis</button>
      )}
      <button type="button" className="px-1 text-xs text-red-700 hover:underline" disabled={disabled}
        onClick={() => { onChange(null); setOpen(false); }} title="Unlink: the threshold becomes a parameter of its own again"
        data-testid={`unlink-${suffix}`}>unlink</button>
      <button type="button" className="px-1 text-xs text-gray-700 hover:underline" onClick={() => setOpen(false)}>done</button>
    </span>
  );
}
