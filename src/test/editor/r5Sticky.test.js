// R5 v2 F1 / step S17 (screener logs/agents/architect_r5_migration_v2.md §6): the position operand
// STICKY_SINCE_ENTRY(levels), form LEVELS. Fixture: a copy of the backend pin
// src/test/resources/pins/r5/template_variants.txt (16 variants of "Level breakout (bricks)";
// anchor=true = E2: R3 `close < STICKY_SINCE_ENTRY(levels)`), the definitions as the backend serves them.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fromConstructedDTO, toDefinitionRequest, linkableSuffixes, levelsOccurrences, normalizePositionMeta,
  LEVELS_DEFAULTS, LEVEL_FIELDS,
} from '../../api/constructedApi';
import { operandUnitOf, isPositionOperand, isPositionLevelsOperand } from '../../api/indicatorCatalog';
import {
  anyConditionCaption, ruleCaption, levelsCaptionOpts, validateStagedCondition, newPositionOperand, newLevelOperand,
  usesPosition, runTfsOf, levelsLegendLines, validateDraft,
} from '../../components/strategyConstructor/constructedFormat';
import { transition, sourceOf } from '../../components/strategyConstructor/operandSource';
import { FIXTURE_DIR } from './baselines';

const STICKY = 'STICKY_SINCE_ENTRY';

/** `[{name, def}]` of template_variants.txt: a header line, rules, axes, then the definition JSON. */
const variants = () => {
  const lines = fs.readFileSync(path.join(FIXTURE_DIR, '..', 'r5', 'template_variants.txt'), 'utf8').split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 3 < lines.length; i += 4) out.push({ name: lines[i].trim(), def: JSON.parse(lines[i + 3]) });
  return out;
};
const E2 = variants().filter((v) => v.name.includes('anchor=true'));

/**
 * The JSON with null members dropped (the backend's canonical form writes every OperandDTO field) and
 * without the server's id counter `nextConditionId` (the request never carries it; the server keeps it).
 */
const stripNulls = (v) => {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== null && k !== 'nextConditionId')
      .map(([k, x]) => [k, stripNulls(x)]));
  }
  return v;
};
const wire = (o) => JSON.parse(JSON.stringify(o));

const isStickyRc = (rc) => rc?.condition?.right?.kind === STICKY;
const stickyRuleOf = (rules) => rules.find((r) => r.conditions.some(isStickyRc));
const stickyRcOf = (rules) => stickyRuleOf(rules).conditions.find(isStickyRc);
const plainClose = () => ({ kind: 'CLOSE', tf: 'RUN', offset: 0, n: null, value: '' });

