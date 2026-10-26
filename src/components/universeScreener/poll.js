// src/components/universeScreener/poll.js
//
// Poll helpers of the Screener tab: runs, previews and universe refresh jobs live on the backend's
// own executors; history / prepare / recalc are ordinary download jobs (/api/downloader/jobs/{id}).

import { fetchJob } from '../../api/downloaderApi';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls `load()` every `intervalMs` until `isDone(value)`; `onUpdate(value)` after each poll.
 * `isCancelled()` stops it quietly (unmount / a newer poll). Up to `maxFailures` consecutive
 * failures are tolerated (transient backend hiccup); a 404 stops at once. Returns the last value
 * (undefined when cancelled).
 */
export const pollUntil = async ({ load, isDone, onUpdate, isCancelled = () => false, intervalMs = 1500, maxFailures = 5 }) => {
  let failures = 0;
  for (;;) {
    if (isCancelled()) return undefined;
    try {
      const v = await load();
      failures = 0;
      if (isCancelled()) return undefined;
      onUpdate?.(v);
      if (isDone(v)) return v;
    } catch (err) {
      if (err?.status === 404) throw err;
      failures += 1;
      if (failures >= maxFailures) throw err;
    }
    await sleep(intervalMs);
  }
};

/** Terminal statuses of a download job (DownloadJobTable.jsx). */
export const DOWNLOAD_TERMINAL = new Set(['DONE', 'PARTIAL', 'FAILED', 'CANCELLED']);

/** Polls a download job until it ends; resolves with the final job JSON. */
export const waitForDownloadJob = (jobId, { onUpdate, isCancelled, intervalMs = 2000 } = {}) => pollUntil({
  load: () => fetchJob(jobId),
  isDone: (j) => DOWNLOAD_TERMINAL.has(j?.status),
  onUpdate,
  isCancelled,
  intervalMs,
});
