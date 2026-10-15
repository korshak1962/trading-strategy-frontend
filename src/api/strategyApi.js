// src/api/strategyApi.js

// Base URL for API
const API_BASE_URL = '/api/strategy';
/**
 * Get available strategies from the server
 * @returns {Promise<Array>} List of available strategies
 */
export const getAvailableTickers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/available-tickers`);
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    const data = await response.json();
    return data.map(item => item.ticker).filter(Boolean);
  } catch (error) {
    console.error('Failed to fetch available tickers:', error);
    throw error;
  }
};

export const getAvailableStrategies = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/available-strategies`);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch available strategies:', error);
    throw error;
  }
};

export const submitStrategies = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/submitStrategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || `Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to submit strategies:', error);
    throw error;
  }
};

/**
 * POST /signal-charts (screener TASK_position_dependable_and_signals_tab.md §2.3): the per-strategy
 * signal panes of the merge, plus the merged pane and the merged position. Same body as
 * submitStrategies (the StrategiesConfigDTO from formatStrategyConfig). The raw JSON is returned
 * as is - components/signals/signalPanes.js adaptSignalCharts maps it to what the view draws.
 * Errors as submitStrategies: a 400 `{message}` (no prices / no SMA / empty strategies or dates /
 * post-trade strategies in the config) throws with that message.
 */
export const fetchSignalCharts = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/signal-charts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || body?.error || `Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch signal charts:', error);
    throw error;
  }
};

export const optimizeStrategies = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/optimize-strategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || `Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to optimize strategies:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------------------------
// Async optimization job (TASK_optimization_progress.md §2.7, §3.1). Same shape as
// downloaderApi.js: errors carry `status`, the message comes from `body.message || body.error`.
// The synchronous optimizeStrategies above is kept but the UI no longer calls it.
// ---------------------------------------------------------------------------------------------

// Error carrying the HTTP status and the parsed JSON body (null when the body is not JSON),
// with the backend's message when the body has one.
const jobHttpError = async (res, what) => {
  const body = await res.json().catch(() => null);
  const detail = body?.message || body?.error;
  const err = new Error(detail || `${what}: ${res.status} ${res.statusText}`);
  err.status = res.status;
  err.detail = detail || null;
  err.body = body;
  return err;
};

// logSince query string; omitted when undefined/null (backend default -1 = no lines).
const logSinceQuery = (logSince) =>
  (logSince === undefined || logSince === null) ? '' : `?${new URLSearchParams({ logSince: String(logSince) })}`;

/**
 * POST /optimize-jobs.
 * @param {Object} config the StrategiesConfigDTO body (formatStrategyConfig)
 * @returns {Promise<{jobId: string, total: number} | {conflict: true, jobId: string|null, error: string|null}>}
 *   202 → `{ jobId, total }`; 409 → `{ conflict: true, jobId, error }` (jobId = the running job).
 *   400 and other failures throw with the backend message.
 */
export const startOptimization = async (config) => {
  const res = await fetch(`${API_BASE_URL}/optimize-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => null);
    return { conflict: true, jobId: data?.jobId ?? null, error: data?.error || data?.message || null };
  }
  if (!res.ok) throw await jobHttpError(res, 'Optimization failed to start');
  return res.json();
};

/**
 * GET /optimize-jobs/{jobId}?logSince=<seq>. A 404 (unknown / evicted / backend restarted)
 * throws an Error whose `status` is 404 so the caller can tell it from a transient failure.
 */
export const fetchOptimizationJob = async (jobId, logSince) => {
  const res = await fetch(`${API_BASE_URL}/optimize-jobs/${encodeURIComponent(jobId)}${logSinceQuery(logSince)}`);
  if (!res.ok) throw await jobHttpError(res, 'Optimization job fetch failed');
  return res.json();
};

/** GET /optimize-jobs/current?logSince=<seq> → the running job, else the most recent; 204 → null. */
export const fetchCurrentOptimizationJob = async (logSince) => {
  const res = await fetch(`${API_BASE_URL}/optimize-jobs/current${logSinceQuery(logSince)}`);
  if (res.status === 204) return null;
  if (!res.ok) throw await jobHttpError(res, 'Current optimization job fetch failed');
  return res.json();
};

