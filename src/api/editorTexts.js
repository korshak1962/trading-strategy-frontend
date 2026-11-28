// src/api/editorTexts.js
//
// Editor UX Stage A (screener logs/agents/architect.md "Constructor rule editor UX, Stage A" §2, §6):
// plain-English menu labels and ⓘ tooltips of the rule editor and the screener rows.
//
// The backend serves these texts in NEW meta fields (`label`, `tooltip`, `inMenu`, `group`,
// `choices`, `fixedParams`, `help`, `menuLabel`, `operandHelp`, `signalTypeHelp`, `axisHelp`,
// `metricHelp`; `serviceImpl/condition/EditorHelpTexts`). This file holds FALLBACK copies of the
// same English, so an old backend, a missing meta or a partial deploy still renders the full
// plain-English editor. Normalizers merge item by item: `meta value || fallback || code`.
//
// Contract (Stage A): nothing here feeds a caption function. Captions, chart labels and validation
// messages keep the codes until Stage B; the ⓘ ends with "(code X)" to link the two.

import { useSyncExternalStore } from 'react';

// ---- sources (Source menu of an operand) ----

/** Source groups of the Source menu, in menu order. */
export const SOURCE_GROUPS = Object.freeze([
  { name: 'MARKET', label: 'Market data', tooltip: 'A price-bar field or an indicator.' },
  { name: 'NUMBER', label: 'Number', tooltip: 'A fixed number (right side only).' },
  { name: 'LEVELS', label: 'Levels (DAY / WEEK)', tooltip: 'Lines and distances from the level tracker (DAY / WEEK runs only).' },
  { name: 'EVENT_FUNCTIONS', label: 'From the last event (DAY / WEEK)',
    tooltip: 'A value remembered since a market event last happened. It follows the event, not your trade.' },
  { name: 'POSITION_FUNCTIONS', label: 'From my open long (LONG only)',
    tooltip: 'A value from your open long. Without one the condition is false. Not in "Cover short" rules.' },
]);

/** The Source items that are not an indicator descriptor (indicators come from meta.indicators). */
export const SOURCE_TEXTS = Object.freeze({
  PRICE_BAR: { label: 'Price bar',
    tooltip: 'The bar (candle) itself: open, high, low, close or volume. "Price broke the previous high" = Price bar Close, bars back 0, is above Price bar High, bars back −1.' },
  CONST: { label: 'Number', tooltip: 'A fixed number. Fits any unit. Linkable.' },
  LEVEL: { label: 'Levels', tooltip: 'Lines and distances from the support / resistance level tracker (run TF, DAY / WEEK).' },
});

/** Bar fields (the Field select of "Price bar"). */
export const BAR_FIELD_TEXTS = Object.freeze({
  OPEN: { label: 'Open', tooltip: 'The first price of the bar.' },
  HIGH: { label: 'High', tooltip: 'The highest price of the bar.' },
  LOW: { label: 'Low', tooltip: 'The lowest price of the bar.' },
  CLOSE: { label: 'Close', tooltip: 'The last price of the bar. All fills use the close.' },
  VOLUME: { label: 'Volume', tooltip: 'The shares traded in the bar.' },
});

