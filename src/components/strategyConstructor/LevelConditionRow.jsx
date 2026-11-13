// src/components/strategyConstructor/LevelConditionRow.jsx
//
// A Levels event condition of a constructed strategy's rule (constructor stage 4b, architect
// architect_constructor_stage4b.md §2.2, §8): `LEVEL_EVENT` - the event (meta.levels.events with
// its hint), the strength threshold for SUPPORT_BREAK / RESISTANCE_REACHED (linkable to a CONST
// axis: `R<r>.C<c>.strength`, or `of.strength` as WITHIN's anchor) and the folded LevelsSpecEditor.
// Levels reads the run TF (DAY / WEEK), warms up 60 bars and runs over the bars of the run window.
// `LevelEventFields` is the body without the frame: also WITHIN's / a brick's anchor event.
// Frame and style: ChannelConditionRow (stage 4a).
import { RowShell } from '../universeScreener/ConditionRows';
import { fmtNum } from '../universeScreener/conditionFormat';
import { DEFAULT_LEVELS_META, eventNeedsStrength } from '../../api/constructedApi';
import LevelsSpecEditor from './LevelsSpecEditor';

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-16';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

const finite = (v) => v !== '' && v != null && Number.isFinite(Number(v));

const LEVELS_TITLE = 'Levels: the pivot level-zone tracker of LevelBreakoutRetest as a causal per-bar series on the run TF '
  + '(DAY / WEEK), warm-up 60 bars, over the bars of the run window';

/**
 * The controls of a Levels event: event, strength (when the event takes one), Levels params.
 * @param {Object} props
 * @param {Object} props.condition `{type: 'LEVEL_EVENT', tf, event, strength, levels}`
 * @param {(c: Object) => void} props.onChange
 * @param {string} props.prefix path prefix of the event (`''`, `of.`, `right.a.`)
 * @param {boolean} props.linkable its Levels fields can carry links
 * @param {boolean} props.strengthLinkable its strength can carry a link (`strength` / `of.strength` only)
 * @param {Object} props.ctx {levelsMeta, renderLink, linkedValue, onApplyLevels, disabled}
 */
export function LevelEventFields({ condition, onChange, prefix = '', linkable = true, strengthLinkable = true, ctx }) {
  const lm = ctx.levelsMeta || DEFAULT_LEVELS_META;
  const ev = lm.events.find((e) => e.name === condition.event);
  const needs = ev ? ev.needsStrength : eventNeedsStrength(condition.event);
  const events = ev || !condition.event ? lm.events : [...lm.events, { name: condition.event, hint: '', needsStrength: needs }];
  const changeEvent = (event) => {
    const n = lm.events.find((e) => e.name === event)?.needsStrength ?? eventNeedsStrength(event);
    onChange({ ...condition, event, strength: n ? (finite(condition.strength) ? condition.strength : 4) : '' });
  };
  const strengthPath = `${prefix}strength`;
  const strengthLinked = strengthLinkable && ctx.linkedValue ? ctx.linkedValue(strengthPath) : null;
  const tid = prefix ? `level-${prefix.replace(/\./g, '-')}` : 'level';

  return (
    <>
      <span className="text-xs font-semibold text-amber-700" title={LEVELS_TITLE}>Level</span>
      <select className={sel} value={condition.event || ''} disabled={ctx.disabled} onChange={(e) => changeEvent(e.target.value)}
        aria-label="Levels event" title={ev?.hint} data-testid={`${tid}-event`}>
        {events.map((e) => <option key={e.name} value={e.name} title={e.hint}>{e.name}</option>)}
      </select>
      {needs && (
        <label className="inline-flex items-center gap-1 text-xs text-gray-600"
          title={`Nearest zone of at least this strength, (0, ${fmtNum(lm.strengthMax)}]`}>
          strength ≥
          {strengthLinked != null ? (
            <span className={linkedBox} title="Linked: the strength comes from the axes" data-testid={`linked-${strengthPath}`}>{fmtNum(strengthLinked)}</span>
          ) : (
            <input type="number" step="any" className={num} value={condition.strength ?? ''} disabled={ctx.disabled}
              onChange={(e) => onChange({ ...condition, strength: e.target.value })} aria-label="event strength"
              data-testid={`${tid}-strength`} />
          )}
          {strengthLinkable && ctx.renderLink?.(strengthPath)}
        </label>
      )}
      {ev?.hint && <span className="text-xs text-gray-500">{ev.hint}</span>}
      <LevelsSpecEditor
        spec={condition.levels}
        onChange={(levels) => onChange({ ...condition, levels })}
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

/**
 * @param {Object} props
 * @param {Object} props.condition the LEVEL_EVENT condition
 * @param {(c: Object) => void} props.onChange
 * @param {Object} props.ctx see LevelEventFields
 * @param {string} props.caption the condition's caption with link notes
 * shell: index, count, disabled, errors, onRemove, onMove (RowShell)
 */
export default function LevelConditionRow({ condition, onChange, ctx, caption, ...shell }) {
  return (
    <RowShell {...shell} caption={caption} testId="level-condition">
      <LevelEventFields condition={condition} onChange={onChange} prefix="" linkable strengthLinkable ctx={ctx} />
    </RowShell>
  );
}
