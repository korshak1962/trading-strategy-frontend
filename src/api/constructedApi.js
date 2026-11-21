// src/api/constructedApi.js
//
// Strategy constructor (screener logs/agents/architect.md "Конструктор стратегий" §4.7): CRUD of
// constructed strategies (versioned, soft delete), their references, the attempt counter (usage)
// and the preview without merge. Relative `/api/strategy/constructed/*` through the Vite proxy.
//
// Wire shapes are adapted in ONE place (toRuleRequest / fromConstructedDTO / normalizePreview
// below) so a naming difference to the backend is a one-line change. Errors: see httpClient.js.
//
// A constructed strategy is referenced from every existing endpoint (submitStrategies, optimize-*,
// screening-jobs, signal-charts, cases, watches) by the request key `Constructed:<id>@<version>`
// (strategyNameToParams key) - see components/strategyConstructor/constructedFormat.js.
//
// Stage 3a (screener logs/agents/architect.md "этап 3a"): operands with `tf: 'RUN'` (= the run's
// TF), axes `$Name` with linked thresholds (`axes[]` of the definition, `links` of a rule
// condition), templates (`/templates`, `/templates/{id}/create`) and `meta.indicators[]`.
//
// Stage 4a (screener logs/agents/architect.md "этап 4a", §1 K1 / K8, §6): channel conditions in a
// rule - `{type: 'CHANNEL_METRIC', tf: RUN|DAY|WEEK, level: 0..2, metric, min?, max?, channel:
// {coveragePct, minBars, minWidthPct, minAgeBars}}` evaluated in semantics B (causal: the channel
// tree after bar t−1, replayed from the ticker's first stored DAY bar). Their bounds link to CONST
// axes through the threshold suffixes `min` / `max`; `meta.channel` lists metrics, levels, TFs and
// the detector defaults / ranges.
//
// Stage 4b (screener logs/agents/architect_constructor_stage4b.md, backend_dev_stage4b.md "API
// contract"): the Levels indicator and the sequence bricks, constructed strategies only -
//   condition `{type: 'LEVEL_EVENT', tf: 'RUN', event, strength?, levels: LevelsSpec}`,
//   condition `{type: 'WITHIN', tf: 'RUN', bars, of: <one market condition>}`,
//   operand `{kind: 'LEVEL', tf: 'RUN', offset, output, levels}`,
//   operands `{kind: AT_LAST|MAX_SINCE|MIN_SINCE, tf: 'RUN', offset: 0, x, a, lag?}` / `{kind: 'BARS_SINCE', a}`.
// Thresholds are paths (`strength`, `bars`, `of.strength`, `[P.]levels.<field>`, `P.x.n`), linked
// to axes like the stage 3a suffixes; get / set by path below. Run on DAY / WEEK only; at most
// `meta.maxAxes` (16) axes; template options (`{takeProfit, regime}`) on create.
//
// Stage 4c-1 (screener logs/agents/architect.md §2.7, backend_dev.md): position operands, LONG only,
// constructed rules only - `{kind: AT_ENTRY, tf: 'RUN', offset: 0, x}`, `{kind: MAX_SINCE_ENTRY |
// MIN_SINCE_ENTRY, tf: 'RUN', offset: 0, lag, x}` (existing OperandDTO fields). X is a market operand:
// a bar field, an indicator, LEVEL or a brick. Links inside X: `P.x.n`, `P.x.levels.*` (and a brick X's
// `P.x.x.n`, `P.x.x.levels.*`, `P.x.a.levels.*`); `lag` is never an axis. `meta.position`, the Levels
// outputs OPEN_STOP / OPEN_LINE, `positionDependent` on the DTOs (summary, version, preview).
//
// R5 v2 F1 (screener logs/agents/architect_r5_migration_v2.md §6, backend_dev_r5_v2.md "/meta for the
// frontend"): the position operand of form LEVELS `{kind: STICKY_SINCE_ENTRY, tf: 'RUN', offset: 0,
// levels}` - the Levels sticky-support exit line of the open long; no X, no lag, no output, its own
// Levels spec. Links on it: `P.levels.<field>` (as a LEVEL side), never `P.x.*`.

import { apiRequest, readJson, jsonBody, enc } from './httpClient';
import { toConditionDTO, fromConditionDTO, toOperand, fromOperand } from './screenerApi';
import {
  DEFAULT_INDICATORS, normalizeIndicator, hasLength, setIndicatorCatalog, setLevelOutputUnits,
  LEVEL_KIND, ANCHORED_KINDS, BRICK_OPERAND_KINDS, isStagedOperand, isBrickOperand,
  POSITION_KINDS, POSITION_WINDOW_KINDS, POSITION_LEVELS_KINDS, isPositionOperand, isPositionLevelsOperand,
} from './indicatorCatalog';
import {
  LEVEL_EVENT_TEXTS, LEVEL_OUTPUT_TEXTS, LEVELS_PARAM_TEXTS, LEVELS_FIXED_TEXTS, LEVELS_HELP, LEVELS_GROUPS,
  BRICK_TEXTS, BRICKS_HELP, POSITION_TEXTS, POSITION_HELP, CHANNEL_METRIC_TEXTS, CHANNEL_HELP,
  helpOf, helpMap, normalizeOperandHelp, normalizeSignalTypeHelp, normalizeAxisHelp, setEditorHelp,
} from './editorTexts';

export {
  LEVEL_KIND, ANCHORED_KINDS, BRICK_OPERAND_KINDS, isStagedOperand, isBrickOperand,
  POSITION_KINDS, POSITION_WINDOW_KINDS, POSITION_LEVELS_KINDS, isPositionOperand, isPositionLevelsOperand,
};

export { DEFAULT_INDICATORS };

const API_BASE_URL = '/api/strategy/constructed';

// ---- static contract (fallbacks when /meta is absent or partial) ----

/** Rule signal types (BA Q4); LongBlock from stage 2. No ShortBlock. */
export const SIGNAL_TYPES = Object.freeze(['LongOpen', 'LongClose', 'LongBlock', 'ShortOpen', 'ShortClose']);
/**
 * Run timeframes of a constructed strategy. Stage 3a: every TF; HOUR / MIN5 / MONTH take only RUN
 * operands with offset [0] (E4) - see constructedFormat.runTfsOf.
 */
export const CONSTRUCTED_TFS = Object.freeze(['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH']);
/** The operand TF "the TF the strategy runs on" (stage 3a, E3). Constructed strategies only. */
export const RUN_TF = 'RUN';
/** Axis kinds (architect §3.1) and the threshold suffix each kind may be linked to (§3.2). */
export const AXIS_KINDS = Object.freeze(['LENGTH', 'TOLERANCE', 'CONST']);
export const LINK_SUFFIX_KIND = Object.freeze({
  'left.n': 'LENGTH',
  'right.n': 'LENGTH',
  tolerancePct: 'TOLERANCE',
  'right.const': 'CONST',
  // stage 4a: the bounds of a channel condition (R<r>.C<c>.min / .max)
  min: 'CONST',
  max: 'CONST',
});
/** Fallback of meta.maxAxes (stage 4b: 16, was 10). */
export const MAX_AXES = 16;
/**
 * Axis constraints (stage 3b-2, architect F12): `{left: '$TiltSell', op: 'LE', right: '$TiltBuy'}`,
 * two different axes of one kind; at most MAX_CONSTRAINTS (ConstructedDefinitionValidator).
 */
export const CONSTRAINT_OPS = Object.freeze(['LE', 'LT', 'GE', 'GT']);
export const CONSTRAINT_OP_SYMBOL = Object.freeze({ LE: '≤', LT: '<', GE: '≥', GT: '>' });
export const MAX_CONSTRAINTS = 5;
export const MAX_LINK_TERMS = 2;
export const STATE_RULE_FIRE_RATE = 0.2;   // Q11: a LongOpen / ShortOpen rule firing on > 20 % of bars
export const MIN_TRADES_PER_THRESHOLD = 10; // Q11: trades per threshold in sweep
export const MAX_RULES = 20;
export const MAX_CONDITIONS = 10;

// Editor UX Stage A: a fallback list item gets its plain-English `label` / `tooltip` (and the other
// text keys of its texts entry, e.g. `inMenu`) from editorTexts.js.
function withTexts(texts, list) {
  return list.map((x) => {
    const t = texts[x.name] || {};
    return { ...x, ...t, label: t.label || x.label || x.name, tooltip: t.tooltip || x.hint || '' };
  });
}

// ---- channel conditions (stage 4a, architect §1 K1, §2.2, §3.2) ----

