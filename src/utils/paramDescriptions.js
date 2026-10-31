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
  LevelBreakoutRetestStrategy: {
    MinStrength: 'Minimum zone strength for a support/resistance zone to be tracked at all. Weaker zones are ignored for breakouts, for the rule-2 support break and for the nearest-support/resistance overlays.',
    BreakBuffer: 'Breakout/breakdown buffer in ATR units. A zone breaks up when the close crosses above zone.high + BreakBuffer×ATR (the previous close must have been at or below that line — staying above is not a new breakout), and breaks down (tracker re-arms, or a held position exits on a support break) when close < zone.low − BreakBuffer×ATR.',
    TouchTolerance: 'Retest tolerance in ATR units. After a breakout, the bar’s low counts as touching the flipped zone when low ≤ zone.high + TouchTolerance×ATR. 0 requires the low to reach the zone exactly.',
    MaxRetestBars: 'Maximum bars to wait after a breakout for the retest touch (or a runaway entry). If neither happens within this many bars the setup is abandoned (MISSED_TIMEOUT) and the tracker re-arms; the zone can break out again only after price comes back to the break line and crosses it anew. Inactive while BaseMinBars > 0: the wait then ends only by a fail, the retest outcome, a runaway or base entry, or the MaxBaseBars safety cap (the optimizer drops it from the grid in that case).',
    MaxDwellBars: 'Maximum bars the price may linger at the retested zone after the touch without confirming. Exceeding it abandons the setup (MISSED_DWELL, no entry) and re-arms the tracker.',
    ConfirmMode: 'How the retest is confirmed. 0 = SAME_BAR_CLOSE: confirm as soon as a close is back above zone.high. 1 = NEXT_BAR_BREAK: require a later bar to close above the touch bar’s high.',
    StopBuffer: 'Initial stop distance in ATR units below the setup. Retest entries: stop = min(retest low, zone.low) − StopBuffer×ATR; runaway entries: stop = zone.low − StopBuffer×ATR, so a later ordinary retest does not stop them out. With sticky support the position exits at max(stop, support exit line), and that line starts at zone.low − BreakBuffer×ATR. StopBuffer < BreakBuffer: the stop sits above the line and governs until the first support upgrade. Equal (default 0.5): stop and line coincide (for a retest, when the retest low stays ≥ zone.low), so such a break is reported as STOP. StopBuffer > BreakBuffer: the stop is only a gap backstop.',
    TakeProfitStrength: 'Strength threshold for the resistance zone used as a profit target: the position is closed when price reaches the nearest zone above with at least this strength. 0 disables take-profit entirely.',
    RegimeSmaLength: 'Period, in bars, of the SMA regime filter — new entries are only allowed when the regime check passes. 0 disables the filter.',
    SupportTracking: 'How the support exit (rule 2) tracks its zone. Any non-zero value (normally 1) = sticky support: the support starts as the entry zone and only moves up — to the highest-low zone lying fully below the close (high < close) with enough strength — and its exit line, zone.low − BreakBuffer×ATR, never moves down, so a price that steps through a support in two moves still exits (SUPPORT_BREAK). 0 = legacy: the support is re-selected every bar as the nearest zone below the previous close (rev. 2.7 behaviour). Values other than 0 and 1 are treated as 1 with a backend warning. Fixed at 1 for optimization; 0 is accepted only as an explicit value.',
    SupportBreakMode: 'Which zones qualify as support. With SupportTracking = 1, a support upgrade always requires the zone to lie fully below the close, so modes 0 and 1 are identical (strength threshold MinStrength) and 2 uses SupportStrength instead; the optimization range is therefore 1..2. With SupportTracking = 0 (legacy): 0 = nearest zone with low < previous close, 1 = nearest zone entirely below it (high < previous close), 2 = same as 1 but with SupportStrength as the threshold.',
    SupportStrength: 'Strength threshold for the support zone in SupportBreakMode 2. Ignored in modes 0 and 1, which use MinStrength.',
    RunawayAtr: 'Entry without a retest, in ATR units: after a breakout, if no retest touch has happened and a later bar closes above zone.high + RunawayAtr×ATR, enter on that close (the breakout bar itself never counts). A retest on the same bar takes priority. 0 disables it; values ≤ BreakBuffer fire on the first follow-through bar.',
    BaseMinBars: 'Base entry (CONFIRMED_BASE, trigger BASE): after a breakout that holds above the level — no retest touch, no runaway, no fail — enter on the first bar at least BaseMinBars bars after the breakout whose close exceeds the base high, the highest high since the breakout bar (the breakout bar’s wick counts). Priority on a bar: retest touch, then runaway, then base. Stop = zone.low − StopBuffer×ATR, as for runaway, so a later ordinary retest does not stop it out. 0 = off (rev. 2.8 behaviour: MaxRetestBars ends the wait with MISSED_TIMEOUT); legal as an explicit value but outside the optimization range. While > 0, MaxRetestBars has no effect.',
    MaxBaseBars: 'Safety cap for the base wait, in bars after the breakout: with BaseMinBars > 0 a setup still waiting after this many bars is abandoned (MISSED_TIMEOUT) and the tracker re-arms. Fixed (min = max), not swept; expected to fire rarely if ever.',
    UpgradeMinTouches: 'Minimum touch count of a zone for the sticky support to upgrade (ratchet up) to it. Applies only to support upgrades — entries and tracker creation keep MinTouches. 1 lets the exit line follow single swing lows in a strong trend (less giveback, more whipsaw exits); 2 = rev. 2.8 behaviour. Fixed at 2 by default (upgrades off); to sweep it in Optimize, set the range 1..2 explicitly.',
    UpgradeMinStrength: 'Minimum zone strength for a sticky support upgrade. Applies only to upgrades. 0 = inherit (rev. 2.8 behaviour): SupportStrength in SupportBreakMode 2, otherwise MinStrength. Fixed at 0 by default (upgrades off); to sweep it in Optimize, set a range explicitly, e.g. 1..3. Scale: a single fresh DAY touch is worth about 1.0–2.0, a single fresh WEEK touch about 2.0–4.0.',
    WarmupBars: 'Bars skipped at the start of the walk-forward loop before entries/exits are evaluated, letting the zone detector build up history. Fixed (min = max) because it is part of the detector cache key and must not be swept.',
    AtrLength: 'Period, in bars, of the ATR that every buffer/tolerance above is measured in. Fixed (min = max) because it is part of the detector cache key and must not be swept.',
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

export function getParamDescription(strategyName, paramName) {
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
