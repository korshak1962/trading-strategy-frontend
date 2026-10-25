// src/components/watch/format.js
//
// Shared formatting for the Watchlist tab, the create dialog and the toasts. Every timestamp the
// watch API returns is a zone-less exchange-local wall clock (decision 0.18): shown as received,
// labelled with the watch's exchange zone (`zone` field), never converted.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** 'America/New_York' → 'ET', 'Europe/Moscow' → 'MSK' (same labels as the schedule panel). */
export const zoneShort = (zone, ticker = null) => {
  if (zone === 'Europe/Moscow') return 'MSK';
  if (zone === 'America/New_York') return 'ET';
  if (typeof ticker === 'string' && ticker.toUpperCase().endsWith('_MOEX')) return 'MSK';
  return 'ET';
};

/** "2026-10-13T16:35:12" → "2026-10-13 16:35"; a midnight value → "2026-10-13"; '—' when empty. */
export const fmtTs = (v) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    const [y, m, d, h = 0, mi = 0] = v;
    const p = (n) => String(n).padStart(2, '0');
    return h === 0 && mi === 0 ? `${y}-${p(m)}-${p(d)}` : `${y}-${p(m)}-${p(d)} ${p(h)}:${p(mi)}`;
  }
  const s = String(v).replace('T', ' ');
  const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  if (!m[2] || m[2] === '00:00') return m[1];
  return `${m[1]} ${m[2]}`;
};

/** The calendar day of a LocalDate / LocalDateTime value ('YYYY-MM-DD'), '—' when empty. */
export const fmtDay = (v) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return fmtTs(v.slice(0, 3));
  return String(v).substring(0, 10);
};

/** A price with 2 decimals (4 below 1), '—' when absent. */
export const fmtPrice = (v) => {
  if (!isNum(v)) return '—';
  return Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(2);
};

