// src/components/signals/signalPanes.js
//
// Pure helpers of the Signals mode (screener TASK_position_dependable_and_signals_tab.md §2.3, §2.5).
//
// adaptSignalCharts() is the ONLY place that reads the raw `POST /api/strategy/signal-charts` JSON:
// every field name of the contract is mapped here, so a renamed field is a one-line change. The rest
// of the view (SignalChartsView, SignalPane, ReporterStyleChart in `panes="signals"`) only sees the
// normalized object it returns.
//
// Raw shape consumed (SignalChartsDTO):
//   { ticker, timeFrame, startDate, endDate, tradeStart, windowStart, warnings: [string], longOnly,
//     prices: [{date, open, high, low, close, volume}],
//     positionSpans: [{from, to, side: 'LONG'|'SHORT'}],
//     strategies: [{ key, strategyClass, positionDependent, params: [{paramName, value}], hasSignals,
//                    signals: [{date, price, type, comment, executed, reason?, blockedBy?}],
//                    (reason 'OUTSIDE_WINDOW' = proposed on a warm-up bar before tradeStart;
//                     blockedBy [{strategyKey, rule}] = a PD LongOpen that lost to a LongBlock)
//                    votes: [{from, to, type}] - type may be 'LongBlock' (a constructed strategy's
//                     "do not enter": strip only, never a marker) |
//                     null,
//                    priceIndicators: {name: [{date, value}]}, indicators: {...},
//                    channels: [...], levelZones: [...], levelChart: {...} | null }],
//     merged: { signals: [{date, price, type, comment, sources: [key]}] } | null,
//     nextTriggers: NextTriggersDTO | null }  (read by nextTriggers/nextTriggersAdapter.js, the
//     one reader of that sub-contract; absent on an older backend -> null, nothing drawn)

import { parseExchangeTs } from '../../utils/dates';
import { slotEdges } from '../../utils/levelZones';
import { barIndexAtOrAfter } from '../../utils/ChartDataUtils';
import { adaptNextTriggers } from '../nextTriggers/nextTriggersAdapter';

/** Bars past which the view warns that zooming may be slow (§2.6; not a block). */
export const LARGE_RANGE_BARS = 50000;

const LONG_TYPES = new Set(['LongOpen', 'LongClose']);
const isLongSignal = (signal) => LONG_TYPES.has(signal?.type);

const asArray = (v) => (Array.isArray(v) ? v : []);
const asMap = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// params arrive as [{paramName, value, ...ParamVO}]; a {name: value} / {name: {value}} map is accepted too.
const adaptParams = (raw) => {
  if (Array.isArray(raw)) {
    return raw
      .filter(p => p && (p.paramName ?? p.name) !== undefined)
      .map(p => ({ name: String(p.paramName ?? p.name), value: p.value }));
  }
  return Object.entries(asMap(raw)).map(([name, v]) => ({
    name,
    value: v && typeof v === 'object' ? v.value : v,
  }));
};

// [{strategyKey, rule}] of a LongOpen that lost to a LongBlock; display name via the caller's lookup.
const adaptBlockedBy = (raw, displayNameOf) => (Array.isArray(raw) && raw.length > 0
  ? raw.filter(b => b && (b.strategyKey || b.key)).map(b => {
    const strategyKey = String(b.strategyKey ?? b.key);
    return { strategyKey, rule: b.rule ?? null, displayName: displayNameOf ? displayNameOf(strategyKey) : strategyKey };
  })
  : undefined);

const adaptSignal = (s, displayNameOf = null) => ({
  date: s.date,
  price: Number(s.price),
  type: s.type,
  comment: s.comment ?? null,
  // true / false on a strategy pane's signals; undefined on the merged pane (always a trade)
  executed: typeof s.executed === 'boolean' ? s.executed : undefined,
  // 'OUTSIDE_WINDOW' on a strategy pane's warm-up signal (drawn muted); absent otherwise
  reason: typeof s.reason === 'string' ? s.reason : undefined,
  sources: Array.isArray(s.sources) ? s.sources.map(String) : undefined,
  // a PD LongOpen not executed because a constructed strategy's LongBlock won the bar
  blockedBy: adaptBlockedBy(s.blockedBy, displayNameOf),
});

const adaptSignals = (raw, longOnly, displayNameOf = null) => asArray(raw)
  .filter(s => s && s.date && s.type)
  .map(s => adaptSignal(s, displayNameOf))
  // LongBlock is not an order: it lives on the vote strip only, never as a marker (§2.2)
  .filter(s => s.type !== 'LongBlock')
  // The backend already drops Short* in long-only (§2.3); filtered here too so the rule holds anyway.
  .filter(s => !longOnly || isLongSignal(s));

