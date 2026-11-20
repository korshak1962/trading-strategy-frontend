// src/api/indicatorCatalog.js
//
// The operand catalog shared by the screener filter editor and the strategy constructor
// (screener logs/agents/architect.md stage 3b §4.8, F1): bar fields + the backend's indicator
// registry (`GET /api/screener/meta` and `GET /api/strategy/constructed/meta` both serve
// `indicators[]` = `Indicators.descriptors()`; the screener meta also lists `operandKinds`).
//
// The descriptor is the one source of an operand's rules in the UI: the length parameter `n`
// (default, range, step, description), the display name and description, the value unit, the
// operand TFs and the run TFs (a stage-3b indicator does not run on MIN5).
//
// It is module state (like the constructed-name cache in constructedFormat.js): the meta getters
// register what they load (`setIndicatorCatalog`), pure helpers (captions, validation, request
// adapters) read it, and components re-render on a change through `useIndicatorCatalog()`.
// Fallback before / without a meta: the bar fields + SMA (stage 3a behaviour).

import { useSyncExternalStore } from 'react';
import { INDICATOR_TEXTS } from './editorTexts';

/** Bar-field operand kinds (no parameter; unit PRICE, VOLUME for volume). */
export const FIELD_KINDS = Object.freeze(['OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME']);
export const CONST_KIND = 'CONST';

const FIELD_LABEL = Object.freeze({ OPEN: 'open', HIGH: 'high', LOW: 'low', CLOSE: 'close', VOLUME: 'volume' });
const FIELD_UNIT = Object.freeze({ OPEN: 'PRICE', HIGH: 'PRICE', LOW: 'PRICE', CLOSE: 'PRICE', VOLUME: 'VOLUME' });

/** Short human names of the backend's ValueUnit. */
export const UNIT_LABEL = Object.freeze({
  PRICE: 'price',
  PRICE_RANGE: 'price range',
  VOLUME: 'volume',
  PERCENT: '%',
  RATIO: 'ratio',
  BARS: 'bars',
  ATR_MULTIPLE: 'ATR multiples', // stage 4b: Levels DIST_SUPPORT_ATR / DIST_RESISTANCE_ATR
});

