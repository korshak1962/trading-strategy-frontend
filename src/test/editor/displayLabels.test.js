// Gate GB3 (constructor editor UX Stage B, screener logs/agents/architect.md §4.5, §5): the shared
// fixture display_labels.json - a byte-identical copy of the backend's
// src/test/resources/display_labels/display_labels.json (scripts/check_shared_fixtures.ps1) - holds
// definitions / filters (API DTO JSON) and the display texts the backend's DisplayLabels gives them.
// displayLabels.js must give the same texts for the editor, run and screener modes; `backendOnly`
// (signal comments, chart labels) is not mirrored here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromConstructedDTO } from '../../api/constructedApi';
import { fromFilterDTO } from '../../api/screenerApi';
import {
  EDITOR_MODE, SCREENER_MODE, runMode, displayOpts, ruleText, ruleSentence, ruleBodyText, ruleConditionText,
  conditionText, levelsLegendText, num, screenerConditionText, operandText, ruleHead,
} from '../../utils/displayLabels';

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/display_labels/display_labels.json', import.meta.url), 'utf8'));
const DETECTOR_DEFAULTS = { coveragePct: 0.95, minBars: 5, minWidthPct: 0.05, minAnnualYieldPct: -2, maxAnnualYieldPct: 100, logPrice: true };

const draftOf = (c) => fromConstructedDTO({ id: 1, name: c.id, version: 1, ...c.definition });

const textsOf = (draft, mode) => {
  const opts = displayOpts(draft.rules, draft.axes, mode);
  const conditions = draft.rules.map((r) => r.conditions.map((rc) => ruleConditionText(rc, draft.axes, opts)));
  return { opts, conditions };
};

const actualDefinition = (c) => {
  const draft = draftOf(c);
  const ed = textsOf(draft, EDITOR_MODE);
  const out = {
    editor: {
      rules: draft.rules.map((r) => ruleText(r, draft.axes, ed.opts)),
      conditions: ed.conditions,
    },
    run: {},
  };
  for (const tf of c.runTfs) {
    const rt = textsOf(draft, runMode(tf));
    out.run[tf] = {
      rules: draft.rules.map((r) => ruleSentence(r, draft.axes, rt.opts)),
      conditions: rt.conditions,
      rulesTab: draft.rules.map((r) => ruleBodyText(r, draft.axes, rt.opts)),
      legend: levelsLegendText(draft.rules, draft.axes),
    };
  }
  return out;
};

const actualFilter = (c) => {
  const f = fromFilterDTO(c.filter, DETECTOR_DEFAULTS);
  return { screener: { conditions: f.conditions.map((x) => conditionText(x, { mode: SCREENER_MODE })) } };
};

describe('GB3 shared fixture display_labels.json', () => {
  it('has the cases of the backend suite', () => {
    expect(FIXTURE.version).toBe(1);
    expect(FIXTURE.cases.length).toBeGreaterThanOrEqual(90);
  });

  const defs = FIXTURE.cases.filter((c) => c.definition);
  const filters = FIXTURE.cases.filter((c) => c.filter);

  it.each(defs.map((c) => [c.id, c]))('definition %s: editor + run texts', (_id, c) => {
    expect(actualDefinition(c)).toEqual(c.expect);
  });

  it.each(filters.map((c) => [c.id, c]))('filter %s: screener texts', (_id, c) => {
    expect(actualFilter(c)).toEqual(c.expect);
  });
});

describe('displayLabels.js helpers', () => {
  it('num: trailing zeros, Unicode minus, plain form', () => {
    expect(num(0)).toBe('0');
    expect(num(-0)).toBe('0');
    expect(num(-0.25)).toBe('−0.25');
    expect(num(1.5)).toBe('1.5');
    expect(num(1e-6)).toBe('0.000001');
    expect(num(1e-7)).toBe('0.0000001');
    expect(num(100)).toBe('100');
    expect(num('')).toBe('?');
    expect(num('2')).toBe('2');
  });

  it('an unknown kind shows its code caption + "(not in this version)", never empty', () => {
    const opts = { mode: EDITOR_MODE };
    expect(operandText({ kind: 'FOO', tf: 'RUN', offset: 0, n: 3 }, opts)).toMatch(/\(not in this version\)$/);
    expect(conditionText({ type: 'LEVEL_EVENT', event: 'NEW_EVENT', tf: 'RUN' }, opts)).toMatch(/NEW_EVENT.*\(not in this version\)$/);
    expect(conditionText({ type: 'MYSTERY' }, opts)).toMatch(/\(not in this version\)$/);
  });

  it('a live draft: blanks read as "?", an unsaved rule is R(new)', () => {
    const rule = { id: null, signalType: 'LongOpen', conditions: [{ condition: { type: 'COMPARE', left: { kind: 'SMA', tf: 'RUN', offset: 0, n: '' }, op: 'GT', right: { kind: 'CONST', value: '' }, tolerancePct: '' }, links: {} }] };
    expect(ruleHead(rule)).toBe('R(new) Buy');
    expect(ruleText(rule, [], { mode: EDITOR_MODE })).toBe('R(new) Buy: SMA ? is above ?');
  });

  it('screener mode words every operand', () => {
    const c = { type: 'COMPARE', left: { kind: 'CLOSE', tf: 'DAY', offset: 0 }, op: 'GT', right: { kind: 'SMA', tf: 'DAY', offset: 0, n: 50 }, tolerancePct: 0 };
    expect(screenerConditionText(c)).toBe('close (day) is above SMA 50 (day)');
  });
});
