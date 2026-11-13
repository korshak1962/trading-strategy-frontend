// src/components/strategyConstructor/BrickOperandEditor.jsx
//
// One side of a comparison in a constructed strategy (constructor stage 4b, architect
// architect_constructor_stage4b.md §3, §8): a plain operand (the screener's OperandPicker, passed in
// as `picker`), a Levels value (`LEVEL`: output + Levels params) or a sequence brick -
//   AT_LAST(X, A)          X on the bar the anchor event A last passed,
//   MAX_SINCE(X, A, lag)   highest X after A, up to lag bars ago (MIN_SINCE: lowest),
//   BARS_SINCE(A)          bars since A last passed (unit BARS).
// X: a bar field / indicator (no constant) or a Levels value; A: one market condition (a Levels
// event, a comparison without bricks, a channel condition) - AnchorConditionEditor, also WITHIN's
// event. Inside a brick's anchor and WITHIN's event there are no bricks (`allowBricks` false), and a
// nested comparison carries no links. Links: `P.levels.*`, `P.x.levels.*`, `P.x.n`, `P.a.levels.*`.
import { CompareConditionRow } from '../universeScreener/ConditionRows';
import OperandPicker from '../universeScreener/OperandPicker';
import {
  DEFAULT_LEVELS_META, DEFAULT_BRICKS_META, LEVEL_KIND, ANCHORED_KINDS, isStagedOperand, isBrickOperand, isLevelEvent,
} from '../../api/constructedApi';
import { levelOutputUnit, unitLabel, UNIT_HINT, operandUnitOf } from '../../api/indicatorCatalog';
import {
  newLevelCondition, newLevelOperand, newPlainOperand, newBrickOperand, newChannelCondition,
} from './constructedFormat';
import { LevelEventFields } from './LevelConditionRow';
import ChannelConditionRow from './ChannelConditionRow';
import LevelsSpecEditor from './LevelsSpecEditor';

const sel = 'p-1 border rounded text-sm bg-white';
const BRICK_LABEL = Object.freeze({ AT_LAST: 'AT_LAST', MAX_SINCE: 'MAX_SINCE', MIN_SINCE: 'MIN_SINCE', BARS_SINCE: 'BARS_SINCE' });
const pathId = (p) => p.replace(/\.$/, '').replace(/\./g, '-');

/**
 * A Levels value operand: output (unit; one that clashes with the other side's unit is disabled),
 * offset and the Levels params.
 */
