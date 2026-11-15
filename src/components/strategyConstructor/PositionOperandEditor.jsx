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
import OperandPicker from '../universeScreener/OperandPicker';
import { DEFAULT_POSITION_META, POSITION_WINDOW_KINDS } from '../../api/constructedApi';
import { unitLabel, UNIT_HINT, operandUnitOf } from '../../api/indicatorCatalog';
import { newPlainOperand } from './constructedFormat';

const pathId = (p) => p.replace(/\.$/, '').replace(/\./g, '-');

/**
 * @param {Object} props
 * @param {Object} props.value the position operand `{kind, x, lag}`
 * @param {(o: Object) => void} props.onChange
 * @param {string} props.prefix path prefix of the side (`left.`, `right.`)
 * @param {boolean} props.linkable thresholds inside X can carry links
 * @param {Object} props.ctx editor context (positionMeta, evalTf, renderLink, linkedValue, disabled, …)
 * @param {Function} props.sideEditor the side editor X is edited with (BrickOperandEditor; passed in to avoid a cycle)
 */
export default function PositionOperandEditor({ value, onChange, prefix, linkable, ctx, sideEditor }) {
  const SideEditor = sideEditor;
  const pm = ctx.positionMeta || DEFAULT_POSITION_META;
  const kindMeta = pm.kinds.find((k) => k.name === value.kind) || null;
  const isWindow = POSITION_WINDOW_KINDS.includes(value.kind);
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
    <span className="inline-flex flex-wrap items-center gap-1 border rounded px-1.5 py-1 bg-purple-50"
      style={{ borderColor: 'var(--c-purple-200)' }}
      title={`${kindMeta?.hint || ''}. ${pm.hint}`} data-testid={`${tid}-position`}>
      <span className="font-mono text-xs font-semibold text-purple-800">{value.kind}(</span>
      <span className="text-xs text-gray-600">X</span>
      <span className="inline-flex flex-wrap items-center gap-1" data-testid={`position-x-${pathId(prefix)}`}>
        <SideEditor side="left" value={x} onChange={(nx) => onChange({ ...value, x: nx })} picker={xPicker}
          prefix={xPrefix} allowBricks allowPosition={false} linkable={linkable} ctx={ctx} />
      </span>
      {isWindow && (
        <label className="inline-flex items-center gap-1 text-xs text-gray-600"
          title={`Window (entry, t − lag]: lag 1 = the line as of the previous bar, the class ratchet (0..${pm.lagMax}). Not an axis.`}>
          , lag
          <input type="number" min={0} max={pm.lagMax} step={1} className="p-1 border rounded text-sm w-14"
            value={value.lag ?? 0} disabled={ctx.disabled} aria-label="position window lag" data-testid={`${tid}-position-lag`}
            onChange={(e) => onChange({ ...value, lag: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
        </label>
      )}
      <span className="font-mono text-xs font-semibold text-purple-800">)</span>
      {unit && <span className="text-[11px] text-gray-500" title={`Unit: ${UNIT_HINT[unit] || unitLabel(unit)}`}>{unitLabel(unit)}</span>}
      <span className="basis-full text-[11px] text-purple-800" data-testid={`${tid}-position-hint`}>
        {pm.side || 'LONG'} only: in FLAT / SHORT the condition fails (NOT_LONG).{' '}
        {value.kind === 'AT_ENTRY'
          ? '% stop: close < AT_ENTRY(close) with tolerance −5; “in position”: AT_ENTRY(close) > 0. A seeded watch reads the seed bar’s close, not your price.'
          : 'Trailing: close < MAX_SINCE_ENTRY(X, lag 1) (the entry bar is not in the window).'}
      </span>
    </span>
  );
}
