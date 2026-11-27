// src/components/universeScreener/ConditionRows.jsx
//
// The two condition rows of the filter constructor:
//   MetricConditionRow  - CHANNEL_METRIC: TF, level (0 current / 1 parent / 2 grandparent), metric, min, max
//   CompareConditionRow - COMPARE: left operand, operator, right operand (or constant), tolerance %
// Each row shows its live caption and its validation errors.
// Editor UX Stage A (screener logs/agents/architect.md §3.2, §5.1): a row heading with an ⓘ
// ("COMPARE", "CHANNEL", …), headings above every control, the compare grid "Left value · Op ·
// Right value · Tolerance %" (controls aligned at the bottom, the right group wraps as a whole), and a
// help line. Stage B (B2): a row given `codeCaption` shows `caption` as a plain-English sentence with
// the code caption in its ⓘ; without it the caption is shown as before (mono).
import { METRICS, OPERATORS, SCREEN_TFS, LEVELS } from '../../api/screenerApi';
import { useEditorHelp, firstSentence, CHANNEL_HELP, RULE_TEXTS } from '../../api/editorTexts';
import { sourceTooltipOf, compareHelpLine } from '../strategyConstructor/operandSource';
import InfoTooltip from '../common/InfoTooltip';
import DisplayCaption from '../common/DisplayCaption';
import FieldLabel from '../common/FieldLabel';
import OperandPicker from './OperandPicker';
import { conditionCaption, fmtNum, operandUnit } from './conditionFormat';
import { screenerConditionText } from '../../utils/displayLabels';

const sel = 'p-1 border rounded text-sm bg-white';
const LEVEL_LABEL = { 0: '0 · current', 1: '1 · parent', 2: '2 · grandparent' };

/** A row heading: "COMPARE ⓘ" in the row's colour. */
export function RowHeading({ text, tooltip, className = 'text-gray-600', testId }) {
  return (
    <span className={`text-xs font-semibold uppercase tracking-wide ${className}`} data-testid={testId}>
      {text}
      <InfoTooltip text={tooltip} editor align="left" />
    </span>
  );
}

/**
 * The frame of a condition row (number, heading, controls, move / remove, caption, errors); also used
 * by the constructor's rows. `bare` (constructor stage 4b: a condition nested in a sequence brick or
 * WITHIN) renders the controls only - no number, move / remove, caption or errors.
 * `heading` (Stage A): `{text, tooltip, className}` shown above the controls.
 */
