// Constructor editor UX Stage B, F-B3a.2 (screener logs/agents/architect.md §6.1): the editor
// place a backend error's `path` names (permanent ids, new rules / conditions numbered as the
// backend's ConstructedDefinitionValidator numbers them).
import { describe, expect, it } from 'vitest';
import {
  parseProblemPath, effectiveIds, locateRuleProblem, filterProblemIndex, blockErrorOf,
} from '../../utils/problemPath';

const cond = (id) => ({ id, condition: { type: 'COMPARE' } });

describe('parseProblemPath', () => {
  it('rule / condition / rest', () => {
    expect(parseProblemPath('R1')).toEqual({ kind: 'rule', ruleId: 1, condId: null, rest: '' });
    expect(parseProblemPath('R1.C2')).toEqual({ kind: 'rule', ruleId: 1, condId: 2, rest: '' });
    expect(parseProblemPath('R2.C1.right.a.levels.maxDwellBars'))
      .toEqual({ kind: 'rule', ruleId: 2, condId: 1, rest: 'right.a.levels.maxDwellBars' });
    expect(parseProblemPath('R12.C3.left.tf')).toMatchObject({ ruleId: 12, condId: 3, rest: 'left.tf' });
  });

  it('screener filter', () => {
    expect(parseProblemPath('conditions[0]')).toEqual({ kind: 'filter', condIndex: 0, rest: '' });
    expect(parseProblemPath('conditions[3].left.n')).toEqual({ kind: 'filter', condIndex: 3, rest: 'left.n' });
    expect(filterProblemIndex('conditions[2].tolerancePct')).toBe(2);
    expect(filterProblemIndex('R1.C1')).toBeNull();
  });

  it('unknown shapes and empty', () => {
    ['', null, undefined, 'axes[0]', 'constraints[1]', 'name', 'r1.c1', 'R1.left'].forEach((p) => {
      expect(parseProblemPath(p) === null || parseProblemPath(p).kind === 'rule').toBe(true);
    });
    expect(parseProblemPath('axes[0]')).toBeNull();
    expect(parseProblemPath('')).toBeNull();
    expect(parseProblemPath(null)).toBeNull();
    // `R1.left` is a rule path with a rest (no condition): the whole rule is outlined
    expect(parseProblemPath('R1.left')).toEqual({ kind: 'rule', ruleId: 1, condId: null, rest: 'left' });
  });
});

describe('effectiveIds (as the backend numbers a draft)', () => {
  it('saved rules keep their ids; new ones follow max(nextRuleId, max id + 1)', () => {
    const rules = [{ id: 1, conditions: [cond(1), cond(2)] }, { id: null, conditions: [cond(null)] }, { id: 4, conditions: [cond(null), cond(3)] }];
    expect(effectiveIds(rules, null)).toEqual([
      { ruleId: 1, condIds: [1, 2] },
      { ruleId: 5, condIds: [1] },
      { ruleId: 4, condIds: [4, 3] },
    ]);
    // the stored version remembers a deleted rule 6 and condition 7 of rule 1
    const saved = { nextRuleId: 7, rules: [{ id: 1, nextConditionId: 8 }] };
    expect(effectiveIds([{ id: 1, conditions: [cond(null)] }, { conditions: [cond(null)] }], saved)).toEqual([
      { ruleId: 1, condIds: [8] },
      { ruleId: 7, condIds: [1] },
    ]);
  });

  it('a brand-new strategy: R1, R2, … with C1, C2, …', () => {
    expect(effectiveIds([{ conditions: [cond(null), cond(null)] }, { conditions: [cond(null)] }]))
      .toEqual([{ ruleId: 1, condIds: [1, 2] }, { ruleId: 2, condIds: [1] }]);
    expect(effectiveIds(null)).toEqual([]);
  });
});

describe('locateRuleProblem', () => {
  const rules = [{ id: 3, conditions: [cond(1), cond(5)] }, { id: null, conditions: [cond(null)] }];

  it('by id, not by position', () => {
    expect(locateRuleProblem('R3.C5.channel.minBars', rules)).toEqual({ ruleIndex: 0, condIndex: 1, rest: 'channel.minBars' });
    expect(locateRuleProblem('R4.C1.left.tf', rules)).toEqual({ ruleIndex: 1, condIndex: 0, rest: 'left.tf' });
    expect(locateRuleProblem('R3', rules)).toEqual({ ruleIndex: 0, condIndex: null, rest: '' });
  });

  it('a rule / condition the draft no longer has, a filter path, no path → null', () => {
    expect(locateRuleProblem('R9.C1', rules)).toBeNull();
    expect(locateRuleProblem('R3.C2', rules)).toBeNull();
    expect(locateRuleProblem('conditions[0]', rules)).toBeNull();
    expect(locateRuleProblem(null, rules)).toBeNull();
    expect(locateRuleProblem('R3.C1', null)).toBeNull();
  });
});

describe('blockErrorOf (ParamBlock errorOpen)', () => {
  it('the field of the block under the prefix', () => {
    expect(blockErrorOf('levels.minStrength', '', 'levels')).toBe('minStrength');
    expect(blockErrorOf('right.a.levels.maxDwellBars', 'right.a.', 'levels')).toBe('maxDwellBars');
    expect(blockErrorOf('channel.minBars', '', 'channel')).toBe('minBars');
    expect(blockErrorOf('left.levels', 'left.', 'levels')).toBe(true);
  });

  it('another prefix / block, or no rest → false', () => {
    expect(blockErrorOf('right.a.levels.maxDwellBars', 'left.a.', 'levels')).toBe(false);
    expect(blockErrorOf('right.a.levels.maxDwellBars', '', 'levels')).toBe(false);
    expect(blockErrorOf('left.tf', '', 'channel')).toBe(false);
    expect(blockErrorOf('levelsX.a', '', 'levels')).toBe(false);
    expect(blockErrorOf(null, '', 'levels')).toBe(false);
    expect(blockErrorOf('', '', 'levels')).toBe(false);
  });
});
