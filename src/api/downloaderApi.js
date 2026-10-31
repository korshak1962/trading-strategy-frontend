// src/api/downloaderApi.js
//
// Downloader tab: start a download / aggregation / indicator-recalc job and poll it.
// Relative URL through the Vite '/api' proxy, same as channelApi.js and strategyApi.js.
// Contract: D:/projects/screener/logs/agents/architect.md §4.6 and TASK_downloader_tab.md §B;
// gaps / delete: TASK_downloader_gaps.md §2.1, §2.2; schedules: TASK_download_schedule.md §3.

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

/**
 * GET /portfolios?market= → [{ name, tickers: [], market: 'US'|'MOEX', defaultSource }]
 * `defaultSource` is the portfolio's default Downloader bean id (e.g. 'yahooDownloader').
 */
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
    return { conflict: true, jobId: data?.jobId ?? null, error: data?.message || data?.error || null };
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
  // The body's own text without the `what` prefix, so a caller can show the backend's real
  // reason verbatim (e.g. a 409 from /delete: download running vs. another gap delete in
  // progress). `message` first: in Spring's default error body (400 / 404) `error` is only the
  // reason phrase ("Bad Request"), while the 409 bodies `{error}` / `{jobId, error}` have no
  // `message`.
  err.detail = body?.message || body?.error || null;
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

// ---- Refill gaps (screener logs/agents/architect_refill_gaps.md §7.1) ----

// Error for a refill call: `status`, `detail` (backend text) and, for a 409, the blocking
// `jobId` / `probeId` from the body `{probeId|jobId, error}`.
const refillError = async (res, what) => {
  const body = res.status === 409 ? await res.clone().json().catch(() => null) : null;
  const err = await httpError(res, what);
  err.jobId = body?.jobId ?? null;
  err.probeId = body?.probeId ?? null;
  return err;
};

/**
 * POST /refill/probe — read-only dry run: asks the source for the missing days, writes nothing.
 * @param {Object} body { ticker, timeFrame?, source?, gaps?: [lastBefore...], days?: ['yyyy-MM-dd'],
 *   confirmReference? }  `days` is mandatory for a reference ticker (SPY / SBER_MOEX).
 * @returns {Promise<{probeId: string}>} 202.
 * 409 (a probe / download job / gap delete is running) and 400 throw an Error with `status`,
 * `detail`, `jobId`, `probeId`.
 */
export const probeRefill = async (body) => {
  const res = await fetch(`${API_BASE_URL}/refill/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await refillError(res, 'Probe failed to start');
  return res.json();
};

/**
 * GET /refill/probe/{id} → { probeId, status: RUNNING|DONE|FAILED, ticker, timeFrame, source,
 *   totals: {gaps, days, bars}, gaps: [{lastBefore, firstAfter, days: [{day, bars, expectedBars,
 *   coverage, verdict}], neighbourCheck: {before, after, verdict}, continuity, volumeRatio,
 *   verdict, reason}] }.
 * 404 (unknown or expired: probes live 30 min in memory) throws with `status` 404.
 */
export const fetchRefillProbe = async (probeId) => {
  const res = await fetch(`${API_BASE_URL}/refill/probe/${encodeURIComponent(probeId)}`);
  if (!res.ok) throw await httpError(res, 'Probe fetch failed');
  return res.json();
};

/**
 * POST /refill/probe/{id}/apply — writes exactly the bars the probe showed, as a download job.
 * @param {Object} body { gaps: [lastBefore...], acceptSuspect: [...], acceptUnverified: [...],
 *   includePartial: false, confirmReference? }
 * @returns {Promise<{jobId: string}>} 202.
 * 409 (job running → `jobId`), 404 / 410 (probe gone / expired) and 400 throw with `status`.
 */
export const applyRefill = async (probeId, body) => {
  const res = await fetch(`${API_BASE_URL}/refill/probe/${encodeURIComponent(probeId)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await refillError(res, 'Apply failed');
  return res.json();
};

/**
 * GET /refill/reference-hints?ticker=SPY — hint for a reference ticker, which cannot see its own
 * gaps: days where ≥ 50 % of the market's tickers have a DAY bar and the reference does not.
 * @returns {Promise<Array<{day, tickersWithBar, tickersTotal}>|null>} null when the backend
 *   does not offer the hint (404).
 */
export const fetchReferenceHints = async (ticker) => {
  const res = await fetch(`${API_BASE_URL}/refill/reference-hints?${new URLSearchParams({ ticker })}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await httpError(res, 'Loading the hint list failed');
  return res.json();
};

// ---- Scheduled downloads (TASK_download_schedule.md §3.5) ----

/**
 * GET /schedules → DownloadScheduleDTO[], newest first:
 * { id, name, market, timeZone, source, sourceIsDefault, timeFrame, portfolios, tickerCount,
 *   warnings, runAt: 'HH:mm', enabled, nextRunAt, dueNow, nextSessionDate, lastRunDate, lastRunAt,
 *   lastJobId, lastStatus, lastMessage, attempt, maxAttempts, nextRetryAt, ownerInstance,
 *   manualJobId, manualStatus, manualRunAt }. Times are exchange-local, zone named by `timeZone`.
 */
export const fetchSchedules = async () => {
  const res = await fetch(`${API_BASE_URL}/schedules`);
  if (!res.ok) throw await httpError(res, 'Loading schedules failed');
  return res.json();
};

/**
 * POST /schedules → 201 + the created DTO.
 * @param {Object} body { name?, market?, source?, timeFrame?, portfolios: string[], runAt: 'HH:mm' }
 * 400 (validation) and 409 (duplicate, `{error}`) throw an Error with `status` and `detail`.
 */
export const createSchedule = async (body) => {
  const res = await fetch(`${API_BASE_URL}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await httpError(res, 'Creating the schedule failed');
  return res.json();
};

/** PATCH /schedules/{id} {enabled} → 200 + DTO; 400 / 404 throw with `status`. */
export const setScheduleEnabled = async (id, enabled) => {
  const res = await fetch(`${API_BASE_URL}/schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !!enabled }),
  });
  if (!res.ok) throw await httpError(res, enabled ? 'Enabling the schedule failed' : 'Disabling the schedule failed');
  return res.json();
};

/**
 * POST /schedules/{id}/run ("Run now", forward-only) → 202 `{ jobId }`.
 * 409 `{ jobId, error }` (a download / gap delete is running) throws an Error whose `status` is
 * 409, `jobId` is the running job's id (or null) and `detail` the backend's text; 404 throws too.
 */
export const runScheduleNow = async (id) => {
  const res = await fetch(`${API_BASE_URL}/schedules/${encodeURIComponent(id)}/run`, { method: 'POST' });
  if (!res.ok) {
    const body = res.status === 409 ? await res.clone().json().catch(() => null) : null;
    const err = await httpError(res, 'Run now failed');
    err.jobId = body?.jobId ?? null;
    throw err;
  }
  return res.json();
};

/** DELETE /schedules/{id} → 204; 404 throws with `status`. A job it started keeps running. */
export const deleteSchedule = async (id) => {
  const res = await fetch(`${API_BASE_URL}/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw await httpError(res, 'Deleting the schedule failed');
};
