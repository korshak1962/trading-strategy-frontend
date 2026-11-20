// src/components/universeScreener/OperandPicker.jsx
//
// One COMPARE operand, laid out as Source · Timeframe · property · Bars back (editor UX Stage A,
// screener logs/agents/architect.md §3.2, §4, §5): Source = Price bar / an indicator / Number (the
// right side only; constructor: also Levels, the event and the position functions, see
// SourcePicker), the property = Field (Price bar), Length (an indicator with n) or Value (Number).
// Every control has a heading with an ⓘ. WEEK[0] in a DAY filter is flagged as provisional (the
// forming week, from the days up to the basis day).
//
// The operand JSON is unchanged: Source + Field map onto `kind`, and every change goes through
// operandSource.transition, the composition of the legacy kind / form selects.
//
// Stage 3b (F1): the kinds and their rules come from the backend's indicator descriptors
// (indicatorCatalog.js, filled from meta): the menu name and tooltip, whether the kind has a length
// n and its default / range / step, the value unit (shown next to the operand), the operand TFs and
// the run TFs. `runTf` (constructed strategies: the TF the preview runs on) disables a kind that
// does not run there (a stage-3b indicator on MIN5). `otherUnit` (the right side: the left
// operand's unit) disables the kinds of another unit, so only comparable values can be picked
// (PRICE_RANGE = ATR only with ATR or a constant).
//
// Constructed strategies only (stage 3a; the screener passes none of these): `allowRun` adds the TF
// "RUN" (= the TF the strategy runs on); `linkSlot(field)` renders a link control next to the
// length ('n') or the constant ('const'), and `linkedValue(field)` (a number) replaces that input
// with the value the link gives. `sourceCtx` (stage 4b / 4c-1 sources in the menu) - see SourcePicker.
//
// CORR: a kind with the benchmark choice param (descriptor `choiceParams`) gets a "Benchmark" select
// next to the length: a categorical value (a ticker string, never a number, never an optimizer
// axis - no link slot). The screener offers its universe's market (US); a constructed strategy has
// no ticker until it runs, so it offers every benchmark (the market in the option's tooltip; the run refuses a
// benchmark of another market with a 400). A stored benchmark the meta does not list stays selected
// as "(unknown)".
//
// KAIRI: a kind with the `mode` choice param gets a "Form" select next to the length, the same markup
// as "Benchmark" (no market filter, no link slot: a form is never an optimizer axis). The options are
// the descriptor's choices ("% of SMA" / "close / SMA" / "ATR(14) multiples"); the form sets the
// operand's unit (shown next to it). The default form is written as the choice's value in the editor
// and left out of the JSON by screenerApi.toOperand (`defaultOmitted`).
import { OFFSET_MIN, OFFSET_MAX } from '../../api/screenerApi';
import {
  useIndicatorCatalog, lengthParamOf, hasLength, kindName, FIELD_KINDS,
  operandUnitOf, unitLabel, unitHintOf, runTfNotSupportedText, runTfAdviceOf, operandTfsOf, CONST_KIND,
  benchmarkParamOf, modeParamOf,
} from '../../api/indicatorCatalog';
import { useEditorHelp } from '../../api/editorTexts';
import FieldLabel from '../common/FieldLabel';
import { isProvisionalOperand, fmtNum, SCREENER_MARKET, unitsClash } from './conditionFormat';
import SourcePicker, { TimeframeField } from './SourcePicker';
import { baseTfsOf, plainDisabledReason, PRICE_BAR, sourceOf, transition } from '../strategyConstructor/operandSource';

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-16';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

