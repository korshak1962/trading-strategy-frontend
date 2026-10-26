// src/api/screenerApi.js
//
// Universe screener (screener logs/agents/architect.md "Universe screener rev 1" §8.2): filters
// (CRUD, active toggle, schedule assignments, soft delete), "Run now", unsaved-filter preview with
// an optional asOf, runs, results, diff, latest run per filter (badge) and the run queue.
// Not to be confused with the parameter screening of BA-021 (strategyApi `/screening-jobs`).
//
// Wire shapes are adapted in ONE place (toFilterRequest / fromFilterDTO / normalizeRun below) so a
// naming difference to the backend is a one-line change. Errors: see httpClient.js.

import { apiRequest, readJson, jsonBody, enc } from './httpClient';

const API_BASE_URL = '/api/screener';

// ---- static contract (fallbacks when /meta is absent or partial) ----

export const METRICS = Object.freeze([
  { value: 'WIDTH_PCT', label: 'Width %', unit: '%', hint: 'Upper line above the lower one by this many % of price' },
  { value: 'SLOPE_PCT_YEAR', label: 'Slope %/year', unit: '%/yr', hint: 'Signed annualized slope, e.g. -30 = falling 30 % a year' },
  { value: 'POSITION', label: 'Position', unit: '', hint: '0 = at the lower line, 1 = at the upper line; not clipped (<0 below, >1 above)' },
  { value: 'AGE_BARS', label: 'Age (bars)', unit: 'bars', hint: 'Bars since the channel start (not since its confirmation)' },
  { value: 'TOUCHES_UPPER', label: 'Touches upper', unit: '', hint: 'Bars whose high touched the upper line (within 0.1 ATR)' },
  { value: 'TOUCHES_LOWER', label: 'Touches lower', unit: '', hint: 'Bars whose low touched the lower line (within 0.1 ATR)' },
]);

