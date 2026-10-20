// src/components/nextTriggers/nextTriggersAdapter.js
//
// Next-bar trigger prices (screener logs/agents/architect.md "nextTriggers" §2.8, BA spec
// business_analyst.md §1-§5).
//
// adaptNextTriggers() is the ONLY place that reads the raw `nextTriggers` JSON - from
// StrategyResultDTO (Backtest), SignalChartsDTO (Signals) and WatchDTO (Watchlist). Every field name
// of the contract is mapped here, so a renamed field is a one-line change. Everything else (the
// Summary card, the chart lines, the Signals pane chips, the Watchlist column) only sees the
// normalized object it returns. Absent / null / malformed input -> null, and every view then
// renders exactly as it did before the feature (older backend, Optimize results).
//
// Raw shape consumed (NextTriggersDTO):
//   { status: 'OK'|'NO_CLOSED_BAR'|'WINDOW_NOT_OPEN'|'ERROR', message?, runKind: 'BACKTEST'|'SIGNALS'|'WATCH',
//     basisBarDate, basisClose, atr, position: 'FLAT'|'LONG'|'SHORT', positionEntryPrice, positionSeeded,
//     tradeStart,
//     nextBar: { expectedDate, label, exists, inProgress, nowPrice, nowAt },
//     merged: TriggerEstimate, strategies: [TriggerEstimate],
//     actual: { date, open, high, low, close, outcome: 'BUY'|'SELL'|'NO_ACTION'|'UNKNOWN_PARTIAL', line } | null,
//     warnings: [string | {code, message}], executionNote }
//   TriggerEstimate: { key, strategyClass, kind, partial, partialBecause: [string | {key, kind, reason, lines}],
//                      lines: [TriggerLine], regions: [PriceRegion], reason, detail }
//     kind: LINES | UNCONDITIONAL | NONE | NOT_ESTIMABLE | UNAVAILABLE | POSSIBLE_OUTSIDE_BAND | POSSIBLE_ANY_PRICE
//   TriggerLine: { side: BUY|SELL|VETO|INFO, on: CLOSE|LOW|HIGH, direction: ABOVE|BELOW|AT_OR_ABOVE|AT_OR_BELOW,
//                  price, fill: CLOSE|LINE, reason, category: EXACT|DERIVED|CONDITIONAL|APPROX|NECESSARY,
//                  and: {on, direction, price} | null, peakTrail: {floorMax, factor} | null,
//                  informational, source, distance, distancePct, distanceAtr, meta }
//   PriceRegion: { side, from, to, fromInclusive, toInclusive, and }

import { parseExchangeTs } from '../../utils/dates';

const asArray = (v) => (Array.isArray(v) ? v : []);
const asMap = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);
// A LocalDateTime may arrive as an ISO string or (older Jackson config) as [y, m, d, h, mi]
const ts = (v) => {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && v.length >= 3) {
    const [y, m, d, h = 0, mi = 0] = v;
    const p = (n) => String(n).padStart(2, '0');
    return `${y}-${p(m)}-${p(d)}T${p(h)}:${p(mi)}:00`;
  }
  return null;
};
const oneOf = (v, allowed, fallback = null) => (allowed.includes(v) ? v : fallback);

export const SIDES = ['BUY', 'SELL', 'VETO', 'INFO'];
export const KINDS = [
  'LINES', 'UNCONDITIONAL', 'NONE', 'NOT_ESTIMABLE', 'UNAVAILABLE', 'POSSIBLE_OUTSIDE_BAND', 'POSSIBLE_ANY_PRICE',
];
export const CATEGORIES = ['EXACT', 'DERIVED', 'CONDITIONAL', 'APPROX', 'NECESSARY'];
const DIRECTIONS = ['ABOVE', 'BELOW', 'AT_OR_ABOVE', 'AT_OR_BELOW'];
const ONS = ['CLOSE', 'LOW', 'HIGH'];

const adaptCondition = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const price = num(raw.price);
  const direction = oneOf(raw.direction, DIRECTIONS);
  if (price === null || !direction) return null;
  return { on: oneOf(raw.on, ONS, 'LOW'), direction, price };
};

const adaptPeakTrail = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const floorMax = num(raw.floorMax);
  const factor = num(raw.factor);
  return floorMax === null || factor === null ? null : { floorMax, factor };
};

