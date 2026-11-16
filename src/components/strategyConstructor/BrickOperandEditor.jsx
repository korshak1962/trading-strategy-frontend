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
// Stage 4c-1: on a side of a rule's comparison (`allowPosition`) also the position operands
// AT_ENTRY / MAX_SINCE_ENTRY / MIN_SINCE_ENTRY (LONG only, PositionOperandEditor); never inside a
// brick's X / anchor, WITHIN's event or a position operand's X.
//
// Editor UX Stage A (screener logs/agents/architect.md §3.2, §4): ONE Source menu per side (the
// former side "form" select and the operand kind select merged; operandSource.js maps it onto the
// unchanged operand JSON). A function renders as a nested block with headings: "Value X" (Source ·
// Run TF · Output / Field / Length · Bars back) and "Event" (Event type · Event [· Skip last bars]).
import { cloneElement } from 'react';
import { CompareConditionRow } from '../universeScreener/ConditionRows';
import OperandPicker from '../universeScreener/OperandPicker';
import SourcePicker, { RunTfOnly } from '../universeScreener/SourcePicker';
import FieldLabel from '../common/FieldLabel';
import InfoTooltip from '../common/InfoTooltip';
import {
  DEFAULT_LEVELS_META, DEFAULT_BRICKS_META, DEFAULT_POSITION_META, LEVEL_KIND, ANCHORED_KINDS, isStagedOperand, isBrickOperand,
  isLevelEvent, isPositionOperand,
} from '../../api/constructedApi';
import { levelOutputUnit, unitLabel, UNIT_HINT, operandUnitOf } from '../../api/indicatorCatalog';
import { BRICKS_HELP, LEVELS_HELP, firstSentence, positionRefusedText, useEditorHelp } from '../../api/editorTexts';
import {
  newLevelCondition, newPlainOperand, newChannelCondition,
} from './constructedFormat';
import PositionOperandEditor from './PositionOperandEditor';
import { LevelEventFields } from './LevelConditionRow';
import ChannelConditionRow from './ChannelConditionRow';
import LevelsSpecEditor from './LevelsSpecEditor';

const sel = 'p-1 border rounded text-sm bg-white';
const pathId = (p) => p.replace(/\.$/, '').replace(/\./g, '-');

/** A titled sub-section of a nested block ("Value X", "Event"). */
export function BlockSection({ title, tooltip, children, testId }) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <span className="text-xs font-semibold text-gray-600 border-b border-gray-200">
        {title}
        <InfoTooltip text={tooltip} editor align="left" />
      </span>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

/**
 * A Levels value operand: output (unit; one that clashes with the other side's unit is disabled),
 * offset and the Levels params.
 */
