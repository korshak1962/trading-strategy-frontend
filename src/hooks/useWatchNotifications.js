// src/hooks/useWatchNotifications.js
//
// Signal watch notifications (screener architect.md "Signal watch — design rev 1" §6.1): polls
// GET /api/watches/notifications/unread every 60 s (and when the window regains focus / becomes
// visible) for the Watchlist badge, and turns notifications newer than the last one seen into
// toasts. The last seen id is kept in localStorage so a reload does not toast old ones again.
//
// Defensive by design: the backend may not serve the watch API yet (404) or be down. A failed
// poll is silent (no error UI), keeps the last known counts and backs off — 404 straight to the
// longest delay, other failures doubling up to it — so a missing endpoint is not hammered.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getUnreadSummary, listNotifications } from '../api/watchApi';

const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const STORAGE_KEY = 'watch.lastSeenNotificationId';
const MAX_TOASTS = 5;
const TOAST_FETCH_LIMIT = 50;

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
    // storage blocked (private window, cleared site data): toasts may repeat after a reload
  }
};

/**
 * @returns {{count: number, stale: number, errors: number, available: boolean, latestId: number|null,
 *   toasts: Array<Object>, dismiss: (id: number) => void, dismissAll: () => void,
 *   refresh: () => Promise<void>}}
 *   `available` is false until the first successful poll (and after a 404): the badge stays hidden.
 */
export const useWatchNotifications = () => {
  const [summary, setSummary] = useState({ count: 0, stale: 0, errors: 0, latestId: null, available: false });
  const [toasts, setToasts] = useState([]);
  const lastSeen = useRef(readLastSeen());
  const inFlight = useRef(false);
  const delay = useRef(POLL_MS);
  const timer = useRef(null);
  const unmounted = useRef(false);
  // Poll function for the timer (set below); a ref so the timer never calls a stale closure.
  const pollRef = useRef(null);

  const schedule = useCallback((ms) => {
    if (timer.current) clearTimeout(timer.current);
    if (unmounted.current) return;
    timer.current = setTimeout(() => pollRef.current?.(), ms);
  }, []);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== 'undefined' && document.hidden) {
      // Hidden tab: no request; the visibilitychange handler polls when it comes back.
      schedule(delay.current);
      return;
    }
    inFlight.current = true;
    try {
      const s = await getUnreadSummary();
      if (unmounted.current) return;
      const latestId = Number.isFinite(s?.latestId) ? s.latestId : null;
      setSummary({
        count: Number.isFinite(s?.count) ? s.count : 0,
        stale: Number.isFinite(s?.staleWatches) ? s.staleWatches : 0,
        errors: Number.isFinite(s?.errorWatches) ? s.errorWatches : 0,
        latestId,
        available: true,
      });
      delay.current = POLL_MS;

      if (latestId != null && latestId > lastSeen.current) {
        const seenBefore = lastSeen.current;
        try {
          const list = await listNotifications({ unreadOnly: true, limit: TOAST_FETCH_LIMIT });
          if (unmounted.current) return;
          const fresh = (Array.isArray(list) ? list : [])
            .filter((n) => Number.isFinite(n?.id) && n.id > seenBefore)
            .sort((a, b) => b.id - a.id);
          if (fresh.length > 0) {
            setToasts((prev) => {
              const known = new Set(prev.map((t) => t.id));
              const merged = [...fresh.filter((n) => !known.has(n.id)), ...prev];
              return merged.slice(0, MAX_TOASTS);
            });
          }
          lastSeen.current = latestId;
          writeLastSeen(latestId);
        } catch {
          // keep lastSeen: the next poll tries the toasts again
        }
      }
    } catch (err) {
      if (unmounted.current) return;
      // 404: the backend has no watch API (yet) → longest delay; other failures back off.
      delay.current = err?.status === 404 ? MAX_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, delay.current * 2);
      if (err?.status === 404) setSummary((prev) => ({ ...prev, available: false }));
    } finally {
      inFlight.current = false;
      schedule(delay.current);
    }
  }, [schedule]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    unmounted.current = false;
    poll();
    // Focus / becoming visible: poll now, unless the API is backing off after failures.
    const wake = () => {
      if (document.hidden || delay.current > POLL_MS) return;
      poll();
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      unmounted.current = true;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [poll]);

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const dismissAll = useCallback(() => setToasts([]), []);

  // Manual refresh (after mark read / a check in the Watchlist): resets the back-off.
  const refresh = useCallback(async () => {
    delay.current = POLL_MS;
    await poll();
  }, [poll]);

  return {
    count: summary.count,
    stale: summary.stale,
    errors: summary.errors,
    latestId: summary.latestId,
    available: summary.available,
    toasts,
    dismiss,
    dismissAll,
    refresh,
  };
};

export default useWatchNotifications;