const adaptLine = (raw, basisClose, atr) => {
  if (!raw || typeof raw !== 'object') return null;
  const side = oneOf(raw.side, SIDES);
  if (!side) return null;
  const price = num(raw.price); // null only for an INFO line without a number
  if (price === null && side !== 'INFO') return null;
  // Distances come from the backend; computed here only when an older / partial payload omits them
  // (distance = line − basis close, as in the contract example).
  let distance = num(raw.distance);
  if (distance === null && price !== null && basisClose !== null) distance = price - basisClose;
  let distancePct = num(raw.distancePct);
  if (distancePct === null && distance !== null && basisClose) distancePct = (distance / basisClose) * 100;
  let distanceAtr = num(raw.distanceAtr);
  if (distanceAtr === null && distance !== null && atr) distanceAtr = distance / atr;
  return {
    side,
    on: oneOf(raw.on, ONS, 'CLOSE'),
    direction: oneOf(raw.direction, DIRECTIONS, side === 'BUY' ? 'ABOVE' : 'BELOW'),
    price,
    fill: raw.fill === 'LINE' ? 'LINE' : 'CLOSE',
    reason: str(raw.reason),
    category: oneOf(raw.category, CATEGORIES, 'EXACT'),
    and: adaptCondition(raw.and),
    peakTrail: adaptPeakTrail(raw.peakTrail),
    informational: raw.informational === true || side === 'INFO',
    source: str(raw.source),
    distance,
    distancePct,
    distanceAtr,
    meta: asMap(raw.meta),
  };
};

const adaptRegion = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const from = num(raw.from);
  const to = num(raw.to);
  if (from === null && to === null) return null;
  return {
    side: oneOf(raw.side, SIDES, 'BUY'),
    from,
    to,
    fromInclusive: raw.fromInclusive === true,
    toInclusive: raw.toInclusive === true,
    and: adaptCondition(raw.and),
  };
};

const adaptPartialItem = (raw, basisClose, atr) => {
  if (typeof raw === 'string') return raw.length > 0 ? { key: raw, kind: null, reason: null, lines: [] } : null;
  if (!raw || typeof raw !== 'object') return null;
  const key = str(raw.key) ?? str(raw.strategyClass);
  if (!key) return null;
  return {
    key,
    kind: oneOf(raw.kind, KINDS),
    reason: str(raw.reason),
    lines: asArray(raw.lines).map(l => adaptLine(l, basisClose, atr)).filter(Boolean),
  };
};

const adaptEstimate = (raw, basisClose, atr, fallbackKey) => {
  if (!raw || typeof raw !== 'object') return null;
  const key = str(raw.key) ?? str(raw.strategyClass) ?? fallbackKey;
  const lines = asArray(raw.lines).map(l => adaptLine(l, basisClose, atr)).filter(Boolean);
  const kind = oneOf(raw.kind, KINDS, lines.length > 0 ? 'LINES' : 'NONE');
  const partialBecause = asArray(raw.partialBecause).map(p => adaptPartialItem(p, basisClose, atr)).filter(Boolean);
  const detail = asMap(raw.detail);
  return {
    key,
    strategyClass: str(raw.strategyClass) ?? (key === 'MERGED' ? null : key),
    kind,
    partial: raw.partial === true || partialBecause.length > 0,
    partialBecause,
    lines,
    regions: asArray(raw.regions).map(adaptRegion).filter(Boolean),
    reason: str(raw.reason),
    detail,
    trackers: asArray(detail.trackers).filter(t => t && typeof t === 'object'),
  };
};

const adaptNextBar = (raw) => {
  const r = asMap(raw);
  return {
    expectedDate: ts(r.expectedDate),
    label: str(r.label),
    exists: r.exists === true,
    inProgress: r.inProgress === true,
    nowPrice: num(r.nowPrice),
    nowAt: ts(r.nowAt),
  };
};

const ACTUAL_OUTCOMES = ['BUY', 'SELL', 'NO_ACTION', 'UNKNOWN_PARTIAL'];