/** Indicators: `menuLabel` / `tooltip` beside the descriptor's displayName / description (unchanged). */
export const INDICATOR_TEXTS = Object.freeze({
  SMA: { menuLabel: 'Moving average (SMA)', tooltip: 'Simple moving average of the close over Length bars of its timeframe (stored lengths only).' },
  SMA_TILT: { menuLabel: 'SMA slope', tooltip: 'Slope of the SMA over its last 5 values, in % of the SMA per bar. Positive = rising.' },
  RSI: { menuLabel: 'Relative strength index (RSI)', tooltip: 'Wilder RSI of the close over Length bars, 0 to 100.' },
  ATR: { menuLabel: 'Average true range (ATR)', tooltip: 'Average bar range (Wilder) over Length bars, in price: volatility.' },
  ATR_PCT: { menuLabel: 'ATR as % of price', tooltip: 'ATR in percent of the close: volatility comparable across tickers.' },
  ER: { menuLabel: 'Efficiency ratio', tooltip: 'Kaufman efficiency ratio over Length bars: 1 = a straight move, 0 = chop.' },
  IBS: { menuLabel: 'Close position in bar (IBS)', tooltip: 'Where the close sits in the bar\'s range: 0 = at the low, 1 = at the high.' },
  CORR: { menuLabel: 'Correlation with a benchmark', tooltip: 'Pearson correlation of daily (weekly) returns with SPY or QQQ over Length bars: 1 = moves with the market, 0 = its own way, below 0 = against it.' }, // fallback synced with meta_help.txt (R5 S17)
  KAIRI: { menuLabel: 'Kairi — distance from MA', tooltip: 'Kairi Relative Index: how far the close is from its simple moving average of Length bars. % (default): (close − SMA) / SMA × 100; Ratio: close / SMA; ATR: (close − SMA) / ATR(14).' }, // architect KAIRI v1 §3.1; re-sync with the backend's meta_help.txt
});

/** Comparison operators: `menuLabel` beside the caption symbol `label` (unchanged). */
export const OPERATOR_TEXTS = Object.freeze({
  GT: { menuLabel: 'is above (>)', tooltip: 'The left value is greater than the right value.' },
  GTE: { menuLabel: 'is at or above (≥)', tooltip: 'The left value is greater than or equal to the right value.' },
  LT: { menuLabel: 'is below (<)', tooltip: 'The left value is less than the right value.' },
  LTE: { menuLabel: 'is at or below (≤)', tooltip: 'The left value is less than or equal to the right value.' },
});

/** Operand timeframes (the written `tf` codes stay RUN / DAY / WEEK). */
export const TIMEFRAME_TEXTS = Object.freeze({
  RUN: { label: 'Run TF', tooltip: 'The backtest\'s own timeframe.' },
  DAY: { label: 'Day', tooltip: 'The DAY bar. On a DAY run the same as Run TF.' },
  WEEK: { label: 'Week', tooltip: 'The WEEK bar. On a DAY run the forming week (provisional).' },
});

/** Help of the operand / comparison controls (meta.operandHelp.help). */
export const OPERAND_HELP = Object.freeze({
  leftValue: 'The value tested on each bar.',
  rightValue: 'The value the left value is compared with.',
  source: 'Where the value comes from: the price bar, an indicator, a number, the level tracker or a value remembered since an event or since your entry.',
  tf: 'Where the value is read. Run TF = the backtest\'s own timeframe. On HOUR / MIN5 / MONTH only Run TF with Bars back 0. WEEK on a DAY run = the forming week (provisional).',
  field: 'Which price of the bar: open, high, low, close or volume.',
  n: 'Bars the indicator uses. Linkable.',
  const: 'The number to compare with. Linkable.',
  offset: '0 = this bar, −1 = the bar before, on the value\'s own timeframe.',
  op: 'How the left value must relate to the right value.',
  tolerancePct: 'Right × (1 + t / 100): +1 with "is above" = at least 1 % above; −5 with "is below" = more than 5 % below.',
  link: 'Tie this number to an axis; Optimize sweeps axes.',
  note: 'Your description. Not used in the calculation.',
});

// ---- Levels (meta.levels) ----

