// Shared fraction <-> whole-percentage conversion for display/edit boundaries.
//
// The wire format (RecursiveChannelParams.minWidthPct request field, Channel.widthPct response
// field) always stays a fraction (0.05 = 5%) - only the UI displays/edits it as a whole
// percentage (5). Convert here, at the boundary, rather than inline in each component.

// Fraction (0.05) -> display number (5), for populating an editable input.
export const fractionToDisplayPct = (fraction) => fraction * 100;

// Display number (5) -> fraction (0.05), for building a request payload.
export const displayPctToFraction = (pct) => pct / 100;

// Fraction (0.049) -> read-only percentage text ("4.9%"), for a plain label/readout.
export const formatPct = (fraction, decimals = 1) => `${(fraction * 100).toFixed(decimals)}%`;

// ---- incremental channels (screener TASK_incremental_channels rev 2) ----

// Channel.status: CONFIRMED ("drawn in pen") / PROVISIONAL ("pencil sketch": younger than 10
// bars or narrower than 5 ATR - redrawn every bar, never read by a strategy). An older backend
// sends no status: treated as confirmed, i.e. drawn exactly as before.
export const isProvisional = (ch) => ch?.status === 'PROVISIONAL';

export const STATUS_LABEL = Object.freeze({ CONFIRMED: 'confirmed', PROVISIONAL: 'draft' });
export const formatStatus = (ch) => (ch?.status ? (STATUS_LABEL[ch.status] || ch.status.toLowerCase()) : null);

// ageBars = t - start (bars since the channel's first bar, t = the last processed bar).
export const formatAge = (ageBars) =>
  (typeof ageBars === 'number' && Number.isFinite(ageBars) ? `${ageBars} bar${ageBars === 1 ? '' : 's'}` : null);

// ChannelExitDTO.side: UP = close above upper + 0.5 ATR, DOWN = close below lower - 0.5 ATR.
export const EXIT_SIDE_LABEL = Object.freeze({ UP: '↑ up', DOWN: '↓ down' });
export const formatExitSide = (side) => EXIT_SIDE_LABEL[side] || (side ? String(side).toLowerCase() : '?');

// "2026-10-23T00:00:00" -> "2026-10-23"; intraday keeps "HH:MM". Exchange wall clock, no conversion.
export const formatBarDate = (v) => {
  if (typeof v !== 'string' || v.length < 10) return '—';
  const day = v.substring(0, 10);
  const time = v.length >= 16 ? v.substring(11, 16) : null;
  return time && time !== '00:00' ? `${day} ${time}` : day;
};

// Identifies a channel across re-renders within the same detection run (no backend ID
// exists). Stable as long as the underlying detection result doesn't change — edits keyed
// on this are reset whenever `runId` changes (see ChannelExplorerChart's runId prop). Also the
// identity of the selection shared by the chart and the channel cards.
export const channelKey = (ch) =>
  `${ch.timeframe}|${ch.startDate}|${ch.endDate}|${ch.upper.anchorBarIndex}|${ch.lower.anchorBarIndex}|${ch.direction}`;

// ---- card metrics (mirror the universe screener so the card matches its filter values) ----

