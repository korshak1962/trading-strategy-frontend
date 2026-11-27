// src/utils/displayLabels.js
//
// Constructor editor UX Stage B, sub-step B2 (screener logs/agents/architect.md §2, §5): the JS
// mirror of the backend's plain-English DISPLAY texts (`serviceImpl/condition/DisplayLabels` +
// the caption words of `EditorHelpTexts`): `R2 Sell: close is below the entry's stop`.
//
// The CODE captions (`ruleCaption`, `ruleConditionCaption`, `conditionCaption`, `levelsLegendLines`
// in constructedFormat.js / conditionFormat.js) are not touched: they stay the machine text and are
// shown in the ⓘ beside a display text. Both grammars are checked against one shared fixture
// (`src/test/fixtures/display_labels/display_labels.json`, a byte-identical copy of the backend's),
// so a drift fails `displayLabels.test.js` and the backend's `DisplayLabelsFixtureTest`.
//
// Modes (the timeframe word, owner Q1):
//   {kind: 'editor'}          - no run known: RUN unworded, a fixed DAY / WEEK operand worded `(day)`;
//   {kind: 'run', runTf}      - a fixed operand worded only when its TF differs from the run's;
//   {kind: 'screener'}        - every operand worded (`close (day)`).
// A kind this version does not know shows its code caption + " (not in this version)", never empty.

import {
  applyLinks, pruneLinks, linkValue, isLevelEvent, isWithin, LEVEL_FIELDS, LEVELS_DEFAULTS, rearmOf,
  ANCHORED_KINDS, POSITION_WINDOW_KINDS, LEVEL_KIND, RUN_TF,
} from '../api/constructedApi';
import { FIELD_KINDS, CONST_KIND, descriptorOf } from '../api/indicatorCatalog';
import { LEVELS_PARAM_TEXTS } from '../api/editorTexts';
import { levelsSpecsOf, levelsSpecOf, anyOperandCaption, anyConditionCaption } from '../components/strategyConstructor/constructedFormat';

/** The Unicode minus of display numbers. */
export const MINUS = '−';

export const EDITOR_MODE = Object.freeze({ kind: 'editor' });
export const SCREENER_MODE = Object.freeze({ kind: 'screener' });
/** The run mode of a run timeframe. */
export const runMode = (runTf) => ({ kind: 'run', runTf });

const NOT_IN_VERSION = ' (not in this version)';

// ---- words (EditorHelpTexts caption methods; keep in sync, the shared fixture checks) ----

const INDICATOR_WORDS = Object.freeze({
  SMA: 'SMA {n}',
  SMA_TILT: 'SMA {n} slope',
  RSI: 'RSI {n}',
  ATR: 'ATR {n}',
  ATR_PCT: 'ATR % {n}',
  ER: 'efficiency ratio {n}',
  IBS: 'IBS',
  CORR: 'correlation {n} with {b}',
});

const KAIRI_WORDS = Object.freeze({
  PCT: 'distance from SMA {n} (%)',
  RATIO: 'close ÷ SMA {n}',
  ATR: 'distance from SMA {n} (ATR)',
});

const OP_WORDS = Object.freeze({ GT: 'is above', GTE: 'is at or above', LT: 'is below', LTE: 'is at or below' });

const SIGNAL_WORDS = Object.freeze({
  LongOpen: 'Buy', LongClose: 'Sell', LongBlock: 'Block long entry', ShortOpen: 'Open short', ShortClose: 'Cover short',
});

const EVENT_WORDS = Object.freeze({
  BREAKOUT_UP: 'Breakout above a zone',
  CONFIRMED_RETEST: 'Breakout confirmed by a retest',
  CONFIRMED_RUNAWAY: 'Breakout confirmed by a runaway',
  CONFIRMED_BASE: 'Breakout confirmed by a base',
  CONFIRMED_ANY: 'Breakout confirmed (any way)',
  FAILED: 'Breakout failed',
  SUPPORT_BREAK: 'Support broken (strength ≥ {s})',
  RESISTANCE_REACHED: 'Resistance reached (strength ≥ {s})',
  BROKEN_DOWN: 'Confirmed zone broken down',
});