export const LEVEL_EVENT_TEXTS = Object.freeze({
  BREAKOUT_UP: { label: 'Breakout above a zone',
    tooltip: 'The close crossed above a tracked zone\'s top + Break buffer × ATR. Not confirmed yet.' },
  CONFIRMED_RETEST: { label: 'Breakout confirmed: retest',
    tooltip: 'After a breakout the low returned to the zone (within Touch tolerance × ATR) and price held (same-bar close above the zone, or a later close above the touch bar\'s high).' },
  CONFIRMED_RUNAWAY: { label: 'Breakout confirmed: runaway', tooltip: 'Price ran Runaway distance × ATR above the zone top without a retest.' },
  CONFIRMED_BASE: { label: 'Breakout confirmed: base',
    tooltip: 'Price held above the zone at least "Base: min bars above zone" bars, then closed above the highest high since the breakout.' },
  CONFIRMED_ANY: { label: 'Breakout confirmed (any way)', tooltip: 'Retest, runaway or base. The level breakout strategy buys here when flat.' },
  FAILED: { label: 'Breakout failed', tooltip: 'Before a confirmation the close fell below the zone bottom − Break buffer × ATR.' },
  SUPPORT_BREAK: { label: 'Support broken',
    tooltip: 'The close fell below the nearest support of at least the given strength by more than Break buffer × ATR.' },
  RESISTANCE_REACHED: { label: 'Resistance reached', tooltip: 'The close reached the bottom of the nearest resistance of at least the given strength. A take-profit.' },
  BROKEN_DOWN: { label: 'Confirmed zone broken down (retired)',
    tooltip: 'Stored strategies only: a confirmed zone\'s close fell below its bottom − Break buffer × ATR. Pick another event to change it; it cannot be chosen again.',
    inMenu: false },
});

export const LEVEL_OUTPUT_TEXTS = Object.freeze({
  IN_ZONE: { label: 'Inside a zone (1 = yes)', tooltip: '1 when the close is inside a zone of at least Min zone strength; no value outside a zone, so test it as "is at or above 1".' },
  SETUP_STOP: { label: 'Setup stop', tooltip: 'On a confirmation bar: (retest low or zone bottom) − Stop buffer × ATR. Keep it with "Value at last event" or "Value at entry".' },
  SETUP_ZONE_LINE: { label: 'Setup zone line', tooltip: 'On a confirmation bar: zone bottom − Break buffer × ATR (the initial sticky support).' },
  SUPPORT_LINE: { label: 'Support line',
    tooltip: 'The highest qualifying zone below the close, bottom − Break buffer × ATR. The sticky support rises to it.' },
  DIST_SUPPORT_ATR: { label: 'Distance to support, ATR', tooltip: 'How far the close is above the nearest strong support, in ATR.' },
  DIST_RESISTANCE_ATR: { label: 'Distance to resistance, ATR', tooltip: 'How far the nearest strong resistance is above the close, in ATR.' },
  OPEN_STOP: { label: 'Stop if bought here', tooltip: 'The stop a long bought at this close would get. Read it as "Value at entry".' },
  OPEN_LINE: { label: 'Support line if bought here', tooltip: 'The initial sticky support of a long bought at this close. Read it as "Value at entry".' },
});

/** Levels field groups (the expanded block), in display order. */
export const LEVELS_GROUPS = Object.freeze(['ZONES', 'BREAKOUT', 'RETEST', 'WAITING', 'RUNAWAY_BASE', 'STOP_SUPPORT', 'REARM']);

