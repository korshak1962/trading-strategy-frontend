// src/components/strategyConstructor/constructedFormat.js
//
// Pure helpers of the strategy constructor (screener architect.md "Конструктор стратегий" §4.9):
// the request key `Constructed:<id>@<version>`, threshold names `R<rule>.C<cond>.<field>`, rule
// captions, the client copy of the definition validation, fire-rate texts and the warnings of
// BA spec §4.3 / §5.2 (Q11). The server stays the authority: its 400 text is shown as is.
// Stage 4a (architect "этап 4a" §6): channel conditions (CHANNEL_METRIC, semantics B) - their
// caption, the thresholds `R<r>.C<c>.min` / `.max`, the client checks (metric in B, bounds,
// min ≤ max on every grid point, detector ranges), the run TFs they allow (DAY / WEEK) and the
// static "channel LongBlock without an EXISTS = 0 rule" warning.
// Stage 4b (architect_constructor_stage4b.md §4, §6, §8): Levels conditions / operands and the
// sequence bricks - threshold paths (`strength`, `bars`, `[P.]levels.<field>`, `P.x.n`), captions in
// the backend's label form, the client checks (event / strength, Levels ranges, bars / lag, the
// brick's X and anchor A, units with ATR_MULTIPLE), run TFs DAY / WEEK, new rows and the Levels
// template a new occurrence copies ("Apply to all Levels").
// Stage 4c-1 (screener architect.md §2.7, §4): position operands AT_ENTRY / MAX_SINCE_ENTRY /
// MIN_SINCE_ENTRY (LONG only) - captions, new operands, the client checks (X a market operand, no
// offset, lag on the windows only, not inside a brick / WITHIN, never in a ShortClose rule), the run
// TFs (DAY / WEEK; a fixed-TF X pins it), the LongOpen / LongBlock warning and `usesPosition`.
// R5 v2 F1 (screener architect_r5_migration_v2.md §6): STICKY_SINCE_ENTRY(levels), form LEVELS - the
// caption `STICKY_SINCE_ENTRY[@Ln]` (the backend's label), a new one takes the strategy's Levels
// spec, the client checks (no X / lag / output / offset, tf RUN, `levels` in range).

import {
  SIGNAL_TYPES, STATE_RULE_FIRE_RATE, MIN_TRADES_PER_THRESHOLD, MAX_RULES, MAX_CONDITIONS, CONSTRUCTED_TFS, RUN_TF,
  AXIS_KINDS, LINK_SUFFIX_KIND, MAX_AXES, MAX_LINK_TERMS, applyLinks, pruneLinks, linkValue,
  CONSTRAINT_OPS, CONSTRAINT_OP_SYMBOL, MAX_CONSTRAINTS,
  CHANNEL_TFS, CHANNEL_RUN_TFS, CHANNEL_LEVELS, CHANNEL_METRICS, CHANNEL_DEFAULTS, CHANNEL_RANGES, CHANNEL_KEYS,
  linkSuffixKind, getAtPath, updateAtPath, levelsOccurrences, isStagedCondition, isLevelEvent, isWithin, eventNeedsStrength,
  LEVEL_FIELDS, LEVELS_KEYS, LEVELS_DEFAULTS, LEVELS_PARAMS, LEVELS_RUN_TFS, DEFAULT_LEVELS_META, DEFAULT_BRICKS_META,
  LEVEL_KIND, ANCHORED_KINDS, isStagedOperand, isBrickOperand, rearmOf, LEVELS_REARM_DEFAULT,
  POSITION_KINDS, POSITION_WINDOW_KINDS, isPositionOperand, isPositionLevelsOperand, DEFAULT_POSITION_META, POSITION_RUN_TFS,
} from '../../api/constructedApi';
import {
  conditionCaption, validateCondition, newCompareCondition, reasonText, fmtNum, unitMismatchHint, operandCaption,
  validateOperand, opSymbol,
} from '../universeScreener/conditionFormat';
import { OPERATORS, TOLERANCE_LIMIT as SCREEN_TOLERANCE_LIMIT, OFFSET_MIN } from '../../api/screenerApi';
import { lengthParamOf, kindName, runsOn, CONST_KIND, operandUnitOf, runTfAdviceOf } from '../../api/indicatorCatalog';
// a cycle (displayLabels imports this module): used only inside functions, never at load time
import { unitClashText, EDITOR_MODE } from '../../utils/displayLabels';

// ---- request key ----

const KEY_RE = /^Constructed:(\d+)@(\d+)$/;

/** `Constructed:12@3` → `{id: 12, version: 3}`; anything else → null. */
export const parseConstructedKey = (key) => {
  const m = typeof key === 'string' ? KEY_RE.exec(key) : null;
  return m ? { id: Number(m[1]), version: Number(m[2]) } : null;
};

export const isConstructedKey = (key) => parseConstructedKey(key) != null;

export const constructedKey = (id, version) => `Constructed:${id}@${version}`;

/** An available-strategies entry (StrategyInfoDTO) of a constructed strategy. */
export const isConstructedInfo = (s) => s?.kind === 'CONSTRUCTED' || isConstructedKey(s?.name);

/**
 * Display name of a strategy key: a constructed key → "<name> v3" (name from the available
 * strategies, which list the CURRENT version of every non-deleted one; a pinned older version
 * keeps its own number), otherwise the key itself.
 */
export const strategyDisplayName = (key, availableStrategies = []) =>
  constructedLabel(key, availableStrategies) ?? key;

// ---- display names (minor #11): one helper for every label of a constructed strategy ----
//
// Labels only - the keys sent to the backend never change (request key `Constructed:<id>@<v>`,
// profile key part `Constructed:<id>`).

const TOKEN_RE = /^Constructed:(\d+)(?:@(\d+))?$/;

/** The class every constructed strategy runs as (a param's strategyClass); never a name. */
export const CONSTRUCTED_CLASS = 'ConstructedStrategy';

/** `Constructed:12@3` → {id: 12, version: 3}; the profile token `Constructed:12` → {id: 12, version: null}. */
export const parseConstructedRef = (s) => {
  const m = typeof s === 'string' ? TOKEN_RE.exec(s) : null;
  return m ? { id: Number(m[1]), version: m[2] != null ? Number(m[2]) : null } : null;
};

// id → stored name, filled from available-strategies (non-deleted) and from version reads (also
// deleted strategies). `listed` = the ids of the last loaded available-strategies; null = not loaded.
const names = new Map();
let listed = null;

const infoId = (s) => s.constructedId ?? parseConstructedKey(s.name)?.id;

/** Records the constructed strategies of an available-strategies list (StrategyInfoDTO[]). */
export const rememberAvailableStrategies = (availableStrategies) => {
  const ids = new Set();
  (availableStrategies || []).filter(isConstructedInfo).forEach((s) => {
    const id = infoId(s);
    if (id == null) return;
    ids.add(id);
    if (s.displayName) names.set(id, s.displayName);
  });
  listed = ids;
};

/** Records a stored name (e.g. from GET /constructed/{id}/versions/{v}, which serves deleted ones too). */
export const rememberConstructedName = (id, name) => {
  if (id != null && name) names.set(Number(id), name);
};

/** true when the name of `id` is known. */
export const hasConstructedName = (id) => names.has(Number(id));

/**
 * Label of a constructed strategy from its request key or profile token: "<name> v3" (version
 * only when the key carries one and `withVersion`), "<name> (deleted) v3" when it is no longer in
 * the loaded available strategies (`markDeleted`), "deleted strategy #12" when its name is unknown
 * ("constructed strategy #12" while the list is not loaded yet). null when `s` is not a
 * constructed key/token.
 */
export const constructedLabel = (s, availableStrategies = null, { withVersion = true, markDeleted = true } = {}) => {
  const ref = parseConstructedRef(s);
  if (!ref) return null;
  const info = (availableStrategies || []).find((x) => isConstructedInfo(x) && infoId(x) === ref.id);
  const name = info?.displayName || names.get(ref.id) || null;
  // deleted = not in a loaded available-strategies list; before the list loads nothing is "deleted"
  const deleted = !info && listed != null && !listed.has(ref.id);
  const base = name
    ? (deleted && markDeleted ? `${name} (deleted)` : name)
    : `${deleted ? 'deleted strategy' : 'constructed strategy'} #${ref.id}`;
  return withVersion && ref.version != null ? `${base} v${ref.version}` : base;
};

/**
 * Display label of any strategy key / class name: a constructed key or token → its name;
 * the bare class `ConstructedStrategy` (no id known) → "constructed strategy"; anything else as is.
 */
export const strategyLabel = (s, availableStrategies = null, opts = {}) => {
  const c = constructedLabel(s, availableStrategies, opts);
  if (c) return c;
  return s === CONSTRUCTED_CLASS ? 'constructed strategy' : s;
};

/**
 * The constructed request key of a result param (StrategyResultDTO.paramsDTO carries only the
 * class `ConstructedStrategy`): the config's one constructed key that has this param name; null
 * when none or several match.
 */
export const constructedKeyOfParam = (paramName, strategyNameToParams) => {
  const hits = Object.entries(strategyNameToParams || {})
    .filter(([k, params]) => isConstructedKey(k) && params && Object.prototype.hasOwnProperty.call(params, paramName))
    .map(([k]) => k);
  return hits.length === 1 ? hits[0] : null;
};

/**
 * The current version of the constructed strategy `key` names, from the available strategies
 * (null when it is not listed: deleted, or an older backend). `{key, version, info}`.
 */
export const currentVersionOf = (key, availableStrategies = []) => {
  const k = parseConstructedKey(key);
  if (!k) return null;
  const info = (availableStrategies || []).find((s) => isConstructedInfo(s)
    && (s.constructedId ?? parseConstructedKey(s.name)?.id) === k.id);
  if (!info) return null;
  const version = info.version ?? parseConstructedKey(info.name)?.version ?? null;
  return { key: info.name, version, info };
};

// ---- threshold names (D5) ----

const THRESHOLD_RE = /^R(\d+)\.C(\d+)\.(tolerancePct|left\.n|right\.n|right\.const|min|max|strength|bars)$/;
const FIELD_LABEL = {
  strength: 'event strength', // stage 4b: SUPPORT_BREAK / RESISTANCE_REACHED
  bars: 'within bars', // stage 4b: WITHIN(A, k)
  tolerancePct: 'tolerance %',
  'left.n': 'left length',
  'right.n': 'right length',
  'right.const': 'constant',
  min: 'channel min', // stage 4a: the bounds of a channel condition
  max: 'channel max',
};

/**
 * `R1.C2.tolerancePct` → `{rule: 1, cond: 2, field: 'tolerancePct', label: 'R1 · condition 2 · tolerance %'}`.
 * `metrics` (optional, channelMetricsOf): the channel metric of `R<r>.C<c>` - a channel bound then
 * reads `R4 · condition 1 · EXISTS min` instead of `… · channel min`.
 */
export const parseThresholdName = (name, metrics = null) => {
  const m = typeof name === 'string' ? THRESHOLD_RE.exec(name) : null;
  if (!m) return null;
  const rule = Number(m[1]);
  const cond = Number(m[2]);
  const metric = (m[3] === 'min' || m[3] === 'max') ? metrics?.[`R${rule}.C${cond}`] : null;
  const field = metric ? `${metric} ${m[3]}` : FIELD_LABEL[m[3]];
  return { rule, cond, field: m[3], label: `R${rule} · condition ${cond} · ${field}` };
};

/**
 * `{"R4.C1": "EXISTS", …}`: the metric of every channel condition of a constructed version's rules
 * (threshold names use the rule id and the condition id, backend ConstructedThresholds).
 */
export const channelMetricsOf = (rules) => {
  const out = {};
  (rules || []).forEach((r) => (r.conditions || []).forEach((rc) => {
    if (r.id != null && rc?.id != null && isChannelCondition(rc.condition) && rc.condition.metric) {
      out[`R${r.id}.C${rc.id}`] = rc.condition.metric;
    }
  }));
  return out;
};

// Order of a condition's thresholds in the lists: min before max (a channel condition's bounds).
const FIELD_ORDER = ['left.n', 'min', 'max', 'right.const', 'right.n', 'tolerancePct', 'strength', 'bars'];

/** Sort key of a threshold name: condition number, then FIELD_ORDER; null for other names. */
const thresholdOrder = (name) => {
  const t = parseThresholdName(name);
  return t ? [t.rule, t.cond, FIELD_ORDER.indexOf(t.field)] : null;
};

/**
 * A params list (`[{paramName, …}]`, Best Parameters) with each `R<r>.C<c>.max` moved after its
 * `.min` sibling of the same strategy; everything else keeps its order.
 */
export const orderMinBeforeMax = (list, nameOf = (p) => p.paramName, groupOf = () => '') => {
  const out = [...(list || [])];
  for (let i = 0; i < out.length; i += 1) {
    const name = nameOf(out[i]);
    if (typeof name !== 'string' || !THRESHOLD_RE.test(name) || !name.endsWith('.max')) continue;
    const minName = `${name.slice(0, -'.max'.length)}.min`;
    const j = out.findIndex((p, k) => k > i && nameOf(p) === minName && groupOf(p) === groupOf(out[i]));
    if (j > i) out.splice(i, 0, out.splice(j, 1)[0]);
  }
  return out;
};

/** A threshold is in the sweep when its range has more than one value (default: min == max == value). */
export const inSweep = (p) => {
  const min = Number(p?.min);
  const max = Number(p?.max);
  const step = Number(p?.step);
  return Number.isFinite(min) && Number.isFinite(max) && max > min && (!Number.isFinite(step) || step > 0);
};

/**
 * Constructed thresholds in the sweep of a strategyNameToParams map: `{k, keys}` (k = count over
 * every constructed strategy of the config).
 */
export const sweepThresholdCount = (strategyNameToParams) => {
  let k = 0;
  const keys = [];
  Object.entries(strategyNameToParams || {}).forEach(([key, params]) => {
    if (!isConstructedKey(key)) return;
    keys.push(key);
    Object.values(params || {}).forEach((p) => { if (inSweep(p)) k += 1; });
  });
  return { k, keys };
};

// ---- axes (stage 3a, architect §3.1): parameters `$Name` shared by linked thresholds ----

