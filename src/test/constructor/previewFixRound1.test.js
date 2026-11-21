// Constructor preview, fix round 1 (frontend_tester_constructor_preview_backtest.md #2, #3):
// the stale notice names its cause (rules / settings / both); an unsaved draft's backend key
// `Constructed:preview` is shown as the draft's name in the next-bar card and the other texts.
import { describe, expect, it } from 'vitest';
import {
  previewSettingsOf, previewStaleReason, previewStaleText, relabelUnsavedDraft, unsavedDraftLabel, UNSAVED_PREVIEW_KEY,
} from '../../components/strategyConstructor/previewFormat';
import { adaptNextTriggers } from '../../components/nextTriggers/nextTriggersAdapter';

const form = { ticker: 'spy', timeFrame: 'DAY', startDay: '2024-01-01', endDay: '2024-06-30', longOnly: false };

describe('previewStaleReason / previewStaleText', () => {
  const ranWith = previewSettingsOf(form);

  it('is up to date when neither the rules nor the settings changed', () => {
    expect(previewStaleReason({ previewSig: 'a', draftSig: 'a', ranWith, form })).toBeNull();
    expect(previewStaleText(null)).toBeNull();
  });

  it('normalizes the ticker as the request does', () => {
    expect(previewStaleReason({ previewSig: 'a', draftSig: 'a', ranWith, form: { ...form, ticker: ' SPY ' } })).toBeNull();
  });

  it('Long only alone is a settings change, not a rules change', () => {
    const r = previewStaleReason({ previewSig: 'a', draftSig: 'a', ranWith, form: { ...form, longOnly: true } });
    expect(r).toBe('settings');
    expect(previewStaleText(r)).toBe('The settings changed after this preview — run it again.');
  });

  it.each([['ticker', 'QQQ'], ['timeFrame', 'WEEK'], ['startDay', '2023-01-01'], ['endDay', '2024-07-01']])(
    'a changed %s is a settings change', (k, v) => {
      expect(previewStaleReason({ previewSig: 'a', draftSig: 'a', ranWith, form: { ...form, [k]: v } })).toBe('settings');
    },
  );

  it('a rule edit keeps the rules text', () => {
    const r = previewStaleReason({ previewSig: 'a', draftSig: 'b', ranWith, form });
    expect(r).toBe('rules');
    expect(previewStaleText(r)).toBe('The rules changed after this preview — run it again.');
  });

  it('both changed', () => {
    const r = previewStaleReason({ previewSig: 'a', draftSig: 'b', ranWith, form: { ...form, longOnly: true } });
    expect(r).toBe('both');
    expect(previewStaleText(r)).toBe('The rules and the settings changed after this preview — run it again.');
  });

  it('without the run settings only the rules are compared', () => {
    expect(previewStaleReason({ previewSig: 'a', draftSig: 'a', ranWith: null, form })).toBeNull();
  });
});

describe('unsaved draft label', () => {
  it('names the draft, or says "Unsaved draft" without a name', () => {
    expect(unsavedDraftLabel('My MA')).toBe('My MA (unsaved)');
    expect(unsavedDraftLabel('  ')).toBe('Unsaved draft');
    expect(unsavedDraftLabel(null)).toBe('Unsaved draft');
  });

  const draftPreview = () => ({
    key: UNSAVED_PREVIEW_KEY,
    prices: [{ date: '2024-01-02T00:00:00', close: 1 }],
    warnings: [`${UNSAVED_PREVIEW_KEY}: POSITION_SOLO`],
    backtest: {
      chartDataDTO: { prices: [{ date: '2024-01-02T00:00:00', close: 1 }], signals: [] },
      nextTriggers: {
        status: 'OK',
        merged: { kind: 'NONE', lines: [], partialBecause: [{ key: UNSAVED_PREVIEW_KEY, kind: 'NOT_ESTIMABLE', reason: 'x' }] },
        strategies: [{ key: UNSAVED_PREVIEW_KEY, strategyClass: 'ConstructedStrategy', kind: 'NONE', lines: [] }],
      },
    },
  });

  it('replaces the backend key in the next-bar card and drops "(ConstructedStrategy)"', () => {
    const p = relabelUnsavedDraft(draftPreview(), 'My MA (unsaved)');
    const nt = adaptNextTriggers(p.backtest.nextTriggers);
    expect(nt.strategies[0].key).toBe('My MA (unsaved)');
    // strategyClass falls back to the key: NextBarCard shows no "(…)" after the name
    expect(nt.strategies[0].strategyClass).toBe('My MA (unsaved)');
    expect(nt.merged.partialBecause[0].key).toBe('My MA (unsaved)');
    expect(p.warnings[0]).toBe('My MA (unsaved): POSITION_SOLO');
    expect(JSON.stringify(p)).not.toContain(UNSAVED_PREVIEW_KEY);
  });

  it('leaves the bar data as is (same arrays) and the input untouched', () => {
    const raw = draftPreview();
    const p = relabelUnsavedDraft(raw, 'Unsaved draft');
    expect(p.prices).toBe(raw.prices);
    expect(p.backtest.chartDataDTO.prices).toBe(raw.backtest.chartDataDTO.prices);
    expect(raw.backtest.nextTriggers.strategies[0].key).toBe(UNSAVED_PREVIEW_KEY);
  });

  it('a saved strategy preview comes back unchanged (same object)', () => {
    const saved = { key: 'Constructed:5@2', backtest: { nextTriggers: { strategies: [{ key: 'Constructed:5@2' }] } } };
    expect(relabelUnsavedDraft(saved, 'X (unsaved)')).toBe(saved);
    expect(relabelUnsavedDraft(null, 'X')).toBeNull();
  });
});