export const LEVELS_PARAM_TEXTS = Object.freeze({
  minStrength: { label: 'Min zone strength', group: 'ZONES',
    tooltip: 'Minimum zone strength to be tracked at all. Also the zone filter of "Inside a zone" and of the distances to support / resistance. Higher = fewer, stronger levels.' },
  breakBuffer: { label: 'Break buffer, ATR', group: 'BREAKOUT',
    tooltip: 'How far beyond the zone the close must go to count as a breakout (above the top) or a failure / break (below the bottom), in ATR.' },
  touchTolerance: { label: 'Touch tolerance, ATR', group: 'RETEST',
    tooltip: 'A retest counts when the low comes within this many ATR above the zone top.' },
  maxRetestBars: { label: 'Max bars to wait for retest', group: 'WAITING',
    tooltip: 'Bars to wait for a retest after a breakout before giving up. Used only when "Base: min bars above zone" is 0.' },
  maxDwellBars: { label: 'Max bars in zone after touch', group: 'WAITING',
    tooltip: 'After the retest touch, how many bars price may stay in the zone before the setup is dropped (stuck in the zone = weakness).' },
  confirmMode: { label: 'Retest confirmation', group: 'RETEST',
    tooltip: 'Same-bar close: the retest is confirmed when the touch bar closes above the zone top. Later close above touch-bar high: confirmed when a later bar closes above the touch bar\'s high.',
    choices: [{ value: 0, label: 'Same-bar close' }, { value: 1, label: 'Later close above touch-bar high' }] },
  runawayAtr: { label: 'Runaway distance, ATR (0 = off)', group: 'RUNAWAY_BASE',
    tooltip: 'Confirm without a retest when the close is this many ATR above the zone top (0 = no runaway entries).' },
  baseMinBars: { label: 'Base: min bars above zone (0 = off)', group: 'RUNAWAY_BASE',
    tooltip: 'Confirm without a retest after price holds above the zone this many bars and closes at a new high (0 = no base entries).' },
  maxBaseBars: { label: 'Base: max wait, bars', group: 'RUNAWAY_BASE', tooltip: 'Safety cap: the longest wait for a base, in bars.' },
  stopBuffer: { label: 'Stop buffer, ATR', group: 'STOP_SUPPORT',
    tooltip: 'The setup stop sits this many ATR below the zone bottom (or the retest low). Used by "Setup stop", "Stop if bought here" and the re-arm replay.' },
  upgradeStrength: { label: 'Support upgrade: min strength', group: 'STOP_SUPPORT',
    tooltip: 'The minimum zone strength for the support line: the sticky support moves up only to zones at least this strong.' },
  upgradeMinTouches: { label: 'Support upgrade: min touches', group: 'STOP_SUPPORT',
    tooltip: 'The minimum touches a zone needs before the sticky support can move up to it.' },
  takeProfitStrength: { label: 'Take-profit strength', group: 'REARM',
    tooltip: 'Re-arm only: the virtual position takes profit at a resistance of this strength (0 = none). Set it equal to your take-profit rule\'s strength, best by linking both to one axis.' },
});

export const LEVELS_FIXED_TEXTS = Object.freeze({
  warmupBars: { label: 'Warm-up bars', tooltip: 'Bars read before the run window so that zones exist on the first bar. Fixed.' },
  atrLength: { label: 'ATR length', tooltip: 'ATR period of every "× ATR" setting (Wilder, run TF, as of the previous bar). Fixed.' },
});

export const LEVELS_HELP = Object.freeze({
  summary: 'Settings of the level tracker for this condition. "Default settings" = the same as the Level breakout (bricks) template. Only changed fields are listed. Not optimized unless linked to an axis.',
  strength: 'Only zones at least this strong (0 < s ≤ 50). Strength grows with the number and weight of the zone\'s pivots and touches. Linkable.',
  offset: '0 = this bar, −1 = the bar before, on the run TF.',
  output: 'A price line or a distance from the level tracker on this bar. Empty on bars where it does not exist (the condition is then not met, not false).',
  event: 'A Levels event happened on at least one zone on this bar. Zones are support / resistance areas built from price pivots. Each strong enough zone is tracked: breakout, then retest / runaway / base, then confirmation or failure.',
  applyToAll: 'Copy these settings and their axis links into every Levels condition and value of this strategy.',
  rearm: 'Re-arm after stop / support break, and the take-profit strength of the virtual position.',
  rearmLabel: 'Re-arm after stop / support break',
  showAll: 'Show every setting in its group, including those at the default.',
  'group.ZONES': 'Zones',
  'group.BREAKOUT': 'Breakout',
  'group.RETEST': 'Retest',
  'group.WAITING': 'Waiting',
  'group.RUNAWAY_BASE': 'Runaway / base',
  'group.STOP_SUPPORT': 'Stop & sticky support',
  'group.REARM': 'Re-arm',
});

