// src/components/strategyConstructor/useConstructedNames.js
//
// Keeps the shared name cache of constructedFormat.js (constructedLabel / strategyLabel) filled:
// the available strategies on every load, plus a one-off version read for every constructed
// key / token on screen whose name is unknown (a deleted strategy is not in available-strategies,
// GET /constructed/{id}/versions/{v} still serves it). Labels only - no key sent anywhere changes.

import { useEffect, useMemo, useState } from 'react';
import { getConstructedVersion } from '../../api/constructedApi';
import {
  hasConstructedName, parseConstructedRef, rememberAvailableStrategies, rememberConstructedName,
} from './constructedFormat';

const requested = new Set(); // ids asked once per page load (a failed read is not retried)

/**
 * @param {string[]} keys strategy keys / profile tokens / class names on screen (others ignored)
 * @param {Array} availableStrategies StrategyInfoDTO[]
 * @returns {number} a counter that changes when names arrived (a render dependency)
 */
export default function useConstructedNames(keys, availableStrategies) {
  const [tick, setTick] = useState(0);
  const listTick = useMemo(() => {
    rememberAvailableStrategies(availableStrategies);
    return availableStrategies;
  }, [availableStrategies]);

  const wanted = (keys || []).map(parseConstructedRef).filter(Boolean);
  const signature = wanted.map((r) => `${r.id}@${r.version ?? ''}`).sort().join(',');

  useEffect(() => {
    const refs = signature ? signature.split(',').map((x) => {
      const [id, v] = x.split('@');
      return { id: Number(id), version: v ? Number(v) : 1 }; // version 1 always exists
    }) : [];
    refs.filter((r) => !hasConstructedName(r.id) && !requested.has(r.id)).forEach((r) => {
      requested.add(r.id);
      getConstructedVersion(r.id, r.version)
        .then((d) => {
          rememberConstructedName(r.id, d?.name);
          setTick((t) => t + 1); // also after a re-run: the name is cached, the screen must redraw
        })
        .catch(() => {}); // unknown id: the label stays "deleted strategy #<id>"
    });
  }, [signature, listTick]);

  return tick;
}