/** The channel's TFs in a rule: RUN = the run's TF (DAY / WEEK only), or a fixed DAY / WEEK channel. */
export const CHANNEL_TFS = Object.freeze(['RUN', 'DAY', 'WEEK']);
/** Run TFs a strategy with a channel condition can run on (HOUR / MIN5 / MONTH → 400 TIMEFRAME). */
export const CHANNEL_RUN_TFS = Object.freeze(['DAY', 'WEEK']);
export const CHANNEL_LEVELS = Object.freeze([0, 1, 2]);
/** Semantics-B metrics (TOUCHES_* are not in B yet). `unit` = backend ValueUnit. */
export const CHANNEL_METRICS = Object.freeze(withTexts(CHANNEL_METRIC_TEXTS, [
  { name: 'POSITION', label: 'Position', unit: 'RATIO',
    hint: '(ln close − lower) / (upper − lower) on the bar: 0 = at the lower line, 1 = at the upper line; not clipped (<0 below, >1 above)' },
  { name: 'SLOPE_PCT_YEAR', label: 'Slope %/year', unit: 'PERCENT', hint: 'Signed annualized slope of the channel, e.g. −30 = falling 30 % a year' },
  { name: 'WIDTH_PCT', label: 'Width %', unit: 'PERCENT', hint: 'Upper line above the lower one by this many % of price' },
  { name: 'WIDTH', label: 'Width (price)', unit: 'PRICE_RANGE', hint: 'Upper line minus lower line on the bar, in price' },
  { name: 'AGE_BARS', label: 'Age (bars)', unit: 'BARS', hint: 'Bars of the channel TF since the channel start' },
  { name: 'EXISTS', label: 'Exists', unit: 'RATIO',
    hint: '1 when the channel of this level exists on the bar, else 0 (level 1 / 2: L0 and its parent / grandparent exist). EXISTS in [0, 0] = "no channel"' },
]));
/** Detector parameters of a channel condition (architect K1: written in full in every version). */
export const CHANNEL_DEFAULTS = Object.freeze({ coveragePct: 0.95, minBars: 5, minWidthPct: 0.05, minAgeBars: 0 });
/** Ranges as FilterValidator checks them: coveragePct (0.5, 1], minBars [2, 1000], minWidthPct [0, 1), minAgeBars [0, 500]. */
export const CHANNEL_RANGES = Object.freeze({
  coveragePct: { min: 0.5, max: 1, minExclusive: true },
  minBars: { min: 2, max: 1000, integer: true },
  minWidthPct: { min: 0, max: 1, maxExclusive: true },
  minAgeBars: { min: 0, max: 500, integer: true },
});
export const CHANNEL_KEYS = Object.freeze(['coveragePct', 'minBars', 'minWidthPct', 'minAgeBars']);

export const DEFAULT_CHANNEL_META = Object.freeze({
  metrics: CHANNEL_METRICS,
  levels: CHANNEL_LEVELS,
  timeframes: CHANNEL_TFS,
  runTimeframes: CHANNEL_RUN_TFS,
  defaults: CHANNEL_DEFAULTS,
  ranges: CHANNEL_RANGES,
  help: helpMap(null, CHANNEL_HELP),
});

// ---- Levels and sequence bricks (stage 4b) ----

/**
 * The linkable (numeric) LevelsSpec fields (architect §2.3), in the backend's order. Re-arm round
 * (architect_constructor_stage4b_rearm.md §3 + owner's edit): `takeProfitStrength` (0 = none; read
 * only with `rearm`). No `regimeSmaLength`: the regime filter stays a separate rule condition.
 */
export const LEVEL_FIELDS = Object.freeze(['minStrength', 'breakBuffer', 'touchTolerance', 'maxRetestBars', 'maxDwellBars',
  'confirmMode', 'runawayAtr', 'baseMinBars', 'maxBaseBars', 'stopBuffer', 'upgradeStrength', 'upgradeMinTouches',
  'takeProfitStrength']);
/** Fixed in stage 4b (shown, never edited or linked). */
export const LEVELS_FIXED = Object.freeze({ warmupBars: 60, atrLength: 14 });
/** Every numeric field of the canonical LevelsSpec (15; plus the bool `rearm`). */
export const LEVELS_KEYS = Object.freeze([...LEVEL_FIELDS, 'warmupBars', 'atrLength']);
/** Re-arm after the Levels pass's own (solo, virtual) stop / support break: a structural switch, never an axis. */
export const LEVELS_REARM_DEFAULT = true;
/** Fields the Levels pass reads only with `rearm` (its virtual position). */
export const LEVELS_REARM_FIELDS = Object.freeze(['stopBuffer', 'upgradeStrength', 'upgradeMinTouches', 'takeProfitStrength']);
export const LEVELS_REARM_HINT = 'Re-arm after stop / support break (the Levels re-arm behaviour): Levels replays its own solo '
  + 'virtual position (entry on each confirmation while flat, exit on its stop / support break / take-profit) and '
  + 're-arms the zone after a stop or a support break. The replay follows that solo position, not your '
  + 'strategy\'s trades (stage 4c). Off = a zone confirms once, as before.';
/** The bool `rearm` of a spec (a bool, 'true' / 'false' or 1 / 0), else the fallback. */
export const rearmOf = (spec, fallback = LEVELS_REARM_DEFAULT) => {
  const v = spec?.rearm;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback !== false;
};
export const STRENGTH_MAX = 50;
export const WITHIN_BARS_MAX = 250;
export const LAG_MAX = 10;
/** Events that take a strength threshold (SUPPORT_BREAK / RESISTANCE_REACHED). */
export const STRENGTH_EVENTS = Object.freeze(['SUPPORT_BREAK', 'RESISTANCE_REACHED']);

const lp = (name, defaultValue, min, max, minInclusive, integer, hint, inPass) => ({
  name, defaultValue, min, max, minInclusive, integer, hint, inPass,
});
/**
 * Editor UX Stage A: a Levels param's plain-English `plainLabel` (the meta `label`; the code-style
 * `levelsFieldLabel` stays for captions and new axis names), `tooltip`, `group` and `choices`.
 */
function paramTexts(x, f = {}) {
  const t = LEVELS_PARAM_TEXTS[x.name] || {};
  return {
    plainLabel: (typeof x.label === 'string' && x.label) || f.plainLabel || t.label || x.name,
    tooltip: (typeof x.tooltip === 'string' && x.tooltip) || f.tooltip || t.tooltip || x.hint || '',
    group: (typeof x.group === 'string' && LEVELS_GROUPS.includes(x.group) && x.group) || f.group || t.group || null,
    choices: normalizeChoices(x.choices) || f.choices || t.choices || null,
  };
}
function normalizeChoices(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const out = list.filter((c) => c && Number.isFinite(Number(c.value)))
    .map((c) => ({ value: Number(c.value), label: typeof c.label === 'string' && c.label ? c.label : String(c.value) }));
  return out.length ? out : null;
}
function withParamTexts(list) {
  return list.map((p) => ({ ...p, ...paramTexts(p) }));
}
/** Fallback of meta.levels.params (backend ConstructedLevelsMeta). */
export const LEVELS_PARAMS = Object.freeze(withParamTexts([
  lp('minStrength', 3, 0, 50, false, false, 'Strength a zone needs to be tracked (and for IN_ZONE / DIST_*)', true),
  lp('breakBuffer', 0.5, 0, 5, true, false, 'Breakout / break-down line beyond the zone, ATR multiples', true),
  lp('touchTolerance', 0.25, 0, 5, true, false, 'A retest touch: low within this many ATR above the zone', true),
  lp('maxRetestBars', 15, 1, 500, true, true, 'Bars to wait for a retest (only with baseMinBars 0)', true),
  lp('maxDwellBars', 3, 1, 500, true, true, 'Bars in the zone after the touch before the setup is missed', true),
  lp('confirmMode', 0, 0, 1, true, true, '0 = close above the zone on the touch bar, 1 = close above the touch bar high', true),
  lp('runawayAtr', 1, 0, 10, true, false, 'Runaway entry without a retest this many ATR above the zone (0 = off)', true),
  lp('baseMinBars', 5, 0, 500, true, true, 'Base entry after this many bars holding above the zone (0 = off)', true),
  lp('maxBaseBars', 120, 1, 1000, true, true, 'Safety cap of the base wait', true),
  lp('stopBuffer', 0.5, 0, 5, true, false, 'SETUP_STOP below the zone (or the retest low), ATR multiples', false),
  lp('upgradeStrength', 3, 0, 50, false, false, 'Strength a zone needs to become SUPPORT_LINE', false),
  lp('upgradeMinTouches', 2, 1, 20, true, true, 'Touches a zone needs to become SUPPORT_LINE', false),
  lp('takeProfitStrength', 0, 0, 50, true, false, 'Re-arm only: take-profit of the virtual position, '
    + 'RESISTANCE_REACHED of this strength (0 = none). Keep it equal to your take-profit rule\'s strength', false),
]));
export const LEVELS_DEFAULTS = Object.freeze({
  ...Object.fromEntries(LEVELS_PARAMS.map((p) => [p.name, p.defaultValue])),
  ...LEVELS_FIXED,
  rearm: LEVELS_REARM_DEFAULT,
});
export const LEVEL_EVENTS = Object.freeze(withTexts(LEVEL_EVENT_TEXTS, [
  { name: 'BREAKOUT_UP', needsStrength: false, hint: 'Close crossed above a tracked zone + BreakBuffer x ATR' },
  { name: 'CONFIRMED_RETEST', needsStrength: false, hint: 'Breakout confirmed by a retest of the zone' },
  { name: 'CONFIRMED_RUNAWAY', needsStrength: false, hint: 'Breakout ran away RunawayAtr x ATR above the zone' },
  { name: 'CONFIRMED_BASE', needsStrength: false, hint: 'Breakout held above the zone for BaseMinBars and made a new high' },
  { name: 'CONFIRMED_ANY', needsStrength: false, hint: 'Any of the three confirmations' },
  { name: 'FAILED', needsStrength: false, hint: 'The breakout failed: close back below the zone - BreakBuffer x ATR' },
  { name: 'BROKEN_DOWN', needsStrength: false, hint: 'A confirmed zone broke down' },
  { name: 'SUPPORT_BREAK', needsStrength: true, hint: 'Close below the nearest support zone of this strength - BreakBuffer x ATR' },
  { name: 'RESISTANCE_REACHED', needsStrength: true, hint: 'Close reached the nearest resistance zone of this strength' },
]).map((e) => ({ ...e, inMenu: e.inMenu !== false })));
export const LEVEL_OUTPUTS = Object.freeze(withTexts(LEVEL_OUTPUT_TEXTS, [
  { name: 'IN_ZONE', unit: 'RATIO', hint: '1 when the close is inside a strong zone; outside one the value is "not met" (not 0), so a comparison must hold at 1 (IN_ZONE > 0, IN_ZONE ≥ 1)' },
  { name: 'SETUP_STOP', unit: 'PRICE', hint: 'On a confirmation bar: the setup stop (zone or retest low - StopBuffer x ATR)' },
  { name: 'SETUP_ZONE_LINE', unit: 'PRICE', hint: 'On a confirmation bar: zone low - BreakBuffer x ATR' },
  { name: 'SUPPORT_LINE', unit: 'PRICE', hint: 'Highest strong zone fully below the close - BreakBuffer x ATR (the sticky-support candidate)' },
  { name: 'DIST_SUPPORT_ATR', unit: 'ATR_MULTIPLE', hint: 'Close above the nearest strong support, in ATR' },
  { name: 'DIST_RESISTANCE_ATR', unit: 'ATR_MULTIPLE', hint: 'Nearest strong resistance above the close, in ATR' },
  // stage 4c-1: the lines of a long opened at this close (read them as AT_ENTRY(LEVEL OPEN_*))
  { name: 'OPEN_STOP', unit: 'PRICE', hint: 'Where the stop would be had you bought at this close (long side only): SETUP_STOP on a confirmation bar, else the support zone low - StopBuffer x ATR; read it as AT_ENTRY(LEVEL OPEN_STOP)' },
  { name: 'OPEN_LINE', unit: 'PRICE', hint: 'Where the initial sticky-support line would be had you bought at this close (long side only): SETUP_ZONE_LINE on a confirmation bar, else SUPPORT_LINE; read it as AT_ENTRY(LEVEL OPEN_LINE)' },
]));
export const LEVELS_RUN_TFS = Object.freeze(['DAY', 'WEEK']);
/** Editor UX Stage A: the fixed fields with their plain-English texts (meta.levels.fixedParams). */
export const LEVELS_FIXED_PARAMS = Object.freeze(Object.entries(LEVELS_FIXED).map(([name, value]) => ({
  name, value, label: LEVELS_FIXED_TEXTS[name]?.label || name, tooltip: LEVELS_FIXED_TEXTS[name]?.tooltip || '',
})));
export const DEFAULT_LEVELS_META = Object.freeze({
  events: LEVEL_EVENTS,
  outputs: LEVEL_OUTPUTS,
  params: LEVELS_PARAMS,
  fixed: LEVELS_FIXED,
  runTimeframes: LEVELS_RUN_TFS,
  defaults: LEVELS_DEFAULTS,
  strengthMax: STRENGTH_MAX,
  rearmHint: LEVELS_REARM_HINT,
  fixedParams: LEVELS_FIXED_PARAMS,
  help: helpMap(null, LEVELS_HELP),
});
export const BRICK_KINDS = Object.freeze(withTexts(BRICK_TEXTS, [
  { name: 'WITHIN', form: 'CONDITION', hasX: false, hasLag: false, unit: null, hint: 'PASS when the event passed on one of the last k bars' },
  { name: 'BARS_SINCE', form: 'OPERAND', hasX: false, hasLag: false, unit: 'BARS', hint: 'Bars since the last time the event passed (0 on that bar)' },
  { name: 'AT_LAST', form: 'OPERAND', hasX: true, hasLag: false, unit: null, hint: 'X on the bar the event last passed' },
  { name: 'MAX_SINCE', form: 'OPERAND', hasX: true, hasLag: true, unit: null, hint: 'Highest X after the last event, up to lag bars ago (lag 1: the line as of the previous bar)' },
  { name: 'MIN_SINCE', form: 'OPERAND', hasX: true, hasLag: true, unit: null, hint: 'Lowest X after the last event, up to lag bars ago' },
]));
export const BRICKS_HINT = 'The stop and the sticky support follow the last level confirmation, not your trade: honest alone or '
  + 'with LongBlock partners; for the entries of other strategies wait for stage 4c. Levels runs over the bars of the run window '
  + 'and re-arms the exited zone after a virtual stop / support break, so its events depend on the window start.';
