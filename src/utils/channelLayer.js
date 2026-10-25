// src/utils/channelLayer.js
//
// Channel tree layer of the strategy result chart (screener TASK_incremental_channels rev 2,
// architect.md §6.2). Only results whose config contains a channel strategy get it; the layer is
// built from the FIRST channel strategy of the config (owner decision Q2): its structural
// detector params (CoveragePct / MinBars / MinWidthPct) and its yield gate, over the strategy's
// data window. A (FULL, "as seen today") by default, B (INCREMENTAL, "as the strategy saw them")
// by a toggle - the B replay is the one the strategy traded on.
//
// Source of the parameters, in order:
//   1. results.channelSource / results.chartDataDTO.channelSource (the backend's record of the
//      replay the strategy decided on: {ticker, timeFrame, startDate, endDate, structure, gate});
//   2. otherwise the request config of the result (strategyNameToParams values) - an older
//      backend, or a payload without channelSource.

/** Strategy classes that read channels (ChannelSemanticsSupport.dependsOnChannels on the backend). */
export const CHANNEL_STRATEGIES = Object.freeze(['ChannelQuartileStrategy', 'CausalChannelBreakoutStrategy']);

export const isChannelStrategy = (name) => CHANNEL_STRATEGIES.includes(name);

/** The first channel strategy of a strategyNameToParams map (insertion order = config order), or null. */
export const firstChannelStrategy = (strategyNameToParams) =>
  Object.keys(strategyNameToParams || {}).find(isChannelStrategy) || null;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const paramValue = (params, name) => {
  const p = params?.[name];
  if (p === null || p === undefined) return null;
  const v = typeof p === 'object' ? p.value : p;
  const n = typeof v === 'string' ? Number(v) : v;
  return isNum(n) ? n : null;
};

/** channelSource derived from a StrategiesConfigDTO-shaped request, or null without a channel strategy. */
export const channelSourceFromConfig = (config) => {
  const name = firstChannelStrategy(config?.strategyNameToParams);
  if (!name || !config?.ticker || !config?.startDate || !config?.endDate) return null;
  const params = config.strategyNameToParams[name];
  return {
    strategy: name,
    ticker: config.ticker,
    timeFrame: config.timeFrame,
    startDate: config.startDate,
    endDate: config.endDate,
    structure: {
      coveragePct: paramValue(params, 'CoveragePct'),
      minBars: paramValue(params, 'MinBars'),
      minWidthPct: paramValue(params, 'MinWidthPct'),
      logPrice: true,
    },
    gate: {
      minAnnualYieldPct: paramValue(params, 'MinAnnualYieldPct'),
      maxAnnualYieldPct: paramValue(params, 'MaxAnnualYieldPct'),
    },
  };
};

// An Optimize result's best values (results.paramsDTO [{strategy|strategyClass, paramName, value}])
// over the request's param map, so the fallback layer uses the structure of the best combination.
const withBestValues = (config, paramsDTO) => {
  if (!config || !Array.isArray(paramsDTO) || paramsDTO.length === 0) return config;
  const map = { ...(config.strategyNameToParams || {}) };
  paramsDTO.forEach((p) => {
    const name = p?.strategyClass || p?.strategy;
    if (!name || !map[name] || !p.paramName || !isNum(p.value)) return;
    map[name] = { ...map[name], [p.paramName]: { ...(map[name][p.paramName] || {}), value: p.value } };
  });
  return { ...config, strategyNameToParams: map };
};

/**
 * The channel source of a result: the backend's record first, else the request config (with the
 * Optimize best values when the result carries them); null = no layer.
 */
export const resolveChannelSource = (results, config) => {
  const fromBackend = results?.channelSource || results?.chartDataDTO?.channelSource || null;
  if (fromBackend?.ticker && fromBackend?.startDate && fromBackend?.endDate) {
    return { ...fromBackend, strategy: fromBackend.strategy || fromBackend.strategyClass || firstChannelStrategy(config?.strategyNameToParams) };
  }
  return channelSourceFromConfig(withBestValues(config, results?.paramsDTO));
};

/**
 * RecursiveChannelParams for POST /api/channels/detect from a channel source. Fields the source
 * does not carry are left out (the backend fills its defaults), so a partial source still works.
 */
export const detectParamsFromSource = (src) => {
  if (!src) return null;
  const s = src.structure || {};
  const g = src.gate || {};
  const out = { logPrice: s.logPrice !== false };
  if (isNum(s.coveragePct)) out.coveragePct = s.coveragePct;
  if (isNum(s.minBars)) out.minBars = s.minBars;
  if (isNum(s.minWidthPct)) out.minWidthPct = s.minWidthPct;
  if (isNum(g.minAnnualYieldPct)) out.minAnnualYieldPct = g.minAnnualYieldPct;
  if (isNum(g.maxAnnualYieldPct)) out.maxAnnualYieldPct = g.maxAnnualYieldPct;
  return out;
};

/**
 * A saved-case warning about the channel semantics (backend StrategyCaseServiceImpl: "results
 * computed with full-recompute channels; re-run to refresh") rather than a param reconcile.
 */
export const isChannelSemanticsWarning = (w) => typeof w === 'string' && /full-recompute channels/i.test(w);

/** Stable identity of a channel source (re-fetch only when it changes). */
export const channelSourceKey = (src) => (src ? JSON.stringify([
  src.ticker, src.timeFrame, src.startDate, src.endDate,
  src.structure?.coveragePct, src.structure?.minBars, src.structure?.minWidthPct, src.structure?.logPrice,
  src.gate?.minAnnualYieldPct, src.gate?.maxAnnualYieldPct,
]) : '');
