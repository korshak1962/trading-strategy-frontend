// src/components/strategyConstructor/AxesEditor.jsx
//
// Axes of a constructed strategy (stage 3a, screener architect.md §3.1, BA spec §3.2): named
// parameters `$Name` (kind: SMA length / tolerance % / constant) that linked thresholds use as
// `±$A` or `±$A ± $B`. An axis is ONE parameter for the optimizer, however many thresholds use it.
// Its default grid (min / max / step) is part of the definition: editing it creates a new version
// (O1). By default an axis is fixed (min = max = value), template axes come with the class grid.
import { AXIS_KINDS, MAX_AXES } from '../../api/constructedApi';
import { AXIS_KIND_LABEL, newAxis } from './constructedFormat';

const cell = 'p-1 border rounded text-sm';
const num = `${cell} w-20`;

const KIND_HINT = {
  LENGTH: 'SMA length in bars (whole number); links to an SMA length of a condition',
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
 * @param {boolean} props.disabled
 */
export default function AxesEditor({ axes, onChange, onAdd, onRemove, usage, errors, disabled }) {
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
    </div>
  );
}