export function LevelOperandFields({ operand, onChange, prefix, linkable, ctx, otherUnit = null }) {
  const lm = ctx.levelsMeta || DEFAULT_LEVELS_META;
  const help = lm.help || LEVELS_HELP;
  const out = lm.outputs.find((o) => o.name === operand.output);
  const unit = levelOutputUnit(operand.output) || out?.unit || null;
  const tid = `level-op-${pathId(prefix)}`;
  return (
    <>
      <FieldLabel label="Output" tooltip={out?.tooltip ? `${out.tooltip}` : help.output} code={operand.output || null}
        testId={`info-${tid}-output`}>
        <select className={sel} value={operand.output || ''} disabled={ctx.disabled} aria-label="Levels output"
          title={out?.tooltip || out?.hint} data-testid={`${tid}-output`}
          onChange={(e) => onChange({ ...operand, output: e.target.value })}>
          {lm.outputs.map((o) => {
            const u = levelOutputUnit(o.name) || o.unit;
            const clash = otherUnit && u && u !== otherUnit && o.name !== operand.output;
            return (
              <option key={o.name} value={o.name} disabled={!!clash}
                title={clash ? `${o.label || o.name} is a ${unitLabel(u)} value; the other side is a ${unitLabel(otherUnit)} value` : (o.tooltip || o.hint)}>
                {o.label || o.name}
              </option>
            );
          })}
          {!out && operand.output && <option value={operand.output}>{operand.output} (not in this version)</option>}
        </select>
      </FieldLabel>
      <FieldLabel label="Bars back" tooltip={help.offset}>
        <input type="number" className="p-1 border rounded text-sm w-14" min={-100} max={0} step={1}
          value={operand.offset ?? 0} disabled={ctx.disabled} aria-label="Levels offset"
          onChange={(e) => onChange({ ...operand, offset: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
      </FieldLabel>
      {unit && <span className="text-[11px] text-gray-500 pb-1" title={`Unit: ${UNIT_HINT[unit] || unitLabel(unit)}`}>{unitLabel(unit)}</span>}
      <LevelsSpecEditor
        spec={operand.levels}
        onChange={(levels) => onChange({ ...operand, levels })}
        prefix={prefix}
        levelsMeta={lm}
        renderLink={linkable ? ctx.renderLink : null}
        linkedValue={linkable ? ctx.linkedValue : null}
        linkInfo={linkable ? ctx.linkInfo : null}
        onApplyToAll={ctx.onApplyLevels ? () => ctx.onApplyLevels(prefix) : null}
        disabled={ctx.disabled}
        sameAsPrevious={ctx.levelsSameAsPrevious ? ctx.levelsSameAsPrevious(prefix) : false}
        setLabel={ctx.levelsSetLabel ? ctx.levelsSetLabel(prefix) : null}
        errorOpen={ctx.levelsErrorOpen ? ctx.levelsErrorOpen(prefix) : false}
      />
    </>
  );
}

const ANCHOR_TYPES = Object.freeze(['LEVEL_EVENT', 'COMPARE', 'CHANNEL_METRIC']);

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
 * @param {JSX.Element} [props.extra] controls after the event (a brick's "Skip last bars")
 */
export function AnchorConditionEditor({ condition, onChange, prefix, linkable = true, strengthLinkable = false, ctx, extra = null }) {
  const type = condition?.type || 'LEVEL_EVENT';
  const bh = ctx.bricksMeta?.help || BRICKS_HELP;
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
  const nestedCtx = { ...ctx, renderLink: null, linkedValue: null, linkInfo: null };
  const types = ANCHOR_TYPES.includes(type) ? ANCHOR_TYPES : [...ANCHOR_TYPES, type];
  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={`anchor-${pathId(prefix)}`}>
      <FieldLabel label="Event type" tooltip={bh.anchorType} testId={`info-anchor-${pathId(prefix)}-type`}>
        <select className={sel} value={type} disabled={ctx.disabled} onChange={(e) => changeType(e.target.value)}
          aria-label="anchor event type" title={bh.a}
          data-testid={`anchor-${pathId(prefix)}-type`}>
          {types.map((t) => <option key={t} value={t}>{bh[`anchorType.${t}`] || t}</option>)}
        </select>
      </FieldLabel>
      {isLevelEvent(condition) && (
        <LevelEventFields condition={condition} onChange={onChange} prefix={prefix} linkable={linkable}
          strengthLinkable={strengthLinkable} ctx={ctx} />
      )}
      {condition?.type === 'COMPARE' && (
        <CompareConditionRow bare condition={condition} onChange={onChange} evalTf={ctx.evalTf} allowRun runTf={ctx.evalTf}
          caption="" disabled={ctx.disabled} sourceKinds={(ctx.bricksMeta || DEFAULT_BRICKS_META).kinds}
          renderOperand={(args) => (
            <BrickOperandEditor {...args} prefix={`${prefix}${args.side}.`} allowBricks={false} linkable={false} ctx={nestedCtx} />
          )} />
      )}
      {condition?.type === 'CHANNEL_METRIC' && (
        <ChannelConditionRow bare condition={condition} onChange={onChange} channelMeta={ctx.channelMeta} caption="" disabled={ctx.disabled} />
      )}
      {extra}
    </div>
  );
}

/**
 * The X of AT_LAST / MAX_SINCE / MIN_SINCE: a plain operand (no constant) or a Levels value. One
 * Source menu (Market data + Levels); the legacy form select's transitions (operandSource).
 */
function BrickXEditor({ x, onChange, prefix, linkable, ctx }) {
  const isLevel = x?.kind === LEVEL_KIND;
  const linkSlot = linkable && ctx.renderLink ? (field) => ctx.renderLink(`${prefix}${field}`) : null;
  const linkedValue = linkable && ctx.linkedValue ? (field) => ctx.linkedValue(`${prefix}${field}`) : null;
  const sourceCtx = { levels: true, levelsSpec: ctx.levelsSpec };
  const value = x || newPlainOperand();
  return (
    <span className="inline-flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={`brick-x-${pathId(prefix)}`}>
      {isLevel ? (
        <>
          <SourcePicker value={value} onChange={onChange} side="left" runTf={ctx.evalTf} allowRun sourceCtx={sourceCtx}
            disabled={ctx.disabled} testId={`brick-x-${pathId(prefix)}-form`} ariaLabel="brick X form" />
          <RunTfOnly />
          <LevelOperandFields operand={x} onChange={onChange} prefix={prefix} linkable={linkable} ctx={ctx} />
        </>
      ) : (
        <OperandPicker side="left" value={value} onChange={onChange} evalTf={ctx.evalTf} disabled={ctx.disabled}
          allowRun runTf={ctx.evalTf} linkSlot={linkSlot} linkedValue={linkedValue} sourceCtx={sourceCtx}
          testId={`brick-x-${pathId(prefix)}-op`} />
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
 * @param {boolean} [props.allowPosition] offer the position operands (stage 4c-1: a rule condition's side only)
 * @param {boolean} props.linkable Levels / X lengths of this side can carry links
 * @param {Object} props.ctx editor context
 */
export default function BrickOperandEditor({
  side, value, onChange, picker, otherUnit = null, prefix, allowBricks = true, allowPosition = false, linkable = true, ctx,
}) {
  useEditorHelp();
  const bm = ctx.bricksMeta || DEFAULT_BRICKS_META;
  const pm = ctx.positionMeta || DEFAULT_POSITION_META;
  const bh = bm.help || BRICKS_HELP;
  const brickKinds = bm.kinds.filter((k) => k.form === 'OPERAND');
  const kindMeta = bm.kinds.find((k) => k.name === value?.kind) || null;
  const unit = operandUnitOf(value);
  const tid = `side-${pathId(prefix)}`;
  const sourceCtx = {
    levels: true,
    bricks: allowBricks ? brickKinds : null,
    positions: allowPosition ? pm.kinds : null,
    signalType: ctx.signalType ?? null,
    refusedInRules: pm.refusedInRules,
    refusedText: positionRefusedText(),
    levelsSpec: ctx.levelsSpec,
  };

  // a plain operand: the side's OperandPicker with the full Source menu
  if (!isStagedOperand(value)) {
    return <span className="inline-flex flex-wrap items-end gap-1" data-testid={tid}>{cloneElement(picker, { sourceCtx })}</span>;
  }

  const sourcePicker = (
    <SourcePicker value={value} onChange={onChange} side={side} runTf={ctx.evalTf} otherUnit={otherUnit} allowRun
      sourceCtx={sourceCtx} disabled={ctx.disabled} testId={`${tid}-form`} ariaLabel={`${side} side form`} />
  );

  return (
    <span className="inline-flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={tid}>
      {sourcePicker}
      {value.kind === LEVEL_KIND && (
        <>
          <RunTfOnly />
          <LevelOperandFields operand={value} onChange={onChange} prefix={prefix} linkable={linkable} ctx={ctx} otherUnit={otherUnit} />
        </>
      )}
      {isPositionOperand(value) && (
        <PositionOperandEditor value={value} onChange={onChange} prefix={prefix} linkable={linkable} ctx={ctx}
          sideEditor={BrickOperandEditor} />
      )}
      {isBrickOperand(value) && (
        <div className="basis-full flex flex-col gap-1.5 border border-amber-300 rounded px-2 py-1.5 bg-amber-50/40"
          data-testid={`${tid}-brick`}>
          <span className="text-xs font-semibold text-amber-800">
            {kindMeta?.label || value.kind}
            <InfoTooltip text={`${kindMeta?.tooltip || ''} ${bh.group || ''}`.trim()} code={value.kind} editor align="left"
              testId={`info-${tid}-brick`} />
            {unit && <span className="ml-2 text-[11px] font-normal text-gray-500" title={`Unit: ${UNIT_HINT[unit] || unitLabel(unit)}`}>{unitLabel(unit)}</span>}
          </span>
          {ANCHORED_KINDS.includes(value.kind) && (
            <BlockSection title="Value X" tooltip={bh.x} testId={`${tid}-brick-x`}>
              <BrickXEditor x={value.x} onChange={(x) => onChange({ ...value, x })} prefix={`${prefix}x.`} linkable={linkable} ctx={ctx} />
            </BlockSection>
          )}
          <BlockSection title="Event" tooltip={bh.a} testId={`${tid}-brick-a`}>
            <AnchorConditionEditor condition={value.a} onChange={(a) => onChange({ ...value, a })} prefix={`${prefix}a.`}
              linkable={linkable && isLevelEvent(value.a)} strengthLinkable={false} ctx={ctx}
              extra={kindMeta?.hasLag ? (
                <FieldLabel label="Skip last bars" tooltip={`${bh.lag}`} testId={`info-${tid}-lag`}>
                  <input type="number" min={0} max={bm.lagMax} step={1} className="p-1 border rounded text-sm w-14"
                    value={value.lag ?? 0} disabled={ctx.disabled} aria-label="brick lag" data-testid={`${tid}-lag`}
                    onChange={(e) => onChange({ ...value, lag: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
                </FieldLabel>
              ) : null} />
          </BlockSection>
          <span className="text-[11px] text-amber-800" data-testid={`${tid}-hint`}>
            {firstSentence(kindMeta?.tooltip || kindMeta?.hint)}
          </span>
        </div>
      )}
    </span>
  );
}
