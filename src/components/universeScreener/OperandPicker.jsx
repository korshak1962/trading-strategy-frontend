// src/components/universeScreener/OperandPicker.jsx
//
// One COMPARE operand: kind (price field / SMA(n) / CONST — the constant on the right side only),
// SMA length, TF and offset (0..−100 bars of its own TF). WEEK[0] in a DAY filter is flagged as
// provisional (the forming week, from the days up to the basis day).
//
// Constructed strategies only (stage 3a; the screener passes none of these, so its view is
// unchanged): `allowRun` adds the TF "RUN" (= the TF the strategy runs on); `linkSlot(field)`
// renders a link control next to the SMA length ('n') or the constant ('const'), and
// `linkedValue(field)` (a number) replaces that input with the value the link gives.
import { OPERAND_KINDS, RIGHT_KINDS, SCREEN_TFS, SMA_MIN, SMA_MAX, OFFSET_MIN, OFFSET_MAX } from '../../api/screenerApi';
import { isProvisionalOperand, fmtNum, RUN_TF } from './conditionFormat';

const KIND_LABEL = { OPEN: 'open', HIGH: 'high', LOW: 'low', CLOSE: 'close', VOLUME: 'volume', SMA: 'SMA(n)', CONST: 'constant' };

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-16';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

const RUN_TITLE = 'RUN = the TF the strategy runs on (DAY in a DAY backtest, HOUR in an HOUR one, …). '
  + 'On HOUR / MIN5 / MONTH only RUN operands with offset [0] are allowed in stage 3a.';

export default function OperandPicker({
  value, onChange, side, evalTf, disabled = false, testId,
  allowRun = false, linkSlot = null, linkedValue = null, smaMin = SMA_MIN, smaMax = SMA_MAX,
}) {
  const kinds = side === 'right' ? RIGHT_KINDS : OPERAND_KINDS;
  const set = (patch) => onChange({ ...value, ...patch });
  const provisional = isProvisionalOperand(value, evalTf);
  const tfs = allowRun ? [RUN_TF, ...SCREEN_TFS] : SCREEN_TFS;
  const linked = (field) => (linkedValue ? linkedValue(field) : null);
  const constLinked = linked('const');
  const nLinked = linked('n');
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={testId}>
      <select
        className={sel}
        value={value.kind}
        disabled={disabled}
        onChange={(e) => set({ kind: e.target.value })}
        aria-label={`${side} operand kind`}
      >
        {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}
      </select>
      {value.kind === 'CONST' ? (
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
        </>
      ) : (
        <>
          {value.kind === 'SMA' && (
            nLinked != null ? (
              <span className={linkedBox} title="Linked: the SMA length comes from the axes" data-testid={`linked-${side}-n`}>{fmtNum(nLinked)}</span>
            ) : (
              <input
                type="number"
                className={num}
                min={smaMin}
                max={smaMax}
                step={1}
                value={value.n}
                disabled={disabled}
                onChange={(e) => set({ n: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                title={`SMA length (${smaMin}..${smaMax}), by close`}
                aria-label={`${side} SMA length`}
              />
            )
          )}
          {value.kind === 'SMA' && linkSlot?.('n')}
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
          {provisional && (
            <span
              className="watch-state-badge watch-state-badge--PROVISIONAL"
              title="WEEK[0] in a DAY filter is the forming week built from the days up to the basis day: provisional until the week closes"
            >
              provisional
            </span>
          )}
        </>
      )}
    </span>
  );
}
