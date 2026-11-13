// src/components/strategyConstructor/useChannelMetrics.js
//
// The channel metric of every `R<r>.C<c>` of the given constructed strategy keys, read from their
// pinned versions (GET /constructed/{id}/versions/{v}, cached): `{key: {"R4.C1": "EXISTS"}}`.
// Used to label a channel condition's fixed bounds "R4 · condition 1 · EXISTS min" in the
// Backtester params and in Best Parameters. A key that fails to load simply has no entry.
import { useEffect, useState } from 'react';
import { getConstructedVersionCached } from '../../api/constructedApi';
import { channelMetricsOf, parseConstructedKey } from './constructedFormat';

export default function useChannelMetrics(keys) {
  const [metrics, setMetrics] = useState({});
  const signature = [...new Set((keys || []).filter((k) => parseConstructedKey(k)))].sort().join('|');
  useEffect(() => {
    if (!signature) return undefined;
    let alive = true;
    signature.split('|').forEach((key) => {
      const { id, version } = parseConstructedKey(key);
      if (id == null || version == null) return;
      getConstructedVersionCached(id, version)
        .then((dto) => {
          if (alive) setMetrics((prev) => (prev[key] ? prev : { ...prev, [key]: channelMetricsOf(dto?.rules) }));
        })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, [signature]);
  return metrics;
}
