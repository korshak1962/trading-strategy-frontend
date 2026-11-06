// src/components/indicatorsChart/useChannelsOverlay.js
//
// The channels overlay of the Indicators Chart: the recursive channel detection of the former
// Channel Explorer (moved without a change of behaviour), driven by the loaded request and the
// channels item's params instead of its own form. Owns the detection result, the per-timeframe
// visibility toggles, the selection shared by the chart and the channel cards, and the B-view
// exits.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectChannels, normalizeViewInfo, CHANNEL_VIEW } from '../../api/channelApi';
import { channelKey, defaultSelectedChannel, orderChannelsForCards } from '../channelExplorer/format';
import { channelTimeframes, detectorApiParams } from './indicatorSet';

const NO_LIST = [];

/**
 * @param {{ticker, from, to, tf}|null} active - the loaded request (null: nothing loaded)
 * @param {Object|null} item - the channels item (null: no channels overlay)
 */
export function useChannelsOverlay(active, item) {
  const [result, setResult] = useState(null);
  const [resultRequest, setResultRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [runId, setRunId] = useState(0);
  const [visibleTfs, setVisibleTfs] = useState(() => new Set());
  const [selectedKey, setSelectedKey] = useState(null);
  const seq = useRef(0);

  const params = item?.params || null;
  const timeframes = useMemo(
    () => (active && params ? channelTimeframes(item, active.tf) : NO_LIST),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, params],
  );
  const requestKey = active && params
    ? JSON.stringify([active.ticker, active.from, active.to, timeframes, params.view, params.lastActualChannelsOnly, detectorApiParams(params.detector)])
    : null;

  useEffect(() => {
    if (!requestKey) {
      seq.current += 1;
      setResult(null);
      setResultRequest(null);
      setError(null);
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    const request = {
      ticker: active.ticker, from: active.from, to: active.to, timeframes,
      params: detectorApiParams(params.detector), lastActualChannelsOnly: params.lastActualChannelsOnly, view: params.view,
    };
    setLoading(true);
    setError(null);
    setSelectedKey(null);
    detectChannels(request.ticker, request.from, request.to, request.timeframes, request.params,
      request.lastActualChannelsOnly, request.view)
      .then((data) => {
        if (my !== seq.current) return;
        setResult(data);
        setResultRequest(request);
        // Default selection: the first confirmed current channel in card order, as if clicked.
        const initial = defaultSelectedChannel(request.timeframes.flatMap(tf => data?.channelsByTimeframe?.[tf] ?? []));
        setSelectedKey(initial ? channelKey(initial) : null);
        setVisibleTfs(new Set(request.timeframes));
        setRunId(id => id + 1);
      })
      .catch((err) => {
        if (my !== seq.current) return;
        setResult(null);
        setResultRequest(null);
        setError(err.message || String(err));
      })
      .finally(() => {
        if (my === seq.current) setLoading(false);
      });
    // keyed on requestKey: one detection per distinct request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // Inclusive show/hide per timeframe; the last visible one cannot be hidden.
  const toggleVisibleTf = useCallback((tf) => setVisibleTfs((prev) => {
    if (prev.has(tf)) {
      if (prev.size === 1) return prev;
      const next = new Set(prev);
      next.delete(tf);
      return next;
    }
    return new Set(prev).add(tf);
  }), []);

  const tfs = resultRequest?.timeframes || NO_LIST;
  const channels = useMemo(() => (result
    ? tfs.filter(tf => visibleTfs.has(tf)).flatMap(tf => result.channelsByTimeframe?.[tf] ?? [])
    : NO_LIST), [result, tfs, visibleTfs]);
  const zoomChannels = useMemo(() => (result
    ? tfs.flatMap(tf => result.channelsByTimeframe?.[tf] ?? [])
    : NO_LIST), [result, tfs]);
  const keys = useMemo(() => channels.map(channelKey), [channels]);
  const activeSelectedKey = selectedKey && keys.includes(selectedKey) ? selectedKey : null;
  const cards = useMemo(() => orderChannelsForCards(channels), [channels]);
  const viewInfos = useMemo(
    () => (result && resultRequest ? resultRequest.timeframes.map(tf => ({ tf, info: normalizeViewInfo(result, tf) })) : NO_LIST),
    [result, resultRequest],
  );
  const constants = viewInfos.find(v => v.info?.constants)?.info.constants || null;
  const resultView = resultRequest?.view || null;
  const exits = useMemo(() => (
    resultView === CHANNEL_VIEW.INCREMENTAL
      ? viewInfos.filter(v => visibleTfs.has(v.tf)).flatMap(v => v.info?.lastExits || [])
      : NO_LIST
  ), [viewInfos, visibleTfs, resultView]);

  return {
    result, resultRequest, resultView, loading, error, runId, tfs, visibleTfs, toggleVisibleTf,
    channels, zoomChannels, cards, selectedKey: activeSelectedKey, setSelectedKey, viewInfos, constants, exits,
  };
}
