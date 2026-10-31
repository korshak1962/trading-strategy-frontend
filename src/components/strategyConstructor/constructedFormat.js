// src/components/strategyConstructor/constructedFormat.js
//
// Pure helpers of the strategy constructor (screener architect.md "Конструктор стратегий" §4.9):
// the request key `Constructed:<id>@<version>`, threshold names `R<rule>.C<cond>.<field>`, rule
// captions, the client copy of the definition validation, fire-rate texts and the warnings of
// BA spec §4.3 / §5.2 (Q11). The server stays the authority: its 400 text is shown as is.

import { SIGNAL_TYPES, STATE_RULE_FIRE_RATE, MIN_TRADES_PER_THRESHOLD, MAX_RULES, MAX_CONDITIONS } from '../../api/constructedApi';
import { conditionCaption, validateCondition, newCompareCondition, reasonText } from '../universeScreener/conditionFormat';

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
export const strategyDisplayName = (key, availableStrategies = []) => {
  const k = parseConstructedKey(key);
  if (!k) return key;
  const info = (availableStrategies || []).find((s) => isConstructedInfo(s)
    && (s.constructedId ?? parseConstructedKey(s.name)?.id) === k.id);
  const name = info?.displayName || `Constructed #${k.id}`;
  return `${name} v${k.version}`;
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
  'left.n': 'left SMA length',
  'right.n': 'right SMA length',
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

/** Params of one constructed strategy grouped by rule: `[{rule, entries: [[paramName, param]]}]`, others last. */
export const groupThresholds = (params) => {
  const groups = new Map();
  const other = [];
  Object.entries(params || {}).forEach(([name, p]) => {
    const t = parseThresholdName(name);
    if (!t) { other.push([name, p]); return; }
    if (!groups.has(t.rule)) groups.set(t.rule, []);
    groups.get(t.rule).push([name, p]);
  });
  const out = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rule, entries]) => ({
    rule,
    entries: entries.sort((a, b) => a[0].localeCompare(b[0])),
  }));
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

/** "R2 LongClose: DAY close[0] < DAY SMA(200)[0] AND …" (rule id `R?` for an unsaved rule). */
export const ruleCaption = (rule, evalTf) => {
  const head = `${rule.id != null ? `R${rule.id}` : 'R(new)'} ${rule.signalType}`;
  const conds = (rule.conditions || []).map((c) => conditionCaption(c.condition, evalTf));
  return `${head}: ${conds.length ? conds.join(' AND ') : '(no conditions)'}`;
};

/** TF of the strategy's conditions: any DAY operand → runs on DAY only, else on DAY or WEEK. */
export const runTfsOf = (rules) => {
  let anyDay = false;
  let anyOperand = false;
  (rules || []).forEach((r) => (r.conditions || []).forEach(({ condition: c }) => {
    [c?.left, c?.right].forEach((o) => {
      if (o && o.kind !== 'CONST') {
        anyOperand = true;
        if (o.tf === 'DAY') anyDay = true;
      }
    });
  }));
  if (!anyOperand) return ['DAY', 'WEEK'];
  return anyDay ? ['DAY'] : ['DAY', 'WEEK'];
};

// ---- validation (client copy of ConstructedDefinitionValidator) ----

/**
 * Errors of a draft: `{general: string[], rules: [{general: string[], conditions: string[][]}]}`,
 * `ok` when all are empty. `allowedTypes` = meta.signalTypes.
 */
export const validateDraft = (draft, { allowedTypes = SIGNAL_TYPES, maxRules = MAX_RULES, maxConditions = MAX_CONDITIONS,
  requireName = true } = {}) => {
  const general = [];
  const name = (draft.name || '').trim();
  if (requireName && !name) general.push('Name is required');
  else if (name.length > 128) general.push('Name is at most 128 characters');
  const rules = draft.rules || [];
  if (rules.length === 0) general.push('Add at least one rule');
  if (rules.length > maxRules) general.push(`At most ${maxRules} rules`);
  const ruleErrors = rules.map((r) => {
    const g = [];
    if (!allowedTypes.includes(r.signalType)) g.push(`Signal type ${r.signalType} is not available`);
    const conds = r.conditions || [];
    if (conds.length === 0) g.push('A rule needs at least one condition');
    if (conds.length > maxConditions) g.push(`At most ${maxConditions} conditions in a rule`);
    const conditions = conds.map(({ condition }) => (condition?.type === 'CHANNEL_METRIC'
      ? ['Channel conditions in constructed strategies arrive in stage 4']
      : validateCondition(condition)));
    return { general: g, conditions };
  });
  const ok = general.length === 0 && ruleErrors.every((r) => r.general.length === 0 && r.conditions.every((c) => c.length === 0));
  return { general, rules: ruleErrors, ok };
};

/** Run TF check of a preview / backtest request (Q7, §4.3: a WEEK run takes WEEK conditions only). */
export const runTfError = (rules, tf) => {
  if (!['DAY', 'WEEK'].includes(tf)) return 'A constructed strategy runs on DAY or WEEK only';
  if (!runTfsOf(rules).includes(tf)) return 'A WEEK run takes WEEK conditions only: this strategy has DAY conditions';
  return null;
};

// ---- empty rows ----

export const newRuleCondition = () => ({ id: null, condition: newCompareCondition() });

export const newRule = (signalType = 'LongOpen') => ({ id: null, signalType, note: '', conditions: [newRuleCondition()] });

export const newDraft = () => ({ id: null, name: '', note: '', version: null, key: null, rules: [newRule()] });

/** Comparable form of the rules (ids, types, conditions) - equal = the same definition. */
export const rulesSignature = (rules) => JSON.stringify((rules || []).map((r) => ({
  id: r.id ?? null,
  t: r.signalType,
  c: (r.conditions || []).map((c) => [c.id ?? null, c.condition]),
})));

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
