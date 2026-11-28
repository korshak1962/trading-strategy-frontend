// src/components/common/problemError.js
//
// Constructor editor UX Stage B3 (screener logs/agents/architect.md §6.1): a text error that may
// carry the backend's `{path, reason}` (the 400 body's `path` / `reason`, see api/httpClient.js, or
// a failed job's `errorReason`; both null for a client-side error or an older backend). The hint
// under the error keys on `reason`, the editor outlines the field named by `path`.
//
// Used as `const [state, setError] = useReducer(problemReducer, null)`: `setError(null)` clears,
// `setError('text')` sets a plain error, `setError(withProblem('text', err))` keeps err's path /
// reason. (A reducer, not a custom hook: its dispatch is stable, as a useState setter.)

const strOrNull = (v) => (typeof v === 'string' && v ? v : null);

/** `{text, path, reason}` of a text and anything carrying `path` / `reason` (an Error, a job). */
export const withProblem = (text, problem = null) => ({
  text, path: strOrNull(problem?.path), reason: strOrNull(problem?.reason),
});

/** The reducer of an error state: null, a string or a `withProblem` object → null / `{text, path, reason}`. */
export const problemReducer = (_, action) => {
  if (action == null) return null;
  if (typeof action === 'string') return { text: action, path: null, reason: null };
  return withProblem(action.text, action);
};
