// src/components/strategyConstructor/WithinConditionRow.jsx
//
// `WITHIN(A, k)` (constructor stage 4b, architect architect_constructor_stage4b.md §3.1, §8): PASS
// when the event A passed on one of the last k bars of the run TF (the bar itself included). A is
// one market condition (a Levels event, a comparison without bricks, a channel condition); k an
// integer in [1, meta.bricks.kMax], a fixed threshold `R<r>.C<c>.bars` unless linked to a CONST
// axis. A Levels event as A can carry links on its strength (`of.strength`) and its params
// (`of.levels.*`). Frame and style: ChannelConditionRow.
// Editor UX Stage A: heading "WITHIN", "Within the last ⓘ [k] bars", then Event type ⓘ · Event ⓘ.
import { RowShell } from '../universeScreener/ConditionRows';
import { fmtNum } from '../universeScreener/conditionFormat';
import FieldLabel from '../common/FieldLabel';
import { DEFAULT_BRICKS_META, isLevelEvent } from '../../api/constructedApi';
import { BRICKS_HELP, RULE_TEXTS, firstSentence } from '../../api/editorTexts';
import { AnchorConditionEditor } from './BrickOperandEditor';

const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

/**
 * @param {Object} props
 * @param {Object} props.condition `{type: 'WITHIN', tf: 'RUN', bars, of}`
 * @param {(c: Object) => void} props.onChange
 * @param {Object} props.ctx editor context (meta, links, evalTf, allRules, levelsSpec, disabled)
 * @param {string} props.caption the condition's caption with link notes
 * shell: index, count, disabled, errors, onRemove, onMove (RowShell)
 */
export default function WithinConditionRow({ condition, onChange, ctx, caption, ...shell }) {
  const bm = ctx.bricksMeta || DEFAULT_BRICKS_META;
  const bh = bm.help || BRICKS_HELP;
  const within = bm.kinds.find((k) => k.name === 'WITHIN');
  const linked = ctx.linkedValue ? ctx.linkedValue('bars') : null;
  return (
    <RowShell {...shell} caption={caption} testId="within-condition"
      heading={{ text: 'Within', tooltip: RULE_TEXTS.rowWithin, className: 'text-purple-700' }}
      help={firstSentence(within?.tooltip)}>
      <FieldLabel label="Within the last" tooltip={`${bh.within} k in [1, ${bm.kMax}] bars of the run TF.`} testId="info-within-bars">
        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
          {linked != null ? (
            <span className={linkedBox} title="Linked: k comes from the axes" data-testid="linked-bars">{fmtNum(linked)}</span>
          ) : (
            <input type="number" min={1} max={bm.kMax} step={1} className="p-1 border rounded text-sm w-16" value={condition.bars ?? ''}
              disabled={ctx.disabled} aria-label="within bars" data-testid="within-bars"
              onChange={(e) => onChange({ ...condition, bars: e.target.value === '' ? '' : parseInt(e.target.value, 10) })} />
          )}
          bars
          {ctx.renderLink?.('bars')}
        </span>
      </FieldLabel>
      <AnchorConditionEditor condition={condition.of} onChange={(of) => onChange({ ...condition, of })} prefix="of."
        linkable={isLevelEvent(condition.of)} strengthLinkable={isLevelEvent(condition.of)} ctx={ctx} />
    </RowShell>
  );
}