describe('R5 S17: STICKY_SINCE_ENTRY in the editor', () => {
  it('the fixture has the 16 variants; the 8 anchored ones read STICKY_SINCE_ENTRY in a LongClose rule', () => {
    expect(variants().length).toBe(16);
    expect(E2.length).toBe(8);
    E2.forEach((v) => expect(stickyRuleOf(v.def.rules)?.signalType, v.name).toBe('LongClose'));
  });

  it('round trip: toDefinitionRequest(fromConstructedDTO(def)) == the served definition (nulls aside), every variant', () => {
    variants().forEach(({ name, def }) => {
      const req = wire(toDefinitionRequest(fromConstructedDTO(def)));
      expect(stripNulls(req.rules), name).toEqual(stripNulls(def.rules));
      expect(stripNulls(req.axes), name).toEqual(stripNulls(def.axes));
    });
  });

  it('the operand reads as {kind, levels}: no X, no lag; unit PRICE; Source STICKY_SINCE_ENTRY; DAY / WEEK', () => {
    const draft = fromConstructedDTO(E2[0].def);
    const op = stickyRcOf(draft.rules).condition.right;
    expect(isPositionOperand(op)).toBe(true);
    expect(isPositionLevelsOperand(op)).toBe(true);
    expect(op.x).toBeUndefined();
    expect(op.levels).toEqual(stickyRcOf(E2[0].def.rules).condition.right.levels);
    expect(operandUnitOf(op)).toBe('PRICE');
    expect(sourceOf(op)).toEqual({ source: STICKY });
    expect(usesPosition(draft.rules)).toBe(true);
    expect(runTfsOf(draft.rules)).toEqual(['DAY', 'WEEK']);
  });

  it('links: right.levels.<field> (a Levels occurrence at `right.`), never right.x.*', () => {
    const rc = stickyRcOf(fromConstructedDTO(E2[0].def).rules);
    expect(levelsOccurrences(rc.condition)).toEqual([{ prefix: 'right.', linkable: true, path: 'right.levels' }]);
    const suffixes = linkableSuffixes(rc.condition);
    LEVEL_FIELDS.forEach((f) => expect(suffixes).toContain(`right.levels.${f}`));
    expect(suffixes.some((s) => s.startsWith('right.x.'))).toBe(false);
    expect(Object.keys(rc.links).length).toBeGreaterThanOrEqual(12);
    Object.keys(rc.links).forEach((s) => expect(s).toMatch(/^right\.levels\./));
  });

  it('caption: the backend label STICKY_SINCE_ENTRY (the spec only as a tag)', () => {
    const draft = fromConstructedDTO(E2[0].def);
    expect(anyConditionCaption(stickyRcOf(draft.rules).condition, 'DAY')).toBe('RUN close[0] < STICKY_SINCE_ENTRY');
    const opts = levelsCaptionOpts(draft.rules, draft.axes);
    expect(ruleCaption(stickyRuleOf(draft.rules), 'DAY', draft.axes, opts))
      .toMatch(/^R\d+ LongClose: RUN close\[0\] < STICKY_SINCE_ENTRY(@L\d+)?( \(.*\))?$/);
    expect(levelsLegendLines(draft.rules, draft.axes).length).toBeGreaterThan(0);
  });

  it('validation: the served E2 drafts are clean; x / lag / output / no levels / offset / a bad field are errors', () => {
    E2.forEach(({ name, def }) => {
      const v = validateDraft(fromConstructedDTO(def), { requireName: false });
      expect(v.ok, `${name}: ${JSON.stringify(v)}`).toBe(true);
    });
    const ok = { type: 'COMPARE', left: plainClose(), op: 'LT', tolerancePct: 0, right: newPositionOperand(STICKY, null, LEVELS_DEFAULTS) };
    expect(validateStagedCondition(ok)).toEqual([]);
    const bad = (patch) => validateStagedCondition({ ...ok, right: { ...ok.right, ...patch } }).join(' | ');
    expect(bad({ x: plainClose() })).toMatch(/has no value operand/);
    expect(bad({ lag: 1 })).toMatch(/has no lag/);
    expect(bad({ output: 'OPEN_LINE' })).toMatch(/has no output/);
    expect(bad({ levels: null })).toMatch(/levels is required/);
    expect(bad({ offset: -1 })).toMatch(/no offset/);
    expect(bad({ levels: { ...LEVELS_DEFAULTS, maxDwellBars: 0 } })).toMatch(/right\.levels\.maxDwellBars/);
  });

  it('a new operand takes the strategy Levels spec (or the previous LEVEL X spec); back to AT_ENTRY gives close', () => {
    const spec = { ...LEVELS_DEFAULTS, minStrength: 6, breakBuffer: 0.7 };
    const ctx = { allowRun: true, levelsSpec: spec };
    const fromPlain = transition(plainClose(), STICKY, null, ctx);
    expect(fromPlain).toMatchObject({ kind: STICKY, tf: 'RUN', offset: 0, lag: '' });
    expect(fromPlain.x).toBeUndefined();
    expect(fromPlain.levels.minStrength).toBe(6);
    const atEntry = { kind: 'AT_ENTRY', tf: 'RUN', offset: 0, n: null, value: '', lag: '', x: newLevelOperand({ ...LEVELS_DEFAULTS, stopBuffer: 0.9 }, 'OPEN_LINE') };
    expect(transition(atEntry, STICKY, null, ctx).levels.stopBuffer).toBe(0.9);
    const back = transition(fromPlain, 'AT_ENTRY', null, ctx);
    expect(back.kind).toBe('AT_ENTRY');
    expect(back.x.kind).toBe('CLOSE');
    expect(back.levels).toBeUndefined();
  });

  it('meta: normalizePositionMeta keeps the kind with form LEVELS and its texts (live and fallback)', () => {
    const m = normalizePositionMeta({ kinds: [{ name: STICKY, form: 'LEVELS', hint: 'h', label: 'L', tooltip: 't' }] });
    expect(m.kinds).toEqual([expect.objectContaining({ name: STICKY, form: 'LEVELS', label: 'L', tooltip: 't' })]);
    const fb = normalizePositionMeta({ kinds: [{ name: STICKY }] });
    expect(fb.kinds[0]).toMatchObject({ form: 'LEVELS', label: 'Sticky support since entry' });
    expect(fb.help.levels).toMatch(/no X and no lag/);
  });
});