export const AXIS_NAME_RE = /^\$[A-Za-z][A-Za-z0-9]{0,31}$/;

/** `$Gap` → true: an axis (linked parameter) of a constructed strategy. */
export const isAxisName = (name) => typeof name === 'string' && AXIS_NAME_RE.test(name);

export const AXIS_KIND_LABEL = Object.freeze({ LENGTH: 'length', TOLERANCE: 'tolerance %', CONST: 'constant' });

/** The axis kind a threshold suffix links to (`right.n` → LENGTH). */
export const suffixKind = (suffix) => LINK_SUFFIX_KIND[suffix] || linkSuffixKind(suffix);

/** "+$MaLength" → "$MaLength", "−$Gap", "$FastLength + $Spread". */
export const linkText = (terms) => (terms || []).map((t, i) => {
  if (i === 0) return t.sign < 0 ? `−${t.axis}` : t.axis;
  return `${t.sign < 0 ? '−' : '+'} ${t.axis}`;
}).join(' ');

/** The order the backend writes a condition's link notes in (ConstructedThresholds.compile). */
const LINK_NOTE_ORDER = ['tolerancePct', 'left.n', 'right.n', 'right.const', 'min', 'max'];

/**
 * One note per link of a condition, the same text as the backend's preview notes (reviewer #34):
 * field order tolerance, left.n, right.n, right.const; the term signs and the linked value -
 * "-$Gap = -2, $MaLength = 100", "$FastLength + $Spread = 50". Joined by ", ".
 */
export const linkNotes = (links, axes) => {
  const live = Object.keys(links || {}).filter((suffix) => Array.isArray(links[suffix]) && links[suffix].length > 0);
  const note = (suffix) => {
    const terms = links[suffix];
    const expr = terms.map((t, i) => (i === 0 ? `${t.sign < 0 ? '-' : ''}${t.axis}` : `${t.sign < 0 ? '-' : '+'} ${t.axis}`)).join(' ');
    const v = linkValue(terms, axes);
    return `${expr} = ${v == null ? '?' : fmtNum(v).replace('−', '-')}`;
  };
  // stage 4b: strength / bars / x.n after the 4a order; the Levels fields (up to 12 per spec) as one count
  const levels = live.filter((s) => /(^|\.)levels\./.test(s));
  const rest = live.filter((s) => !LINK_NOTE_ORDER.includes(s) && !levels.includes(s));
  const parts = [...LINK_NOTE_ORDER.filter((s) => live.includes(s)), ...rest].map(note);
  if (levels.length) parts.push(`${levels.length} Levels param${levels.length === 1 ? '' : 's'} linked`);
  return parts.join(', ');
};

/** How many links of the draft use each axis: `{$Gap: 2}`. */
export const axisUsage = (rules) => {
  const n = {};
  (rules || []).forEach((r) => (r.conditions || []).forEach((c) => Object.values(c.links || {})
    .forEach((terms) => (terms || []).forEach((t) => { n[t.axis] = (n[t.axis] || 0) + 1; }))));
  return n;
};

/** A free axis name `$<base><k>` not used yet. */
export const freeAxisName = (axes, base = 'Axis') => {
  const names = new Set((axes || []).map((a) => a.name));
  if (!names.has(`$${base}`)) return `$${base}`;
  for (let k = 2; ; k += 1) if (!names.has(`$${base}${k}`)) return `$${base}${k}`;
};

/** A new axis of `kind` with `value` (fixed by default: min == max == value, the general rule). */
export const newAxis = (axes, kind = 'LENGTH', value = null, opts = null) => {
  const base = opts?.base || (kind === 'LENGTH' ? 'Length' : kind === 'TOLERANCE' ? 'Gap' : 'Level');
  const v = value ?? (kind === 'LENGTH' ? 50 : 0);
  const step = opts?.step ?? (kind === 'LENGTH' ? 5 : 0.5);
  return { name: freeAxisName(axes, base), kind, value: v, min: v, max: v, step, lo: '', hi: '', note: '' };
};

/**
 * Name base and step of a new axis created from a stage 4b threshold (`right.x.levels.stopBuffer`
 * → `$StopBuffer`, step 0.1; an integer field step 1; `strength` → `$Strength`; `bars` → `$Bars`);
 * null for the other suffixes (the kind's default).
 */
export const axisHintFor = (suffix) => {
  if (typeof suffix !== 'string') return null;
  const m = /(?:^|\.)levels\.([A-Za-z]+)$/.exec(suffix);
  if (m) {
    const p = LEVELS_PARAMS.find((x) => x.name === m[1]);
    return { base: levelsFieldLabel(m[1]), step: p?.integer ? 1 : 0.1 };
  }
  if (suffix === 'strength' || suffix === 'of.strength') return { base: 'Strength', step: 0.5 };
  if (suffix === 'bars') return { base: 'Bars', step: 1 };
  return null;
};

/**
 * Params of one constructed strategy grouped: axes first (`{rule: 'axes'}`, in the order the
 * backend lists them = the definition's order), then by rule (`{rule: <id>}`), others last
 * (`{rule: null}`).
 */
export const groupThresholds = (params) => {
  const groups = new Map();
  const axes = [];
  const other = [];
  Object.entries(params || {}).forEach(([name, p]) => {
    if (isAxisName(name)) { axes.push([name, p]); return; }
    const t = parseThresholdName(name);
    if (!t) { other.push([name, p]); return; }
    if (!groups.has(t.rule)) groups.set(t.rule, []);
    groups.get(t.rule).push([name, p]);
  });
  const out = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rule, entries]) => ({
    rule,
    entries: entries.sort((a, b) => {
      const x = thresholdOrder(a[0]);
      const y = thresholdOrder(b[0]);
      return (x[1] - y[1]) || (x[2] - y[2]) || a[0].localeCompare(b[0]);
    }),
  }));
  if (axes.length) out.unshift({ rule: 'axes', entries: axes });
  if (other.length) out.push({ rule: null, entries: other });
  return out;
};

// ---- signal types ----

export const SIGNAL_TYPE_HINT = Object.freeze({
  LongOpen: 'Open a long on this bar (a no-op while already long)',
  LongClose: 'Close the long on this bar; while flat it vetoes entries of the other strategies',
  LongBlock: 'Do not enter long on this bar. Never opens or closes a position; a held position is kept',
  ShortOpen: 'Open a short (in long only: acts as a long exit)',
  ShortClose: 'Cover the short on this bar',
});

export const SIGNAL_TYPE_CLASS = Object.freeze({
  LongOpen: 'bg-green-100 text-green-800 border-green-300',
  LongClose: 'bg-red-100 text-red-800 border-red-300',
  LongBlock: 'bg-gray-200 text-gray-800 border-gray-400',
  ShortOpen: 'bg-blue-100 text-blue-800 border-blue-300',
  ShortClose: 'bg-orange-100 text-orange-800 border-orange-300',
});

// ---- channel conditions (stage 4a) ----

export const isChannelCondition = (c) => c?.type === 'CHANNEL_METRIC';

const LEVEL_SHORT = Object.freeze({ 0: 'current', 1: 'parent', 2: 'grandparent' });
export const CHANNEL_LEVEL_LABEL = Object.freeze({ 0: '0 · current', 1: '1 · parent', 2: '2 · grandparent' });

const finite = (v) => v !== '' && v != null && Number.isFinite(Number(v));

/** The channel params of a condition over the defaults (numbers where given). */
export const channelSpecOf = (c, defaults = CHANNEL_DEFAULTS) => Object.fromEntries(CHANNEL_KEYS
  .map((k) => [k, finite(c?.channel?.[k]) ? Number(c.channel[k]) : defaults[k]]));

/** Two channel specs are one indicator (same replay; minAgeBars counts too: another L0). */
export const sameChannelSpec = (a, b) => CHANNEL_KEYS.every((k) => Number(a?.[k]) === Number(b?.[k]));

/**
 * The detector part of a caption: '' for the defaults (0.95 / 5 / 0.05, age 0), otherwise
 * " {0.9/10/0.05, age ≥ 30}" - the backend's ChannelSpec.label() in display form.
 */
export const channelSpecLabel = (spec, defaults = CHANNEL_DEFAULTS) => {
  if (!spec || sameChannelSpec(spec, defaults)) return '';
  const age = Number(spec.minAgeBars) > 0 ? `, age ≥ ${spec.minAgeBars}` : '';
  return ` {${fmtNum(spec.coveragePct)}/${fmtNum(spec.minBars)}/${fmtNum(spec.minWidthPct)}${age}}`;
};

/**
 * Caption of a channel condition, as the backend's ConditionDef.label() writes it:
 * `RUN L0 POSITION in [−0.1, 0.2]`, `RUN L0 POSITION ≥ 0.75`, `WEEK L1 EXISTS in [0, 0] {…}`.
 */
export const channelConditionCaption = (c) => {
  const hasMin = finite(c?.min);
  const hasMax = finite(c?.max);
  let range = '(no bound)';
  if (hasMin && hasMax) range = `in [${fmtNum(c.min)}, ${fmtNum(c.max)}]`;
  else if (hasMin) range = `≥ ${fmtNum(c.min)}`;
  else if (hasMax) range = `≤ ${fmtNum(c.max)}`;
  return `${c?.tf || '?'} L${c?.level ?? '?'} ${c?.metric || '?'} ${range}${channelSpecLabel(channelSpecOf(c))}`;
};

/** Human description of a channel's level: "current channel (L0)". */
export const channelLevelText = (level) => `${LEVEL_SHORT[Number(level)] || '?'} channel (L${level})`;

/** The metric descriptor of `name` from meta.channel (or the static list). */
export const channelMetricOf = (name, metrics = CHANNEL_METRICS) => (metrics || CHANNEL_METRICS).find((m) => m.name === name)
  || CHANNEL_METRICS.find((m) => m.name === name) || null;

/**
 * A new channel condition (architect §6): RUN, level 0, POSITION, no bounds yet; `channel` copies
 * the last channel condition of the strategy (one detector setting per strategy by default, Q-N3),
 * else meta.channel.defaults.
 */
export const newChannelCondition = (rules = [], defaults = CHANNEL_DEFAULTS) => {
  let last = null;
  (rules || []).forEach((r) => (r.conditions || []).forEach(({ condition }) => {
    if (isChannelCondition(condition)) last = condition;
  }));
  return {
    type: 'CHANNEL_METRIC', tf: RUN_TF, level: 0, metric: 'POSITION', min: '', max: '',
    channel: last ? channelSpecOf(last, defaults) : { ...CHANNEL_DEFAULTS, ...defaults },
  };
};

export const newRuleChannelCondition = (rules, defaults) => ({ id: null, condition: newChannelCondition(rules, defaults), links: {} });

const inRange = (v, r) => {
  if (!finite(v)) return false;
  const n = Number(v);
  if (r.integer && !Number.isInteger(n)) return false;
  if (r.min != null && (r.minExclusive ? n <= r.min : n < r.min)) return false;
  if (r.max != null && (r.maxExclusive ? n >= r.max : n > r.max)) return false;
  return true;
};

const rangeText = (r) => `${r.minExclusive ? '(' : '['}${fmtNum(r.min)}, ${fmtNum(r.max)}${r.maxExclusive ? ')' : ']'}`;

/**
 * Errors of a channel condition of a rule (client copy of FilterValidator's constructor branch):
 * TF RUN / DAY / WEEK, level 0..2, metric in semantics B (TOUCHES_* refused), min or max (numbers),
 * min ≤ max at the axes' defaults, detector params in range. `c` has the links applied.
 */
export const validateChannelCondition = (c, { metrics = CHANNEL_METRICS, ranges = CHANNEL_RANGES, where = '' } = {}) => {
  const errs = [];
  if (!CHANNEL_TFS.includes(c.tf)) errs.push('Channel TF must be RUN, DAY or WEEK');
  if (!CHANNEL_LEVELS.includes(Number(c.level))) errs.push('Level must be 0, 1 or 2');
  if (/^TOUCHES_/.test(c.metric || '')) errs.push(`${where ? `${where}: ` : ''}${c.metric} is not in semantics B yet`);
  else if (!channelMetricOf(c.metric, metrics)) errs.push(`Unknown channel metric ${c.metric || ''}`.trim());
  const hasMin = finite(c.min);
  const hasMax = finite(c.max);
  if (c.min !== '' && c.min != null && !hasMin) errs.push('min must be a number');
  if (c.max !== '' && c.max != null && !hasMax) errs.push('max must be a number');
  if (!hasMin && !hasMax) errs.push('Set min, max or both');
  if (hasMin && hasMax && Number(c.min) > Number(c.max)) errs.push(`min ${fmtNum(c.min)} must be ≤ max ${fmtNum(c.max)}`);
  CHANNEL_KEYS.forEach((k) => {
    const r = ranges?.[k] || CHANNEL_RANGES[k];
    if (!inRange(c.channel?.[k], r)) {
      errs.push(`${where ? `${where}.` : ''}channel.${k} must be ${r.integer ? 'an integer ' : ''}in ${rangeText(r)}`);
    }
  });
  return errs;
};

/**
 * min ≤ max on every point of the axes' default grids (architect K8; the backend refuses such a
 * point with 400 "R1.C2.min = $BuyLow=0.3 > R1.C2.max = $BuyHigh=0.2"). Only when at least one
 * bound is linked; walks the pairs like the constraint check. null = ok.
 */
