// src/components/strategyConstructor/RuleEditor.jsx
//
// One rule of a constructed strategy (screener architect.md "Конструктор стратегий" §4.9): the
// signal type it emits (LongOpen / LongClose / LongBlock / ShortOpen / ShortClose, from
// meta.signalTypes) and its AND-ed conditions - the Screener's CompareConditionRow, so operands,
// offsets and captions are the same as in a filter. The rule's and its conditions' permanent ids
// are kept when rows move or change: the threshold names R<rule>.C<cond>.* depend on them.
// Stage 3a: operands may take the TF RUN; every threshold (length, constant, tolerance) can be
// linked to an axis (LinkPicker); a linked threshold shows the axes' value instead of its input.
// Stage 4a: channel conditions (ChannelConditionRow, "+ Channel", semantics B); their min / max
// link to CONST axes. A new one copies the detector params of the strategy's last channel
// condition, else meta.channel.defaults.
// Stage 4b (architect_constructor_stage4b.md §8): "+ Level" (LevelConditionRow: a Levels event),
// "+ Within" (WithinConditionRow: WITHIN(A, k)); a comparison side may be a Levels value or a
// sequence brick (BrickOperandEditor: AT_LAST / MAX_SINCE / MIN_SINCE / BARS_SINCE). Thresholds
// are paths (`strength`, `bars`, `[P.]levels.<field>`, `P.x.n`); a new Levels occurrence copies the
// spec and the links of the strategy's last one (`levelsTemplate`).
// Stage 4c-1: a comparison side may be a position operand (AT_ENTRY / MAX_SINCE_ENTRY /
// MIN_SINCE_ENTRY, LONG only); a rule reading the trade carries the "reads the trade" mark, and
// ShortClose is refused for it (meta.position.refusedInRules).
import { CompareConditionRow } from '../universeScreener/ConditionRows';
import {
  pruneLinks, thresholdLiteral, isLevelEvent, isWithin, DEFAULT_CHANNEL_META, DEFAULT_LEVELS_META, DEFAULT_BRICKS_META,
  DEFAULT_POSITION_META,
} from '../../api/constructedApi';
import {
  newRuleCondition, newRuleChannelCondition, newRuleLevelCondition, newRuleWithinCondition, ruleCaption, ruleConditionCaption,
  linkedThresholdValue, isChannelCondition, withTemplateLinks, SIGNAL_TYPE_CLASS, SIGNAL_TYPE_HINT, levelsCaptionOpts,
  ruleUsesPosition, channelSpecOf, sameChannelSpec,
} from './constructedFormat';
import LinkPicker from './LinkPicker';
import ChannelConditionRow from './ChannelConditionRow';
import LevelConditionRow from './LevelConditionRow';
import WithinConditionRow from './WithinConditionRow';
import BrickOperandEditor from './BrickOperandEditor';
import FieldLabel from '../common/FieldLabel';
import DisplayCaption from '../common/DisplayCaption';
import { displayOpts, EDITOR_MODE, ruleHead, ruleBodyText, ruleConditionText } from '../../utils/displayLabels';
import { useEditorHelp, OPERAND_HELP, POSITION_HELP, RULE_TEXTS, positionRefusedText } from '../../api/editorTexts';
import { levelsBlockInfo, linkInfoOf } from '../common/paramBlockFormat';

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
 * @param {Array} props.axes the strategy's axes (stage 3a)
 * @param {(kind: string, value: number|null) => string|null} props.onCreateAxis creates an axis from
 *   a threshold's value, returns its name
 * @param {Object} [props.channelMeta] meta.channel (stage 4a): metrics, levels, TFs, detector defaults / ranges
 * @param {Array} [props.allRules] every rule of the draft: a new channel condition copies the last channel condition's params
 * @param {Object} [props.levelsMeta] meta.levels (stage 4b)
 * @param {Object} [props.bricksMeta] meta.bricks (stage 4b)
 * @param {{spec: Object, links: Object}|null} [props.levelsTemplate] the spec / field links a new Levels occurrence copies
 * @param {((condIndex: number, prefix: string) => void)|null} [props.onApplyLevelsToAll] "Apply to all Levels in this strategy"
 * @param {Object} [props.positionMeta] meta.position (stage 4c-1)
 * Operand kinds, lengths and units come from the indicator descriptors (indicatorCatalog.js); a
 * kind that does not run on `evalTf` (the preview's run TF, e.g. ATR on MIN5) is disabled.
 */
export default function RuleEditor({
  rule, index, count, onChange, onRemove, onMove, signalTypes, maxConditions, evalTf, errors, stats, disabled,
  axes = [], onCreateAxis = null, channelMeta = DEFAULT_CHANNEL_META, allRules = null,
  levelsMeta = DEFAULT_LEVELS_META, bricksMeta = DEFAULT_BRICKS_META, levelsTemplate = null, onApplyLevelsToAll = null,
  positionMeta = DEFAULT_POSITION_META,
}) {
  const set = (patch) => onChange({ ...rule, ...patch });
  // Short labels (re-arm round): a Levels caption carries no spec, `@L2` when the strategy has several specs
  const capOpts = levelsCaptionOpts(allRules || [rule], axes, levelsMeta?.defaults);
  // Stage B (B2): the plain-English captions (`[Levels set 2]` tags over all rules); the code caption in the ⓘ
  const dOpts = displayOpts(allRules || [rule], axes, EDITOR_MODE);
  const ruleBody = ruleBodyText(rule, axes, dOpts);
  // An operand change can drop a linkable threshold (SMA → close, CONST → field): its link goes too.
  // Stage 4b: a new Levels occurrence (a side became a Levels value / brick) takes the template's links.
  const setCondition = (i, condition) => set({
    conditions: rule.conditions.map((c, j) => (j === i
      ? { ...c, condition, links: pruneLinks(condition, withTemplateLinks(c.condition, condition, c.links, levelsTemplate)) }
      : c)),
  });
  const addCondition = (rc) => set({
    conditions: [...rule.conditions, { ...rc, links: withTemplateLinks(null, rc.condition, rc.links, levelsTemplate) }],
  });
  const setLink = (i, suffix, terms) => set({
    conditions: rule.conditions.map((c, j) => {
      if (j !== i) return c;
      const links = { ...(c.links || {}) };
      if (terms && terms.length) links[suffix] = terms;
      else delete links[suffix];
      return { ...c, links };
    }),
  });
  // The threshold's current literal: the value a new axis starts from (any path, stage 4b)
  const literalOf = (c, suffix) => thresholdLiteral(c.condition, suffix);
  const removeCondition = (i) => set({ conditions: rule.conditions.filter((_, j) => j !== i) });
  const moveCondition = (i, delta) => {
    const cs = [...rule.conditions];
    const j = i + delta;
    if (j < 0 || j >= cs.length) return;
    [cs[i], cs[j]] = [cs[j], cs[i]];
    set({ conditions: cs });
  };
  const types = signalTypes.includes(rule.signalType) ? signalTypes : [...signalTypes, rule.signalType];
  const readsTrade = ruleUsesPosition(rule); // stage 4c-1
  const refusedTypes = positionMeta?.refusedInRules || DEFAULT_POSITION_META.refusedInRules;
  // editor UX Stage A: plain-English signal types (meta.signalTypeHelp over the fallbacks)
  const signalHelp = useEditorHelp().signalTypes;
  const posHelp = positionMeta?.help || POSITION_HELP;
  const typeLabel = (t) => signalHelp[t]?.label || t;
  // Stage A ParamBlock: the previous channel condition of the strategy (for "same as above")
  const rulesInOrder = allRules || [rule];
  const prevChannelOf = (condIndex) => {
    let prev = null;
    for (const r of rulesInOrder) {
      const cs = r.conditions || [];
      for (let j = 0; j < cs.length; j += 1) {
        if (r === rule && j === condIndex) return prev;
        if (isChannelCondition(cs[j].condition)) prev = cs[j].condition;
      }
    }
    return prev;
  };
  const condErrors = (i) => errors?.conditions?.[i] || [];

  return (
    <div className="border rounded-lg p-3 bg-white" data-testid="constructor-rule">
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-sm font-semibold text-gray-700 w-16 pb-1" title="Permanent rule id: threshold names R<id>.C<id>.* use it">
          {rule.id != null ? `R${rule.id}` : 'new rule'}
        </span>
        <FieldLabel label="Signal type" tooltip={`${RULE_TEXTS.signalType} ${signalHelp[rule.signalType]?.tooltip || ''}`.trim()}
          code={rule.signalType} testId="info-rule-signal-type">
          <select
            className={`${sel} font-medium border ${SIGNAL_TYPE_CLASS[rule.signalType] || ''}`}
            value={rule.signalType}
            disabled={disabled}
            onChange={(e) => set({ signalType: e.target.value })}
            aria-label="signal type"
            title={signalHelp[rule.signalType]?.tooltip || SIGNAL_TYPE_HINT[rule.signalType]}
            data-testid="rule-signal-type"
          >
            {types.map((t) => {
              const refused = readsTrade && refusedTypes.includes(t);
              return (
                <option key={t} value={t} disabled={refused && t !== rule.signalType}
                  title={refused ? positionRefusedText() : (signalHelp[t]?.tooltip || SIGNAL_TYPE_HINT[t])}>
                  {typeLabel(t)}{refused ? ' (not with "From my open long")' : ''}
                </option>
              );
            })}
          </select>
        </FieldLabel>
        <span className="text-xs text-gray-500 pb-1 self-end">when all conditions hold on the bar</span>
        {readsTrade && (
          <span className="px-1.5 rounded text-xs font-medium bg-purple-50 text-purple-800 border self-end mb-1"
            style={{ borderColor: 'var(--c-purple-200)' }} data-testid="rule-reads-trade"
            title={posHelp.badgeTooltip || POSITION_HELP.badgeTooltip}>
            {posHelp.badge || POSITION_HELP.badge}
          </span>
        )}
        <FieldLabel label="Note" tooltip={OPERAND_HELP.note} className="flex-1 min-w-[8rem]" testId="info-rule-note">
          <input
            className="p-1 border rounded text-sm w-full"
            value={rule.note}
            disabled={disabled}
            placeholder="note (optional)"
            onChange={(e) => set({ note: e.target.value })}
            aria-label="rule note"
          />
        </FieldLabel>
        <div className="flex items-center gap-1 self-end pb-1">
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
        {rule.conditions.map((c, i) => {
          const common = {
            key: c.id != null ? `c${c.id}` : `n${i}`,
            condition: c.condition,
            onChange: (x) => setCondition(i, x),
            index: i,
            count: rule.conditions.length,
            disabled,
            errors: errors?.conditions?.[i] || [],
            onRemove: () => removeCondition(i),
            onMove: (d) => moveCondition(i, d),
            caption: ruleConditionText(c, axes, dOpts),
            codeCaption: ruleConditionCaption(c, evalTf, axes, capOpts),
            linkedValue: (suffix) => linkedThresholdValue(c, suffix, axes),
            renderLink: (suffix) => (
              <LinkPicker
                suffix={suffix}
                terms={c.links?.[suffix] || null}
                axes={axes}
                disabled={disabled}
                onChange={(terms) => setLink(i, suffix, terms)}
                onCreateAxis={onCreateAxis ? (kind) => {
                  const v = literalOf(c, suffix);
                  return onCreateAxis(kind, Number.isFinite(v) ? v : null, suffix);
                } : null}
              />
            ),
          };
          const { key, ...rest } = common;
          const levelsInfo = levelsBlockInfo(c, axes, rulesInOrder, levelsMeta?.defaults);
          // stage 4b: the context of the Levels / brick editors (links by full path)
          const ctx = {
            levelsMeta, bricksMeta, channelMeta, positionMeta, evalTf, disabled, allRules: allRules || [rule],
            signalType: rule.signalType, // Stage A: "From my open long" is refused in a Cover short rule
            levelsSpec: levelsTemplate?.spec,
            renderLink: rest.renderLink,
            linkedValue: rest.linkedValue,
            onApplyLevels: onApplyLevelsToAll ? (prefix) => onApplyLevelsToAll(i, prefix) : null,
            // Stage A ParamBlock: link axes of a path, "same as above", "Levels set n", open on a server error
            linkInfo: (suffix) => linkInfoOf(c.links?.[suffix], axes),
            levelsSameAsPrevious: (prefix) => !!levelsInfo[prefix]?.sameAsPrevious,
            levelsSetLabel: (prefix) => levelsInfo[prefix]?.setLabel || null,
            levelsErrorOpen: () => condErrors(i).some((e) => /levels\./i.test(e)),
          };
          if (isLevelEvent(c.condition)) return <LevelConditionRow key={key} {...rest} ctx={ctx} />;
          if (isWithin(c.condition)) return <WithinConditionRow key={key} {...rest} ctx={ctx} />;
          if (isChannelCondition(c.condition)) {
            // a bound can be linked only while it has a value (pruneLinks drops the link of a cleared bound)
            const hasBound = (s) => c.condition[s] !== '' && c.condition[s] != null && Number.isFinite(Number(c.condition[s]));
            return (
              <ChannelConditionRow key={key} {...rest} channelMeta={channelMeta}
                sameAsPrevious={(() => {
                  const prev = prevChannelOf(i);
                  return !!prev && sameChannelSpec(channelSpecOf(prev, channelMeta?.defaults), channelSpecOf(c.condition, channelMeta?.defaults));
                })()}
                errorOpen={condErrors(i).some((e) => /channel|coverage|minBars|minWidth|minAge/i.test(e))}
                renderLink={(suffix) => (hasBound(suffix) || c.links?.[suffix] ? rest.renderLink(suffix) : null)} />
            );
          }
          return (
            <CompareConditionRow key={key} {...rest} evalTf={evalTf} allowRun runTf={evalTf}
              sourceKinds={[...(bricksMeta?.kinds || []), ...(positionMeta?.kinds || [])]}
              renderOperand={(args) => (
                <BrickOperandEditor {...args} prefix={`${args.side}.`} allowBricks allowPosition linkable ctx={ctx} />
              )} />
          );
        })}
        {rule.conditions.length === 0 && <p className="text-sm text-gray-500" data-testid="rule-empty">{RULE_TEXTS.emptyRule}</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled || rule.conditions.length >= maxConditions}
          onClick={() => addCondition(newRuleCondition())}
          className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400" data-testid="rule-add-condition">
          + Comparison
        </button>
        <button type="button" disabled={disabled || rule.conditions.length >= maxConditions}
          onClick={() => addCondition(newRuleChannelCondition(allRules || [rule], channelMeta?.defaults))}
          className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400" data-testid="rule-add-channel"
          title="A condition on the recursive channel (position, slope, width, age, exists) as of the previous bar: semantics B, no look-ahead. Runs on DAY / WEEK.">
          + Channel
        </button>
        <button type="button" disabled={disabled || rule.conditions.length >= maxConditions}
          onClick={() => addCondition(newRuleLevelCondition(levelsTemplate?.spec))}
          className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400" data-testid="rule-add-level"
          title="A Levels event (breakout, confirmation, failure, support break, resistance reached) of the pivot level-zone tracker on the run TF. Runs on DAY / WEEK.">
          + Level
        </button>
        <button type="button" disabled={disabled || rule.conditions.length >= maxConditions}
          onClick={() => addCondition(newRuleWithinCondition(levelsTemplate?.spec))}
          className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400" data-testid="rule-add-within"
          title="WITHIN(A, k): the event A passed on one of the last k bars. Runs on DAY / WEEK.">
          + Within
        </button>
        <span className="text-xs text-gray-500">Conditions are AND-ed. For OR add another rule with the same signal type.</span>
      </div>
      <DisplayCaption className="mt-2 text-sm text-gray-700" head={ruleHead(rule)} text={ruleBody || '(no conditions)'}
        code={ruleCaption(rule, evalTf, axes, capOpts)} testId="rule-caption" codeTestId="rule-caption-code" />
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