/** What each unit is, for tooltips. */
export const UNIT_HINT = Object.freeze({
  PRICE: 'a price: compared with a price (open / high / low / close / SMA) or a number',
  PRICE_RANGE: 'a distance in price (ATR): compared only with ATR or a number; for a threshold in % use ATR %',
  VOLUME: 'a volume: compared with volume or a number',
  PERCENT: 'a percentage: compared with another % value or a number',
  RATIO: 'a ratio (0..1): compared with another ratio or a number',
  BARS: 'a number of bars',
  ATR_MULTIPLE: 'a distance in ATR multiples (Levels DIST_* or KAIRI in ATR form): compared only with another ATR-multiple value or a number',
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ALL_RUN_TFS = Object.freeze(['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH']);

/**
 * IndicatorDescriptor `choiceParams[{name, description, defaultValue, defaultOmitted?, choices[{value,
 * label, market?, unit?, lo?, hi?, neutral?}]}]` → the same, cleaned (values are strings, never coerced
 * to a number; a param without a choice is dropped; a default that is no choice falls back to the
 * first one). [] when absent (every kind but CORR / KAIRI, and an older backend).
 * KAIRI's `mode`: `defaultOmitted` (the default form PCT is left out of the operand JSON) and a
 * unit / lo / hi / neutral per choice (the form sets the value's unit, its chart pane and the
 * neutral line 0 / 1 / 0). CORR's choices carry none of these (null).
 */
export function normalizeChoiceParams(raw) {
  return (Array.isArray(raw) ? raw : []).filter((p) => p && typeof p.name === 'string' && p.name).map((p) => {
    const choices = (Array.isArray(p.choices) ? p.choices : [])
      .filter((c) => c && typeof c.value === 'string' && c.value)
      .map((c) => ({
        value: c.value,
        label: typeof c.label === 'string' && c.label ? c.label : c.value,
        market: typeof c.market === 'string' && c.market ? c.market : null,
        unit: typeof c.unit === 'string' && c.unit ? c.unit : null,
        lo: isNum(c.lo) ? c.lo : null,
        hi: isNum(c.hi) ? c.hi : null,
        neutral: isNum(c.neutral) ? c.neutral : null,
      }));
    const dflt = typeof p.defaultValue === 'string' && choices.some((c) => c.value === p.defaultValue)
      ? p.defaultValue : (choices[0]?.value ?? null);
    return {
      name: p.name,
      description: typeof p.description === 'string' ? p.description : '',
      defaultValue: dflt,
      defaultOmitted: p.defaultOmitted === true,
      choices,
    };
  }).filter((p) => p.choices.length > 0);
}

/**
 * IndicatorDescriptor `{name, displayName, description, params[{name, integer, min, max,
 * storedOnly, defaultValue, step, description}], source, unit, lo, hi, warmup, timeframes[],
 * runTimeframes[], linearInNextClose}` → the same, defaulted (a stage-3a backend sends no
 * displayName / defaultValue / step / runTimeframes). null when it has no name.
 */
export function normalizeIndicator(d) {
  if (!d || typeof d.name !== 'string' || !d.name) return null;
  return {
    name: d.name,
    displayName: typeof d.displayName === 'string' && d.displayName ? d.displayName : d.name,
    description: typeof d.description === 'string' ? d.description : '',
    params: (Array.isArray(d.params) ? d.params : []).filter((p) => p && p.name).map((p) => {
      const min = isNum(p.min) ? p.min : null;
      return {
        name: p.name,
        integer: p.integer !== false,
        min,
        max: isNum(p.max) ? p.max : null,
        storedOnly: p.storedOnly === true,
        defaultValue: isNum(p.defaultValue) ? p.defaultValue : min,
        step: isNum(p.step) && p.step > 0 ? p.step : 1,
        description: typeof p.description === 'string' ? p.description : '',
      };
    }),
    source: d.source ?? null,
    unit: d.unit ?? null,
    lo: isNum(d.lo) ? d.lo : null,
    hi: isNum(d.hi) ? d.hi : null,
    warmup: typeof d.warmup === 'string' ? d.warmup : null,
    timeframes: Array.isArray(d.timeframes) ? d.timeframes : [],
    runTimeframes: Array.isArray(d.runTimeframes) && d.runTimeframes.length ? d.runTimeframes : [...ALL_RUN_TFS],
    linearInNextClose: d.linearInNextClose === true,
    // CORR's benchmark, KAIRI's mode: categorical parameters, never in `params` (params[0] = the length)
    choiceParams: normalizeChoiceParams(d.choiceParams),
    // editor UX Stage A: the Source-menu name and the ⓘ text (new keys; displayName / description
    // stay for captions, titles and the Indicators Chart)
    menuLabel: (typeof d.menuLabel === 'string' && d.menuLabel) || INDICATOR_TEXTS[d.name]?.menuLabel
      || (typeof d.displayName === 'string' && d.displayName) || d.name,
    tooltip: (typeof d.tooltip === 'string' && d.tooltip) || INDICATOR_TEXTS[d.name]?.tooltip
      || (typeof d.description === 'string' ? d.description : ''),
  };
}

/** SMA descriptor fallback when no meta (or a meta without indicators[]) is loaded (E1). */
export const DEFAULT_INDICATORS = Object.freeze([normalizeIndicator({
  name: 'SMA',
  displayName: 'SMA',
  description: 'Simple moving average of the close over n bars of its timeframe (stored rows only)',
  params: [{ name: 'n', integer: true, min: 5, max: 200, storedOnly: true, defaultValue: 50, step: 5, description: 'SMA length in bars' }],
  source: 'close',
  unit: 'PRICE',
  lo: 0,
  hi: null,
  warmup: 'n - 1 bars of its timeframe',
  timeframes: ['DAY', 'WEEK', 'RUN'],
  runTimeframes: ALL_RUN_TFS,
  linearInNextClose: true,
})]);

// ---- the store ----

const build = (indicators, operandKinds) => {
  const byName = new Map(indicators.map((d) => [d.name, d]));
  // Picker kinds: the meta's order when it lists operandKinds (unknown kinds without a descriptor
  // are left out: the UI cannot set their parameters), else fields + the registry's order.
  const kinds = Array.isArray(operandKinds) && operandKinds.length
    ? operandKinds.filter((k) => FIELD_KINDS.includes(k) || byName.has(k))
    : [...FIELD_KINDS, ...indicators.map((d) => d.name)];
  return Object.freeze({ indicators, byName, operandKinds: operandKinds || null, kinds: Object.freeze(kinds) });
};

let catalog = build([...DEFAULT_INDICATORS], null);
const listeners = new Set();

/**
 * Registers a loaded meta's `indicators[]` (raw or normalized) and, when given, its
 * `operandKinds[]` (screener meta). A missing / empty list keeps what is registered.
 */
export const setIndicatorCatalog = ({ indicators, operandKinds } = {}) => {
  const list = Array.isArray(indicators) && indicators.length
    ? indicators.map(normalizeIndicator).filter(Boolean) : catalog.indicators;
  const kinds = Array.isArray(operandKinds) && operandKinds.length ? operandKinds : catalog.operandKinds;
  catalog = build(list.length ? list : [...DEFAULT_INDICATORS], kinds);
  listeners.forEach((l) => l());
};

export const getIndicatorCatalog = () => catalog;

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The current catalog; the component re-renders when a meta registers a new one. */
export const useIndicatorCatalog = () => useSyncExternalStore(subscribe, getIndicatorCatalog);

// ---- per-kind rules ----

export const isFieldKind = (kind) => FIELD_KINDS.includes(kind);

/** The descriptor of an indicator kind; null for a field, CONST or an unknown kind. */
export const descriptorOf = (kind) => catalog.byName.get(kind) || null;

/** The length parameter `n` of `kind` (`{min, max, step, defaultValue, description, ...}`); null when none. */
export const lengthParamOf = (kind) => descriptorOf(kind)?.params?.[0] || null;

/**
 * Does an operand of `kind` carry a length `n`: true for an indicator with a parameter (SMA, ATR,
 * …), false for a field, CONST and IBS; for a kind the catalog does not know, true when `n` is a
 * number (so a definition from a newer server keeps its `n` on a round trip).
 */
export const hasLength = (kind, n) => {
  if (!kind || kind === CONST_KIND || isFieldKind(kind)) return false;
  const d = descriptorOf(kind);
  if (d) return d.params.length > 0;
  return n !== '' && n != null && Number.isFinite(Number(n));
};

/** The default `n` of a kind (its descriptor's `defaultValue`); null for a kind without a length. */
export const defaultLengthOf = (kind) => {
  const p = lengthParamOf(kind);
  return p ? p.defaultValue ?? p.min : null;
};

// ---- categorical parameters (CORR's benchmark) ----

/** The name of the benchmark choice parameter (OperandDTO / IndicatorRef field `benchmark`). */
export const BENCHMARK_PARAM = 'benchmark';

/** Market of a ticker as stored: `_MOEX` suffix → MOEX, else US (backend Benchmarks.marketOf). */
export const marketOfTicker = (ticker) => (String(ticker || '').toUpperCase().endsWith('_MOEX') ? 'MOEX' : 'US');

/** The benchmark choice param of a descriptor (raw or normalized), or null. */
export const benchmarkParamOfDescriptor = (d) => {
  if (!d) return null;
  return normalizeChoiceParams(d.choiceParams).find((p) => p.name === BENCHMARK_PARAM) || null;
};

/** Choice params of a kind (`[]` for a field, CONST, an unknown kind and every indicator but CORR). */
export const choiceParamsOf = (kind) => descriptorOf(kind)?.choiceParams || [];

/** The benchmark choice param of a kind, or null. */
export const benchmarkParamOf = (kind) => choiceParamsOf(kind).find((p) => p.name === BENCHMARK_PARAM) || null;

/**
 * Does an operand of `kind` carry a benchmark: true for a kind with the choice param; for a kind
 * the catalog does not know, true when `benchmark` is a non-empty string (a definition from a newer
 * server keeps it on a round trip, as `hasLength` keeps `n`).
 */
export const hasBenchmark = (kind, benchmark) => {
  if (!kind || kind === CONST_KIND || isFieldKind(kind)) return false;
  if (descriptorOf(kind)) return !!benchmarkParamOf(kind);
  return typeof benchmark === 'string' && benchmark !== '';
};

/** The default benchmark of a kind (descriptor default, SPY for CORR); null for a kind without one. */
export const defaultBenchmarkOf = (kind) => benchmarkParamOf(kind)?.defaultValue ?? null;

/**
 * The benchmark choices of a descriptor for a market (`[{value, label, market}]`); `market` null =
 * every market. A choice without a market is offered everywhere.
 */
export const benchmarkChoicesOf = (d, market = null) => {
  const p = benchmarkParamOfDescriptor(d);
  if (!p) return [];
  return market ? p.choices.filter((c) => !c.market || c.market === market) : p.choices;
};

/** The benchmark choices of a kind for a market (null = all). */
export const benchmarksFor = (kind, market = null) => benchmarkChoicesOf(descriptorOf(kind), market);

/**
 * Why a descriptor with a benchmark cannot be used for `ticker` (no benchmark of its market, MOEX
 * today), or null. Kinds without a benchmark: null.
 */
export const benchmarkMarketIssue = (d, ticker) => {
  if (!benchmarkParamOfDescriptor(d) || !ticker) return null;
  const market = marketOfTicker(ticker);
  if (benchmarkChoicesOf(d, market).length) return null;
  return `${d.displayName || d.name} needs a benchmark of the ${market} market; there is none yet`;
};

/**
 * Why `benchmark` of a descriptor does not fit `ticker`'s market, or null (fits / no benchmark).
 * The backend answers the same with a 400; the UI refuses it first.
 */
export const benchmarkTickerIssue = (d, benchmark, ticker) => {
  if (!benchmark || !ticker) return null;
  const p = benchmarkParamOfDescriptor(d);
  if (!p) return null;
  const c = p.choices.find((x) => x.value === benchmark);
  const market = marketOfTicker(ticker);
  if (!c || !c.market || c.market === market) return null;
  return `${benchmark} is a ${c.market} benchmark; ${ticker} trades on ${market}`;
};

// ---- KAIRI's form (`mode`) and choice params in general ----

/** The name of KAIRI's form choice parameter (OperandDTO / IndicatorRef field `mode`). */
export const MODE_PARAM = 'mode';

/** Operand fields that carry a choice param's value (one per choice param name the backend knows). */
export const CHOICE_FIELDS = Object.freeze([BENCHMARK_PARAM, MODE_PARAM]);

/** The `mode` choice param of a kind (KAIRI), or null. */
export const modeParamOf = (kind) => choiceParamsOf(kind).find((p) => p.name === MODE_PARAM) || null;

/** The default form of a kind (KAIRI: PCT); null for a kind without one. */
export const defaultModeOf = (kind) => modeParamOf(kind)?.defaultValue ?? null;

/**
 * The value of choice param `p` an operand / a chart item's params carry (`o[p.name]`): the given
 * string when it is one of the choices, else the param's default.
 */
export const choiceValueOfOperand = (o, p) => {
  const v = o ? o[p.name] : undefined;
  return typeof v === 'string' && p.choices.some((c) => c.value === v) ? v : p.defaultValue;
};

/**
 * The descriptor as the picked form makes it: `values` (an operand or a chart item's params) picks
 * a choice of each choice param; a choice with its own unit (KAIRI's forms) replaces the
 * descriptor's unit / lo / hi and adds `neutral`; a non-default one also gets `paneKind`
 * ('KAIRI:RATIO', 'KAIRI:ATR': a chart pane of its own). A descriptor without such a choice (CORR,
 * every other kind) is returned as is (the same object). null for null.
 */
export const effectiveDescriptor = (d, values) => {
  if (!d) return null;
  let out = d;
  for (const p of normalizeChoiceParams(d.choiceParams)) {
    const value = choiceValueOfOperand(values, p);
    const c = p.choices.find((x) => x.value === value);
    if (!c || !c.unit) continue;
    out = {
      ...out,
      unit: c.unit,
      lo: c.lo,
      hi: c.hi,
      neutral: c.neutral,
      ...(value !== p.defaultValue ? { paneKind: `${d.name}:${value}` } : {}),
    };
  }
  return out;
};

/** Every unit an operand of `kind` can have: the descriptor's and its forms' (KAIRI: PERCENT, RATIO, ATR_MULTIPLE). */
export const unitsOfKind = (kind) => {
  if (isFieldKind(kind)) return [FIELD_UNIT[kind]];
  const d = descriptorOf(kind);
  if (!d) return [];
  const units = d.unit ? [d.unit] : [];
  (d.choiceParams || []).forEach((p) => p.choices.forEach((c) => { if (c.unit && !units.includes(c.unit)) units.push(c.unit); }));
  return units;
};

/**
 * The non-default form of `kind` whose unit is `unit` (KAIRI: ATR for ATR_MULTIPLE, RATIO for
 * RATIO), or null (no such form, or the default form has that unit).
 */
export const modeForUnit = (kind, unit) => {
  const p = modeParamOf(kind);
  if (!p || !unit) return null;
  const c = p.choices.find((x) => x.unit === unit);
  return c && c.value !== p.defaultValue ? c.value : null;
};

/** Picker label of a kind: `close`, `SMA(n)`, `ATR %(n)`, `IBS`, `constant`. */
export const kindLabel = (kind) => {
  if (kind === CONST_KIND) return 'constant';
  if (isFieldKind(kind)) return FIELD_LABEL[kind];
  const d = descriptorOf(kind);
  if (!d) return kind;
  return d.params.length ? `${d.displayName}(n)` : d.displayName;
};

/** Display name of a kind (descriptor's displayName, the field name, or the kind). */
export const kindName = (kind) => {
  if (isFieldKind(kind)) return FIELD_LABEL[kind];
  return descriptorOf(kind)?.displayName || kind;
};

// ---- stage 4b operands of a constructed strategy (not registry indicators) ----

/** The Levels value operand (`{kind: 'LEVEL', output, levels}`). */
export const LEVEL_KIND = 'LEVEL';
/** Sequence-brick operands: AT_LAST / MAX_SINCE / MIN_SINCE carry X and the anchor A, BARS_SINCE only A. */
export const ANCHORED_KINDS = Object.freeze(['AT_LAST', 'MAX_SINCE', 'MIN_SINCE']);
export const BRICK_OPERAND_KINDS = Object.freeze([...ANCHORED_KINDS, 'BARS_SINCE']);
export const isBrickOperand = (o) => !!o && BRICK_OPERAND_KINDS.includes(o.kind);
/**
 * Stage 4c-1 position operands (constructed strategy rules only, LONG only): AT_ENTRY(X) = X on the
 * entry bar of the open long; MAX_SINCE_ENTRY / MIN_SINCE_ENTRY(X, lag) = the extreme of X over
 * (entry, t − lag]. X is a market operand of the run TF (a bar field, an indicator, LEVEL or a brick).
 */
export const POSITION_KINDS = Object.freeze(['AT_ENTRY', 'MAX_SINCE_ENTRY', 'MIN_SINCE_ENTRY', 'STICKY_SINCE_ENTRY']);
/** The position kinds with a window (and a lag). */
export const POSITION_WINDOW_KINDS = Object.freeze(['MAX_SINCE_ENTRY', 'MIN_SINCE_ENTRY']);
/**
 * R5 v2 F1: the position kinds of form LEVELS - no X, no lag, their own Levels spec (`levels`).
 * STICKY_SINCE_ENTRY(levels) = the LevelBreakoutRetest class's sticky-support exit line of the open
 * long (the value on bar t is the line after bar t − 1; never moves down). Unit PRICE.
 */
export const POSITION_LEVELS_KINDS = Object.freeze(['STICKY_SINCE_ENTRY']);
export const isPositionOperand = (o) => !!o && POSITION_KINDS.includes(o.kind);
/** A position operand of form LEVELS (STICKY_SINCE_ENTRY): its own `levels`, no X. */
export const isPositionLevelsOperand = (o) => !!o && POSITION_LEVELS_KINDS.includes(o.kind);
/** LEVEL, a brick or a position operand: an operand the screener's OperandPicker cannot edit. */
export const isStagedOperand = (o) => !!o
  && (o.kind === LEVEL_KIND || BRICK_OPERAND_KINDS.includes(o.kind) || POSITION_KINDS.includes(o.kind));

// Units of the Levels outputs (meta.levels.outputs, static fallback = the backend's LevelOutput)
let levelOutputUnits = {
  IN_ZONE: 'RATIO',
  SETUP_STOP: 'PRICE',
  SETUP_ZONE_LINE: 'PRICE',
  SUPPORT_LINE: 'PRICE',
  DIST_SUPPORT_ATR: 'ATR_MULTIPLE',
  DIST_RESISTANCE_ATR: 'ATR_MULTIPLE',
  OPEN_STOP: 'PRICE', // stage 4c-1
  OPEN_LINE: 'PRICE',
};

/** Registers meta.levels.outputs `[{name, unit}]` (a missing list keeps the fallback). */
export const setLevelOutputUnits = (outputs) => {
  if (!Array.isArray(outputs) || !outputs.length) return;
  const next = { ...levelOutputUnits };
  outputs.forEach((o) => { if (o?.name && o.unit) next[o.name] = o.unit; });
  levelOutputUnits = next;
};

/** Unit of a Levels output (PRICE / ATR_MULTIPLE / RATIO), null when unknown. */
export const levelOutputUnit = (output) => levelOutputUnits[output] || null;

/**
 * Value unit (backend ValueUnit) of an operand; null for a constant (fits any unit) or an unknown
 * kind. Stage 4b: LEVEL → its output's unit, BARS_SINCE → BARS, AT_LAST / MAX_SINCE / MIN_SINCE → X's;
 * stage 4c-1: AT_ENTRY / MAX_SINCE_ENTRY / MIN_SINCE_ENTRY → X's; R5 v2: STICKY_SINCE_ENTRY → PRICE.
 */
export const operandUnitOf = (o) => {
  if (!o || !o.kind || o.kind === CONST_KIND) return null;
  if (isFieldKind(o.kind)) return FIELD_UNIT[o.kind];
  if (o.kind === LEVEL_KIND) return levelOutputUnit(o.output);
  if (o.kind === 'BARS_SINCE') return 'BARS';
  if (POSITION_LEVELS_KINDS.includes(o.kind)) return 'PRICE'; // R5 v2 F1: a price line
  if (ANCHORED_KINDS.includes(o.kind) || POSITION_KINDS.includes(o.kind)) return operandUnitOf(o.x);
  // KAIRI: the unit of the operand's form (`mode`; absent = the default form)
  return effectiveDescriptor(descriptorOf(o.kind), o)?.unit || null;
};

export const unitLabel = (u) => (u ? UNIT_LABEL[u] || String(u).toLowerCase() : '');

/** Can a strategy running on `runTf` read `kind` (fields / CONST / unknown: yes). */
export const runsOn = (kind, runTf) => {
  const d = descriptorOf(kind);
  if (!d || !runTf) return true;
  return d.runTimeframes.includes(runTf);
};

/** The run TFs of a kind in words, in TF order: 'DAY or WEEK', 'HOUR, DAY, WEEK or MONTH'. */
export const runTfsTextOf = (kind) => {
  const d = descriptorOf(kind);
  const tfs = ALL_RUN_TFS.filter((tf) => !d || d.runTimeframes.includes(tf));
  if (tfs.length <= 1) return tfs[0] || '';
  return `${tfs.slice(0, -1).join(', ')} or ${tfs[tfs.length - 1]}`;
};

/** The advice of a kind that does not run on a TF: 'run the strategy on DAY or WEEK'. */
export const runTfAdviceOf = (kind) => `run the strategy on ${runTfsTextOf(kind)}`;

const fmtBound = (v) => String(v).replace('-', '−');

/** The indicator descriptor an operand's value comes from (through a brick / position X), or null. */
const valueDescriptorOf = (o) => {
  if (!o || !o.kind) return null;
  if (ANCHORED_KINDS.includes(o.kind) || POSITION_KINDS.includes(o.kind)) return valueDescriptorOf(o.x);
  return effectiveDescriptor(descriptorOf(o.kind), o);
};

/**
 * The unit tooltip of an operand: UNIT_HINT, with an indicator's own bounds for a ratio
 * (CORR: 'a ratio (−1..1)', IBS / ER: 'a ratio (0..1)').
 */
export const unitHintOf = (o) => {
  const unit = operandUnitOf(o);
  if (!unit) return '';
  const d = valueDescriptorOf(o);
  if (unit === 'RATIO' && d && isNum(d.lo) && isNum(d.hi)) {
    return `a ratio (${fmtBound(d.lo)}..${fmtBound(d.hi)}): compared with another ratio or a number`;
  }
  // KAIRI close / SMA: no upper bound, 1 = on the SMA
  if (unit === 'RATIO' && d && isNum(d.neutral)) {
    return `a ratio (${fmtBound(d.neutral)} = on the average): compared with another ratio or a number`;
  }
  return UNIT_HINT[unit] || unitLabel(unit);
};

/** "ATR is not supported on MIN5 yet" (null when it runs there). */
export const runTfNotSupportedText = (kind, runTf) => (runsOn(kind, runTf)
  ? null : `${kindName(kind)} is not supported on ${runTf} yet`);

/** Operand TFs a kind accepts (descriptor `timeframes`), filtered from `tfs`; `tfs` when it lists none. */
export const operandTfsOf = (kind, tfs) => {
  const allowed = descriptorOf(kind)?.timeframes;
  if (!allowed || !allowed.length) return tfs;
  const out = tfs.filter((tf) => allowed.includes(tf));
  return out.length ? out : tfs;
};
