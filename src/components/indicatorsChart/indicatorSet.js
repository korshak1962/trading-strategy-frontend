// src/components/indicatorsChart/indicatorSet.js
//
// The set of indicators shown on the Indicators Chart (TASK B2 / B4, architect §6.2): pure
// helpers, no React. An item is
//   registry indicator: { id, kind: 'SMA' | 'IBS' | ..., params: { n?, benchmark?, mode? }, color, hidden }
//                       (`benchmark`: CORR's categorical param, a ticker string from the descriptor's
//                       choiceParams - never a number; entries saved before CORR simply have none;
//                       `mode`: KAIRI's form PCT / RATIO / ATR, likewise a choice param)
//   channels overlay:   { id, kind: 'CHANNELS', params: { coarserTfs, view, lastActualChannelsOnly, detector }, hidden }
//   levels overlay:     { id, kind: 'LEVELS', params: { minStrength, nearestN, allZones, variant }, hidden }
//   volume profile:     { id, kind: 'VOLUME_PROFILE', params: { rows, widthPct }, hidden } - no colour
//                       (the theme's candle up / down), at most one per set
// `color` is a theme token reference ('var(--chart-series-N)', follows a theme switch) or a hex
// the user picked. The set is remembered per viewer in localStorage (try/catch: the tab works the
// same without storage); a kind that is no longer in the registry is dropped on restore with a
// visible notice.

import { paletteColor } from '../charts/workspace/workspaceTheme';
import { RECURSIVE_DEFAULT_PARAMS } from '../channelExplorer/RecursiveParamsPanel';
import { CHANNEL_VIEW } from '../../api/channelApi';
import { clampChartNearestN } from '../../utils/levelZones';
import { normalizeChoiceParams } from '../../api/indicatorCatalog';
import {
  VP_ROWS_MIN, VP_ROWS_MAX, VP_ROWS_DEFAULT, VP_WIDTH_MIN, VP_WIDTH_MAX, VP_WIDTH_DEFAULT,
} from '../../utils/volumeProfile';

export const STORAGE_KEY = 'tsf.indicatorsChart.v1';
export const CHANNELS = 'CHANNELS';
export const LEVELS = 'LEVELS';
export const VOLUME_PROFILE = 'VOLUME_PROFILE';
export const BUILT_IN_KINDS = Object.freeze([CHANNELS, LEVELS, VOLUME_PROFILE]);
/** Above this many visible lines the hover tooltip gets heavy: a warning, not a limit. */
export const PRACTICAL_LINE_LIMIT = 40;

export const TF_RANK = Object.freeze({ MIN5: 0, HOUR: 1, DAY: 2, WEEK: 3, MONTH: 4 });
export const TIMEFRAMES = Object.freeze(['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH']);

export const isBuiltIn = (kind) => BUILT_IN_KINDS.includes(kind);

