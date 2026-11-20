// KAIRI (Kairi Relative Index, screener logs/agents/architect.md v2 + v1 appendix §6.2 / §8.4): the
// form `mode` is a choice param like CORR's benchmark, left out of the JSON at its default (PCT);
// the form sets the unit, the chart pane and the neutral line.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  setIndicatorCatalog, normalizeChoiceParams, effectiveDescriptor, operandUnitOf, unitsOfKind, modeParamOf,
  defaultModeOf, descriptorOf, unitHintOf, modeForUnit,
} from '../../api/indicatorCatalog';
import { toOperand, fromOperand } from '../../api/screenerApi';
import { specParam, specKey } from '../../api/indicatorApi';
import { specOf, itemLabel, defaultParams } from '../../components/indicatorsChart/indicatorSet';
import { paneKeyOf, paneRangeOf } from '../../components/charts/workspace/panes';
import { reasonText, formatIndicatorValue } from '../../components/charts/workspace/layers/indicatorLayer';
import { legacyChangeKind, plainDisabledReason, transition } from '../../components/strategyConstructor/operandSource';
import { operandCaption, validateOperand } from '../../components/universeScreener/conditionFormat';

// /meta fragment of the design (§4.4) plus CORR, SMA and ATR_PCT as the backend serves them
const KAIRI = {
  name: 'KAIRI', displayName: 'Kairi',
  description: 'Distance of the close from SMA(n) of its timeframe: % of the SMA (default), close / SMA, or in ATR(14)',
  params: [{ name: 'n', integer: true, min: 5, max: 250, storedOnly: false, defaultValue: 20, step: 5, description: 'SMA length in bars' }],
  unit: 'PERCENT', lo: -100.0, hi: null, linearInNextClose: false,
  warmup: 'n - 1 bars of its timeframe (ATR form: at least 13)',
  timeframes: ['DAY', 'WEEK', 'RUN'], runTimeframes: ['HOUR', 'DAY', 'WEEK', 'MONTH'],
  choiceParams: [{
    name: 'mode', defaultValue: 'PCT', defaultOmitted: true,
    description: 'Form of the distance: % of the SMA, close / SMA, or ATR(14) multiples',
    choices: [
      { value: 'PCT', label: '% of SMA', unit: 'PERCENT', lo: -100.0, neutral: 0.0 },
      { value: 'RATIO', label: 'close / SMA', unit: 'RATIO', lo: 0.0, neutral: 1.0 },
      { value: 'ATR', label: 'ATR(14) multiples', unit: 'ATR_MULTIPLE', neutral: 0.0 },
    ],
  }],
};
const CORR = {
  name: 'CORR', displayName: 'Corr', params: [{ name: 'n', integer: true, min: 20, max: 250, defaultValue: 60, step: 5 }],
  unit: 'RATIO', lo: -1, hi: 1, timeframes: ['DAY', 'WEEK', 'RUN'], runTimeframes: ['DAY', 'WEEK'],
  choiceParams: [{
    name: 'benchmark', defaultValue: 'SPY', description: 'Benchmark ETF',
    choices: [{ value: 'SPY', label: 'S&P 500 (SPY)', market: 'US' }, { value: 'QQQ', label: 'Nasdaq-100 (QQQ)', market: 'US' }],
  }],
};
const SMA = { name: 'SMA', displayName: 'SMA', params: [{ name: 'n', min: 5, max: 200, defaultValue: 50, step: 5 }], unit: 'PRICE', lo: 0, hi: null, timeframes: ['DAY', 'WEEK', 'RUN'] };
const ATR_PCT = { name: 'ATR_PCT', displayName: 'ATR %', params: [{ name: 'n', min: 2, max: 100, defaultValue: 14 }], unit: 'PERCENT', lo: 0, hi: null, timeframes: ['DAY', 'WEEK', 'RUN'] };

