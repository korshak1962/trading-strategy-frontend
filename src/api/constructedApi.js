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

import { apiRequest, readJson, jsonBody, enc } from './httpClient';
import { toConditionDTO, fromConditionDTO } from './screenerApi';

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
});
export const MAX_AXES = 10;
export const MAX_LINK_TERMS = 2;
/** SMA descriptor fallback when /meta has no indicators[] (E1). */
export const DEFAULT_INDICATORS = Object.freeze([{
  name: 'SMA', params: [{ name: 'n', integer: true, min: 5, max: 200, storedOnly: true }], source: 'close',
  unit: 'PRICE', lo: 0, hi: null, warmup: null, timeframes: ['DAY', 'WEEK', 'RUN'], linearInNextClose: true,
}]);
export const STATE_RULE_FIRE_RATE = 0.2;   // Q11: a LongOpen / ShortOpen rule firing on > 20 % of bars
export const MIN_TRADES_PER_THRESHOLD = 10; // Q11: trades per threshold in sweep
export const MAX_RULES = 20;
export const MAX_CONDITIONS = 10;

export const DEFAULT_META = Object.freeze({
  signalTypes: SIGNAL_TYPES,
  timeframes: CONSTRUCTED_TFS,
  stateRuleFireRate: STATE_RULE_FIRE_RATE,
  minTradesPerThreshold: MIN_TRADES_PER_THRESHOLD,
  maxRules: MAX_RULES,
  maxConditions: MAX_CONDITIONS,
  indicators: DEFAULT_INDICATORS,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

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
});

/**
 * IndicatorDescriptor `{name, params[{name, integer, min, max, storedOnly}], source, unit, lo, hi,
 * warmup?, timeframes[], linearInNextClose}` (architect §1.1) → the same, defaulted. The warmup is
 * a function on the backend: it may arrive as a text or not at all.
 */
function normalizeIndicator(d) {
  if (!d || typeof d.name !== 'string' || !d.name) return null;
  return {
    name: d.name,
    params: (Array.isArray(d.params) ? d.params : []).filter((p) => p && p.name).map((p) => ({
      name: p.name,
      integer: p.integer !== false,
      min: isNum(p.min) ? p.min : null,
      max: isNum(p.max) ? p.max : null,
      storedOnly: p.storedOnly === true,
    })),
    source: d.source ?? null,
    unit: d.unit ?? null,
    lo: isNum(d.lo) ? d.lo : null,
    hi: isNum(d.hi) ? d.hi : null,
    warmup: typeof d.warmup === 'string' ? d.warmup : null,
    timeframes: Array.isArray(d.timeframes) ? d.timeframes : [],
    linearInNextClose: d.linearInNextClose === true,
  };
}

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

/** Wire LinkExpr (`{terms}` or a bare terms array) → editor terms `[{sign, axis}]`, null when empty. */
const fromLinkExpr = (x) => {
  const terms = Array.isArray(x) ? x : Array.isArray(x?.terms) ? x.terms : [];
  const out = terms.filter((t) => t && typeof t.axis === 'string' && t.axis)
    .map((t) => ({ sign: Number(t.sign) < 0 ? -1 : 1, axis: t.axis }));
  return out.length ? out : null;
};