export const DEFAULT_BRICKS_META = Object.freeze({
  kinds: BRICK_KINDS, kMax: WITHIN_BARS_MAX, lagMax: LAG_MAX, hint: BRICKS_HINT, help: helpMap(null, BRICKS_HELP),
});

// ---- position operands (stage 4c-1) ----

/** Fallback of meta.position.kinds (backend ConstructedStrategyServiceImpl.positionMeta). */
export const POSITION_KIND_META = Object.freeze(withTexts(POSITION_TEXTS, [
  { name: 'AT_ENTRY', form: 'AT_ENTRY', hint: 'X on the entry bar of the open long (seeded: the seed bar); "in position" = AT_ENTRY(close) > 0; a % stop = close < AT_ENTRY(close) with tolerance -5' },
  { name: 'MAX_SINCE_ENTRY', form: 'WINDOW', hint: 'The maximum of X over (entry, t - lag], bars without a value skipped; lag 1 = a ratchet as of the previous bar (the entry bar is not in the window)' },
  { name: 'MIN_SINCE_ENTRY', form: 'WINDOW', hint: 'The minimum of X over (entry, t - lag]' },
  // R5 v2 F1: form LEVELS - no X / lag, its own `levels`
  { name: 'STICKY_SINCE_ENTRY', form: 'LEVELS', hint: "The Levels sticky-support exit line of the open long: the entry zone, followed through merges, raised to a higher zone fully below the close, re-priced every bar (max(line, zone low - BreakBuffer x ATR)); the value on bar t is the line after bar t-1. Only `levels`, no X / lag." },
]));
export const POSITION_RUN_TFS = Object.freeze(['DAY', 'WEEK']);
export const POSITION_REFUSED_IN = Object.freeze(['ShortClose']);
export const POSITION_HINT = 'Position operands read the merged position at the start of the bar and have a value only in a LONG '
  + '(FLAT / SHORT: the condition FAILs, NOT_LONG). X is a market operand of the run timeframe: a bar field, an indicator, '
  + 'LEVEL or a brick; STICKY_SINCE_ENTRY has no X (form LEVELS: its own levels). Not in the screener, not inside a brick / WITHIN; a version with one is position dependent.';
export const DEFAULT_POSITION_META = Object.freeze({
  kinds: POSITION_KIND_META, lagMax: LAG_MAX, runTimeframes: POSITION_RUN_TFS, side: 'LONG',
  refusedInRules: POSITION_REFUSED_IN, hint: POSITION_HINT, help: helpMap(null, POSITION_HELP),
});

/** meta.position (PositionMetaDTO) merged over the fallbacks. */
export const normalizePositionMeta = (m) => {
  if (!m || typeof m !== 'object') return DEFAULT_POSITION_META;
  const kinds = mergeByName(m.kinds, POSITION_KIND_META, (k, f) => ({
    name: k.name, form: k.form || f.form || 'AT_ENTRY', hint: k.hint || f.hint || '', ...helpOf(k, f),
  })).filter((k) => POSITION_KINDS.includes(k.name));
  return {
    kinds: kinds.length ? kinds : [...POSITION_KIND_META],
    lagMax: finiteOr(m.lagMax, LAG_MAX),
    runTimeframes: Array.isArray(m.runTimeframes) && m.runTimeframes.length ? m.runTimeframes : [...POSITION_RUN_TFS],
    side: typeof m.side === 'string' && m.side ? m.side : 'LONG',
    refusedInRules: Array.isArray(m.refusedInRules) ? m.refusedInRules.filter((x) => typeof x === 'string') : [...POSITION_REFUSED_IN],
    hint: typeof m.hint === 'string' && m.hint ? m.hint : POSITION_HINT,
    help: helpMap(m.help, POSITION_HELP),
  };
};

/** A meta list of `{name, …}` (or names) merged item by item over the fallback list. */
const mergeByName = (list, fallback, map) => (Array.isArray(list) && list.length
  ? list.map((x) => (typeof x === 'string' ? { name: x } : x)).filter((x) => x && x.name)
    .map((x) => map(x, fallback.find((f) => f.name === x.name) || {}))
  : [...fallback]);

