// src/components/strategyConstructor/constructedFormat.js
//
// Pure helpers of the strategy constructor (screener architect.md "Конструктор стратегий" §4.9):
// the request key `Constructed:<id>@<version>`, threshold names `R<rule>.C<cond>.<field>`, rule
// captions, the client copy of the definition validation, fire-rate texts and the warnings of
// BA spec §4.3 / §5.2 (Q11). The server stays the authority: its 400 text is shown as is.

import {
  SIGNAL_TYPES, STATE_RULE_FIRE_RATE, MIN_TRADES_PER_THRESHOLD, MAX_RULES, MAX_CONDITIONS, CONSTRUCTED_TFS, RUN_TF,
  AXIS_KINDS, LINK_SUFFIX_KIND, MAX_AXES, MAX_LINK_TERMS, applyLinks, pruneLinks, linkValue,
} from '../../api/constructedApi';
import {
  conditionCaption, validateCondition, newCompareCondition, reasonText, fmtNum, unitMismatchHint,
} from '../universeScreener/conditionFormat';
import { lengthParamOf, kindName, runsOn, CONST_KIND } from '../../api/indicatorCatalog';

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

const THRESHOLD_RE = /^R(\d+)\.C(\d+)\.(tolerancePct|left\.n|right\.n|right\.const)$/;
const FIELD_LABEL = {
  tolerancePct: 'tolerance %',
  'left.n': 'left length',
  'right.n': 'right length',
  'right.const': 'constant',
};

