// src/components/screening/screeningFormat.js
//
// Parameter sensitivity screening + parameter profiles (screener BA-021,
// TASK_param_sensitivity_profile.md, architect.md rev 3 §1.2 / §5 / §7 / §8).
// Shared helpers of ScreeningSettings, SensitivityView / SensitivityTable / ParamCurveCanvas /
// TopSamplesTable, ProfileBanner, StrategyConfig chips, StabilitySettings badge and App.jsx:
// the per-TF sample plan and run-time estimate, the request block, the profile key (same rule as
// the backend StrategyKeys), lattice level counts (same formula as ParamVO.gridValues), the
// search-space <-> form mapping (Apply changes min / max / step only, Q3) and the provisional
// clean rule (§5.3).

import { isNum } from '../stability/stabilityFormat';

// ---- sample plan per timeframe (architect.md §7a.3, ScreeningSettings.defaultsFor) ----------------
// DAY / WEEK / MONTH: adaptive 5000 → 10000; HOUR: adaptive 2000 → 5000 (batch 500); MIN5: FIXED 500
// (owner, fix round 3; backend ScreeningSettings.defaultPlanFor). MIN5 is below RECOMMENDED_N, so it
// carries the under-sampling warning by default.
// A grid ≤ nMax of the effective plan is enumerated in full.
// msPerRun: per-run time on the root fit half, labelled "rough" in the UI. DAY 11 ms and HOUR 50 ms
// and MIN5 ≈ 1900 ms are measured warm values (Backend Tester; MIN5 500 samples ≈ 16 min, so the
// long-run notice shows). WEEK / MONTH are scaled from DAY by the bar ratio: WEEK ≈ DAY / 5
// (5 sessions a week), MONTH ≈ DAY / 21 (21 sessions a month, rounded up to 1 ms).
export const SAMPLE_PLANS = Object.freeze({
  MIN5: { mode: 'FIXED', nMin: 500, nMax: 500, batch: null, msPerRun: 1900 },
  HOUR: { mode: 'AUTO', nMin: 2000, nMax: 5000, batch: 500, msPerRun: 50 },
  DAY: { mode: 'AUTO', nMin: 5000, nMax: 10000, batch: 500, msPerRun: 11 },
  WEEK: { mode: 'AUTO', nMin: 5000, nMax: 10000, batch: 500, msPerRun: 2.2 },
  MONTH: { mode: 'AUTO', nMin: 5000, nMax: 10000, batch: 500, msPerRun: 1 },
});

/** Recommended sample size (§7a.3): below it the "below the recommended sample size" warning shows. */
export const RECOMMENDED_N = 2000;
export const TARGET_PER_LEVEL = 30;
export const LONG_RUN_MS = 10 * 60 * 1000;

export const samplePlanFor = (tf) => SAMPLE_PLANS[tf] || SAMPLE_PLANS.DAY;

// Backend validation bounds (ScreeningValidation, architect.md §4.1)
export const SAMPLE_COUNT_RANGE = [20, 20000];
export const MAX_SAMPLES_RANGE = [500, 20000];
export const MIN_TRADES_RANGE = [0, 1000];

export const DEFAULT_SCREENING_OBJECTIVE = 'CALMAR';

/** Form state of the screening settings. planMode 'DEFAULT' = the TF's plan (sampleCount null). */
export const defaultScreeningSettings = () => ({
  planMode: 'DEFAULT', // 'DEFAULT' | 'FIXED'
  sampleCount: 1000,   // FIXED n
  maxSamples: '',      // '' = the plan's nMax (AUTO cap override)
  seed: 42,
  minTrades: 10,
  objective: DEFAULT_SCREENING_OBJECTIVE,
});

/** Restores the settings from the job's request echo (OptimizationJobDTO.screening). */
export const screeningSettingsFromRequest = (req, prev = defaultScreeningSettings()) => {
  if (!req) return prev;
  const fixed = isNum(req.sampleCount);
  return {
    ...prev,
    planMode: fixed ? 'FIXED' : 'DEFAULT',
    sampleCount: fixed ? req.sampleCount : prev.sampleCount,
    maxSamples: isNum(req.maxSamples) ? req.maxSamples : '',
    seed: isNum(req.seed) ? req.seed : prev.seed,
    minTrades: isNum(req.minTrades) ? req.minTrades : prev.minTrades,
    objective: req.objective || prev.objective,
  };
};