export const OPERAND_KINDS = Object.freeze(['OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'SMA']);
export const RIGHT_KINDS = Object.freeze([...OPERAND_KINDS, 'CONST']);
export const OPERATORS = Object.freeze([
  { value: 'GT', label: '>' },
  { value: 'GTE', label: '≥' },
  { value: 'LT', label: '<' },
  { value: 'LTE', label: '≤' },
]);
export const SCREEN_TFS = Object.freeze(['DAY', 'WEEK']);
export const LEVELS = Object.freeze([0, 1, 2]);
export const SMA_MIN = 5;
export const SMA_MAX = 200;
export const OFFSET_MIN = -100;
export const OFFSET_MAX = 0;
export const TOLERANCE_LIMIT = 50; // exclusive: (-50, 50)

export const DEFAULT_START_DATE = '2020-01-01';

/** Terminal statuses of a stored run / a preview (QUEUED / RUNNING are not). */
export const RUN_TERMINAL = new Set(['DONE', 'PARTIAL', 'FAILED', 'CANCELLED']);

const DETECTOR_KEYS = ['coveragePct', 'minBars', 'minWidthPct', 'minAnnualYieldPct', 'maxAnnualYieldPct'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// ---- adapters ----

/** Editor operand → OperandDTO `{kind, n?, tf, offset}` / `{kind: 'CONST', value}`. */
const toOperand = (o) => {
  if (!o) return null;
  if (o.kind === 'CONST') return { kind: 'CONST', value: numOrNull(o.value) };
  const out = { kind: o.kind, tf: o.tf, offset: Number(o.offset) || 0 };
  if (o.kind === 'SMA') out.n = numOrNull(o.n);
  return out;
};

const fromOperand = (o) => {
  if (!o) return null;
  if (o.kind === 'CONST') return { kind: 'CONST', value: o.value ?? '', n: 50, tf: 'DAY', offset: 0 };
  return { kind: o.kind || 'CLOSE', n: o.n ?? 50, tf: o.tf || 'DAY', offset: o.offset ?? 0, value: '' };
};

/** Editor condition → FilterConditionDTO. */
export const toConditionDTO = (c) => {
  if (c.type === 'CHANNEL_METRIC') {
    return {
      type: 'CHANNEL_METRIC', tf: c.tf, level: Number(c.level), metric: c.metric,
      min: numOrNull(c.min), max: numOrNull(c.max),
    };
  }
  return {
    type: 'COMPARE', left: toOperand(c.left), op: c.op, right: toOperand(c.right),
    tolerancePct: numOrNull(c.tolerancePct) ?? 0,
  };
};

/** FilterConditionDTO (nested `left` / `right` operands — the only shape the backend has) → editor condition. */
export const fromConditionDTO = (c) => {
  if (c?.type === 'CHANNEL_METRIC') {
    return {
      type: 'CHANNEL_METRIC', tf: c.tf || 'DAY', level: c.level ?? 0, metric: c.metric || 'WIDTH_PCT',
      min: c.min ?? '', max: c.max ?? '',
    };
  }
  return {
    type: 'COMPARE',
    left: fromOperand(c?.left) || { kind: 'CLOSE', n: 50, tf: 'DAY', offset: 0, value: '' },
    op: c?.op || 'GT',
    right: fromOperand(c?.right) || { kind: 'SMA', n: 50, tf: 'DAY', offset: 0, value: '' },
    tolerancePct: c?.tolerancePct ?? 0,
  };
};

/** Editor draft → FilterRequest. Detector params nested (`detectorParams`), logPrice always true. */
export const toFilterRequest = (draft) => ({
  name: (draft.name || '').trim(),
  note: draft.note ? draft.note : null,
  startDate: draft.startDate,
  detectorParams: {
    ...Object.fromEntries(DETECTOR_KEYS.map((k) => [k, draft.detectorParams?.[k]])),
    logPrice: true,
  },
  active: !!draft.active,
  scheduleIds: [...(draft.scheduleIds || [])],
  conditions: (draft.conditions || []).map(toConditionDTO),
});

/** FilterDTO / FilterDefinitionDTO → editor draft (detector params nested in `detectorParams`). */
export const fromFilterDTO = (f, defaults) => {
  const src = f?.detectorParams || {};
  const detectorParams = { ...defaults };
  DETECTOR_KEYS.forEach((k) => { if (src[k] != null) detectorParams[k] = src[k]; });
  detectorParams.logPrice = true;
  return {
    id: f?.id ?? null,
    name: f?.name || '',
    note: f?.note || '',
    startDate: f?.startDate ? String(f.startDate).substring(0, 10) : DEFAULT_START_DATE,
    detectorParams,
    active: f?.active ?? true,
    scheduleIds: Array.isArray(f?.scheduleIds) ? f.scheduleIds : [],
    conditions: Array.isArray(f?.conditions) ? f.conditions.map(fromConditionDTO) : [],
    version: f?.version ?? null,
  };
};

const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'NOT_EVALUATED']);

/** Operand result `{v, date, provisional}` → `{value, date, provisional}`. */
const normalizeOperandValue = (o) => (o
  ? { value: isNum(o.v) ? o.v : null, date: o.date ?? null, provisional: !!o.provisional }
  : null);

/**
 * TickerResultDTO `{ticker, name, kind, indicatorSet, status, reason, provisional, lastBarDate, close,
 * flags[], primaryTicker, conditions[]}` → table row. `conditions` are in the filter's condition
 * order: `{label, status, reason, value, left, right, provisional, channel, missingDates, lastBar}`.
 */
export const normalizeResult = (r) => ({
  ticker: r.ticker,
  name: r.name ?? null,
  kind: r.kind ?? null,
  status: RESULT_STATUSES.has(r.status) ? r.status : 'NOT_EVALUATED',
  reason: r.reason ?? null,
  provisional: !!r.provisional,
  lastBarDate: r.lastBarDate ?? null,
  close: isNum(r.close) ? r.close : null,
  flags: Array.isArray(r.flags) ? r.flags.filter(Boolean) : [],
  primaryTicker: r.primaryTicker ?? null,
  indicatorSet: r.indicatorSet ?? null,
  conditions: (Array.isArray(r.conditions) ? r.conditions : []).map((c) => ({
    label: c.label ?? null,
    status: RESULT_STATUSES.has(c.status) ? c.status : 'NOT_EVALUATED',
    reason: c.reason ?? null,
    value: isNum(c.value) ? c.value : null,
    left: normalizeOperandValue(c.left),
    right: normalizeOperandValue(c.right),
    provisional: !!c.provisional,
    channel: c.channel ?? null,
    missingDates: c.missingDates ?? null,
    lastBar: c.lastBar ?? null,
  })),
});

/** DiffDTO `{runId, prevRunId, entered[], exited[], undetermined[], newMembers[], filterChanged}` (ticker strings). */
export const normalizeDiff = (d) => {
  if (!d) return null;
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    prevRunId: d.prevRunId ?? null,
    entered: list(d.entered),
    exited: list(d.exited),
    undetermined: list(d.undetermined),
    newMembers: list(d.newMembers),
    filterChanged: d.filterChanged ?? null,
  };
};

/**
 * RunDTO / PreviewDTO → `{..., id, results: row[], diff: normalized | null}`. `results` is null on
 * the wire until DONE / PARTIAL → []. A preview's id is `previewId`.
 */
export const normalizeRun = (run) => {
  if (!run) return null;
  const results = Array.isArray(run.results) ? run.results.map(normalizeResult) : [];
  return { ...run, id: run.id ?? run.previewId ?? null, results, diff: run.diff ? normalizeDiff(run.diff) : null };
};

// ---- endpoints ----

/**
 * GET /meta → ScreenerMetaDTO `{metrics[], operandKinds[], ops[], timeframes[], smaMin, smaMax,
 * offsetMin, offsetMax, levelMax, toleranceAbsMax, detectorDefaults, defaultStartDate,
 * schedules[{id, name, enabled, timeFrame, portfolios}]}`. The ranges equal the constants above;
 * the UI takes detectorDefaults, defaultStartDate and the schedule names from it.
 */
export const getScreenerMeta = async () => {
  const res = await apiRequest(`${API_BASE_URL}/meta`, undefined, 'Loading screener metadata failed');
  return readJson(res);
};

