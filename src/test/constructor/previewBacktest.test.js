// Constructor Preview = Backtest (screener architect_constructor_preview_backtest_v1.md §3.1, §5 F1):
// normalizePreview re-attaches the envelope's prices to backtest.chartDataDTO; an older backend
// (no `backtest`) gives null and the rest is unchanged. previewFormat: trade count, "No trades"
// texts, merged warnings.
import { describe, expect, it } from 'vitest';
import { normalizePreview } from '../../api/constructedApi';
import {
  mergedPreviewWarnings, noTradesMessage, previewTradeCount, rulesWithWarnings,
} from '../../components/strategyConstructor/previewFormat';

const prices = [
  { date: '2024-01-02T00:00:00', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { date: '2024-01-03T00:00:00', open: 1.5, high: 2.5, low: 1, close: 2, volume: 11 },
  { date: '2024-01-04T00:00:00', open: 2, high: 3, low: 1.5, close: 2.5, volume: 12 },
];
const envelope = {
  ticker: 'SPY',
  timeFrame: 'DAY',
  bars: 3,
  prices,
  signals: [{ date: '2024-01-02T00:00:00', price: 1.5, type: 'LongOpen' }],
  rules: [{ ruleId: 1, signalType: 'LongOpen', label: 'close > 1', fired: 1, failed: 2, notEvaluated: 0, firedDates: [] }],
  sweepThresholds: 1,
  warnings: ['W1'],
};
const backtest = {
  ticker: 'SPY',
  longPnL: 1,
  longOnly: false,
  warnings: ['W1', 'W2', '', 7],
  chartDataDTO: {
    signals: [
      { date: '2024-01-02T00:00:00', price: 1.5, type: 'LongOpen' },
      { date: '2024-01-04T00:00:00', price: 2.5, type: 'LongClose' },
    ],
    includesShortSignals: true,
    levelZones: [],
  },
};

describe('normalizePreview: backtest', () => {
  it('re-attaches the envelope prices to backtest.chartDataDTO (sent without them)', () => {
    const p = normalizePreview({ ...envelope, backtest });
    expect(p.backtest).not.toBeNull();
    expect(p.backtest.chartDataDTO.prices).toBe(p.prices);
    expect(p.backtest.chartDataDTO.prices).toHaveLength(3);
    expect(p.backtest.chartDataDTO.signals).toHaveLength(2);
    expect(p.backtest.chartDataDTO.includesShortSignals).toBe(true);
    expect(p.backtest.longPnL).toBe(1);
    expect(p.backtest.warnings).toEqual(['W1', 'W2']);
  });

  it('keeps prices the backend did send in chartDataDTO', () => {
    const own = [prices[0]];
    const p = normalizePreview({ ...envelope, backtest: { ...backtest, chartDataDTO: { ...backtest.chartDataDTO, prices: own } } });
    expect(p.backtest.chartDataDTO.prices).toBe(own);
  });

  it('an older backend (no backtest) gives null, the rest unchanged', () => {
    const withBt = normalizePreview({ ...envelope, backtest });
    const without = normalizePreview(envelope);
    expect(without.backtest).toBeNull();
    const { backtest: _drop, ...rest } = withBt;
    expect(_drop).not.toBeNull();
    expect({ ...without, backtest: undefined }).toEqual({ ...rest, backtest: undefined });
  });

  it('a backtest without chartDataDTO still renders (empty signals, envelope prices)', () => {
    const p = normalizePreview({ ...envelope, backtest: { longPnL: 0 } });
    expect(p.backtest.chartDataDTO.signals).toEqual([]);
    expect(p.backtest.chartDataDTO.prices).toHaveLength(3);
    expect(p.backtest.warnings).toEqual([]);
  });
});

describe('previewFormat', () => {
  it('trade count = closed trades + open positions; null without a backtest', () => {
    const p = normalizePreview({ ...envelope, backtest });
    expect(previewTradeCount(p.backtest)).toBe(1);
    expect(previewTradeCount({ ...p.backtest, hasOpenPosition: true })).toBe(2);
    expect(previewTradeCount({ ...p.backtest, hasOpenShortPosition: true, chartDataDTO: { signals: [] } })).toBe(1);
    expect(previewTradeCount(null)).toBeNull();
  });

  it('"No trades" texts: no entry rule / entries never fired / fired but no position', () => {
    expect(noTradesMessage([{ ruleId: 1, signalType: 'LongClose', fired: 5 }]))
      .toMatch(/^No trades: this strategy has no LongOpen or ShortOpen rule/);
    expect(noTradesMessage([{ ruleId: 1, signalType: 'LongOpen', fired: 0 }, { ruleId: 2, signalType: 'LongClose', fired: 3 }]))
      .toBe('No trades: R1 LongOpen never fired in this range.');
    expect(noTradesMessage([{ ruleId: 1, signalType: 'LongOpen', fired: 4 }]))
      .toBe('No trades in this range: the entry rules fired but no position was opened (see the strip and the Rules tab).');
  });

  it('warnings: the preview ones, then the backtest ones not already listed', () => {
    const p = normalizePreview({ ...envelope, backtest });
    expect(mergedPreviewWarnings(p)).toEqual(['W1', 'W2']);
    expect(mergedPreviewWarnings(normalizePreview(envelope))).toEqual(['W1']);
  });

  it('rules with warnings are counted for the Rules tab chip', () => {
    const rules = [{ w: ['a'] }, { w: [] }, { w: ['b', 'c'] }];
    expect(rulesWithWarnings(rules, (r) => r.w)).toBe(2);
  });
});