/** GET /optimize-jobs/{jobId}/result → StrategyResultDTO (same shape as /optimize-strategies). */
export const fetchOptimizationResult = async (jobId) => {
  const res = await fetch(`${API_BASE_URL}/optimize-jobs/${encodeURIComponent(jobId)}/result`);
  if (!res.ok) throw await jobHttpError(res, 'Optimization result fetch failed');
  return res.json();
};

/** POST /optimize-jobs/{jobId}/cancel → 202. The run finalises with the best combination so far. */
export const stopOptimization = async (jobId) => {
  const res = await fetch(`${API_BASE_URL}/optimize-jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  if (!res.ok) throw await jobHttpError(res, 'Stop failed');
};

// ---------------------------------------------------------------------------------------------
// Saved optimization cases (screener TASK_saved_optimization_cases.md §1.4, §3.1). Every failure
// throws through jobHttpError, so the caller reads `err.status` and `err.body`: a 409 with
// `body.error === 'NAME_EXISTS'` (and `body.name`) means "resend with overwrite: true"; any
// other 409 carries `{status, error}` (the job cannot be saved).
// ---------------------------------------------------------------------------------------------

const CASES_URL = `${API_BASE_URL}/cases`;

const postJson = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * GET /cases?ticker=&timeframe= → [StrategyCaseSummaryDTO], newest first. Both filters optional.
 * @param {{ticker?: string, timeframe?: string}} [filter]
 */
export const listCases = async ({ ticker, timeframe } = {}) => {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (timeframe) params.set('timeframe', timeframe);
  const qs = params.toString();
  const res = await fetch(qs ? `${CASES_URL}?${qs}` : CASES_URL);
  if (!res.ok) throw await jobHttpError(res, 'Saved cases fetch failed');
  return res.json();
};

/** GET /cases/{id} → StrategyCaseDTO (`config` reconciled, `warnings` list). 404 throws. */
export const getCase = async (id) => {
  const res = await fetch(`${CASES_URL}/${encodeURIComponent(id)}`);
  if (!res.ok) throw await jobHttpError(res, 'Saved case fetch failed');
  return res.json();
};

/**
 * POST /optimize-jobs/{jobId}/save → 201 `{id, name, overwritten}`.
 * 404 = the job is no longer on the server; 409 = name exists or job not saveable.
 */
export const saveCaseFromJob = async (jobId, { name, note, overwrite = false } = {}) => {
  const res = await postJson(`${API_BASE_URL}/optimize-jobs/${encodeURIComponent(jobId)}/save`,
    { name, note, overwrite });
  if (!res.ok) throw await jobHttpError(res, 'Save failed');
  return res.json();
};

/** POST /cases with a StrategiesConfigDTO (manual save of a backtest) → 201 `{id, name, overwritten}`. */
export const saveCase = async ({ name, note, overwrite = false, config }) => {
  const res = await postJson(CASES_URL, { name, note, overwrite, config });
  if (!res.ok) throw await jobHttpError(res, 'Save failed');
  return res.json();
};

/** DELETE /cases/{id} → 204. 404 throws. */
export const deleteCase = async (id) => {
  const res = await fetch(`${CASES_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw await jobHttpError(res, 'Delete failed');
};

/**
 * Format the strategy configuration object for the API
 * @param {string} ticker - Stock ticker symbol
 * @param {string} timeFrame - Time frame (MIN5, HOUR, DAY, WEEK, MONTH)
 * @param {Date} startDate - Start date for backtest
 * @param {Date} endDate - End date for backtest
 * @param {Object} strategyParams - Map of strategy names to parameter maps
 * @param {boolean} [longOnly=false] - When true the backend evaluates only the long leg
 *   (short signals are ignored); applies to both backtest and optimize requests
 * @returns {Object} Formatted configuration object
 */
export const formatStrategyConfig = (ticker, timeFrame, startDate, endDate, strategyParams, longOnly = false) => {
  // Convert JavaScript dates to the LocalDateTime format expected by the Java backend. The
  // pickers hand us calendar days, so the range is inclusive of both ends: start at 00:00:00,
  // end at 23:59:59. (toISOString() would give the end day's midnight and drop its bars.)
  const pad = (n) => String(n).padStart(2, '0');
  const formatDate = (date, time) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
  
  return {
    ticker,
    timeFrame,
    startDate: formatDate(startDate, '00:00:00'),
    endDate: formatDate(endDate, '23:59:59'),
    strategyNameToParams: strategyParams,
    longOnly
  };
};