/** meta.levels (LevelsMetaDTO) merged over the fallbacks. */
export const normalizeLevelsMeta = (m) => {
  if (!m || typeof m !== 'object') return DEFAULT_LEVELS_META;
  const events = mergeByName(m.events, LEVEL_EVENTS, (x, f) => ({
    name: x.name,
    hint: x.hint || f.hint || '',
    needsStrength: typeof x.needsStrength === 'boolean' ? x.needsStrength : STRENGTH_EVENTS.includes(x.name),
    ...helpOf(x, f),
    // an old backend sends no flag: every event but BROKEN_DOWN is in the menu (architect §3.2)
    inMenu: typeof x.inMenu === 'boolean' ? x.inMenu : x.name !== 'BROKEN_DOWN',
  }));
  const outputs = mergeByName(m.outputs, LEVEL_OUTPUTS, (x, f) => ({
    name: x.name, unit: x.unit || f.unit || null, hint: x.hint || f.hint || '', ...helpOf(x, f),
  }));
  const params = mergeByName(m.params, LEVELS_PARAMS, (x, f) => ({
    name: x.name,
    defaultValue: finiteOr(x.defaultValue ?? x.default, f.defaultValue),
    min: finiteOr(x.min, f.min),
    max: finiteOr(x.max, f.max),
    minInclusive: typeof x.minInclusive === 'boolean' ? x.minInclusive : f.minInclusive !== false,
    integer: typeof x.integer === 'boolean' ? x.integer : !!f.integer,
    hint: x.hint || f.hint || '',
    inPass: typeof x.inPass === 'boolean' ? x.inPass : !!f.inPass,
    ...paramTexts(x, f),
  })).filter((x) => LEVEL_FIELDS.includes(x.name));
  // a backend without a field (takeProfitStrength before the re-arm round) keeps the fallback entry
  if (params.length) LEVELS_PARAMS.filter((f) => !params.some((x) => x.name === f.name)).forEach((f) => params.push({ ...f }));
  const fixed = { ...LEVELS_FIXED };
  Object.keys(fixed).forEach((k) => { fixed[k] = finiteOr(m.fixed?.[k], fixed[k]); });
  const defaults = { ...LEVELS_DEFAULTS, ...fixed };
  params.forEach((p) => { defaults[p.name] = p.defaultValue; });
  LEVELS_KEYS.forEach((k) => { defaults[k] = finiteOr(m.defaults?.[k], defaults[k]); });
  // re-arm round: the bool default from meta.levels.defaults.rearm, a `rearm` param entry, or `rearmDefault`
  const rearmParam = Array.isArray(m.params) ? m.params.find((x) => x && x.name === 'rearm') : null;
  const rearmRaw = m.defaults?.rearm ?? rearmParam?.defaultValue ?? rearmParam?.default ?? m.rearmDefault;
  defaults.rearm = rearmRaw == null ? LEVELS_REARM_DEFAULT : rearmOf({ rearm: rearmRaw });
  const rearmHint = (typeof m.rearmHint === 'string' && m.rearmHint) || rearmParam?.hint || LEVELS_REARM_HINT;
  return {
    events: events.length ? events : [...LEVEL_EVENTS],
    outputs: outputs.length ? outputs : [...LEVEL_OUTPUTS],
    params: params.length ? params : [...LEVELS_PARAMS],
    fixed,
    runTimeframes: Array.isArray(m.runTimeframes) && m.runTimeframes.length ? m.runTimeframes : [...LEVELS_RUN_TFS],
    defaults,
    strengthMax: finiteOr(m.strengthMax, STRENGTH_MAX),
    rearmHint,
    fixedParams: Object.keys(fixed).map((name) => {
      const x = Array.isArray(m.fixedParams) ? m.fixedParams.find((p) => p && p.name === name) : null;
      const f = LEVELS_FIXED_PARAMS.find((p) => p.name === name) || {};
      return { name, value: finiteOr(x?.value, fixed[name]), ...helpOf(x || { name }, f) };
    }),
    // the Re-arm checkbox caption: the live `rearm` param label (no help key on the backend)
    help: helpMap({ ...(m.help && typeof m.help === 'object' ? m.help : {}), rearmLabel: rearmParam?.label }, LEVELS_HELP),
  };
};

/** meta.bricks (BricksMetaDTO) merged over the fallbacks. */
export const normalizeBricksMeta = (m) => {
  if (!m || typeof m !== 'object') return DEFAULT_BRICKS_META;
  const kinds = mergeByName(m.kinds, BRICK_KINDS, (k, f) => ({
    name: k.name,
    form: k.form || f.form || 'OPERAND',
    hasX: typeof k.hasX === 'boolean' ? k.hasX : !!f.hasX,
    hasLag: typeof k.hasLag === 'boolean' ? k.hasLag : !!f.hasLag,
    unit: k.unit ?? f.unit ?? null,
    hint: k.hint || f.hint || '',
    ...helpOf(k, f),
  }));
  return {
    kinds: kinds.length ? kinds : [...BRICK_KINDS],
    kMax: finiteOr(m.kMax, WITHIN_BARS_MAX),
    lagMax: finiteOr(m.lagMax, LAG_MAX),
    hint: typeof m.hint === 'string' && m.hint ? m.hint : BRICKS_HINT,
    help: helpMap(m.help, BRICKS_HELP),
  };
};

