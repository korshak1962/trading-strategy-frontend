// src/components/strategyConstructor/PositionOperandEditor.jsx
//
// A position operand on one side of a rule's comparison (constructor stage 4c-1, screener
// architect.md §2.1 / §4): the trade's entry, LONG only -
//   AT_ENTRY(X)                 X on the entry bar of the open long (seeded: the seed bar),
//   MAX_SINCE_ENTRY(X, lag)     the highest X over (entry, t − lag] (MIN_SINCE_ENTRY: the lowest).
// X is a market operand of the run TF, edited with the side editor itself (BrickOperandEditor without
// the position group): a bar field / indicator, a Levels value (OPEN_STOP / OPEN_LINE read here) or a
// brick. Links inside X use the paths `P.x.n`, `P.x.levels.*` (a brick X: `P.x.x.n`, `P.x.a.levels.*`);
// `lag` is never an axis. In FLAT / SHORT the condition FAILs (NOT_LONG).
// Editor UX Stage A: a nested block "Highest since entry ⓘ — LONG only" with the "Value X" section
// and "Skip last bars"; the purple frame stays.
// R5 v2 F1 (screener architect_r5_migration_v2.md §6): STICKY_SINCE_ENTRY(levels), form LEVELS - the
// Levels sticky-support exit line of the open long. No X and no lag: the block shows its own Levels
// settings (the shared LevelsSpecEditor, links `P.levels.<field>`) instead of "Value X".
import OperandPicker from '../universeScreener/OperandPicker';
import FieldLabel from '../common/FieldLabel';
import InfoTooltip from '../common/InfoTooltip';
import {
  DEFAULT_LEVELS_META, DEFAULT_POSITION_META, POSITION_WINDOW_KINDS, isPositionLevelsOperand,
} from '../../api/constructedApi';
import { unitLabel, unitHintOf, operandUnitOf } from '../../api/indicatorCatalog';
import { POSITION_HELP } from '../../api/editorTexts';
import { newPlainOperand } from './constructedFormat';
import LevelsSpecEditor from './LevelsSpecEditor';

const pathId = (p) => p.replace(/\.$/, '').replace(/\./g, '-');

/**
 * @param {Object} props
 * @param {Object} props.value the position operand `{kind, x, lag}` (STICKY_SINCE_ENTRY: `{kind, levels}`)
 * @param {(o: Object) => void} props.onChange
 * @param {string} props.prefix path prefix of the side (`left.`, `right.`)
 * @param {boolean} props.linkable thresholds inside X can carry links
 * @param {Object} props.ctx editor context (positionMeta, evalTf, renderLink, linkedValue, disabled, …)
 * @param {Function} props.sideEditor the side editor X is edited with (BrickOperandEditor; passed in to avoid a cycle)
 */
export default function PositionOperandEditor({ value, onChange, prefix, linkable, ctx, sideEditor }) {
  const SideEditor = sideEditor;
  const pm = ctx.positionMeta || DEFAULT_POSITION_META;
  const help = pm.help || POSITION_HELP;
  const kindMeta = pm.kinds.find((k) => k.name === value.kind) || null;
  const isWindow = POSITION_WINDOW_KINDS.includes(value.kind);
  const isLevelsForm = isPositionLevelsOperand(value);
  const xPrefix = `${prefix}x.`;
  const tid = `side-${pathId(prefix)}`;
  const x = value.x || newPlainOperand();
  const unit = operandUnitOf(value);
  // X's plain form: the screener's operand picker (no constant), its length linkable as `P.x.n`
  const xPicker = (
    <OperandPicker side="left" value={x} onChange={(nx) => onChange({ ...value, x: nx })} evalTf={ctx.evalTf}
      disabled={ctx.disabled} allowRun runTf={ctx.evalTf}
      linkSlot={linkable && ctx.renderLink ? (field) => ctx.renderLink(`${xPrefix}${field}`) : null}
      linkedValue={linkable && ctx.linkedValue ? (field) => ctx.linkedValue(`${xPrefix}${field}`) : null}
      testId={`position-x-${pathId(prefix)}-op`} />
  );
  return (
    <div className="basis-full flex flex-col gap-1.5 border rounded px-2 py-1.5 bg-purple-50"
      style={{ borderColor: 'var(--c-purple-200)' }} data-testid={`${tid}-position`}>
      <span className="text-xs font-semibold text-purple-800">
        {kindMeta?.label || value.kind}
        <InfoTooltip text={`${kindMeta?.tooltip || ''} ${help.group || ''}`.trim()} code={value.kind} editor align="left"
          testId={`info-${tid}-position`} />
        <span className="ml-2 font-normal text-purple-700">— {pm.side || 'LONG'} only</span>
        {unit && <span className="ml-2 text-[11px] font-normal text-gray-500" title={`Unit: ${unitHintOf(value)}`}>{unitLabel(unit)}</span>}
      </span>
      {isLevelsForm && (
        <div className="flex flex-col gap-0.5" data-testid={`position-levels-${pathId(prefix)}`}>
          <span className="text-xs font-semibold text-gray-600 border-b border-gray-200">
            Levels settings
            <InfoTooltip text={help.levels || kindMeta?.hint || ''} editor align="left" testId={`info-${tid}-position-levels`} />
          </span>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
            <LevelsSpecEditor
              spec={value.levels}
              onChange={(levels) => onChange({ ...value, levels })}
              prefix={prefix}
              levelsMeta={ctx.levelsMeta || DEFAULT_LEVELS_META}
              renderLink={linkable ? ctx.renderLink : null}
              linkedValue={linkable ? ctx.linkedValue : null}
              linkInfo={linkable ? ctx.linkInfo : null}
              onApplyToAll={ctx.onApplyLevels ? () => ctx.onApplyLevels(prefix) : null}
              disabled={ctx.disabled}
              sameAsPrevious={ctx.levelsSameAsPrevious ? ctx.levelsSameAsPrevious(prefix) : false}
              setLabel={ctx.levelsSetLabel ? ctx.levelsSetLabel(prefix) : null}
              errorOpen={ctx.levelsErrorOpen ? ctx.levelsErrorOpen(prefix) : false}
            />
          </div>
        </div>
      )}
      {!isLevelsForm && (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-gray-600 border-b border-gray-200">
          Value X
          <InfoTooltip text={help.x} editor align="left" />
        </span>
        <div className="flex flex-col items-start gap-1">
          <span className="inline-flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={`position-x-${pathId(prefix)}`}>
            <SideEditor side="left" value={x} onChange={(nx) => onChange({ ...value, x: nx })} picker={xPicker}
              prefix={xPrefix} allowBricks allowPosition={false} linkable={linkable} ctx={ctx} />
          </span>
          {isWindow && (
            <FieldLabel label="Skip last bars" tooltip={help.lag} testId={`info-${tid}-position-lag`}>
              <input type="number" min={0} max={pm.lagMax} step={1} className="p-1 border rounded text-sm w-14"
                value={value.lag ?? 0} disabled={ctx.disabled} aria-label="position window lag" data-testid={`${tid}-position-lag`}
                onChange={(e) => onChange({ ...value, lag: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
            </FieldLabel>
          )}
        </div>
      </div>
      )}
      <span className="text-[11px] text-purple-800" data-testid={`${tid}-position-hint`}>{help.noLong}</span>
    </div>
  );
}
