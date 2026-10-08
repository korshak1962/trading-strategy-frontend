// src/utils/dates.js
//
// Decision 0.18 (screener TASK_downloader_tab.md): EXCHANGE TIME EVERYWHERE, NO CONVERSION.
// Every timestamp the API returns is a zone-less exchange-local wall-clock value
// ("2026-10-02T09:30:00" = 09:30 New York for US tickers, 09:30 Moscow for `_MOEX`). The UI
// shows it exactly as received, whatever zone the browser is in.
//
// How we keep a JS Date from shifting it: a wall-clock value is held as a "UTC-faked" Date —
// its UTC fields ARE the exchange wall clock (parseExchangeTs builds it with Date.UTC). It must
// then only be read through UTC accessors (getUTCHours, toISOString, Intl with timeZone 'UTC',
// fmtExchange* below). Never feed an API string to `new Date(str)` (a date-only string is
// parsed as UTC, a date-time one as browser-local time — the two disagree), and never show a
// UTC-faked Date with getHours()/toLocaleString() without timeZone: 'UTC'.
//
// Date-only values the USER picks (inputs, presets) are plain 'YYYY-MM-DD' strings or local
// Dates converted with toLocalIsoDate, and are sent as the literal calendar day.

const pad2 = (n) => String(n).padStart(2, '0');

/** Exchange zone ids (decision 0.18). */
export const US_ZONE = 'America/New_York';
export const MOEX_ZONE = 'Europe/Moscow';

/** Zone of a market selector value ('US' | 'MOEX'). */
export const exchangeZoneForMarket = (market) => (market === 'MOEX' ? MOEX_ZONE : US_ZONE);

/** Zone of a stored ticker: `_MOEX`-suffixed tickers trade in Moscow, everything else in New York. */
export const exchangeZoneForTicker = (ticker) =>
  (typeof ticker === 'string' && ticker.toUpperCase().endsWith('_MOEX') ? MOEX_ZONE : US_ZONE);

/**
 * Integer key for a Date's local calendar day (YYYYMMDD), ignoring the time of day.
 * For user-picked local Dates (DateRangePicker), not for API timestamps.
 * @param {Date} d
 * @returns {number}
 */
export const calendarDayKey = (d) =>
  d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/**
 * Local calendar date as 'YYYY-MM-DD' (the DateRangePicker.jsx approach), for a Date the
 * user picked. Never use toISOString() for this: it converts to UTC, so local midnight of
 * Jan 1 becomes Dec 31 of the previous year east of UTC.
 * @param {Date} d
 * @returns {string}
 */
export const toLocalIsoDate = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * The exchange's current calendar date as 'YYYY-MM-DD' — NOT the browser's. A user in Tokyo
 * on Saturday morning is still on Friday in New York.
 * @param {string} [zone=US_ZONE] IANA zone (US_ZONE / MOEX_ZONE)
 * @param {Date} [now=new Date()] injectable for tests
 * @returns {string}
 */
export const exchangeToday = (zone = US_ZONE, now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * Pure calendar arithmetic on a 'YYYY-MM-DD' string (no time zone involved).
 * @param {string} isoDate 'YYYY-MM-DD'
 * @param {number} days may be negative
 * @returns {string}
 */
export const addDaysIso = (isoDate, days) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().substring(0, 10);
};

/** Same calendar day `years` years earlier/later (Feb 29 → Mar 1 in a non-leap year). */
export const addYearsIso = (isoDate, years) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().substring(0, 10);
};

/** January 1 of the exchange's current year, 'YYYY-MM-DD'. */
export const exchangeStartOfYear = (zone = US_ZONE, now = new Date()) =>
  `${exchangeToday(zone, now).substring(0, 4)}-01-01`;

/**
 * The exchange's date `days` calendar days before its today, 'YYYY-MM-DD'.
 * daysAgoIso(N - 1) is the backend history-limit horizon `today − N + 1`.
 */
export const daysAgoIso = (days, zone = US_ZONE, now = new Date()) =>
  addDaysIso(exchangeToday(zone, now), -days);

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?/;

