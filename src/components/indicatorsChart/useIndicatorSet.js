// src/components/indicatorsChart/useIndicatorSet.js
//
// The indicator set of the Indicators Chart (B4): restored from localStorage on mount, checked
// against the registry once its descriptors are known (a kind no longer in the registry is
// dropped with a visible notice), saved on every change.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHANNELS, loadStoredItems, newItemId, saveStoredItems, sanitizeItems,
} from './indicatorSet';

/**
 * @param {Array|null} descriptors - registry descriptors (GET /api/indicators/meta), null until known
 * @returns {{items: Array, notice: ?string, dismissNotice: Function, add: Function, update: Function,
 *   remove: Function, toggleHidden: Function, setChannels: Function}}
 */
export function useIndicatorSet(descriptors) {
  const [items, setItems] = useState(() => sanitizeItems(loadStoredItems(), null).items);
  const [notice, setNotice] = useState(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!descriptors || checkedRef.current) return;
    checkedRef.current = true;
    setItems((prev) => {
      const { items: next, dropped } = sanitizeItems(prev, descriptors);
      if (dropped.length) {
        setNotice(`Removed from the saved indicator set: ${dropped.join(', ')}.`);
      }
      return next;
    });
  }, [descriptors]);

  useEffect(() => { saveStoredItems(items); }, [items]);

  const add = useCallback((item) => {
    const withId = { ...item, id: newItemId() };
    setItems((prev) => [...prev, withId]);
    return withId.id;
  }, []);

  const update = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const toggleHidden = useCallback((id) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it)));
  }, []);

  /** Puts the channels overlay in with these params (a deep link), or removes it (params null). */
  const setChannels = useCallback((params) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.kind === CHANNELS);
      if (!params) return existing ? prev.filter((it) => it.kind !== CHANNELS) : prev;
      if (existing) return prev.map((it) => (it.kind === CHANNELS ? { ...it, params, hidden: false } : it));
      return [...prev, { id: newItemId(), kind: CHANNELS, params, hidden: false }];
    });
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { items, notice, dismissNotice, add, update, remove, toggleHidden, setChannels };
}