// ---- event functions (meta.bricks) and position functions (meta.position) ----

export const BRICK_TEXTS = Object.freeze({
  WITHIN: { label: 'Within the last k bars', tooltip: 'The event happened on this bar or on the k − 1 bars before.' },
  AT_LAST: { label: 'Value at last event', tooltip: 'X on the bar the event last happened. Never happened = not met.' },
  MAX_SINCE: { label: 'Highest since event', tooltip: 'Highest X after the event (its bar excluded), skipping the last n bars.' },
  MIN_SINCE: { label: 'Lowest since event', tooltip: 'Lowest X after the event (its bar excluded), skipping the last n bars.' },
  BARS_SINCE: { label: 'Bars since event', tooltip: 'Bars since the event last happened: 0 on the event bar. Never happened = not met.' },
});

export const BRICKS_HELP = Object.freeze({
  groupLabel: 'From the last event',
  group: 'A value remembered since a market event last happened. It follows the event, not your trade. DAY / WEEK only. Levels starts at the run window start, so results depend on the From date.',
  x: 'Value X: what the function reads (a bar field, an indicator or a Levels line).',
  a: 'Event: the market event the function counts from.',
  anchorType: 'The kind of event the function counts from: a Levels event, a comparison or a channel condition (no functions inside).',
  'anchorType.LEVEL_EVENT': 'Levels event',
  'anchorType.COMPARE': 'Comparison',
  'anchorType.CHANNEL_METRIC': 'Channel',
  lag: 'Skip last bars: ignore the last n bars. 1 = as of the previous bar (the usual ratchet), so today\'s value cannot exit today. 0 to 10.',
  bars: 'Within the last k bars, 1 to 250. Linkable.',
  within: 'True if the event happened on this bar or on any of the k − 1 bars before.',
});

export const POSITION_TEXTS = Object.freeze({
  AT_ENTRY: { label: 'Value at entry',
    tooltip: 'X on your long\'s entry bar (a seeded watch: the seed bar). Close at entry above 0 = "in a long"; close below close at entry with tolerance −5 = a 5 % stop.' },
  MAX_SINCE_ENTRY: { label: 'Highest since entry', tooltip: 'The highest X since entry (the entry bar excluded), skipping the last n bars: a trailing line.' },
  MIN_SINCE_ENTRY: { label: 'Lowest since entry', tooltip: 'The lowest X since entry (the entry bar excluded), skipping the last n bars.' },
  // R5 v2 F1
  STICKY_SINCE_ENTRY: { label: 'Sticky support since entry', tooltip: 'Exit line of the Levels sticky support, from your entry; never moves down.' },
});

export const POSITION_HELP = Object.freeze({
  groupLabel: 'From my open long',
  group: 'A value from your open long. Without one the condition is false. Not in "Cover short" rules.',
  x: 'Value X: what to read (a bar field, an indicator, a Levels line or a value from the last event) on the run TF.',
  lag: 'Skip last bars: 1 = the line as of the previous bar (a ratchet). Not optimizable. 0 to 10.',
  levels: "Sticky support since entry has no X and no lag: it reads its own Levels settings (the same as a Levels line) and follows the trade's sticky support zone.",
  badge: 'uses my open long',
  badgeTooltip: 'This rule reads your open long, so the strategy depends on the position.',
  noLong: 'Without an open long the condition is false.',
  refused: 'Not available in a "Cover short" rule.',
});

/**
 * The one disabled reason of "From my open long" in a "Cover short" rule (R4 / tester M6), shown in
 * both places: the Source menu's position items and the signal-type "Cover short" option of a rule
 * that reads the trade. Frontend-only on purpose: the live meta.position.help.refused ("Not available
 * in a "Cover short" rule.") reads well in the Source menu but not on the "Cover short" option itself,
 * so one sentence that reads well in both places is used, never prefixed with a label.
 */