export const DEFAULT_META = Object.freeze({
  signalTypes: SIGNAL_TYPES,
  timeframes: CONSTRUCTED_TFS,
  stateRuleFireRate: STATE_RULE_FIRE_RATE,
  minTradesPerThreshold: MIN_TRADES_PER_THRESHOLD,
  maxRules: MAX_RULES,
  maxConditions: MAX_CONDITIONS,
  indicators: DEFAULT_INDICATORS,
  channel: DEFAULT_CHANNEL_META,
  levels: DEFAULT_LEVELS_META,
  bricks: DEFAULT_BRICKS_META,
  position: DEFAULT_POSITION_META,
  maxAxes: MAX_AXES,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const finiteOr = (v, fallback) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * ChannelMetaDTO.Range `{min, max, minInclusive, maxInclusive, integer}` → `{min, max,
 * minExclusive, maxExclusive, integer}`; a missing flag keeps the fallback's.
 */
const normalizeRange = (r, fallback) => {
  if (!r || typeof r !== 'object') return fallback;
  return {
    min: finiteOr(r.min, fallback.min),
    max: finiteOr(r.max, fallback.max),
    minExclusive: typeof r.minInclusive === 'boolean' ? !r.minInclusive : !!fallback.minExclusive,
    maxExclusive: typeof r.maxInclusive === 'boolean' ? !r.maxInclusive : !!fallback.maxExclusive,
    integer: typeof r.integer === 'boolean' ? r.integer : !!fallback.integer,
  };
};

/**
 * `meta.channel` (ConstructedMetaDTO.channel, stage 4a): `{metrics: [{name, unit, hint}], levels,
 * timeframes, runTimeframes, defaults, ranges}` merged over the static fallbacks. A metric keeps
 * the fallback's label / hint when the backend sends none; TOUCHES_* are never offered (not in B).
 */
export const normalizeChannelMeta = (m) => {
  if (!m || typeof m !== 'object') return DEFAULT_CHANNEL_META;
  const known = new Map(CHANNEL_METRICS.map((x) => [x.name, x]));
  const metrics = Array.isArray(m.metrics) && m.metrics.length
    ? m.metrics.map((x) => {
      const name = typeof x === 'string' ? x : x?.name;
      if (!name || /^TOUCHES_/.test(name)) return null;
      const base = known.get(name) || { name, label: name, unit: null, hint: '', tooltip: '' };
      return {
        ...base, unit: x?.unit || base.unit, hint: x?.hint || base.hint, label: x?.label || base.label,
        tooltip: x?.tooltip || base.tooltip || x?.hint || base.hint || '',
      };
    }).filter(Boolean)
    : [...CHANNEL_METRICS];
  const defaults = { ...CHANNEL_DEFAULTS };
  CHANNEL_KEYS.forEach((k) => { defaults[k] = finiteOr(m.defaults?.[k], defaults[k]); });
  const ranges = Object.fromEntries(CHANNEL_KEYS.map((k) => [k, normalizeRange(m.ranges?.[k], CHANNEL_RANGES[k])]));
  return {
    metrics: metrics.length ? metrics : [...CHANNEL_METRICS],
    levels: Array.isArray(m.levels) && m.levels.length ? m.levels.map(Number).filter((l) => Number.isInteger(l)) : [...CHANNEL_LEVELS],
    timeframes: Array.isArray(m.timeframes) && m.timeframes.length ? m.timeframes : [...CHANNEL_TFS],
    runTimeframes: Array.isArray(m.runTimeframes) && m.runTimeframes.length ? m.runTimeframes : [...CHANNEL_RUN_TFS],
    defaults,
    ranges,
    help: helpMap(m.help, CHANNEL_HELP),
  };
};

/** /meta (partial or absent) merged over the static fallbacks. */
export const normalizeMeta = (m) => ({
  signalTypes: Array.isArray(m?.signalTypes) && m.signalTypes.length
    ? m.signalTypes.filter((t) => SIGNAL_TYPES.includes(t)) : [...SIGNAL_TYPES],
  timeframes: Array.isArray(m?.timeframes) && m.timeframes.length ? m.timeframes : [...CONSTRUCTED_TFS],
  stateRuleFireRate: isNum(m?.stateRuleFireRate) ? m.stateRuleFireRate : STATE_RULE_FIRE_RATE,
  minTradesPerThreshold: isNum(m?.minTradesPerThreshold) ? m.minTradesPerThreshold : MIN_TRADES_PER_THRESHOLD,
  maxRules: isNum(m?.maxRules) ? m.maxRules : MAX_RULES,
  maxConditions: isNum(m?.maxConditions) ? m.maxConditions : MAX_CONDITIONS,
  indicators: Array.isArray(m?.indicators) && m.indicators.length
    ? m.indicators.map(normalizeIndicator).filter(Boolean) : [...DEFAULT_INDICATORS],
  channel: normalizeChannelMeta(m?.channel),
  levels: normalizeLevelsMeta(m?.levels),
  bricks: normalizeBricksMeta(m?.bricks),
  position: normalizePositionMeta(m?.position),
  maxAxes: isNum(m?.maxAxes) && m.maxAxes > 0 ? m.maxAxes : MAX_AXES,
  // editor UX Stage A (new keys only; an old backend → the fallbacks of editorTexts.js)
  operandHelp: normalizeOperandHelp(m?.operandHelp),
  signalTypeHelp: normalizeSignalTypeHelp(m?.signalTypeHelp),
  axisHelp: normalizeAxisHelp(m?.axisHelp),
});

// ---- adapters ----

// ---- axes and links (stage 3a, architect §3.1) ----
//
// Axis (wire and editor): `{name: '$Gap', kind: LENGTH|TOLERANCE|CONST, value, min, max, step,
// lo?, hi?, note?}`. Link (wire): `links: {'right.n': {terms: [{sign: 1, axis: '$MaLength'}]}}`;
// in the editor a link is the terms array `[{sign: 1|-1, axis}]`. Both fields are left out of a
// definition without axes (NON_EMPTY on the backend), so a stage 0-2 strategy round-trips as is.

const numOr = (v, fallback = null) => (v === '' || v == null || !Number.isFinite(Number(v)) ? fallback : Number(v));

const toAxisDTO = (a) => {
  const out = {
    name: (a.name || '').trim(),
    kind: a.kind,
    value: numOr(a.value),
    min: numOr(a.min, numOr(a.value)),
    max: numOr(a.max, numOr(a.value)),
    step: numOr(a.step, a.kind === 'LENGTH' ? 1 : 0.5),
  };
  if (numOr(a.lo) != null) out.lo = numOr(a.lo);
  if (numOr(a.hi) != null) out.hi = numOr(a.hi);
  if (a.note) out.note = a.note;
  return out;
};

export const fromAxisDTO = (a) => ({
  name: a?.name || '',
  kind: AXIS_KINDS.includes(a?.kind) ? a.kind : 'LENGTH',
  value: a?.value ?? '',
  min: a?.min ?? a?.value ?? '',
  max: a?.max ?? a?.value ?? '',
  step: a?.step ?? (a?.kind === 'LENGTH' ? 1 : 0.5),
  lo: a?.lo ?? '',
  hi: a?.hi ?? '',
  note: a?.note || '',
});

// ---- axis constraints (stage 3b-2) ----
// Wire and editor: `{left, op, right}`. Left out of a definition without constraints (NON_EMPTY on
// the backend). PUT: a missing `constraints` keeps the stored ones, `[]` removes them - see
// toConstructedRequest.

/** Wire AxisConstraint → editor constraint (an unknown op is kept as is: the validator flags it). */
export const fromConstraintDTO = (c) => ({
  left: typeof c?.left === 'string' ? c.left : '',
  op: typeof c?.op === 'string' ? c.op : '',
  right: typeof c?.right === 'string' ? c.right : '',
});

const toConstraintDTO = (c) => ({ left: (c.left || '').trim(), op: c.op, right: (c.right || '').trim() });

/** Wire LinkExpr (`{terms}` or a bare terms array) → editor terms `[{sign, axis}]`, null when empty. */
const fromLinkExpr = (x) => {
  const terms = Array.isArray(x) ? x : Array.isArray(x?.terms) ? x.terms : [];
  const out = terms.filter((t) => t && typeof t.axis === 'string' && t.axis)
    .map((t) => ({ sign: Number(t.sign) < 0 ? -1 : 1, axis: t.axis }));
  return out.length ? out : null;
};

// ---- threshold paths (stage 4b, architect §4.2; backend StagedThresholds) ----

// stage 4c-1: a position operand's X adds one `x.` (`right.x.levels.*`, a brick X: `right.x.x.levels.*`, `right.x.a.levels.*`)
const LEVELS_PATH_RE = /^(?:(?:(?:left|right)(?:\.x)?(?:\.[xa])?|of)\.)?levels\.([A-Za-z]+)$/;
/** The X length paths: a brick's / position operand's X (`right.x.n`), a brick X of a position operand (`right.x.x.n`). */
const X_LENGTH_PATHS = Object.freeze(['left.x.n', 'right.x.n', 'left.x.x.n', 'right.x.x.n']);

/**
 * The axis kind a threshold suffix links to, null for an unknown suffix: the stage 3a / 4a suffixes
 * (LINK_SUFFIX_KIND), `strength` / `bars` / `of.strength` / `[P.]levels.<field>` → CONST,
 * `left.x.n` / `right.x.n` (a brick's X length; 4c-1 also a position operand's X, `P.x.x.n` a brick X of one) → LENGTH.
 */
export const linkSuffixKind = (suffix) => {
  if (typeof suffix !== 'string') return null;
  if (LINK_SUFFIX_KIND[suffix]) return LINK_SUFFIX_KIND[suffix];
  if (suffix === 'strength' || suffix === 'bars' || suffix === 'of.strength') return 'CONST';
  if (X_LENGTH_PATHS.includes(suffix)) return 'LENGTH';
  const m = LEVELS_PATH_RE.exec(suffix);
  return m && LEVEL_FIELDS.includes(m[1]) ? 'CONST' : null;
};

/** `right.const` → the operand's `value`; every other path segment is the editor object's key. */
const keyOf = (seg, last) => (seg === 'const' && last ? 'value' : seg);

/** The editor value at a threshold path (`right.x.levels.stopBuffer`, `of.strength`, `right.const`). */
export const getAtPath = (node, path) => {
  const parts = typeof path === 'string' ? path.split('.') : path;
  let n = node;
  for (let i = 0; i < parts.length; i += 1) {
    if (n == null || typeof n !== 'object') return undefined;
    n = n[keyOf(parts[i], i === parts.length - 1)];
  }
  return n;
};

/** A copy of `node` with `fn(old)` at `path`; unchanged when a node on the way is missing. */
export const updateAtPath = (node, path, fn) => {
  const parts = typeof path === 'string' ? path.split('.') : path;
  if (!node || typeof node !== 'object' || !parts.length) return node;
  const [h, ...rest] = parts;
  const key = keyOf(h, rest.length === 0);
  if (!rest.length) return { ...node, [key]: fn(node[key]) };
  if (!node[key] || typeof node[key] !== 'object') return node;
  return { ...node, [key]: updateAtPath(node[key], rest, fn) };
};

/** A stage 4b condition type (LEVEL_EVENT / WITHIN). */
export const isLevelEvent = (c) => c?.type === 'LEVEL_EVENT';
export const isWithin = (c) => c?.type === 'WITHIN';
export const eventNeedsStrength = (event) => STRENGTH_EVENTS.includes(event);

/**
 * Every Levels spec inside a condition: `[{prefix, linkable, path}]` in the order of the condition
 * (prefix `''`, `of.`, `left.`, `right.x.`, `right.a.`, …; its spec is at `prefix + 'levels'`).
 * `linkable` = the backend accepts links on its fields (StagedThresholds.paths): a LEVEL_EVENT at
 * the top or as WITHIN's anchor, a LEVEL side, a brick's LEVEL X and LEVEL_EVENT anchor - not a
 * Levels operand inside a nested comparison.
 */
export const levelsOccurrences = (condition) => {
  const out = [];
  const walkCond = (c, prefix, linkable) => {
    if (!c || typeof c !== 'object') return;
    if (isLevelEvent(c)) out.push({ prefix, linkable });
    else if (isWithin(c)) walkCond(c.of, `${prefix}of.`, linkable && isLevelEvent(c.of));
    else if (c.type === 'COMPARE') ['left', 'right'].forEach((s) => walkOp(c[s], `${prefix}${s}.`, linkable));
  };
  const walkOp = (o, prefix, linkable) => {
    if (!o) return;
    if (o.kind === LEVEL_KIND) out.push({ prefix, linkable });
    else if (ANCHORED_KINDS.includes(o.kind)) {
      walkOp(o.x, `${prefix}x.`, linkable);
      walkCond(o.a, `${prefix}a.`, linkable && isLevelEvent(o.a));
    } else if (o.kind === 'BARS_SINCE') walkCond(o.a, `${prefix}a.`, linkable && isLevelEvent(o.a));
    else if (POSITION_LEVELS_KINDS.includes(o.kind)) out.push({ prefix, linkable }); // R5 v2 F1: its own levels
    else if (POSITION_KINDS.includes(o.kind)) walkOp(o.x, `${prefix}x.`, linkable); // stage 4c-1
  };
  walkCond(condition, '', true);
  return out.map((x) => ({ ...x, path: `${x.prefix}levels` }));
};

/** true when the condition (or anything nested in it) is a stage 4b form: Levels or a brick. */
export const isStagedCondition = (c) => {
  if (!c) return false;
  if (isLevelEvent(c) || isWithin(c)) return true;
  return c.type === 'COMPARE' && (isStagedOperand(c.left) || isStagedOperand(c.right));
};

/** Wire `links` map → editor `{suffix: terms}` (only the known suffixes). */
export const fromLinksDTO = (links) => {
  const out = {};
  if (links && typeof links === 'object') {
    Object.entries(links).forEach(([suffix, x]) => {
      if (!linkSuffixKind(suffix)) return;
      const terms = fromLinkExpr(x);
      if (terms) out[suffix] = terms;
    });
  }
  return out;
};

const toLinksDTO = (links) => {
  const entries = Object.entries(links || {}).filter(([, terms]) => Array.isArray(terms) && terms.length);
  if (!entries.length) return null;
  return Object.fromEntries(entries.map(([suffix, terms]) => [suffix, {
    terms: terms.map((t) => ({ sign: t.sign < 0 ? -1 : 1, axis: t.axis })),
  }]));
};

/** Value of a link at the axes' defaults: `Σ sign · axis.value`; null when an axis is unknown / empty. */
export const linkValue = (terms, axes) => {
  if (!Array.isArray(terms) || !terms.length) return null;
  let sum = 0;
  for (const t of terms) {
    const a = (axes || []).find((x) => x.name === t.axis);
    const v = a ? Number(a.value) : NaN;
    if (!a || a.value === '' || a.value == null || !Number.isFinite(v)) return null;
    sum += (t.sign < 0 ? -1 : 1) * v;
  }
  return sum;
};

/**
 * A copy of the condition with the threshold `suffix` set to `v` (the literal a link writes, or the
 * value an unlinked threshold keeps). COMPARE: `tolerancePct`, `left.n`, `right.n`, `right.const`;
 * CHANNEL_METRIC (stage 4a): `min`, `max`. Any other suffix → the condition unchanged.
 */
export const setThreshold = (condition, suffix, v) => {
  if (!condition) return condition;
  if (condition.type === 'CHANNEL_METRIC') {
    return suffix === 'min' || suffix === 'max' ? { ...condition, [suffix]: v } : condition;
  }
  if (!isStagedCondition(condition)) {
    if (suffix === 'tolerancePct') return { ...condition, tolerancePct: v };
    if (suffix === 'left.n') return { ...condition, left: { ...condition.left, n: v } };
    if (suffix === 'right.n') return { ...condition, right: { ...condition.right, n: v } };
    if (suffix === 'right.const') return { ...condition, right: { ...condition.right, value: v } };
    return condition;
  }
  // stage 4b: any path of the condition (strength, bars, of.strength, [P.]levels.<f>, P.x.n, …)
  return linkSuffixKind(suffix) ? updateAtPath(condition, suffix, () => v) : condition;
};

/** The literal of a threshold (the value a new axis starts from); NaN when it has none. */
export const thresholdLiteral = (condition, suffix) => {
  if (suffix === 'tolerancePct') return Number(condition?.tolerancePct) || 0;
  const v = getAtPath(condition, suffix);
  return v === '' || v == null ? NaN : Number(v);
};

/**
 * The condition with every linked threshold replaced by its value at the axes' defaults. The
 * backend overwrites the literal the same way on save (§3.1), so the literal sent equals what the
 * preview / import will see. Unknown axis → the literal is kept.
 */
export const applyLinks = (condition, links, axes) => {
  if (!condition || !['COMPARE', 'CHANNEL_METRIC', 'LEVEL_EVENT', 'WITHIN'].includes(condition.type)
    || !links || !Object.keys(links).length) return condition;
  let c = condition;
  Object.entries(links).forEach(([suffix, terms]) => {
    const v = linkValue(terms, axes);
    if (v != null) c = setThreshold(c, suffix, v);
  });
  return c;
};

const hasBound = (v) => v !== '' && v != null && Number.isFinite(Number(v));

/**
 * The suffixes a condition can carry a link on (the length of a side whose kind has one - SMA,
 * ATR, RSI, … by the descriptor - a constant, the tolerance). A channel condition (stage 4a): the
 * bounds `min` / `max` it has - a cleared bound drops its link (pruneLinks).
 */
export const linkableSuffixes = (condition) => {
  if (condition?.type === 'CHANNEL_METRIC') return ['min', 'max'].filter((s) => hasBound(condition[s]));
  const levelPaths = () => levelsOccurrences(condition).filter((o) => o.linkable)
    .flatMap((o) => LEVEL_FIELDS.map((f) => `${o.prefix}levels.${f}`));
  // stage 4b: StagedThresholds.paths - the strength of a SUPPORT_BREAK / RESISTANCE_REACHED, the
  // bars of WITHIN (and its LEVEL_EVENT anchor's strength), every linkable Levels field, a brick X's length
  if (isLevelEvent(condition)) {
    return [...(eventNeedsStrength(condition.event) ? ['strength'] : []), ...levelPaths()];
  }
  if (isWithin(condition)) {
    const of = condition.of;
    return ['bars', ...(isLevelEvent(of) && eventNeedsStrength(of.event) ? ['of.strength'] : []), ...levelPaths()];
  }
  if (!condition || condition.type !== 'COMPARE') return [];
  const out = [];
  if (hasLength(condition.left?.kind, condition.left?.n)) out.push('left.n');
  if (hasLength(condition.right?.kind, condition.right?.n)) out.push('right.n');
  if (condition.right?.kind === 'CONST') out.push('right.const');
  out.push('tolerancePct');
  ['left', 'right'].forEach((s) => {
    const side = condition[s];
    const x = side?.x;
    if ((ANCHORED_KINDS.includes(side?.kind) || POSITION_KINDS.includes(side?.kind)) && x && x.kind !== LEVEL_KIND
      && hasLength(x.kind, x.n)) out.push(`${s}.x.n`);
    // stage 4c-1: a brick X of a position operand - its own X length
    const xx = x?.x;
    if (POSITION_KINDS.includes(side?.kind) && ANCHORED_KINDS.includes(x?.kind) && xx && xx.kind !== LEVEL_KIND
      && hasLength(xx.kind, xx.n)) out.push(`${s}.x.x.n`);
  });
  out.push(...levelPaths());
  return out;
};

/** Links of a condition without the ones its operands no longer have (e.g. the right side became CONST). */
export const pruneLinks = (condition, links) => {
  const allowed = new Set(linkableSuffixes(condition));
  return Object.fromEntries(Object.entries(links || {})
    .filter(([s, t]) => allowed.has(s) && Array.isArray(t) && t.length));
};

// ---- stage 4b wire shapes (nested `levels` / `of` / `x` / `a`) ----

/** Editor LevelsSpec → LevelsSpecDTO (all 15 numeric fields, a blank one as null = the default; `rearm` always explicit). */
const toLevelsDTO = (s) => ({
  ...Object.fromEntries(LEVELS_KEYS.map((k) => [k, numOr(s?.[k])])),
  rearm: rearmOf(s),
});

/**
 * LevelsSpecDTO (partial or absent) → the editor spec, every field filled from the defaults. A
 * stored spec without `rearm` (a pre-re-arm version) reads as the default (on, OR2).
 */
export const fromLevelsDTO = (s, defaults = LEVELS_DEFAULTS) => ({
  ...Object.fromEntries(LEVELS_KEYS.map((k) => [k, s?.[k] != null && s[k] !== '' ? s[k] : defaults[k]])),
  rearm: rearmOf(s, defaults.rearm),
});

/** Editor operand → OperandDTO, the stage 4b kinds included. */
const toAnyOperandDTO = (o) => {
  if (!o) return null;
  if (o.kind === LEVEL_KIND) {
    return { kind: LEVEL_KIND, tf: o.tf || RUN_TF, offset: Number(o.offset) || 0, output: o.output, levels: toLevelsDTO(o.levels) };
  }
  if (ANCHORED_KINDS.includes(o.kind)) {
    const out = { kind: o.kind, tf: o.tf || RUN_TF, offset: Number(o.offset) || 0, x: toAnyOperandDTO(o.x), a: toAnyConditionDTO(o.a) };
    if (o.kind !== 'AT_LAST') out.lag = numOr(o.lag, 0);
    return out;
  }
  if (o.kind === 'BARS_SINCE') {
    return { kind: o.kind, tf: o.tf || RUN_TF, offset: Number(o.offset) || 0, a: toAnyConditionDTO(o.a) };
  }
  if (POSITION_LEVELS_KINDS.includes(o.kind)) { // R5 v2 F1: no X / lag / output, its own levels
    return { kind: o.kind, tf: o.tf || RUN_TF, offset: Number(o.offset) || 0, levels: toLevelsDTO(o.levels) };
  }
  if (POSITION_KINDS.includes(o.kind)) { // stage 4c-1: no anchor, `lag` only on the windows
    const out = { kind: o.kind, tf: o.tf || RUN_TF, offset: Number(o.offset) || 0, x: toAnyOperandDTO(o.x) };
    if (POSITION_WINDOW_KINDS.includes(o.kind)) out.lag = numOr(o.lag, 0);
    return out;
  }
  return toOperand(o);
};

/** Editor condition → FilterConditionDTO, LEVEL_EVENT / WITHIN / Levels and brick sides included. */
export const toAnyConditionDTO = (c) => {
  if (!c) return null;
  if (isLevelEvent(c)) {
    const out = { type: 'LEVEL_EVENT', tf: c.tf || RUN_TF, event: c.event };
    if (eventNeedsStrength(c.event)) out.strength = numOr(c.strength);
    out.levels = toLevelsDTO(c.levels);
    return out;
  }
  if (isWithin(c)) return { type: 'WITHIN', tf: c.tf || RUN_TF, bars: numOr(c.bars), of: toAnyConditionDTO(c.of) };
  const out = toConditionDTO(c);
  if (c.type === 'COMPARE') {
    if (isStagedOperand(c.left)) out.left = toAnyOperandDTO(c.left);
    if (isStagedOperand(c.right)) out.right = toAnyOperandDTO(c.right);
  }
  return out;
};

const isStagedKind = (k) => k === LEVEL_KIND || BRICK_OPERAND_KINDS.includes(k) || POSITION_KINDS.includes(k);

/** OperandDTO → editor operand, the stage 4b kinds included. */
const fromAnyOperandDTO = (o) => {
  if (!o) return null;
  if (!isStagedKind(o.kind)) return fromOperand(o);
  const base = { kind: o.kind, n: null, tf: o.tf || RUN_TF, offset: o.offset ?? 0, value: '' };
  if (o.kind === LEVEL_KIND) return { ...base, output: o.output || 'SUPPORT_LINE', levels: fromLevelsDTO(o.levels) };
  if (POSITION_LEVELS_KINDS.includes(o.kind)) return { ...base, levels: fromLevelsDTO(o.levels), lag: '' }; // R5 v2 F1
  if (POSITION_KINDS.includes(o.kind)) {
    return { ...base, x: fromAnyOperandDTO(o.x), lag: POSITION_WINDOW_KINDS.includes(o.kind) ? (o.lag ?? 0) : '' };
  }
  const out = { ...base, a: fromAnyConditionDTO(o.a) };
  if (ANCHORED_KINDS.includes(o.kind)) {
    out.x = fromAnyOperandDTO(o.x);
    out.lag = o.kind === 'AT_LAST' ? '' : (o.lag ?? 0);
  }
  return out;
};

/** FilterConditionDTO → editor condition, LEVEL_EVENT / WITHIN / Levels and brick sides included. */
export const fromAnyConditionDTO = (c) => {
  if (c?.type === 'LEVEL_EVENT') {
    return { type: 'LEVEL_EVENT', tf: c.tf || RUN_TF, event: c.event || 'CONFIRMED_ANY', strength: c.strength ?? '', levels: fromLevelsDTO(c.levels) };
  }
  if (c?.type === 'WITHIN') return { type: 'WITHIN', tf: c.tf || RUN_TF, bars: c.bars ?? '', of: fromAnyConditionDTO(c.of) };
  const out = fromConditionDTO(c);
  if (out.type === 'COMPARE') {
    if (isStagedKind(c?.left?.kind)) out.left = fromAnyOperandDTO(c.left);
    if (isStagedKind(c?.right?.kind)) out.right = fromAnyOperandDTO(c.right);
  }
  return out;
};

/**
 * Editor rule `{id, signalType, note, conditions: [{id, condition: editorCondition, links}]}` →
 * RuleDTO `{id?, signalType, note?, conditions: [{id?, condition: FilterConditionDTO, links?}]}`.
 * Ids are the rule's / condition's PERMANENT ids (threshold names R<id>.C<id>.* depend on them):
 * kept as they came from the backend, null for a new one (the backend assigns it). `axes` = the
 * draft's axes (linked literals are written at the axes' defaults).
 */
export const toRuleRequest = (rule, axes = []) => ({
  id: rule.id ?? null,
  signalType: rule.signalType,
  note: rule.note ? rule.note : null,
  conditions: (rule.conditions || []).map((c) => {
    const links = pruneLinks(c.condition, c.links);
    const out = { id: c.id ?? null, condition: toAnyConditionDTO(applyLinks(c.condition, links, axes)) };
    const wire = toLinksDTO(links);
    if (wire) out.links = wire;
    return out;
  }),
});

/**
 * Editor draft → the definition `{rules[], axes?[], constraints?[]}` (axes / constraints only when
 * there are any; also the unsaved definition of a preview).
 */
export const toDefinitionRequest = (draft) => {
  const out = { rules: (draft.rules || []).map((r) => toRuleRequest(r, draft.axes || [])) };
  if ((draft.axes || []).length) out.axes = draft.axes.map(toAxisDTO);
  if ((draft.constraints || []).length) out.constraints = draft.constraints.map(toConstraintDTO);
  return out;
};

/**
 * Editor draft → ConstructedStrategyRequest `{name, note, rules[], axes?[], constraints?[]}`.
 * `saved` = the stored version open in the editor (PUT). The PUT semantics of the backend: a
 * missing `constraints` KEEPS the stored ones, so the full list is always sent when there is one,
 * and `[]` is sent only when the user removed every constraint of the stored version.
 */
export const toConstructedRequest = (draft, saved = null) => {
  const out = {
    name: (draft.name || '').trim(),
    note: draft.note ? draft.note : null,
    ...toDefinitionRequest(draft),
  };
  if (!out.constraints && draft.id != null && (saved?.constraints || []).length) out.constraints = [];
  return out;
};

/** RuleDTO → editor rule. */
export const fromRuleDTO = (r) => ({
  id: r?.id ?? null,
  signalType: SIGNAL_TYPES.includes(r?.signalType) ? r.signalType : 'LongOpen',
  note: r?.note || '',
  conditions: (Array.isArray(r?.conditions) ? r.conditions : []).map((c) => ({
    id: c?.id ?? null,
    // RuleConditionDTO {id, condition, links?}; a bare FilterConditionDTO is accepted too
    condition: fromAnyConditionDTO(c?.condition ?? c),
    links: fromLinksDTO(c?.links),
  })),
});

/** Rules / axes of a DTO: top level, or nested in `definition` (TemplateDTO). */
const rulesOf = (d) => (Array.isArray(d?.rules) ? d.rules : Array.isArray(d?.definition?.rules) ? d.definition.rules : []);
const axesOf = (d) => (Array.isArray(d?.axes) ? d.axes : Array.isArray(d?.definition?.axes) ? d.definition.axes : [])
  .map(fromAxisDTO);
const constraintsOf = (d) => (Array.isArray(d?.constraints) ? d.constraints
  : Array.isArray(d?.definition?.constraints) ? d.definition.constraints : []).filter(Boolean).map(fromConstraintDTO);

/** UsageDTO `{version, ticker, timeframe, backtests, optimizations, combinations, lastRunAt}`. */
const normalizeUsage = (u) => ({
  version: u?.version ?? null,
  ticker: u?.ticker ?? '',
  timeframe: u?.timeframe ?? u?.timeFrame ?? '',
  backtests: isNum(u?.backtests) ? u.backtests : 0,
  optimizations: isNum(u?.optimizations) ? u.optimizations : 0,
  combinations: isNum(u?.combinations) ? u.combinations : 0,
  lastRunAt: u?.lastRunAt ?? null,
});

/**
 * ConstructedStrategyDTO `{id, name, note, version, key, rules, axes?, constraints?, templateId?, deleted,
 * createdAt, updatedAt, usage[], params[], versionChanged?}` → `{..., rules: editorRule[],
 * axes: editorAxis[], usage: normalized[]}`.
 */
export const fromConstructedDTO = (d) => {
  if (!d) return null;
  return {
    id: d.id ?? null,
    name: d.name || '',
    note: d.note || '',
    version: d.version ?? null,
    key: d.key ?? (d.id != null && d.version != null ? `Constructed:${d.id}@${d.version}` : null),
    rules: rulesOf(d).map(fromRuleDTO),
    axes: axesOf(d),
    constraints: constraintsOf(d),
    templateId: d.templateId ?? null,
    deleted: d.deleted === true,
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
    usage: (Array.isArray(d.usage) ? d.usage : []).map(normalizeUsage),
    params: Array.isArray(d.params) ? d.params : [],
    versionChanged: typeof d.versionChanged === 'boolean' ? d.versionChanged : null,
    // stage 4c-1: a version with a position operand runs as a position-dependent strategy (derived, never stored)
    positionDependent: d.positionDependent === true,
  };
};

/**
 * ConstructedStrategySummaryDTO `{id, name, version, key, ruleCount, signalTypes[], updatedAt, templateId?,
 * unreadable?}`. `unreadable` (stage 3b-0): the backend's reason why it cannot read the current
 * version (saved by a newer server); null when readable. Such a row can only be deleted.
 */
const normalizeSummary = (s) => ({
  id: s?.id ?? null,
  name: s?.name || '',
  version: s?.version ?? null,
  key: s?.key ?? (s?.id != null && s?.version != null ? `Constructed:${s.id}@${s.version}` : null),
  ruleCount: isNum(s?.ruleCount) ? s.ruleCount : (Array.isArray(s?.rules) ? s.rules.length : null),
  signalTypes: Array.isArray(s?.signalTypes) ? s.signalTypes : [],
  updatedAt: s?.updatedAt ?? null,
  templateId: s?.templateId ?? null,
  unreadable: typeof s?.unreadable === 'string' && s.unreadable ? s.unreadable : null,
  positionDependent: s?.positionDependent === true, // stage 4c-1
});

/** TemplateDTO `{templateId, name, description, definition: {rules[], axes[], constraints?[]}}` → editor shapes. */
export const normalizeTemplate = (t) => ({
  templateId: t?.templateId ?? null,
  name: t?.name || t?.templateId || '',
  description: t?.description || '',
  rules: rulesOf(t).map(fromRuleDTO),
  axes: axesOf(t),
  constraints: constraintsOf(t),
  // stage 4b: create options (`level-breakout-bricks`: takeProfit / regime); the definition is the no-option variant
  options: (Array.isArray(t?.options) ? t.options : [])
    .filter((o) => o && typeof o.key === 'string' && o.key)
    // re-arm round: `defaultValue` (bool) = the option's initial state in the dialog (`rearm` on)
    .map((o) => ({ key: o.key, label: o.label || o.key, hint: o.hint || '', defaultValue: o.defaultValue === true })),
});

/** ReferencesDTO `{cases[{id,name,version}], watches[{id,name,status}], profiles[{ticker,timeframe,strategyKey}]}`. */
export const normalizeReferences = (r) => ({
  cases: Array.isArray(r?.cases) ? r.cases : [],
  watches: Array.isArray(r?.watches) ? r.watches : [],
  profiles: Array.isArray(r?.profiles) ? r.profiles : [],
});

export const referenceCount = (r) => (r ? r.cases.length + r.watches.length + r.profiles.length : 0);

const countMap = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([, n]) => isNum(n) && n > 0))
  : {});

