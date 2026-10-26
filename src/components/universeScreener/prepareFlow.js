// src/components/universeScreener/prepareFlow.js
//
// "Prepare for strategies" (architect.md "Universe screener rev 1" §6.3): a universe ticker keeps
// only the minimal indicator set; before a backtest the full set is computed by a download job.
// Used by the Screener → Backtest transition and by the hint under a Backtest 400.

import { prepareForStrategies } from '../../api/universeApi';
import { describeApiError } from '../../api/httpClient';
import { waitForDownloadJob } from './poll';

/** The backend's hint in a SmaNotAvailableException message (400 of a direct backtest). */
export const isMinimalIndicatorsError = (message) =>
  typeof message === 'string' && /prepare for strategies/i.test(message);

/**
 * Starts "prepare" and waits for its download job.
 * @returns {Promise<{status: 'READY'|'NOT_MEMBER'|'SLOT_BUSY'|'FAILED', text: string}>}
 *   READY — the job finished (DONE / PARTIAL); NOT_MEMBER — 404 (not a universe ticker: nothing to
 *   prepare); SLOT_BUSY — 409, FULL recorded, the next universe download computes it; FAILED.
 */
export const prepareAndWait = async (ticker, { onProgress, isCancelled } = {}) => {
  let started;
  try {
    started = await prepareForStrategies(ticker);
  } catch (err) {
    if (err.status === 404) return { status: 'NOT_MEMBER', text: `${ticker} is not a universe member — nothing to prepare.` };
    if (err.status === 409) {
      return {
        status: 'SLOT_BUSY',
        text: `The download slot is busy${err.jobId ? ` (job ${err.jobId})` : ''}. The full indicator set of ${ticker} is `
          + 'recorded and will be computed by the next universe download (or retry when the slot is free).',
      };
    }
    return { status: 'FAILED', text: `Prepare for strategies failed: ${describeApiError(err)}` };
  }
  const jobId = started?.jobId;
  if (!jobId) return { status: 'READY', text: `${ticker} is ready for strategies.` };
  try {
    const job = await waitForDownloadJob(jobId, { onUpdate: onProgress, isCancelled });
    if (!job) return { status: 'FAILED', text: 'Cancelled.' };
    if (job.status === 'DONE' || job.status === 'PARTIAL') return { status: 'READY', text: `${ticker} is ready for strategies.` };
    return { status: 'FAILED', text: `The indicator job ended ${job.status}${job.error ? `: ${job.error}` : ''} — see the Downloader tab.` };
  } catch (err) {
    return { status: 'FAILED', text: `Could not follow the indicator job ${jobId}: ${describeApiError(err)}` };
  }
};
