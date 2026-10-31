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

import { apiRequest, readJson, jsonBody, enc } from './httpClient';
import { toConditionDTO, fromConditionDTO } from './screenerApi';

const API_BASE_URL = '/api/strategy/constructed';

// ---- static contract (fallbacks when /meta is absent or partial) ----

/** Rule signal types (BA Q4); LongBlock from stage 2. No ShortBlock. */
export const SIGNAL_TYPES = Object.freeze(['LongOpen', 'LongClose', 'LongBlock', 'ShortOpen', 'ShortClose']);
/** Run timeframes of a constructed strategy in stages 1-2 (Q7). */
export const CONSTRUCTED_TFS = Object.freeze(['DAY', 'WEEK']);
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
});

// ---- adapters ----

/**
 * Editor rule `{id, signalType, note, conditions: [{id, condition: editorCondition}]}` → RuleDTO
 * `{id?, signalType, note?, conditions: [{id?, condition: FilterConditionDTO}]}`. Ids are the
 * rule's / condition's PERMANENT ids (threshold names R<id>.C<id>.* depend on them): kept as they
 * came from the backend, null for a new one (the backend assigns it).
 */
export const toRuleRequest = (rule) => ({
  id: rule.id ?? null,
  signalType: rule.signalType,
  note: rule.note ? rule.note : null,
  conditions: (rule.conditions || []).map((c) => ({ id: c.id ?? null, condition: toConditionDTO(c.condition) })),
});

/** Editor draft → ConstructedStrategyRequest `{name, note, rules[]}`. */
export const toConstructedRequest = (draft) => ({
  name: (draft.name || '').trim(),
  note: draft.note ? draft.note : null,
  rules: (draft.rules || []).map(toRuleRequest),
});

/** RuleDTO → editor rule. */
export const fromRuleDTO = (r) => ({
  id: r?.id ?? null,
  signalType: SIGNAL_TYPES.includes(r?.signalType) ? r.signalType : 'LongOpen',
  note: r?.note || '',
  conditions: (Array.isArray(r?.conditions) ? r.conditions : []).map((c) => ({
    id: c?.id ?? null,
    // RuleConditionDTO {id, condition}; a bare FilterConditionDTO is accepted too
    condition: fromConditionDTO(c?.condition ?? c),
  })),
});

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
 * ConstructedStrategyDTO `{id, name, note, version, key, rules, deleted, createdAt, updatedAt,
 * usage[], params[], versionChanged?}` → `{..., rules: editorRule[], usage: normalized[]}`.
 */
export const fromConstructedDTO = (d) => {
  if (!d) return null;
  return {
    id: d.id ?? null,
    name: d.name || '',
    note: d.note || '',
    version: d.version ?? null,
    key: d.key ?? (d.id != null && d.version != null ? `Constructed:${d.id}@${d.version}` : null),
    rules: (Array.isArray(d.rules) ? d.rules : []).map(fromRuleDTO),
    deleted: d.deleted === true,
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
    usage: (Array.isArray(d.usage) ? d.usage : []).map(normalizeUsage),
    params: Array.isArray(d.params) ? d.params : [],
    versionChanged: typeof d.versionChanged === 'boolean' ? d.versionChanged : null,
  };
};

/** ConstructedStrategySummaryDTO `{id, name, version, key, ruleCount, signalTypes[], updatedAt}`. */
const normalizeSummary = (s) => ({
  id: s?.id ?? null,
  name: s?.name || '',
  version: s?.version ?? null,
  key: s?.key ?? (s?.id != null && s?.version != null ? `Constructed:${s.id}@${s.version}` : null),
  ruleCount: isNum(s?.ruleCount) ? s.ruleCount : (Array.isArray(s?.rules) ? s.rules.length : null),
  signalTypes: Array.isArray(s?.signalTypes) ? s.signalTypes : [],
  updatedAt: s?.updatedAt ?? null,
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
