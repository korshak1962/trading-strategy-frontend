// src/api/downloaderApi.js
//
// Downloader tab: start a download / aggregation / indicator-recalc job and poll it.
// Relative URL through the Vite '/api' proxy, same as channelApi.js and strategyApi.js.
// Contract: D:/projects/screener/logs/agents/architect.md §4.6 and TASK_downloader_tab.md §B;
// gaps / delete: TASK_downloader_gaps.md §2.1, §2.2.

const API_BASE_URL = '/api/downloader';

// Best-effort message from an error response body (Spring's error JSON carries `message`,
// the 409 body carries `error`), falling back to the status line.
const errorMessage = async (res, what) => {
  const body = await res.json().catch(() => null);
  const detail = body?.message || body?.error;
  return detail
    ? `${what}: ${detail}`
    : `${what}: ${res.status} ${res.statusText}`;
};

/** GET /portfolios?market= → [{ name, tickers: [] }] */
export const fetchPortfolios = async (market) => {
  const res = await fetch(`${API_BASE_URL}/portfolios?${new URLSearchParams({ market })}`);
  if (!res.ok) throw new Error(await errorMessage(res, 'Loading portfolios failed'));
  return res.json();
};

/**
 * GET /sources?market= → [{ id, label, supportsIntraday, maxIntradayHistoryDays,
 *   historyLimitDays: { MIN5: 60, HOUR: 730 } (decision 0.17; absent TF = no known limit),
 *   supportedTimeFrames }]
 */
export const fetchSources = async (market) => {
  const res = await fetch(`${API_BASE_URL}/sources?${new URLSearchParams({ market })}`);
  if (!res.ok) throw new Error(await errorMessage(res, 'Loading sources failed'));
  return res.json();
};

/**
 * POST /run.
 * @param {Object} body { market, source, tickers, timeFrame, from, to?, indicators }
 * @returns {Promise<{jobId: string, conflict?: boolean, error?: string}>} 202 → `{ jobId }`;
 *   409 → `{ conflict: true, jobId, error }`: `jobId` is the running job's id when a download
 *   is already running, null when something else blocks it (e.g. a delete in progress);
 *   `error` is the body's message, if any.
 */
export const startDownload = async (body) => {
  const res = await fetch(`${API_BASE_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => null);
    return { conflict: true, jobId: data?.jobId ?? null, error: data?.error || data?.message || null };
  }
  if (!res.ok) throw new Error(await errorMessage(res, 'Download failed to start'));
  return res.json();
};

/**
 * GET /jobs/{id}. A 404 (unknown id, e.g. after a backend restart: jobs live in memory)
 * throws an Error whose `status` is 404 so the caller can tell it from a transient failure.
 */
export const fetchJob = async (jobId) => {
  const res = await fetch(`${API_BASE_URL}/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    const err = new Error(`Job fetch failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

/** GET /jobs/current → the running job, else the most recent one; 204 → null. */
export const fetchCurrentJob = async () => {
  const res = await fetch(`${API_BASE_URL}/jobs/current`);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Current job fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
};

/** POST /jobs/{id}/cancel → 202; the job stops between stages / tickers. */
export const cancelJob = async (jobId) => {
  const res = await fetch(`${API_BASE_URL}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const err = new Error(`Cancel failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
};

// Error carrying the HTTP status, with the message taken from the body when there is one.
const httpError = async (res, what) => {
  const body = await res.clone().json().catch(() => null);
  const err = new Error(await errorMessage(res, what));
  err.status = res.status;
  // The body's own text ({error} / {message}) without the `what` prefix, so a caller can show
  // the backend's real reason verbatim (e.g. a 409 from /delete: download running vs. another
  // gap delete in progress).
  err.detail = body?.error || body?.message || null;
  return err;
};

/**
 * GET /gaps?ticker=<dbTicker>&timeFrames=MIN5,HOUR,... (TASK_downloader_gaps.md §2.1).
 * Read-only, allowed while a job runs.
 * @returns {Promise<Array<{timeFrame, firstBar, lastBar, bars, calendar,
 *   gaps: Array<{lastBefore, firstAfter, missingDays, barsBefore, barsAfter, calendarFallback}>}>>}
 * 400 / 404 throw an Error whose message comes from the body and whose `status` is set.
 */
export const fetchGaps = async (ticker, timeFrames) => {
  const params = new URLSearchParams({ ticker, timeFrames: timeFrames.join(',') });
  const res = await fetch(`${API_BASE_URL}/gaps?${params}`);
  if (!res.ok) throw await httpError(res, 'Gap scan failed');
  return res.json();
};

/**
 * POST /delete (TASK_downloader_gaps.md §2.2).
 * @param {Object} body { ticker, timeFrame, side: 'BEFORE'|'AFTER', boundary, cascade, dryRun }
 *   `boundary` is the gap's `firstAfter` for BEFORE and its `lastBefore` for AFTER, sent verbatim.
 * @returns {Promise<Object>} the row count per table (same shape for dryRun and the real delete).
 * 409 (a download job is running), 400 and 404 throw an Error with `status` set.
 */
export const deleteRange = async ({ ticker, timeFrame, side, boundary, cascade, dryRun }) => {
  const res = await fetch(`${API_BASE_URL}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, timeFrame, side, boundary, cascade: !!cascade, dryRun: !!dryRun }),
  });
  if (!res.ok) throw await httpError(res, dryRun ? 'Delete preview failed' : 'Delete failed');
  return res.json();
};