const channelBoundsGridError = (condition, links, axes, where) => {
  const hasMin = finite(condition.min);
  const hasMax = finite(condition.max);
  if (!hasMin || !hasMax || (!links.min && !links.max)) return null;
  const byName = new Map((axes || []).map((a) => [a.name, a]));
  const valuesOf = (suffix) => {
    const terms = links[suffix];
    if (!terms) return [{ v: Number(condition[suffix]), text: fmtNum(condition[suffix]) }];
    if (terms.some((t) => !byName.has(t.axis))) return null;
    const grids = terms.map((t) => axisGrid(byName.get(t.axis)));
    if (grids.reduce((n, g) => n * g.length, 1) > GRID_CAP) return null;
    const pts = grids.length === 1 ? grids[0].map((v) => [v]) : grids[0].flatMap((v) => grids[1].map((w) => [v, w]));
    return pts.map((pt) => ({
      v: Number(pt.reduce((s, x, i) => s + (terms[i].sign < 0 ? -x : x), 0).toFixed(10)),
      text: terms.map((t, i) => `${i === 0 ? (t.sign < 0 ? '−' : '') : (t.sign < 0 ? ' − ' : ' + ')}${t.axis}=${fmtNum(pt[i])}`).join(''),
    }));
  };
  const lo = valuesOf('min');
  const hi = valuesOf('max');
  if (!lo || !hi || lo.length * hi.length > CONSTRAINT_PAIR_CAP) return null;
  for (const a of lo) {
    for (const b of hi) {
      if (a.v > b.v) return `${where}.min = ${a.text} > ${where}.max = ${b.text} (narrow the axes’ Min / Max or add an axis constraint)`;
    }
  }
  return null;
};

/**
 * Static warning of the preview (spec §4.4), the same rule as the backend
 * `ConstructedWarnings.channelBlockWithoutExists`: a LongBlock rule with a channel condition blocks
 * only while that channel exists - with no channel its conditions FAIL and entries are allowed.
 * A guard is a LongBlock rule with exactly ONE condition, a channel `EXISTS` with max < 1 and
 * min ≤ 0 (or unset); a guard rule is not warned itself. Every other LongBlock rule is warned once
 * (at its first channel condition, EXISTS included) unless each of its channel conditions has a
 * guard on the same channel TF, equal detector params and a level ≥ its level (EXISTS L1 = 0 also
 * holds when L0 is missing). Returns the warning texts.
 */
const isExistsZeroGuard = (rule) => {
  const conds = rule.conditions || [];
  if (rule.signalType !== 'LongBlock' || conds.length !== 1) return false;
  const c = conds[0]?.condition;
  return isChannelCondition(c) && c.metric === 'EXISTS' && finite(c.max) && Number(c.max) < 1
    && (!finite(c.min) || Number(c.min) <= 0);
};

export const channelBlockWarnings = (rules) => {
  const guards = (rules || []).filter(isExistsZeroGuard).map((r) => {
    const c = r.conditions[0].condition;
    return { tf: c.tf, level: Number(c.level), spec: channelSpecOf(c) };
  });
  const out = [];
  (rules || []).forEach((r, i) => {
    if (r.signalType !== 'LongBlock' || isExistsZeroGuard(r)) return;
    const uncovered = (r.conditions || []).map((x) => x.condition)
      .find((c) => isChannelCondition(c) && !guards.some((g) => g.tf === c.tf
        && g.level >= Number(c.level) && sameChannelSpec(g.spec, channelSpecOf(c))));
    if (!uncovered) return;
    const name = r.id != null ? `R${r.id}` : `rule #${i + 1}`;
    out.push(`${name} blocks only while a channel exists: with no channel entries are allowed. `
      + `Add a one-condition rule \`${uncovered.tf} L${uncovered.level} EXISTS in [0, 0] → LongBlock\` (same channel params).`);
  });
  return out;
};

// ---- Levels and sequence bricks (stage 4b) ----

const LEVELS_LABEL = Object.freeze({
  minStrength: 'MinStrength', breakBuffer: 'BreakBuffer', touchTolerance: 'TouchTolerance', maxRetestBars: 'MaxRetestBars',
  maxDwellBars: 'MaxDwellBars', confirmMode: 'ConfirmMode', runawayAtr: 'RunawayAtr', baseMinBars: 'BaseMinBars',
  maxBaseBars: 'MaxBaseBars', stopBuffer: 'StopBuffer', upgradeStrength: 'UpgradeStrength', upgradeMinTouches: 'UpgradeMinTouches',
  takeProfitStrength: 'TakeProfitStrength',
});
/** Display name of a Levels field (`stopBuffer` → `StopBuffer`, as the backend's labels and the class params). */
export const levelsFieldLabel = (f) => LEVELS_LABEL[f] || f;

/** The editor spec over the defaults (numbers where given; the bool `rearm`). */
export const levelsSpecOf = (spec, defaults = LEVELS_DEFAULTS) => ({
  ...Object.fromEntries(LEVELS_KEYS.map((k) => [k, finite(spec?.[k]) ? Number(spec[k]) : defaults[k]])),
  rearm: rearmOf(spec, defaults?.rearm ?? LEVELS_REARM_DEFAULT),
});

/**
 * The Levels spec as the backend's legend line (re-arm round, architect addendum §5): the non-default
 * params, then `re-arm` / `re-arm (TP 4)` / `no re-arm` - "MinStrength 2, StopBuffer 1, re-arm (TP 4)".
 * TakeProfitStrength is read only with re-arm, so it shows inside the re-arm part.
 */
export const levelsSpecLabel = (spec, defaults = LEVELS_DEFAULTS) => {
  const s = levelsSpecOf(spec, defaults);
  const parts = LEVEL_FIELDS.filter((k) => k !== 'takeProfitStrength' && Number(s[k]) !== Number(defaults[k]))
    .map((k) => `${levelsFieldLabel(k)} ${fmtNum(s[k])}`);
  const tp = Number(s.takeProfitStrength) > 0 ? ` (TP ${fmtNum(s.takeProfitStrength)})` : '';
  parts.push(s.rearm ? `re-arm${tp}` : 'no re-arm');
  return parts.join(', ');
};

/** Identity of a Levels spec (its 15 numbers and `rearm`): equal specs share one Levels pass and one tag. */
const levelsSpecKey = (spec, defaults = LEVELS_DEFAULTS) => JSON.stringify(levelsSpecOf(spec, defaults));

/** Every Levels spec of a condition, in condition order. */
const specsOfCondition = (c) => levelsOccurrences(c).map((o) => getAtPath(c, o.path));

/**
 * The distinct Levels specs of the rules (links applied at the axes' defaults), by first appearance:
 * `[{key, spec, tag}]`, tag `L1`, `L2`, … (the backend's `@L2` short-label tag).
 */
export const levelsSpecsOf = (rules, axes = [], defaults = LEVELS_DEFAULTS) => {
  const out = [];
  (rules || []).forEach((r) => (r.conditions || []).forEach((rc) => {
    const applied = applyLinks(rc?.condition, pruneLinks(rc?.condition, rc?.links), axes);
    specsOfCondition(applied).forEach((spec) => {
      const key = levelsSpecKey(spec, defaults);
      if (!out.some((x) => x.key === key)) out.push({ key, spec: levelsSpecOf(spec, defaults), tag: `L${out.length + 1}` });
    });
  }));
  return out;
};

/**
 * Caption options of the rules (short labels, addendum §5): `tagOf(spec)` = `@L2` when the strategy
 * has more than one distinct Levels spec, else ''.
 */
export const levelsCaptionOpts = (rules, axes = [], defaults = LEVELS_DEFAULTS) => {
  const specs = levelsSpecsOf(rules, axes, defaults);
  if (specs.length < 2) return {};
  return { tagOf: (spec) => `@${specs.find((x) => x.key === levelsSpecKey(spec, defaults))?.tag || '?'}` };
};

/** The Levels legend of the rules, one line per distinct spec: `Levels[L2]: MinStrength 2, re-arm (TP 4)` (`Levels: …` for one spec). */
export const levelsLegendLines = (rules, axes = [], defaults = LEVELS_DEFAULTS) => {
  const specs = levelsSpecsOf(rules, axes, defaults);
  return specs.map((x) => `${specs.length > 1 ? `Levels[${x.tag}]` : 'Levels'}: ${levelsSpecLabel(x.spec, defaults)}`);
};

/** The link terms as one comparable string (`+$A-$B`), '' when unlinked. */
const termsKey = (terms) => (Array.isArray(terms) && terms.length
  ? terms.map((t) => `${t.sign < 0 ? '-' : '+'}${t.axis}`).sort().join('') : '');

/**
 * Re-arm round (addendum §6, RR5): the Levels take-profit of the replayed class position should be
 * the strategy's own take-profit - a LongClose rule with `LEVEL RESISTANCE_REACHED(s)`. A warning
 * (never an error: the rules are free) for each re-arm Levels spec whose TakeProfitStrength (value or
 * link) matches no such rule, and when there are such rules but the Levels take-profit is 0.
 */
