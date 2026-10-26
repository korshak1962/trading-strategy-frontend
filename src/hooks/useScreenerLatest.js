// src/hooks/useScreenerLatest.js
//
// "New results" badge of the Screener tab (architect.md "Universe screener rev 1" §2.3, spec §8.4):
// polls GET /api/screener/latest every 60 s (and when the window becomes visible again) and counts
// the finished runs newer than the last one seen. The last seen run id lives in localStorage.
// Defensive like useWatchNotifications: a 404 (older backend) hides the badge and backs off.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLatestRuns } from '../api/screenerApi';

const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const STORAGE_KEY = 'screener.lastSeenRunId';
const FINISHED = new Set(['DONE', 'PARTIAL']);

const readLastSeen = () => {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
};

const writeLastSeen = (id) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // storage blocked: the badge may show again after a reload
  }
};

const maxId = (runs) => runs.reduce((m, r) => (Number.isFinite(r?.id) && r.id > m ? r.id : m), 0);

/**
 * @returns {{available: boolean, newCount: number, latestRunId: number|null,
 *   markSeen: (runs?: Array) => void}}
 */
export const useScreenerLatest = () => {
  const [runs, setRuns] = useState([]);
  const [available, setAvailable] = useState(false);
  const [lastSeen, setLastSeen] = useState(readLastSeen);
  const delay = useRef(POLL_MS);
  const timer = useRef(null);
  const unmounted = useRef(false);
  const pollRef = useRef(null);

  const schedule = useCallback((ms) => {
    if (timer.current) clearTimeout(timer.current);
    if (unmounted.current) return;
    timer.current = setTimeout(() => pollRef.current?.(), ms);
  }, []);

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(delay.current);
      return;
    }
    try {
      const list = await getLatestRuns();
      if (unmounted.current) return;
      setRuns(list);
      setAvailable(true);
      delay.current = POLL_MS;
    } catch (err) {
      if (unmounted.current) return;
      if (err?.status === 404) {
        setAvailable(false);
        delay.current = MAX_BACKOFF_MS;
      } else {
        delay.current = Math.min(delay.current * 2, MAX_BACKOFF_MS);
      }
    }
    schedule(delay.current);
  }, [schedule]);

  useEffect(() => { pollRef.current = poll; }, [poll]);

  useEffect(() => {
    unmounted.current = false;
    poll();
    const onVisible = () => {
      if (!document.hidden) { delay.current = POLL_MS; poll(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unmounted.current = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  // Stable: ScreenerPanel calls it from a useCallback.
  const runsRef = useRef(runs);
  useEffect(() => { runsRef.current = runs; }, [runs]);
  const markSeen = useCallback((seenRuns = null) => {
    const id = Math.max(maxId(seenRuns || []), maxId(runsRef.current));
    setLastSeen((prev) => {
      if (id <= prev) return prev;
      writeLastSeen(id);
      return id;
    });
  }, []);

  const finished = runs.filter((r) => FINISHED.has(r?.status));
  const newCount = finished.filter((r) => Number.isFinite(r?.id) && r.id > lastSeen).length;
  const latestRunId = runs.length ? maxId(runs) : null;
  return { available, newCount, latestRunId, markSeen };
};