/**
 * Parse an API wall-clock timestamp into a UTC-faked Date (see the file header): the
 * returned Date's UTC fields equal the exchange wall clock. Accepts 'YYYY-MM-DD',
 * 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DDTHH:mm:ss[.fff]', a Jackson array [y, m, d, h, mi, s], an
 * epoch-ms number (passed through) or an already-parsed Date (passed through). Any trailing
 * zone designator is ignored on purpose: the API never sends one, and the wall clock is what
 * we show. Empty/unparseable input gives an Invalid Date (getTime() is NaN), like
 * `new Date('garbage')`, so existing `.getTime()` / comparison call sites never throw.
 * @returns {Date}
 */
export const parseExchangeTs = (v) => {
  if (v == null || v === '') return new Date(NaN);
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (Array.isArray(v)) {
    const [y, m, d, h = 0, mi = 0, s = 0] = v;
    return new Date(Date.UTC(y, m - 1, d, h, mi, s));
  }
  const m = TS_RE.exec(String(v));
  if (!m) return new Date(NaN);
  const ms = m[7] ? Number(m[7].substring(0, 3).padEnd(3, '0')) : 0;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), ms));
};

/** parseExchangeTs(v) in epoch ms (NaN when unparseable) — for sorting and x-scale math. */
export const exchangeTsMs = (v) => parseExchangeTs(v).getTime();

/** Unix seconds of the UTC-faked wall clock — the `time` lightweight-charts expects. */
export const exchangeTsSeconds = (v) => {
  const ms = parseExchangeTs(v).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

/** Intl formatting of a UTC-faked Date in the exchange wall clock (timeZone forced to 'UTC'). */
export const fmtExchangeIntl = (v, options = {}, locale = undefined) => {
  const d = parseExchangeTs(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d);
};

/**
 * The exchange's today as a browser-local Date at local midnight — for the user-picked
 * DateRangePicker state (local Dates, sent as their literal calendar day), so "today"
 * defaults and presets follow the exchange calendar rather than the browser's.
 */
export const exchangeTodayLocalDate = (zone = US_ZONE, now = new Date()) => {
  const [y, m, d] = exchangeToday(zone, now).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * The current wall clock of `zone` as a UTC-faked epoch ms (its UTC fields are the zone's
 * wall clock), comparable with parseExchangeTs values sent in that zone — whatever zone the
 * browser runs in. NaN for an unknown zone id.
 * @param {string} zone IANA zone id
 * @param {Date} [now=new Date()] injectable for tests
 * @returns {number}
 */
export const zoneWallClockNowMs = (zone, now = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return Date.UTC(get('year'), get('month') - 1, get('day'),
      get('hour'), get('minute'), get('second'), now.getUTCMilliseconds());
  } catch {
    return NaN;
  }
};

/**
 * Elapsed ms of a job whose startedAt / finishedAt are zone-less wall-clock times in `zone`
 * (the job JSON's `timeZone`). A running job (no finishedAt) is measured against `zone`'s
 * current wall clock, so the result is right in any browser zone. Null when startedAt is
 * missing/unparseable. Without a zone, falls back to browser-local parsing and Date.now()
 * (correct only when the browser runs in the server's zone).
 * @returns {number|null}
 */
export const jobElapsedMs = (startedAt, finishedAt, zone, now = new Date()) => {
  if (!startedAt) return null;
  if (!zone) {
    const start = new Date(startedAt).getTime();
    if (Number.isNaN(start)) return null;
    const fin = finishedAt ? new Date(finishedAt).getTime() : NaN;
    return (Number.isNaN(fin) ? now.getTime() : fin) - start;
  }
  const start = exchangeTsMs(startedAt);
  if (Number.isNaN(start)) return null;
  const fin = finishedAt ? exchangeTsMs(finishedAt) : NaN;
  const end = Number.isNaN(fin) ? zoneWallClockNowMs(zone, now) : fin;
  return Number.isNaN(end) ? null : end - start;
};
