// Level range zones stage 2 (frontend): the variant in the saved Levels params, the chip label,
// the request's variant, /variants normalization, and the zone card / tooltip extra lines.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEVEL_PARAMS, effectiveLevelVariant, levelsLabel, sanitizeItems, sanitizeLevelParams,
} from '../../components/indicatorsChart/indicatorSet';
import { normalizeLevelVariants } from '../../api/indicatorApi';
import { levelZoneExtras, normalizeBreakouts } from '../../utils/levelZones';

const VARIANTS = normalizeLevelVariants([
  { id: 'LEGACY', label: 'Legacy', description: 'today', isDefault: true, legacy: true },
  { id: 'PT_A', label: 'Pass-through A', description: 'pt', isDefault: false, legacy: false },
]);

describe('sanitizeLevelParams', () => {
  it('loads an old saved set without the field as the default', () => {
    expect(sanitizeLevelParams({ minStrength: 4, nearestN: 3, allZones: true }))
      .toEqual({ minStrength: 4, nearestN: 3, allZones: true, variant: null });
    expect(DEFAULT_LEVEL_PARAMS.variant).toBeNull();
  });
  it('keeps a well-formed id and drops junk', () => {
    expect(sanitizeLevelParams({ variant: 'PT_A' }).variant).toBe('PT_A');
    expect(sanitizeLevelParams({ variant: '' }).variant).toBeNull();
    expect(sanitizeLevelParams({ variant: 'a b' }).variant).toBeNull();
    expect(sanitizeLevelParams({ variant: 7 }).variant).toBeNull();
  });
  it('restores the variant from storage', () => {
    const { items } = sanitizeItems([{ id: 'x', kind: 'LEVELS', params: { minStrength: 1, nearestN: 2, variant: 'D1' } }], []);
    expect(items[0].params.variant).toBe('D1');
  });
});

describe('effectiveLevelVariant / levelsLabel', () => {
  it('sends nothing for the default', () => {
    expect(effectiveLevelVariant({ variant: null }, VARIANTS)).toBeNull();
    expect(effectiveLevelVariant({ variant: 'LEGACY' }, VARIANTS)).toBeNull();
    expect(effectiveLevelVariant({}, null)).toBeNull();
  });
  it('sends a non-default id, also before the list is known', () => {
    expect(effectiveLevelVariant({ variant: 'PT_A' }, VARIANTS)).toBe('PT_A');
    expect(effectiveLevelVariant({ variant: 'PT_A' }, null)).toBe('PT_A');
  });
  it('labels the chip', () => {
    expect(levelsLabel({ allZones: true, nearestN: 2, minStrength: 4 })).toBe('Levels (all, strength ≥ 4)');
    expect(levelsLabel({ allZones: true, nearestN: 2, minStrength: 4 }, 'PT_A')).toBe('Levels (PT_A, all, strength ≥ 4)');
    expect(levelsLabel({ allZones: false, nearestN: 2, minStrength: 0 }, null)).toBe('Levels (N 2, strength ≥ 0)');
  });
});

describe('normalizeLevelVariants', () => {
  it('cleans rows', () => {
    expect(normalizeLevelVariants([{ id: 'X' }, null, { label: 'no id' }])).toEqual([
      { id: 'X', label: 'X', description: '', isDefault: false, legacy: false },
    ]);
    expect(normalizeLevelVariants(null)).toEqual([]);
    expect(VARIANTS[0]).toMatchObject({ isDefault: true, legacy: true });
  });
});

describe('levelZoneExtras', () => {
  it('shows nothing for a legacy / old-backend zone', () => {
    expect(levelZoneExtras({ low: 1, high: 2 })).toEqual({ crossings: null, rawBand: null });
    expect(levelZoneExtras({
      low: 1, high: 2, rawLow: 1, rawHigh: 2, crossings: { count: 0, up: 0, down: 0, penalised: 0, last: null },
    })).toEqual({ crossings: null, rawBand: null });
  });
  it('shows crossings and a narrowed band', () => {
    const e = levelZoneExtras({
      low: 10.5, high: 11, rawLow: 10, rawHigh: 11.25,
      crossings: { count: 5, up: 3, down: 2, penalised: 2, last: '2026-09-18T00:00:00' },
    });
    expect(e.crossings).toBe('crossed 5× (penalised 2), last 2026-09-18');
    expect(e.rawBand).toBe('raw band 10.00–11.25');
  });
  it('omits a missing last date', () => {
    expect(levelZoneExtras({ crossings: { count: 1, penalised: 0, last: null } }).crossings).toBe('crossed 1× (penalised 0)');
  });
});

describe('normalizeBreakouts', () => {
  it('absent -> null', () => {
    expect(normalizeBreakouts(undefined)).toBeNull();
    expect(normalizeBreakouts(null)).toBeNull();
  });
  it('reads counts and the last date', () => {
    const b = normalizeBreakouts({ up: 2, down: 1, failed: 0, last: '2023-10-05T00:00:00' });
    expect(b).toMatchObject({ up: 2, down: 1, failed: 0 });
    expect(Number.isFinite(b.lastMs)).toBe(true);
    expect(Number.isNaN(normalizeBreakouts({ up: 1, down: 0, failed: 0, last: null }).lastMs)).toBe(true);
  });
});