let idSeq = 0;
export const newItemId = () => `i${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export const DEFAULT_CHANNEL_PARAMS = Object.freeze({
  coarserTfs: [],
  view: CHANNEL_VIEW.FULL,
  lastActualChannelsOnly: true,
  detector: { ...RECURSIVE_DEFAULT_PARAMS },
});

/**
 * `variant`: the level detection variant id (GET /api/levels/variants) or null = the backend's
 * default map. The dialog stores null when the default row is picked, so a default set sends no
 * `variant` and old saved sets (no field) load as the default.
 */
export const DEFAULT_LEVEL_PARAMS = Object.freeze({ minStrength: 0, nearestN: 2, allZones: false, variant: null });

const VARIANT_ID_RE = /^[A-Za-z0-9_]{1,64}$/;

/**
 * The variant id the Levels request sends: null for no variant / the default row of `variants`
 * (when the list is known), else the stored id. Pure.
 */
export const effectiveLevelVariant = (params, variants) => {
  const v = params?.variant;
  if (typeof v !== 'string' || !v) return null;
  const def = (variants || []).find(r => r.isDefault);
  return def && def.id === v ? null : v;
};

export const DEFAULT_VOLUME_PROFILE_PARAMS = Object.freeze({ rows: VP_ROWS_DEFAULT, widthPct: VP_WIDTH_DEFAULT });

/**
 * The volume profile's param checks (dialog): null when valid, else the message. Rows 6..200 and
 * width 10..60 % of the chart, whole numbers.
 */
export const volumeProfileParamErrors = (values) => {
  const out = {};
  const check = (key, name, min, max) => {
    const raw = values?.[key];
    if (raw === '' || raw === null || raw === undefined) { out[key] = `${name} is required`; return; }
    const v = Number(raw);
    if (!Number.isFinite(v)) out[key] = `${name} must be a number`;
    else if (!Number.isInteger(v)) out[key] = `${name} must be a whole number`;
    else if (v < min) out[key] = `${name} must be at least ${min}`;
    else if (v > max) out[key] = `${name} must be at most ${max}`;
  };
  check('rows', 'Rows', VP_ROWS_MIN, VP_ROWS_MAX);
  check('widthPct', 'Width', VP_WIDTH_MIN, VP_WIDTH_MAX);
  return out;
};

/** Detector params as the channel endpoint takes them (logPrice always on: the chart is log). */
export const detectorApiParams = (detector) => ({
  coveragePct: detector.coveragePct,
  minBars: detector.minBars,
  minWidthPct: detector.minWidthPct,
  minAnnualYieldPct: detector.minAnnualYieldPct,
  maxAnnualYieldPct: detector.maxAnnualYieldPct,
  logPrice: true,
});

/** The channel timeframes of a channels item on a chart of `chartTf`: the chart's own + coarser picks. */
export const channelTimeframes = (item, chartTf) => {
  const extra = (item?.params?.coarserTfs || []).filter((tf) => TF_RANK[tf] > TF_RANK[chartTf]);
  return [chartTf, ...TIMEFRAMES.filter((tf) => extra.includes(tf))];
};

/** The choice param fields a spec can carry (CORR's benchmark, KAIRI's mode), in `ind` order. */
const SPEC_CHOICE_FIELDS = Object.freeze(['benchmark', 'mode']);

/**
 * The registry spec {kind, n, benchmark?, mode?} of an item (n null for a parameterless kind; a
 * choice param only on an item that has one - CORR's benchmark, KAIRI's mode - so every other spec
 * stays {kind, n}). With the item's `descriptor`, a choice param marked `defaultOmitted` (KAIRI's
 * mode) is left out at its default: 'KAIRI:20', not 'KAIRI:20:PCT' (the backend echoes the spec
 * without it). Without a descriptor the item's strings are taken as they are.
 */
export const specOf = (item, descriptor = null) => {
  const spec = {
    kind: item.kind,
    n: item.params && item.params.n !== undefined && item.params.n !== null ? Number(item.params.n) : null,
  };
  const choiceParams = descriptor ? normalizeChoiceParams(descriptor.choiceParams) : null;
  for (const field of SPEC_CHOICE_FIELDS) {
    const raw = item.params?.[field];
    if (choiceParams) {
      const p = choiceParams.find((x) => x.name === field);
      if (!p) continue;
      const v = choiceValueOf(p, raw);
      if (v && !(p.defaultOmitted && v === p.defaultValue)) spec[field] = v;
    } else if (typeof raw === 'string' && raw) {
      spec[field] = raw;
    }
  }
  return spec;
};

/**
 * The Levels chip label: 'Levels (N 2, strength ≥ 0)' / 'Levels (all, strength ≥ 0)'; a non-default
 * variant (`variant`, from effectiveLevelVariant) goes first: 'Levels (PT_A, all, strength ≥ 4)'.
 */
export const levelsLabel = (params, variant = null) =>
  `Levels (${variant ? `${variant}, ` : ''}${params?.allZones ? 'all' : `N ${params?.nearestN}`}, strength ≥ ${params?.minStrength})`;

/** 'SMA(50)', 'IBS', 'Corr(60, QQQ)', 'Kairi(20)', 'Kairi(20, ATR)', 'Channels', 'Levels', 'Volume profile'. */
export const itemLabel = (item, descriptor) => {
  if (item.kind === CHANNELS) return 'Channels';
  if (item.kind === LEVELS) return 'Levels';
  if (item.kind === VOLUME_PROFILE) return 'Volume profile';
  const name = descriptor?.displayName || item.kind;
  const { n, benchmark, mode } = specOf(item, descriptor);
  const args = [n, benchmark, mode].filter((a) => a !== null && a !== undefined);
  return args.length ? `${name}(${args.join(', ')})` : name;
};

/** The first palette colour not used by another item (wraps after the palette size). */
export const nextColor = (items) => {
  const used = new Set((items || []).map((it) => it.color));
  for (let i = 0; i < 8; i++) {
    const c = paletteColor(i);
    if (!used.has(c)) return c;
  }
  return paletteColor((items || []).length);
};

/** Default params of a registry descriptor: {name: defaultValue}, the choice params' defaults included. */
export const defaultParams = (descriptor) => Object.fromEntries([
  ...(descriptor?.params || []).map((p) => [p.name, p.defaultValue]),
  ...normalizeChoiceParams(descriptor?.choiceParams).map((p) => [p.name, p.defaultValue]),
]);

/** Shape of a stored choice value (a benchmark ticker, a KAIRI form), for a set restored before the registry is known. */
const CHOICE_VALUE_RE = /^[A-Za-z0-9_.]{1,32}$/;

/** A choice param's value: the given one when it is a choice, else the default. */
export const choiceValueOf = (param, raw) => (
  typeof raw === 'string' && param.choices.some((c) => c.value === raw) ? raw : param.defaultValue
);

/**
 * Checks one registry param value against its descriptor: null when valid, else the message.
 * The backend applies the same range (400 BAD_PARAM); the dialog refuses it first (E11).
 */
export const paramError = (param, raw) => {
  if (raw === '' || raw === null || raw === undefined) return `${param.name} is required`;
  const v = Number(raw);
  if (!Number.isFinite(v)) return `${param.name} must be a number`;
  if (param.integer && !Number.isInteger(v)) return `${param.name} must be a whole number`;
  if (typeof param.min === 'number' && v < param.min) return `${param.name} must be at least ${param.min}`;
  if (typeof param.max === 'number' && v > param.max) return `${param.name} must be at most ${param.max}`;
  return null;
};

const sanitizeDetector = (d) => {
  const out = { ...RECURSIVE_DEFAULT_PARAMS };
  Object.keys(RECURSIVE_DEFAULT_PARAMS).forEach((k) => {
    if (k === 'logPrice') return;
    const v = Number(d?.[k]);
    if (Number.isFinite(v)) out[k] = v;
  });
  out.logPrice = true;
  return out;
};

export const sanitizeChannelParams = (p) => ({
  coarserTfs: (Array.isArray(p?.coarserTfs) ? p.coarserTfs : []).filter((tf) => TIMEFRAMES.includes(tf)),
  view: p?.view === CHANNEL_VIEW.INCREMENTAL ? CHANNEL_VIEW.INCREMENTAL : CHANNEL_VIEW.FULL,
  lastActualChannelsOnly: p?.lastActualChannelsOnly !== false,
  detector: sanitizeDetector(p?.detector),
});

const clampInt = (raw, min, max, dflt) => {
  const v = Number(raw);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(v)) return dflt;
  return Math.min(max, Math.max(min, Math.round(v)));
};

export const sanitizeVolumeProfileParams = (p) => ({
  rows: clampInt(p?.rows, VP_ROWS_MIN, VP_ROWS_MAX, VP_ROWS_DEFAULT),
  widthPct: clampInt(p?.widthPct, VP_WIDTH_MIN, VP_WIDTH_MAX, VP_WIDTH_DEFAULT),
});

/** The volume profile chip label: 'Volume profile (24 rows, 30 %)'. */
export const volumeProfileLabel = (params) => `Volume profile (${params?.rows} rows, ${params?.widthPct} %)`;

export const sanitizeLevelParams = (p) => {
  const s = Number(p?.minStrength);
  return {
    minStrength: Number.isFinite(s) && s >= 0 ? s : DEFAULT_LEVEL_PARAMS.minStrength,
    nearestN: clampChartNearestN(p?.nearestN ?? DEFAULT_LEVEL_PARAMS.nearestN, DEFAULT_LEVEL_PARAMS.nearestN),
    allZones: p?.allZones === true,
    variant: typeof p?.variant === 'string' && VARIANT_ID_RE.test(p.variant) ? p.variant : null,
  };
};

/** Reads the stored set; [] when there is none or storage is unavailable / corrupt. */
export const loadStoredItems = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
};

export const saveStoredItems = (items) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
  } catch {
    // storage blocked: the set lasts for this page only
  }
};

/**
 * Drops broken entries of a restored set against the registry descriptors (B4): an unknown kind,
 * a malformed entry, or a second Channels / Levels / Volume profile item. Registry params outside the
 * descriptor's range fall back to the default. Returns {items, dropped: [text]}.
 * `descriptors` null: the registry is not known yet - registry entries are kept unchecked.
 */
export const sanitizeItems = (rawItems, descriptors) => {
  const byName = new Map((descriptors || []).map((d) => [d.name, d]));
  const items = [];
  const dropped = [];
  const ids = new Set();
  let hasChannels = false;
  let hasLevels = false;
  let hasVolumeProfile = false;
  for (const raw of rawItems || []) {
    if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string') { dropped.push('an unreadable entry'); continue; }
    const id = typeof raw.id === 'string' && raw.id && !ids.has(raw.id) ? raw.id : newItemId();
    ids.add(id);
    const hidden = raw.hidden === true;
    if (raw.kind === CHANNELS) {
      if (hasChannels) continue;
      hasChannels = true;
      items.push({ id, kind: CHANNELS, params: sanitizeChannelParams(raw.params), hidden });
      continue;
    }
    if (raw.kind === LEVELS) {
      if (hasLevels) continue;
      hasLevels = true;
      items.push({ id, kind: LEVELS, params: sanitizeLevelParams(raw.params), hidden });
      continue;
    }
    if (raw.kind === VOLUME_PROFILE) {
      if (hasVolumeProfile) continue;
      hasVolumeProfile = true;
      items.push({ id, kind: VOLUME_PROFILE, params: sanitizeVolumeProfileParams(raw.params), hidden });
      continue;
    }
    if (descriptors === null) {
      // Registry not known yet: keep the entry as it is; checked again once /meta answers.
      const params = {};
      Object.entries(raw.params || {}).forEach(([k, v]) => {
        if (typeof v === 'string' && CHOICE_VALUE_RE.test(v) && !Number.isFinite(Number(v))) { params[k] = v; return; }
        const n = Number(v);
        if (Number.isFinite(n)) params[k] = n;
      });
      const color = typeof raw.color === 'string' && raw.color ? raw.color : nextColor(items);
      items.push({ id, kind: raw.kind, params, color, hidden });
      continue;
    }
    const d = byName.get(raw.kind);
    if (!d) { dropped.push(`${raw.kind}${raw.params?.n != null ? `(${raw.params.n})` : ''} (no longer in the indicator registry)`); continue; }
    const params = {};
    for (const p of d.params || []) {
      const v = raw.params?.[p.name];
      params[p.name] = paramError(p, v) === null ? Number(v) : p.defaultValue;
    }
    for (const p of normalizeChoiceParams(d.choiceParams)) params[p.name] = choiceValueOf(p, raw.params?.[p.name]);
    const color = typeof raw.color === 'string' && raw.color ? raw.color : nextColor(items);
    items.push({ id, kind: d.name, params, color, hidden });
  }
  return { items, dropped };
};