const EVENT_NOUNS = Object.freeze({
  BREAKOUT_UP: 'breakout',
  CONFIRMED_RETEST: 'retest-confirmed breakout',
  CONFIRMED_RUNAWAY: 'runaway breakout',
  CONFIRMED_BASE: 'base breakout',
  CONFIRMED_ANY: 'confirmed breakout',
  FAILED: 'failed breakout',
  SUPPORT_BREAK: 'support break (strength ≥ {s})',
  RESISTANCE_REACHED: 'resistance touch (strength ≥ {s})',
  BROKEN_DOWN: 'zone break-down',
});

const OUTPUT_WORDS = Object.freeze({
  IN_ZONE: 'inside a zone',
  SETUP_STOP: 'the setup stop',
  SETUP_ZONE_LINE: 'the setup zone line',
  SUPPORT_LINE: 'the support line',
  DIST_SUPPORT_ATR: 'the distance to support (ATR)',
  DIST_RESISTANCE_ATR: 'the distance to resistance (ATR)',
  OPEN_STOP: 'the stop if bought here',
  OPEN_LINE: 'the support line if bought here',
});

const METRIC_WORDS = Object.freeze({
  POSITION: 'position in channel',
  SLOPE_PCT_YEAR: 'slope (% per year)',
  WIDTH_PCT: 'width (% of price)',
  WIDTH: 'width (price)',
  AGE_BARS: 'age (bars)',
  EXISTS: 'existence (1 = yes)',
  TOUCHES_UPPER: 'touches of the upper line',
  TOUCHES_LOWER: 'touches of the lower line',
});

const CHANNEL_LEVEL_WORDS = Object.freeze({ 0: 'current', 1: 'parent', 2: 'grandparent' });

/** The channel detector defaults the backend compares with (ChannelSpec.DEFAULT). */
const CHANNEL_SPEC_DEFAULT = Object.freeze({ coveragePct: 0.95, minBars: 5, minWidthPct: 0.05, minAgeBars: 0 });

// ---- numbers ----