/** Client-side check before a screening run (the backend answers 400 with its own text). */
export const screeningValidationError = (s) => {
  const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
  if (s.planMode === 'FIXED' && !inRange(Number(s.sampleCount), SAMPLE_COUNT_RANGE)) {
    return `Samples must be an integer ${SAMPLE_COUNT_RANGE[0]}..${SAMPLE_COUNT_RANGE[1]}`;
  }
  if (s.planMode !== 'FIXED' && s.maxSamples !== '' && s.maxSamples !== null
    && !inRange(Number(s.maxSamples), MAX_SAMPLES_RANGE)) {
    return `Max samples must be an integer ${MAX_SAMPLES_RANGE[0]}..${MAX_SAMPLES_RANGE[1]}`;
  }
  if (!inRange(Number(s.minTrades), MIN_TRADES_RANGE)) {
    return `Min trades must be an integer ${MIN_TRADES_RANGE[0]}..${MIN_TRADES_RANGE[1]}`;
  }
  if (!Number.isSafeInteger(Number(s.seed))) return 'Seed must be an integer';
  return null;
};

/**
 * POST /screening-jobs body (ScreeningRequestDTO, architect.md §4.1). `config` is the
 * StrategiesConfigDTO (formatStrategyConfig, without objectiveFunction / channelStability: the
 * screening objective is the top-level field). `channels` null = strategy TF + detector defaults.
 */
export const screeningRequest = (config, channels, s) => {
  const req = {
    config,
    objective: s.objective || DEFAULT_SCREENING_OBJECTIVE,
    seed: Number(s.seed),
    minTrades: Number(s.minTrades),
  };
  if (channels) req.channels = channels;
  if (s.planMode === 'FIXED') req.sampleCount = Number(s.sampleCount);
  else if (s.maxSamples !== '' && s.maxSamples !== null && s.maxSamples !== undefined) req.maxSamples = Number(s.maxSamples);
  return req;
};

/** The effective plan of a settings object on timeframe tf: {mode, nMin, nMax, batch}. */
export const effectivePlan = (s, tf) => {
  const plan = samplePlanFor(tf);
  if (s.planMode === 'FIXED') {
    const n = Number(s.sampleCount);
    return { mode: 'FIXED', nMin: n, nMax: n, batch: null };
  }
  if (plan.mode === 'FIXED') return { ...plan };
  const cap = s.maxSamples !== '' && s.maxSamples !== null && s.maxSamples !== undefined ? Number(s.maxSamples) : plan.nMax;
  return { mode: 'AUTO', nMin: Math.min(plan.nMin, cap), nMax: cap, batch: plan.batch };
};

// ---- lattice ----------------------------------------------------------------------------------------

/** Number of lattice levels of a range: ParamVO.gridValues() (round((max-min)/step) + 1; 1 if not tunable). */
export const levelCount = (min, max, step) => {
  const lo = Number(min);
  const hi = Number(max);
  const st = Number(step);
  if (!(st > 0) || !(hi - lo > 1e-9)) return 1;
  return Math.round((hi - lo) / st) + 1;
};

/** Lattice values of a range (index-based, no fp drift). */
export const latticeValues = (min, max, step) => {
  const n = levelCount(min, max, step);
  if (n === 1) return [Number(min)];
  return Array.from({ length: n }, (_, i) => Number((Number(min) + i * Number(step)).toFixed(10)));
};

/** Grid size of the form's ranges (saturating at MAX_SAFE_INTEGER). */
export const formGridSize = (selectedStrategies) => {
  let g = 1;
  Object.values(selectedStrategies || {}).forEach((params) => {
    Object.values(params || {}).forEach((p) => {
      g *= levelCount(p.min ?? -1, p.max ?? 50, p.step ?? 1);
      if (g > Number.MAX_SAFE_INTEGER) g = Number.MAX_SAFE_INTEGER;
    });
  });
  return g;
};

