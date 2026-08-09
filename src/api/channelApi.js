// src/api/channelApi.js
//
// Recursive channel detection, served from screener's single consolidated backend (same
// dev-server proxy strategyApi.js already relies on — see vite.config.js's '/api' -> screener
// proxy). The old "windowed" algorithm and its separate channel-recursive:8081 base URL are
// gone: windowed detection was deleted server-side, and channel-recursive is no longer a
// separately-deployed service, so there is exactly one algorithm and one backend to call.

const API_BASE_URL = '/api/channels';

const fmtDt = (val) => {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().substring(0, 10) + 'T00:00:00';
  return val.length === 10 ? `${val}T00:00:00` : String(val).substring(0, 19);
};

export const detectChannels = async (
  ticker, startDate, endDate, timeframes, params = null, lastActualChannelsOnly = false
) => {
  const body = { ticker, startDate: fmtDt(startDate), endDate: fmtDt(endDate), timeframes, params, lastActualChannelsOnly };
  const res = await fetch(`${API_BASE_URL}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Channel detection failed: ${res.status} ${res.statusText}`);
  return res.json();
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