const adaptVotes = (raw) => (Array.isArray(raw)
  ? raw.filter(v => v && v.from && v.type).map(v => ({ from: v.from, to: v.to ?? v.from, type: v.type }))
  : null);

const adaptStrategy = (raw, index, longOnly, displayNameOf = null) => {
  const key = String(raw?.key ?? raw?.strategyClass ?? `strategy-${index}`);
  const signals = adaptSignals(raw?.signals, longOnly, displayNameOf);
  const displayName = displayNameOf ? displayNameOf(key) : key;
  return {
    key,
    // a constructed strategy's "<name> v3" instead of its key Constructed:<id>@<v>
    displayName: displayName && displayName !== key ? displayName : null,
    strategyClass: raw?.strategyClass ?? key,
    positionDependent: raw?.positionDependent === true,
    params: adaptParams(raw?.params),
    hasSignals: typeof raw?.hasSignals === 'boolean' ? raw.hasSignals : signals.length > 0,
    signals,
    // null for position-dependent strategies (event signals) - except ChannelQuartile, whose flat
    // veto bars come as votes (§2.3): a strip is drawn whenever the array is there
    votes: adaptVotes(raw?.votes),
    priceIndicators: asMap(raw?.priceIndicators),
    indicators: asMap(raw?.indicators),
    channels: asArray(raw?.channels),
    levelZones: asArray(raw?.levelZones),
    levelChart: raw?.levelChart ?? null,
  };
};

/**
 * Maps the raw signal-charts JSON to the view model. Never throws on missing optional parts.
 * `displayNameOf(key)` (optional): display name of a strategy key (constructed strategies).
 * @returns {{ticker, timeFrame, startDate, endDate, tradeStart, windowStart, warnings: string[],
 *   longOnly: boolean, prices: Array,
 *   positionSpans: Array<{from, to, side}>, strategies: Array, merged: {signals: Array}|null,
 *   nextTriggers: Object|null}}
 */
export const adaptSignalCharts = (raw, { displayNameOf = null } = {}) => {
  const longOnly = raw?.longOnly === true;
  const merged = raw?.merged && typeof raw.merged === 'object'
    ? { signals: adaptSignals(raw.merged.signals, longOnly) }
    : null;
  return {
    ticker: raw?.ticker ?? '',
    timeFrame: raw?.timeFrame ?? '',
    startDate: raw?.startDate ?? null,
    endDate: raw?.endDate ?? null,
    // Trading window (screener tradeStart). Absent from an older backend = no warm-up.
    tradeStart: raw?.tradeStart ?? null,
    windowStart: raw?.windowStart ?? null,
    warnings: asArray(raw?.warnings).filter(w => typeof w === 'string' && w.length > 0),
    longOnly,
    prices: asArray(raw?.prices),
    positionSpans: asArray(raw?.positionSpans)
      .filter(span => span && span.from)
      .filter(span => !longOnly || span.side !== 'SHORT')
      .map(span => ({ from: span.from, to: span.to ?? null, side: span.side === 'SHORT' ? 'SHORT' : 'LONG' })),
    strategies: asArray(raw?.strategies).map((s, i) => adaptStrategy(s, i, longOnly, displayNameOf)),
    merged,
    // Next-bar trigger prices: per strategy (by request key == pane key) and merged
    nextTriggers: adaptNextTriggers(raw?.nextTriggers),
  };
};

// ---------------------------------------------------------------------------------------------
// Chart data per pane: a ChartDataDTO-like object, what ReporterStyleChart / PriceChart read.
// ---------------------------------------------------------------------------------------------

/** One strategy pane: the shared prices + only that strategy's signals and overlays. */
export const toPaneData = (charts, strategy) => ({
  prices: charts.prices,
  signals: strategy.signals,
  priceIndicators: strategy.priceIndicators,
  indicators: strategy.indicators,
  channels: strategy.channels,
  levelZones: strategy.levelZones,
  levelChart: strategy.levelChart,
  includesShortSignals: !charts.longOnly,
});

/** The merged pane: prices + the merged trades' signals, no overlays. */
export const mergedPaneData = (charts) => ({
  prices: charts.prices,
  signals: charts.merged?.signals || [],
  priceIndicators: {},
  indicators: {},
  channels: [],
  levelZones: [],
  levelChart: null,
  includesShortSignals: !charts.longOnly,
});

// ---------------------------------------------------------------------------------------------
// Time spans -> bar-slot edges (ms), the same x geometry as the LevelBreakoutRetest shading.
// ---------------------------------------------------------------------------------------------

