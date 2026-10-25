// src/api/channelApi.js
//
// Recursive channel detection, served from screener's single consolidated backend (same
// dev-server proxy strategyApi.js already relies on — see vite.config.js's '/api' -> screener
// proxy). The old "windowed" algorithm and its separate channel-recursive:8081 base URL are
// gone: windowed detection was deleted server-side, and channel-recursive is no longer a
// separately-deployed service, so there is exactly one algorithm and one backend to call.

import { toLocalIsoDate } from '../utils/dates';

const API_BASE_URL = '/api/channels';

const fmtDt = (val) => {
  if (!val) return '';
  // A user-picked Date → its literal calendar day (decision 0.18; toISOString() would shift it to UTC).
  if (val instanceof Date) return toLocalIsoDate(val) + 'T00:00:00';
  return val.length === 10 ? `${val}T00:00:00` : String(val).substring(0, 19);
};

// Channel views (screener TASK_incremental_channels rev 2, architect.md §6.1):
//   FULL        - A, "as seen today": one full detect() over [startDate, endDate]. Knows the
//                 future of the range (look-ahead by meaning) - the default, the pre-feature contract.
//   INCREMENTAL - B, "as the strategy saw it": the bar-by-bar replay the channel strategies trade
//                 on, ending on the last CLOSED bar <= endDate (a forming bar is drawn, not processed).
export const CHANNEL_VIEW = Object.freeze({ FULL: 'FULL', INCREMENTAL: 'INCREMENTAL' });

/**
 * POST /api/channels/detect.
 * `view` is sent only for B: an A request stays byte-for-byte the pre-feature one (the backend
 * treats a missing view as FULL). The response carries, per timeframe, `viewInfo[tf]`
 * ({view, semantics, firstBarDate, lastProcessedBarDate, barCount, formingBarDate,
 * currentChannelId, currentChannelAgeBars, constants {minConfirmBars, minConfirmWidthAtr, exitToleranceAtr},
 * lastExits[], message, replayMs}) - absent on an older backend, see normalizeViewInfo.
 */
export const detectChannels = async (
  ticker, startDate, endDate, timeframes, params = null, lastActualChannelsOnly = false,
  view = CHANNEL_VIEW.FULL
) => {
  const body = { ticker, startDate: fmtDt(startDate), endDate: fmtDt(endDate), timeframes, params, lastActualChannelsOnly };
  if (view === CHANNEL_VIEW.INCREMENTAL) body.view = CHANNEL_VIEW.INCREMENTAL;
  const res = await fetch(`${API_BASE_URL}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.message || j?.error || ''; } catch { /* not JSON */ }
    throw new Error(`Channel detection failed: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`);
  }
  return res.json();
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * viewInfo[tf] of a detect response, normalized: missing collections become [] / null, so the
 * UI can read it without guards. Returns null when the backend sent none for this timeframe
 * (an older backend). `constants` stays null when absent - the UI then shows nothing invented.
 */
export const normalizeViewInfo = (result, tf) => {
  const raw = result?.viewInfo?.[tf];
  if (!raw) return null;
  const c = raw.constants || null;
  return {
    view: raw.view || null,
    semantics: raw.semantics || null,
    firstBarDate: raw.firstBarDate || null,
    lastProcessedBarDate: raw.lastProcessedBarDate || null,
    barCount: isNum(raw.barCount) ? raw.barCount : null,
    formingBarDate: raw.formingBarDate || null,
    currentChannelId: raw.currentChannelId || null,
    currentChannelAgeBars: isNum(raw.currentChannelAgeBars) ? raw.currentChannelAgeBars : null,
    constants: c ? {
      minConfirmBars: isNum(c.minConfirmBars) ? c.minConfirmBars : null,
      minConfirmWidthAtr: isNum(c.minConfirmWidthAtr) ? c.minConfirmWidthAtr : null,
      exitToleranceAtr: isNum(c.exitToleranceAtr) ? c.exitToleranceAtr : null,
    } : null,
    lastExits: Array.isArray(raw.lastExits) ? raw.lastExits.filter(Boolean).map(e => ({ ...e, timeframe: tf })) : [],
    message: raw.message || null,
    replayMs: isNum(raw.replayMs) ? raw.replayMs : null,
  };
};

export const fetchPrices = async (ticker, timeframe, startDate, endDate) => {
  const params = new URLSearchParams({
    ticker,
    timeframe,
    start: fmtDt(startDate),
    end: fmtDt(endDate),
  });
  const res = await fetch(`${API_BASE_URL}/prices?${params}`);
  if (!res.ok) throw new Error(`Price fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
};