export function RowShell({
  index, caption, codeCaption = null, errors, onRemove, onMove, count, disabled, children, testId, bare = false, heading = null, help = null,
}) {
  if (bare) {
    return <span className="inline-flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={testId}>{children}</span>;
  }
  const hasErrors = errors?.length > 0;
  return (
    <div className={`border rounded p-3 bg-gray-50 ${hasErrors ? 'border-red-300' : ''}`} data-testid={testId}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="text-xs font-semibold text-gray-500 w-5 pt-0.5">{index + 1}.</span>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {heading && <RowHeading text={heading.text} tooltip={heading.tooltip} className={hasErrors ? 'text-red-700' : heading.className} />}
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 min-w-0">{children}</div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="px-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300"
            disabled={disabled || index === 0} onClick={() => onMove(-1)} title="Move up" aria-label="Move up">↑</button>
          <button type="button" className="px-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300"
            disabled={disabled || index === count - 1} onClick={() => onMove(1)} title="Move down" aria-label="Move down">↓</button>
          <button type="button" className="px-1.5 text-red-600 hover:text-red-800 disabled:text-gray-300"
            disabled={disabled} onClick={onRemove} title="Remove the condition" aria-label="Remove">✕</button>
        </div>
      </div>
      {help && <div className="mt-1 ml-7 text-[11px] text-gray-500" data-testid="condition-help">{help}</div>}
      {codeCaption != null ? (
        <DisplayCaption className="mt-1 ml-7 text-sm text-gray-700" text={caption} code={codeCaption}
          testId="condition-caption" codeTestId="condition-caption-code" />
      ) : (
        <div className="mt-1 ml-7 text-xs font-mono text-gray-700" data-testid="condition-caption">{caption}</div>
      )}
      {hasErrors && (
        <ul className="mt-1 ml-7 text-xs text-red-600 list-disc list-inside">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}

export function MetricConditionRow({ condition, onChange, evalTf, ...shell }) {
  const editorHelp = useEditorHelp();
  const set = (patch) => onChange({ ...condition, ...patch });
  const metric = METRICS.find((m) => m.value === condition.metric);
  const mh = (m) => editorHelp.metrics[m.value] || {};
  const tfHelp = editorHelp.operand.timeframes;
  return (
    <RowShell {...shell} caption={screenerConditionText(condition)} codeCaption={conditionCaption(condition, evalTf)} testId="metric-condition"
      heading={{ text: 'Channel', tooltip: CHANNEL_HELP.source, className: 'text-indigo-700' }}
      help={firstSentence(mh(metric || {}).tooltip || metric?.hint)}>
      <FieldLabel label="Timeframe" tooltip={CHANNEL_HELP.tf}>
        <select className={sel} value={condition.tf} disabled={shell.disabled} onChange={(e) => set({ tf: e.target.value })} aria-label="timeframe">
          {SCREEN_TFS.map((tf) => <option key={tf} value={tf}>{tfHelp[tf]?.label || tf}</option>)}
        </select>
      </FieldLabel>
      <FieldLabel label="Channel" tooltip={CHANNEL_HELP.level}>
        <select className={sel} value={condition.level} disabled={shell.disabled}
          onChange={(e) => set({ level: parseInt(e.target.value, 10) })} aria-label="level">
          {LEVELS.map((l) => <option key={l} value={l}>{CHANNEL_HELP[`level.${l}`] || LEVEL_LABEL[l]}</option>)}
        </select>
      </FieldLabel>
      <FieldLabel label="Metric" tooltip={CHANNEL_HELP.metric}>
        <select className={sel} value={condition.metric} disabled={shell.disabled} onChange={(e) => set({ metric: e.target.value })}
          aria-label="metric" title={mh(metric || {}).tooltip || metric?.hint}>
          {METRICS.map((m) => <option key={m.value} value={m.value} title={mh(m).tooltip || m.hint}>{mh(m).label || m.menuLabel || m.label}</option>)}
        </select>
      </FieldLabel>
      <FieldLabel label="Min" tooltip={CHANNEL_HELP.min}>
        <input type="number" step="any" className="p-1 border rounded text-sm w-20" value={condition.min}
          disabled={shell.disabled} onChange={(e) => set({ min: e.target.value })} aria-label="min" />
      </FieldLabel>
      <FieldLabel label="Max" tooltip={CHANNEL_HELP.max}>
        <input type="number" step="any" className="p-1 border rounded text-sm w-20" value={condition.max}
          disabled={shell.disabled} onChange={(e) => set({ max: e.target.value })} aria-label="max" />
      </FieldLabel>
      {metric?.unit && <span className="text-xs text-gray-500 pb-1">{metric.unit}</span>}
    </RowShell>
  );
}

/** A titled group of the compare grid ("Left value", "Right value"). */
function ValueGroup({ title, tooltip, children, testId }) {
  return (
    <div className="inline-flex flex-col gap-0.5 min-w-0" data-testid={testId}>
      <span className="text-xs font-semibold text-gray-600">
        {title}
        <InfoTooltip text={tooltip} editor align="left" />
      </span>
      <div className="inline-flex flex-wrap items-end gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

/**
 * Optional props (constructed strategies, stage 3a; the screener passes none):
 *   allowRun            - operands may take the TF "RUN"
 *   renderLink(suffix)  - a link control for the threshold `left.n` / `right.n` / `right.const` /
 *                         `tolerancePct` (null = none)
 *   linkedValue(suffix) - the linked value of that threshold (a number) or null: the input is then
 *                         replaced by the value
 *   caption             - overrides the live caption (e.g. with "($Gap = 2)")
 *   runTf               - the TF the strategy runs on: a kind that does not run there is disabled
 *   renderOperand({side, value, onChange, picker, otherUnit}) - stage 4b: renders a side itself
 *                         (a Levels value or a sequence brick); `picker` is the default OperandPicker
 *   bare                - no frame (a condition nested in a brick / WITHIN)
 *   help                - the help line under the row (Stage A; default: the sides' Source tooltips)
 *   sourceKinds         - the live meta kinds of the staged Sources (bricks, position) for that
 *                         default help line, the same texts as the Source menu's ⓘ
 * Length ranges, defaults and units come from the indicator descriptors (indicatorCatalog.js).
 * The right side offers only kinds of the left side's unit (or a constant).
 */
export function CompareConditionRow({
  condition, onChange, evalTf, allowRun = false, renderLink = null, linkedValue = null, caption = null,
  runTf = null, renderOperand = null, help = null, sourceKinds = null, ...shell
}) {
  const editorHelp = useEditorHelp();
  const oh = editorHelp.operand;
  const set = (patch) => onChange({ ...condition, ...patch });
  const sideProps = (side) => ({
    allowRun,
    runTf,
    otherUnit: side === 'right' ? operandUnit(condition.left) : null,
    linkSlot: renderLink ? (field) => renderLink(`${side}.${field}`) : null,
    linkedValue: linkedValue ? (field) => linkedValue(`${side}.${field}`) : null,
  });
  const sideEditor = (side) => {
    const picker = (
      <OperandPicker side={side} value={condition[side]} evalTf={evalTf} disabled={shell.disabled}
        onChange={(v) => set({ [side]: v })} testId={`operand-${side}`} {...sideProps(side)} />
    );
    if (!renderOperand) return picker;
    return renderOperand({
      side, value: condition[side], onChange: (v) => set({ [side]: v }), picker,
      otherUnit: side === 'right' ? operandUnit(condition.left) : null,
    });
  };
  const tolLinked = linkedValue ? linkedValue('tolerancePct') : null;
  // Stage B: a screener row (no `caption`) shows the plain sentence (every operand worded) with the
  // code caption in the ⓘ; a constructor row passes its own caption + codeCaption
  const op = oh.operators[condition.op];
  return (
    <RowShell {...shell}
      caption={caption ?? screenerConditionText(condition)}
      codeCaption={caption != null ? (shell.codeCaption ?? null) : conditionCaption(condition, evalTf)}
      testId="compare-condition"
      heading={{ text: 'Compare', tooltip: RULE_TEXTS.rowCompare, className: 'text-teal-700' }}
      help={help ?? compareHelpLine([sourceTooltipOf(condition.left, sourceKinds), sourceTooltipOf(condition.right, sourceKinds)])}>
      <ValueGroup title="Left value" tooltip={oh.help.leftValue} testId="compare-left">{sideEditor('left')}</ValueGroup>
      <FieldLabel label="Op" tooltip={oh.help.op} align="center">
        <select className={sel} value={condition.op} disabled={shell.disabled} onChange={(e) => set({ op: e.target.value })} aria-label="operator"
          title={op?.tooltip}>
          {OPERATORS.map((o) => <option key={o.value} value={o.value} title={oh.operators[o.value]?.tooltip}>{oh.operators[o.value]?.menuLabel || o.menuLabel || o.label}</option>)}
        </select>
      </FieldLabel>
      <ValueGroup title="Right value" tooltip={oh.help.rightValue} testId="compare-right">{sideEditor('right')}</ValueGroup>
      <FieldLabel label="Tolerance %" tooltip={oh.help.tolerancePct} align="right">
        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
          {tolLinked != null ? (
            <span className="px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono"
              title="Linked: the tolerance comes from the axes" data-testid="linked-tolerance">{fmtNum(tolLinked)}</span>
          ) : (
            <input type="number" step="0.1" className="p-1 border rounded text-sm w-16" value={condition.tolerancePct}
              disabled={shell.disabled} onChange={(e) => set({ tolerancePct: e.target.value })} aria-label="tolerance %" />
          )}
          {renderLink?.('tolerancePct')}
        </span>
      </FieldLabel>
    </RowShell>
  );
}
