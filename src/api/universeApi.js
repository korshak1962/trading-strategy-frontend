// src/api/universeApi.js
//
// Universe of the screener (screener logs/agents/architect.md "Universe screener rev 1" §8.1):
// members, manual add / exclude / include / remove, duplicate marks, history load, "Prepare for
// strategies" (the full indicator set), indicator recalc and the monthly composition refresh
// (+ dry run). Everything that writes prices / indicators (load-history, prepare,
// recalc-indicators) is an ordinary download job: poll it with downloaderApi.fetchJob.
// Errors: see httpClient.js (409 bodies carry `jobId`).

import { apiRequest, readJson, jsonBody, enc } from './httpClient';

const API_BASE_URL = '/api/universe';

/** The one universe of v1. */
export const UNIVERSE_CODE = 'US';

const u = (code) => `${API_BASE_URL}/${enc(code)}`;

/** `flags[]` of a member / plan entry (always an array on the wire; null-safe). */
export const normalizeFlags = (flags) => (Array.isArray(flags) ? flags.filter(Boolean).map(String) : []);

/**
 * GET /api/universe/{code} → UniverseSummaryDTO `{code, market, stockCount, etfCount, members,
 * byStatus{}, byKind{}, byFlag{}, duplicateGroups, historyPending, nextRefreshDate,
 * lastRefresh {id, trigger, status, startedAt, finishedAt, message, yfinanceVersion, changes},
 * schedule {id, name, enabled, runAt, lastStatus, lastRunAt} | null}`; 404.
 */
export const getUniverseSummary = async (code = UNIVERSE_CODE) => {
  const res = await apiRequest(u(code), undefined, 'Loading the universe failed');
  return readJson(res);
};

/**
 * GET /api/universe/{code}/members?status=&kind= → UniverseMemberDTO[]
 * `{ticker, kind, source, status, flags[], duplicateOf, duplicateManual, longName, category, exchange,
 *   country, rankNo, rankValue, rankDate, avgDollarVolume, historyPending, indicatorSet, staleDays,
 *   note, firstDate, lastDate, dayBars, addedAt, updatedAt}`.
 */