/** GET /filters → FilterDTO[] with `lastRun` (basis, counts, entered / exited). */
export const listFilters = async () => {
  const res = await apiRequest(`${API_BASE_URL}/filters`, undefined, 'Loading filters failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
};

/** GET /filters/{id} → FilterDTO; 404. */
export const getFilter = async (id) => {
  const res = await apiRequest(`${API_BASE_URL}/filters/${enc(id)}`, undefined, 'Loading the filter failed');
  return readJson(res);
};

/** POST /filters FilterRequest → 201 FilterDTO (+ warnings); 409 NAME_EXISTS; 400. */
export const createFilter = async (request) => {
  const res = await apiRequest(`${API_BASE_URL}/filters`, { method: 'POST', ...jsonBody(request) }, 'Saving the filter failed');
  return readJson(res);
};

/** PUT /filters/{id} FilterRequest → 200 FilterDTO (version +1 when the definition changed); 404 / 409 / 400. */
export const updateFilter = async (id, request) => {
  const res = await apiRequest(`${API_BASE_URL}/filters/${enc(id)}`, { method: 'PUT', ...jsonBody(request) },
    'Saving the filter failed');
  return readJson(res);
};

/** PATCH /filters/{id} {active?, scheduleIds?, note?} → 200 FilterDTO (version unchanged). */
export const patchFilter = async (id, patch) => {
  const res = await apiRequest(`${API_BASE_URL}/filters/${enc(id)}`, { method: 'PATCH', ...jsonBody(patch) },
    'Updating the filter failed');
  return readJson(res);
};

/** POST /filters/{id}/duplicate {name?} → 201 FilterDTO; 409 NAME_EXISTS; 404. */
export const duplicateFilter = async (id, name) => {
  const res = await apiRequest(`${API_BASE_URL}/filters/${enc(id)}/duplicate`, { method: 'POST', ...jsonBody({ name }) },
    'Duplicating the filter failed');
  return readJson(res);
};

/** DELETE /filters/{id} → 204 (soft delete: runs and versions stay). */
export const deleteFilter = async (id) => {
  await apiRequest(`${API_BASE_URL}/filters/${enc(id)}`, { method: 'DELETE' }, 'Deleting the filter failed');
};

/** POST /filters/{id}/runs → 202 {runId}; 409 {runId, error} (this filter is queued / running). */
export const runFilterNow = async (id) => {
  const res = await apiRequest(`${API_BASE_URL}/filters/${enc(id)}/runs`, { method: 'POST' }, 'Run now failed');
  return readJson(res);
};

/** GET /filters/{id}/runs?limit= → RunSummaryDTO[], newest first. */
export const listFilterRuns = async (id, limit = 20) => {
  const res = await apiRequest(`${API_BASE_URL}/filters/${enc(id)}/runs?${new URLSearchParams({ limit: String(limit) })}`,
    undefined, 'Loading runs failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
};

/** GET /runs/{id} → RunDTO (status, done/total, definition, conditionLabels; results + diff when DONE / PARTIAL), normalized. */
export const getRun = async (runId) => {
  const res = await apiRequest(`${API_BASE_URL}/runs/${enc(runId)}`, undefined, 'Loading the run failed');
  return normalizeRun(await readJson(res));
};

/** GET /runs/{id}/diff → DiffDTO, normalized; 404; 409 while the run is going. */
export const getRunDiff = async (runId) => {
  const res = await apiRequest(`${API_BASE_URL}/runs/${enc(runId)}/diff`, undefined, 'Loading the diff failed');
  return normalizeDiff(await readJson(res));
};

/** GET /latest → the latest run of every active filter (RunSummaryDTO[]). */
export const getLatestRuns = async () => {
  const res = await apiRequest(`${API_BASE_URL}/latest`, undefined, 'Loading the latest runs failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
};

/**
 * POST /preview {filter: FilterRequest (name optional), asOf?: 'YYYY-MM-DDTHH:mm:ss' (New York wall
 * clock), tickers?: string[] (only these tickers, members or not)} → 202 {previewId};
 * 409 PREVIEW_RUNNING; 400.
 */
export const startPreview = async (filterRequest, asOf = null, tickers = null) => {
  const body = { filter: filterRequest };
  if (asOf) body.asOf = asOf;
  if (Array.isArray(tickers) && tickers.length) body.tickers = tickers;
  const res = await apiRequest(`${API_BASE_URL}/preview`, { method: 'POST', ...jsonBody(body) }, 'Preview failed to start');
  return readJson(res);
};

/** GET /preview/{id} → status + results (kept in memory, last 5), normalized; 404. */
export const getPreview = async (previewId) => {
  const res = await apiRequest(`${API_BASE_URL}/preview/${enc(previewId)}`, undefined, 'Loading the preview failed');
  return normalizeRun(await readJson(res));
};

/** GET /queue → the current and the waiting runs. */
export const getRunQueue = async () => {
  const res = await apiRequest(`${API_BASE_URL}/queue`, undefined, 'Loading the run queue failed');
  return readJson(res);
};
