// src/components/charts/workspace/useLogScale.js
import { useCallback, useState } from 'react';

/** Default localStorage key of the Log / Linear choice (TASK A1). */
export const LOG_SCALE_STORAGE_KEY = 'tsf.ws.log';

const readStored = (key) => {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
};

/**
 * Log / Linear price scale choice, remembered per viewer (TASK A1). Logarithmic by default; the
 * stored value is best effort (blocked storage, a private window: the default applies).
 * @param {string} [storageKey]
 * @returns {[boolean, (next: boolean) => void]}
 */
export const useLogScale = (storageKey = LOG_SCALE_STORAGE_KEY) => {
  const [log, setLogState] = useState(() => readStored(storageKey) ?? true);
  const setLog = useCallback((next) => {
    setLogState(Boolean(next));
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  }, [storageKey]);
  return [log, setLog];
};
