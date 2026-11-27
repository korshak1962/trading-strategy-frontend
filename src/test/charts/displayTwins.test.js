// Constructor editor UX Stage B, B2 (screener architect.md §5, designer §6.4-6.5): the chart
// consumers of the B1 twins - price-line labels (`priceIndicatorLabels[key] ?? key`) and the signal
// `displayComment` through the Signals panes; an older backend without the twins shows the codes.
import { describe, expect, it } from 'vitest';
import { buildSeriesList, seriesLabel, truncateLabel, SERIES_LABEL_MAX } from '../../utils/indicatorSeries';
import { adaptSignalCharts, toPaneData } from '../../components/signals/signalPanes';

const pts = [{ date: '2024-01-02T00:00:00', value: 1 }];

describe('price-line labels', () => {
  it('a twin label replaces the key, the key stays the id / name', () => {
    const list = buildSeriesList({
      priceIndicators: { 'R2 AT_ENTRY(OPEN_STOP)': pts, SMA_50: pts, 'R3 STICKY_SINCE_ENTRY': pts },
      priceIndicatorLabels: { 'R2 AT_ENTRY(OPEN_STOP)': "R2 entry's stop", SMA_50: 'SMA 50', 'R3 STICKY_SINCE_ENTRY': "R3 entry's sticky support" },
    });
    const byName = Object.fromEntries(list.map((s) => [s.name, s]));
    expect(seriesLabel(byName['R2 AT_ENTRY(OPEN_STOP)'])).toBe("R2 entry's stop");
    expect(seriesLabel(byName.SMA_50)).toBe('SMA 50');
    expect(seriesLabel(byName['R3 STICKY_SINCE_ENTRY'])).toBe("R3 entry's sticky support");
    expect(byName.SMA_50.id).toContain('SMA_50');
  });

  it('without twins (older backend) the label is the key / its style label, as today', () => {
    const list = buildSeriesList({ priceIndicators: { 'R2 AT_ENTRY(OPEN_STOP)': pts } });
    expect(seriesLabel(list[0])).toBe('R2 AT_ENTRY(OPEN_STOP)');
  });

  it('legend / tooltip labels cut at ~48 characters with an ellipsis', () => {
    expect(SERIES_LABEL_MAX).toBe(48);
    const long = 'R2 setup stop at the last retest-confirmed breakout [Levels set 2]';
    expect(truncateLabel(long)).toHaveLength(48);
    expect(truncateLabel(long).endsWith('…')).toBe(true);
  });
});

describe('Signals panes carry the twins', () => {
  const raw = {
    prices: [],
    strategies: [{
      key: 'Constructed:56@1',
      signals: [
        { date: '2024-01-02T00:00:00', price: 10, type: 'LongOpen', comment: 'R1 LongOpen: LEVEL CONFIRMED_ANY', displayComment: 'R1 Buy: Breakout confirmed (any way)' },
        { date: '2024-01-05T00:00:00', price: 11, type: 'LongClose', comment: 'R2 LongClose: DAY close[0] < AT_ENTRY(OPEN_STOP)' },
      ],
      priceIndicators: { 'R2 AT_ENTRY(OPEN_STOP)': pts },
      priceIndicatorLabels: { 'R2 AT_ENTRY(OPEN_STOP)': "R2 entry's stop", bad: 5 },
    }],
  };

  it('displayComment kept when sent, absent otherwise (consumers fall back to comment)', () => {
    const charts = adaptSignalCharts(raw);
    const [open, close] = charts.strategies[0].signals;
    expect(open.displayComment).toBe('R1 Buy: Breakout confirmed (any way)');
    expect(close.displayComment).toBeUndefined();
    expect(close.comment).toBe('R2 LongClose: DAY close[0] < AT_ENTRY(OPEN_STOP)');
  });

  it('the pane data has the string labels only', () => {
    const charts = adaptSignalCharts(raw);
    const pane = toPaneData(charts, charts.strategies[0]);
    expect(pane.priceIndicatorLabels).toEqual({ 'R2 AT_ENTRY(OPEN_STOP)': "R2 entry's stop" });
    expect(seriesLabel(buildSeriesList(pane)[0])).toBe("R2 entry's stop");
  });

  it('an older backend: no labels → {}', () => {
    const charts = adaptSignalCharts({ strategies: [{ key: 'X', signals: [], priceIndicators: {} }] });
    expect(toPaneData(charts, charts.strategies[0]).priceIndicatorLabels).toEqual({});
  });
});
