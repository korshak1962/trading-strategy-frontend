// src/components/universeScreener/ConditionRows.jsx
//
// The two condition rows of the filter constructor:
//   MetricConditionRow  - CHANNEL_METRIC: TF, level (0 current / 1 parent / 2 grandparent), metric, min, max
//   CompareConditionRow - COMPARE: left operand, operator, right operand (or constant), tolerance %
// Each row shows its live caption and its validation errors.
import { METRICS, OPERATORS, SCREEN_TFS, LEVELS } from '../../api/screenerApi';
import OperandPicker from './OperandPicker';
import { conditionCaption } from './conditionFormat';

const sel = 'p-1 border rounded text-sm bg-white';
const LEVEL_LABEL = { 0: '0 · current', 1: '1 · parent', 2: '2 · grandparent' };

function RowShell({ index, caption, errors, onRemove, onMove, count, disabled, children, testId }) {
  return (
    <div className="border rounded p-3 bg-gray-50" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 w-5">{index + 1}.</span>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
        <div className="flex items-center gap-1">
          <button type="button" className="px-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300"
            disabled={disabled || index === 0} onClick={() => onMove(-1)} title="Move up" aria-label="Move up">↑</button>
          <button type="button" className="px-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300"
            disabled={disabled || index === count - 1} onClick={() => onMove(1)} title="Move down" aria-label="Move down">↓</button>
          <button type="button" className="px-1.5 text-red-600 hover:text-red-800 disabled:text-gray-300"
            disabled={disabled} onClick={onRemove} title="Remove the condition" aria-label="Remove">✕</button>
        </div>
      </div>
      <div className="mt-1 ml-7 text-xs font-mono text-gray-700" data-testid="condition-caption">{caption}</div>
      {errors?.length > 0 && (
        <ul className="mt-1 ml-7 text-xs text-red-600 list-disc list-inside">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

export function MetricConditionRow({ condition, onChange, evalTf, ...shell }) {
  const set = (patch) => onChange({ ...condition, ...patch });
  const metric = METRICS.find((m) => m.value === condition.metric);
  return (
    <RowShell {...shell} caption={conditionCaption(condition, evalTf)} testId="metric-condition">
      <span className="text-xs font-semibold text-indigo-700">Channel</span>
      <select className={sel} value={condition.tf} disabled={shell.disabled} onChange={(e) => set({ tf: e.target.value })} aria-label="timeframe">
        {SCREEN_TFS.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
      </select>
      <select className={sel} value={condition.level} disabled={shell.disabled}
        onChange={(e) => set({ level: parseInt(e.target.value, 10) })} aria-label="level">
        {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
      </select>
      <select className={sel} value={condition.metric} disabled={shell.disabled} onChange={(e) => set({ metric: e.target.value })}
        aria-label="metric" title={metric?.hint}>
        {METRICS.map((m) => <option key={m.value} value={m.value} title={m.hint}>{m.label}</option>)}
      </select>
      <label className="inline-flex items-center gap-1 text-xs text-gray-600">
        min
        <input type="number" step="any" className="p-1 border rounded text-sm w-20" value={condition.min}
          disabled={shell.disabled} onChange={(e) => set({ min: e.target.value })} aria-label="min" />
      </label>
      <label className="inline-flex items-center gap-1 text-xs text-gray-600">
        max
        <input type="number" step="any" className="p-1 border rounded text-sm w-20" value={condition.max}
          disabled={shell.disabled} onChange={(e) => set({ max: e.target.value })} aria-label="max" />
      </label>
      {metric?.unit && <span className="text-xs text-gray-500">{metric.unit}</span>}
    </RowShell>
  );
}

export function CompareConditionRow({ condition, onChange, evalTf, ...shell }) {
  const set = (patch) => onChange({ ...condition, ...patch });
  return (
    <RowShell {...shell} caption={conditionCaption(condition, evalTf)} testId="compare-condition">
      <span className="text-xs font-semibold text-teal-700">Compare</span>
      <OperandPicker side="left" value={condition.left} evalTf={evalTf} disabled={shell.disabled}
        onChange={(left) => set({ left })} testId="operand-left" />
      <select className={sel} value={condition.op} disabled={shell.disabled} onChange={(e) => set({ op: e.target.value })} aria-label="operator">
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <OperandPicker side="right" value={condition.right} evalTf={evalTf} disabled={shell.disabled}
        onChange={(right) => set({ right })} testId="operand-right" />
      <label className="inline-flex items-center gap-1 text-xs text-gray-600"
        title="right × (1 + tolerance / 100). Plus makes > stricter (breakout with a margin), minus loosens it.">
        tolerance
        <input type="number" step="0.1" className="p-1 border rounded text-sm w-16" value={condition.tolerancePct}
          disabled={shell.disabled} onChange={(e) => set({ tolerancePct: e.target.value })} aria-label="tolerance %" />
        %
      </label>
    </RowShell>
  );
}
