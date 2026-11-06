// src/components/strategyConstructor/AxesEditor.jsx
//
// Axes of a constructed strategy (stage 3a, screener architect.md §3.1, BA spec §3.2): named
// parameters `$Name` (kind: length / tolerance % / constant) that linked thresholds use as
// `±$A` or `±$A ± $B`. An axis is ONE parameter for the optimizer, however many thresholds use it.
// Its default grid (min / max / step) is part of the definition: editing it creates a new version
// (O1). By default an axis is fixed (min = max = value), template axes come with the class grid.
// Stage 3b-2 (architect F12 / §5.1): constraints between two axes of one kind
// (`$TiltSell ≤ $TiltBuy`), part of the definition too: every run point and every pair of the two
// axes' grid values in Optimize must satisfy them (the backend refuses a run with a violating point).
import { AXIS_KINDS, MAX_AXES, CONSTRAINT_OPS, CONSTRAINT_OP_SYMBOL, MAX_CONSTRAINTS } from '../../api/constructedApi';
import { AXIS_KIND_LABEL, newAxis, newConstraint, constraintText, hasSameKindPair } from './constructedFormat';

const cell = 'p-1 border rounded text-sm';
const num = `${cell} w-20`;

const KIND_HINT = {
  LENGTH: 'Length in bars (whole number); links to the length n of a condition operand (SMA, ATR, RSI, …)',
  TOLERANCE: 'Tolerance in %; links to the tolerance of a condition (right × (1 + tolerance / 100))',
  CONST: 'A constant; links to the constant on the right side of a condition',
};

/**
 * @param {Object} props
 * @param {Array} props.axes editor axes {name, kind, value, min, max, step, lo, hi, note}
 * @param {(i: number, patch: Object) => void} props.onChange
 * @param {(axis: Object) => void} props.onAdd
 * @param {(i: number) => void} props.onRemove
 * @param {Object} props.usage {$Name: number of links using it}
 * @param {string[][]|null} props.errors per axis (shown after a save / preview attempt)
 * @param {Array} [props.constraints] axis constraints {left, op, right}
 * @param {(constraints: Array) => void} [props.onConstraintsChange]
 * @param {string[][]|null} [props.constraintErrors] per constraint (shown after a save / preview attempt)
 * @param {string[]} [props.constraintWarnings] shown always (the default sweep violates a constraint)
 * @param {boolean} props.disabled
 */