export const levelsTakeProfitWarnings = (rules, axes = [], defaults = LEVELS_DEFAULTS) => {
  const tps = []; // the take-profit rules' strengths {value, link, rule}
  const levels = []; // the re-arm Levels occurrences {value, link, rule}
  (rules || []).forEach((r, ri) => {
    const name = r.id != null ? `R${r.id}` : `rule #${ri + 1}`;
    (r.conditions || []).forEach((rc) => {
      const c = rc?.condition;
      const links = pruneLinks(c, rc?.links);
      const applied = applyLinks(c, links, axes);
      if (r.signalType === 'LongClose' && isLevelEvent(applied) && applied.event === 'RESISTANCE_REACHED' && finite(applied.strength)) {
        tps.push({ value: Number(applied.strength), link: termsKey(links.strength), rule: name });
      }
      levelsOccurrences(applied).forEach((o) => {
        const spec = levelsSpecOf(getAtPath(applied, o.path), defaults);
        if (!spec.rearm) return;
        levels.push({ value: Number(spec.takeProfitStrength) || 0, link: termsKey(links[`${o.prefix}levels.takeProfitStrength`]), rule: name });
      });
    });
  });
  if (!levels.length) return [];
  const out = [];
  const same = (a, b) => (a.link && b.link ? a.link === b.link : a.value === b.value);
  const seen = new Set();
  levels.forEach((l) => {
    const key = `${l.value}|${l.link}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (l.value > 0 && !tps.some((t) => same(t, l))) {
      out.push(`Levels re-arm replays a class with take-profit ${fmtNum(l.value)}${l.link ? ' (linked)' : ''} (${l.rule}), `
        + `but no LongClose rule has LEVEL RESISTANCE_REACHED(${fmtNum(l.value)}): the zones re-arm after exits your strategy does not take. `
        + 'Link both strengths to one axis ($TakeProfitStrength), or set the Levels TakeProfitStrength to 0.');
    } else if (l.value === 0 && tps.length) {
      out.push(`${tps[0].rule} takes profit on LEVEL RESISTANCE_REACHED(${fmtNum(tps[0].value)}), but the re-arm Levels of ${l.rule} `
        + 'replays a class without take-profit (TakeProfitStrength 0). Set the Levels TakeProfitStrength to the same value or link both to one axis.');
    }
  });
  return out;
};

const offsetText = (o) => {
  const off = Number(o?.offset) || 0;
  return off === 0 ? '' : `[−${Math.abs(off)}]`;
};

/** `@L2` of a Levels spec when the caption options tag specs (several distinct specs), else ''. */
const tagText = (spec, opts) => (opts?.tagOf ? opts.tagOf(spec) : '');

/**
 * The backend's SHORT label (re-arm round, addendum §5): "LEVEL SUPPORT_LINE", a brick's Levels
 * arguments without the `LEVEL` prefix - "MAX_SINCE(SUPPORT_LINE, CONFIRMED_ANY, lag 1)", "RUN close[0]",
 * "1.5". The spec is never in the label (the legend lists it); `opts.tagOf` adds `@L2`.
 */
export const anyOperandCaption = (o, evalTf, opts = {}) => {
  if (!o) return '?';
  if (o.kind === LEVEL_KIND) return `${opts.bare ? '' : 'LEVEL '}${o.output || '?'}${offsetText(o)}${tagText(o.levels, opts)}`;
  const arg = { ...opts, bare: true };
  if (ANCHORED_KINDS.includes(o.kind)) {
    const lag = o.kind === 'AT_LAST' ? '' : `, lag ${finite(o.lag) ? Number(o.lag) : 0}`;
    return `${o.kind}(${anyOperandCaption(o.x, evalTf, arg)}, ${anyConditionCaption(o.a, evalTf, arg)}${lag})`;
  }
  if (o.kind === 'BARS_SINCE') return `BARS_SINCE(${anyConditionCaption(o.a, evalTf, arg)})`;
  // stage 4c-1: `AT_ENTRY(OPEN_STOP)`, `MAX_SINCE_ENTRY(SUPPORT_LINE, lag 1)` (the backend's PositionOperand label)
  if (o.kind === 'AT_ENTRY') return `AT_ENTRY(${anyOperandCaption(o.x, evalTf, arg)})`;
  // R5 v2 F1: `STICKY_SINCE_ENTRY@L1` (the backend's StickySinceEntry.label: the spec only as a tag)
  if (isPositionLevelsOperand(o)) return `STICKY_SINCE_ENTRY${tagText(o.levels, opts)}`;
  if (POSITION_WINDOW_KINDS.includes(o.kind)) {
    return `${o.kind}(${anyOperandCaption(o.x, evalTf, arg)}, lag ${finite(o.lag) ? Number(o.lag) : 0})`;
  }
  return operandCaption(o, evalTf);
};

/**
 * Caption of any condition of a rule, the backend's ConditionDef.label() form: `LEVEL CONFIRMED_ANY`,
 * `LEVEL RESISTANCE_REACHED(4)`, `WITHIN(LEVEL BREAKOUT_UP, 3)`, `RUN close[0] < AT_LAST(…)`, a
 * channel condition, a plain comparison.
 */
export const anyConditionCaption = (c, evalTf, opts = {}) => {
  if (!c) return '?';
  if (isChannelCondition(c)) return channelConditionCaption(c);
  if (isLevelEvent(c)) {
    const s = eventNeedsStrength(c.event) ? `(${finite(c.strength) ? fmtNum(c.strength) : '?'})` : '';
    return `${opts.bare ? '' : 'LEVEL '}${c.event || '?'}${s}${tagText(c.levels, opts)}`;
  }
  const inner = { ...opts, bare: false };
  if (isWithin(c)) return `WITHIN(${anyConditionCaption(c.of, evalTf, { ...opts, bare: true })}, ${finite(c.bars) ? Number(c.bars) : '?'})`;
  if (c.type === 'COMPARE' && (isStagedOperand(c.left) || isStagedOperand(c.right))) {
    const tol = Number(c.tolerancePct) || 0;
    const factor = tol === 0 ? '' : ` × ${fmtNum(1 + tol / 100, 6)}`;
    return `${anyOperandCaption(c.left, evalTf, inner)} ${opSymbol(c.op)} ${anyOperandCaption(c.right, evalTf, inner)}${factor}`;
  }
  return conditionCaption(c, evalTf);
};

/** true when a rule of the draft has a Levels condition / operand or a sequence brick. */
export const hasStagedCondition = (rules) => (rules || [])
  .some((r) => (r.conditions || []).some(({ condition }) => isStagedCondition(condition)));

/**
 * The Levels template a new occurrence starts from (architect §8): the spec and the field links of
 * the strategy's last Levels occurrence (`{spec, links: {field: terms}}`), else the defaults without
 * links. `defaults` = meta.levels.defaults.
 */
export const lastLevelsTemplate = (rules, defaults = LEVELS_DEFAULTS) => {
  let last = null;
  (rules || []).forEach((r) => (r.conditions || []).forEach((rc) => {
    levelsOccurrences(rc.condition).forEach((o) => { last = { rc, o }; });
  }));
  if (!last) return { spec: levelsSpecOf(null, defaults), links: {} };
  const links = {};
  if (last.o.linkable) {
    LEVEL_FIELDS.forEach((f) => {
      const t = last.rc.links?.[`${last.o.prefix}levels.${f}`];
      if (Array.isArray(t) && t.length) links[f] = t;
    });
  }
  const raw = getAtPath(last.rc.condition, last.o.path);
  return {
    spec: {
      ...levelsSpecOf(null, defaults),
      ...Object.fromEntries([...LEVELS_KEYS, 'rearm'].filter((k) => raw?.[k] !== undefined).map((k) => [k, raw[k]])),
    },
    links,
  };
};

/**
 * Links of a rule condition after its condition changed: every Levels occurrence that is new (a
 * prefix the old condition did not have) takes the template's field links (architect §8: "a new
 * occurrence copies the spec and the links of the last Levels occurrence"). Returns the links.
 */
export const withTemplateLinks = (oldCondition, newCondition, links, template) => {
  if (!template || !Object.keys(template.links || {}).length) return links;
  const before = new Set(levelsOccurrences(oldCondition).map((o) => o.prefix));
  const added = levelsOccurrences(newCondition).filter((o) => o.linkable && !before.has(o.prefix));
  if (!added.length) return links;
  const out = { ...(links || {}) };
  added.forEach((o) => Object.entries(template.links).forEach(([f, terms]) => { out[`${o.prefix}levels.${f}`] = terms.map((t) => ({ ...t })); }));
  return out;
};

/**
 * "Apply to all Levels in this strategy" (architect §8): the Levels spec at `prefix` of rule `ri`,
 * condition `ci` - its values at the axes' defaults and its links - copied into every Levels
 * occurrence of the draft. Where the target cannot carry links (a Levels operand inside a nested
 * comparison) the linked value is written. Returns the new draft and the count of occurrences.
 */
export const applyLevelsToAll = (draft, ri, ci, prefix) => {
  const src = draft?.rules?.[ri]?.conditions?.[ci];
  if (!src) return { draft, count: 0 };
  const srcLinks = {};
  LEVEL_FIELDS.forEach((f) => {
    const t = src.links?.[`${prefix}levels.${f}`];
    if (Array.isArray(t) && t.length) srcLinks[f] = t;
  });
  const raw = getAtPath(src.condition, `${prefix}levels`) || {};
  const values = { ...raw };
  Object.entries(srcLinks).forEach(([f, terms]) => {
    const v = linkValue(terms, draft.axes);
    if (v != null) values[f] = v;
  });
  let count = 0;
  const rules = draft.rules.map((r) => ({
    ...r,
    conditions: r.conditions.map((rc) => {
      const occ = levelsOccurrences(rc.condition);
      if (!occ.length) return rc;
      let condition = rc.condition;
      const links = { ...(rc.links || {}) };
      occ.forEach((o) => {
        count += 1;
        condition = updateAtPath(condition, o.path, (cur) => ({ ...(cur || {}), ...values }));
        LEVEL_FIELDS.forEach((f) => {
          const key = `${o.prefix}levels.${f}`;
          if (o.linkable && srcLinks[f]) links[key] = srcLinks[f].map((t) => ({ ...t }));
          else delete links[key];
        });
      });
      return { ...rc, condition, links };
    }),
  }));
  return { draft: { ...draft, rules }, count };
};

/** A new Levels event condition: CONFIRMED_ANY, `levels` = the template's spec. */
export const newLevelCondition = (spec = LEVELS_DEFAULTS, event = 'CONFIRMED_ANY') => ({
  type: 'LEVEL_EVENT', tf: RUN_TF, event, strength: eventNeedsStrength(event) ? 4 : '', levels: { ...levelsSpecOf(spec) },
});

/** A new WITHIN(LEVEL BREAKOUT_UP, 3). */
export const newWithinCondition = (spec = LEVELS_DEFAULTS) => ({
  type: 'WITHIN', tf: RUN_TF, bars: 3, of: newLevelCondition(spec, 'BREAKOUT_UP'),
});

/** A new Levels value operand (`output`, offset 0). */
export const newLevelOperand = (spec = LEVELS_DEFAULTS, output = 'SUPPORT_LINE') => ({
  kind: LEVEL_KIND, tf: RUN_TF, offset: 0, n: null, value: '', output, levels: { ...levelsSpecOf(spec) },
});

/** A plain operand (`RUN close[0]`). */
export const newPlainOperand = () => ({ kind: 'CLOSE', tf: RUN_TF, offset: 0, n: null, value: '' });

/**
 * A new brick operand of `kind`; keeps X / A of `prev` when it is a brick too. Defaults: X =
 * LEVEL SETUP_STOP (AT_LAST) / SUPPORT_LINE (MAX / MIN_SINCE), A = LEVEL CONFIRMED_ANY, lag 0.
 */
export const newBrickOperand = (kind, spec = LEVELS_DEFAULTS, prev = null) => {
  const out = { kind, tf: RUN_TF, offset: 0, n: null, value: '' };
  out.a = prev?.a || newLevelCondition(spec, 'CONFIRMED_ANY');
  if (ANCHORED_KINDS.includes(kind)) {
    out.x = prev?.x || newLevelOperand(spec, kind === 'AT_LAST' ? 'SETUP_STOP' : 'SUPPORT_LINE');
    out.lag = kind === 'AT_LAST' ? '' : (prev && finite(prev.lag) ? prev.lag : 0);
  }
  return out;
};

/**
 * A new position operand of `kind` (stage 4c-1); keeps X of `prev` when it is a position operand too.
 * Defaults: X = RUN close[0]; a window's lag 1 (a ratchet: the entry bar is not in the window).
 * R5 v2 F1: STICKY_SINCE_ENTRY has no X / lag, only `levels`: the previous operand's spec (its own, or
 * its LEVEL X's), else `spec` (the strategy's Levels template).
 */
export const newPositionOperand = (kind, prev = null, spec = LEVELS_DEFAULTS) => {
  if (isPositionLevelsOperand({ kind })) {
    const from = isPositionLevelsOperand(prev) ? prev.levels
      : (isPositionOperand(prev) && prev.x?.kind === LEVEL_KIND ? prev.x.levels : spec);
    return { kind, tf: RUN_TF, offset: 0, n: null, value: '', lag: '', levels: { ...levelsSpecOf(from) } };
  }
  const out = { kind, tf: RUN_TF, offset: 0, n: null, value: '', x: isPositionOperand(prev) && prev.x ? prev.x : newPlainOperand() };
  out.lag = POSITION_WINDOW_KINDS.includes(kind) ? (isPositionOperand(prev) && finite(prev.lag) ? prev.lag : 1) : '';
  return out;
};

/** true when a side of the condition is a position operand (only a COMPARE side may be one). */
export const conditionUsesPosition = (c) => c?.type === 'COMPARE' && (isPositionOperand(c.left) || isPositionOperand(c.right));

/** true when the rule reads the trade (a condition with a position operand). */
export const ruleUsesPosition = (rule) => (rule?.conditions || []).some((rc) => conditionUsesPosition(rc?.condition));

/** true when a rule of the draft reads the trade: the version is position dependent (PD). */
export const usesPosition = (rules) => (rules || []).some(ruleUsesPosition);

/**
 * true when a rule reads AT_ENTRY(close) (any X that is the bar field close): a percent stop from the
 * entry. On a seeded watch position (HOLDING) the entry is the seed bar, so it reads that bar's close,
 * not the user's price (spec v3 §3.4; ENTRY_PRICE is deferred).
 */
export const readsEntryClose = (rules) => (rules || []).some((r) => (r.conditions || []).some(({ condition: c }) => (
  c?.type === 'COMPARE' && [c.left, c.right].some((o) => o?.kind === 'AT_ENTRY' && o.x?.kind === 'CLOSE')
)));

/** The 400 text of a ShortClose rule with a position operand (ConstructedPositions.shortCloseMessage). */
const shortCloseMessage = (name) => `${name}: position operands read a LONG position; a ShortClose rule with them can only `
  + 'eat this bar\'s long signals';

/**
 * Warnings of the rules with position operands (ConstructedWarnings.positionOperands): a LongOpen /
 * LongBlock rule reading the trade changes nothing (in a long an open is ignored; FLAT / SHORT: FAIL).
 */
export const positionRuleWarnings = (rules) => (rules || []).flatMap((r, i) => {
  if (!ruleUsesPosition(r) || !(r.signalType === 'LongOpen' || r.signalType === 'LongBlock')) return [];
  const name = r.id != null ? `R${r.id}` : `rule #${i + 1}`;
  return [`${name} ${r.signalType} reads the trade (LONG only): in a long an open is ignored, so the rule changes nothing.`];
});

export const newRuleLevelCondition = (spec) => ({ id: null, condition: newLevelCondition(spec), links: {} });
export const newRuleWithinCondition = (spec) => ({ id: null, condition: newWithinCondition(spec), links: {} });

// ---- captions ----

/**
 * Caption of one rule condition `{condition, links}` at the axes' defaults, with the link notes:
 * `RUN close[0] < RUN SMA(100)[0] × 0.98 (-$Gap = -2, $MaLength = 100)` (BA §3.2 p. 7);
 * a channel condition: `RUN L0 POSITION in [−0.1, 0.2] ($BuyLow = -0.1, $BuyHigh = 0.2)`.
 */
export const ruleConditionCaption = (rc, evalTf, axes = [], opts = {}) => {
  const links = pruneLinks(rc?.condition, rc?.links);
  const applied = applyLinks(rc?.condition, links, axes);
  const text = anyConditionCaption(applied, evalTf, opts);
  const notes = linkNotes(links, axes);
  return notes ? `${text} (${notes})` : text;
};

/** "R2 LongClose: DAY close[0] < DAY SMA(200)[0] AND …" (rule id `R?` for an unsaved rule). */
export const ruleCaption = (rule, evalTf, axes = [], opts = {}) => {
  const head = `${rule.id != null ? `R${rule.id}` : 'R(new)'} ${rule.signalType}`;
  const conds = (rule.conditions || []).map((c) => ruleConditionCaption(c, evalTf, axes, opts));
  return `${head}: ${conds.length ? conds.join(' AND ') : '(no conditions)'}`;
};

/** The operands of a draft's rules (both sides of every condition, constants left out). */
const operandsOf = (rules) => (rules || []).flatMap((r) => (r.conditions || [])
  .flatMap(({ condition: c }) => [c?.left, c?.right]))
  .filter((o) => o && o.kind && o.kind !== CONST_KIND);

/** The first operand kind of the rules that does not run on `tf` (a stage-3b indicator on MIN5); null when none. */
export const kindNotRunningOn = (rules, tf) => operandsOf(rules).find((o) => !runsOn(o.kind, tf))?.kind ?? null;

/**
 * Run TFs the strategy's conditions allow by their operand TFs (stage 3a, architect §2.2):
 * - a fixed DAY operand → DAY only;
 * - a fixed WEEK operand (no DAY) → DAY or WEEK;
 * - only RUN operands (and constants): offsets [0] everywhere → every TF; a RUN offset [−k] →
 *   DAY or WEEK (offsets on HOUR / MIN5 / MONTH are not supported yet).
 * - stage 4a: a channel condition → DAY or WEEK (CHANNEL_RUN_TFS); a DAY channel → DAY only.
 */
const runTfsByOperandsOf = (rules) => {
  let anyDay = false;
  let anyWeek = false;
  let runOffset = false;
  let staged = false;
  let posXTf = null; // stage 4c-1: a fixed TF of a position operand's X (it must equal the run TF)
  const walkOp = (o) => {
    if (!o || o.kind === 'CONST') return;
    if (isPositionOperand(o)) {
      staged = true;
      if (o.x?.tf === 'DAY' || o.x?.tf === 'WEEK') posXTf = posXTf === 'DAY' ? 'DAY' : o.x.tf;
      walkOp(o.x);
      return;
    }
    if (isStagedOperand(o)) { // stage 4b: Levels / bricks run on DAY / WEEK; walk X and the anchor
      staged = true;
      walkOp(o.x);
      walkCond(o.a);
      return;
    }
    if (o.tf === RUN_TF) { if ((Number(o.offset) || 0) !== 0) runOffset = true; }
    else if (o.tf === 'DAY') anyDay = true;
    else if (o.tf === 'WEEK') anyWeek = true;
  };
  const walkCond = (c) => {
    if (!c) return;
    if (isChannelCondition(c)) {
      if (c.tf === 'DAY') anyDay = true;
      else anyWeek = true; // RUN / WEEK channel: DAY or WEEK runs
      return;
    }
    if (isLevelEvent(c)) { staged = true; return; }
    if (isWithin(c)) { staged = true; walkCond(c.of); return; }
    [c.left, c.right].forEach(walkOp);
  };
  (rules || []).forEach((r) => (r.conditions || []).forEach(({ condition }) => walkCond(condition)));
  if (posXTf) return [posXTf]; // X of a position operand reads the run TF: DAY X → DAY runs, WEEK X → WEEK runs
  if (anyDay) return ['DAY'];
  if (anyWeek || runOffset || staged) return [...CHANNEL_RUN_TFS];
  return [...CONSTRUCTED_TFS];
};

/** true when a rule of the draft has a channel condition. */
export const hasChannelCondition = (rules) => (rules || [])
  .some((r) => (r.conditions || []).some(({ condition }) => isChannelCondition(condition)));

/**
 * Run TFs the strategy can run on: those its operand TFs allow (above), minus the TFs an operand's
 * indicator does not run on (its descriptor's runTimeframes; stage 3b F10: the new indicators are
 * not supported on MIN5 yet).
 */
export const runTfsOf = (rules) => runTfsByOperandsOf(rules).filter((tf) => kindNotRunningOn(rules, tf) == null);

/** "(it has DAY conditions)" etc. - why the strategy runs on these TFs. */
export const runTfsHint = (runTfs, rules = null) => {
  if (runTfs.length === 1 && rules && usesPosition(rules)) return `(a position operand reads X on the run TF: X is ${runTfs[0]})`;
  if (runTfs.length === 1) return '(it has DAY conditions)';
  if (runTfs.length === 2 && rules && usesPosition(rules)) return '(position operands run on DAY / WEEK)';
  if (runTfs.length === 2 && rules && hasStagedCondition(rules)) return '(level conditions and sequence bricks run on DAY / WEEK)';
  if (runTfs.length === 2 && rules && hasChannelCondition(rules)) return '(channel conditions run on DAY / WEEK)';
  if (runTfs.length === 2) return '(WEEK conditions or RUN offsets: HOUR / MIN5 / MONTH take only RUN operands at [0])';
  if (!runTfs.includes('MIN5')) return '(only RUN operands at [0]; an indicator of it is not supported on MIN5 yet)';
  return '(only RUN operands at [0]: any TF)';
};

// ---- validation (client copy of ConstructedDefinitionValidator) ----

const isNumber = (v) => v !== '' && v != null && Number.isFinite(Number(v));
const LENGTH_MIN = 5; // SMA's range: the fallback when a linked side has no descriptor
const LENGTH_MAX = 200;
const TOLERANCE_LIMIT = 50;
const GRID_CAP = 10000; // client grid check only below this many points per link
// Wording of the backend's kind-mismatch 400 (architect §3.2: "R1.C1.right.n is a length, $Gap is a tolerance")
const KIND_WORD = Object.freeze({ LENGTH: 'length', TOLERANCE: 'tolerance', CONST: 'constant' });

/** Values of an axis' grid (min..max by step); [value] when fixed. Also the Optimize constraint check. */
export const axisGrid = (a) => {
  const min = Number(a.min);
  const max = Number(a.max);
  const step = Number(a.step);
  if (!(isNumber(a.min) && isNumber(a.max)) || !(max > min) || !(step > 0)) return [Number(a.value)];
  const out = [];
  for (let k = 0; ; k += 1) {
    const v = min + k * step;
    if (v > max + 1e-9 || out.length > GRID_CAP) break;
    out.push(Number(v.toFixed(10)));
  }
  return out;
};

/**
 * First invalid value of a derived threshold, as text (null = ok). A length is checked against the
 * range of the operand it is linked to (`opKind`: SMA 5..200, ATR 2..100, … by the descriptor).
 */
const derivedError = (kind, v, opKind = 'SMA') => {
  if (kind === 'LENGTH') {
    const p = lengthParamOf(opKind);
    const min = p?.min ?? LENGTH_MIN;
    const max = p?.max ?? LENGTH_MAX;
    if (!Number.isInteger(v) || v < min || v > max) return `${kindName(opKind)} ${fmtNum(v)} is not a length ${min}..${max}`;
  } else if (kind === 'TOLERANCE') {
    if (!(Math.abs(v) < TOLERANCE_LIMIT)) return `tolerance ${fmtNum(v)} % is outside (−${TOLERANCE_LIMIT}, ${TOLERANCE_LIMIT})`;
  }
  return null;
};

/** True for a `LEVEL IN_ZONE` operand. */
const isInZone = (o) => o?.kind === LEVEL_KIND && o.output === 'IN_ZONE';

/** The value a side has at a bar inside a zone: 1 for IN_ZONE, a finite constant, else null (unknown). */
const inZoneSideValue = (o) => {
  if (isInZone(o)) return 1;
  if (o?.kind === CONST_KIND && o.value !== '' && o.value != null && Number.isFinite(Number(o.value))) return Number(o.value);
  return null;
};

/** `a op b` as the evaluator compares (left op right × (1 + tolerance / 100)). */
const compareHolds = (a, op, b) => (op === 'GT' ? a > b : op === 'GTE' ? a >= b : op === 'LT' ? a < b : op === 'LTE' ? a <= b : true);

/**
 * m8 (minor #25): IN_ZONE is 1 inside a strong zone and NOT MET (no value) outside one, never 0 - so
 * a comparison with IN_ZONE can only pass inside a zone, at value 1. It is rejected when it is false
 * at 1 against a constant (or IN_ZONE on both sides): `IN_ZONE < 1`, `IN_ZONE > 1`, `1 > IN_ZONE`.
 * `IN_ZONE ≤ 1`, `IN_ZONE < 2`, `2 > IN_ZONE`, `IN_ZONE > 0` hold at 1 and pass. Against a non-constant
 * operand the outcome depends on the bar, so nothing is rejected. `x` has the links applied.
 */
export const inZoneOperatorError = (x) => {
  const leftIn = isInZone(x?.left);
  const rightIn = isInZone(x?.right);
  if (!leftIn && !rightIn) return null;
  const a = inZoneSideValue(x.left);
  const r = inZoneSideValue(x.right);
  if (a == null || r == null || !finite(x.tolerancePct)) return null;
  const b = r * (1 + (Number(x.tolerancePct) || 0) / 100);
  if (compareHolds(a, x.op, b)) return null;
  return `${anyOperandCaption(x.left)} ${opSymbol(x.op)} ${anyOperandCaption(x.right)} never passes: IN_ZONE is 1 inside a zone `
    + 'and "not met" (not 0) outside one, and the comparison is false at 1. Use e.g. IN_ZONE > 0 or IN_ZONE ≥ 1.';
};

/** The meta.levels param of a Levels field (range / integer), from `params` or the fallback. */
const levelsParamOf = (f, params = LEVELS_PARAMS) => (params || LEVELS_PARAMS).find((p) => p.name === f)
  || LEVELS_PARAMS.find((p) => p.name === f) || null;

/** "must be an integer in [1, 500]" / "must be in (0, 50]" - the backend's LevelsSpec / StagedThresholds wording. */
const levelsRangeError = (f, v, params) => {
  const p = levelsParamOf(f, params);
  if (!p) return null;
  const n = Number(v);
  if (!finite(v)) return 'must be a number';
  const low = p.minInclusive ? n < p.min : n <= p.min;
  if ((p.integer && !Number.isInteger(n)) || low || n > p.max) {
    return `must be ${p.integer ? 'an integer ' : ''}in ${p.minInclusive ? '[' : '('}${fmtNum(p.min)}, ${fmtNum(p.max)}]`;
  }
  return null;
};

/**
 * Error of a stage 4b threshold path at a derived value (StagedThresholds.problem + the Levels
 * ranges), null when fine: strength (0, 50], bars an integer [1, kMax], an integer Levels field.
 */
const stagedPathError = (suffix, v, { levelsParams = LEVELS_PARAMS, strengthMax = 50, kMax = 250 } = {}) => {
  if (!Number.isFinite(v)) return 'must be finite';
  if (suffix === 'strength' || suffix.endsWith('.strength')) {
    return v > 0 && v <= strengthMax ? null : `a strength must be in (0, ${fmtNum(strengthMax)}]`;
  }
  if (suffix === 'bars') return Number.isInteger(v) && v >= 1 && v <= kMax ? null : `must be an integer in [1, ${kMax}]`;
  const m = /(?:^|\.)levels\.([A-Za-z]+)$/.exec(suffix);
  if (m) return levelsRangeError(m[1], v, levelsParams);
  return null;
};

/** Errors of every axis: `string[][]` by index, plus general errors (count). */
const validateAxes = (axes, usage, maxAxes = MAX_AXES) => {
  const general = [];
  if (axes.length > maxAxes) general.push(`At most ${maxAxes} axes`);
  const seen = new Map();
  axes.forEach((a) => seen.set(a.name, (seen.get(a.name) || 0) + 1));
  const errors = axes.map((a) => {
    const e = [];
    if (!AXIS_NAME_RE.test(a.name || '')) e.push('Name: $ then a letter, then up to 31 letters / digits (e.g. $Gap)');
    else if (seen.get(a.name) > 1) e.push(`${a.name} is defined twice`);
    if (!AXIS_KINDS.includes(a.kind)) e.push('Unknown kind');
    if (!isNumber(a.value)) e.push('Value must be a number');
    if (!isNumber(a.min) || !isNumber(a.max)) e.push('Min and max must be numbers (min = max = value: fixed)');
    else if (Number(a.min) > Number(a.max)) e.push('Min must be ≤ max');
    else if (Number(a.max) > Number(a.min) && !(Number(a.step) > 0)) e.push('Step must be > 0');
    if (a.kind === 'LENGTH' && [a.value, a.min, a.step].some((v) => isNumber(v) && !Number.isInteger(Number(v)))) {
      e.push('A length axis takes whole numbers (value, min, step)');
    }
    if (isNumber(a.lo) && isNumber(a.value) && Number(a.value) < Number(a.lo)) e.push(`Value must be ≥ ${fmtNum(a.lo)}`);
    if (isNumber(a.hi) && isNumber(a.value) && Number(a.value) > Number(a.hi)) e.push(`Value must be ≤ ${fmtNum(a.hi)}`);
    if (isNumber(a.lo) && isNumber(a.min) && Number(a.min) < Number(a.lo)) e.push(`Min must be ≥ ${fmtNum(a.lo)}`);
    if (isNumber(a.hi) && isNumber(a.max) && Number(a.max) > Number(a.hi)) e.push(`Max must be ≤ ${fmtNum(a.hi)}`);
    if (a.name && !usage[a.name]) e.push(`${a.name} is not used by any threshold: link it or remove it`);
    return e;
  });
  return { general, errors };
};

/**
 * Errors of the links of one condition: unknown axis, kind mismatch (`R1.C1.right.n is a length,
 * $Gap is a tolerance`), 1..2 terms, and the derived value on every point of the axes' default
 * grids (`$FastLength=50 + $Spread=60 = 110: …`; stored lengths are checked by the server).
 */
const validateLinks = (links, axes, where, condition = null, stagedOpts = {}) => {
  const errs = [];
  const opKindOf = (suffix) => {
    if (suffix === 'left.n') return condition?.left?.kind;
    if (suffix === 'right.n') return condition?.right?.kind;
    if (suffix === 'left.x.n') return condition?.left?.x?.kind; // stage 4b: a brick's X length
    if (suffix === 'right.x.n') return condition?.right?.x?.kind;
    if (suffix === 'left.x.x.n') return condition?.left?.x?.x?.kind; // stage 4c-1: a brick X of a position operand
    if (suffix === 'right.x.x.n') return condition?.right?.x?.x?.kind;
    return null;
  };
  const isStagedPath = (suffix) => suffix === 'strength' || suffix === 'bars' || suffix === 'of.strength' || /(^|\.)levels\./.test(suffix);
  const byName = new Map(axes.map((a) => [a.name, a]));
  Object.entries(links || {}).forEach(([suffix, terms]) => {
    const kind = suffixKind(suffix);
    const at = `${where}.${suffix}`;
    if (!terms.length || terms.length > MAX_LINK_TERMS) { errs.push(`${at}: a link has 1 or ${MAX_LINK_TERMS} terms`); return; }
    const missing = terms.filter((t) => !byName.has(t.axis));
    if (missing.length) { errs.push(`${at}: axis ${missing.map((t) => t.axis).join(', ')} does not exist`); return; }
    const wrong = terms.map((t) => byName.get(t.axis)).find((a) => a.kind !== kind);
    if (wrong) {
      errs.push(`${at} is a ${KIND_WORD[kind]}, ${wrong.name} is a ${KIND_WORD[wrong.kind]}`);
      return;
    }
    const grids = terms.map((t) => axisGrid(byName.get(t.axis)));
    if (grids.reduce((n, g) => n * g.length, 1) > GRID_CAP) return;
    const points = grids.length === 1 ? grids[0].map((v) => [v]) : grids[0].flatMap((v) => grids[1].map((w) => [v, w]));
    for (const pt of points) {
      const v = pt.reduce((s, x, i) => s + (terms[i].sign < 0 ? -x : x), 0);
      const bad = isStagedPath(suffix)
        ? stagedPathError(suffix, Number(v.toFixed(10)), stagedOpts)
        : derivedError(kind, Number(v.toFixed(10)), opKindOf(suffix) || 'SMA');
      if (bad) {
        const expr = terms.map((t, i) => `${i === 0 ? (t.sign < 0 ? '−' : '') : (t.sign < 0 ? ' − ' : ' + ')}${t.axis}=${fmtNum(pt[i])}`).join('');
        errs.push(`${at}: ${expr} = ${fmtNum(v)}: ${bad}`);
        break;
      }
    }
  });
  return errs;
};

// ---- axis constraints (stage 3b-2, architect F12 / §5.1) ----
// `{left, op, right}` between two axes of one kind: every compiled point (backtest, preview,
// optimizer point, screening sample) and every pair of the two axes' grid values in Optimize must
// satisfy it; the backend refuses a violating point before the run. Client copy of
// ConstructedDefinitionValidator.constraints + AxisConstraint.Op.holds.

const AXIS_KIND_ARTICLE = Object.freeze({ LENGTH: 'a length', TOLERANCE: 'a tolerance', CONST: 'a constant' });

/** "$TiltSell ≤ $TiltBuy". */
export const constraintText = (c) => `${c?.left || '?'} ${CONSTRAINT_OP_SYMBOL[c?.op] || c?.op || '?'} ${c?.right || '?'}`;

/**
 * Relative tolerance of a constraint comparison: values within CONSTRAINT_EPS·max(1, |a|, |b|) are
 * equal. Same constant as AxisConstraint.Op.holds (minor #111): the backend's ParamVO.gridValues()
 * computes the grid in float (errors up to ~1.5e-8), so nominally equal points must compare equal.
 */
export const CONSTRAINT_EPS = 1e-6;

/** `a op b`; nominally equal values hold for LE / GE and violate LT / GT (AxisConstraint.Op.holds). */
export const constraintHolds = (op, a, b) => {
  const eps = CONSTRAINT_EPS * Math.max(1, Math.abs(a), Math.abs(b));
  if (op === 'LE') return a <= b + eps;
  if (op === 'LT') return a < b - eps;
  if (op === 'GE') return a >= b - eps;
  if (op === 'GT') return a > b + eps;
  return true;
};

/** Pairs the client violation scan checks at most over all constraints (minor #118); the backend checks all. */
const CONSTRAINT_PAIR_CAP = 200000;

/**
 * The first grid point that violates a constraint: `{constraint, left, right}` (the two values),
 * null when every pair holds or the scan stops at CONSTRAINT_PAIR_CAP pairs (the backend still
 * refuses a violating point). `rangeOf(name)` → the axis range `{value, min, max, step}` or null.
 */
export const firstConstraintViolation = (constraints, rangeOf) => {
  let pairs = 0;
  for (const c of constraints || []) {
    if (!CONSTRAINT_OPS.includes(c?.op)) continue;
    const a = rangeOf((c.left || '').trim());
    const b = rangeOf((c.right || '').trim());
    if (!a || !b) continue;
    const gb = axisGrid(b);
    for (const l of axisGrid(a)) {
      for (const r of gb) {
        if (Number.isFinite(l) && Number.isFinite(r) && !constraintHolds(c.op, l, r)) return { constraint: c, left: l, right: r };
        pairs += 1;
        if (pairs >= CONSTRAINT_PAIR_CAP) return null; // too large to scan on every keystroke
      }
    }
  }
  return null;
};

/** "$TiltSell=0.02, $TiltBuy=0 violates $TiltSell ≤ $TiltBuy" of a violation (reads as a violation, not as a true statement). */
export const violationText = (v) => `${v.constraint.left}=${fmtNum(v.left)}, ${v.constraint.right}=${fmtNum(v.right)} violates ${constraintText(v.constraint)}`;

/** True when at least two axes share a kind, i.e. a valid constraint can be built at all. */
export const hasSameKindPair = (axes) => {
  const kinds = new Set();
  for (const a of axes || []) {
    if (!a?.kind) continue;
    if (kinds.has(a.kind)) return true;
    kinds.add(a.kind);
  }
  return false;
};

/**
 * A new constraint: the first pair of axes of one kind not constrained yet (else the first
 * same-kind pair again); null when no two axes share a kind (the editor disables "+ Constraint").
 */
export const newConstraint = (axes, constraints = []) => {
  const list = axes || [];
  const taken = new Set((constraints || []).map((c) => [c.left, c.right].sort().join('|')));
  for (let i = 0; i < list.length; i += 1) {
    for (let j = 0; j < list.length; j += 1) {
      if (i !== j && list[i].kind === list[j].kind && !taken.has([list[i].name, list[j].name].sort().join('|'))) {
        return { left: list[i].name, op: 'LE', right: list[j].name };
      }
    }
  }
  // every same-kind pair is constrained already: offer the first one again (the user edits it)
  const pair = list.flatMap((a, i) => list.filter((b, j) => j !== i && b.kind === a.kind).map((b) => [a, b]))[0];
  if (pair) return { left: pair[0].name, op: 'LE', right: pair[1].name };
  return null;
};

/**
 * Errors of the constraints: `{general: string[], errors: string[][], warnings: string[]}`.
 * Errors (block a save; the backend answers 400 too): left / op / right required, both axes
 * exist, not the same axis, one kind, no duplicate, at most MAX_CONSTRAINTS, the axes' defaults
 * satisfy it. Warning (does not block a save): a point of the axes' default sweep violates it, so
 * Optimize with these default ranges is refused before the run.
 */
export const validateConstraints = (constraints, axes) => {
  const list = constraints || [];
  const general = [];
  const warnings = [];
  if (list.length > MAX_CONSTRAINTS) general.push(`At most ${MAX_CONSTRAINTS} axis constraints`);
  const byName = new Map((axes || []).map((a) => [a.name, a]));
  const seen = new Set();
  const errors = list.map((c) => {
    const l = (c.left || '').trim();
    const r = (c.right || '').trim();
    if (!l || !r || !CONSTRAINT_OPS.includes(c.op)) return ['Left axis, comparison (≤ < ≥ >) and right axis are required'];
    const a = byName.get(l);
    const b = byName.get(r);
    if (!a || !b) return [`Unknown axis ${!a ? l : r}`];
    if (l === r) return [`Compares ${l} with itself`];
    if (a.kind !== b.kind) {
      return [`${l} is ${AXIS_KIND_ARTICLE[a.kind] || a.kind}, ${r} is ${AXIS_KIND_ARTICLE[b.kind] || b.kind}: only axes of one kind can be compared`];
    }
    const e = [];
    const label = `${l} ${c.op} ${r}`;
    if (seen.has(label)) e.push(`${constraintText(c)} is defined twice`);
    seen.add(label);
    if (isNumber(a.value) && isNumber(b.value) && !constraintHolds(c.op, Number(a.value), Number(b.value))) {
      e.push(`The defaults violate it: ${l}=${fmtNum(Number(a.value))} ${CONSTRAINT_OP_SYMBOL[c.op]} ${r}=${fmtNum(Number(b.value))} is false`);
    }
    return e;
  });
  if (errors.every((e) => e.length === 0)) {
    const v = firstConstraintViolation(list, (name) => byName.get(name) || null);
    if (v) {
      warnings.push(`The default sweep has a violating point: ${violationText(v)}. `
        + 'The backend will refuse Optimize with these ranges before the run. Narrow the axes\u2019 Min / Max.');
    }
  }
  return { general, errors, warnings };
};

/**
 * Errors of a stage 4b condition (client copy of FilterValidator's constructor branch / §6): the
 * event and its strength, every Levels spec in range (`R2.C1.right.a.levels.maxDwellBars must be an
 * integer in [1, 500]`), WITHIN's bars and anchor, a brick's X (no constant, no brick) and anchor A
 * (one market condition: a comparison without bricks, a channel condition or a Levels event), lag,
 * offsets, TF RUN and the units of the two sides (ATR_MULTIPLE only with itself or a number). `c` has
 * the links applied. `ctx`: {where, levelsMeta, bricksMeta, channelMeta}.
 */
export const validateStagedCondition = (c, ctx = {}) => {
  const lm = ctx.levelsMeta || DEFAULT_LEVELS_META;
  const bm = ctx.bricksMeta || DEFAULT_BRICKS_META;
  const pm = ctx.positionMeta || DEFAULT_POSITION_META;
  const errs = [];
  const at = (path) => (ctx.where ? `${ctx.where}${path ? `.${path}` : ''}` : path || 'condition');
  const checkSpec = (spec, path) => {
    LEVEL_FIELDS.forEach((f) => {
      const e = levelsRangeError(f, spec?.[f], lm.params);
      if (e) errs.push(`${at(`${path}levels.${f}`)} ${e}`);
    });
    Object.entries(lm.fixed || {}).forEach(([k, v]) => {
      if (finite(spec?.[k]) && Number(spec[k]) !== Number(v)) errs.push(`${at(`${path}levels.${k}`)} must be ${v} in stage 4b`);
    });
  };
  const checkRunTf = (x, path) => {
    if (x?.tf != null && x.tf !== '' && x.tf !== RUN_TF) errs.push(`${at(path)}: level conditions and bricks read the run timeframe (tf RUN)`);
  };
  const checkLevelEvent = (e, path) => {
    checkRunTf(e, path);
    const ev = lm.events.find((x) => x.name === e.event);
    if (!ev) errs.push(`${at(path)}: unknown Levels event ${e.event || ''}`.trim());
    const needs = ev ? ev.needsStrength : eventNeedsStrength(e.event);
    if (needs && !(finite(e.strength) && Number(e.strength) > 0 && Number(e.strength) <= lm.strengthMax)) {
      errs.push(`${at(`${path}${path ? '.' : ''}strength`)}: ${e.event} needs a strength in (0, ${fmtNum(lm.strengthMax)}]`);
    }
    checkSpec(e.levels, path ? `${path}.` : '');
  };
  const checkLevelOperand = (o, path) => {
    checkRunTf(o, path);
    if (!lm.outputs.some((x) => x.name === o.output)) errs.push(`${at(path)}: unknown Levels output ${o.output || ''}`.trim());
    const off = Number(o.offset);
    if (!Number.isInteger(off) || off < OFFSET_MIN || off > 0) errs.push(`${at(path)}: offset must be an integer from ${OFFSET_MIN} to 0`);
    checkSpec(o.levels, `${path}.`);
  };
  /** A market condition: LEVEL_EVENT, CHANNEL_METRIC or COMPARE without bricks (LEVEL operands allowed). */
  const checkMarket = (a, path) => {
    if (a?.type === 'COMPARE' && (isPositionOperand(a.left) || isPositionOperand(a.right))) {
      errs.push(`${at(path)}: the anchor event must be one market condition (no position operands inside)`);
      return;
    }
    if (!a || isWithin(a) || (a.type === 'COMPARE' && (isBrickOperand(a.left) || isBrickOperand(a.right)))) {
      errs.push(`${at(path)}: the anchor event must be one market condition (no bricks inside)`);
      return;
    }
    if (isLevelEvent(a)) checkLevelEvent(a, path);
    else if (isChannelCondition(a)) {
      errs.push(...validateChannelCondition(a, { metrics: ctx.channelMeta?.metrics, ranges: ctx.channelMeta?.ranges, where: at(path) })
        .map((e) => (e.startsWith(at(path)) ? e : `${at(path)}: ${e}`)));
    } else if (a.type === 'COMPARE') checkCompare(a, path, false);
    else errs.push(`${at(path)}: unknown condition type`);
  };
  /**
   * Stage 4c-1: AT_ENTRY(X) / MAX_SINCE_ENTRY(X, lag) / MIN_SINCE_ENTRY(X, lag) on a side of a rule
   * condition (FilterValidator.positionOperand): tf RUN, no offset, lag on the windows only (0..lagMax),
   * X a market operand (a bar field, an indicator, LEVEL or a brick; no constant, no position operand).
   */
  const checkPosition = (o, path) => {
    if (o.tf != null && o.tf !== '' && o.tf !== RUN_TF) errs.push(`${at(`${path}.tf`)}: position operands read the run timeframe (tf RUN)`);
    if ((Number(o.offset) || 0) !== 0) errs.push(`${at(`${path}.offset`)}: position operands have no offset (use lag on MAX_SINCE_ENTRY / MIN_SINCE_ENTRY)`);
    if (isPositionLevelsOperand(o)) { // R5 v2 F1 (FilterValidator.stickySinceEntry)
      if (o.x) errs.push(`${at(`${path}.x`)}: STICKY_SINCE_ENTRY has no value operand: it reads the Levels sticky support of the trade`);
      if (finite(o.lag) && Number(o.lag) !== 0) errs.push(`${at(`${path}.lag`)}: STICKY_SINCE_ENTRY has no lag (its value on a bar is the line after the previous bar)`);
      if (o.output) errs.push(`${at(`${path}.output`)}: STICKY_SINCE_ENTRY has no output (it is the sticky support line itself)`);
      if (!o.levels) errs.push(`${at(`${path}.levels`)} is required for STICKY_SINCE_ENTRY`);
      else checkSpec(o.levels, `${path}.`);
      return;
    }
    if (POSITION_WINDOW_KINDS.includes(o.kind)) {
      const lag = Number(o.lag);
      if (!(finite(o.lag) && Number.isInteger(lag) && lag >= 0 && lag <= pm.lagMax)) errs.push(`${at(`${path}.lag`)} must be an integer in [0, ${pm.lagMax}]`);
    } else if (finite(o.lag) && Number(o.lag) !== 0) {
      errs.push(`${at(`${path}.lag`)}: only MAX_SINCE_ENTRY / MIN_SINCE_ENTRY have a lag`);
    }
    const x = o.x;
    if (!x) { errs.push(`${at(`${path}.x`)} (the market operand) is required for ${o.kind}`); return; }
    if (x.kind === CONST_KIND || isPositionOperand(x)) {
      errs.push(`${at(`${path}.x`)}: ${o.kind} reads a market series (a bar field, an indicator, LEVEL or a brick)`);
      return;
    }
    if (x.kind === LEVEL_KIND) checkLevelOperand(x, `${path}.x`);
    else if (isBrickOperand(x)) checkSide(x, 'left', `${path}.x`, true, false);
    else errs.push(...validateOperand(x, 'left', true).map((e) => `${at(`${path}.x`)}: ${e}`));
  };
  const checkSide = (o, side, path, bricksAllowed, positionAllowed = bricksAllowed) => {
    if (!o) { errs.push(`${at(path)}: missing ${side} operand`); return; }
    if (o.kind === LEVEL_KIND) { checkLevelOperand(o, path); return; }
    if (isPositionOperand(o)) {
      if (!positionAllowed) {
        errs.push(`${at(path)}: ${bricksAllowed ? 'no position operands inside a brick' : 'one market condition (no position operands inside)'}`);
        return;
      }
      checkPosition(o, path);
      return;
    }
    if (isBrickOperand(o)) {
      if (!bricksAllowed) { errs.push(`${at(path)}: the anchor event must be one market condition (no bricks inside)`); return; }
      checkRunTf(o, path);
      if ((Number(o.offset) || 0) !== 0) errs.push(`${at(path)}: a brick has no offset - use lag`);
      if (ANCHORED_KINDS.includes(o.kind)) {
        const x = o.x;
        if (isPositionOperand(x)) errs.push(`${at(`${path}.x`)}: one market condition (no position operands inside a brick)`);
        else if (!x || x.kind === CONST_KIND || isBrickOperand(x)) errs.push(`${at(`${path}.x`)}: X must be a bar field, an indicator or a Levels value (no constant, no brick)`);
        else if (x.kind === LEVEL_KIND) checkLevelOperand(x, `${path}.x`);
        else errs.push(...validateOperand(x, 'left', true).map((e) => `${at(`${path}.x`)}: ${e}`));
        if (o.kind !== 'AT_LAST') {
          const lag = Number(o.lag);
          if (!(finite(o.lag) && Number.isInteger(lag) && lag >= 0 && lag <= bm.lagMax)) errs.push(`${at(`${path}.lag`)} must be an integer in [0, ${bm.lagMax}]`);
        }
      }
      checkMarket(o.a, `${path}.a`);
      return;
    }
    errs.push(...validateOperand(o, side, true).map((e) => `${at(path)}: ${e}`));
  };
  const checkCompare = (x, path, bricksAllowed) => {
    const p = (s) => (path ? `${path}.${s}` : s);
    checkSide(x.left, 'left', p('left'), bricksAllowed);
    checkSide(x.right, 'right', p('right'), bricksAllowed);
    const lu = operandUnitOf(x.left);
    const ru = operandUnitOf(x.right);
    if (lu && ru && lu !== ru) {
      // Stage B3: the plain sentence (utils/displayLabels.js, editor mode)
      errs.push(`${at(path)}: ${unitClashText(x.left, lu, x.right, ru, { mode: EDITOR_MODE })} — `
        + (lu === 'ATR_MULTIPLE' || ru === 'ATR_MULTIPLE'
          ? 'a distance to support / resistance in ATR compares only with another such distance or a number'
          : 'compare values of one unit (a number fits any)'));
    }
    if (!OPERATORS.some((o) => o.value === x.op)) errs.push(`${at(path)}: unknown operator`);
    else {
      const e = inZoneOperatorError(x);
      if (e) errs.push(`${at(path)}: ${e}`);
    }
    if (!finite(x.tolerancePct)) errs.push(`${at(p('tolerancePct'))} must be a number`);
    else if (Math.abs(Number(x.tolerancePct)) >= SCREEN_TOLERANCE_LIMIT) errs.push(`${at(p('tolerancePct'))} must be in (−${SCREEN_TOLERANCE_LIMIT}, ${SCREEN_TOLERANCE_LIMIT})`);
  };
  if (isLevelEvent(c)) checkLevelEvent(c, '');
  else if (isWithin(c)) {
    checkRunTf(c, '');
    const k = Number(c.bars);
    if (!(finite(c.bars) && Number.isInteger(k) && k >= 1 && k <= bm.kMax)) errs.push(`${at('bars')} must be an integer in [1, ${bm.kMax}]`);
    checkMarket(c.of, 'of');
  } else if (c?.type === 'COMPARE') checkCompare(c, '', true);
  return [...new Set(errs)];
};

/**
 * Errors of a draft: `{general: string[], axes: string[][], constraints: string[][],
 * constraintWarnings: string[], rules: [{general: string[], conditions: string[][]}]}`, `ok` when
 * all errors are empty (warnings do not block). `allowedTypes` = meta.signalTypes.
 * Conditions are checked at the axes' defaults (linked thresholds take the axes' values).
 */
export const validateDraft = (draft, { allowedTypes = SIGNAL_TYPES, maxRules = MAX_RULES, maxConditions = MAX_CONDITIONS,
  requireName = true, channelMeta = null, levelsMeta = null, bricksMeta = null, positionMeta = null, maxAxes = MAX_AXES } = {}) => {
  const general = [];
  const name = (draft.name || '').trim();
  if (requireName && !name) general.push('Name is required');
  else if (name.length > 128) general.push('Name is at most 128 characters');
  const rules = draft.rules || [];
  const axes = draft.axes || [];
  if (rules.length === 0) general.push('Add at least one rule');
  if (rules.length > maxRules) general.push(`At most ${maxRules} rules`);
  const axisCheck = validateAxes(axes, axisUsage(rules), maxAxes);
  const stagedOpts = {
    levelsParams: levelsMeta?.params || LEVELS_PARAMS,
    strengthMax: levelsMeta?.strengthMax ?? 50,
    kMax: bricksMeta?.kMax ?? 250,
  };
  general.push(...axisCheck.general);
  const constraintCheck = validateConstraints(draft.constraints, axes);
  general.push(...constraintCheck.general);
  const boundWarnings = [];
  const ruleErrors = rules.map((r) => {
    const g = [];
    if (!allowedTypes.includes(r.signalType)) g.push(`Signal type ${r.signalType} is not available`);
    const conds = r.conditions || [];
    if (conds.length === 0) g.push('A rule needs at least one condition');
    if (conds.length > maxConditions) g.push(`At most ${maxConditions} conditions in a rule`);
    // stage 4c-1 (owner 2026-11-14, ShortClose = A): position operands read a LONG position
    const refused = positionMeta?.refusedInRules || DEFAULT_POSITION_META.refusedInRules;
    if (refused.includes(r.signalType) && ruleUsesPosition(r)) g.push(shortCloseMessage(`R${r.id ?? '(new)'}`));
    const conditions = conds.map(({ id, condition, links }, ci) => {
      const live = pruneLinks(condition, links);
      const where = `R${r.id ?? '(new)'}.C${id ?? ci + 1}`;
      if (isChannelCondition(condition)) {
        // stage 4a: semantics-B channel condition; bounds may link to CONST axes. min > max on a
        // grid point (not at the defaults) is a warning: the backend refuses it before an Optimize run.
        const linkErrs = validateLinks(live, axes, where, condition);
        const errs = [
          ...validateChannelCondition(applyLinks(condition, live, axes), { metrics: channelMeta?.metrics, ranges: channelMeta?.ranges, where }),
          ...linkErrs,
        ];
        const gridErr = errs.length ? null : channelBoundsGridError(condition, live, axes, where);
        if (gridErr) boundWarnings.push(`The default sweep has a point with ${gridErr}. The backend will refuse Optimize with these ranges before the run.`);
        return errs;
      }
      if (isStagedCondition(condition)) {
        // stage 4b: Levels conditions / operands and sequence bricks
        return [
          ...validateStagedCondition(applyLinks(condition, live, axes), { where, levelsMeta, bricksMeta, channelMeta, positionMeta }),
          ...validateLinks(live, axes, where, condition, stagedOpts),
        ];
      }
      return [...validateCondition(applyLinks(condition, live, axes), { allowRun: true }), ...validateLinks(live, axes, where, condition)];
    });
    return { general: g, conditions };
  });
  const ok = general.length === 0 && axisCheck.errors.every((e) => e.length === 0)
    && constraintCheck.errors.every((e) => e.length === 0)
    && ruleErrors.every((r) => r.general.length === 0 && r.conditions.every((c) => c.length === 0));
  return {
    general,
    axes: axisCheck.errors,
    constraints: constraintCheck.errors,
    // stage 4a: channel min > max on a sweep point is shown with the constraint warnings (same consequence)
    constraintWarnings: [...constraintCheck.warnings, ...boundWarnings],
    rules: ruleErrors,
    ok,
  };
};

/** Run TF check of a preview / backtest request (stage 3a, architect §2.2; stage 3b F10). */
export const runTfError = (rules, tf) => {
  if (!CONSTRUCTED_TFS.includes(tf)) return `Unknown run TF ${tf}`;
  const notRunning = kindNotRunningOn(rules, tf);
  if (notRunning) return `${kindName(notRunning)} is not supported on ${tf} yet: ${runTfAdviceOf(notRunning)}`;
  if (runTfsOf(rules).includes(tf)) return null;
  if (!POSITION_RUN_TFS.includes(tf) && usesPosition(rules)) {
    return `Position operands (AT_ENTRY / MAX_SINCE_ENTRY / MIN_SINCE_ENTRY / STICKY_SINCE_ENTRY) run on DAY / WEEK in stage 4c: run this strategy on DAY or WEEK, not ${tf}`;
  }
  if (usesPosition(rules) && runTfsOf(rules).length === 1) {
    return `A position operand reads X on the run timeframe: its X is a ${runTfsOf(rules)[0]} operand, so run on ${runTfsOf(rules)[0]} (or use RUN inside AT_ENTRY / *_SINCE_ENTRY)`;
  }
  if (!LEVELS_RUN_TFS.includes(tf) && hasStagedCondition(rules)) {
    return `Level conditions and sequence bricks run on DAY / WEEK in stage 4: run this strategy on DAY or WEEK, not ${tf}`;
  }
  if (!CHANNEL_RUN_TFS.includes(tf) && hasChannelCondition(rules)) {
    return `Channel conditions run on DAY / WEEK in stage 4: run this strategy on DAY or WEEK, not ${tf}`;
  }
  if (tf === 'WEEK') return 'A WEEK run takes WEEK (or RUN) conditions only: this strategy has DAY conditions';
  return `On ${tf} only RUN operands with offset [0] and constants are allowed: offsets and fixed timeframes on ${tf} are not supported yet`;
};

// ---- hints under a server error (Stage 3a #49; editor UX Stage B3: by `reason` first) ----

// The texts are shared by the reason map and the regex fallback, so an old and a new backend get
// the same advice.
const HINT = Object.freeze({
  constraintViolated: (c) => `${c ? `These axis values break the constraint ${c}` : 'These axis values break an axis constraint'}: `
    + 'the backend refused this run before evaluating anything. '
    + 'A backtest or preview needs values that satisfy it; in Optimize every pair of the two axes’ grid values must satisfy it, '
    + 'so narrow their Min / Max.',
  constraint: 'An axis constraint compares two different axes of one kind (a length with a length, a constant with a constant), '
    + `at most ${MAX_CONSTRAINTS} of them, each once; the axes' default values must satisfy it.`,
  channelMetricB: 'Touch counts (TOUCHES_UPPER / TOUCHES_LOWER) are not available in strategies yet: use Position, Slope, Width, Age or Exists.',
  channelRunTf: 'A strategy with channel conditions runs on DAY or WEEK only (a DAY channel: DAY only).',
  boundsOrder: 'On this point of the axes’ grid the channel condition’s min is above its max: narrow the two axes’ Min / Max '
    + 'or add an axis constraint (e.g. $BuyLow < $BuyHigh).',
  channelDetector: 'Channel detector params: coverage in (0.5, 1], min bars 2..1000, min width in [0, 1), min age 0..500 bars.',
  positionShortClose: 'Position operands read a LONG position. A ShortClose rule with them could only cancel this bar’s long signals: '
    + 'use LongClose for an exit from the long.',
  positionRunTf: 'AT_ENTRY / MAX_SINCE_ENTRY / MIN_SINCE_ENTRY / STICKY_SINCE_ENTRY run on DAY or WEEK, and their X reads the run timeframe (use RUN operands inside).',
  positionPlacement: 'A position operand stands only on a side of a rule’s comparison: not inside a brick, not in WITHIN’s event, not in a screener filter.',
  positionX: 'The X of AT_ENTRY / *_SINCE_ENTRY is a market operand (a bar field, an indicator, a Levels value or a brick), not a constant.',
  positionOffset: 'A position operand has no offset; MAX_SINCE_ENTRY / MIN_SINCE_ENTRY shift their window with lag (lag 1 = the line as of the previous bar), AT_ENTRY has none.',
  levelsRunTf: 'A strategy with Levels conditions or sequence bricks runs on DAY or WEEK only.',
  brickTf: 'Operands inside a brick (its X and its anchor event) must read the run timeframe: use RUN operands, or run on WEEK.',
  brickAnchor: 'A brick’s anchor (and WITHIN’s event) is one market condition: a Levels event, a channel condition or a comparison without bricks.',
  brickOffset: 'A brick has no offset: MAX_SINCE / MIN_SINCE shift their window with lag (lag 1 = the line as of the previous bar).',
  levelsField: 'Levels params: strengths in (0, 50]; buffers and touch tolerance in [0, 5]; RunawayAtr [0, 10]; bar counts whole numbers '
    + '(retest / dwell 1..500, base 0..500, max base 1..1000, touches 1..20); ConfirmMode 0 or 1.',
  levelsStrength: 'SUPPORT_BREAK / RESISTANCE_REACHED need a zone strength in (0, 50].',
  screenerStage4: 'Levels conditions and sequence bricks are not available in screener filters yet (stage 4d).',
  distAtr: 'DIST_SUPPORT_ATR / DIST_RESISTANCE_ATR are distances in ATR, not prices: compare them only with another DIST_* or a number.',
  runTfFixedOffset: 'On HOUR / MIN5 / MONTH a constructed strategy takes only RUN operands with offset [0] (and constants). '
    + 'Offsets and fixed DAY / WEEK operands there are not supported yet — run it on DAY or WEEK, or use RUN [0].',
  indicatorTf: 'The stage-3b indicators (SMA tilt, IBS, ATR, ATR %, efficiency ratio, RSI) do not run on MIN5 yet: '
    + 'run the strategy on HOUR or a coarser timeframe, or use SMA / bar fields on MIN5.',
  runTfScreener: 'The RUN timeframe exists only inside constructed strategies, not in screener filters.',
  linkedInvalid: 'A linked threshold is invalid on that point of the axes\' grid: narrow the axis range (Min / Max) or change the link.',
  axisOutOfRange: 'An axis value is outside its allowed range: change the axis Min / Max (or its fixed value).',
  lengthRange: 'A length must be a whole number of bars within the range shown in the message (SMA and SMA tilt: a stored length).',
  smaNotStored: 'An SMA length the strategy needs is not stored (or stale) for this ticker / timeframe: '
    + 'narrow the length axis to stored lengths, or calculate that SMA first.',
  linkKind: 'A link must use an axis of the same kind: a length with a length axis, a tolerance with a tolerance axis.',
});

/**
 * The extra hint of each backend `reason` (ProblemReason, editor UX Stage B3, screener
 * logs/agents/architect.md §6.2), only where the advice adds something to the (now plain) message:
 * `null` = the message says it all, no hint. A reason not listed here (OTHER, a newer one) falls
 * back to the message regexes. UNIT_MISMATCH and AXIS_CONSTRAINT_VIOLATED also read the message.
 */
export const REASON_ADVICE = Object.freeze({
  RUN_TF_SCREENER: HINT.runTfScreener,
  TF_NOT_ALLOWED: null,
  RUN_TF_FIXED_OFFSET: HINT.runTfFixedOffset,
  INDICATOR_TF: HINT.indicatorTf,
  LENGTH_RANGE: HINT.lengthRange,
  OFFSET_RANGE: null,
  TOLERANCE_RANGE: null,
  CONST_NOT_FINITE: null,
  AXIS_OUT_OF_RANGE: HINT.axisOutOfRange,
  AXIS_UNKNOWN: null,
  AXIS_CONSTRAINT: HINT.constraint,
  BOUNDS_ORDER: HINT.boundsOrder,
  CHANNEL_RUN_TF: HINT.channelRunTf,
  CHANNEL_METRIC_B: HINT.channelMetricB,
  CHANNEL_DETECTOR_RANGE: HINT.channelDetector,
  LEVELS_RUN_TF: HINT.levelsRunTf,
  LEVELS_FIELD_RANGE: HINT.levelsField,
  LEVELS_STRENGTH: HINT.levelsStrength,
  BRICK_TF: HINT.brickTf,
  BRICK_ANCHOR: HINT.brickAnchor,
  BRICK_OFFSET: HINT.brickOffset,
  POSITION_RUN_TF: HINT.positionRunTf,
  POSITION_SHORT_CLOSE: HINT.positionShortClose,
  POSITION_PLACEMENT: HINT.positionPlacement,
  POSITION_X: HINT.positionX,
  POSITION_OFFSET: HINT.positionOffset,
  SCREENER_STAGE4: HINT.screenerStage4,
  BENCHMARK_MARKET: null,
  LIMITS: null,
  MISSING_FIELD: null,
  UNKNOWN_KIND: null,
  // reasons the B3 backend added (screener logs/agents/backend_dev.md): the plain message says it all
  CONST_LEFT: null,
  BRICK_X: null,
  UNKNOWN_VALUE: null,
  LAG_RANGE: null,
  CHANNEL_LEVEL: null,
  CHANNEL_BOUNDS: null,
  WITHIN_BARS: null,
  AXIS_INVALID: null,
  AXIS_UNUSED: null,
  RULE_INVALID: null,
  FILTER_INVALID: null,
  // the "same kind" case gets HINT.linkKind in constructedErrorHint; other link problems say it all
  LINK_INVALID: null,
});

/** The hint texts, for the test proving each one is still reachable through a reason. */
export const CONSTRUCTED_HINTS = HINT;

// Reasons of a value that can come from an axis link: with "$Axis=v" in the message the value is
// linked, and the advice is the linked-threshold one (as the regexes gave it on an old backend).
const LINKABLE_VALUE_REASONS = new Set(['LENGTH_RANGE', 'TOLERANCE_RANGE', 'CONST_NOT_FINITE']);
const LINKED_VALUE_RE = /\$[A-Za-z][A-Za-z0-9]*\s*=/;

/** The constraint text of a "violated (axis constraint $A <= $B)" message, else null. */
const violatedConstraintOf = (m) => /violated \(axis constraint ([^)]+)\)/.exec(m)?.[1]
  // B3 plain message: "The axis values $A=1 and $B=0 break the axis constraint $A <= $B. Pick …"
  || /break the axis constraint (\S+ \S+ \S+?)\.?(?:\s|$)/.exec(m)?.[1] || null;