// Bars per year per timeframe - mirrors RecursiveChannelDetector.barsPerYear(TimeFrame)
// (screener: korshak/com/channelrecursive/serviceImpl/RecursiveChannelDetector.java). Keep in sync.
export const BARS_PER_YEAR = Object.freeze({
  DAY: 252,
  WEEK: 52,
  MONTH: 12,
  HOUR: 252 * 6.5,
  MIN5: 252 * 6.5 * 12,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Signed channel slope in % per year. Mirrors ChannelMetrics.slopePctYear (screener:
// korshak/com/channelrecursive/serviceImpl/ChannelMetrics.java):
//   100 * (exp(slopePctPerBar * barsPerYear(tf)) - 1)
// slopePctPerBar is the average of the upper/lower slopes in FIT space: a log-price slope
// (fraction per bar, compounded) when ch.logPrice - always the case for the Explorer, which
// requests logPrice=true (a missing flag is treated as log). ChannelMetrics.slopePctYear has no
// linear branch; for a linear-price channel (slope in price units per bar) this is only an
// APPROXIMATION: normalised by the channel's starting mid price and annualised with the fixed
// BARS_PER_YEAR - unlike the linear branch of ChannelChainServiceImpl.annualSlopePct, which uses
// calendar-derived bars per year (channel bars / calendar years of the channel). Never reached
// from the Explorer today. Returns null when it cannot be computed.
export const slopePctYear = (ch) => {
  const b = BARS_PER_YEAR[ch?.timeframe];
  if (!b || !isNum(ch.slopePctPerBar)) return null;
  if (ch.logPrice !== false) return 100 * Math.expm1(ch.slopePctPerBar * b);
  const u = ch.upperPoints?.[0]?.price;
  const l = ch.lowerPoints?.[0]?.price;
  const ref = isNum(u) && isNum(l) ? (u + l) / 2 : null;
  return ref > 0 ? (100 * ch.slopePctPerBar * b) / ref : null;
};

// "+12.3 %/yr" / "−4.0 %/yr", or null.
export const formatSlopePctYear = (ch) => {
  const v = slopePctYear(ch);
  if (v === null || !Number.isFinite(v)) return null;
  const text = Math.abs(v).toFixed(1);
  // Sign from the rounded value: -0.04 prints "0.0 %/yr", not "−0.0 %/yr".
  const sign = Number(text) === 0 ? '' : v > 0 ? '+' : '−';
  return `${sign}${text} %/yr`;
};

// ---- card order: hierarchy, youngest first ----

const TF_ORDER = { MIN5: 0, HOUR: 1, DAY: 2, WEEK: 3, MONTH: 4 };
const depthOf = (ch) => (isNum(ch.depth) && ch.depth >= 0 ? ch.depth : -1);

// Finer timeframe first (depth is a per-timeframe recursion depth, not comparable across TFs),
// then deeper first, then later start first (ISO strings compare chronologically).
const youngestFirst = (a, b) =>
  (TF_ORDER[a.timeframe] ?? 9) - (TF_ORDER[b.timeframe] ?? 9)
  || depthOf(b) - depthOf(a)
  || String(b.startDate ?? '').localeCompare(String(a.startDate ?? ''));

const MAX_WALK = 100; // guard against a malformed parent cycle

/**
 * Card order (does not affect what the chart draws):
 *  1. the current chain(s), current channels ordered finest timeframe first, then deepest. For
 *     each current channel: first its provisional ("draft") descendants - listed channels linked
 *     to it via `parentId` through provisional nodes only - deepest first; then the current
 *     channel itself; then its ancestors via `parentId` up to the root (or until the link leaves
 *     the listed set);
 *  2. every other channel: finer timeframe first, then depth descending, then later start first.
 */
export const orderChannelsForCards = (channels) => {
  const list = channels || [];
  const byId = new Map(list.filter(c => c.id).map(c => [c.id, c]));
  const parentOf = (c) => (c?.parentId ? byId.get(c.parentId) || null : null);
  const out = [];
  const seen = new Set();
  const push = (c) => { if (!seen.has(c)) { seen.add(c); out.push(c); } };
  // A provisional channel hangs under `cur` when its parent chain reaches `cur` through
  // provisional nodes only.
  const isDraftDescendantOf = (c, cur) => {
    let p = parentOf(c);
    for (let i = 0; p && i < MAX_WALK; i++, p = parentOf(p)) {
      if (p === cur) return true;
      if (!isProvisional(p)) return false;
    }
    return false;
  };
  list.filter(c => c.current).sort(youngestFirst).forEach(cur => {
    list.filter(c => isProvisional(c) && !seen.has(c) && isDraftDescendantOf(c, cur))
      .sort(youngestFirst).forEach(push);
    for (let c = cur, i = 0; c && i < MAX_WALK; c = parentOf(c), i++) push(c);
  });
  list.filter(c => !seen.has(c)).sort(youngestFirst).forEach(push);
  return out;
};

// The channel selected by default after a detection: the first confirmed current channel in card
// order (finest timeframe, then deepest) - its provisional children may precede it on the cards.
// None when there is no current channel.
export const defaultSelectedChannel = (channels) =>
  orderChannelsForCards(channels).find(c => c.current && !isProvisional(c)) || null;
