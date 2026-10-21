// src/components/stability/stabilityFormat.js
//
// Parameter stability by channel (screener TASK_channel_param_stability.md, architect.md §4 / §6).
// Shared helpers of the Optimize-form section (StabilitySettings), the Channels tab
// (ChannelStabilityView / ChannelChainTable) and App.jsx: timeframe ordering, detector defaults,
// the request block, the per-level Backtest config, and the "n/a"-aware formatting.
// Terms: the fit half / check half of a chain node; UI labels "Fit" / "Check".

import { fmtBarTimestamp } from '../../utils/dates';

// MIN5 < HOUR < DAY < WEEK < MONTH. The channel timeframe must not be coarser than the strategy's.
export const TIME_FRAME_ORDER = ['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH'];

export const TIME_FRAME_LABELS = {
  MIN5: '5 Minutes',
  HOUR: 'Hour',
  DAY: 'Day',
  WEEK: 'Week',
  MONTH: 'Month',
};

/** true when channel timeframe `channelTf` is coarser than strategy timeframe `strategyTf`. */
export const isCoarserTimeFrame = (channelTf, strategyTf) => {
  const c = TIME_FRAME_ORDER.indexOf(channelTf);
  const s = TIME_FRAME_ORDER.indexOf(strategyTf);
  return c !== -1 && s !== -1 && c > s;
};

// RecursiveChannelParams.defaults() of the backend: coverage 0.95, minBars 5, minWidthPct 0.05,
// yield gates off (-2.0 = no floor, 100.0 = no ceiling sentinel), logPrice true. Unlike the Channel
// Explorer defaults (max yield 200 %), the gates are off so every recursion-tree node is a chain node.
export const STABILITY_DEFAULT_PARAMS = Object.freeze({
  coveragePct: 0.95,
  minBars: 5,
  minWidthPct: 0.05,
  minAnnualYieldPct: -2.0,
  maxAnnualYieldPct: 100.0,
  logPrice: true,
});

/** Initial form state of the Optimize-form section (off). */
export const defaultStabilitySettings = (strategyTf = 'DAY') => ({
  enabled: false,
  channelTimeFrame: strategyTf,
  params: { ...STABILITY_DEFAULT_PARAMS },
});

/**
 * Form state → the StrategiesConfigDTO.channelStability block, or null (feature off: the field is
 * left out and the request is byte-identical to the pre-feature one).
 */
export const stabilityRequest = (settings) => {
  if (!settings || !settings.enabled) return null;
  return {
    channelTimeFrame: settings.channelTimeFrame,
    detectorParams: { ...STABILITY_DEFAULT_PARAMS, ...(settings.params || {}) },
  };
};

/** A request block (job echo, case config) → form state (enabled). null → null. */
export const settingsFromRequest = (req, strategyTf) => {
  if (!req || !req.channelTimeFrame) return null;
  return {
    enabled: true,
    channelTimeFrame: req.channelTimeFrame || strategyTf,
    params: { ...STABILITY_DEFAULT_PARAMS, ...(req.detectorParams || {}) },
  };
};

/** Client-side check before a run (the backend answers 400 with the same text). */
export const stabilityValidationError = (settings, strategyTf) => {
  if (!settings || !settings.enabled) return null;
  if (!settings.channelTimeFrame) return "'channelStability.channelTimeFrame' is required";
  if (isCoarserTimeFrame(settings.channelTimeFrame, strategyTf)) {
    return 'channel timeframe must not be coarser than the strategy timeframe';
  }
  return null;
};

/**
 * strategyNameToParams with each param's `value` replaced by the node's value.
 * @param {Object} strategyNameToParams form / request map {strategy: {param: ParamVO}}
 * @param {Object} params node params {strategy: {param: number}} (NodeBestDTO.params)
 * @returns {Object} a new map (ranges min / max / step kept); params absent from `params` unchanged
 */
export const withParamValues = (strategyNameToParams, params) => {
  const out = {};
  Object.entries(strategyNameToParams || {}).forEach(([strategy, paramMap]) => {
    const values = params?.[strategy] || {};
    out[strategy] = {};
    Object.entries(paramMap || {}).forEach(([paramName, param]) => {
      const v = values[paramName];
      out[strategy][paramName] = typeof v === 'number' && Number.isFinite(v) ? { ...param, value: v } : { ...param };
    });
  });
  return out;
};

/** Node params whose strategy / param is not in the form map (they cannot be applied). */
export const missingParams = (strategyNameToParams, params) => {
  const missing = [];
  Object.entries(params || {}).forEach(([strategy, values]) => {
    Object.keys(values || {}).forEach((paramName) => {
      if (!strategyNameToParams?.[strategy]?.[paramName]) missing.push(`${strategy}.${paramName}`);
    });
  });
  return missing;
};

/**
 * The Backtest request of one chain level: the job's request with the level's fit-best values,
 * without the Optimize-only fields (objectiveFunction, channelStability) and never a seeded position.
 */
export const levelBacktestConfig = (baseConfig, params) => {
  // eslint-disable-next-line no-unused-vars
  const { objectiveFunction, channelStability, initialPosition, ...rest } = baseConfig || {};
  return { ...rest, strategyNameToParams: withParamValues(rest.strategyNameToParams, params) };
};