export default function OperandPicker({
  value, onChange, side, evalTf, disabled = false, testId,
  allowRun = false, linkSlot = null, linkedValue = null, runTf = null, otherUnit = null, sourceCtx = null,
}) {
  useIndicatorCatalog();
  const help = useEditorHelp().operand;
  const set = (patch) => onChange({ ...value, ...patch });
  const provisional = isProvisionalOperand(value, evalTf);
  const tfs = operandTfsOf(value.kind, baseTfsOf(allowRun));
  const linked = (field) => (linkedValue ? linkedValue(field) : null);
  const constLinked = linked('const');
  const nLinked = linked('n');
  const p = lengthParamOf(value.kind);
  const withLength = hasLength(value.kind, value.n);
  const bp = benchmarkParamOf(value.kind);
  const benchMarket = allowRun ? null : SCREENER_MARKET;
  const benchChoices = bp ? bp.choices.filter((c) => !benchMarket || !c.market || c.market === benchMarket) : [];
  const benchValue = bp ? (value.benchmark || bp.defaultValue || '') : '';
  const benchKnown = benchChoices.some((c) => c.value === benchValue);
  const mp = modeParamOf(value.kind);
  const modeValue = mp ? (value.mode || mp.defaultValue || '') : '';
  const modeKnown = mp ? mp.choices.some((c) => c.value === modeValue) : false;
  const unit = operandUnitOf(value);
  const notRunHere = runTfNotSupportedText(value.kind, runTf);
  const { source, field } = sourceOf(value);
  const tid = (s) => (testId ? `${testId}-${s}` : undefined);

  const lengthTitle = p
    ? `${p.description || `${kindName(value.kind)} length`} (${p.min ?? '…'}..${p.max ?? '…'}, step ${p.step}; default ${p.defaultValue})`
    : undefined;

  const sourcePicker = (
    <SourcePicker value={value} onChange={onChange} side={side} runTf={runTf} otherUnit={side === 'right' ? otherUnit : null}
      allowRun={allowRun} sourceCtx={sourceCtx} disabled={disabled} testId={tid('kind')} />
  );

  if (value.kind === CONST_KIND) {
    return (
      <span className="inline-flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={testId}>
        {sourcePicker}
        <FieldLabel label="Value" tooltip={help.help.const} testId={tid('info-const')}>
          <span className="inline-flex items-center gap-1">
            {constLinked != null ? (
              <span className={linkedBox} title="Linked: the value comes from the axes" data-testid="linked-const">{fmtNum(constLinked)}</span>
            ) : (
              <input
                type="number"
                step="any"
                className="p-1 border rounded text-sm w-24"
                value={value.value}
                disabled={disabled}
                onChange={(e) => set({ value: e.target.value })}
                aria-label="constant"
                placeholder="value"
              />
            )}
            {linkSlot?.('const')}
            <span className="text-[11px] text-gray-500" title="A number fits any unit" data-testid={tid('unit')}>any unit</span>
          </span>
        </FieldLabel>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-end gap-x-2 gap-y-1" data-testid={testId}>
      {sourcePicker}
      <TimeframeField value={value.tf} tfs={tfs} onChange={(tf) => set({ tf })} runTf={runTf} allowRun={allowRun}
        disabled={disabled} side={side} testId={tid('source-tf')} />
      {source === PRICE_BAR && (
        <FieldLabel label="Field" tooltip={help.help.field} testId={tid('info-field')}>
          <select className={sel} value={field} disabled={disabled} aria-label={`${side} field`} data-testid={tid('field')}
            title={help.barFields[field]?.tooltip}
            onChange={(e) => onChange(transition(value, PRICE_BAR, e.target.value, { allowRun }))}>
            {FIELD_KINDS.map((k) => {
              const why = k === field ? null : plainDisabledReason(k, runTf, side === 'right' ? otherUnit : null);
              return (
                <option key={k} value={k} disabled={!!why} title={why || help.barFields[k]?.tooltip || undefined}>
                  {help.barFields[k]?.label || k}
                </option>
              );
            })}
          </select>
        </FieldLabel>
      )}
      {withLength && (
        <FieldLabel label="Length" tooltip={help.help.n} testId={tid('info-n')}>
          <span className="inline-flex items-center gap-1">
            {nLinked != null ? (
              <span className={linkedBox} title={`Linked: the ${kindName(value.kind)} length comes from the axes`} data-testid={`linked-${side}-n`}>{fmtNum(nLinked)}</span>
            ) : (
              <input
                type="number"
                className={num}
                min={p?.min ?? undefined}
                max={p?.max ?? undefined}
                step={p?.step ?? 1}
                value={value.n ?? ''}
                disabled={disabled}
                onChange={(e) => set({ n: e.target.value === '' ? '' : (p && !p.integer ? Number(e.target.value) : parseInt(e.target.value, 10)) })}
                title={lengthTitle}
                aria-label={`${side} ${kindName(value.kind)} length`}
                data-testid={tid('n')}
              />
            )}
            {linkSlot?.('n')}
          </span>
        </FieldLabel>
      )}
      {bp && (
        <FieldLabel label="Benchmark" tooltip={help.help.benchmark || bp.description || 'The ETF the returns are correlated with'}
          testId={tid('info-benchmark')}>
          <select className={sel} value={benchValue} disabled={disabled} aria-label={`${side} ${kindName(value.kind)} benchmark`}
            data-testid={tid('benchmark')}
            title={benchChoices.find((c) => c.value === benchValue)?.label || bp.description || undefined}
            onChange={(e) => set({ benchmark: e.target.value })}>
            {benchChoices.map((c) => (
              <option key={c.value} value={c.value} title={c.market ? `${c.market} market` : undefined}>{c.label}</option>
            ))}
            {!benchKnown && benchValue && <option value={benchValue}>{benchValue} (unknown)</option>}
          </select>
        </FieldLabel>
      )}
      {mp && (
        <FieldLabel label="Form" tooltip={help.help.mode || mp.description || 'How the distance is measured'}
          testId={tid('info-mode')}>
          <select className={sel} value={modeValue} disabled={disabled} aria-label={`${side} ${kindName(value.kind)} form`}
            data-testid={tid('mode')}
            title={mp.choices.find((c) => c.value === modeValue)?.label || mp.description || undefined}
            onChange={(e) => set({ mode: e.target.value })}>
            {mp.choices.map((c) => {
              // the right side: a form of another unit than the left side's cannot be compared
              const clash = side === 'right' && c.value !== modeValue && unitsClash(c.unit, otherUnit);
              return (
                <option key={c.value} value={c.value} disabled={clash}
                  title={clash ? `${c.label}: unit ${unitLabel(c.unit)}; the left side's unit is ${unitLabel(otherUnit)}`
                    : (c.unit ? `Unit: ${unitLabel(c.unit)}` : undefined)}>
                  {c.label}
                </option>
              );
            })}
            {!modeKnown && modeValue && <option value={modeValue}>{modeValue} (unknown)</option>}
          </select>
        </FieldLabel>
      )}
      <FieldLabel label="Bars back" tooltip={help.help.offset} testId={tid('info-offset')}>
        <input
          type="number"
          className="p-1 border rounded text-sm w-14"
          min={OFFSET_MIN}
          max={OFFSET_MAX}
          step={1}
          value={value.offset}
          disabled={disabled}
          onChange={(e) => set({ offset: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
          aria-label={`${side} offset`}
        />
      </FieldLabel>
      {(unit || provisional || notRunHere) && (
        <span className="inline-flex flex-wrap items-center gap-1 pb-1">
          {unit && (
            <span className="text-[11px] text-gray-500" title={`Unit: ${unitHintOf(value)}`} data-testid={tid('unit')}>
              {unitLabel(unit)}
            </span>
          )}
          {provisional && (
            <span
              className="watch-state-badge watch-state-badge--PROVISIONAL"
              title="WEEK[0] in a DAY filter is the forming week built from the days up to the basis day: provisional until the week closes"
            >
              provisional
            </span>
          )}
          {notRunHere && (
            <span className="text-[11px] text-amber-700" data-testid={tid('not-supported')}
              title={`${runTfAdviceOf(value.kind).replace(/^r/, 'R')}, or pick another operand`}>
              {notRunHere}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
