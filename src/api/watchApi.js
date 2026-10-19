// src/api/watchApi.js
//
// Signal watch (screener logs/agents/architect.md "Signal watch — design rev 1" §5, frozen
// contract). Relative URL through the Vite '/api' proxy, same as downloaderApi.js.
//
// Every failure throws an Error carrying:
//   status  - HTTP status (undefined for a network failure: backend down / proxy error)
//   code    - the backend's error code (`{error: CODE, message}` bodies), else null
//   message - the backend's message when there is one, else a status line
//   body    - the parsed JSON body (null when not JSON)
// so callers can show the backend's 400 codes readably and tell a missing endpoint (404 on an
// older backend) from a transient failure.

const API_BASE_URL = '/api/watches';

const httpError = async (res, what) => {
  const body = await res.json().catch(() => null);
  // `{error: CODE, message}` (watch API) vs Spring's default `{error: 'Bad Request', message}`:
  // a code is an UPPER_SNAKE word.
  const code = typeof body?.error === 'string' && /^[A-Z][A-Z0-9_]*$/.test(body.error) ? body.error : null;
  const detail = body?.message || (code ? null : body?.error) || null;
  const err = new Error(detail || `${what}: ${res.status} ${res.statusText}`);
  err.status = res.status;
  err.code = code;
  err.detail = detail;
  err.body = body;
  return err;
};

// fetch() that turns a network failure into the same error shape (status undefined).
const request = async (url, options, what) => {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    const err = new Error(`${what}: cannot reach the backend (${e.message})`);
    err.status = undefined;
    err.code = null;
    err.body = null;
    throw err;
  }
  if (!res.ok) throw await httpError(res, what);
  return res;
};

const json = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const id = (v) => encodeURIComponent(v);

/**
 * POST /api/watches → 201 WatchCreatedDTO `{watch, warnings, baseline}`.
 * @param {{caseId: number, mode: 'WAIT_ENTRY'|'HOLDING', entryDate?: string, entryPrice?: number,
 *   name?: string, note?: string}} body
 */
export const createWatch = async (body) => {
  const res = await request(API_BASE_URL, { method: 'POST', ...json(body) }, 'Creating the watch failed');
  return res.json();
};

/** GET /api/watches?status= → WatchDTO[] (by ticker, then id). */
export const listWatches = async (status = null) => {
  const qs = status ? `?${new URLSearchParams({ status })}` : '';
  const res = await request(`${API_BASE_URL}${qs}`, undefined, 'Loading watches failed');
  return res.json();
};

/** GET /api/watches/{id} → WatchDTO; 404 WATCH_NOT_FOUND. */
export const getWatch = async (watchId) => {
  const res = await request(`${API_BASE_URL}/${id(watchId)}`, undefined, 'Loading the watch failed');
  return res.json();
};

/** PATCH /api/watches/{id} {status} → WatchDTO; 409 INVALID_STATUS_TRANSITION. */
export const setWatchStatus = async (watchId, status) => {
  const res = await request(`${API_BASE_URL}/${id(watchId)}`, { method: 'PATCH', ...json({ status }) },
    'Changing the watch status failed');
  return res.json();
};

/** DELETE /api/watches/{id} → 204 (signals, notifications and the snapshot go with it). */
export const deleteWatch = async (watchId) => {
  await request(`${API_BASE_URL}/${id(watchId)}`, { method: 'DELETE' }, 'Deleting the watch failed');
};

/** POST /api/watches/{id}/evaluate → WatchEvaluationDTO; 409 EVALUATION_IN_PROGRESS | WATCH_NOT_ACTIVE. */
export const evaluateWatch = async (watchId) => {
  const res = await request(`${API_BASE_URL}/${id(watchId)}/evaluate`, { method: 'POST' }, 'Check failed');
  return res.json();
};

/** POST /api/watches/evaluate-all → 202 `{queued}`. */
export const evaluateAll = async () => {
  const res = await request(`${API_BASE_URL}/evaluate-all`, { method: 'POST' }, 'Check all failed');
  return res.json().catch(() => ({}));
};

/**
 * GET /api/watches/{id}/backtest-config?signalId= → WatchBacktestConfigDTO
 * `{config, watchId, watchName, mode, focusBarDate, linkedAt}`; 404 (watch, or signal not of it).
 */
export const getWatchBacktestConfig = async (watchId, signalId = null) => {
  const qs = signalId != null ? `?${new URLSearchParams({ signalId: String(signalId) })}` : '';
  const res = await request(`${API_BASE_URL}/${id(watchId)}/backtest-config${qs}`, undefined,
    'Loading the watch configuration failed');
  return res.json();
};

/** GET /api/watches/signals?watchId=&includeBaseline=&limit= → WatchSignalDTO[], newest first. */
export const listWatchSignals = async ({ watchId = null, includeBaseline = true, limit = 200 } = {}) => {
  const params = new URLSearchParams({ includeBaseline: String(!!includeBaseline), limit: String(limit) });
  if (watchId != null) params.set('watchId', String(watchId));
  const res = await request(`${API_BASE_URL}/signals?${params}`, undefined, 'Loading signals failed');
  return res.json();
};

/** GET /api/watches/notifications?unreadOnly=&limit= → WatchNotificationDTO[] (id desc). */
export const listNotifications = async ({ unreadOnly = false, limit = 50 } = {}) => {
  const params = new URLSearchParams({ unreadOnly: String(!!unreadOnly), limit: String(limit) });
  const res = await request(`${API_BASE_URL}/notifications?${params}`, undefined, 'Loading notifications failed');
  return res.json();
};

/** GET /api/watches/notifications/unread → UnreadSummaryDTO `{count, latestId, staleWatches, errorWatches}`. */
export const getUnreadSummary = async () => {
  const res = await request(`${API_BASE_URL}/notifications/unread`, undefined, 'Loading unread notifications failed');
  return res.json();
};

/** POST /api/watches/notifications/{id}/read → 204; 404. */
export const markNotificationRead = async (notificationId) => {
  await request(`${API_BASE_URL}/notifications/${id(notificationId)}/read`, { method: 'POST' }, 'Mark read failed');
};

/** POST /api/watches/notifications/read-all → 204. */
export const markAllRead = async () => {
  await request(`${API_BASE_URL}/notifications/read-all`, { method: 'POST' }, 'Mark all read failed');
};
