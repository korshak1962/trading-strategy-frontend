// Gate G2a (editor UX Stage A): load → edit nothing → save sends the request master sends.
import { describe, expect, it } from 'vitest';
import { fromConstructedDTO, toConstructedRequest, toDefinitionRequest } from '../../api/constructedApi';
import { fromFilterDTO, toFilterRequest } from '../../api/screenerApi';
import { baseline, fixture, wire } from './baselines';

// The screener editor opens a filter with the meta's detector defaults; fixed here (any values: the
// stored filter versions carry every detector key).
const DETECTOR_DEFAULTS = { coveragePct: 0.95, minBars: 5, minWidthPct: 0.05, minAnnualYieldPct: -2, maxAnnualYieldPct: 100, logPrice: true };

const fx = fixture();

const actualConstructed = () => Object.fromEntries(fx.constructed.map((e) => {
  const draft = fromConstructedDTO(e.dto);
  return [e.id, {
    constructedRequest: wire(toConstructedRequest(draft, draft)),
    definitionRequest: wire(toDefinitionRequest(draft)),
  }];
}));

const actualFilters = () => Object.fromEntries(fx.filters.map((e) => [e.id,
  { filterRequest: wire(toFilterRequest(fromFilterDTO(e.dto, DETECTOR_DEFAULTS))) }]));

const ACTUAL = { constructed: actualConstructed(), filters: actualFilters() };
const EXPECTED = baseline('roundtrip_expected.json', ACTUAL);

describe('G2a round trip', () => {
  it('fixture covers every stored version, template variant and hand-made definition', () => {
    expect(fx.counts.alpha).toBe(25);
    expect(fx.counts.filters).toBe(4);
    expect(fx.counts.templates).toBeGreaterThanOrEqual(22);
    expect(fx.constructed.length).toBe(fx.counts.constructed);
  });

  it('constructed: toConstructedRequest(fromConstructedDTO(dto)) == master', () => {
    for (const id of Object.keys(EXPECTED.constructed)) {
      expect(ACTUAL.constructed[id], id).toEqual(EXPECTED.constructed[id]);
    }
    expect(Object.keys(ACTUAL.constructed).sort()).toEqual(Object.keys(EXPECTED.constructed).sort());
  });

  it('filters: toFilterRequest(fromFilterDTO(dto)) == master', () => {
    for (const id of Object.keys(EXPECTED.filters)) {
      expect(ACTUAL.filters[id], id).toEqual(EXPECTED.filters[id]);
    }
  });
});
