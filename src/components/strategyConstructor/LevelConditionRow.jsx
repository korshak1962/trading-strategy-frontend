// src/components/strategyConstructor/LevelConditionRow.jsx
//
// A Levels event condition of a constructed strategy's rule (constructor stage 4b, architect
// architect_constructor_stage4b.md §2.2, §8): `LEVEL_EVENT` - the event (meta.levels.events with
// its hint), the strength threshold for SUPPORT_BREAK / RESISTANCE_REACHED (linkable to a CONST
// axis: `R<r>.C<c>.strength`, or `of.strength` as WITHIN's anchor) and the folded LevelsSpecEditor.
// Levels reads the run TF (DAY / WEEK), warms up 60 bars and runs over the bars of the run window.
// `LevelEventFields` is the body without the frame: also WITHIN's / a brick's anchor event.
// Frame and style: ChannelConditionRow (stage 4a).
// Editor UX Stage A: heading "LEVEL EVENT", the Event menu in plain English (meta `label`; events with
// `inMenu: false` - BROKEN_DOWN - only while selected, "(retired)"), "Min strength", headings with ⓘ.
import { RowShell } from '../universeScreener/ConditionRows';
import { fmtNum } from '../universeScreener/conditionFormat';
import FieldLabel from '../common/FieldLabel';
import { DEFAULT_LEVELS_META, eventNeedsStrength } from '../../api/constructedApi';
import { LEVELS_HELP, RULE_TEXTS, firstSentence } from '../../api/editorTexts';
import LevelsSpecEditor from './LevelsSpecEditor';
import { eventMenuOf } from './operandSource';

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-16';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

const finite = (v) => v !== '' && v != null && Number.isFinite(Number(v));

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
  const help = lm.help || LEVELS_HELP;
  const ev = lm.events.find((e) => e.name === condition.event);
  const needs = ev ? ev.needsStrength : eventNeedsStrength(condition.event);
  const events = eventMenuOf(lm.events, condition.event);
  const changeEvent = (event) => {
    const n = lm.events.find((e) => e.name === event)?.needsStrength ?? eventNeedsStrength(event);
    onChange({ ...condition, event, strength: n ? (finite(condition.strength) ? condition.strength : 4) : '' });
  };
  const strengthPath = `${prefix}strength`;
  const strengthLinked = strengthLinkable && ctx.linkedValue ? ctx.linkedValue(strengthPath) : null;
  const tid = prefix ? `level-${prefix.replace(/\./g, '-')}` : 'level';

  return (
    <>
      <FieldLabel label="Event" tooltip={ev?.tooltip || help.event} code={condition.event || null} testId={`info-${tid}-event`}>
        <select className={sel} value={condition.event || ''} disabled={ctx.disabled} onChange={(e) => changeEvent(e.target.value)}
          aria-label="Levels event" title={ev?.tooltip} data-testid={`${tid}-event`}>
          {events.map((e) => <option key={e.name} value={e.name} title={e.tooltip}>{e.label || e.name}</option>)}
        </select>
      </FieldLabel>
      {needs && (
        <FieldLabel label="Min strength" tooltip={`${help.strength} (0, ${fmtNum(lm.strengthMax)}]`} testId={`info-${tid}-strength`}>
          <span className="inline-flex items-center gap-1">
            {strengthLinked != null ? (
              <span className={linkedBox} title="Linked: the strength comes from the axes" data-testid={`linked-${strengthPath}`}>{fmtNum(strengthLinked)}</span>
            ) : (
              <input type="number" step="any" className={num} value={condition.strength ?? ''} disabled={ctx.disabled}
                onChange={(e) => onChange({ ...condition, strength: e.target.value })} aria-label="event strength"
                data-testid={`${tid}-strength`} />
            )}
            {strengthLinkable && ctx.renderLink?.(strengthPath)}
          </span>
        </FieldLabel>
      )}
      <LevelsSpecEditor
        spec={condition.levels}
        onChange={(levels) => onChange({ ...condition, levels })}
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

/**
 * @param {Object} props
 * @param {Object} props.condition the LEVEL_EVENT condition
 * @param {(c: Object) => void} props.onChange
 * @param {Object} props.ctx see LevelEventFields
 * @param {string} props.caption the condition's caption with link notes
 * shell: index, count, disabled, errors, onRemove, onMove (RowShell)
 */
export default function LevelConditionRow({ condition, onChange, ctx, caption, ...shell }) {
  const lm = ctx.levelsMeta || DEFAULT_LEVELS_META;
  const ev = lm.events.find((e) => e.name === condition.event);
  return (
    <RowShell {...shell} caption={caption} testId="level-condition"
      heading={{ text: 'Level event', tooltip: RULE_TEXTS.rowLevel, className: 'text-amber-700' }}
      help={firstSentence(ev?.tooltip)}>
      <FieldLabel label="Source" tooltip={(lm.help || LEVELS_HELP).event}>
        <span className="px-1 py-1 text-sm text-gray-500">Levels</span>
      </FieldLabel>
      <LevelEventFields condition={condition} onChange={onChange} prefix="" linkable strengthLinkable ctx={ctx} />
    </RowShell>
  );
}