beforeAll(() => setIndicatorCatalog({ indicators: [SMA, ATR_PCT, CORR, KAIRI] }));

const op = (extra = {}) => ({ kind: 'KAIRI', n: 20, tf: 'DAY', offset: 0, value: '', ...extra });

describe('catalog', () => {
  it('normalizeChoiceParams keeps defaultOmitted and the per-choice unit / lo / hi / neutral; CORR gets none', () => {
    const [mode] = normalizeChoiceParams(KAIRI.choiceParams);
    expect(mode.defaultOmitted).toBe(true);
    expect(mode.choices.map((c) => [c.value, c.unit, c.lo, c.hi, c.neutral])).toEqual([
      ['PCT', 'PERCENT', -100, null, 0], ['RATIO', 'RATIO', 0, null, 1], ['ATR', 'ATR_MULTIPLE', null, null, 0],
    ]);
    const [bench] = normalizeChoiceParams(CORR.choiceParams);
    expect(bench.defaultOmitted).toBe(false);
    expect(bench.choices[0]).toMatchObject({ unit: null, lo: null, hi: null, neutral: null, market: 'US' });
  });

  it('modeParamOf / defaultModeOf', () => {
    expect(modeParamOf('KAIRI').name).toBe('mode');
    expect(defaultModeOf('KAIRI')).toBe('PCT');
    expect(modeParamOf('CORR')).toBeNull();
    expect(defaultModeOf('SMA')).toBeNull();
  });

  it('effectiveDescriptor: the form sets unit / lo / hi / neutral; a non-default form gets its own paneKind', () => {
    const d = descriptorOf('KAIRI');
    const pct = effectiveDescriptor(d, {});
    expect(pct).toMatchObject({ unit: 'PERCENT', lo: -100, hi: null, neutral: 0 });
    expect(pct.paneKind).toBeUndefined();
    expect(effectiveDescriptor(d, { mode: 'PCT' }).paneKind).toBeUndefined();
    expect(effectiveDescriptor(d, { mode: 'RATIO' })).toMatchObject({ unit: 'RATIO', lo: 0, neutral: 1, paneKind: 'KAIRI:RATIO' });
    expect(effectiveDescriptor(d, { mode: 'ATR' })).toMatchObject({ unit: 'ATR_MULTIPLE', lo: null, neutral: 0, paneKind: 'KAIRI:ATR' });
    expect(effectiveDescriptor(d, { mode: 'FOO' }).unit).toBe('PERCENT'); // unknown form: the default
    // no form-like choice: the same object
    const corr = descriptorOf('CORR');
    expect(effectiveDescriptor(corr, { benchmark: 'QQQ' })).toBe(corr);
    expect(effectiveDescriptor(null, {})).toBeNull();
  });

  it('operandUnitOf follows the form; unitsOfKind lists every form', () => {
    expect(operandUnitOf(op())).toBe('PERCENT');
    expect(operandUnitOf(op({ mode: 'RATIO' }))).toBe('RATIO');
    expect(operandUnitOf(op({ mode: 'ATR' }))).toBe('ATR_MULTIPLE');
    expect(operandUnitOf({ kind: 'MIN_SINCE', x: op({ mode: 'ATR' }) })).toBe('ATR_MULTIPLE');
    expect(operandUnitOf({ kind: 'CORR', n: 60, benchmark: 'QQQ' })).toBe('RATIO');
    expect(unitsOfKind('KAIRI')).toEqual(['PERCENT', 'RATIO', 'ATR_MULTIPLE']);
    expect(unitsOfKind('SMA')).toEqual(['PRICE']);
    expect(unitsOfKind('CLOSE')).toEqual(['PRICE']);
    expect(modeForUnit('KAIRI', 'ATR_MULTIPLE')).toBe('ATR');
    expect(modeForUnit('KAIRI', 'PERCENT')).toBeNull();
    expect(modeForUnit('SMA', 'PRICE')).toBeNull();
  });

  it('unit hints: KAIRI ratio is not "0..1"; CORR keeps its bounds', () => {
    expect(unitHintOf(op({ mode: 'RATIO' }))).toMatch(/^a ratio \(1 = on the average\)/);
    expect(unitHintOf({ kind: 'CORR', n: 60 })).toMatch(/^a ratio \(−1\.\.1\)/);
    expect(unitHintOf(op({ mode: 'ATR' }))).toMatch(/KAIRI in ATR form/);
  });
});