/**
 * PreviewDTO `{ticker, timeFrame, bars, prices[], signals[], rules[]: {ruleId, signalType, label,
 * fired, failed, notEvaluated, notEvaluatedByReason{}, firedDates[], stateRule, warnings[]},
 * sweepThresholds, warnings[], backtest?}` → the same, every field defaulted.
 * `backtest` (screener architect_constructor_preview_backtest_v1.md §2.4): the Backtest's
 * StrategyResultDTO of this strategy alone on the preview window, sent without
 * `chartDataDTO.prices` (the bars are the envelope's `prices`): they are re-attached here, in one
 * place. An older backend sends no `backtest` → null (the preview renders its signals-only view).
 */
export const normalizePreview = (p) => {
  if (!p) return null;
  const prices = Array.isArray(p.prices) ? p.prices : [];
  const bars = isNum(p.bars) ? p.bars : prices.length;
  return {
    ticker: p.ticker ?? '',
    timeFrame: p.timeFrame ?? '',
    bars,
    prices,
    signals: (Array.isArray(p.signals) ? p.signals : [])
      .filter((s) => s && s.date && s.type)
      .map((s) => ({ date: s.date, price: Number(s.price), type: s.type, comment: s.comment ?? null })),
    rules: (Array.isArray(p.rules) ? p.rules : []).map((r) => ({
      ruleId: r?.ruleId ?? r?.id ?? null,
      signalType: r?.signalType ?? null,
      label: r?.label ?? '',
      fired: isNum(r?.fired) ? r.fired : 0,
      failed: isNum(r?.failed) ? r.failed : 0,
      notEvaluated: isNum(r?.notEvaluated) ? r.notEvaluated : 0,
      notEvaluatedByReason: countMap(r?.notEvaluatedByReason),
      firedDates: Array.isArray(r?.firedDates) ? r.firedDates : [],
      stateRule: r?.stateRule === true,
      // Stage 3a CompiledRule.linkNotes ("$Gap = 2"): the label already carries them as "(…)";
      // kept for a backend that sends them apart (map by suffix or a list)
      linkNotes: Array.isArray(r?.linkNotes) ? r.linkNotes.filter((x) => typeof x === 'string')
        : (r?.linkNotes && typeof r.linkNotes === 'object'
          ? Object.values(r.linkNotes).filter((x) => typeof x === 'string') : []),
      warnings: (Array.isArray(r?.warnings) ? r.warnings : []).filter((w) => typeof w === 'string' && w),
    })),
    sweepThresholds: isNum(p.sweepThresholds) ? p.sweepThresholds : 0,
    warnings: (Array.isArray(p.warnings) ? p.warnings : []).filter((w) => typeof w === 'string' && w),
    // re-arm round (m7): one line per Levels spec, `Levels[L2]: MinStrength 2, StopBuffer 1, re-arm (TP 4)`
    levelsLegend: (Array.isArray(p.levelsLegend) ? p.levelsLegend : []).filter((x) => typeof x === 'string' && x),
    // stage 4c-1: the previewed version reads the trade (its `warnings` carry the POSITION_SOLO note)
    positionDependent: p.positionDependent === true,
    backtest: normalizePreviewBacktest(p.backtest, prices),
  };
};

