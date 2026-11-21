// Editor UX Stage A F4: the collapsed "defaults / changed / show all" block (ParamBlock) logic.
import { describe, expect, it } from 'vitest';
import {
  blockSummary, changedFields, effectiveValue, fieldError, fieldSummary, isChanged, levelsBlockInfo, linkInfoOf,
} from '../../components/common/paramBlockFormat';
import { LEVELS_DEFAULTS, fromConstructedDTO } from '../../api/constructedApi';
import { fixture } from './baselines';

const f = (over) => ({ key: 'k', label: 'Stop buffer, ATR', value: '', defaultValue: 0.5, min: 0, max: 5, minInclusive: true, integer: false, linkedValue: null, link: null, ...over });

describe('changed / summary', () => {
  it('a typed value differing from the default is changed; empty = default', () => {
    expect(isChanged(f({ value: '' }))).toBe(false);
    expect(isChanged(f({ value: 0.5 }))).toBe(false);
    expect(isChanged(f({ value: '1' }))).toBe(true);
    expect(effectiveValue(f({ value: '' }))).toBe(0.5);
  });

  it('a link fixed at the default is default; a swept axis is changed and shows its range', () => {
    const fixedLink = f({ value: 7, linkedValue: 0.5, link: { axes: [{ name: '$StopBuffer', min: 0.5, max: 0.5 }] } });
    expect(isChanged(fixedLink)).toBe(false);
    const swept = f({ linkedValue: 1, link: { axes: [{ name: '$StopBuffer', min: 0.5, max: 1.5 }] } });
    expect(isChanged(swept)).toBe(true);
    expect(fieldSummary(swept)).toBe('Stop buffer, ATR 1 (axis $StopBuffer 0.5…1.5)');
    const sweptAtDefault = f({ linkedValue: 0.5, link: { axes: [{ name: '$S', min: 0.25, max: 1 }] } });
    expect(isChanged(sweptAtDefault)).toBe(true);
  });

  it('summary text forms', () => {
    const fields = [f({ key: 'a', label: 'Min zone strength', defaultValue: 3, value: 2 }), f({ key: 'b' })];
    expect(blockSummary({ fields, defaultsText: 'default settings', tail: ['re-arm'] })).toBe('Min zone strength 2 · re-arm');
    expect(blockSummary({ fields: [f({})], defaultsText: 'default settings', tail: ['re-arm', 'take-profit 4'] }))
      .toBe('default settings · re-arm · take-profit 4');
    expect(blockSummary({ fields, defaultsText: 'x', sameAsPrevious: true })).toBe('same as above');
    expect(blockSummary({ fields: [f({})], defaultsText: 'default settings' })).toBe('default settings');
    const age = f({ label: 'Min age, bars', summaryLabel: 'Min age', unitSuffix: ' bars', defaultValue: 0, value: 30 });
    expect(blockSummary({ fields: [age], defaultsText: 'default settings' })).toBe('Min age 30 bars');
    const cov = f({ summaryLabel: 'Coverage', unitSuffix: ' %', defaultValue: 0.95, value: 0.9, display: (v) => String(v * 100) });
    expect(fieldSummary(cov)).toBe('Coverage 90 %');
    expect(changedFields(fields).map((x) => x.key)).toEqual(['a']);
  });

  it('client range errors', () => {
    expect(fieldError(f({ value: '6' }))).toBeTruthy();
    expect(fieldError(f({ value: 'x' }))).toBeTruthy();
    expect(fieldError(f({ value: '2' }))).toBeNull();
    expect(fieldError(f({ value: '0', minInclusive: false }))).toBeTruthy();
    expect(fieldError(f({ value: '1.5', integer: true }))).toBeTruthy();
    expect(fieldError(f({ value: '1', max: 1, maxExclusive: true }))).toBeTruthy();
    expect(fieldError(f({ value: '99', linkedValue: 1 }))).toBeNull();
  });

  it('linkInfoOf', () => {
    expect(linkInfoOf(null, [])).toBeNull();
    expect(linkInfoOf([{ sign: 1, axis: '$A' }], [{ name: '$A', min: 1, max: 3 }])).toEqual({ axes: [{ name: '$A', min: 1, max: 3 }] });
  });
});

describe('Levels occurrences', () => {
  it('R2 of the bricks template: the anchor event reads "same as above"; one spec → no set label', () => {
    const e = fixture().constructed.find((x) => x.id.startsWith('template:level-breakout-bricks{entryAnchor=false'));
    const d = fromConstructedDTO(e.dto);
    const rc = d.rules.find((r) => r.conditions.some((c) => c.condition.right?.kind === 'AT_LAST')).conditions[0];
    const info = levelsBlockInfo(rc, d.axes, d.rules);
    const prefixes = Object.keys(info);
    expect(prefixes.length).toBe(2);
    expect(info[prefixes[0]].sameAsPrevious).toBe(false);
    expect(info[prefixes[1]].sameAsPrevious).toBe(true);
    expect(info[prefixes[0]].setLabel).toBeNull();
  });

  it('two different specs → "Levels set n"', () => {
    const lv = (minStrength) => ({ type: 'LEVEL_EVENT', tf: 'RUN', event: 'CONFIRMED_ANY', strength: '', levels: { ...LEVELS_DEFAULTS, minStrength } });
    const rules = [
      { id: 1, conditions: [{ id: 1, condition: lv(3), links: {} }] },
      { id: 2, conditions: [{ id: 1, condition: lv(5), links: {} }] },
    ];
    expect(levelsBlockInfo(rules[0].conditions[0], [], rules)[''].setLabel).toBe('Levels set 1');
    expect(levelsBlockInfo(rules[1].conditions[0], [], rules)[''].setLabel).toBe('Levels set 2');
  });
});
