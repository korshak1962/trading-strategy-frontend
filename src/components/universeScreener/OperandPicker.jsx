// src/components/universeScreener/OperandPicker.jsx
//
// One COMPARE operand: kind (bar field / indicator / CONST — the constant on the right side only),
// the indicator's length n, TF and offset (0..−100 bars of its own TF). WEEK[0] in a DAY filter is
// flagged as provisional (the forming week, from the days up to the basis day).
//
// Stage 3b (F1): the kinds and their rules come from the backend's indicator descriptors
// (indicatorCatalog.js, filled from meta): the display name and description, whether the kind has
// a length n and its default / range / step, the value unit (shown next to the operand), the
// operand TFs and the run TFs. `runTf` (constructed strategies: the TF the preview runs on)
// disables a kind that does not run there (a stage-3b indicator on MIN5). `otherUnit` (the right
// side: the left operand's unit) disables the kinds of another unit, so only comparable values can
// be picked (PRICE_RANGE = ATR only with ATR or a constant).
//
// Constructed strategies only (stage 3a; the screener passes none of these, so its view is
// unchanged): `allowRun` adds the TF "RUN" (= the TF the strategy runs on); `linkSlot(field)`
// renders a link control next to the length ('n') or the constant ('const'), and
// `linkedValue(field)` (a number) replaces that input with the value the link gives.
import { SCREEN_TFS, OFFSET_MIN, OFFSET_MAX } from '../../api/screenerApi';
import {
  useIndicatorCatalog, descriptorOf, lengthParamOf, defaultLengthOf, hasLength, kindLabel, kindName,
  operandUnitOf, unitLabel, UNIT_HINT, runTfNotSupportedText, operandTfsOf, CONST_KIND,
} from '../../api/indicatorCatalog';
import { isProvisionalOperand, fmtNum, RUN_TF, unitsClash } from './conditionFormat';

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-16';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

const RUN_TITLE = 'RUN = the TF the strategy runs on (DAY in a DAY backtest, HOUR in an HOUR one, …). '
  + 'On HOUR / MIN5 / MONTH only RUN operands with offset [0] are allowed.';

/** Why a kind option is disabled (null = selectable). */
const disabledReason = (kind, runTf, otherUnit) => {
  const notRun = runTfNotSupportedText(kind, runTf);
  if (notRun) return notRun;
  const u = operandUnitOf({ kind });
  if (unitsClash(u, otherUnit)) {
    return `${kindName(kind)} is a ${unitLabel(u)} value; the left side is a ${unitLabel(otherUnit)} value: `
      + (u === 'PRICE_RANGE' || otherUnit === 'PRICE_RANGE'
        ? 'ATR compares only with ATR or a number'
        : 'compare values of one unit (or a number)');
  }
  return null;
};

export default function OperandPicker({
  value, onChange, side, evalTf, disabled = false, testId,
  allowRun = false, linkSlot = null, linkedValue = null, runTf = null, otherUnit = null,
}) {
  const catalog = useIndicatorCatalog();
  const kinds = side === 'right' ? [...catalog.kinds, CONST_KIND] : catalog.kinds;
  // A kind the catalog does not list (a definition from a newer server): still shown, as is
  const shownKinds = value.kind && !kinds.includes(value.kind) ? [...kinds, value.kind] : kinds;
  const set = (patch) => onChange({ ...value, ...patch });
  const provisional = isProvisionalOperand(value, evalTf);
  const baseTfs = allowRun ? [RUN_TF, ...SCREEN_TFS] : SCREEN_TFS;
  const tfs = operandTfsOf(value.kind, baseTfs);
  const linked = (field) => (linkedValue ? linkedValue(field) : null);
  const constLinked = linked('const');
  const nLinked = linked('n');
  const d = descriptorOf(value.kind);
  const p = lengthParamOf(value.kind);
  const withLength = hasLength(value.kind, value.n);
  const unit = operandUnitOf(value);
  const notRunHere = runTfNotSupportedText(value.kind, runTf);

  // A new kind takes its own default length (the descriptor's) and an allowed TF
  const changeKind = (kind) => {
    if (kind === CONST_KIND) { set({ kind }); return; }
    const okTfs = operandTfsOf(kind, baseTfs);
    set({
      kind,
      n: defaultLengthOf(kind),
      tf: okTfs.includes(value.tf) ? value.tf : okTfs[0],
    });
  };

  const lengthTitle = p
    ? `${p.description || `${kindName(value.kind)} length`} (${p.min ?? '…'}..${p.max ?? '…'}, step ${p.step}; default ${p.defaultValue})`
    : undefined;

  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={testId}>
      <select
        className={sel}
        value={value.kind}
        disabled={disabled}
        onChange={(e) => changeKind(e.target.value)}
        aria-label={`${side} operand kind`}
        title={d?.description || undefined}
        data-testid={testId ? `${testId}-kind` : undefined}
      >
        {shownKinds.map((k) => {
          const why = k === value.kind ? null : disabledReason(k, runTf, side === 'right' ? otherUnit : null);
          const desc = descriptorOf(k)?.description;
          return (
            <option key={k} value={k} disabled={!!why} title={why || desc || undefined}>
              {kindLabel(k)}
            </option>
          );
        })}
      </select>
      {value.kind === CONST_KIND ? (
        <>
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
          <span className="text-[11px] text-gray-500" title="A number fits any unit" data-testid={testId ? `${testId}-unit` : undefined}>any unit</span>
        </>
      ) : (
        <>
          {withLength && (
            nLinked != null ? (
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
                data-testid={testId ? `${testId}-n` : undefined}
              />
            )
          )}
          {withLength && linkSlot?.('n')}
          <select
            className={sel}
            value={value.tf}
            disabled={disabled}
            onChange={(e) => set({ tf: e.target.value })}
            aria-label={`${side} timeframe`}
            title={value.tf === RUN_TF ? RUN_TITLE : undefined}
          >
            {tfs.map((tf) => (
              <option key={tf} value={tf} title={tf === RUN_TF ? RUN_TITLE : undefined}>{tf === RUN_TF ? 'RUN (run TF)' : tf}</option>
            ))}
            {!tfs.includes(value.tf) && <option value={value.tf}>{value.tf}</option>}
          </select>
          <label className="inline-flex items-center gap-1 text-xs text-gray-600" title="Bars back in the operand's own TF: 0 = the basis bar, −1 = the one before">
            [
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
            ]
          </label>
          {unit && (
            <span className="text-[11px] text-gray-500" title={`Unit: ${UNIT_HINT[unit] || unitLabel(unit)}`} data-testid={testId ? `${testId}-unit` : undefined}>
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
            <span className="text-[11px] text-amber-700" data-testid={testId ? `${testId}-not-supported` : undefined}
              title="Run the strategy on HOUR or a coarser timeframe, or pick another operand">
              {notRunHere}
            </span>
          )}
        </>
      )}
    </span>
  );
}
