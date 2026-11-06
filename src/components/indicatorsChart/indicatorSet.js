// src/components/indicatorsChart/indicatorSet.js
//
// The set of indicators shown on the Indicators Chart (TASK B2 / B4, architect §6.2): pure
// helpers, no React. An item is
//   registry indicator: { id, kind: 'SMA' | 'IBS' | ..., params: { n? }, color, hidden }
//   channels overlay:   { id, kind: 'CHANNELS', params: { coarserTfs, view, lastActualChannelsOnly, detector }, hidden }
//   levels overlay:     { id, kind: 'LEVELS', params: { minStrength, nearestN }, hidden }
// `color` is a theme token reference ('var(--chart-series-N)', follows a theme switch) or a hex
// the user picked. The set is remembered per viewer in localStorage (try/catch: the tab works the
// same without storage); a kind that is no longer in the registry is dropped on restore with a
// visible notice.

import { paletteColor } from '../charts/workspace/workspaceTheme';
import { RECURSIVE_DEFAULT_PARAMS } from '../channelExplorer/RecursiveParamsPanel';
import { CHANNEL_VIEW } from '../../api/channelApi';
import { clampNearestN } from '../../utils/levelZones';

export const STORAGE_KEY = 'tsf.indicatorsChart.v1';
export const CHANNELS = 'CHANNELS';
export const LEVELS = 'LEVELS';
export const BUILT_IN_KINDS = Object.freeze([CHANNELS, LEVELS]);
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

export const DEFAULT_LEVEL_PARAMS = Object.freeze({ minStrength: 0, nearestN: 2 });

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

/** The registry spec {kind, n} of an item (n null for a parameterless kind). */
export const specOf = (item) => ({
  kind: item.kind,
  n: item.params && item.params.n !== undefined && item.params.n !== null ? Number(item.params.n) : null,
});

/** 'SMA(50)', 'IBS', 'Channels', 'Levels'. */
export const itemLabel = (item, descriptor) => {
  if (item.kind === CHANNELS) return 'Channels';
  if (item.kind === LEVELS) return 'Levels';
  const name = descriptor?.displayName || item.kind;
  const n = specOf(item).n;
  return n === null ? name : `${name}(${n})`;
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

/** Default params of a registry descriptor: {name: defaultValue}. */
export const defaultParams = (descriptor) => Object.fromEntries(
  (descriptor?.params || []).map((p) => [p.name, p.defaultValue]),
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

export const sanitizeLevelParams = (p) => {
  const s = Number(p?.minStrength);
  return {
    minStrength: Number.isFinite(s) && s >= 0 ? s : DEFAULT_LEVEL_PARAMS.minStrength,
    nearestN: clampNearestN(p?.nearestN ?? DEFAULT_LEVEL_PARAMS.nearestN),
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
 * a malformed entry, or a second Channels / Levels item. Registry params outside the
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
    if (descriptors === null) {
      // Registry not known yet: keep the entry as it is; checked again once /meta answers.
      const params = {};
      Object.entries(raw.params || {}).forEach(([k, v]) => {
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
    const color = typeof raw.color === 'string' && raw.color ? raw.color : nextColor(items);
    items.push({ id, kind: d.name, params, color, hidden });
  }
  return { items, dropped };
};
