// src/hooks/useStrategyChannelLayer.js
//
// Fetches the channel tree layer of the strategy result chart (utils/channelLayer.js) through the
// same POST /api/channels/detect the Channel Explorer uses - "last actual channels" (the two
// freshest leaves + their ancestor chains, which always contains the whole visible frontier:
// confirmed ancestors, the current channel and the drafts), in the A or B view.
//
// Responses are cached per (source, view) for the life of the hook's owner, so flipping A <-> B
// back and forth does not refetch. A response that arrives after the source / view changed is
// dropped.

import { useEffect, useRef, useState } from 'react';
import { detectChannels, normalizeViewInfo, CHANNEL_VIEW } from '../api/channelApi';
import { channelSourceKey, detectParamsFromSource } from '../utils/channelLayer';

const IDLE = { channels: [], viewInfo: null, loading: false, error: null };

/**
 * @param {Object|null} source resolveChannelSource(...) result; null = no layer
 * @param {{enabled: boolean, view: 'FULL'|'INCREMENTAL'}} options
 * @returns {{channels: Array, viewInfo: Object|null, loading: boolean, error: string|null}}
 */
export function useStrategyChannelLayer(source, { enabled, view = CHANNEL_VIEW.FULL }) {
  const sourceKey = channelSourceKey(source);
  const cache = useRef(new Map());
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!enabled || !source) { setState(IDLE); return undefined; }
    const tf = source.timeFrame || 'DAY';
    const key = `${sourceKey}|${view}`;
    const hit = cache.current.get(key);
    if (hit) { setState({ ...hit, loading: false, error: null }); return undefined; }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    detectChannels(
      source.ticker, source.startDate, source.endDate, [tf], detectParamsFromSource(source), true, view
    )
      .then((data) => {
        if (cancelled) return;
        const entry = { channels: data?.channelsByTimeframe?.[tf] || [], viewInfo: normalizeViewInfo(data, tf) };
        cache.current.set(key, entry);
        setState({ ...entry, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ channels: [], viewInfo: null, loading: false, error: err.message });
      });
    return () => { cancelled = true; };
    // `source` is represented by sourceKey (a parent may rebuild the object every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, view, enabled]);

  return state;
}
