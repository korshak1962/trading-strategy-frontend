// src/utils/paramDescriptions.js
// Human-readable descriptions for strategy parameters, shown as hover tooltips in
// StrategyConfig. Keyed by strategy name -> paramName, sourced from each strategy's
// own logic/comments in the backend (serviceImpl/strategy/*.java).

const STRATEGY_PARAM_DESCRIPTIONS = {
  CausalChannelBreakoutStrategy: {
    MinBars: 'Minimum number of bars a channel segment must span. Splitting stops once a segment’s length drops to or below this.',
    MinWidthPct: 'Minimum channel envelope width, as a fraction of price (e.g. 0.05 = 5%). Splitting stops once the envelope width drops to or below this.',
    MinAnnualYieldPct: 'Lower bound on a channel’s annualized slope, as a fraction (e.g. -2.0 = -200%), not a percent. Channels declining steeper than this are rejected. Any value ≤ -1.0 (-100%) is a sentinel meaning "no floor", since an annualized decline can’t mathematically reach -100%.',
    MaxAnnualYieldPct: 'Upper bound on a channel’s annualized slope, as a fraction (e.g. 2.0 = 200%), not a percent. Channels rising steeper than this are rejected.',
    CoveragePct: 'Fraction of bars the channel’s upper/lower envelope must contain (e.g. 0.95 = 95% of bars fall inside the bounds).',
    WarmupBars: 'Bars skipped at the start of the walk-forward loop before entries/exits are evaluated, giving the detector enough history to build an initial channel tree.',
  },
  DropFromPeakStrategy: {
    LookbackPeriod: 'Number of bars used for the rolling peak (highest high). E.g. 10 DAY bars ≈ 2 trading weeks, 65 ≈ 3 calendar months.',
    DropPercent: 'Percent drop from the rolling peak that triggers an exit (LongClose). Only applies after a long position is already open.',
  },
  MeanReversionStrategy: {
    lookback: 'Number of bars in the rolling window used to compute the mean, standard deviation, and Z-score.',
    zEntry: 'Z-score entry threshold: opens a long once price falls this many standard deviations below the rolling mean (e.g. -2.0).',
    zExit: 'Z-score exit threshold: closes the position once price rises this many standard deviations above the rolling mean (e.g. 2.0).',
    rsiBuy: 'RSI must be below this value, alongside the Z-score condition, to confirm an oversold entry.',
    rsiSell: 'RSI must be above this value (with Z-score > 0.5) to confirm a mean-reversion exit.',
    volumeFactor: 'Entry requires the bar’s volume to exceed this fraction of the rolling average volume (e.g. 0.7 = 70% of the average).',
    rsiLength: 'Period, in bars, of the RSI indicator used by the buy/sell filters.',
  },
  SimpleStoplossStrategy: {
    StopLossPercent: 'Percent drop below the entry price that triggers a stop-loss exit.',
  },
};

// Fallback by bare param name, used if a strategy/param combo isn't listed above yet.
const GENERIC_PARAM_DESCRIPTIONS = {
  MinBars: 'Minimum number of bars required.',
  Length: 'Period, in bars, of the underlying indicator.',
};

// Thresholds of a constructed strategy (key Constructed:<id>@<v>), named R<rule>.C<cond>.<field>
// (screener architect.md "Конструктор стратегий" D5). Fixed by default (min = max = the value in
// the rule); set a range in Optimize to sweep one.
const CONSTRUCTED_THRESHOLD_DESCRIPTIONS = {
  tolerancePct: 'Tolerance of the comparison, %: the right side is multiplied by (1 + tolerance / 100). Plus makes ">" stricter, minus loosens it. Fixed at the rule\'s value unless you set a range.',
  'left.n': 'Length of the SMA on the left side of the comparison (5..200 bars of its TF). Fixed at the rule\'s value unless you set a range.',
  'right.n': 'Length of the SMA on the right side of the comparison (5..200 bars of its TF). Fixed at the rule\'s value unless you set a range.',
  'right.const': 'The constant on the right side of the comparison. Fixed at the rule\'s value unless you set a range.',
};
const CONSTRUCTED_THRESHOLD_RE = /^R\d+\.C\d+\.(tolerancePct|left\.n|right\.n|right\.const)$/;

// An axis of a constructed strategy ($Name, stage 3a): one parameter shared by its linked thresholds.
const AXIS_RE = /^\$[A-Za-z][A-Za-z0-9]{0,31}$/;
const AXIS_DESCRIPTION = 'Axis (linked parameter): every threshold linked to it takes its value ($A, −$A or $A ± $B), so the optimizer sweeps it as ONE parameter. Its range here is the sweep in Optimize.';

/**
 * Tooltip of a parameter. `note`: the description the backend gives (an axis note of a constructed
 * strategy, StrategyInfoDTO.paramNotes) - wins over everything else.
 */
export function getParamDescription(strategyName, paramName, note = null) {
  if (note) return note;
  if (AXIS_RE.test(paramName || '')) return AXIS_DESCRIPTION;
  const threshold = CONSTRUCTED_THRESHOLD_RE.exec(paramName || '');
  if (threshold) return CONSTRUCTED_THRESHOLD_DESCRIPTIONS[threshold[1]];
  return (
    STRATEGY_PARAM_DESCRIPTIONS[strategyName]?.[paramName] ||
    GENERIC_PARAM_DESCRIPTIONS[paramName] ||
    'No description available for this parameter.'
  );
}

export const OPTIMIZE_FIELD_DESCRIPTIONS = {
  min: 'Lower bound of the grid-search range tried for this parameter.',
  max: 'Upper bound of the grid-search range tried for this parameter.',
  step: 'Increment between successive values tried within the Min–Max range.',
};