export const POSITION_REFUSED_REASON = 'Not in "Cover short" rules: a value from your open long has no meaning while covering a short.';
export const positionRefusedText = () => POSITION_REFUSED_REASON;

// ---- channels (meta.channel; screener: metricHelp) ----

export const CHANNEL_METRIC_TEXTS = Object.freeze({
  POSITION: { label: 'Position in channel',
    tooltip: 'Where the close sits in the channel: 0 = on the lower line, 1 = on the upper line; below 0 or above 1 = outside.' },
  SLOPE_PCT_YEAR: { label: 'Slope, % per year', tooltip: 'Slope of the channel in % per year (252 DAY / 52 WEEK bars). Positive = rising.' },
  WIDTH_PCT: { label: 'Width, % of price', tooltip: 'Width of the channel in % of price.' },
  WIDTH: { label: 'Width, price', tooltip: 'Width of the channel in price on the bar: upper line − lower line.' },
  AGE_BARS: { label: 'Age, bars', tooltip: 'Bars of the channel\'s timeframe since the channel started.' },
  EXISTS: { label: 'Channel exists (1 = yes)',
    tooltip: '1 when there is a channel at this depth, else 0 (between 0 and 0 = no channel).' },
});

/** Screener metrics (semantics A, ScreenerMetaDTO.metricHelp; TOUCHES_* only here). */
export const SCREENER_METRIC_TEXTS = Object.freeze({
  WIDTH_PCT: { label: 'Width, % of price', tooltip: 'Width of the channel in % of price.' },
  SLOPE_PCT_YEAR: { label: 'Slope, % per year', tooltip: 'Slope of the channel in % per year (252 DAY / 52 WEEK bars). Positive = rising.' },
  POSITION: { label: 'Position in channel',
    tooltip: 'Where the close sits in the channel: 0 = on the lower line, 1 = on the upper line; below 0 or above 1 = outside.' },
  AGE_BARS: { label: 'Age, bars', tooltip: 'Bars of the channel\'s timeframe since the channel started.' },
  TOUCHES_UPPER: { label: 'Touches of upper line', tooltip: 'How many times price touched the channel\'s upper line.' },
  TOUCHES_LOWER: { label: 'Touches of lower line', tooltip: 'How many times price touched the channel\'s lower line.' },
});

export const CHANNEL_HELP = Object.freeze({
  source: 'A condition on the recursive price channel as of the previous bar (no look-ahead).',
  tf: 'Timeframe of the channel. Channels run on DAY / WEEK only.',
  'tf.RUN': 'The timeframe the strategy runs on (DAY or WEEK).',
  'tf.DAY': 'A DAY channel: the strategy then runs on DAY only.',
  'tf.WEEK': 'A WEEK channel (weeks built from DAY bars); on a DAY run the channel as of the previous week.',
  level: 'Channel depth: 0 = the deepest confirmed channel, 1 its parent, 2 its grandparent.',
  'level.0': 'Current (0)',
  'level.1': 'Parent (1)',
  'level.2': 'Grandparent (2)',
  metric: 'What to measure on the channel, as of the previous bar (no look-ahead).',
  min: 'Lower bound of the metric; empty = no bound. Linkable.',
  max: 'Upper bound of the metric; empty = no bound. Linkable.',
  detector: 'Settings of the channel detector for this condition. "Default settings" = the detector\'s defaults. Only changed fields are listed.',
  coveragePct: 'Share of the bars that must lie inside the channel (as in the Channel Explorer and the screener detector).',
  minBars: 'Minimum length of a channel, in bars.',
  minWidthPct: 'Recursion stops splitting a channel once it is this narrow, as a percentage of price.',
  minAgeBars: 'Depth 0 = the deepest confirmed channel at least this many bars old (else its parent).',
  applyToAll: 'Copy these detector settings into every channel condition of this strategy.',
  'field.coveragePct': 'Coverage, % of bars inside',
  'field.minBars': 'Min channel length, bars',
  'field.minWidthPct': 'Min width, % of price',
  'field.minAgeBars': 'Min age, bars',
});

