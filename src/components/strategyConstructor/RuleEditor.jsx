// src/components/strategyConstructor/RuleEditor.jsx
//
// One rule of a constructed strategy (screener architect.md "Конструктор стратегий" §4.9): the
// signal type it emits (LongOpen / LongClose / LongBlock / ShortOpen / ShortClose, from
// meta.signalTypes) and its AND-ed comparison conditions - the Screener's CompareConditionRow, so
// operands, offsets and captions are the same as in a filter. Channel conditions are not offered
// (stage 4). The rule's and its conditions' permanent ids are kept when rows move or change: the
// threshold names R<rule>.C<cond>.* depend on them.
import { CompareConditionRow } from '../universeScreener/ConditionRows';
import { newRuleCondition, ruleCaption, SIGNAL_TYPE_CLASS, SIGNAL_TYPE_HINT } from './constructedFormat';

const sel = 'p-1 border rounded text-sm bg-white';
const iconBtn = 'px-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300';

/**
 * @param {Object} props
 * @param {Object} props.rule editor rule {id, signalType, note, conditions: [{id, condition}]}
 * @param {number} props.index position in the strategy
 * @param {number} props.count number of rules
 * @param {(rule: Object) => void} props.onChange
 * @param {() => void} props.onRemove
 * @param {(delta: number) => void} props.onMove
 * @param {string[]} props.signalTypes allowed types (meta)
 * @param {number} props.maxConditions
 * @param {string} props.evalTf TF the captions are written for (the preview's run TF)
 * @param {{general: string[], conditions: string[][]}|null} props.errors shown after a save / preview attempt
 * @param {Object|null} props.stats the rule's line of the last preview (RulePreviewDTO), or null
 * @param {boolean} props.disabled
 */
export default function RuleEditor({
  rule, index, count, onChange, onRemove, onMove, signalTypes, maxConditions, evalTf, errors, stats, disabled,
}) {
  const set = (patch) => onChange({ ...rule, ...patch });
  const setCondition = (i, condition) => set({
    conditions: rule.conditions.map((c, j) => (j === i ? { ...c, condition } : c)),
  });
  const removeCondition = (i) => set({ conditions: rule.conditions.filter((_, j) => j !== i) });
  const moveCondition = (i, delta) => {
    const cs = [...rule.conditions];
    const j = i + delta;
    if (j < 0 || j >= cs.length) return;
    [cs[i], cs[j]] = [cs[j], cs[i]];
    set({ conditions: cs });
  };
  const types = signalTypes.includes(rule.signalType) ? signalTypes : [...signalTypes, rule.signalType];

  return (
    <div className="border rounded-lg p-3 bg-white" data-testid="constructor-rule">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-700 w-16" title="Permanent rule id: threshold names R<id>.C<id>.* use it">
          {rule.id != null ? `R${rule.id}` : 'new rule'}
        </span>
        <label className="inline-flex items-center gap-1 text-sm text-gray-600">
          emits
          <select
            className={`${sel} font-medium border ${SIGNAL_TYPE_CLASS[rule.signalType] || ''}`}
            value={rule.signalType}
            disabled={disabled}
            onChange={(e) => set({ signalType: e.target.value })}
            aria-label="signal type"
            title={SIGNAL_TYPE_HINT[rule.signalType]}
            data-testid="rule-signal-type"
          >
            {types.map((t) => <option key={t} value={t} title={SIGNAL_TYPE_HINT[t]}>{t}</option>)}
          </select>
        </label>
        <span className="text-xs text-gray-500">when all conditions hold on the bar</span>
        <input
          className="p-1 border rounded text-sm flex-1 min-w-[8rem]"
          value={rule.note}
          disabled={disabled}
          placeholder="note (optional)"
          onChange={(e) => set({ note: e.target.value })}
          aria-label="rule note"
        />
        <div className="flex items-center gap-1">
          <button type="button" className={iconBtn} disabled={disabled || index === 0} onClick={() => onMove(-1)}
            title="Move the rule up" aria-label="Move the rule up">↑</button>
          <button type="button" className={iconBtn} disabled={disabled || index === count - 1} onClick={() => onMove(1)}
            title="Move the rule down" aria-label="Move the rule down">↓</button>
          <button type="button" className="px-1.5 text-red-600 hover:text-red-800 disabled:text-gray-300" disabled={disabled}
            onClick={onRemove} title="Remove the rule" aria-label="Remove the rule" data-testid="rule-remove">✕</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">{SIGNAL_TYPE_HINT[rule.signalType]}</p>

      <div className="mt-2 flex flex-col gap-2">
        {rule.conditions.map((c, i) => (
          <CompareConditionRow
            key={c.id != null ? `c${c.id}` : `n${i}`}
            condition={c.condition}
            evalTf={evalTf}
            onChange={(x) => setCondition(i, x)}
            index={i}
            count={rule.conditions.length}
            disabled={disabled}
            errors={errors?.conditions?.[i] || []}
            onRemove={() => removeCondition(i)}
            onMove={(d) => moveCondition(i, d)}
          />
        ))}
        {rule.conditions.length === 0 && <p className="text-sm text-gray-500">No conditions yet.</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled || rule.conditions.length >= maxConditions}
          onClick={() => set({ conditions: [...rule.conditions, newRuleCondition()] })}
          className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400" data-testid="rule-add-condition">
          + Comparison
        </button>
        <span className="text-xs text-gray-500">Conditions are AND-ed. For OR add another rule with the same signal type.</span>
      </div>
      <div className="mt-2 text-xs font-mono text-gray-700" data-testid="rule-caption">{ruleCaption(rule, evalTf)}</div>
      {stats && (
        <div className="mt-1 text-xs text-gray-600" data-testid="rule-inline-stats">
          Last preview: fired {stats.fired} of {stats.bars} bars
          {stats.bars > 0 && ` (${((stats.fired / stats.bars) * 100).toFixed(1)} %)`}
          {stats.stateRule && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800">state rule</span>}
        </div>
      )}
      {errors?.general?.length > 0 && (
        <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
          {errors.general.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
