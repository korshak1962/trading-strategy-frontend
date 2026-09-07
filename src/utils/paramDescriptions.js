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
    BreachTolerancePct: 'Tolerance, as a fraction of the current channel’s width, allowed before a price move outside the extrapolated channel bounds forces a rebuild.',
    ResyncPeriodBars: 'Maximum number of bars between forced channel-tree rebuilds, even when no breach occurred (periodic resync).',
  },
  DropFromPeakStrategy: {
    LookbackPeriod: 'Number of bars used for the rolling peak (highest high). E.g. 10 DAY bars ≈ 2 trading weeks, 65 ≈ 3 calendar months.',
    DropPercent: 'Percent drop from the rolling peak that triggers an exit (LongClose). Only applies after a long position is already open.',
  },
  MaCrossoverStrategy: {
    FastLength: 'Period, in bars, of the fast moving average.',
    Spread: 'Added to FastLength to derive the slow MA’s period (SlowLength = FastLength + Spread), so the slow MA is always longer than the fast one.',
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
  PriceAboveMaStrategy: {
    MaLength: 'Period, in bars, of the simple moving average the price is compared against.',
    Gap: 'Percent buffer around the moving average. Buy when price > MA×(1+Gap/100), sell when price < MA×(1-Gap/100). Gap = 0 means buy/sell exactly at the MA crossing.',
  },
  SimpleStoplossStrategy: {
    StopLossPercent: 'Percent drop below the entry price that triggers a stop-loss exit.',
  },
  TiltStrategy: {
    Length: 'Period, in bars, of the SMA used to compute the tilt (slope) indicator.',
    TiltBuy: 'Opens a long position when the SMA’s tilt value rises above this threshold.',
    TiltSell: 'Opens a short position when the SMA’s tilt value falls below this threshold.',
  },
};

// Fallback by bare param name, used if a strategy/param combo isn't listed above yet.
const GENERIC_PARAM_DESCRIPTIONS = {
  MinBars: 'Minimum number of bars required.',
  Length: 'Period, in bars, of the underlying indicator.',
};

export function getParamDescription(strategyName, paramName) {
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