/** Tunable params of the form (count). */
export const tunableCount = (selectedStrategies) => {
  let n = 0;
  Object.values(selectedStrategies || {}).forEach((params) => {
    Object.values(params || {}).forEach((p) => { if (levelCount(p.min ?? -1, p.max ?? 50, p.step ?? 1) > 1) n += 1; });
  });
  return n;
};

/**
 * Pre-run estimate (§7, "rough"): {samplesLo, samplesHi, msLo, msHi, fullGrid}. A grid not larger
 * than nMax is enumerated in full (E8).
 */
export const runEstimate = (s, tf, grid) => {
  const plan = effectivePlan(s, tf);
  const ms = samplePlanFor(tf).msPerRun;
  const fullGrid = grid <= plan.nMax;
  const lo = fullGrid ? grid : plan.nMin;
  const hi = fullGrid ? grid : plan.nMax;
  return { samplesLo: lo, samplesHi: hi, msLo: lo * ms, msHi: hi * ms, msPerRun: ms, fullGrid, plan };
};

/** The amber "below the recommended sample size" warning applies (§7, §7a.3): MIN5's default
 * FIXED 500, or a user-set FIXED n / AUTO cap below RECOMMENDED_N; never on a full-grid run. */
export const isUnderSampled = (s, tf, grid) => {
  const plan = effectivePlan(s, tf);
  if (Number.isFinite(grid) && grid <= plan.nMax) return false; // exact full enumeration
  return plan.nMax < RECOMMENDED_N;
};

/**
 * "batch k of ≤ m" of a running AUTO job (§3a), from its current total and the plan; null when it
 * does not apply (FIXED, full enumeration, or a total that is not on the batch lattice).
 */
export const batchInfo = (total, plan) => {
  if (!plan || plan.mode !== 'AUTO' || !plan.batch || !isNum(total) || total < plan.nMin) return null;
  const m = 1 + Math.ceil((plan.nMax - plan.nMin) / plan.batch);
  if (total === plan.nMin) return { k: 1, m };
  const extra = total - plan.nMin;
  if (total !== plan.nMax && extra % plan.batch !== 0) return null;
  return { k: 1 + Math.ceil(extra / plan.batch), m };
};

// ---- profile key + form mapping ---------------------------------------------------------------------

/** Simple class name of a form strategy (params carry strategyClass; the map key is the class name). */
export const strategyClassOf = (name, params) => {
  const first = Object.values(params || {})[0];
  return (first && first.strategyClass) || name;
};

/** Canonical key: simple class names, sorted, joined by '+' (backend StrategyKeys.canonicalKey). */
export const profileKey = (selectedStrategies) =>
  Object.entries(selectedStrategies || {})
    .map(([name, params]) => strategyClassOf(name, params))
    .sort()
    .join('+');

const entryKey = (strategyClass, paramName) => `${strategyClass}.${paramName}`;

/** searchSpace entries indexed by "Class.param". */
export const indexSearchSpace = (searchSpace) => {
  const map = {};
  (searchSpace || []).forEach((e) => { if (e) map[entryKey(e.strategyClass, e.paramName)] = e; });
  return map;
};

/** The range an entry puts into the form: frozen → min = max = value. */
export const entryRange = (e, current = {}) => {
  if (e.frozen) {
    const v = isNum(e.value) ? e.value : e.min;
    return { min: v, max: v, step: isNum(e.step) && e.step > 0 ? e.step : (current.step ?? 1) };
  }
  return { min: e.min, max: e.max, step: e.step };
};

/**
 * Applies a search space to the form (Q3): only min / max / step change, `value` fields are
 * untouched. Returns {next, missing}: missing = form params the search space does not cover (they
 * keep their current range, E9).
 */
export const searchSpaceToForm = (selectedStrategies, searchSpace) => {
  const idx = indexSearchSpace(searchSpace);
  const next = {};
  const missing = [];
  Object.entries(selectedStrategies || {}).forEach(([name, params]) => {
    const cls = strategyClassOf(name, params);
    next[name] = {};
    Object.entries(params || {}).forEach(([paramName, p]) => {
      const e = idx[entryKey(cls, paramName)];
      if (!e) {
        missing.push(`${name}.${paramName}`);
        next[name][paramName] = { ...p };
      } else {
        next[name][paramName] = { ...p, ...entryRange(e, p) };
      }
    });
  });
  return { next, missing };
};