/** A signed percent, e.g. "+1.25 %", '—' when absent. */
export const fmtPct = (v) => {
  if (!isNum(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)} %`;
};

/** BUY / SELL from the signal (action field, else the signal type). */
export const actionOf = (s) => {
  if (s?.action === 'BUY' || s?.action === 'SELL') return s.action;
  if (s?.type === 'LongOpen') return 'BUY';
  if (s?.type === 'LongClose') return 'SELL';
  return s?.type || '?';
};

/**
 * Owner Q-C: the backtest fill (`price`: the close, or the stop level of a post-trade stop) is the
 * primary price; when it differs from the bar's close, the close is shown alongside.
 * @returns {{primary: string, close: string|null, isStop: boolean}}
 */
export const signalPrices = (s) => {
  const price = s?.price;
  const close = s?.barClose;
  const differs = isNum(price) && isNum(close) && Math.abs(price - close) > 1e-9;
  return {
    primary: fmtPrice(isNum(price) ? price : close),
    close: differs ? fmtPrice(close) : null,
    isStop: differs && actionOf(s) === 'SELL',
  };
};

/** One-line price text: "@ 571.40 (stop; close 569.80)" / "@ 581.20". */
export const signalPriceText = (s) => {
  const p = signalPrices(s);
  if (!p.close) return `@ ${p.primary}`;
  return p.isStop ? `@ ${p.primary} (stop level; close ${p.close})` : `@ ${p.primary} (close ${p.close})`;
};

/** |bar change| above this percent is shown red (a split looks like a crash, design §11 D14). */
export const BIG_BAR_CHANGE_PCT = 20;

export const MODE_LABELS = {
  WAIT_ENTRY: 'C · wait entry',
  HOLDING: 'A · holding',
};
export const modeLabel = (m) => MODE_LABELS[m] || m || '—';

// WatchNotificationKind. INFO: an informational notice without a new signal - e.g. "Channel
// semantics changed: signals were re-baselined" after the switch to incremental channels.
export const NOTIFICATION_KIND_LABEL = {
  SIGNALS: 'New signal',
  RETRACTED: 'Signal withdrawn',
  BROKEN: 'Watch broken',
  INFO: 'Info',
};
export const notificationKindLabel = (kind) => NOTIFICATION_KIND_LABEL[kind] || 'Watch';

export const STATE_LABELS = {
  BASELINE: 'baseline',
  PROVISIONAL: 'provisional',
  CONFIRMED: 'confirmed',
  RETRACTED: 'retracted',
};

export const HEALTH_INFO = {
  OK: { icon: '●', label: 'OK', cls: 'watch-health--ok' },
  STALE: { icon: '⚠', label: 'Stale', cls: 'watch-health--stale' },
  DATA_NOT_UPDATED: { icon: '⚠', label: 'Data not updated', cls: 'watch-health--stale' },
  ERROR: { icon: '✖', label: 'Error', cls: 'watch-health--error' },
};

/** Readable texts of the backend's error / warning codes (the backend message is shown too). */
export const CODE_TEXT = {
  // create / status errors
  CASE_NOT_FOUND: 'The saved case no longer exists.',
  TIMEFRAME_NOT_SUPPORTED: 'Watches support only the DAY and WEEK timeframes.',
  LONG_ONLY_REQUIRED: 'The case is not long-only. Re-save it with "Long only" ticked, then watch it.',
  CASE_NOT_RECONCILABLE: 'A strategy of the case no longer exists — the case cannot be watched.',
  MODE_INVALID: 'Choose a mode.',
  ENTRY_DATE_OUT_OF_RANGE: 'The entry date must be on or before the exchange\'s today and inside the case\'s data range.',
  ENTRY_PRICE_INVALID: 'The entry price must be a positive number.',
  NO_EXIT_SOURCE_FOR_SEEDED_POSITION: 'No strategy of the case can exit a position you already hold '
    + '(CausalChannelBreakout does not exit an adopted position). Add an exit strategy or a stop to the case.',
  NAME_TOO_LONG: 'The name is too long (at most 128 characters).',
  WATCH_NOT_FOUND: 'The watch no longer exists.',
  STATUS_INVALID: 'Invalid status.',
  INVALID_STATUS_TRANSITION: 'A closed or broken watch cannot be resumed — create a new one.',
  EVALUATION_IN_PROGRESS: 'A check of this watch is already running.',
  WATCH_NOT_ACTIVE: 'The watch is not active (paused, closed or broken).',
  INITIAL_POSITION_LONG_ONLY: 'A seeded position must be LONG.',
  INITIAL_POSITION_REQUIRES_TRADE_START: 'A seeded position needs a trade start.',
  INITIAL_POSITION_NOT_SUPPORTED_IN_OPTIMIZE: 'A seeded position cannot be used in Optimize.',
  // create warnings
  RECONCILE: 'The case was adjusted to the current strategies.',
  SHORT_WARMUP: 'Short warm-up before the trading window.',
  CCB_NOT_EXIT_SOURCE: 'CausalChannelBreakout does not take part in exiting the seeded position.',
  LBR_NO_SUPPORT_ZONE: 'LevelBreakoutRetest found no support zone for the seeded position: it exits only on take-profit.',
  ENTRY_PRICE_OUTSIDE_BAR: 'The entry price is outside the bar\'s low..high — a typo?',
  EXITED_BEFORE_LINK: 'The strategy would already have sold since your entry: the watch is FLAT and waits for a new entry.',
  ENTERED_ON_LINK_DAY: 'The model entered on today\'s bar; you will be told about the exit.',
  DUPLICATE_WATCH: 'A watch of the same case, ticker, timeframe and mode already exists.',
  CAUSALITY_UNVERIFIED: 'The case contains a strategy whose causality is not verified (TrendChange / Tilt): signals may repaint.',
  WATCH_SCHEDULE_DISABLED: 'The WATCH download schedule of this market is disabled — the watch will not update by itself.',
  DATA_OUTDATED: 'The ticker\'s data is outdated; the WATCH download will update it.',
  NO_RAW_HISTORY: 'The ticker has no hourly history: the forward-only WATCH download will skip it. Download the history once.',
  NO_BARS_IN_WINDOW: 'No bars in the trading window yet — waiting for data.',
};

/** "Readable text — backend message" for a `{code, message}` (warning or thrown error). */
export const describeCode = (code, message) => {
  const known = code ? CODE_TEXT[code] : null;
  if (known && message && message !== known) return `${known} (${message})`;
  return known || message || code || 'Unknown error';
};

/** Readable text of an error thrown by watchApi (code-aware). */
export const describeError = (err) => {
  if (!err) return '';
  if (err.status === undefined && !err.code) return err.message;
  if (err.code) return describeCode(err.code, err.detail || null);
  return err.message;
};

/** The position summary of a WatchDTO.position. */
export const positionText = (pos) => {
  if (!pos || !pos.side) return '—';
  if (pos.side !== 'LONG') return 'FLAT';
  const since = pos.entryDate ? ` since ${fmtDay(pos.entryDate)}` : '';
  const at = isNum(pos.entryPrice) ? ` @ ${fmtPrice(pos.entryPrice)}` : '';
  return `LONG${since}${at}`;
};

/** "WATCH (US)" / "WATCH (MOEX)" — the dynamic portfolio's display name (BA §3.1). */
export const watchPortfolioLabel = (name) => {
  if (name === 'WATCH_US') return 'WATCH (US)';
  if (name === 'WATCH_MOEX') return 'WATCH (MOEX)';
  return name;
};

const WATCH_TIMEFRAMES = new Set(['DAY', 'WEEK']);

/**
 * Advisory reason a saved case cannot be watched (null = fine): v1 watches DAY / WEEK long-only
 * cases. Only a hint - the backend's 400 codes decide.
 * @param {{timeframe?: string, longOnly?: boolean}} c
 */
export const watchBlockReason = ({ timeframe, longOnly } = {}) => {
  if (timeframe && !WATCH_TIMEFRAMES.has(timeframe)) return `Watches support DAY and WEEK only (this case is ${timeframe})`;
  if (longOnly === false) return 'The case is not long-only — re-save it with "Long only" ticked to watch it';
  return null;
};
