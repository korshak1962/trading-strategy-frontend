// Constructor editor UX Stage B, F-B3b.2 (screener logs/agents/architect.md §6.4, backend_dev.md B3):
// the B3 backend's plain messages no longer match the master regexes, so every extra hint the
// regexes gave on master must be reachable through the 400 body's `reason`. Each row pairs a master
// message with the B3 message of the same case (from pins/stage4c/validation.txt master vs
// feature/constructor-editor-ux-b3, or the B3 throw site's text) and asserts the same hint.
import { describe, expect, it } from 'vitest';
import { constructedErrorHint, CONSTRUCTED_HINTS, REASON_ADVICE } from '../../components/strategyConstructor/constructedFormat';
import { unitMismatchHint } from '../../components/universeScreener/conditionFormat';

// [reason, B3 message, master message]
const PAIRS = [
  ['AXIS_CONSTRAINT_VIOLATED',
    'Axis constraint 1: The axis values $TiltSell=0.02 and $TiltBuy=0 break the axis constraint $TiltSell <= $TiltBuy. Pick values that satisfy it; in Optimize every pair of the two axes\' grid values must satisfy it, so narrow their min / max.',
    '$TiltSell=0.02 <= $TiltBuy=0: violated (axis constraint $TiltSell <= $TiltBuy)'],
  ['AXIS_CONSTRAINT', 'Axis constraint 1: In $A <= $B the axis $B does not exist. Add it or pick another axis.',
    'constraint 1 ($A <= $B): unknown axis $B'],
  ['AXIS_CONSTRAINT', 'Axis constraints: A strategy has at most 5 axis constraints. Remove some.', 'At most 5 axis constraints'],
  ['CHANNEL_METRIC_B', 'Rule R2, condition 1, channel value: “Touches of the upper line” is not available in strategies yet. Use the position, slope, width, age or existence of the channel.',
    'R2.C1: TOUCHES_UPPER is not in semantics B yet'],
  ['CHANNEL_RUN_TF', '“Channel swing” v1, rule R1 (Buy): channel conditions run on Day or Week only, not on Hour. Run on Day or Week. Condition: “close is in the lower half of the channel”.',
    'channel conditions run on DAY / WEEK in stage 4'],
  ['BOUNDS_ORDER', 'Rule R1, condition 2, lower bound: On the axes\' grid the lower bound $BuyLow=0.3 is above the upper bound $BuyHigh=0.2. Narrow the axes\' min / max or add an axis constraint.',
    'R1.C2.min = $BuyLow=0.3 > R1.C2.max = $BuyHigh=0.2'],
  ['CHANNEL_DETECTOR_RANGE', 'Rule R1, condition 1, channel settings, min bars: Must be a whole number from 2 to 1000.',
    'R1.C1.channel.minBars must be in [2, 1000]'],
  ['POSITION_SHORT_CLOSE', 'Rule R3: Values of your open long (at entry, since entry) cannot be used in a Cover short rule: such a rule could only cancel this bar\'s long signals. Use a Sell rule to exit the long.',
    'R3: position operands in a ShortClose rule with them'],
  ['POSITION_RUN_TF', '“Level breakout (bricks)” v1, rule R2 (Sell): values of your open long work only on Day or Week runs, not on Hour. Run on Day or Week. Condition: “close is below the entry\'s stop”.',
    'position operands run on DAY / WEEK in stage 4c'],
  ['POSITION_PLACEMENT', 'Rule R1, condition 1, left value: Values of your open long (“Value at entry”) exist only in strategy rules. Remove it from the filter.',
    'R1.C1.left: position operands (AT_ENTRY) exist only in constructed strategy rules'],
  ['POSITION_X', 'Rule R1, condition 1, left value, its value: “Value at entry” reads a market value (a bar field, an indicator, a Levels value or a brick), not a number.',
    'R1.C1.left: AT_ENTRY reads a market series (a bar field, an indicator, LEVEL or a brick)'],
  ['POSITION_OFFSET', 'Rule R1, condition 1, left value, offset: Values of your open long have no offset. To look back use the lag of “Highest since entry” / “Lowest since entry”.',
    'R1.C1.left: position operands have no offset'],
  ['LEVELS_RUN_TF', '“Level breakout (bricks)” v1, rule R1 (Buy): Levels conditions and sequence bricks run on Day or Week only, not on Hour. Run on Day or Week. Condition: “Breakout confirmed”.',
    'level conditions and sequence bricks run on DAY / WEEK in stage 4'],
  ['BRICK_TF', 'Rule R1, condition 1, left value, timeframe: Levels conditions and sequence bricks read the strategy\'s own bars: set the timeframe to “Run TF”.',
    'R1.C1.left.x: WEEK operands inside a brick count bars of the run timeframe'],
  ['BRICK_ANCHOR', 'Rule R1, condition 1, left value, event: The event must be one market condition: a Levels event, a channel condition or a comparison without bricks.',
    'R1.C1.left.a: the anchor event must be one market condition (no bricks inside)'],
  ['BRICK_OFFSET', 'Rule R1, condition 1, left value, offset: A sequence brick has no offset. To look back use the lag of “Highest since event” / “Lowest since event”.',
    'R1.C1.left.offset: a sequence brick has no offset (use lag)'],
  ['LEVELS_FIELD_RANGE', 'Rule R2, condition 1, right value, event, Levels: Max bars in zone after touch: Must be a whole number from 1 to 500.',
    'R2.C1.right.a.levels.maxDwellBars must be in [1, 500]'],
  ['LEVELS_STRENGTH', 'Rule R1, condition 1, strength: “Support break” needs a zone strength above 0 and at most 50.',
    'R1.C1: a strength must be in (0, 50]'],
  ['SCREENER_STAGE4', 'Condition 1, left value: “Levels value” is not available in screener filters yet (Levels values and sequence bricks exist only in strategies). Remove it.',
    'R1.C1.left: LEVEL (levels and sequence bricks) arrives in the screener in stage 4d'],
  ['UNIT_MISMATCH', 'Rule R1, condition 1: the distance to support (ATR) is in ATR multiples and close is a price, so they cannot be compared. Compare it with another distance in ATR or a number.',
    "R1.C1: UNIT_MISMATCH: 'LEVEL(DIST_SUPPORT_ATR)' (ATR_MULTIPLE) vs 'close' (PRICE)"],
  ['UNIT_MISMATCH', 'Rule R1, condition 1: the previous open (day) is a price and ATR 14 (week) is a price range, so they cannot be compared. Compare ATR with another price range or a number; for a threshold in % of the price take ATR % instead.',
    "R1.C1: UNIT_MISMATCH: 'DAY open[-1]' (PRICE) vs 'WEEK ATR(14)[0]' (PRICE_RANGE)"],
  ['UNIT_MISMATCH', 'Rule R1, condition 1: the previous open (day) is a price and the previous volume (week) is a volume, so they cannot be compared. Compare values of one kind (a price with a price, a % with a %), or a value with a number.',
    "R1.C1: UNIT_MISMATCH: 'DAY open[-1]' (PRICE) vs 'WEEK volume[-1]' (VOLUME)"],
  ['RUN_TF_FIXED_OFFSET', '“SMA cross” v2, rule R1 (Buy): on Hour runs offsets and fixed timeframes are not supported yet: use “Run TF” values of this bar (offset 0) and numbers, or run on Day or Week. Condition: “close is above SMA 50 (day)”.',
    "R1 LongOpen: offsets and fixed timeframes on HOUR are not supported yet ('…'; use RUN operands at [0])"],
  ['INDICATOR_TF', '“ATR stop” v1, rule R1 (Buy): ATR 14 does not run on MIN5 yet. Run on a longer timeframe or pick another indicator.',
    'R1 LongOpen: ATR(14) on MIN5 is not supported yet'],
  ['RUN_TF_SCREENER', 'Rule R1, condition 1, left value, timeframe: “Run TF” exists only in strategies. Pick Day or Week.',
    'R1.C1.left.tf: RUN is for constructed strategies'],
  ['LENGTH_RANGE', 'Rule R1, condition 1, left value, length: $MaLength=205 is not allowed. The SMA length must be a whole number from 5 to 200.',
    'R1.C1.n ($MaLength = 205): must be an integer SMA length in [5, 200], got 205'],
  ['TOLERANCE_RANGE', 'Rule R1, condition 1, tolerance: $Tol=60 is not allowed. The tolerance must be a number above −50 % and below 50 %.',
    'R1.C1.tolerancePct ($Tol = 60): outside (-50, 50)'],
  ['AXIS_OUT_OF_RANGE', '$Gap: $Gap = -1 is below the axis\' lower limit 0. Change the value or the grid.',
    '$Gap must be >= 0, got -1'],
  ['LENGTH_RANGE', 'Rule R1, condition 1, left value, length: The ATR length must be a whole number from 2 to 100.',
    'R1.C1.left.n must be in [2, 100] for ATR'],
  ['LINK_INVALID', 'Rule R1, condition 1, tolerance: This threshold is a tolerance and $Len is a length: link an axis of the same kind.',
    'R1.C1.tolerancePct is a tolerance, $Len is a length'],
];