describe('operand JSON (screenerApi)', () => {
  it('toOperand leaves the default form out and sends the others', () => {
    expect(toOperand(op())).toEqual({ kind: 'KAIRI', n: 20, tf: 'DAY', offset: 0 });
    expect(toOperand(op({ mode: 'PCT' }))).toEqual({ kind: 'KAIRI', n: 20, tf: 'DAY', offset: 0 });
    expect(toOperand(op({ mode: 'ATR', offset: -1, tf: 'RUN' }))).toEqual({ kind: 'KAIRI', n: 20, tf: 'RUN', offset: -1, mode: 'ATR' });
    expect(toOperand(op({ mode: 'RATIO' }))).toMatchObject({ mode: 'RATIO' });
    expect(toOperand(op({ mode: 'FOO' })).mode).toBe('FOO'); // the server answers 400 with the known forms
  });

  it('a kind without a form never gets mode; CORR is unchanged', () => {
    expect(toOperand({ kind: 'SMA', n: 50, tf: 'DAY', offset: 0, mode: 'ATR' })).toEqual({ kind: 'SMA', n: 50, tf: 'DAY', offset: 0 });
    expect(toOperand({ kind: 'CLOSE', tf: 'DAY', offset: 0, mode: 'ATR' })).toEqual({ kind: 'CLOSE', tf: 'DAY', offset: 0 });
    expect(toOperand({ kind: 'CORR', n: 60, tf: 'DAY', offset: 0 })).toEqual({ kind: 'CORR', n: 60, tf: 'DAY', offset: 0, benchmark: 'SPY' });
    expect(toOperand({ kind: 'CORR', n: 60, tf: 'DAY', offset: 0, benchmark: 'QQQ' }).mode).toBeUndefined();
  });

  it('a kind of a newer server keeps its mode on a round trip', () => {
    expect(toOperand({ kind: 'FOO', n: 7, tf: 'DAY', offset: 0, mode: 'X' })).toEqual({ kind: 'FOO', n: 7, tf: 'DAY', offset: 0, mode: 'X' });
  });

  it('fromOperand → toOperand is the identity for every form', () => {
    const dtos = [
      { kind: 'KAIRI', n: 50, tf: 'DAY', offset: 0 },
      { kind: 'KAIRI', n: 20, tf: 'RUN', offset: -1, mode: 'ATR' },
      { kind: 'KAIRI', n: 20, tf: 'WEEK', offset: 0, mode: 'RATIO' },
    ];
    dtos.forEach((dto) => expect(toOperand(fromOperand(dto))).toEqual(dto));
    expect(fromOperand({ kind: 'KAIRI', n: 50, tf: 'DAY', offset: 0 }).mode).toBeUndefined();
  });
});