/** PreviewDTO.backtest → the StrategyResultDTO the Backtest views take (prices re-attached), or null. */
export const normalizePreviewBacktest = (bt, prices) => {
  if (!bt || typeof bt !== 'object') return null;
  const chart = bt.chartDataDTO && typeof bt.chartDataDTO === 'object' ? bt.chartDataDTO : {};
  return {
    ...bt,
    warnings: (Array.isArray(bt.warnings) ? bt.warnings : []).filter((w) => typeof w === 'string' && w),
    chartDataDTO: {
      ...chart,
      prices: Array.isArray(chart.prices) && chart.prices.length ? chart.prices : (prices || []),
      signals: Array.isArray(chart.signals) ? chart.signals : [],
    },
  };
};

/**
 * Preview dates: the StrategiesConfigDTO convention (LocalDateTime, start of the first day, end of
 * the last one). `day` is 'YYYY-MM-DD'.
 */
const previewStart = (day) => `${day}T00:00:00`;
const previewEnd = (day) => `${day}T23:59:59`;

// ---- endpoints ----

/**
 * GET /meta → normalized meta (fallbacks on 404 / a network failure are the caller's choice). The
 * indicator descriptors are registered in the operand catalog (indicatorCatalog.js, stage 3b F1).
 */
export const getConstructedMeta = async () => {
  const res = await apiRequest(`${API_BASE_URL}/meta`, undefined, 'Loading constructor metadata failed');
  const raw = await readJson(res);
  const meta = normalizeMeta(raw);
  setIndicatorCatalog({ indicators: meta.indicators });
  setLevelOutputUnits(meta.levels.outputs);
  // the raw meta lists, as getScreenerMeta registers them: both tabs register the same live texts
  setEditorHelp({ operandHelp: raw?.operandHelp, signalTypeHelp: raw?.signalTypeHelp, axisHelp: raw?.axisHelp });
  return meta;
};

