// src/components/charts/workspace/bars.js
//
// Bar time helpers shared by PriceWorkspaceChart and its layers.
import { exchangeTsSeconds } from '../../../utils/dates';

// Decision 0.18 (exchange time, no conversion): the API's zone-less wall clock
// ("2026-10-02T09:30:00", New York for US, Moscow for _MOEX) is encoded as if it were UTC
// (Date.UTC, utils/dates.js parseExchangeTs), and lightweight-charts renders Unix times in UTC, so
// the axis and crosshair show exactly 09:30 on 2026-10-02 in every browser zone. Unix SECONDS for
// every timeframe, so intraday bars never collapse onto one YYYY-MM-DD key. Never parse with
// new Date(str) / local time: that would shift every bar by the browser's UTC offset.
/** lightweight-charts `time` of an API date, or null. */
export const toBarTime = (dt) => (dt ? exchangeTsSeconds(dt) : null);

/**
 * Candle data for the chart: [{time, open, high, low, close}] sorted ascending, rows without a
 * parseable date dropped.
 */
export const toCandleData = (bars) => (bars || [])
  .map(p => ({ time: toBarTime(p.date), open: p.open, high: p.high, low: p.low, close: p.close }))
  .filter(p => p.time !== null)
  .sort((a, b) => a.time - b.time);

/**
 * Index of the candle whose time equals `targetTs`, else the nearest one (e.g. an HOUR channel
 * point on a DAY chart). -1 for no target / no candles. `candleData` is ascending.
 */
export const findBarIndex = (candleData, targetTs) => {
  if (targetTs === null || targetTs === undefined || candleData.length === 0) return -1;
  let lo = 0, hi = candleData.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candleData[mid].time === targetTs) return mid;
    if (candleData[mid].time < targetTs) lo = mid + 1;
    else hi = mid - 1;
  }
  if (lo <= 0) return 0;
  if (lo >= candleData.length) return candleData.length - 1;
  const beforeDiff = Math.abs(candleData[lo - 1].time - targetTs);
  const afterDiff = Math.abs(candleData[lo].time - targetTs);
  return beforeDiff <= afterDiff ? lo - 1 : lo;
};

/**
 * Index of the last candle at-or-before `targetTs` (floor, not nearest); the first candle when
 * `targetTs` is earlier than all of them; -1 for no target / no candles.
 */
export const findBarFloorIndex = (candleData, targetTs) => {
  if (targetTs === null || targetTs === undefined || candleData.length === 0) return -1;
  if (candleData[0].time > targetTs) return 0;
  let lo = 0, hi = candleData.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candleData[mid].time <= targetTs) lo = mid; else hi = mid - 1;
  }
  return lo;
};
