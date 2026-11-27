// Constructor editor UX Stage B, B2 (screener architect.md §5): the next-bar line's rule text uses the
// B1 twins `meta.ruleText` / `meta.conditionText`; an older backend or an old stored `next_triggers`
// snapshot (only `rule` / `condition`) shows today's code text.
import { describe, expect, it } from 'vitest';
import { lineRuleText } from '../../components/nextTriggers/nextTriggersFormat';

describe('lineRuleText', () => {
  it('twins → plain text', () => {
    expect(lineRuleText({ meta: { rule: 'R2', condition: 'DAY close[0] < AT_ENTRY(OPEN_STOP)', ruleText: 'R2 Sell', conditionText: "close is below the entry's stop" } }))
      .toBe("R2 Sell: close is below the entry's stop");
  });

  it('no twins (older backend / old snapshot) → the codes, as before', () => {
    expect(lineRuleText({ meta: { rule: 'R1', condition: 'RUN close[0] > RUN SMA(100)[0]' } })).toBe('R1: RUN close[0] > RUN SMA(100)[0]');
    expect(lineRuleText({ meta: { rule: 3 } })).toBe('R3');
  });

  it('one twin only: each part falls back on its own', () => {
    expect(lineRuleText({ meta: { rule: 'R2', condition: 'DAY close[0] < X', ruleText: 'R2 Sell' } })).toBe('R2 Sell: DAY close[0] < X');
    expect(lineRuleText({ meta: { rule: 'R2', condition: 'DAY close[0] < X', conditionText: 'close is below X', ruleText: '' } })).toBe('R2: close is below X');
  });

  it('not a constructed line → empty', () => {
    expect(lineRuleText({ meta: {} })).toBe('');
    expect(lineRuleText({})).toBe('');
  });
});
