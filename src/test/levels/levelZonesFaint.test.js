// Constructor editor UX Stage B, B4 (screener logs/agents/architect.md §3, gate GB8): dense
// "All strong zones" drawn faint.
//
// The fixture `level_zone_runs_master.json` was recorded once with master f278949's
// buildLevelZoneRuns (a copy of `git show master:src/utils/levelZones.js`) on two synthetic
// zone sets (DAY 90 bars / 24 segments, WEEK 120 bars / 30 segments) under 7 option sets; each
// run's `segment` is stored as its normalized key. It is never regenerated from the working tree.
import { describe, expect, it } from 'vitest';
import master from '../fixtures/level_zones/level_zone_runs_master.json';
import {
  buildLevelZoneRuns, normalizeLevelZoneSegments, selectNearest, clampNearestN,
  levelZoneSettingsFromStored, levelZoneSettingsToStore, LEVEL_ZONES_DEFAULT_SETTINGS,
} from '../../utils/levelZones';
import { parseExchangeTs } from '../../utils/dates';

const setOf = (name) => master.sets.find(s => s.name === name);
const plain = (runs) => runs.map(r => ({ ...r, segment: r.segment.key }));
const masterCases = (pred) => master.cases.filter(c => pred(c.options));

/** Per bar index: the sorted segment keys drawn there. */
const coverage = (runs) => {
  const byBar = new Map();
  runs.forEach(r => {
    const key = typeof r.segment === 'object' ? r.segment.key : r.segment;
    for (let i = r.startIndex; i <= r.endIndex; i++) {
      if (!byBar.has(i)) byBar.set(i, []);
      byBar.get(i).push(key);
    }
  });
  byBar.forEach(list => list.sort((a, b) => a - b));
  return Object.fromEntries([...byBar.entries()].sort((a, b) => a[0] - b[0]));
};

describe('GB8: without "All strong zones" the runs equal master', () => {
  const cases = masterCases(o => o.allStrong !== true);
  it('covers both sets and several option sets', () => {
    expect(cases.length).toBe(10);
  });
  cases.forEach(c => {
    it(`${c.set} ${JSON.stringify(c.options)}`, () => {
      const set = setOf(c.set);
      const runs = buildLevelZoneRuns(set.prices, set.levelZones, c.options);
      expect(plain(runs)).toStrictEqual(c.runs); // no `faint` key, nothing else changed
      expect(runs.some(r => 'faint' in r)).toBe(false);
    });
  });
});

describe('"All strong zones": faint classification', () => {
  const cases = masterCases(o => o.allStrong === true);

  cases.forEach(c => {
    const set = setOf(c.set);
    const runs = buildLevelZoneRuns(set.prices, set.levelZones, c.options);

    it(`${c.set} ${JSON.stringify(c.options)}: draws the same zones per bar as master`, () => {
      expect(coverage(runs)).toStrictEqual(coverage(c.runs));
    });

    it(`${c.set} ${JSON.stringify(c.options)}: nearest / trigger / weak solid, the other strong zones faint`, () => {
      const nearestN = clampNearestN(c.options.nearestN ?? 1);
      const segments = normalizeLevelZoneSegments(set.levelZones);
      const times = set.prices.map(p => parseExchangeTs(p.date).getTime());
      let faintBars = 0;
      runs.forEach(run => {
        expect(typeof run.faint).toBe('boolean');
        for (let i = run.startIndex; i <= run.endIndex; i++) {
          const t = times[i];
          const ref = Number(set.prices[i - 1].close);
          const strong = segments.filter(s => s.strong && s.fromMs <= t && t <= s.toMs);
          const nearestKeys = new Set(selectNearest(strong, ref, nearestN).map(s => s.key));
          const seg = run.segment;
          const expected = seg.strong && !seg.trigger && !nearestKeys.has(seg.key);
          expect(run.faint).toBe(expected);
          if (seg.trigger || !seg.strong) expect(run.faint).toBe(false);
          if (run.faint) faintBars++;
        }
      });
      expect(faintBars).toBeGreaterThan(0); // the fixture really exercises the faint path
    });
  });

  it('splits a run where a segment turns faint or back', () => {
    const set = setOf('day');
    const runs = buildLevelZoneRuns(set.prices, set.levelZones, { allStrong: true });
    const bySeg = new Map();
    runs.forEach(r => {
      if (!bySeg.has(r.segment.key)) bySeg.set(r.segment.key, []);
      bySeg.get(r.segment.key).push(r);
    });
    let splits = 0;
    bySeg.forEach(list => {
      list.sort((a, b) => a.startIndex - b.startIndex);
      for (let k = 1; k < list.length; k++) {
        if (list[k].startIndex === list[k - 1].endIndex + 1) {
          expect(list[k].faint).not.toBe(list[k - 1].faint); // adjacent runs only when the state changed
          splits++;
        }
      }
    });
    expect(splits).toBeGreaterThan(0);
  });

  it('a small hand-made case: the nearest zone solid, the far one faint, the trigger solid', () => {
    const prices = ['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09']
      .map((date, i) => ({ date, close: [100, 100, 100, 120][i] }));
    const seg = (zoneId, low, high, extra = {}) => ({
      zoneId, from: '2025-01-06', to: '2025-01-09', low, high, strong: true, armed: false, trigger: false, ...extra,
    });
    const runs = buildLevelZoneRuns(prices, [
      seg(1, 104, 105), seg(2, 110, 111), seg(3, 115, 116, { trigger: true }), seg(4, 90, 91, { strong: false }),
    ], { nearestN: 1, allStrong: true, showWeak: true });
    const faintOf = (id) => runs.filter(r => r.zoneId === id).map(r => [r.startIndex, r.endIndex, r.faint]);
    expect(faintOf(1)).toEqual([[1, 3, false]]); // nearest above while ref = 100 (bars 1-3)
    expect(faintOf(2)).toEqual([[1, 3, true]]); // second above: faint
    expect(faintOf(3)).toEqual([[1, 3, false]]); // trigger: never faint
    expect(faintOf(4)).toEqual([[1, 3, false]]); // weak (showWeak): never faint
  });
});