export function LevelOperandFields({ operand, onChange, prefix, linkable, ctx, otherUnit = null }) {
  const lm = ctx.levelsMeta || DEFAULT_LEVELS_META;
  const out = lm.outputs.find((o) => o.name === operand.output);
  const unit = levelOutputUnit(operand.output) || out?.unit || null;
  const tid = `level-op-${pathId(prefix)}`;
  return (
    <>
      <span className="text-xs font-semibold text-amber-700" title="Levels value on the bar (run TF)">Level</span>
      <select className={sel} value={operand.output || ''} disabled={ctx.disabled} aria-label="Levels output"
        title={out?.hint} data-testid={`${tid}-output`}
        onChange={(e) => onChange({ ...operand, output: e.target.value })}>
        {lm.outputs.map((o) => {
          const u = levelOutputUnit(o.name) || o.unit;
          const clash = otherUnit && u && u !== otherUnit && o.name !== operand.output;
          return (
            <option key={o.name} value={o.name} disabled={!!clash}
              title={clash ? `${o.name} is a ${unitLabel(u)} value; the other side is a ${unitLabel(otherUnit)} value` : o.hint}>
              {o.name}
            </option>
          );
        })}
        {!out && operand.output && <option value={operand.output}>{operand.output}</option>}
      </select>
      <label className="inline-flex items-center gap-1 text-xs text-gray-600" title="Bars back on the run TF: 0 = the basis bar">
        [
        <input type="number" className="p-1 border rounded text-sm w-14" min={-100} max={0} step={1}
          value={operand.offset ?? 0} disabled={ctx.disabled} aria-label="Levels offset"
          onChange={(e) => onChange({ ...operand, offset: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
        ]
      </label>
      {unit && <span className="text-[11px] text-gray-500" title={`Unit: ${UNIT_HINT[unit] || unitLabel(unit)}`}>{unitLabel(unit)}</span>}
      <LevelsSpecEditor
        spec={operand.levels}
        onChange={(levels) => onChange({ ...operand, levels })}
        prefix={prefix}
        levelsMeta={lm}
        renderLink={linkable ? ctx.renderLink : null}
        linkedValue={linkable ? ctx.linkedValue : null}
        onApplyToAll={ctx.onApplyLevels ? () => ctx.onApplyLevels(prefix) : null}
        disabled={ctx.disabled}
      />
    </>
  );
}

const ANCHOR_TYPES = Object.freeze([
  { value: 'LEVEL_EVENT', label: 'Levels event' },
  { value: 'COMPARE', label: 'Comparison' },
  { value: 'CHANNEL_METRIC', label: 'Channel' },
]);

/**
 * The anchor event A of a brick or WITHIN: one market condition - a Levels event, a comparison
 * (Levels values allowed, no bricks, no links) or a channel condition.
 * @param {Object} props
 * @param {Object} props.condition the anchor condition
 * @param {(c: Object) => void} props.onChange
 * @param {string} props.prefix its path prefix (`of.`, `right.a.`)
 * @param {boolean} props.linkable a Levels event here can carry links on its fields
 * @param {boolean} props.strengthLinkable its strength can carry a link (WITHIN's `of.strength`)
 * @param {Object} props.ctx editor context (meta, links, evalTf, allRules, levelsSpec, disabled)
 */
export function AnchorConditionEditor({ condition, onChange, prefix, linkable = true, strengthLinkable = false, ctx }) {
  const type = condition?.type || 'LEVEL_EVENT';
  const changeType = (t) => {
    if (t === type) return;
    if (t === 'LEVEL_EVENT') onChange(newLevelCondition(ctx.levelsSpec));
    else if (t === 'COMPARE') {
      onChange({
        type: 'COMPARE', left: newPlainOperand(), op: 'GT',
        right: { kind: 'SMA', n: 50, tf: 'RUN', offset: 0, value: '' }, tolerancePct: 0,
      });
    } else onChange(newChannelCondition(ctx.allRules || [], ctx.channelMeta?.defaults));
  };
  const nestedCtx = { ...ctx, renderLink: null, linkedValue: null };
  return (
    <span className="inline-flex flex-wrap items-center gap-2 border-l-2 border-amber-300 pl-2"
      data-testid={`anchor-${pathId(prefix)}`}>
      <select className={sel} value={type} disabled={ctx.disabled} onChange={(e) => changeType(e.target.value)}
        aria-label="anchor event type" title="The anchor event: one market condition (no bricks inside)"
        data-testid={`anchor-${pathId(prefix)}-type`}>
        {ANCHOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {isLevelEvent(condition) && (
        <LevelEventFields condition={condition} onChange={onChange} prefix={prefix} linkable={linkable}
          strengthLinkable={strengthLinkable} ctx={ctx} />
      )}
      {condition?.type === 'COMPARE' && (
        <CompareConditionRow bare condition={condition} onChange={onChange} evalTf={ctx.evalTf} allowRun runTf={ctx.evalTf}
          caption="" disabled={ctx.disabled}
          renderOperand={(args) => (
            <BrickOperandEditor {...args} prefix={`${prefix}${args.side}.`} allowBricks={false} linkable={false} ctx={nestedCtx} />
          )} />
      )}
      {condition?.type === 'CHANNEL_METRIC' && (
        <ChannelConditionRow bare condition={condition} onChange={onChange} channelMeta={ctx.channelMeta} caption="" disabled={ctx.disabled} />
      )}
    </span>
  );
}

/**
 * The X of AT_LAST / MAX_SINCE / MIN_SINCE: a plain operand (no constant) or a Levels value.
 */
function BrickXEditor({ x, onChange, prefix, linkable, ctx }) {
  const isLevel = x?.kind === LEVEL_KIND;
  const linkSlot = linkable && ctx.renderLink ? (field) => ctx.renderLink(`${prefix}${field}`) : null;
  const linkedValue = linkable && ctx.linkedValue ? (field) => ctx.linkedValue(`${prefix}${field}`) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={`brick-x-${pathId(prefix)}`}>
      <select className={sel} value={isLevel ? 'LEVEL' : 'VALUE'} disabled={ctx.disabled} aria-label="brick X form"
        data-testid={`brick-x-${pathId(prefix)}-form`}
        onChange={(e) => onChange(e.target.value === 'LEVEL' ? newLevelOperand(ctx.levelsSpec, 'SUPPORT_LINE') : newPlainOperand())}>
        <option value="VALUE">field / indicator</option>
        <option value="LEVEL">Levels value</option>
      </select>
      {isLevel ? (
        <LevelOperandFields operand={x} onChange={onChange} prefix={prefix} linkable={linkable} ctx={ctx} />
      ) : (
        <OperandPicker side="left" value={x || newPlainOperand()} onChange={onChange} evalTf={ctx.evalTf} disabled={ctx.disabled}
          allowRun runTf={ctx.evalTf} linkSlot={linkSlot} linkedValue={linkedValue} testId={`brick-x-${pathId(prefix)}-op`} />
      )}
    </span>
  );
}

/**
 * @param {Object} props
 * @param {'left'|'right'} props.side
 * @param {Object} props.value the operand
 * @param {(o: Object) => void} props.onChange
 * @param {JSX.Element} props.picker the default OperandPicker of this side
 * @param {string|null} props.otherUnit the left side's unit (right side only)
 * @param {string} props.prefix path prefix of the side (`left.`, `right.`, `of.left.`)
 * @param {boolean} props.allowBricks offer the bricks (false inside an anchor / WITHIN)
 * @param {boolean} props.linkable Levels / X lengths of this side can carry links
 * @param {Object} props.ctx editor context
 */
export default function BrickOperandEditor({
  side, value, onChange, picker, otherUnit = null, prefix, allowBricks = true, linkable = true, ctx,
}) {
  const bm = ctx.bricksMeta || DEFAULT_BRICKS_META;
  const form = isStagedOperand(value) ? value.kind : 'VALUE';
  const brickKinds = bm.kinds.filter((k) => k.form === 'OPERAND');
  const kindMeta = bm.kinds.find((k) => k.name === form) || null;
  const changeForm = (f) => {
    if (f === form) return;
    if (f === 'VALUE') onChange(newPlainOperand());
    else if (f === LEVEL_KIND) onChange(newLevelOperand(ctx.levelsSpec, otherUnit === 'ATR_MULTIPLE' ? 'DIST_SUPPORT_ATR' : 'SUPPORT_LINE'));
    else onChange(newBrickOperand(f, ctx.levelsSpec, isBrickOperand(value) ? value : null));
  };
  const unit = operandUnitOf(value);
  const tid = `side-${pathId(prefix)}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={tid}>
      <select className={`${sel} text-xs`} value={form} disabled={ctx.disabled} onChange={(e) => changeForm(e.target.value)}
        aria-label={`${side} side form`} data-testid={`${tid}-form`}
        title="A plain operand, a Levels value or a sequence brick (the latter two run on DAY / WEEK)">
        <option value="VALUE">value</option>
        <option value={LEVEL_KIND}>Levels value</option>
        {allowBricks && brickKinds.map((k) => <option key={k.name} value={k.name} title={k.hint}>{BRICK_LABEL[k.name] || k.name}</option>)}
        {!allowBricks && isBrickOperand(value) && <option value={value.kind}>{value.kind} (not allowed here)</option>}
      </select>
      {form === 'VALUE' && picker}
      {form === LEVEL_KIND && (
        <LevelOperandFields operand={value} onChange={onChange} prefix={prefix} linkable={linkable} ctx={ctx} otherUnit={otherUnit} />
      )}
      {isBrickOperand(value) && (
        <span className="inline-flex flex-wrap items-center gap-1 border border-amber-300 rounded px-1.5 py-1 bg-amber-50/40"
          title={`${kindMeta?.hint || ''}. ${bm.hint}`} data-testid={`${tid}-brick`}>
          <span className="font-mono text-xs font-semibold">{value.kind}(</span>
          {ANCHORED_KINDS.includes(value.kind) && (
            <>
              <span className="text-xs text-gray-600">X</span>
              <BrickXEditor x={value.x} onChange={(x) => onChange({ ...value, x })} prefix={`${prefix}x.`} linkable={linkable} ctx={ctx} />
              <span className="text-xs text-gray-600">,</span>
            </>
          )}
          <span className="text-xs text-gray-600">{value.kind === 'AT_LAST' ? 'at the last' : 'since the last'}</span>
          <AnchorConditionEditor condition={value.a} onChange={(a) => onChange({ ...value, a })} prefix={`${prefix}a.`}
            linkable={linkable && isLevelEvent(value.a)} strengthLinkable={false} ctx={ctx} />
          {kindMeta?.hasLag && (
            <label className="inline-flex items-center gap-1 text-xs text-gray-600"
              title={`Window (anchor, t − lag]: lag 1 = the line as of the previous bar (0..${bm.lagMax})`}>
              , lag
              <input type="number" min={0} max={bm.lagMax} step={1} className="p-1 border rounded text-sm w-14"
                value={value.lag ?? 0} disabled={ctx.disabled} aria-label="brick lag" data-testid={`${tid}-lag`}
                onChange={(e) => onChange({ ...value, lag: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
            </label>
          )}
          <span className="font-mono text-xs font-semibold">)</span>
          {unit && <span className="text-[11px] text-gray-500" title={`Unit: ${UNIT_HINT[unit] || unitLabel(unit)}`}>{unitLabel(unit)}</span>}
          <span className="basis-full text-[11px] text-amber-800" data-testid={`${tid}-hint`}>
            {kindMeta?.hint}{kindMeta?.hint ? '. ' : ''}{bm.hint}
          </span>
        </span>
      )}
    </span>
  );
}