const sameNum = (a, b) => isNum(Number(a)) && isNum(Number(b)) && Math.abs(Number(a) - Number(b)) < 1e-6;

/**
 * Per-param chips of the form (§8.4): {strategyName: {paramName: {frozen, verdict, eta2, flags}}} for
 * the params whose current range still equals the applied profile's.
 */
export const profileChips = (selectedStrategies, searchSpace) => {
  const idx = indexSearchSpace(searchSpace);
  const out = {};
  Object.entries(selectedStrategies || {}).forEach(([name, params]) => {
    const cls = strategyClassOf(name, params);
    Object.entries(params || {}).forEach(([paramName, p]) => {
      const e = idx[entryKey(cls, paramName)];
      if (!e || e.added) return; // a param added after the screening has no verdict
      const r = entryRange(e, p);
      if (!sameNum(p.min, r.min) || !sameNum(p.max, r.max) || (!e.frozen && !sameNum(p.step, r.step))) return;
      if (!out[name]) out[name] = {};
      out[name][paramName] = { frozen: !!e.frozen, verdict: e.verdict, eta2: e.eta2, flags: e.flags || [] };
    });
  });
  return out;
};

/** true when every range of the form still equals the search space (no edit after Apply). */
export const formMatchesSearchSpace = (selectedStrategies, searchSpace) => {
  const { next } = searchSpaceToForm(selectedStrategies, searchSpace);
  return Object.entries(selectedStrategies || {}).every(([name, params]) =>
    Object.entries(params || {}).every(([paramName, p]) => {
      const q = next[name][paramName];
      return sameNum(p.min, q.min) && sameNum(p.max, q.max) && sameNum(p.step, q.step);
    }));
};

/** Default min / max / step of the form's params from available-strategies ("Revert to defaults"). */
export const withDefaultRanges = (selectedStrategies, availableStrategies) => {
  const byName = Object.fromEntries((availableStrategies || []).map((s) => [s.name, s]));
  const next = {};
  Object.entries(selectedStrategies || {}).forEach(([name, params]) => {
    const defs = Object.fromEntries((byName[name]?.parameters || []).map((p) => [p.paramName, p]));
    next[name] = {};
    Object.entries(params || {}).forEach(([paramName, p]) => {
      const d = defs[paramName];
      next[name][paramName] = d ? { ...p, min: d.min, max: d.max, step: d.step } : { ...p };
    });
  });
  return next;
};

// ---- provisional clean rule (§5.3) ------------------------------------------------------------------

const day = (v) => (v ? String(v).substring(0, 10) : null);

/**
 * Provisional clean badge of the stability section: 'expected' when the form's startDate, tradeStart
 * and channel TF equal the profile's provenance and endDate ≥ the profile's endDate; otherwise
 * 'after-detection'. Dates are 'YYYY-MM-DD' strings (form) and ISO strings (profile).
 */
export const provisionalClean = ({ startDay, endDay, tradeStartDay, channelTimeFrame }, period) => {
  if (!period) return 'after-detection';
  const sameStart = day(period.startDate) === startDay;
  const sameTrade = (day(period.tradeStart) || startDay) === (tradeStartDay || startDay);
  const sameTf = !period.channelTimeFrame || period.channelTimeFrame === channelTimeFrame;
  const laterEnd = !!endDay && !!day(period.endDate) && endDay >= day(period.endDate);
  return sameStart && sameTrade && sameTf && laterEnd ? 'expected' : 'after-detection';
};

// ---- profile provenance ---------------------------------------------------------------------------

/**
 * Provenance of a ParamProfileDTO (backend ParamProfileDTO.Provenance: period, objective, minTrades,
 * sampleMode AUTO | FIXED, sampleCount = samples evaluated, seed, fullEnumeration, valid / invalid,
 * longOnly, gridBefore / gridAfter, msPerRun, fixedParams). samplesPlanned is only in the stored
 * result payload (for the partial badge).
 */