/** GET / → summaries of the non-deleted strategies, newest first. */
export const listConstructed = async () => {
  const res = await apiRequest(`${API_BASE_URL}`, undefined, 'Loading constructed strategies failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data.map(normalizeSummary) : [];
};

/** Error code of a version this server cannot read: 409 on get / versions / PUT, 400 on run paths. */
export const UNREADABLE_CODE = 'CONSTRUCTED_VERSION_UNREADABLE';

/**
 * GET /{id} → the current version with usage[] and params[]; 404 (also for a deleted one); 409
 * UNREADABLE_CODE when this server cannot read the version.
 */
export const getConstructed = async (id) => {
  const res = await apiRequest(`${API_BASE_URL}/${enc(id)}`, undefined, 'Loading the constructed strategy failed');
  return fromConstructedDTO(await readJson(res));
};

/** GET /{id}/versions/{v} → that version (works for a deleted strategy too); 404. */
export const getConstructedVersion = async (id, version) => {
  const res = await apiRequest(`${API_BASE_URL}/${enc(id)}/versions/${enc(version)}`, undefined,
    'Loading the strategy version failed');
  return fromConstructedDTO(await readJson(res));
};

// A version `id@v` never changes once saved, so its DTO is fetched once per page load (a failure is
// not kept: the next call asks again).
const versionCache = new Map();

/** getConstructedVersion through a per-page cache (immutable versions; failures are not cached). */
export const getConstructedVersionCached = (id, version) => {
  const k = `${id}@${version}`;
  if (!versionCache.has(k)) {
    versionCache.set(k, getConstructedVersion(id, version).catch((err) => {
      versionCache.delete(k);
      throw err;
    }));
  }
  return versionCache.get(k);
};

/** POST / ConstructedStrategyRequest → 201 DTO; 409 NAME_EXISTS; 400. */
export const createConstructed = async (request) => {
  const res = await apiRequest(`${API_BASE_URL}`, { method: 'POST', ...jsonBody(request) }, 'Saving the strategy failed');
  return fromConstructedDTO(await readJson(res));
};

/** PUT /{id} → 200 DTO + versionChanged; 404 / 409 / 400. */
export const updateConstructed = async (id, request) => {
  const res = await apiRequest(`${API_BASE_URL}/${enc(id)}`, { method: 'PUT', ...jsonBody(request) }, 'Saving the strategy failed');
  return fromConstructedDTO(await readJson(res));
};

/** GET /{id}/references → normalized ReferencesDTO. */
export const getConstructedReferences = async (id) => {
  const res = await apiRequest(`${API_BASE_URL}/${enc(id)}/references`, undefined, 'Loading references failed');
  return normalizeReferences(await readJson(res));
};

/**
 * DELETE /{id}[?confirm=true] → 204 (soft delete). Without confirm and with references the backend
 * answers 409 `{code: 'HAS_REFERENCES', references}`: returned as `{blocked: true, references}`.
 */
export const deleteConstructed = async (id, confirm = false) => {
  try {
    await apiRequest(`${API_BASE_URL}/${enc(id)}${confirm ? '?confirm=true' : ''}`, { method: 'DELETE' },
      'Deleting the strategy failed');
    return { blocked: false, references: null };
  } catch (err) {
    const code = err.body?.code || err.code;
    if (err.status === 409 && (code === 'HAS_REFERENCES' || err.body?.references)) {
      return { blocked: true, references: normalizeReferences(err.body?.references) };
    }
    throw err;
  }
};

/**
 * POST /preview → normalized PreviewDTO; 400 (validation / no SMA / wrong TF).
 * @param {{definition?: Object, key?: string, ticker: string, timeFrame: string,
 *   startDay: string, endDay: string, longOnly?: boolean}} req `definition` = `{rules: RuleDTO[]}` (an unsaved or
 *   edited draft) or `key` = `Constructed:<id>@<v>` (the saved version as is); `longOnly` as the
 *   Backtest's checkbox (sent only when true: absent = false, the Backtest default)
 */
export const previewConstructed = async ({ definition = null, key = null, ticker, timeFrame, startDay, endDay, longOnly = false }) => {
  const body = { ticker, timeFrame, startDate: previewStart(startDay), endDate: previewEnd(endDay) };
  if (longOnly) body.longOnly = true;
  if (definition) body.definition = definition;
  else if (key) body.key = key;
  const res = await apiRequest(`${API_BASE_URL}/preview`, { method: 'POST', ...jsonBody(body) }, 'Preview failed');
  return normalizePreview(await readJson(res));
};

// ---- templates (stage 3a, architect §4.3) ----

/** GET /templates → normalized TemplateDTO[] (the code templates, e.g. "Price vs MA", "MA crossover"). */
export const listTemplates = async () => {
  const res = await apiRequest(`${API_BASE_URL}/templates`, undefined, 'Loading templates failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data.map(normalizeTemplate).filter((t) => t.templateId) : [];
};

/**
 * POST /templates/{templateId}/create `{name?, options?}` → 201 the new strategy v1 (normalized DTO
 * with `templateId`); 409 NAME_EXISTS; 404 unknown template; 400 an unknown option or options on a
 * template without options - so `options` (`{takeProfit: true, regime: false}`, stage 4b) is sent
 * only when given. Errors are thrown (httpClient).
 */
export const createFromTemplate = async (templateId, name = null, options = null) => {
  const body = name && name.trim() ? { name: name.trim() } : {};
  if (options && typeof options === 'object' && Object.keys(options).length) body.options = options;
  const res = await apiRequest(`${API_BASE_URL}/templates/${enc(templateId)}/create`,
    { method: 'POST', ...jsonBody(body) }, 'Creating the strategy from the template failed');
  return fromConstructedDTO(await readJson(res));
};
