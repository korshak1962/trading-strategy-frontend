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
});

/** What each unit is, for tooltips. */
export const UNIT_HINT = Object.freeze({
  PRICE: 'a price: compared with a price (open / high / low / close / SMA) or a number',
  PRICE_RANGE: 'a distance in price (ATR): compared only with ATR or a number; for a threshold in % use ATR %',
  VOLUME: 'a volume: compared with volume or a number',
  PERCENT: 'a percentage: compared with another % value or a number',
  RATIO: 'a ratio (0..1): compared with another ratio or a number',
  BARS: 'a number of bars',
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ALL_RUN_TFS = Object.freeze(['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH']);

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

/** Value unit (backend ValueUnit) of an operand; null for a constant (fits any unit) or an unknown kind. */
export const operandUnitOf = (o) => {
  if (!o || !o.kind || o.kind === CONST_KIND) return null;
  if (isFieldKind(o.kind)) return FIELD_UNIT[o.kind];
  return descriptorOf(o.kind)?.unit || null;
};

export const unitLabel = (u) => (u ? UNIT_LABEL[u] || String(u).toLowerCase() : '');

/** Can a strategy running on `runTf` read `kind` (fields / CONST / unknown: yes). */
export const runsOn = (kind, runTf) => {
  const d = descriptorOf(kind);
  if (!d || !runTf) return true;
  return d.runTimeframes.includes(runTf);
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