describe('captions and validation (conditionFormat)', () => {
  it('KAIRI(20)[0] for the default form, KAIRI(20, ATR)[0] otherwise', () => {
    // as the backend's IndicatorRef.label: 'DAY KAIRI(20)[0]', 'DAY KAIRI(20, ATR)[0]'
    expect(operandCaption(op())).toBe('DAY KAIRI(20)[0]');
    expect(operandCaption(op({ mode: 'PCT' }))).toBe('DAY KAIRI(20)[0]');
    expect(operandCaption(op({ mode: 'ATR', offset: -1 }))).toBe('DAY KAIRI(20, ATR)[−1]');
    expect(operandCaption(op({ mode: 'RATIO', tf: 'WEEK' }), 'DAY')).toBe('WEEK KAIRI(20, RATIO)[0] (provisional)');
    expect(operandCaption({ kind: 'CORR', n: 60, tf: 'DAY', offset: 0, benchmark: 'QQQ' })).toBe('DAY CORR(60, QQQ)[0]');
  });

  it('an unknown form is an error; known forms and no form are fine', () => {
    expect(validateOperand(op({ mode: 'FOO' }), 'left', false)).toEqual(["unknown form 'FOO' for Kairi; known: PCT, RATIO, ATR"]);
    expect(validateOperand(op(), 'left', false)).toEqual([]);
    expect(validateOperand(op({ mode: 'ATR' }), 'left', true)).toEqual([]);
    expect(validateOperand(op({ n: 300 }), 'left', false)).toEqual(['Kairi length must be a whole number 5..250']);
  });
});

describe('constructor source transitions (operandSource)', () => {
  it('legacyChangeKind drops mode; a kind with forms takes the form of the left side\'s unit', () => {
    expect(legacyChangeKind(op({ mode: 'ATR' }), 'SMA', true)).toEqual({ kind: 'SMA', n: 50, tf: 'DAY', offset: 0, value: '' });
    expect(legacyChangeKind({ kind: 'CLOSE', n: null, tf: 'RUN', offset: 0, value: '' }, 'KAIRI', true))
      .toEqual({ kind: 'KAIRI', n: 20, tf: 'RUN', offset: 0, value: '' });
    expect(legacyChangeKind({ kind: 'CLOSE', n: null, tf: 'RUN', offset: 0, value: '' }, 'KAIRI', true, 'ATR_MULTIPLE'))
      .toEqual({ kind: 'KAIRI', n: 20, tf: 'RUN', offset: 0, value: '', mode: 'ATR' });
    expect(legacyChangeKind({ kind: 'CLOSE', n: null, tf: 'RUN', offset: 0, value: '' }, 'KAIRI', true, 'PERCENT').mode).toBeUndefined();
    expect(legacyChangeKind(op({ mode: 'RATIO' }), 'CORR', true)).toEqual({ kind: 'CORR', n: 60, tf: 'DAY', offset: 0, value: '', benchmark: 'SPY' });
  });

  it('transition passes the left side\'s unit (right side picking KAIRI against a DIST_* line)', () => {
    const right = { kind: 'CONST', value: '1', n: null, tf: 'RUN', offset: 0 };
    expect(transition(right, 'KAIRI', null, { allowRun: true, otherUnit: 'ATR_MULTIPLE' }).mode).toBe('ATR');
  });

  it('plainDisabledReason: KAIRI fits a %, ratio or ATR-multiple left side, not a price', () => {
    expect(plainDisabledReason('KAIRI', 'DAY', 'PERCENT')).toBeNull();
    expect(plainDisabledReason('KAIRI', 'DAY', 'RATIO')).toBeNull();
    expect(plainDisabledReason('KAIRI', 'DAY', 'ATR_MULTIPLE')).toBeNull();
    expect(plainDisabledReason('KAIRI', 'DAY', 'PRICE')).toMatch(/^Kairi is a % value; the left side is a price value/);
    expect(plainDisabledReason('KAIRI', 'MIN5', null)).toBe('Kairi is not supported on MIN5 yet');
    expect(plainDisabledReason('SMA', 'DAY', 'PERCENT')).toMatch(/^SMA is a price value/);
  });
});