// ---- formatting ---------------------------------------------------------------------------------

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const NA = 'n/a';

/** Plain number, fixed decimals; null / NaN → "n/a". */
export const fmtNum = (v, decimals = 2) => (isNum(v) ? v.toFixed(decimals) : NA);

/** Percent units (8.47 = 8.47 %), signed; null → "n/a". */
export const fmtPctSigned = (v, decimals = 2) => (isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(decimals)} %` : NA);

/** Percent units, unsigned (drawdowns carry their own "-"). */
export const fmtPctPlain = (v, decimals = 2) => (isNum(v) ? `${v.toFixed(decimals)} %` : NA);

/** Ratio (WFE, regret); null → "n/a". */
export const fmtRatio = (v) => (isNum(v) ? v.toFixed(2) : NA);

/** Δ in steps {max, mean}: "1 (mean 0.5)"; null → the fallback. */
export const fmtDelta = (d, fallback = NA) => {
  if (!d || !isNum(d.max)) return fallback;
  const max = Number.isInteger(d.max) ? String(d.max) : d.max.toFixed(1);
  if (!isNum(d.mean) || d.mean === d.max) return max;
  return `${max} (mean ${d.mean.toFixed(1)})`;
};

/** A param value without float noise: 120, 0.05, 1.25. */
export const fmtParamValue = (v) => {
  if (!isNum(v)) return String(v ?? NA);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(6)));
};

/**
 * {strategy: {param: value}} → [{strategy, paramName, value}] in a stable order, for display.
 */
export const flattenParams = (params) => {
  const rows = [];
  Object.entries(params || {}).forEach(([strategy, values]) => {
    Object.entries(values || {}).forEach(([paramName, value]) => rows.push({ strategy, paramName, value }));
  });
  return rows;
};

/** One-line param text: "MaLength 120, Stop 2" (strategy prefix only when there are several). */
export const fmtParams = (params) => {
  const rows = flattenParams(params);
  if (rows.length === 0) return NA;
  const multi = new Set(rows.map((r) => r.strategy)).size > 1;
  return rows
    .map((r) => `${multi ? `${shortStrategy(r.strategy)}.` : ''}${r.paramName} ${fmtParamValue(r.value)}`)
    .join(', ');
};

/** "PriceAboveMaStrategy" → "PriceAboveMa". */
export const shortStrategy = (name) => String(name || '').replace(/Strategy$/, '');

/** Bar / snapshot timestamp as received (no zone conversion); missing → "—". */
export const fmtTs = (v) => fmtBarTimestamp(v) || '—';

/** Direction arrow + annual slope: "↑ +15.0 %/yr". */
export const fmtDirection = (node) => {
  const arrow = node?.direction > 0 ? '↑' : node?.direction < 0 ? '↓' : '→';
  return isNum(node?.slopeAnnualPct)
    ? `${arrow} ${node.slopeAnnualPct > 0 ? '+' : ''}${node.slopeAnnualPct.toFixed(1)} %/yr`
    : arrow;
};

/** Detector params as a caption fragment. */
export const fmtDetectorParams = (p) => {
  if (!p) return 'defaults';
  const parts = [];
  if (isNum(p.coveragePct)) parts.push(`coverage ${(p.coveragePct * 100).toFixed(0)} %`);
  if (isNum(p.minBars)) parts.push(`min bars ${p.minBars}`);
  if (isNum(p.minWidthPct)) parts.push(`min width ${(p.minWidthPct * 100).toFixed(1)} %`);
  const floorOff = isNum(p.minAnnualYieldPct) && p.minAnnualYieldPct <= -1.0;
  const ceilOff = isNum(p.maxAnnualYieldPct) && p.maxAnnualYieldPct >= 100.0;
  if (floorOff && ceilOff) parts.push('yield gates off');
  else {
    if (isNum(p.minAnnualYieldPct)) parts.push(`min yield ${floorOff ? 'off' : `${(p.minAnnualYieldPct * 100).toFixed(0)} %`}`);
    if (isNum(p.maxAnnualYieldPct)) parts.push(`max yield ${ceilOff ? 'off' : `${(p.maxAnnualYieldPct * 100).toFixed(0)} %`}`);
  }
  if (typeof p.logPrice === 'boolean') parts.push(p.logPrice ? 'log price' : 'linear price');
  return parts.join(', ');
};

export const VERDICT_STYLE = {
  STABLE: 'bg-green-100 text-green-800 border-green-300',
  UNSTABLE: 'bg-red-100 text-red-800 border-red-300',
  INCONCLUSIVE: 'bg-gray-100 text-gray-600 border-gray-300',
};

/** Closed-trade counts of the fit-best in fit / check: "3 / 2". */
export const fmtFitCheckTrades = (node) => {
  const f = node?.fitBest?.fit?.closedTrades;
  const c = node?.fitBest?.check?.closedTrades;
  return `${isNum(f) ? f : NA} / ${isNum(c) ? c : NA}`;
};

/** Closed trades of a slice "+N carried in": "4 (+1 carried in)". */
export const fmtSliceTrades = (m) => {
  if (!m) return NA;
  const closed = isNum(m.closedTrades) ? m.closedTrades : NA;
  return isNum(m.carriedIn) && m.carriedIn > 0 ? `${closed} (+${m.carriedIn} carried in)` : String(closed);
};