/** A Levels distance (ATR multiples) named in a UNIT_MISMATCH message, old or plain. */
const DIST_ATR_RE = /ATR_MULTIPLE|ATR multiples|distance to (support|resistance)|DIST_(SUPPORT|RESISTANCE)_ATR/i;

/**
 * A plain-language hint for a 400 of the backend (the server text is shown as is, the hint goes
 * under it); null when there is none. The backtester shows it too (minor #49).
 * Editor UX Stage B3: `reason` (the 400 body's or the failed job's ProblemReason) picks the hint
 * first; an older backend sends none and the message regexes below decide, unchanged.
 */
export const constructedErrorHint = (message, reason = null) => {
  const m = String(message || '');
  if (typeof reason === 'string' && reason) {
    if (reason === 'AXIS_CONSTRAINT_VIOLATED') return HINT.constraintViolated(violatedConstraintOf(m));
    if (reason === 'UNIT_MISMATCH') return DIST_ATR_RE.test(m) ? HINT.distAtr : unitMismatchHint(m, reason);
    if (LINKABLE_VALUE_REASONS.has(reason) && LINKED_VALUE_RE.test(m)) return HINT.linkedInvalid;
    if (reason === 'LINK_INVALID') return /same kind/i.test(m) ? HINT.linkKind : null;
    if (Object.prototype.hasOwnProperty.call(REASON_ADVICE, reason)) return REASON_ADVICE[reason];
  }
  // Stage 3b-2: "$TiltSell=0.02 <= $TiltBuy=0: violated (axis constraint $TiltSell <= $TiltBuy)", as a 400
  // body or as the error of a FAILED optimize / screening job (possibly with a " [CODE]" suffix).
  const violated = violatedConstraintOf(m);
  if (violated) return HINT.constraintViolated(violated);
  // Stage 3b-2 validation: "constraint 1 ($A <= $B): unknown axis $B", "… compares $A with itself",
  // "constraint 1: $A is a length, $B is a constant", "… is not unique", "At most 5 axis constraints"
  if (/^constraint \d+\b|axis constraints/i.test(m)) return HINT.constraint;
  // Stage 4a channel conditions: "R2.C1: TOUCHES_UPPER is not in semantics B yet", "channel conditions run on
  // DAY / WEEK in stage 4", "R1.C2.min = $BuyLow=0.3 > R1.C2.max = $BuyHigh=0.2", "R1.C1.channel.minBars must be in [2, 1000]"
  if (/not in semantics B yet/i.test(m)) return HINT.channelMetricB;
  if (/channel conditions run on DAY/i.test(m)) return HINT.channelRunTf;
  if (/\.min = .*> .*\.max = /.test(m)) return HINT.boundsOrder;
  if (/\.channel\.\w+ must be/i.test(m)) return HINT.channelDetector;
  // Stage 4c-1: position operands
  if (/ShortClose rule with them/i.test(m)) return HINT.positionShortClose;
  if (/position operands run on DAY|operands inside AT_ENTRY/i.test(m)) return HINT.positionRunTf;
  if (/no position operands inside|exist only in constructed strategy rules/i.test(m)) return HINT.positionPlacement;
  if (/reads a market series/i.test(m)) return HINT.positionX;
  if (/position operands have no offset|only MAX_SINCE_ENTRY \/ MIN_SINCE_ENTRY have a lag/i.test(m)) return HINT.positionOffset;
  // Stage 4b: Levels / sequence bricks
  if (/level conditions and sequence bricks run on DAY/i.test(m)) return HINT.levelsRunTf;
  if (/WEEK operands inside a brick|count bars of the run timeframe/i.test(m)) return HINT.brickTf;
  if (/anchor event must be one market condition/i.test(m)) return HINT.brickAnchor;
  if (/use lag/i.test(m)) return HINT.brickOffset;
  if (/\.levels\.\w+.*must be/i.test(m)) return HINT.levelsField;
  if (/a strength must be in|needs a strength/i.test(m)) return HINT.levelsStrength;
  if (/stage 4d/i.test(m)) return HINT.screenerStage4;
  if (/UNIT_MISMATCH/i.test(m) && /ATR_MULTIPLE/.test(m)) return HINT.distAtr;
  const unit = unitMismatchHint(m);
  if (unit) return unit;
  // #49: "R1 LongOpen: offsets and fixed timeframes on HOUR are not supported yet ('…'; use RUN operands at [0])"
  if (/offsets and fixed timeframes|stage 3b/i.test(m)) return HINT.runTfFixedOffset;
  // F10: "R1 LongOpen: ATR(14) on MIN5 is not supported yet"; TIMEFRAME_NOT_SUPPORTED "ATR on MIN5 is not supported yet"
  if (/on MIN5 is not supported yet|TIMEFRAME_NOT_SUPPORTED/i.test(m)) return HINT.indicatorTf;
  if (/RUN is for constructed strategies/i.test(m)) return HINT.runTfScreener;
  // "R1.C1.n ($MaLength = 205): must be an integer SMA length in [5, 200], got 205" (#45: any kind, "… ATR length …")
  if (/\$[A-Za-z][A-Za-z0-9]*\s*=/.test(m) && /not stored|is not a length|outside|must be an integer \w+ length/i.test(m)) {
    return HINT.linkedInvalid;
  }
  // "$Gap must be >= 0, got -1" / "... must be <= 50, got 60" / "... must be finite" / "... integer, got"
  if (/\$[A-Za-z][A-Za-z0-9]*\s+must be\b/.test(m)) return HINT.axisOutOfRange;
  if (/must be an integer \w+ length|\.n must be in \[/i.test(m)) return HINT.lengthRange;
  // SMA_NOT_AVAILABLE: "... 205 (not stored)" - the length has no stored SMA for this ticker / TF
  if (/SMA_NOT_AVAILABLE|\(not stored\)|\(stale: stored to/i.test(m)) return HINT.smaNotStored;
  if (/is a (length|tolerance|SMA length|constant).*\$[A-Za-z]/i.test(m)) return HINT.linkKind;
  return null;
};

// ---- empty rows ----

export const newRuleCondition = () => ({ id: null, condition: newCompareCondition(), links: {} });

export const newRule = (signalType = 'LongOpen') => ({ id: null, signalType, note: '', conditions: [newRuleCondition()] });

export const newDraft = () => ({ id: null, name: '', note: '', version: null, key: null, rules: [newRule()], axes: [], constraints: [] });

/**
 * Comparable form of the definition (rule ids, types, conditions, links; axes when given) - equal
 * = the same definition, i.e. saving creates no new version.
 */
export const rulesSignature = (rules, axes = [], constraints = []) => JSON.stringify({
  r: (rules || []).map((r) => ({
    id: r.id ?? null,
    t: r.signalType,
    c: (r.conditions || []).map((c) => [c.id ?? null, c.condition, pruneLinks(c.condition, c.links)]),
  })),
  a: (axes || []).map((a) => [a.name, a.kind, String(a.value), String(a.min), String(a.max), String(a.step),
    String(a.lo ?? ''), String(a.hi ?? ''), a.note || '']),
  k: (constraints || []).map((c) => [(c.left || '').trim(), c.op, (c.right || '').trim()]),
});

/** rulesSignature of a draft / DTO `{rules, axes, constraints}`. */
export const definitionSignature = (d) => rulesSignature(d?.rules, d?.axes, d?.constraints);

/** Linked value of a threshold of a condition (for the editor), null when not linked. */
export const linkedThresholdValue = (rc, suffix, axes) => {
  const terms = rc?.links?.[suffix];
  return terms && terms.length ? linkValue(terms, axes) : null;
};

// ---- fire rate and warnings ----

const pct = (n, m) => (m > 0 ? `${((n / m) * 100).toFixed(1)} %` : '—');

/** "1358 of 1714 bars (79.2 %)". */
export const ofBars = (n, m) => `${n} of ${m} bars (${pct(n, m)})`;

/** "DATA_GAP 12, INDICATOR_MISSING 3" with human reason texts. */
export const reasonsText = (byReason) => Object.entries(byReason || {})
  .sort((a, b) => b[1] - a[1])
  .map(([r, n]) => `${reasonText(r) || r}: ${n}`)
  .join(', ');

/**
 * The state-rule warning texts of BA spec §4.3 (fallback when the backend sends none). The rule is
 * a state rule by its fire rate in the preview (§4.3 p. 4), not by parsing its conditions.
 */
/**
 * m9: an entry rule (LongOpen / ShortOpen) that never fired in the preview window - the server's
 * banner covers exit rules only. Mostly an anchor brick that is rarely evaluated (e.g. MIN_SINCE over
 * SETUP_STOP: empty window outside a confirmation; AT_LAST is the brick for the setup lines).
 */
export const deadEntryRuleWarning = (rule, bars) => {
  if (!(bars > 0) || rule.fired > 0 || !(rule.signalType === 'LongOpen' || rule.signalType === 'ShortOpen')) return null;
  const ne = rule.notEvaluated > 0 ? `; not evaluated on ${ofBars(rule.notEvaluated, bars)}` : '';
  return `Entry rule never fired on the ${bars} bars of the preview${ne}: the strategy cannot open a position with it. `
    + 'Check the window and the conditions - a SETUP_STOP / SETUP_ZONE_LINE value exists only on a confirmation bar, so read it '
    + 'with AT_LAST(…, CONFIRMED_ANY), not MIN_SINCE / MAX_SINCE.';
};

export const stateRuleWarning = (rule, bars, rate = STATE_RULE_FIRE_RATE) => {
  if (!(bars > 0) || rule.fired / bars <= rate) return null;
  const freq = ofBars(rule.fired, bars);
  if (rule.signalType === 'LongOpen' || rule.signalType === 'ShortOpen') {
    return `State rule: fires on ${freq}. In a merge it opens a position on every such bar, including right after `
      + 'another strategy\'s exit. For an entry on a cross add a condition with offset [−1]. To forbid entries use LongBlock.';
  }
  if (rule.signalType === 'LongClose') {
    return `State rule: fires on ${freq}. It closes the position and forbids entries on every bar where it holds. `
      + 'If you only need to forbid entries, use LongBlock.';
  }
  return null;
};

/**
 * Overfitting hint of §5.2: `{k, t, ratio, warn}`; warn when k > 0 and t / k < minTrades.
 */
export const tradesPerThreshold = (k, t, minTrades = MIN_TRADES_PER_THRESHOLD) => {
  const ratio = k > 0 ? t / k : null;
  return { k, t, ratio, warn: k > 0 && ratio < minTrades };
};

/** Total trades of a StrategyResultDTO: closed long + closed short + open positions. */
export const resultTradeCount = (results) => {
  if (!results) return 0;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let t = n(results.profitableTradesCount) + n(results.lostTradesCount) + (results.hasOpenPosition === true ? 1 : 0);
  if (results.longOnly !== true) {
    t += n(results.profitableShortTradesCount) + n(results.lostShortTradesCount)
      + (results.hasOpenShortPosition === true ? 1 : 0);
  }
  return t;
};