/** Bar times (ms) and slot edges of the shared prices, computed once per response. */
export const barGeometry = (prices) => {
  const barTimes = asArray(prices).map(p => parseExchangeTs(p.date).getTime());
  return { barTimes, ...slotEdges(barTimes) };
};

// [from, to] (inclusive bar dates) -> {startMs, endMs} over whole bar slots, or null when the span
// holds no bar. A missing `to` runs to the last bar.
const spanToSlots = (geometry, from, to) => {
  const { barTimes, left, right } = geometry;
  const n = barTimes.length;
  if (n === 0) return null;
  const fromMs = parseExchangeTs(from).getTime();
  if (Number.isNaN(fromMs)) return null;
  const startIndex = barIndexAtOrAfter(barTimes, fromMs);
  if (startIndex === -1) return null;
  let endIndex = n - 1;
  if (to) {
    const toMs = parseExchangeTs(to).getTime();
    if (!Number.isNaN(toMs)) {
      const after = barIndexAtOrAfter(barTimes, toMs + 1);
      endIndex = after === -1 ? n - 1 : after - 1;
    }
  }
  if (endIndex < startIndex) return null;
  return {
    startMs: left[startIndex],
    endMs: right[endIndex],
    startIndex,
    endIndex,
    // the first / last bar's own time (tooltips), not its slot edge
    barStartMs: barTimes[startIndex],
    barEndMs: barTimes[endIndex],
  };
};

const POSITION_FILL = Object.freeze({
  LONG: 'rgba(16, 185, 129, 0.10)',
  SHORT: 'rgba(239, 68, 68, 0.08)',
});

/** Merged position spans for drawPositionShading: [{startMs, endMs, side, fill}]. */
export const normalizePositionSpans = (spans, geometry) => asArray(spans)
  .map(span => {
    const slots = spanToSlots(geometry, span.from, span.to);
    return slots ? { ...slots, side: span.side, fill: POSITION_FILL[span.side] || POSITION_FILL.LONG } : null;
  })
  .filter(Boolean);

/** Vote segments for drawVoteStrip: [{startMs, endMs, type, from, to}], or null (no strip). */
export const normalizeVotes = (votes, geometry) => (Array.isArray(votes)
  ? votes
    .map(vote => {
      const slots = spanToSlots(geometry, vote.from, vote.to);
      return slots ? { ...slots, type: vote.type, from: vote.from, to: vote.to } : null;
    })
    .filter(Boolean)
  : null);

// ---------------------------------------------------------------------------------------------
// Pane summaries and texts
// ---------------------------------------------------------------------------------------------

/** "blocked by LongBlock of SMA200 regime v2 (R1)" of a signal's blockedBy, or null. */
export const blockedByText = (blockedBy) => (Array.isArray(blockedBy) && blockedBy.length > 0
  ? `blocked by ${blockedBy.map(b => `LongBlock of ${b.displayName || b.strategyKey}${b.rule ? ` (${b.rule})` : ''}`).join(', ')}`
  : null);

/** {total, executed} over a strategy pane's signals. */
export const executionSummary = (signals) => {
  const list = asArray(signals);
  return { total: list.length, executed: list.filter(s => s.executed === true).length };
};

/** "MaLength=200, Window=20" (empty string without params). */
export const formatParams = (params) => asArray(params)
  .map(p => `${p.name}=${p.value === null || p.value === undefined ? '–' : p.value}`)
  .join(', ');

/** Vote strip colours, the same hues as the signal markers (drawSignals). */
export const VOTE_COLORS = Object.freeze({
  LongOpen: 'rgba(22, 163, 74, 0.75)',
  LongClose: 'rgba(220, 38, 38, 0.75)',
  ShortOpen: 'rgba(37, 99, 235, 0.75)',
  ShortClose: 'rgba(234, 88, 12, 0.75)',
  // neutral grey "entry forbidden", apart from the red LongClose (architect §5.2)
  LongBlock: 'rgba(107, 114, 128, 0.75)',
});

/** What a vote means on the strip; in long-only a ShortOpen vote acts as a long exit (§2.3). */
export const voteText = (type, longOnly) => {
  switch (type) {
    case 'LongOpen': return 'LongOpen: be long';
    case 'LongClose': return 'LongClose: be out (veto)';
    case 'ShortOpen': return longOnly ? 'ShortOpen: acts as a long exit (long only)' : 'ShortOpen: be short';
    case 'ShortClose': return 'ShortClose: cover the short';
    case 'LongBlock': return 'LongBlock: do not enter (entry blocked)';
    default: return String(type);
  }
};