// ---- rules and axes ----

export const SIGNAL_TYPE_TEXTS = Object.freeze({
  LongOpen: { label: 'Buy (open long)', tooltip: 'Open a long on this bar. Does nothing while already long.' },
  LongClose: { label: 'Sell (close long)', tooltip: 'Close the long on this bar. While flat it blocks entries of the other strategies on this bar.' },
  LongBlock: { label: 'Block long entry', tooltip: 'No long entry on this bar. Never opens or closes; a held long is kept.' },
  ShortOpen: { label: 'Open short', tooltip: 'Open a short on this bar. In "long only" mode it acts as a long exit.' },
  ShortClose: { label: 'Cover short', tooltip: 'Cover the short on this bar. Not allowed with "From my open long" values.' },
});

export const AXIS_HELP = Object.freeze({
  name: 'The axis name ($X) used in links.',
  kind: 'Length (indicator lengths), tolerance % or constant. Only thresholds of the same kind can link to it.',
  value: 'Used in Backtest and Preview.',
  min: 'Start of the Optimize sweep. Min = Max = fixed: not optimized.',
  max: 'End of the Optimize sweep.',
  step: 'Step of the Optimize sweep.',
  bounds: 'Optional hard limits: a value or a grid point outside them is refused.',
  description: 'Your note. Hover for the full text.',
  used: 'How many thresholds read this axis.',
});

/** Rule-editor texts that have no meta field (editor-only wording). */
export const RULE_TEXTS = Object.freeze({
  emptyRule: 'No conditions yet. Add a Comparison, Channel, Level event or Within below.',
  rowCompare: 'Compare two values on the bar: a price, an indicator, a Levels line, a value from the last event or from your open long.',
  rowChannel: 'A condition on the recursive price channel (position inside it, slope, width, age, exists), as of the previous bar. DAY / WEEK only.',
  rowLevel: 'An event of the support/resistance level tracker on this bar (breakout, confirmation, failure, support break, resistance reached). DAY / WEEK only.',
  rowWithin: 'True if an event happened on any of the last k bars, e.g. "a confirmation within the last 5 bars". DAY / WEEK only.',
  signalType: 'What the rule does when all its conditions hold on a bar.',
  unknownSuffix: '(not in this version)',
});

// ---- merge helpers ----

const str = (v) => (typeof v === 'string' && v ? v : '');

/**
 * `{label, tooltip}` of a meta item merged over its fallback: `label: x.label || f.label || x.name`,
 * `tooltip: x.tooltip || f.tooltip || ''` (architect §6). Stage B3: the retired `hint` key is never
 * read (an older backend still sends it; the fallbacks carry a tooltip for every item).
 */
export const helpOf = (x, f = {}) => ({
  label: str(x?.label) || str(f?.label) || str(x?.name) || '',
  tooltip: str(x?.tooltip) || str(f?.tooltip) || '',
});

/** A meta `help` map over its fallback (`{...fallback, ...meta}`, blank meta values ignored). */
export const helpMap = (m, fallback) => {
  const out = { ...fallback };
  if (m && typeof m === 'object') {
    Object.entries(m).forEach(([k, v]) => { if (str(v)) out[k] = v; });
  }
  return Object.freeze(out);
};

/** A meta list of HelpItemDTO `{name, label, tooltip}` → `{NAME: {label, tooltip}}` over the fallback map. */
export const helpItems = (list, fallback) => {
  const out = Object.fromEntries(Object.entries(fallback).map(([k, v]) => [k, { ...v }]));
  if (Array.isArray(list)) {
    list.forEach((x) => {
      if (!x || !str(x.name)) return;
      const f = out[x.name] || {};
      out[x.name] = { ...f, ...helpOf(x, f) };
    });
  }
  return Object.freeze(out);
};