const adaptActual = (raw, basisClose, atr) => {
  if (!raw || typeof raw !== 'object') return null;
  const outcome = oneOf(raw.outcome, ACTUAL_OUTCOMES);
  if (!outcome) return null;
  const line = raw.line && typeof raw.line === 'object' ? adaptLine(raw.line, basisClose, atr) : null;
  return {
    date: ts(raw.date),
    open: num(raw.open),
    high: num(raw.high),
    low: num(raw.low),
    close: num(raw.close),
    outcome,
    line,
    lineText: typeof raw.line === 'string' ? raw.line : null,
  };
};

const adaptWarning = (w) => {
  if (typeof w === 'string') return w.length > 0 ? w : null;
  if (w && typeof w === 'object') return str(w.message) ?? str(w.code);
  return null;
};

/**
 * Normalizes a raw `nextTriggers` object. Never throws.
 * @param {Object|null|undefined} raw
 * @returns {Object|null} null when absent or unusable (the views then render as before the feature)
 */
export const adaptNextTriggers = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const status = oneOf(raw.status, ['OK', 'NO_CLOSED_BAR', 'WINDOW_NOT_OPEN', 'ERROR'], 'OK');
  const basisClose = num(raw.basisClose);
  const atr = num(raw.atr);
  const strategies = asArray(raw.strategies)
    .map((s, i) => adaptEstimate(s, basisClose, atr, `strategy-${i}`))
    .filter(Boolean);
  return {
    status,
    message: str(raw.message) ?? str(raw.error),
    runKind: oneOf(raw.runKind, ['BACKTEST', 'SIGNALS', 'WATCH']),
    basisBarDate: ts(raw.basisBarDate),
    basisClose,
    atr,
    position: oneOf(raw.position, ['FLAT', 'LONG', 'SHORT']),
    positionEntryPrice: num(raw.positionEntryPrice),
    positionSeeded: raw.positionSeeded === true,
    tradeStart: ts(raw.tradeStart),
    nextBar: adaptNextBar(raw.nextBar),
    merged: adaptEstimate(raw.merged, basisClose, atr, 'MERGED'),
    strategies,
    // by request key, for the Signals panes (strategy pane key == request key)
    strategyByKey: Object.fromEntries(strategies.map(s => [s.key, s])),
    actual: adaptActual(raw.actual, basisClose, atr),
    warnings: asArray(raw.warnings).map(adaptWarning).filter(Boolean),
    executionNote: str(raw.executionNote),
  };
};

/**
 * The estimate one chart draws: the merged one (main chart / merged pane) or one strategy's
 * (Signals pane), together with the run-level facts the drawing needs. null = draw nothing.
 * @param {Object|null} nt - adaptNextTriggers() result
 * @param {string|null} [strategyKey] - a strategy pane's key; omitted = merged
 */
export const chartTriggers = (nt, strategyKey = null) => {
  if (!nt || nt.status !== 'OK') return null;
  const estimate = strategyKey ? nt.strategyByKey[strategyKey] : nt.merged;
  if (!estimate) return null;
  const drawable = estimate.lines.some(l => l.price !== null);
  if (!drawable) return null;
  return {
    estimate,
    position: nt.position,
    nextBar: nt.nextBar,
    actual: strategyKey ? null : nt.actual,
    basisBarDate: nt.basisBarDate,
    label: nt.nextBar.label || nt.nextBar.expectedDate || null,
  };
};

/**
 * Where a chart draws the next-bar lines: 'lastBar' when the data's last bar is after the basis
 * bar (it is the bar in progress), else 'slot' (an empty slot after the last bar). null without
 * triggers or bars.
 * @param {{basisBarDate?: string|null, nextBar?: {inProgress: boolean}}|null} triggers - chartTriggers() result or the adapted nextTriggers
 * @param {number|null} lastBarMs - the last bar's time (parseExchangeTs ms)
 */
export const triggerPlacement = (triggers, lastBarMs) => {
  if (!triggers || lastBarMs === null || lastBarMs === undefined) return null;
  const basisMs = triggers.basisBarDate ? parseExchangeTs(triggers.basisBarDate).getTime() : NaN;
  if (Number.isFinite(basisMs)) return lastBarMs > basisMs ? 'lastBar' : 'slot';
  return triggers.nextBar?.inProgress ? 'lastBar' : 'slot';
};

/** True when any pane of a Signals response (merged or a strategy key) has lines to draw. */
export const anyChartTriggers = (nt, keys) => Boolean(nt)
  && (chartTriggers(nt) !== null || asArray(keys).some(k => chartTriggers(nt, k) !== null));
