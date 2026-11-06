// src/api/indicatorApi.js
//
// The Indicators Chart endpoints (screener architect.md "Indicators Chart" §3 / §4), relative URLs
// through the Vite '/api' proxy like every other api module:
//   GET  /api/indicators/meta?ticker=&timeframe=         descriptors, caps, run-session rule, stored SMA
//   GET  /api/indicators/series?ticker=&timeframe=&from=&to=&ind=KIND[:n]...   columnar series
//   POST /api/indicators/sma-tail {ticker, timeframe, lengths}               SMA tail top-up
//   GET  /api/levels/{ticker}?timeFrame=&minStrength=    the stored level-zone map ("as of today")
// Dates are the exchange's wall clock without a zone (decision 0.18, #100): a bare day is sent as
// T00:00:00 (from) / T23:59:59 (to), exactly as the channel endpoints get them (channelApi.fmtDt).
// Errors: apiRequest's shape ({status, code, detail, jobId, body}); 400 / 409 bodies are
// {error, code, message}.

import { apiRequest, readJson, jsonBody, enc } from './httpClient';
import { fmtDt } from './channelApi';

const BASE = '/api/indicators';

/** Caps the backend applies when /meta did not send them (architect §3.5). */
export const DEFAULT_CAPS = Object.freeze({ maxSpecs: 20, maxPoints: 600000 });

/** The `ind` parameter of a spec: 'SMA:200', 'IBS'. */
export const specParam = (spec) => (spec.n === null || spec.n === undefined ? spec.kind : `${spec.kind}:${spec.n}`);

/** Identity of a spec: equal keys = one series on the wire. */
export const specKey = (spec) => specParam(spec).toUpperCase();

/**
 * How many specs go in one /series request: at most caps.maxSpecs, and few enough that
 * bars x specs stays within caps.maxPoints (the backend answers 400 TOO_LARGE otherwise).
 */
export const batchSize = (caps, barCount) => {
  const maxSpecs = Number(caps?.maxSpecs) > 0 ? Number(caps.maxSpecs) : DEFAULT_CAPS.maxSpecs;
  const maxPoints = Number(caps?.maxPoints) > 0 ? Number(caps.maxPoints) : DEFAULT_CAPS.maxPoints;
  return Math.max(1, Math.min(maxSpecs, Math.floor(maxPoints / Math.max(1, barCount))));
};

/** GET /api/indicators/meta (ticker / timeframe optional). */
export const fetchIndicatorMeta = async (ticker, timeframe, { signal } = {}) => {
  const q = new URLSearchParams();
  if (ticker) q.set('ticker', ticker);
  if (timeframe) q.set('timeframe', timeframe);
  const qs = q.toString();
  const res = await apiRequest(`${BASE}/meta${qs ? `?${qs}` : ''}`, { signal }, 'Indicator meta');
  return readJson(res);
};

const fetchSeriesBatch = async (ticker, timeframe, from, to, specs, signal) => {
  const q = new URLSearchParams({ ticker, timeframe, from: fmtDt(from), to: fmtDt(to, true) });
  specs.forEach((s) => q.append('ind', specParam(s)));
  const res = await apiRequest(`${BASE}/series?${q.toString()}`, { signal }, 'Indicator series');
  return readJson(res);
};

/**
 * GET /api/indicators/series for any number of specs: duplicates are requested once, the rest
 * is cut into batches of batchSize(caps, barCount) and requested one after another (a whole
 * HOUR history is several requests, not a refusal - BA §3.7). Returns the first response's
 * columns ({dates, inRunSession, openFrom, lastBar, zone, ...}) with `bySpec`: specKey -> the
 * indicator object of the response.
 */
export const fetchIndicatorSeries = async (ticker, timeframe, from, to, specs, { barCount = 0, caps = null, signal } = {}) => {
  const unique = [];
  const seen = new Set();
  for (const s of specs || []) {
    const k = specKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(s);
  }
  if (unique.length === 0) return null;
  const size = batchSize(caps, barCount);
  let base = null;
  const bySpec = new Map();
  for (let i = 0; i < unique.length; i += size) {
    const chunk = unique.slice(i, i + size);
    const resp = await fetchSeriesBatch(ticker, timeframe, from, to, chunk, signal);
    if (!base) base = resp;
    (resp?.indicators || []).forEach((ind, j) => bySpec.set(specKey(chunk[j]), ind));
  }
  return { ...base, indicators: undefined, bySpec };
};

/** POST /api/indicators/sma-tail: 200 {ticker, timeframe, pricesTo, results[]}; 409 DATA_BUSY; 400. */
export const topUpSmaTail = async (ticker, timeframe, lengths) => {
  const res = await apiRequest(`${BASE}/sma-tail`, { method: 'POST', ...jsonBody({ ticker, timeframe, lengths }) }, 'SMA tail');
  return readJson(res);
};

/** GET /api/levels/{ticker}: every stored zone with strength >= minStrength, lowest band first. */
export const fetchLevelZones = async (ticker, timeframe, minStrength = 0, { signal } = {}) => {
  const q = new URLSearchParams({ timeFrame: timeframe, minStrength: String(minStrength) });
  const res = await apiRequest(`/api/levels/${enc(ticker)}?${q.toString()}`, { signal }, 'Level zones');
  return (await readJson(res)) || [];
};
