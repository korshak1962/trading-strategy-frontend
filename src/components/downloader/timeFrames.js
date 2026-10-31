// src/components/downloader/timeFrames.js
//
// Raw download timeframes shared by the manual Download form and the schedule form
// (screener TASK_download_schedule.md §5.1).

export const TIMEFRAMES = [
  { value: 'MIN5', label: '5 Minutes' },
  { value: 'HOUR', label: 'Hour' },
  { value: 'DAY', label: 'Day' },
];

/**
 * Timeframe for a source: keep `preferred` if the source serves it, otherwise `fallback`
 * if the source serves that, otherwise the source's first supported timeframe.
 * A source without a `supportedTimeFrames` list keeps `preferred`.
 * The manual form uses the default fallback DAY; the schedule form uses ('HOUR', source, 'HOUR').
 */
export const pickTimeFrame = (preferred, source, fallback = 'DAY') => {
  const tfs = source?.supportedTimeFrames || [];
  if (tfs.length === 0 || tfs.includes(preferred)) return preferred;
  if (tfs.includes(fallback)) return fallback;
  return tfs[0];
};

// Refill gaps (screener architect_refill_gaps.md §1.1): raw fill levels (WEEK / MONTH are always
// aggregated) and the reference tickers whose calendar the gap scan uses — they cannot see their
// own gaps and need an explicit day list plus a separate confirmation.
export const REFILL_TIMEFRAMES = TIMEFRAMES.map((t) => t.value);
export const REFERENCE_TICKERS = new Set(['SPY', 'SBER_MOEX']);