describe('zone settings storage: "All strong zones" is session-only', () => {
  it('drops allStrong when saving', () => {
    expect(JSON.parse(levelZoneSettingsToStore({ nearestN: 3, showWeak: true, allStrong: true })))
      .toStrictEqual({ nearestN: 3, showWeak: true });
  });
  it('ignores a stored allStrong (an older build saved it) and keeps N / weak', () => {
    expect(levelZoneSettingsFromStored('{"nearestN":3,"showWeak":true,"allStrong":true}'))
      .toStrictEqual({ nearestN: 3, showWeak: true, allStrong: false });
  });
  it('round trip', () => {
    const s = { nearestN: 2, showWeak: false, allStrong: true };
    expect(levelZoneSettingsFromStored(levelZoneSettingsToStore(s)))
      .toStrictEqual({ nearestN: 2, showWeak: false, allStrong: false });
  });
  it('defaults on empty / unreadable storage', () => {
    expect(levelZoneSettingsFromStored(null)).toStrictEqual({ ...LEVEL_ZONES_DEFAULT_SETTINGS });
    expect(levelZoneSettingsFromStored('{not json')).toStrictEqual({ ...LEVEL_ZONES_DEFAULT_SETTINGS });
    expect(levelZoneSettingsFromStored('{"nearestN":99}').nearestN).toBe(5);
  });
});

describe('drawLevelZones: faint runs are one path, one fill', () => {
  const mockCtx = () => {
    const calls = [];
    const rec = (name) => (...args) => calls.push([name, ...args]);
    return {
      calls,
      save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'), rect: rec('rect'),
      fill: rec('fill'), fillRect: rec('fillRect'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
      stroke: rec('stroke'), setLineDash: rec('setLineDash'),
      set fillStyle(v) { calls.push(['fillStyle', v]); },
      set strokeStyle(v) { calls.push(['strokeStyle', v]); },
      set lineWidth(v) { calls.push(['lineWidth', v]); },
    };
  };
  const range = [new Date('2025-01-01T00:00:00Z'), new Date('2025-02-01T00:00:00Z')];
  const ms = (d) => new Date(`${d}T00:00:00Z`).getTime();
  const run = (low, high, extra = {}) => ({
    low, high, strong: true, outlined: false, startMs: ms('2025-01-05'), endMs: ms('2025-01-20'), ...extra,
  });

  it('three overlapping faint runs: one beginPath, three rects, one fill, drawn before the solid ones', async () => {
    const { drawLevelZones } = await import('../../utils/ChartDrawingUtils');
    const ctx = mockCtx();
    drawLevelZones(ctx, [
      run(100, 102), run(101, 103, { faint: true }), run(101.5, 103.5, { faint: true }), run(102, 104, { faint: true }),
    ], range, { min: 90, max: 110 }, 800, 400);
    const names = ctx.calls.map(c => c[0]);
    expect(names.filter(n => n === 'rect')).toHaveLength(3);
    expect(names.filter(n => n === 'fill')).toHaveLength(1);
    expect(names.filter(n => n === 'beginPath')).toHaveLength(1); // the solid run has no outline
    expect(names.filter(n => n === 'fillRect')).toHaveLength(1);
    expect(names.indexOf('fill')).toBeLessThan(names.indexOf('fillRect'));
    expect(names).not.toContain('stroke');
  });

  it('no faint run: no path fill at all (the default drawing is unchanged)', async () => {
    const { drawLevelZones } = await import('../../utils/ChartDrawingUtils');
    const ctx = mockCtx();
    drawLevelZones(ctx, [run(100, 102), run(105, 106, { strong: false }), run(103, 104, { outlined: true })],
      range, { min: 90, max: 110 }, 800, 400);
    const names = ctx.calls.map(c => c[0]);
    expect(names).not.toContain('fill');
    expect(names).not.toContain('rect');
    expect(names.filter(n => n === 'fillRect')).toHaveLength(3);
  });
});
