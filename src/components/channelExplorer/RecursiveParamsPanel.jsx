import './ChannelExplorer.css';
import { fractionToDisplayPct, displayPctToFraction } from './format';

export const RECURSIVE_DEFAULT_PARAMS = {
  coveragePct: 0.95,
  minBars: 5,
  minWidthPct: 0.05,
  minAnnualYieldPct: -2.0,
  maxAnnualYieldPct: 2.0,
  logPrice: true,
};

// Params panel for the recursive top-down segmentation algorithm — mirrors the windowed
// algorithm's params panel style (labeled slider + number box + "Reset to defaults") per the
// task doc. Post Douglas-Peucker migration (see TASK_douglas_peucker_migration.md Part D):
// minSplitGapFrac/minChannelBars/overlapBars are gone, replaced by minBars/minWidthPct, both
// flat defaults (no per-timeframe table) since the split point structurally can't land at an
// edge anymore.
//
// `constants` (viewInfo[tf].constants of the last detection, or null before one / on an older
// backend): the fixed confirmation / exit constants of the incremental channels, shown read-only.
// They are deliberately not editable (TASK_incremental_channels §8): the B view must stay exactly
// what the strategies saw.
export default function RecursiveParamsPanel({ params, setParam, onReset, constants = null }) {
  return (
    <div className="ta-params-panel">
      <div className="ta-params-grid">
        <ParamInput
          label="Channel Coverage (%)"
          tooltip="Fraction of bars' highs/lows the channel envelope must contain — the rest are treated as outliers and trimmed. Lower = tighter channel, more bars poke outside it."
          value={params.coveragePct}
          min={0.80} max={0.99} step={0.01}
          onChange={v => setParam('coveragePct', v)}
        />
        <ParamInput
          label="Min Annual Yield (%)"
          tooltip="Reject channels whose slope implies an annualized decline steeper than this. Values at or beyond -100 mean no limit at all on the downside — a price can't mathematically decline more than 100%, so anything past that point has the same effect: nothing gets rejected for being too steep on the way down."
          value={params.minAnnualYieldPct}
          min={-500} max={-10} step={1}
          toDisplay={fractionToDisplayPct}
          fromDisplay={displayPctToFraction}
          onChange={v => setParam('minAnnualYieldPct', v)}
        />
        <ParamInput
          label="Max Annual Yield (%)"
          tooltip="Reject channels whose slope implies an annualized growth steeper than this — e.g. 200 rejects a channel growing faster than 200%/year. Unlike the minimum, there's no mathematical ceiling on gains, so this bound can be set much higher than the minimum's magnitude."
          value={params.maxAnnualYieldPct}
          min={10} max={1000} step={10}
          toDisplay={fractionToDisplayPct}
          fromDisplay={displayPctToFraction}
          onChange={v => setParam('maxAnnualYieldPct', v)}
        />
        <div className="ta-param-item">
          <label className="ta-param-label">
            Min Bars
            <span
              className="ta-tooltip-anchor"
              data-tooltip="Recursion stops splitting a channel once it's this many bars or shorter."
            >?</span>
          </label>
          <input
            type="number"
            className="ta-param-input"
            value={params.minBars}
            min={2}
            step={1}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 2) setParam('minBars', v);
            }}
          />
        </div>
        <ParamInput
          label="Min Width (%)"
          tooltip="Recursion stops splitting a channel once its envelope is this tight, as a percentage of price."
          value={params.minWidthPct}
          min={1} max={20} step={1}
          toDisplay={fractionToDisplayPct}
          fromDisplay={displayPctToFraction}
          onChange={v => setParam('minWidthPct', v)}
        />
      </div>

      <p className="ta-params-note">
        Min / Max Annual Yield are a display filter only: they hide channels, they do not change the
        channel structure (which channels exist, where they start, when they are confirmed).
      </p>

      <ConfirmationConstants constants={constants} />

      <div className="ta-params-footer">
        <button type="button" className="ta-params-reset" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

const fmtConst = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—');

// Read-only block of the confirmation / exit constants (no inputs - see the panel's comment).
function ConfirmationConstants({ constants }) {
  return (
    <div className="ta-constants" data-testid="ce-constants">
      <div className="ta-constants-title">
        Confirmation constants (fixed, read-only)
        <span
          className="ta-tooltip-anchor"
          data-tooltip="A channel is a draft (pencil sketch) until it is at least Min Confirm Bars long and at least Min Confirm Width ATR wide; then it is confirmed (pen) and frozen. A confirmed channel ends when a close is beyond its line by more than Exit Tolerance ATR (ATR of the previous bar). Same rule for every timeframe, in both views; not parameters."
        >?</span>
      </div>
      {constants ? (
        <div className="ta-constants-grid">
          <span>Min confirm bars</span><strong>{fmtConst(constants.minConfirmBars)}</strong>
          <span>Min confirm width</span><strong>{fmtConst(constants.minConfirmWidthAtr)} ATR</strong>
          <span>Exit tolerance</span><strong>{fmtConst(constants.exitToleranceAtr)} ATR</strong>
        </div>
      ) : (
        <div className="ta-constants-empty">Shown after a detection (the backend reports them).</div>
      )}
    </div>
  );
}

// `toDisplay`/`fromDisplay` let a param whose underlying/wire value is a fraction (e.g.
// minWidthPct) be shown and edited as a whole percentage without changing what's stored or
// sent - see ../utils/format.js. Identity by default for every other param.
function ParamInput({ label, tooltip, value, min, max, step, onChange, toDisplay = v => v, fromDisplay = v => v }) {
  const displayValue = toDisplay(value);
  return (
    <div className="ta-param-item">
      <label className="ta-param-label">
        {label}
        <span className="ta-tooltip-anchor" data-tooltip={tooltip}>?</span>
      </label>
      <div className="ta-param-row">
        <input
          type="number"
          className="ta-param-input"
          value={displayValue}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const v = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= min && v <= max) onChange(fromDisplay(v));
          }}
        />
        <input
          type="range"
          className="ta-param-slider"
          value={displayValue}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const v = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            onChange(fromDisplay(v));
          }}
        />
      </div>
    </div>
  );
}