/** Wire `links` map → editor `{suffix: terms}` (only the known suffixes). */
export const fromLinksDTO = (links) => {
  const out = {};
  if (links && typeof links === 'object') {
    Object.entries(links).forEach(([suffix, x]) => {
      if (!LINK_SUFFIX_KIND[suffix]) return;
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
 * The condition with every linked threshold replaced by its value at the axes' defaults. The
 * backend overwrites the literal the same way on save (§3.1), so the literal sent equals what the
 * preview / import will see. Unknown axis → the literal is kept.
 */
export const applyLinks = (condition, links, axes) => {
  if (!condition || condition.type !== 'COMPARE' || !links || !Object.keys(links).length) return condition;
  const c = { ...condition, left: { ...condition.left }, right: { ...condition.right } };
  Object.entries(links).forEach(([suffix, terms]) => {
    const v = linkValue(terms, axes);
    if (v == null) return;
    if (suffix === 'tolerancePct') c.tolerancePct = v;
    else if (suffix === 'left.n') c.left.n = v;
    else if (suffix === 'right.n') c.right.n = v;
    else if (suffix === 'right.const') c.right.value = v;
  });
  return c;
};

/** The suffixes a condition can carry a link on (an SMA side's length, a constant, the tolerance). */
export const linkableSuffixes = (condition) => {
  if (!condition || condition.type !== 'COMPARE') return [];
  const out = [];
  if (condition.left?.kind === 'SMA') out.push('left.n');
  if (condition.right?.kind === 'SMA') out.push('right.n');
  if (condition.right?.kind === 'CONST') out.push('right.const');
  out.push('tolerancePct');
  return out;
};

/** Links of a condition without the ones its operands no longer have (e.g. the right side became CONST). */
export const pruneLinks = (condition, links) => {
  const allowed = new Set(linkableSuffixes(condition));
  return Object.fromEntries(Object.entries(links || {})
    .filter(([s, t]) => allowed.has(s) && Array.isArray(t) && t.length));
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
    const out = { id: c.id ?? null, condition: toConditionDTO(applyLinks(c.condition, links, axes)) };
    const wire = toLinksDTO(links);
    if (wire) out.links = wire;
    return out;
  }),
});

/** Editor draft → the definition `{rules[], axes?[]}` (axes only when there are any). */
export const toDefinitionRequest = (draft) => {
  const out = { rules: (draft.rules || []).map((r) => toRuleRequest(r, draft.axes || [])) };
  if ((draft.axes || []).length) out.axes = draft.axes.map(toAxisDTO);
  return out;
};

/** Editor draft → ConstructedStrategyRequest `{name, note, rules[], axes?[]}`. */
export const toConstructedRequest = (draft) => ({
  name: (draft.name || '').trim(),
  note: draft.note ? draft.note : null,
  ...toDefinitionRequest(draft),
});

/** RuleDTO → editor rule. */
export const fromRuleDTO = (r) => ({
  id: r?.id ?? null,
  signalType: SIGNAL_TYPES.includes(r?.signalType) ? r.signalType : 'LongOpen',
  note: r?.note || '',
  conditions: (Array.isArray(r?.conditions) ? r.conditions : []).map((c) => ({
    id: c?.id ?? null,
    // RuleConditionDTO {id, condition, links?}; a bare FilterConditionDTO is accepted too
    condition: fromConditionDTO(c?.condition ?? c),
    links: fromLinksDTO(c?.links),
  })),
});

/** Rules / axes of a DTO: top level, or nested in `definition` (TemplateDTO). */
const rulesOf = (d) => (Array.isArray(d?.rules) ? d.rules : Array.isArray(d?.definition?.rules) ? d.definition.rules : []);
const axesOf = (d) => (Array.isArray(d?.axes) ? d.axes : Array.isArray(d?.definition?.axes) ? d.definition.axes : [])
  .map(fromAxisDTO);

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
 * ConstructedStrategyDTO `{id, name, note, version, key, rules, axes?, templateId?, deleted,
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
    templateId: d.templateId ?? null,
    deleted: d.deleted === true,
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
    usage: (Array.isArray(d.usage) ? d.usage : []).map(normalizeUsage),
    params: Array.isArray(d.params) ? d.params : [],
    versionChanged: typeof d.versionChanged === 'boolean' ? d.versionChanged : null,
  };
};

/** ConstructedStrategySummaryDTO `{id, name, version, key, ruleCount, signalTypes[], updatedAt, templateId?}`. */
const normalizeSummary = (s) => ({
  id: s?.id ?? null,
  name: s?.name || '',
  version: s?.version ?? null,
  key: s?.key ?? (s?.id != null && s?.version != null ? `Constructed:${s.id}@${s.version}` : null),
  ruleCount: isNum(s?.ruleCount) ? s.ruleCount : (Array.isArray(s?.rules) ? s.rules.length : null),
  signalTypes: Array.isArray(s?.signalTypes) ? s.signalTypes : [],
  updatedAt: s?.updatedAt ?? null,
  templateId: s?.templateId ?? null,
});

/** TemplateDTO `{templateId, name, description, definition: {rules[], axes[]}}` → editor shapes. */
export const normalizeTemplate = (t) => ({
  templateId: t?.templateId ?? null,
  name: t?.name || t?.templateId || '',
  description: t?.description || '',
  rules: rulesOf(t).map(fromRuleDTO),
  axes: axesOf(t),
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
 * sweepThresholds, warnings[]}` → the same, every field defaulted.
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
  };
};

/**
 * Preview dates: the StrategiesConfigDTO convention (LocalDateTime, start of the first day, end of
 * the last one). `day` is 'YYYY-MM-DD'.
 */
const previewStart = (day) => `${day}T00:00:00`;
const previewEnd = (day) => `${day}T23:59:59`;

// ---- endpoints ----

/** GET /meta → normalized meta (fallbacks on 404 / a network failure are the caller's choice). */
export const getConstructedMeta = async () => {
  const res = await apiRequest(`${API_BASE_URL}/meta`, undefined, 'Loading constructor metadata failed');
  return normalizeMeta(await readJson(res));
};

/** GET / → summaries of the non-deleted strategies, newest first. */
export const listConstructed = async () => {
  const res = await apiRequest(`${API_BASE_URL}`, undefined, 'Loading constructed strategies failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data.map(normalizeSummary) : [];
};

/** GET /{id} → the current version with usage[] and params[]; 404 (also for a deleted one). */
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
 *   startDay: string, endDay: string}} req `definition` = `{rules: RuleDTO[]}` (an unsaved or
 *   edited draft) or `key` = `Constructed:<id>@<v>` (the saved version as is)
 */
export const previewConstructed = async ({ definition = null, key = null, ticker, timeFrame, startDay, endDay }) => {
  const body = { ticker, timeFrame, startDate: previewStart(startDay), endDate: previewEnd(endDay) };
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
 * POST /templates/{templateId}/create `{name?}` → 201 the new strategy v1 (normalized DTO with
 * `templateId`); 409 NAME_EXISTS; 404 unknown template. Errors are thrown (httpClient).
 */
export const createFromTemplate = async (templateId, name = null) => {
  const body = name && name.trim() ? { name: name.trim() } : {};
  const res = await apiRequest(`${API_BASE_URL}/templates/${enc(templateId)}/create`,
    { method: 'POST', ...jsonBody(body) }, 'Creating the strategy from the template failed');
  return fromConstructedDTO(await readJson(res));
};