// Outputs of the normalizers below: setEditorHelp registers them as they are (idempotent), so a
// caller may pass either the raw meta lists or an already-normalized object (R1 / tester M1).
const NORMALIZED = new WeakSet();
const mark = (o) => { NORMALIZED.add(o); return o; };
const isNormalized = (o) => o != null && typeof o === 'object' && NORMALIZED.has(o);

/** OperandHelpDTO (partial or absent) → the merged operand texts. */
export const normalizeOperandHelp = (m) => {
  if (isNormalized(m)) return m;
  const sources = helpItems(m?.sources, SOURCE_TEXTS);
  const groups = helpItems(m?.groups, Object.fromEntries(SOURCE_GROUPS.map((g) => [g.name, { label: g.label, tooltip: g.tooltip }])));
  const barFields = helpItems(m?.barFields, BAR_FIELD_TEXTS);
  // operators: the meta `label` is the menu text ("is above (>)"), kept as `menuLabel`
  const opsFallback = Object.fromEntries(Object.entries(OPERATOR_TEXTS).map(([k, v]) => [k, { label: v.menuLabel, tooltip: v.tooltip }]));
  const ops = helpItems(m?.operators, opsFallback);
  const operators = Object.freeze(Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, { menuLabel: v.label, tooltip: v.tooltip }])));
  const timeframes = helpItems(m?.timeframes, TIMEFRAME_TEXTS);
  return mark(Object.freeze({ sources, groups, barFields, operators, timeframes, help: helpMap(m?.help, OPERAND_HELP) }));
};

/** ConstructedMetaDTO.signalTypeHelp → `{LongOpen: {label, tooltip}, …}`. */
export const normalizeSignalTypeHelp = (list) => (isNormalized(list) ? list : mark(helpItems(list, SIGNAL_TYPE_TEXTS)));
/** ConstructedMetaDTO.axisHelp → the Axes-table column tooltips. */
export const normalizeAxisHelp = (m) => helpMap(m, AXIS_HELP);
/** ScreenerMetaDTO.metricHelp → `{WIDTH_PCT: {label, tooltip}, …}` (screener semantics-A metrics). */
export const normalizeMetricHelp = (list) => (isNormalized(list) ? list : mark(helpItems(list, SCREENER_METRIC_TEXTS)));

// ---- the registry (shared operand picker: screener and constructor) ----
//
// Module state like indicatorCatalog.js: the meta getters register the help they load, the shared
// OperandPicker / ConditionRows read it; components re-render through useEditorHelp().

let editorHelp = Object.freeze({
  operand: normalizeOperandHelp(null),
  signalTypes: normalizeSignalTypeHelp(null),
  axes: normalizeAxisHelp(null),
  metrics: normalizeMetricHelp(null),
});
const listeners = new Set();

/** Registers the help of a loaded meta (any key absent keeps what is registered). */
export const setEditorHelp = ({ operandHelp, signalTypeHelp, axisHelp, metricHelp } = {}) => {
  editorHelp = Object.freeze({
    operand: operandHelp ? normalizeOperandHelp(operandHelp) : editorHelp.operand,
    signalTypes: signalTypeHelp ? normalizeSignalTypeHelp(signalTypeHelp) : editorHelp.signalTypes,
    axes: axisHelp ? normalizeAxisHelp(axisHelp) : editorHelp.axes,
    metrics: metricHelp ? normalizeMetricHelp(metricHelp) : editorHelp.metrics,
  });
  listeners.forEach((l) => l());
};

export const getEditorHelp = () => editorHelp;

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The registered editor help; the component re-renders when a meta registers new texts. */
export const useEditorHelp = () => useSyncExternalStore(subscribe, getEditorHelp);

/** First sentence of a tooltip (the help line under a row). */
export const firstSentence = (text) => {
  const t = str(text).trim();
  if (!t) return '';
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : t;
};