/** `R1.C2.tolerancePct` → `{rule: 1, cond: 2, field: 'tolerancePct', label: 'R1 · condition 2 · tolerance %'}`. */
export const parseThresholdName = (name) => {
  const m = typeof name === 'string' ? THRESHOLD_RE.exec(name) : null;
  if (!m) return null;
  const rule = Number(m[1]);
  const cond = Number(m[2]);
  return { rule, cond, field: m[3], label: `R${rule} · condition ${cond} · ${FIELD_LABEL[m[3]]}` };
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
export const suffixKind = (suffix) => LINK_SUFFIX_KIND[suffix] || null;

/** "+$MaLength" → "$MaLength", "−$Gap", "$FastLength + $Spread". */
export const linkText = (terms) => (terms || []).map((t, i) => {
  if (i === 0) return t.sign < 0 ? `−${t.axis}` : t.axis;
  return `${t.sign < 0 ? '−' : '+'} ${t.axis}`;
}).join(' ');

/** The order the backend writes a condition's link notes in (ConstructedThresholds.compile). */
const LINK_NOTE_ORDER = ['tolerancePct', 'left.n', 'right.n', 'right.const'];

/**
 * One note per link of a condition, the same text as the backend's preview notes (reviewer #34):
 * field order tolerance, left.n, right.n, right.const; the term signs and the linked value -
 * "-$Gap = -2, $MaLength = 100", "$FastLength + $Spread = 50". Joined by ", ".
 */
export const linkNotes = (links, axes) => LINK_NOTE_ORDER
  .filter((suffix) => Array.isArray(links?.[suffix]) && links[suffix].length > 0)
  .map((suffix) => {
    const terms = links[suffix];
    const expr = terms.map((t, i) => (i === 0 ? `${t.sign < 0 ? '-' : ''}${t.axis}` : `${t.sign < 0 ? '-' : '+'} ${t.axis}`)).join(' ');
    const v = linkValue(terms, axes);
    return `${expr} = ${v == null ? '?' : fmtNum(v).replace('−', '-')}`;
  })
  .join(', ');

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
export const newAxis = (axes, kind = 'LENGTH', value = null) => {
  const base = kind === 'LENGTH' ? 'Length' : kind === 'TOLERANCE' ? 'Gap' : 'Level';
  const v = value ?? (kind === 'LENGTH' ? 50 : 0);
  return { name: freeAxisName(axes, base), kind, value: v, min: v, max: v, step: kind === 'LENGTH' ? 5 : 0.5, lo: '', hi: '', note: '' };
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
    entries: entries.sort((a, b) => a[0].localeCompare(b[0])),
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

// ---- captions ----

/**
 * Caption of one rule condition `{condition, links}` at the axes' defaults, with the link notes:
 * `RUN close[0] < RUN SMA(100)[0] × 0.98 (-$Gap = -2, $MaLength = 100)` (BA §3.2 p. 7).
 */
export const ruleConditionCaption = (rc, evalTf, axes = []) => {
  const links = pruneLinks(rc?.condition, rc?.links);
  const text = conditionCaption(applyLinks(rc?.condition, links, axes), evalTf);
  const notes = linkNotes(links, axes);
  return notes ? `${text} (${notes})` : text;
};

/** "R2 LongClose: DAY close[0] < DAY SMA(200)[0] AND …" (rule id `R?` for an unsaved rule). */
export const ruleCaption = (rule, evalTf, axes = []) => {
  const head = `${rule.id != null ? `R${rule.id}` : 'R(new)'} ${rule.signalType}`;
  const conds = (rule.conditions || []).map((c) => ruleConditionCaption(c, evalTf, axes));
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
 */
const runTfsByOperandsOf = (rules) => {
  let anyDay = false;
  let anyWeek = false;
  let runOffset = false;
  (rules || []).forEach((r) => (r.conditions || []).forEach(({ condition: c }) => {
    [c?.left, c?.right].forEach((o) => {
      if (!o || o.kind === 'CONST') return;
      if (o.tf === RUN_TF) { if ((Number(o.offset) || 0) !== 0) runOffset = true; }
      else if (o.tf === 'DAY') anyDay = true;
      else if (o.tf === 'WEEK') anyWeek = true;
    });
  }));
  if (anyDay) return ['DAY'];
  if (anyWeek || runOffset) return ['DAY', 'WEEK'];
  return [...CONSTRUCTED_TFS];
};

/**
 * Run TFs the strategy can run on: those its operand TFs allow (above), minus the TFs an operand's
 * indicator does not run on (its descriptor's runTimeframes; stage 3b F10: the new indicators are
 * not supported on MIN5 yet).
 */
export const runTfsOf = (rules) => runTfsByOperandsOf(rules).filter((tf) => kindNotRunningOn(rules, tf) == null);

/** "(it has DAY conditions)" etc. - why the strategy runs on these TFs. */
export const runTfsHint = (runTfs) => {
  if (runTfs.length === 1) return '(it has DAY conditions)';
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

/** Values of an axis' default grid (min..max by step); [value] when fixed. */
const axisGrid = (a) => {
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

/** Errors of every axis: `string[][]` by index, plus general errors (count). */
const validateAxes = (axes, usage) => {
  const general = [];
  if (axes.length > MAX_AXES) general.push(`At most ${MAX_AXES} axes`);
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
const validateLinks = (links, axes, where, condition = null) => {
  const errs = [];
  const opKindOf = (suffix) => {
    if (suffix === 'left.n') return condition?.left?.kind;
    if (suffix === 'right.n') return condition?.right?.kind;
    return null;
  };
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
      const bad = derivedError(kind, Number(v.toFixed(10)), opKindOf(suffix) || 'SMA');
      if (bad) {
        const expr = terms.map((t, i) => `${i === 0 ? (t.sign < 0 ? '−' : '') : (t.sign < 0 ? ' − ' : ' + ')}${t.axis}=${fmtNum(pt[i])}`).join('');
        errs.push(`${at}: ${expr} = ${fmtNum(v)}: ${bad}`);
        break;
      }
    }
  });
  return errs;
};

/**
 * Errors of a draft: `{general: string[], axes: string[][], rules: [{general: string[],
 * conditions: string[][]}]}`, `ok` when all are empty. `allowedTypes` = meta.signalTypes.
 * Conditions are checked at the axes' defaults (linked thresholds take the axes' values).
 */
export const validateDraft = (draft, { allowedTypes = SIGNAL_TYPES, maxRules = MAX_RULES, maxConditions = MAX_CONDITIONS,
  requireName = true } = {}) => {
  const general = [];
  const name = (draft.name || '').trim();
  if (requireName && !name) general.push('Name is required');
  else if (name.length > 128) general.push('Name is at most 128 characters');
  const rules = draft.rules || [];
  const axes = draft.axes || [];
  if (rules.length === 0) general.push('Add at least one rule');
  if (rules.length > maxRules) general.push(`At most ${maxRules} rules`);
  const axisCheck = validateAxes(axes, axisUsage(rules));
  general.push(...axisCheck.general);
  const ruleErrors = rules.map((r) => {
    const g = [];
    if (!allowedTypes.includes(r.signalType)) g.push(`Signal type ${r.signalType} is not available`);
    const conds = r.conditions || [];
    if (conds.length === 0) g.push('A rule needs at least one condition');
    if (conds.length > maxConditions) g.push(`At most ${maxConditions} conditions in a rule`);
    const conditions = conds.map(({ id, condition, links }, ci) => {
      if (condition?.type === 'CHANNEL_METRIC') return ['Channel conditions in constructed strategies arrive in stage 4'];
      const live = pruneLinks(condition, links);
      const where = `R${r.id ?? '(new)'}.C${id ?? ci + 1}`;
      return [...validateCondition(applyLinks(condition, live, axes), { allowRun: true }), ...validateLinks(live, axes, where, condition)];
    });
    return { general: g, conditions };
  });
  const ok = general.length === 0 && axisCheck.errors.every((e) => e.length === 0)
    && ruleErrors.every((r) => r.general.length === 0 && r.conditions.every((c) => c.length === 0));
  return { general, axes: axisCheck.errors, rules: ruleErrors, ok };
};

/** Run TF check of a preview / backtest request (stage 3a, architect §2.2; stage 3b F10). */
export const runTfError = (rules, tf) => {
  if (!CONSTRUCTED_TFS.includes(tf)) return `Unknown run TF ${tf}`;
  const notRunning = kindNotRunningOn(rules, tf);
  if (notRunning) return `${kindName(notRunning)} is not supported on ${tf} yet: run the strategy on HOUR or a coarser timeframe`;
  if (runTfsOf(rules).includes(tf)) return null;
  if (tf === 'WEEK') return 'A WEEK run takes WEEK (or RUN) conditions only: this strategy has DAY conditions';
  return `On ${tf} only RUN operands with offset [0] and constants are allowed: offsets and fixed timeframes on ${tf} are not supported yet`;
};

/**
 * A plain-language hint for a 400 of the backend (the server text is shown as is, the hint goes
 * under it); null when there is none. The backtester shows it too (minor #49).
 */
export const constructedErrorHint = (message) => {
  const m = String(message || '');
  const unit = unitMismatchHint(m);
  if (unit) return unit;
  // #49: "R1 LongOpen: offsets and fixed timeframes on HOUR are not supported yet ('…'; use RUN operands at [0])"
  if (/offsets and fixed timeframes|stage 3b/i.test(m)) {
    return 'On HOUR / MIN5 / MONTH a constructed strategy takes only RUN operands with offset [0] (and constants). '
      + 'Offsets and fixed DAY / WEEK operands there are not supported yet — run it on DAY or WEEK, or use RUN [0].';
  }
  // F10: "R1 LongOpen: ATR(14) on MIN5 is not supported yet"; TIMEFRAME_NOT_SUPPORTED "ATR on MIN5 is not supported yet"
  if (/on MIN5 is not supported yet|TIMEFRAME_NOT_SUPPORTED/i.test(m)) {
    return 'The stage-3b indicators (SMA tilt, IBS, ATR, ATR %, efficiency ratio, RSI) do not run on MIN5 yet: '
      + 'run the strategy on HOUR or a coarser timeframe, or use SMA / bar fields on MIN5.';
  }
  if (/RUN is for constructed strategies/i.test(m)) return 'The RUN timeframe exists only inside constructed strategies, not in screener filters.';
  // "R1.C1.n ($MaLength = 205): must be an integer SMA length in [5, 200], got 205" (#45: any kind, "… ATR length …")
  if (/\$[A-Za-z][A-Za-z0-9]*\s*=/.test(m) && /not stored|is not a length|outside|must be an integer \w+ length/i.test(m)) {
    return 'A linked threshold is invalid on that point of the axes\' grid: narrow the axis range (Min / Max) or change the link.';
  }
  // "$Gap must be >= 0, got -1" / "... must be <= 50, got 60" / "... must be finite" / "... integer, got"
  if (/\$[A-Za-z][A-Za-z0-9]*\s+must be\b/.test(m)) {
    return 'An axis value is outside its allowed range: change the axis Min / Max (or its fixed value).';
  }
  if (/must be an integer \w+ length|\.n must be in \[/i.test(m)) {
    return 'A length must be a whole number of bars within the range shown in the message (SMA and SMA tilt: a stored length).';
  }
  // SMA_NOT_AVAILABLE: "... 205 (not stored)" - the length has no stored SMA for this ticker / TF
  if (/SMA_NOT_AVAILABLE|\(not stored\)|\(stale: stored to/i.test(m)) {
    return 'An SMA length the strategy needs is not stored (or stale) for this ticker / timeframe: '
      + 'narrow the length axis to stored lengths, or calculate that SMA first.';
  }
  if (/is a (length|tolerance|SMA length|constant).*\$[A-Za-z]/i.test(m)) {
    return 'A link must use an axis of the same kind: a length with a length axis, a tolerance with a tolerance axis.';
  }
  return null;
};

// ---- empty rows ----

export const newRuleCondition = () => ({ id: null, condition: newCompareCondition(), links: {} });

export const newRule = (signalType = 'LongOpen') => ({ id: null, signalType, note: '', conditions: [newRuleCondition()] });

export const newDraft = () => ({ id: null, name: '', note: '', version: null, key: null, rules: [newRule()], axes: [] });

/**
 * Comparable form of the definition (rule ids, types, conditions, links; axes when given) - equal
 * = the same definition, i.e. saving creates no new version.
 */
export const rulesSignature = (rules, axes = []) => JSON.stringify({
  r: (rules || []).map((r) => ({
    id: r.id ?? null,
    t: r.signalType,
    c: (r.conditions || []).map((c) => [c.id ?? null, c.condition, pruneLinks(c.condition, c.links)]),
  })),
  a: (axes || []).map((a) => [a.name, a.kind, String(a.value), String(a.min), String(a.max), String(a.step),
    String(a.lo ?? ''), String(a.hi ?? ''), a.note || '']),
});

/** rulesSignature of a draft / DTO `{rules, axes}`. */
export const definitionSignature = (d) => rulesSignature(d?.rules, d?.axes);

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