describe('Indicators Chart', () => {
  const item = (params) => ({ id: 'k', kind: 'KAIRI', params, color: '#000', hidden: false });

  it('specOf leaves the default form out (with the descriptor); specParam writes KIND:n:MODE', () => {
    expect(specOf(item({ n: 20, mode: 'PCT' }), KAIRI)).toEqual({ kind: 'KAIRI', n: 20 });
    expect(specOf(item({ n: 20 }), KAIRI)).toEqual({ kind: 'KAIRI', n: 20 });
    expect(specOf(item({ n: 20, mode: 'ATR' }), KAIRI)).toEqual({ kind: 'KAIRI', n: 20, mode: 'ATR' });
    expect(specParam(specOf(item({ n: 20, mode: 'PCT' }), KAIRI))).toBe('KAIRI:20');
    expect(specParam(specOf(item({ n: 20, mode: 'ATR' }), KAIRI))).toBe('KAIRI:20:ATR');
    expect(specParam({ kind: 'KAIRI', n: 50, mode: 'RATIO' })).toBe('KAIRI:50:RATIO');
    expect(specKey({ kind: 'KAIRI', n: 20 })).not.toBe(specKey({ kind: 'KAIRI', n: 20, mode: 'ATR' }));
    // CORR unchanged, with or without its descriptor
    expect(specParam(specOf({ kind: 'CORR', params: { n: 60, benchmark: 'QQQ' } }, CORR))).toBe('CORR:60:QQQ');
    expect(specParam(specOf({ kind: 'CORR', params: { n: 60, benchmark: 'SPY' } }))).toBe('CORR:60:SPY');
    expect(specParam(specOf({ kind: 'SMA', params: { n: 50 } }, SMA))).toBe('SMA:50');
  });

  it('itemLabel: Kairi(20), Kairi(20, ATR); defaultParams has the default form', () => {
    expect(itemLabel(item({ n: 20, mode: 'PCT' }), KAIRI)).toBe('Kairi(20)');
    expect(itemLabel(item({ n: 20, mode: 'ATR' }), KAIRI)).toBe('Kairi(20, ATR)');
    expect(itemLabel(item({ n: 50, mode: 'RATIO' }), KAIRI)).toBe('Kairi(50, RATIO)');
    expect(itemLabel({ kind: 'CORR', params: { n: 60, benchmark: 'QQQ' } }, CORR)).toBe('Corr(60, QQQ)');
    expect(defaultParams(KAIRI)).toEqual({ n: 20, mode: 'PCT' });
  });

  it('panes: one per form (PCT, RATIO, ATR), unbounded, never the price pane', () => {
    const d = descriptorOf('KAIRI');
    const keys = ['PCT', 'RATIO', 'ATR'].map((mode) => paneKeyOf(effectiveDescriptor(d, { mode })));
    expect(keys).toEqual(['kind:KAIRI', 'kind:KAIRI:RATIO', 'kind:KAIRI:ATR']);
    ['PCT', 'RATIO', 'ATR'].forEach((mode) => expect(paneRangeOf(effectiveDescriptor(d, { mode }))).toBeNull());
    // other kinds unchanged
    expect(paneKeyOf(descriptorOf('ATR_PCT'))).toBe('kind:ATR_PCT');
    expect(paneKeyOf(descriptorOf('CORR'))).toBe('RATIO:-1:1');
    expect(paneKeyOf(descriptorOf('SMA'))).toBe('price');
  });

  it('values and reasons: ATR multiples with 2 digits, KAIRI ZERO_RANGE text', () => {
    expect(formatIndicatorValue(-3.771660499973922, 'ATR_MULTIPLE')).toBe('−3.77');
    expect(formatIndicatorValue(-6.012301167909392, 'PERCENT')).toBe('−6.01%');
    expect(formatIndicatorValue(0.939876988320906, 'RATIO')).toBe('0.940');
    expect(reasonText('ZERO_RANGE', { kind: 'KAIRI' })).toBe('SMA or ATR is zero');
    expect(reasonText('ZERO_RANGE', { kind: 'CORR' })).toBe('flat returns (no variance in the window)');
    expect(reasonText('ZERO_RANGE', { kind: 'ATR' })).toBe('zero range (high = low)');
  });
});
