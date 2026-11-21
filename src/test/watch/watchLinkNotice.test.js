// LevelBreakoutRetest removal (screener architect_lbr_removal_v1.md D7 / §7, acceptance A7): the
// watch deep link of a frozen signal of the removed class answers 200 with `config: null` and
// `removed {strategyClass, message, caseId, caseName}`. watchLinkNotice decides whether the link
// fills the form (null) or shows the message with an "Open case #<id>" button.
import { describe, expect, it } from 'vitest';
import { watchLinkNotice } from '../../components/watch/format';

const MESSAGE = 'This signal was announced by the removed strategy LevelBreakoutRetest (before the switch to the '
  + 'template); its chart is not available. The template runs as case #318.';

describe('watchLinkNotice', () => {
  it('is null for an ordinary deep link (config, no removed)', () => {
    expect(watchLinkNotice({ config: { ticker: 'SPY' }, watchId: 23, focusBarDate: '2026-10-01T00:00:00' })).toBeNull();
    expect(watchLinkNotice({ config: { ticker: 'SPY' }, removed: null })).toBeNull();
    expect(watchLinkNotice(null)).toBeNull();
    expect(watchLinkNotice(undefined)).toBeNull();
  });

  it('carries the backend message and the case to open (A7: watch #23, signal #57 -> case #318)', () => {
    const n = watchLinkNotice({
      config: null,
      watchId: 23,
      removed: { strategyClass: 'LevelBreakoutRetestStrategy', message: MESSAGE, caseId: 318, caseName: 'SPY bricks base' },
    });
    expect(n).toEqual({
      message: MESSAGE,
      strategyClass: 'LevelBreakoutRetestStrategy',
      caseId: 318,
      caseName: 'SPY bricks base',
      openLabel: 'Open case #318',
      missingText: 'Case #318 no longer exists',
    });
  });

  it('accepts a numeric string id and has no button without a usable case id', () => {
    expect(watchLinkNotice({ removed: { message: 'x', caseId: '318' } }).openLabel).toBe('Open case #318');
    [null, undefined, 0, -1, 1.5, 'abc', ''].forEach((caseId) => {
      const n = watchLinkNotice({ removed: { message: 'x', caseId } });
      expect(n.caseId, String(caseId)).toBeNull();
      expect(n.openLabel).toBeNull();
      expect(n.missingText).toBeNull();
    });
  });

  it('writes its own message when the backend sends none', () => {
    expect(watchLinkNotice({ removed: { strategyClass: 'LevelBreakoutRetestStrategy', caseId: 318 } }).message)
      .toBe('This signal was announced by the removed strategy LevelBreakoutRetestStrategy; its chart is not available.');
    expect(watchLinkNotice({ removed: { message: '  ' } }).message)
      .toBe('This signal was announced by the removed strategy (unknown); its chart is not available.');
    expect(watchLinkNotice({ removed: { message: 'x', caseName: '' } }).caseName).toBeNull();
  });

  it('ignores a malformed removed field', () => {
    expect(watchLinkNotice({ removed: 'LevelBreakoutRetestStrategy' })).toBeNull();
    expect(watchLinkNotice({ removed: [] })).toBeNull();
  });
});