export const listMembers = async ({ code = UNIVERSE_CODE, status = null, kind = null } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (kind) params.set('kind', kind);
  const qs = params.toString() ? `?${params}` : '';
  const res = await apiRequest(`${u(code)}/members${qs}`, undefined, 'Loading universe members failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
};

/** POST /members {ticker, kind?, note?} → 201 member; 409 MEMBER_EXISTS; 400. */
export const addMember = async ({ ticker, kind = null, note = null }, code = UNIVERSE_CODE) => {
  const body = { ticker };
  if (kind) body.kind = kind;
  if (note) body.note = note;
  const res = await apiRequest(`${u(code)}/members`, { method: 'POST', ...jsonBody(body) }, 'Adding the ticker failed');
  return readJson(res);
};

/** POST /members/{ticker}/exclude → 200 member; 404. */
export const excludeMember = async (ticker, code = UNIVERSE_CODE) => {
  const res = await apiRequest(`${u(code)}/members/${enc(ticker)}/exclude`, { method: 'POST' }, 'Exclude failed');
  return readJson(res);
};

/** POST /members/{ticker}/include → 200 member (EXCLUDED → ACTIVE, MANUAL); 404. */
export const includeMember = async (ticker, code = UNIVERSE_CODE) => {
  const res = await apiRequest(`${u(code)}/members/${enc(ticker)}/include`, { method: 'POST' }, 'Include failed');
  return readJson(res);
};

/** DELETE /members/{ticker} → 204 (MANUAL → INACTIVE); 409 AUTO_MEMBER (use Exclude); 404. */
export const removeManualMember = async (ticker, code = UNIVERSE_CODE) => {
  await apiRequest(`${u(code)}/members/${enc(ticker)}`, { method: 'DELETE' }, 'Remove failed');
};

/**
 * PUT /members/{ticker}/duplicate {primary?, reset?} → 200 member; 400 (primary not a member / self); 404.
 * `primary` = mark as a duplicate of it; `primary: null` = manually "not a duplicate";
 * `reset: true` = back to the automatic rule.
 */
export const markDuplicate = async (ticker, { primary = null, reset = false }, code = UNIVERSE_CODE) => {
  const body = reset ? { reset: true } : { primary };
  const res = await apiRequest(`${u(code)}/members/${enc(ticker)}/duplicate`, { method: 'PUT', ...jsonBody(body) },
    'Changing the duplicate mark failed');
  return readJson(res);
};

/** POST /members/{ticker}/load-history → 202 {jobId}; 409 {jobId, error} (download slot busy); 404. */
export const loadMemberHistory = async (ticker, code = UNIVERSE_CODE) => {
  const res = await apiRequest(`${u(code)}/members/${enc(ticker)}/load-history`, { method: 'POST' }, 'Load history failed');
  return readJson(res);
};

/**
 * POST /members/{ticker}/prepare → 202 {jobId}: indicator_set = FULL + a download job computing the
 * full indicator set. 409 {jobId, error}: the download slot is busy — FULL is recorded anyway and
 * the next universe job computes it. 404: not a universe member.
 */
export const prepareForStrategies = async (ticker, code = UNIVERSE_CODE) => {
  const res = await apiRequest(`${u(code)}/members/${enc(ticker)}/prepare`, { method: 'POST' },
    'Prepare for strategies failed');
  return readJson(res);
};

/** POST /{code}/load-history → 202 {jobId} for every member with pending history; 409. */
export const loadAllPendingHistory = async (code = UNIVERSE_CODE) => {
  const res = await apiRequest(`${u(code)}/load-history`, { method: 'POST' }, 'Load history failed');
  return readJson(res);
};

/** POST /{code}/recalc-indicators → 202 {jobId}; 409. */
export const recalcUniverseIndicators = async (code = UNIVERSE_CODE) => {
  const res = await apiRequest(`${u(code)}/recalc-indicators`, { method: 'POST' }, 'Recalc indicators failed');
  return readJson(res);
};

/** POST /{code}/refresh?dryRun= → 202 {jobId}; 409 {jobId, error} (a refresh is running). */
export const startRefresh = async ({ dryRun = false, code = UNIVERSE_CODE } = {}) => {
  const qs = new URLSearchParams({ dryRun: String(!!dryRun) });
  const res = await apiRequest(`${u(code)}/refresh?${qs}`, { method: 'POST' },
    dryRun ? 'Refresh dry run failed to start' : 'Refresh failed to start');
  return readJson(res);
};

/**
 * GET /api/universe/refresh-jobs/{id} → RefreshJobDTO
 * `{jobId, code, dryRun, trigger, status: QUEUED|RUNNING|DONE|FAILED|REJECTED, startedAt, finishedAt,
 *   message, refreshId, log[], plan}`; plan = `{sourceVersion, autoStocks[], autoEtfs[], added[],
 *   deactivated[], reactivated[], excluded[{symbol, kind, rank, flags[], reason}],
 *   duplicates[{primary, members[]}], duplicatePairs[{ticker, primary, correlation, manual}], errors[]}`;
 *   404 (jobs live in memory, last 10).
 */
export const getRefreshJob = async (jobId) => {
  const res = await apiRequest(`${API_BASE_URL}/refresh-jobs/${enc(jobId)}`, undefined, 'Loading the refresh job failed');
  return readJson(res);
};

/** GET /{code}/refreshes?limit= → refresh history, newest first. */
export const listRefreshes = async ({ code = UNIVERSE_CODE, limit = 10 } = {}) => {
  const res = await apiRequest(`${u(code)}/refreshes?${new URLSearchParams({ limit: String(limit) })}`, undefined,
    'Loading the refresh history failed');
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
};

/** Terminal statuses of a refresh job. */
export const REFRESH_TERMINAL = new Set(['DONE', 'FAILED', 'REJECTED', 'CANCELLED']);
