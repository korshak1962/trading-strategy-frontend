// Constructor editor UX Stage B, F-B3b.1 (screener logs/agents/architect.md §6.4, backend B3.4 / B3.5):
// warnings show `warningItems[i].message ?? warnings[i]` with the code in an ⓘ; next-bar partial
// names use the estimate's `displayName` (`<name> v<version>`) before the key's short name.
import { describe, expect, it } from 'vitest';
import { mergeWarningEntries, warningEntries, warningEntryOf, warningInfoText } from '../../utils/warningItems';
import { normalizePreview } from '../../api/constructedApi';
import { mergedPreviewWarningItems, mergedPreviewWarnings } from '../../components/strategyConstructor/previewFormat';
import { adaptNextTriggers } from '../../components/nextTriggers/nextTriggersAdapter';
import { estimateName, partialText } from '../../components/nextTriggers/nextTriggersFormat';

const W_OPEN = 'STATE_RULE_OPEN: R1 LongOpen fires on 92 % of the bars';
const ITEM_OPEN = { code: 'STATE_RULE_OPEN', message: 'Rule R1 (Buy) fires on 92 % of the bars: it acts as a state, not an event.' };

describe('warningEntries', () => {
  it('plain message + code by index; an item without code keeps the string', () => {
    expect(warningEntries([W_OPEN, 'other'], [ITEM_OPEN, { code: null, message: 'other' }])).toEqual([
      { text: W_OPEN, message: ITEM_OPEN.message, code: 'STATE_RULE_OPEN' },
      { text: 'other', message: 'other', code: null },
    ]);
  });

  it('older backend (no items) / items of another length → the strings, no code', () => {
    expect(warningEntries([W_OPEN])).toEqual([{ text: W_OPEN, message: W_OPEN, code: null }]);
    expect(warningEntries([W_OPEN, 'b'], [ITEM_OPEN])).toEqual([
      { text: W_OPEN, message: W_OPEN, code: null }, { text: 'b', message: 'b', code: null }]);
    expect(warningEntries(null, null)).toEqual([]);
  });

  it('non-string warnings are dropped together with their item', () => {
    expect(warningEntries(['', 7, W_OPEN], [{ code: 'X', message: 'x' }, { code: 'Y', message: 'y' }, ITEM_OPEN]))
      .toEqual([{ text: W_OPEN, message: ITEM_OPEN.message, code: 'STATE_RULE_OPEN' }]);
  });

  it('ⓘ text: the code and the machine string; nothing for a plain string', () => {
    expect(warningInfoText({ text: W_OPEN, message: ITEM_OPEN.message, code: 'STATE_RULE_OPEN' }))
      .toBe(`code: STATE_RULE_OPEN — ${W_OPEN}`);
    expect(warningInfoText({ text: 'x', message: 'x', code: 'POSITION_SOLO' })).toBe('code: POSITION_SOLO');
    expect(warningInfoText(warningEntryOf('client warning'))).toBeNull();
  });

  it('merge de-duplicates by the machine string', () => {
    const a = warningEntries([W_OPEN], [ITEM_OPEN]);
    expect(mergeWarningEntries(a, warningEntries([W_OPEN, 'W2']))).toEqual([a[0], { text: 'W2', message: 'W2', code: null }]);
  });
});

describe('preview normalizer', () => {
  const raw = {
    ticker: 'SPY', timeFrame: 'DAY', prices: [],
    rules: [{ ruleId: 1, signalType: 'LongOpen', label: 'x', warnings: [W_OPEN], warningItems: [ITEM_OPEN] }],
    warnings: ['POSITION_SOLO: solo run'],
    warningItems: [{ code: 'POSITION_SOLO', message: 'Solo run: this strategy reads its own position.' }],
    backtest: { warnings: ['POSITION_SOLO: solo run', 'B2'], warningItems: [{ code: 'POSITION_SOLO', message: 'Solo run: this strategy reads its own position.' }, { code: null, message: 'B2' }], chartDataDTO: {} },
  };

  it('keeps `warnings` strings (machines, POSITION_SOLO check) and adds shown entries', () => {
    const p = normalizePreview(raw);
    expect(p.warnings).toEqual(['POSITION_SOLO: solo run']);
    expect(p.rules[0].warnings).toEqual([W_OPEN]);
    expect(p.rules[0].warningItems).toEqual([{ text: W_OPEN, message: ITEM_OPEN.message, code: 'STATE_RULE_OPEN' }]);
    expect(mergedPreviewWarnings(p)).toEqual(['POSITION_SOLO: solo run', 'B2']);
    expect(mergedPreviewWarningItems(p).map((e) => [e.message, e.code])).toEqual([
      ['Solo run: this strategy reads its own position.', 'POSITION_SOLO'], ['B2', null]]);
  });

  it('older backend: the strings are the messages', () => {
    const p = normalizePreview({ ...raw, warningItems: undefined, rules: [{ ...raw.rules[0], warningItems: undefined }], backtest: null });
    expect(p.rules[0].warningItems).toEqual([{ text: W_OPEN, message: W_OPEN, code: null }]);
    expect(mergedPreviewWarningItems(p)).toEqual([{ text: 'POSITION_SOLO: solo run', message: 'POSITION_SOLO: solo run', code: null }]);
    // an object without warningItems (tests, older normalizer output)
    expect(mergedPreviewWarningItems({ warnings: ['a'] })).toEqual([{ text: 'a', message: 'a', code: null }]);
  });
});

describe('next-bar partial names', () => {
  const nt = (partialBecause) => adaptNextTriggers({
    status: 'OK', runKind: 'BACKTEST', basisClose: 100, atr: 2,
    merged: { key: 'MERGED', kind: 'LINES', partial: true, partialBecause, lines: [] },
    strategies: [{ key: 'Constructed:53@1', displayName: 'Level breakout (bricks) · base v1', kind: 'NOT_ESTIMABLE', lines: [] }],
  });

  it('displayName first (B3 backend)', () => {
    const n = nt([{ key: 'Constructed:53@1', displayName: 'Level breakout (bricks) · base v1', kind: 'NOT_ESTIMABLE',
      reason: 'Rule R2: Levels conditions and sequence bricks have no next-bar price yet', lines: [] }]);
    expect(n.strategies[0].displayName).toBe('Level breakout (bricks) · base v1');
    expect(partialText(n.merged)).toBe('partial: Level breakout (bricks) · base v1: Rule R2: Levels conditions and sequence bricks have no next-bar price yet');
  });

  it('no displayName (older backend, class strategy, string item) → the key short name, as before', () => {
    const n = nt([{ key: 'SmaStrategy', kind: 'NOT_ESTIMABLE', lines: [] }, 'RsiStrategy']);
    expect(n.merged.partialBecause.map((p) => p.displayName)).toEqual([null, null]);
    expect(partialText(n.merged)).toBe('partial: Sma, Rsi not fully estimable');
    expect(estimateName({ key: 'TrendStrategy', displayName: null })).toBe('Trend');
  });
});
