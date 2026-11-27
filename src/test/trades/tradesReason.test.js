// Constructor editor UX Stage B, B2 (screener designer.md §6.3, m7a): the Trades reason cells -
// displayComment ?? comment, the two-level split (head / body / also), the title with the code, the
// expand-row toggle and the Excel reason.
import { describe, expect, it } from 'vitest';
import { reasonOf, splitReason, reasonTitle, toggleExpanded, excelOpenReason } from '../../components/tradesReason';

const CODE = 'R1 LongOpen: LEVEL CONFIRMED_ANY (RETEST, zone 379.46–390.24) AND DAY close[0] > DAY SMA(50)[0]';
const DISPLAY = 'R1 Buy: Breakout confirmed by a retest (zone 379.46–390.24) and close is above SMA 50';

describe('reasonOf: displayComment ?? comment', () => {
  it('prefers the plain-English twin, keeps the code', () => {
    expect(reasonOf({ comment: CODE, displayComment: DISPLAY })).toEqual({ text: DISPLAY, code: CODE });
  });

  it('falls back to the code comment (older backend, old row, class strategy)', () => {
    expect(reasonOf({ comment: CODE })).toEqual({ text: CODE, code: CODE });
    expect(reasonOf({ comment: CODE, displayComment: null })).toEqual({ text: CODE, code: CODE });
    expect(reasonOf({ comment: CODE, displayComment: '' })).toEqual({ text: CODE, code: CODE });
    expect(reasonOf({})).toEqual({ text: '', code: '' });
  });

  it('a seeded signal keeps its SEEDED comment as the code (the seeded check reads comment)', () => {
    const r = reasonOf({ comment: 'SEEDED position', displayComment: undefined });
    expect(r.code.startsWith('SEEDED')).toBe(true);
  });
});

describe('splitReason: the two-level cell', () => {
  it('display text: head, body, also line', () => {
    expect(splitReason("R2 Sell: close is below the entry's stop · also R3 Sell, R4 Sell")).toEqual({
      head: 'R2 Sell', body: "close is below the entry's stop", also: 'also R3 Sell, R4 Sell',
    });
    expect(splitReason(DISPLAY)).toEqual({ head: 'R1 Buy', body: DISPLAY.slice('R1 Buy: '.length), also: null });
  });

  it('a multi-word head (Block long entry, Open short)', () => {
    expect(splitReason('R3 Open short: low is below the previous low').head).toBe('R3 Open short');
  });

  it('code fallback: `; also: ` splits the same way', () => {
    expect(splitReason('R2 LongClose: DAY close[0] < AT_ENTRY(OPEN_STOP); also: R3 LongClose')).toEqual({
      head: 'R2 LongClose', body: 'DAY close[0] < AT_ENTRY(OPEN_STOP)', also: 'also R3 LongClose',
    });
  });

  it('prose without a rule head (class strategies) and empty', () => {
    expect(splitReason('LevelBreakoutRetest: retest of 412.5')).toEqual({ head: null, body: 'LevelBreakoutRetest: retest of 412.5', also: null });
    expect(splitReason('')).toEqual({ head: null, body: '', also: null });
    expect(splitReason(null)).toEqual({ head: null, body: '', also: null });
  });
});

describe('title, toggle, Excel', () => {
  it('title = display + blank line + code when they differ', () => {
    expect(reasonTitle(DISPLAY, CODE)).toBe(`${DISPLAY}\n\ncode: ${CODE}`);
    expect(reasonTitle(CODE, CODE)).toBe(CODE);
    expect(reasonTitle('', '')).toBe('');
  });

  it('each row toggles independently, the input set is not mutated', () => {
    const a = new Set();
    const b = toggleExpanded(a, 1);
    const c = toggleExpanded(b, 2);
    const d = toggleExpanded(c, 1);
    expect([...a]).toEqual([]);
    expect([...b]).toEqual([1]);
    expect([...c].sort()).toEqual([1, 2]);
    expect([...d]).toEqual([2]);
  });

  it('Excel open reason: the plain text, SEEDED first on the seeded trade', () => {
    expect(excelOpenReason({ openReason: DISPLAY, seeded: false })).toBe(DISPLAY);
    expect(excelOpenReason({ openReason: DISPLAY, seeded: true })).toBe(`SEEDED (your entry) ${DISPLAY}`);
    expect(excelOpenReason({ openReason: '', seeded: true })).toBe('SEEDED (your entry)');
  });
});
