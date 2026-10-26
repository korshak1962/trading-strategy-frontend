// src/components/universeScreener/OperandPicker.jsx
//
// One COMPARE operand: kind (price field / SMA(n) / CONST — the constant on the right side only),
// SMA length, TF and offset (0..−100 bars of its own TF). WEEK[0] in a DAY filter is flagged as
// provisional (the forming week, from the days up to the basis day).
import { OPERAND_KINDS, RIGHT_KINDS, SCREEN_TFS, SMA_MIN, SMA_MAX, OFFSET_MIN, OFFSET_MAX } from '../../api/screenerApi';
import { isProvisionalOperand } from './conditionFormat';

const KIND_LABEL = { OPEN: 'open', HIGH: 'high', LOW: 'low', CLOSE: 'close', VOLUME: 'volume', SMA: 'SMA(n)', CONST: 'constant' };

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-16';

export default function OperandPicker({ value, onChange, side, evalTf, disabled = false, testId }) {
  const kinds = side === 'right' ? RIGHT_KINDS : OPERAND_KINDS;
  const set = (patch) => onChange({ ...value, ...patch });
  const provisional = isProvisionalOperand(value, evalTf);
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
      ) : (
        <>
          {value.kind === 'SMA' && (
            <input
              type="number"
              className={num}
              min={SMA_MIN}
              max={SMA_MAX}
              step={1}
              value={value.n}
              disabled={disabled}
              onChange={(e) => set({ n: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
              title={`SMA length (${SMA_MIN}..${SMA_MAX}), by close`}
              aria-label={`${side} SMA length`}
            />
          )}
          <select
            className={sel}
            value={value.tf}
            disabled={disabled}
            onChange={(e) => set({ tf: e.target.value })}
            aria-label={`${side} timeframe`}
          >
            {SCREEN_TFS.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
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