describe('B3 backend: every master regex hint is reachable by reason', () => {
  it.each(PAIRS)('%s: %s', (reason, message, master) => {
    const old = constructedErrorHint(master);
    expect(old).toBeTruthy();
    expect(constructedErrorHint(message, reason)).toBe(old);
  });

  it('the pairs cover every hint text (SMA not stored: no reason, regex fallback)', () => {
    const hints = new Set(PAIRS.map(([reason, message]) => constructedErrorHint(message, reason)));
    Object.entries(CONSTRUCTED_HINTS).forEach(([name, h]) => {
      if (name === 'smaNotStored') {
        // SmaSeriesLoader's message is unchanged and carries no reason
        expect(constructedErrorHint('SMA_NOT_AVAILABLE: SMA 205 (not stored)', null)).toBe(h);
        return;
      }
      if (typeof h === 'function') {
        expect(hints.has(h('$TiltSell <= $TiltBuy'))).toBe(true);
      } else {
        expect([name, hints.has(h)]).toEqual([name, true]);
      }
    });
  });

  it('screener filter errors (conditions[i]): unit hints by reason', () => {
    expect(unitMismatchHint('Condition 1: the previous open (day) is a price and ATR 14 (week) is a price range, so they cannot be compared.', 'UNIT_MISMATCH'))
      .toBe(unitMismatchHint("conditions[0]: UNIT_MISMATCH: 'DAY ATR(14)[0]' (PRICE_RANGE) vs 'DAY close[0]' (PRICE)"));
    expect(unitMismatchHint('Condition 1: RSI 14 (day) is a % and close (day) is a price, so they cannot be compared.', 'UNIT_MISMATCH'))
      .toBe(unitMismatchHint("conditions[0]: UNIT_MISMATCH: 'DAY RSI(14)[0]' (PERCENT) vs 'DAY close[0]' (PRICE)"));
  });

  it('every reason the B3 backend sends is mapped (no regex guess on a plain message); OTHER falls back', () => {
    const backend = ['RUN_TF_SCREENER', 'TF_NOT_ALLOWED', 'RUN_TF_FIXED_OFFSET', 'INDICATOR_TF', 'LENGTH_RANGE', 'OFFSET_RANGE',
      'TOLERANCE_RANGE', 'CONST_LEFT', 'BRICK_X', 'CONST_NOT_FINITE', 'AXIS_OUT_OF_RANGE', 'AXIS_UNKNOWN', 'AXIS_CONSTRAINT',
      'BOUNDS_ORDER', 'CHANNEL_RUN_TF', 'CHANNEL_METRIC_B', 'CHANNEL_DETECTOR_RANGE', 'LEVELS_RUN_TF',
      'LEVELS_FIELD_RANGE', 'LEVELS_STRENGTH', 'BRICK_TF', 'BRICK_ANCHOR', 'BRICK_OFFSET', 'POSITION_RUN_TF', 'POSITION_SHORT_CLOSE',
      'POSITION_PLACEMENT', 'POSITION_X', 'POSITION_OFFSET', 'SCREENER_STAGE4', 'BENCHMARK_MARKET', 'LIMITS', 'MISSING_FIELD',
      'UNKNOWN_KIND', 'UNKNOWN_VALUE', 'LAG_RANGE', 'CHANNEL_LEVEL', 'CHANNEL_BOUNDS', 'WITHIN_BARS', 'AXIS_INVALID', 'LINK_INVALID',
      'AXIS_UNUSED', 'RULE_INVALID', 'FILTER_INVALID'];
    backend.forEach((r) => expect([r, Object.prototype.hasOwnProperty.call(REASON_ADVICE, r)]).toEqual([r, true]));
    // a plain LAG_RANGE message that mentions a lag gets no stray brick-offset hint
    expect(constructedErrorHint('Rule R1, condition 1, left value, lag: Only “Highest since event” and “Lowest since event” have a lag. Set it to 0. Use lag 0.', 'LAG_RANGE')).toBeNull();
    // a linked value names the link; an unlinked one keeps the plain advice / none
    expect(constructedErrorHint('Rule R1, condition 1, tolerance: The tolerance must be a number above −50 % and below 50 %.', 'TOLERANCE_RANGE')).toBeNull();
    expect(constructedErrorHint('Rule R1, condition 1, its value: There is no length at this path.', 'LINK_INVALID')).toBeNull();
  });
});