export default function AxesEditor({
  axes, onChange, onAdd, onRemove, usage, errors, disabled,
  constraints = [], onConstraintsChange = null, constraintErrors = null, constraintWarnings = [],
}) {
  const set = (i, field) => (e) => onChange(i, { [field]: e.target.value });
  return (
    <div className="mt-6" data-testid="constructed-axes">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-lg font-semibold">
          Axes <span className="text-sm font-normal text-gray-500">(linked parameters: one knob for several thresholds)</span>
        </h3>
        <div className="flex gap-1">
          {AXIS_KINDS.map((k) => (
            <button key={k} type="button" disabled={disabled || axes.length >= MAX_AXES}
              onClick={() => onAdd(newAxis(axes, k))} title={KIND_HINT[k]}
              className="py-1 px-2 border rounded text-gray-700 hover:bg-gray-100 text-xs disabled:text-gray-400"
              data-testid={`axis-add-${k}`}>
              + {AXIS_KIND_LABEL[k]} axis
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        A threshold linked to an axis takes its value (<code>$Gap</code>, <code>−$Gap</code>, <code>$Fast + $Spread</code>) and is no
        longer a parameter of its own: the optimizer sweeps the axis. Min = Max = Value keeps the axis fixed; a range is its default
        sweep in Optimize. Changing an axis or a link creates a new version.
      </p>
      {axes.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="axes-empty">No axes: every threshold is a parameter of its own.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-1 py-1 text-left">Name</th>
                <th className="px-1 py-1 text-left">Kind</th>
                <th className="px-1 py-1 text-left">Value</th>
                <th className="px-1 py-1 text-left" title="Default sweep range in Optimize; Min = Max = Value: fixed">Min</th>
                <th className="px-1 py-1 text-left">Max</th>
                <th className="px-1 py-1 text-left">Step</th>
                <th className="px-1 py-1 text-left" title="Hard bounds of the value (optional): a value or a grid point outside → 400">Bounds</th>
                <th className="px-1 py-1 text-left">Description</th>
                <th className="px-1 py-1 text-left">Used</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {axes.map((a, i) => {
                const swept = Number(a.max) > Number(a.min);
                return (
                  <tr key={i} className="border-t align-top" data-testid="axis-row">
                    <td className="px-1 py-1">
                      <input className={`${cell} w-32 font-mono`} value={a.name} disabled={disabled} onChange={set(i, 'name')}
                        aria-label="axis name" maxLength={33} data-testid="axis-name" />
                    </td>
                    <td className="px-1 py-1">
                      <select className={`${cell} bg-white`} value={a.kind} disabled={disabled || (usage[a.name] || 0) > 0}
                        onChange={set(i, 'kind')} aria-label="axis kind"
                        title={(usage[a.name] || 0) > 0 ? 'Unlink the thresholds to change the kind' : KIND_HINT[a.kind]}>
                        {AXIS_KINDS.map((k) => <option key={k} value={k}>{AXIS_KIND_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="any" className={num} value={a.value} disabled={disabled} onChange={set(i, 'value')}
                        aria-label="axis value" data-testid="axis-value" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="any" className={num} value={a.min} disabled={disabled} onChange={set(i, 'min')} aria-label="axis min" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="any" className={num} value={a.max} disabled={disabled} onChange={set(i, 'max')} aria-label="axis max" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="any" className={`${cell} w-16`} value={a.step} disabled={disabled} onChange={set(i, 'step')} aria-label="axis step" />
                      <div className="text-xs text-gray-500 mt-0.5">{swept ? 'in sweep' : 'fixed'}</div>
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap">
                      <input type="number" step="any" className={`${cell} w-16`} value={a.lo ?? ''} placeholder="lo" disabled={disabled}
                        onChange={set(i, 'lo')} aria-label="axis lower bound" />
                      {' '}
                      <input type="number" step="any" className={`${cell} w-16`} value={a.hi ?? ''} placeholder="hi" disabled={disabled}
                        onChange={set(i, 'hi')} aria-label="axis upper bound" />
                    </td>
                    <td className="px-1 py-1">
                      <input className={`${cell} w-56`} value={a.note} disabled={disabled} onChange={set(i, 'note')}
                        placeholder="shown as the parameter's tooltip" aria-label="axis description" />
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap text-gray-700">
                      {usage[a.name] || 0} threshold{(usage[a.name] || 0) === 1 ? '' : 's'}
                    </td>
                    <td className="px-1 py-1 text-right">
                      <button type="button" className="px-1.5 text-red-600 hover:text-red-800 disabled:text-gray-300" disabled={disabled}
                        onClick={() => onRemove(i)} title="Remove the axis (its thresholds keep the current value)" aria-label="Remove the axis"
                        data-testid="axis-remove">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {errors && errors.some((e) => e.length > 0) && (
            <ul className="mt-1 text-xs text-red-600 list-disc list-inside" data-testid="axes-errors">
              {errors.flatMap((e, i) => e.map((m) => <li key={`${i}-${m}`}>{axes[i]?.name || `axis ${i + 1}`}: {m}</li>))}
            </ul>
          )}
        </div>
      )}
      <ConstraintsEditor
        axes={axes}
        constraints={constraints}
        onChange={onConstraintsChange}
        errors={constraintErrors}
        warnings={constraintWarnings}
        disabled={disabled}
      />
    </div>
  );
}

/** Axis names offered in a constraint select; a name no axis has any more stays as "(unknown)". */
const axisOptions = (axes, current) => {
  const names = axes.map((a) => a.name).filter(Boolean);
  return current && !names.includes(current) ? [...names, current] : names;
};

/**
 * Constraints between axes (stage 3b-2): left axis, comparison, right axis. Both axes of one kind,
 * at most MAX_CONSTRAINTS, the defaults must satisfy them (checked again by the backend).
 */
function ConstraintsEditor({ axes, constraints, onChange, errors, warnings, disabled }) {
  const editable = typeof onChange === 'function';
  const kindOf = (name) => axes.find((a) => a.name === name)?.kind || null;
  const update = (i, patch) => onChange(constraints.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i) => onChange(constraints.filter((_, j) => j !== i));
  const sameKind = hasSameKindPair(axes);
  const add = () => {
    const c = newConstraint(axes, constraints);
    if (c) onChange([...constraints, c]);
  };
  const canAdd = editable && !disabled && sameKind && constraints.length < MAX_CONSTRAINTS;
  const addTitle = axes.length < 2 ? 'A constraint compares two axes: add a second axis first'
    : !sameKind ? 'A constraint compares two axes of one kind (a length with a length, a tolerance with a tolerance, '
      + 'a constant with a constant): no two axes here share a kind'
      : constraints.length >= MAX_CONSTRAINTS ? `At most ${MAX_CONSTRAINTS} constraints` : 'Add a constraint between two axes of one kind';
  if (!editable && constraints.length === 0) return null;
  return (
    <div className="mt-4" data-testid="axis-constraints">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-gray-700">
          Constraints between axes{' '}
          <span className="font-normal text-gray-500">
            ({constraints.length} of at most {MAX_CONSTRAINTS}; every run point and every Optimize grid point must satisfy them)
          </span>
        </h4>
        {editable && (
          <button type="button" disabled={!canAdd} onClick={add} title={addTitle}
            className="py-1 px-2 border rounded text-gray-700 hover:bg-gray-100 text-xs disabled:text-gray-400"
            data-testid="constraint-add">
            + Constraint
          </button>
        )}
      </div>
      {constraints.length === 0 ? (
        <p className="text-xs text-gray-500" data-testid="constraints-empty">
          No constraints: every combination of the axes' grids is a valid point.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {constraints.map((c, i) => {
            const kind = kindOf(c.left);
            return (
              <li key={i} className="flex flex-wrap items-center gap-1 text-sm" data-testid="constraint-row">
                {editable ? (
                  <>
                    <select className={`${cell} bg-white font-mono`} value={c.left} disabled={disabled}
                      onChange={(e) => update(i, { left: e.target.value })} aria-label="constraint left axis" data-testid="constraint-left">
                      {!c.left && <option value="">axis…</option>}
                      {axisOptions(axes, c.left).map((n) => (
                        <option key={n} value={n}>{n}{kindOf(n) ? '' : ' (unknown)'}</option>
                      ))}
                    </select>
                    <select className={`${cell} bg-white`} value={c.op} disabled={disabled}
                      onChange={(e) => update(i, { op: e.target.value })} aria-label="constraint comparison" data-testid="constraint-op">
                      {!CONSTRAINT_OPS.includes(c.op) && <option value={c.op}>{c.op || '?'}</option>}
                      {CONSTRAINT_OPS.map((op) => <option key={op} value={op}>{CONSTRAINT_OP_SYMBOL[op]}</option>)}
                    </select>
                    <select className={`${cell} bg-white font-mono`} value={c.right} disabled={disabled}
                      onChange={(e) => update(i, { right: e.target.value })} aria-label="constraint right axis" data-testid="constraint-right">
                      {!c.right && <option value="">axis…</option>}
                      {axisOptions(axes, c.right).map((n) => (
                        <option key={n} value={n} disabled={n === c.left || (kind && kindOf(n) && kindOf(n) !== kind)}>
                          {n}{kindOf(n) ? '' : ' (unknown)'}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500 font-mono" data-testid="constraint-text">{constraintText(c)}</span>
                    <button type="button" className="px-1.5 text-red-600 hover:text-red-800 disabled:text-gray-300" disabled={disabled}
                      onClick={() => remove(i)} title="Remove the constraint" aria-label="Remove the constraint" data-testid="constraint-remove">✕</button>
                  </>
                ) : (
                  <span className="font-mono" data-testid="constraint-text">{constraintText(c)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {errors && errors.some((e) => e.length > 0) && (
        <ul className="mt-1 text-xs text-red-600 list-disc list-inside" data-testid="constraint-errors">
          {errors.flatMap((e, i) => e.map((m) => <li key={`${i}-${m}`}>{constraintText(constraints[i] || {})}: {m}</li>))}
        </ul>
      )}
      {(warnings || []).length > 0 && (
        <ul className="mt-1 text-xs text-amber-700 list-disc list-inside" data-testid="constraint-warnings">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