/** A number of a draft (`''` / null / not a number → null). */
const toNum = (v) => {
  if (v === '' || v == null || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `1e-7` → `0.0000001` (the plain form of BigDecimal.toPlainString). */
const plain = (s) => {
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(s);
  if (!m) return s;
  const [, sign, int, frac = '', expS] = m;
  const exp = Number(expS);
  const digits = int + frac;
  const point = int.length + exp;
  let out;
  if (point <= 0) out = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  out = out.replace(/^0+(?=\d)/, '');
  if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return sign + out;
};

/** `0`, `−0.25`, `1.5`, `0.000001`: trailing zeros trimmed, Unicode minus; `?` when not a number. */
export const num = (v) => {
  const n = toNum(v);
  if (n == null) return '?';
  const s = plain(String(n === 0 ? 0 : n));
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
};

/** A fraction as the editor's percent (`0.95` → `95`), 6 decimals at most. */
const pct = (v) => {
  const n = toNum(v);
  return n == null ? '?' : num(Math.round(n * 100 * 1e6) / 1e6);
};

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** A phrase without its leading article (`the setup stop` → `setup stop`). */
export const bare = (phrase) => (phrase.startsWith('the ') ? phrase.slice(4) : phrase);

// ---- options: mode + Levels set tags ----

const tfWordOf = (tf) => String(tf).toLowerCase();

/** ` (week)` of an operand's TF in the mode, or ''. */
const tfWord = (tf, mode) => {
  if (!tf || tf === RUN_TF) return '';
  if (mode?.kind === 'run' && tf === mode.runTf) return '';
  return ` (${tfWordOf(tf)})`;
};

const specKey = (spec) => JSON.stringify(levelsSpecOf(spec, LEVELS_DEFAULTS));

/**
 * The display options of a strategy's texts: `{mode, tagOf}`, `tagOf(spec)` = ` [Levels set n]`
 * when the rules have 2+ distinct Levels specs (links applied at the axes' values), else ''.
 */
export const displayOpts = (rules, axes = [], mode = EDITOR_MODE) => {
  const specs = levelsSpecsOf(rules || [], axes || [], LEVELS_DEFAULTS);
  if (specs.length < 2) return { mode, tagOf: () => '' };
  return {
    mode,
    tagOf: (spec) => {
      const k = specKey(spec);
      const i = specs.findIndex((x) => x.key === k);
      return i < 0 ? '' : ` [Levels set ${i + 1}]`;
    },
  };
};

const optsOf = (opts) => ({ mode: opts?.mode || EDITOR_MODE, tagOf: opts?.tagOf || (() => '') });

// ---- operands ----

/** `close`; −1 `the previous close`; −n `close n bars ago`. */
const offsetWords = (phrase, offset) => {
  const off = toNum(offset) || 0;
  if (off === 0) return phrase;
  if (off === -1) return `the previous ${phrase}`;
  return `${phrase} ${Math.abs(off)} bars ago`;
};

/** A Levels output's offset: ` of the previous bar` / ` n bars ago`. */
const levelOffset = (offset) => {
  const off = toNum(offset) || 0;
  if (off === 0) return '';
  return off === -1 ? ' of the previous bar' : ` ${Math.abs(off)} bars ago`;
};

/** ` (up to the previous bar)` / ` (up to n bars ago)`; nothing for lag 0. */
const lagWords = (lag) => {
  const l = toNum(lag) || 0;
  if (l === 0) return '';
  return l === 1 ? ' (up to the previous bar)' : ` (up to ${l} bars ago)`;
};

const strengthWords = (pattern, s) => {
  if (!pattern.includes('{s}')) return pattern;
  const v = toNum(s);
  return v == null ? pattern.replace(' (strength ≥ {s})', '') : pattern.replace('{s}', num(v));
};

/** `SMA 50`, `correlation 60 with QQQ`, `distance from SMA 20 (ATR)`; null for a kind no indicator. */
const indicatorWords = (o) => {
  const n = toNum(o.n);
  const nText = n == null ? '?' : String(n);
  let pattern = null;
  if (o.kind === 'KAIRI') {
    const mode = typeof o.mode === 'string' && o.mode ? o.mode : 'PCT';
    pattern = KAIRI_WORDS[mode];
    if (!pattern) return null;
  } else {
    pattern = INDICATOR_WORDS[o.kind] || null;
  }
  if (pattern == null) {
    const d = descriptorOf(o.kind);
    if (!d) return null;
    const name = d.displayName || o.kind;
    return n == null ? name : `${name} ${n}`;
  }
  const benchmark = typeof o.benchmark === 'string' && o.benchmark ? o.benchmark : 'SPY';
  return pattern.replace('{n}', nText).replace('{b}', benchmark);
};

const unknownOperand = (o) => `${anyOperandCaption(o, null)}${NOT_IN_VERSION}`;

/** The phrase of an operand: `close`, `the previous SMA 10 (week)`, `the entry's stop`, … */
export const operandText = (o, opts) => {
  const { mode, tagOf } = optsOf(opts);
  if (!o || !o.kind) return '?';
  const k = o.kind;
  if (FIELD_KINDS.includes(k)) return offsetWords(k.toLowerCase(), o.offset) + tfWord(o.tf, mode);
  if (k === CONST_KIND) return num(o.value);
  if (k === LEVEL_KIND) {
    const w = OUTPUT_WORDS[o.output];
    return w ? w + levelOffset(o.offset) + tagOf(o.levels) : unknownOperand(o);
  }
  if (k === 'AT_LAST') return `${operandText(o.x, opts)} at ${anchorText(o.a, opts)}`;
  if (ANCHORED_KINDS.includes(k)) {
    const word = k === 'MAX_SINCE' ? 'highest' : 'lowest';
    return `the ${word} ${bare(operandText(o.x, opts))} since ${anchorText(o.a, opts)}${lagWords(o.lag)}`;
  }
  if (k === 'BARS_SINCE') return `bars since ${anchorText(o.a, opts)}`;
  if (k === 'AT_ENTRY') {
    const x = o.x;
    if (x?.kind === LEVEL_KIND && (toNum(x.offset) || 0) === 0) {
      if (x.output === 'OPEN_STOP') return `the entry's stop${tagOf(x.levels)}`;
      if (x.output === 'OPEN_LINE') return `the entry's support line${tagOf(x.levels)}`;
    }
    return `${operandText(x, opts)} at entry`;
  }
  if (POSITION_WINDOW_KINDS.includes(k)) {
    const word = k === 'MAX_SINCE_ENTRY' ? 'highest' : 'lowest';
    return `the ${word} ${bare(operandText(o.x, opts))} since entry${lagWords(o.lag)}`;
  }
  if (k === 'STICKY_SINCE_ENTRY') return `the entry's sticky support${tagOf(o.levels)}`;
  const ind = indicatorWords(o);
  return ind == null ? unknownOperand(o) : offsetWords(ind, o.offset) + tfWord(o.tf, mode);
};

/** `the last confirmed breakout` / `the last time “close is above SMA 50”`. */
const anchorText = (a, opts) => {
  const { tagOf } = optsOf(opts);
  if (isLevelEvent(a)) {
    const noun = EVENT_NOUNS[a.event];
    if (!noun) return `the last ${anyConditionCaption(a, null, { bare: true })}${NOT_IN_VERSION}`;
    return `the last ${strengthWords(noun, a.strength)}${tagOf(a.levels)}`;
  }
  return `the last time “${conditionText(a, opts)}”`;
};

// ---- conditions ----

/** `a long is open`: exactly `AT_ENTRY(any X) > 0`, tolerance 0 (owner Q2). */
export const isLongFlag = (c) => c?.left?.kind === 'AT_ENTRY' && c.op === 'GT' && c.right?.kind === CONST_KIND
  && toNum(c.right.value) === 0 && (toNum(c.tolerancePct) || 0) === 0;

const compareText = (c, opts) => {
  if (isLongFlag(c)) return 'a long is open';
  let right = operandText(c.right, opts);
  const tol = toNum(c.tolerancePct) || 0;
  if (tol !== 0) right = `${num(100 + tol)} % of ${right}`;
  return `${operandText(c.left, opts)} ${OP_WORDS[c.op] || c.op || '?'} ${right}`;
};

/** ` (coverage 90 %, min age 30 bars)`: the detector fields that differ from the default. */
const detectorText = (s) => {
  if (!s || typeof s !== 'object') return '';
  const d = CHANNEL_SPEC_DEFAULT;
  const parts = [];
  const differs = (k) => toNum(s[k]) != null && toNum(s[k]) !== d[k];
  if (differs('coveragePct')) parts.push(`coverage ${pct(s.coveragePct)} %`);
  if (differs('minBars')) parts.push(`min length ${toNum(s.minBars)} bars`);
  if (differs('minWidthPct')) parts.push(`min width ${pct(s.minWidthPct)} %`);
  if (differs('minAgeBars')) parts.push(`min age ${toNum(s.minAgeBars)} bars`);
  return parts.length ? ` (${parts.join(', ')})` : '';
};

const channelText = (c, opts) => {
  const { mode } = optsOf(opts);
  let out = '';
  if (c.tf && c.tf !== RUN_TF && !(mode.kind === 'run' && c.tf === mode.runTf)) out += `${tfWordOf(c.tf)} `;
  const level = toNum(c.level) ?? 0;
  out += `${CHANNEL_LEVEL_WORDS[level] || `depth ${level}`} channel`;
  const min = toNum(c.min);
  const max = toNum(c.max);
  if (c.metric === 'EXISTS' && min === 0 && max === 0) out += ' does not exist';
  else if (c.metric === 'EXISTS' && min != null && min >= 1 && (max == null || max >= 1)) out += ' exists';
  else {
    out += `: ${METRIC_WORDS[c.metric] || `${c.metric}${NOT_IN_VERSION}`}`;
    if (min != null && max != null) out += ` is between ${num(min)} and ${num(max)}`;
    else if (min != null) out += ` is at least ${num(min)}`;
    else if (max != null) out += ` is at most ${num(max)}`;
  }
  return out + detectorText(c.channel);
};

const eventText = (c, opts, first) => {
  const { tagOf } = optsOf(opts);
  const w = EVENT_WORDS[c.event];
  const s = w ? strengthWords(w, c.strength) + tagOf(c.levels)
    : `${anyConditionCaption(c, null)}${NOT_IN_VERSION}`;
  return first ? s : lowerFirst(s);
};

/**
 * The sentence of a condition; `first` false lower-cases a leading Levels event
 * (`… and breakout confirmed (any way)`).
 */
export const conditionText = (c, opts, first = true) => {
  if (!c) return '?';
  if (c.type === 'COMPARE') return compareText(c, opts);
  if (isLevelEvent(c)) return eventText(c, opts, first);
  if (isWithin(c)) {
    const bars = toNum(c.bars);
    return `${conditionText(c.of, opts, first)} within the last ${bars === 1 ? 'bar' : `${bars == null ? '?' : bars} bars`}`;
  }
  if (c.type === 'CHANNEL_METRIC') return channelText(c, opts);
  return `${anyConditionCaption(c, null)}${NOT_IN_VERSION}`;
};

/** A screener filter condition (every operand worded). */
export const screenerConditionText = (c) => conditionText(c, { mode: SCREENER_MODE });

// ---- rules ----

/** `R2 Sell` (`R(new) Buy` for an unsaved rule). */
export const ruleHead = (rule) => `${rule?.id != null ? `R${rule.id}` : 'R(new)'} ${SIGNAL_WORDS[rule?.signalType] || rule?.signalType || '?'}`;

/** The signal word of a type (`LongClose` → `Sell`); the type itself when unknown. */
export const signalWord = (type) => SIGNAL_WORDS[type] || type;

const appliedOf = (rc, axes) => applyLinks(rc?.condition, pruneLinks(rc?.condition, rc?.links), axes);

/** A Levels-field link path (`levels.x`, `right.a.levels.x`): never shown in a rule text (Q3). */
const isLevelsField = (suffix) => suffix.startsWith('levels.') || suffix.includes('.levels.');

/** The order the backend compiles a condition's thresholds in (ConstructedThresholds.compile). */
const NOTE_ORDER = ['tolerancePct', 'left.n', 'right.n', 'right.const', 'min', 'max'];

/** `Gap = 2`, `−Gap = −2`, `Fast + Spread = 30` (no `$`). */
const displayNote = (terms, axes) => {
  const expr = terms.map((t, i) => {
    const name = String(t.axis).replace(/\$/g, '');
    if (i === 0) return `${t.sign < 0 ? MINUS : ''}${name}`;
    return `${t.sign < 0 ? ` ${MINUS} ` : ' + '}${name}`;
  }).join('');
  return `${expr} = ${num(linkValue(terms, axes))}`;
};

/** The non-Levels link notes of a rule condition, in the backend's order. */
const otherNotes = (rc, axes) => {
  const links = pruneLinks(rc?.condition, rc?.links);
  const live = Object.keys(links).filter((s) => !isLevelsField(s));
  const ordered = [...NOTE_ORDER.filter((s) => live.includes(s)), ...live.filter((s) => !NOTE_ORDER.includes(s))];
  return ordered.map((s) => displayNote(links[s], axes));
};

/** The sentence of one rule condition `{condition, links}` at the axes' values (no link notes). */
export const ruleConditionText = (rc, axes, opts, first = true) => conditionText(appliedOf(rc, axes), opts, first);

/** `c1 and c2` (no head, no links). */
const sentences = (rule, axes, opts) => (rule?.conditions || [])
  .map((rc, i) => ruleConditionText(rc, axes, opts, i === 0)).join(' and ');

/** `R2 Sell: close is below the entry's stop` (no link notes). */
export const ruleSentence = (rule, axes, opts) => {
  const body = sentences(rule, axes, opts);
  return `${ruleHead(rule)}: ${body || '(no conditions)'}`;
};

/**
 * The rule body without its head, each condition followed by its non-Levels link notes
 * (`(RegimeLength = 50)`, de-duplicated within the rule; Levels-field links never, owner Q3).
 */
export const ruleBodyText = (rule, axes, opts) => {
  const seen = new Set();
  return (rule?.conditions || []).map((rc, i) => {
    const s = ruleConditionText(rc, axes, opts, i === 0);
    const parts = otherNotes(rc, axes).filter((p) => p && !seen.has(p) && seen.add(p));
    return parts.length ? `${s} (${parts.join(', ')})` : s;
  }).join(' and ');
};

/** The editor caption of a rule: `R1 Buy: close is above SMA 50 (RegimeLength = 50)`. */
export const ruleText = (rule, axes, opts) => {
  const body = ruleBodyText(rule, axes, opts);
  return `${ruleHead(rule)}: ${body || '(no conditions)'}`;
};

// ---- Levels legend ----

const levelsLabel = (f) => LEVELS_PARAM_TEXTS[f]?.label || f;

/** The changed fields (or `default settings`), then re-arm and take-profit. */
const specSummary = (spec) => {
  const d = LEVELS_DEFAULTS;
  const parts = LEVEL_FIELDS.filter((f) => f !== 'takeProfitStrength')
    .filter((f) => toNum(spec?.[f]) != null && toNum(spec[f]) !== Number(d[f]))
    .map((f) => `${levelsLabel(f)} ${num(spec[f])}`);
  if (!parts.length) parts.push('default settings');
  if (rearmOf(spec, d.rearm)) {
    parts.push('re-arm');
    const tp = toNum(spec?.takeProfitStrength) || 0;
    if (tp > 0) parts.push(`take-profit ${num(tp)}`);
  } else {
    parts.push('no re-arm');
  }
  return parts.join(' · ');
};

/** `BaseMinBars = 5` per axis read by a linked Levels field, in axis order (owner Q3). */
const levelsAxisNotes = (rules, axes) => {
  const used = new Set();
  (rules || []).forEach((r) => (r.conditions || []).forEach((rc) => {
    Object.entries(pruneLinks(rc?.condition, rc?.links)).forEach(([suffix, terms]) => {
      if (isLevelsField(suffix)) terms.forEach((t) => used.add(t.axis));
    });
  }));
  return (axes || []).filter((a) => used.has(a.name)).map((a) => `${String(a.name).replace(/\$/g, '')} = ${num(a.value)}`);
};

/**
 * The Levels legend: one line per distinct spec (`Levels: default settings · re-arm · take-profit 4`,
 * `Levels set 2: Min zone strength 2 · Stop buffer, ATR 0.25 · no re-arm`), then once
 * `Levels axes: BaseMinBars = 5 · …` when Levels fields are linked. Empty without Levels.
 */
export const levelsLegendText = (rules, axes = []) => {
  const specs = levelsSpecsOf(rules || [], axes || [], LEVELS_DEFAULTS);
  if (!specs.length) return [];
  const out = specs.map((x, i) => `${specs.length < 2 ? 'Levels' : `Levels set ${i + 1}`}: ${specSummary(x.spec)}`);
  const notes = levelsAxisNotes(rules, axes);
  if (notes.length) out.push(`Levels axes: ${notes.join(' · ')}`);
  return out;
};
