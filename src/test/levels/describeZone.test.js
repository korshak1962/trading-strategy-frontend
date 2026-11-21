// LevelBreakoutRetest removal (screener architect_lbr_removal_v1.md §7, risk 4): describeZone /
// zoneStrengthAt moved from the deleted utils/levelChart.js into utils/levelZones.js without the
// `levelChart` parameter. The zone bands and their tooltip stay for strategies that send
// `levelZones[]`; this pins what the tooltip gets from a normalized segment alone, and with the
// optional strategy params / ATR a later task can pass in.
import { describe, expect, it } from 'vitest';
import {
  byZoneLowThenId, describeZone, normalizeLevelZoneSegments, zoneStrengthAt,
} from '../../utils/levelZones';
import { parseExchangeTs } from '../../utils/dates';

const DATES = ['2024-01-02T00:00:00', '2024-01-03T00:00:00', '2024-01-04T00:00:00', '2024-01-05T00:00:00'];
const CLOSES = [100, 104, 99, 101];
const barIndexByMs = new Map(DATES.map((d, i) => [parseExchangeTs(d).getTime(), i]));

const [SEGMENT] = normalizeLevelZoneSegments([{
  zoneId: 7, from: DATES[1], to: DATES[3], low: 101, high: 102, strong: true, armed: true, trigger: true,
  center: 101.5, touchCount: 3, flipCount: 1, firstTouchDate: DATES[0], lastTouchDate: DATES[1],
  strengthAtFrom: 4, breakouts: { up: 2, down: 1, failed: 0, last: DATES[0] },
}]);
const HIT = { segment: SEGMENT, band: { zoneId: 7, low: 101, high: 102 } };
const BASE = { closes: CLOSES, barIndexByMs, breakoutLine: 102.5 };

describe('describeZone (levelZones.js, no levelChart)', () => {
  it('describes a segment from the segment and the closes alone', () => {
    const z = describeZone(HIT, 2, BASE);
    expect(z.zoneId).toBe(7);
    expect(z.hasSegment).toBe(true);
    expect([z.strong, z.armed, z.trigger]).toEqual([true, true, true]);
    expect([z.low, z.high, z.width, z.center]).toEqual([101, 102, 1, 101.5]);
    // previous close 104 is above the band: edge 102, (102 - 104) / 104
    expect(z.position.side).toBe('below');
    expect(z.position.pct).toBeCloseTo(-2 / 104, 12);
    expect(z.position.atr).toBeNaN();
    expect(z.touchCount).toBe(3);
    expect(z.flipCount).toBe(1);
    expect(z.breakoutLine).toBe(102.5);
    expect(z.breakouts).toEqual({ up: 2, down: 1, failed: 0, lastMs: parseExchangeTs(DATES[0]).getTime() });
    expect([z.fromMs, z.toMs]).toEqual([parseExchangeTs(DATES[1]).getTime(), parseExchangeTs(DATES[3]).getTime()]);
    // without strategy params: strength at segment start, no gate / minimum / fail line / ATR width
    expect(z.strength).toBe(4);
    expect(z.strengthExact).toBe(false);
    expect(z.strengthGate).toBeNaN();
    expect(z.minTouches).toBeNaN();
    expect(z.failLine).toBeNaN();
    expect(z.widthAtr).toBeNaN();
    expect(z).not.toHaveProperty('roles');
  });

  it('reports a band containing the previous close, and no breakout line for a non-trigger zone', () => {
    const [seg] = normalizeLevelZoneSegments([{ zoneId: 8, from: DATES[1], to: DATES[3], low: 98, high: 100, trigger: false }]);
    const z = describeZone({ segment: seg, band: { zoneId: 8, low: 98, high: 100 } }, 3, BASE);
    expect(z.position).toEqual({ side: 'contains' }); // close(t-1) = 99
    expect(z.breakoutLine).toBeNaN();
  });

  it('falls back to the band when the hit has no segment', () => {
    const z = describeZone({ segment: null, band: { zoneId: 9, low: 110, high: 112 } }, 1, BASE);
    expect(z.zoneId).toBe(9);
    expect(z.hasSegment).toBe(false);
    expect([z.strong, z.armed, z.trigger]).toEqual([null, null, null]);
    expect(z.position.side).toBe('above'); // edge 110 over close(t-1) 100
    expect(z.position.pct).toBeCloseTo(0.1, 12);
    expect(z.strength).toBeNaN();
    expect(z.breakouts).toBeNull();
  });

  it('has no position on the first bar (no previous close)', () => {
    expect(describeZone(HIT, 0, BASE).position).toBeNull();
  });

  it('uses the optional params and ATR: decayed strength, gate, minimum, fail line, ATR distances', () => {
    const atr = [2, 2, 2, 2];
    const params = { decayBars: 10, flipBonus: 0.5, minStrength: 3, minTouches: 2, breakBuffer: 0.25 };
    const z = describeZone(HIT, 3, { ...BASE, params, atr });
    // floor = 0.5 * 1 flip; 2 bars after `from` (index 1)
    expect(z.strength).toBeCloseTo(0.5 + 3.5 * Math.exp(-2 / 10), 12);
    expect(z.strengthExact).toBe(true);
    expect(z.strengthGate).toBe(3);
    expect(z.minTouches).toBe(2);
    expect(z.failLine).toBeCloseTo(101 - 0.25 * 2, 12);
    expect(z.widthAtr).toBeCloseTo(0.5, 12);
    expect(z.position.atr).toBeCloseTo((101 - 99) / 2, 12); // band above close(t-1) 99
  });

  it('ignores an ATR array not aligned with the bars', () => {
    const z = describeZone(HIT, 3, { ...BASE, atr: [2, 2] });
    expect(z.widthAtr).toBeNaN();
    expect(z.position.atr).toBeNaN();
  });
});

describe('zoneStrengthAt / byZoneLowThenId', () => {
  it('is exact only with a resolvable from index and decay', () => {
    expect(zoneStrengthAt(SEGMENT, 3, 1, { decayBars: 10, flipBonus: 0.5 }).exact).toBe(true);
    expect(zoneStrengthAt(SEGMENT, 3, undefined, { decayBars: 10, flipBonus: 0.5 })).toEqual({ value: 4, exact: false });
    expect(zoneStrengthAt(SEGMENT, 3, 1, null)).toEqual({ value: 4, exact: false });
    expect(zoneStrengthAt(null, 3, 1, {})).toEqual({ value: NaN, exact: false });
  });

  it('orders by zone low, then id', () => {
    const rows = [{ zoneLow: 5, zoneId: 2 }, { zoneLow: 3, zoneId: 9 }, { zoneLow: 5, zoneId: 1 }];
    expect(rows.sort(byZoneLowThenId)).toEqual([{ zoneLow: 3, zoneId: 9 }, { zoneLow: 5, zoneId: 1 }, { zoneLow: 5, zoneId: 2 }]);
  });
});