export const profileProvenance = (profile) => {
  const prov = profile?.provenance || {};
  return {
    ...prov,
    period: prov.period || {},
    sampleMode: prov.fullEnumeration ? 'full grid' : prov.sampleMode,
    samplesPlanned: profile?.result?.samplesPlanned,
  };
};

// ---- formatting -------------------------------------------------------------------------------------

export const SCREENING_VERDICT_STYLE = {
  SENSITIVE: 'bg-blue-100 text-blue-800 border-blue-300',
  INSENSITIVE: 'bg-gray-100 text-gray-700 border-gray-300',
  INCONCLUSIVE: 'bg-amber-50 text-amber-800 border-amber-300',
};

export const FLAG_LABELS = {
  NON_CONTIGUOUS: 'non-contiguous good region',
  NO_ENRICHED_LEVEL: 'no enriched level',
  WITHIN_NOISE: 'frozen — insensitive; value chosen within noise',
  EDITED: 'edited',
};

export const flagLabel = (f) => FLAG_LABELS[f] || String(f).toLowerCase().replace(/_/g, ' ');

/** η² as 0.112; null → n/a. */
export const fmtEta = (v) => (isNum(v) ? v.toFixed(3) : 'n/a');

/** "0.112 [0.071, 0.160]" */
export const fmtEtaCi = (p) => `${fmtEta(p?.eta2)} [${fmtEta(p?.ciLo)}, ${fmtEta(p?.ciHi)}]`;

/** Large integer with separators; Long.MAX_VALUE-ish → "> 9.2e18". */
export const fmtGrid = (v) => {
  if (!isNum(v)) return 'n/a';
  if (v >= 9.2e18 || v >= Number.MAX_SAFE_INTEGER) return '> 9.2e18';
  return Math.round(v).toLocaleString('en-US');
};

/** A lattice value; 0 of an "off at zero" param → "off". */
export const fmtLevel = (v, offAtZero = false) => {
  if (!isNum(v)) return String(v ?? 'n/a');
  if (offAtZero && v === 0) return 'off';
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
};

/** Duration: "45 s", "2 min 5 s", "1 h 3 min". */
export const fmtDuration = (ms) => {
  if (!isNum(ms) || ms < 0) return 'n/a';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

/** "≈ 25–63 min" style range of two durations. */
export const fmtDurationRange = (lo, hi) => {
  if (Math.abs(hi - lo) < 1000) return `≈ ${fmtDuration(hi)}`;
  if (hi >= 60000 && lo >= 60000 && hi < 3600000) return `≈ ${Math.round(lo / 60000)}–${Math.round(hi / 60000)} min`;
  return `≈ ${fmtDuration(lo)} – ${fmtDuration(hi)}`;
};

/** Per-run time: "25 ms", "0.75 s". */
export const fmtMsPerRun = (ms) => {
  if (!isNum(ms)) return 'n/a';
  return ms < 1000 ? `${Number(ms.toFixed(1))} ms` : `${Number((ms / 1000).toFixed(2))} s`;
};

/** Plan caption: "AUTO 2000 → 5000" / "FIXED 500". */
export const fmtPlan = (plan) => {
  if (!plan) return 'n/a';
  if (plan.mode === 'FIXED') return `FIXED ${plan.nMin ?? plan.nMax}`;
  return `AUTO ${plan.nMin} → ${plan.nMax}`;
};

/** Search-space entries of params the strategy gained after the screening (reconcile E9). */
export const addedParams = (searchSpace) =>
  (searchSpace || []).filter((e) => e && e.added).map((e) => e.paramName);

/** Stable key of a result param row. */
export const paramRowKey = (p) => `${p.strategyClass || p.strategyKey}.${p.paramName}`;

/** Max invalid share over a param's levels; null when unknown. */
export const maxInvalidShare = (curve) => {
  let m = null;
  (curve || []).forEach((l) => { if (isNum(l.invalidShare)) m = m === null ? l.invalidShare : Math.max(m, l.invalidShare); });
  return m;
};

/** Percent of a 0..1 share: "4 %". */
export const fmtShare = (v) => (isNum(v) ? `${Math.round(v * 100)} %` : 'n/a');
