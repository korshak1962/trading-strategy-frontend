// src/api/httpClient.js
//
// Shared fetch helper of the universe screener API modules (screenerApi.js, universeApi.js).
// Relative URLs through the Vite '/api' proxy, same as every other api module.
//
// Every failure throws an Error carrying:
//   status  - HTTP status (undefined for a network failure: backend down / proxy error)
//   code    - an UPPER_SNAKE error code from the body (`{error: 'NAME_EXISTS', message}`), else null
//   detail  - the backend's own text (`message`, else a non-code `error`), else null
//   jobId / runId / previewId - from a 409 body (`{jobId, error}` / `{runId, error}`), else null
//   body    - the parsed JSON body (null when not JSON)
// `message` is the detail when there is one, otherwise "<what>: <status line>".

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;

const httpError = async (res, what) => {
  const body = await res.json().catch(() => null);
  const code = typeof body?.error === 'string' && CODE_RE.test(body.error) ? body.error : null;
  // Spring's default 400/404 body has `error: 'Bad Request'` (a reason phrase): prefer `message`.
  const detail = body?.message || (code ? null : body?.error) || null;
  const err = new Error(detail || `${what}: ${res.status} ${res.statusText}`);
  err.status = res.status;
  err.code = code;
  err.detail = detail;
  err.jobId = body?.jobId ?? null;
  err.runId = body?.runId ?? null;
  err.previewId = body?.previewId ?? null;
  err.body = body;
  return err;
};

/** fetch() that throws the error shape above on a network failure or a non-2xx status. */
export const apiRequest = async (url, options, what) => {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    const err = new Error(`${what}: cannot reach the backend (${e.message})`);
    err.status = undefined;
    err.code = null;
    err.detail = null;
    err.body = null;
    throw err;
  }
  if (!res.ok) throw await httpError(res, what);
  return res;
};

/** The JSON body of a 2xx response; null for 204 / an empty body. */
export const readJson = async (res) => {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const jsonBody = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const enc = (v) => encodeURIComponent(v);

/** A short human-readable text of an error thrown by apiRequest. */
export const describeApiError = (err) => {
  if (!err) return '';
  if (err.status === 404 && !err.detail) return 'Not found (404) — the backend may not serve this API yet.';
  return err.detail || err.message;
};
