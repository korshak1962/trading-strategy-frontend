// src/components/PerformanceMetricsTable.jsx
import { formatNumber, formatPercent, formatSigned, formatSignedPercent, calculateWinRate } from '../utils/formatters';
import './PerformanceTable.css';

const PerformanceMetricsTable = ({ results }) => {
  // Calculate additional metrics. `?? 0` keeps older responses without the short-side fields working.
  const isLongOnly = results.longOnly === true;
  const longPnL = results.longPnL ?? 0;
  const shortPnL = results.shortPnL ?? 0;
  const buyAndHoldPnL = results.buyAndHoldPnL ?? 0;
  // In long-only mode the short leg was never evaluated, so total == long PnL.
  const totalPnL = isLongOnly ? longPnL : longPnL + shortPnL;
  const relativePerformance = totalPnL - buyAndHoldPnL;
  const actualYield = results.actualYield ?? 0;
  const actualYieldShort = results.actualYieldShort ?? 0;
  const buyAndHoldAnnualYield = results.buyAndHoldAnnualYield ?? 0;
  const complexYield = results.complexYield ?? 0;
  const longWinRate = calculateWinRate(results.profitableTradesCount ?? 0, results.lostTradesCount ?? 0);
  const shortWinRate = calculateWinRate(results.profitableShortTradesCount ?? 0, results.lostShortTradesCount ?? 0);
  // Open positions: excluded from win rates (closed trades only), reported separately. Absent fields -> no row.
  const hasOpenPosition = results.hasOpenPosition === true;
  const openPositionPnL = results.openPositionPnL ?? 0;
  const hasOpenShortPosition = results.hasOpenShortPosition === true;
  const openShortPositionPnL = results.openShortPositionPnL ?? 0;
  const maxDrawdown = results.maxDrawdown ?? 0;
  const buyAndHoldMaxDrawdown = results.buyAndHoldMaxDrawdown ?? 0;

  // Percent fields (percent units: 8.47 = 8.47%). An older backend omits them; then the
  // "(x%)" part is left out rather than showing a misleading 0%.
  const hasNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const longPnLPercent = results.longPnLPercent;
  const shortPnLPercent = results.shortPnLPercent;
  const buyAndHoldPnLPercent = results.buyAndHoldPnLPercent;
  const totalPnLPercent = isLongOnly
    ? longPnLPercent
    : (hasNum(longPnLPercent) && hasNum(shortPnLPercent) ? longPnLPercent + shortPnLPercent : undefined);
  const relativePp = hasNum(totalPnLPercent) && hasNum(buyAndHoldPnLPercent)
    ? totalPnLPercent - buyAndHoldPnLPercent
    : undefined;

  // "+12.30 (+1.85%)": signed P&L amount with its signed % (rule D6).
  const pnlWithPct = (value, pct) =>
    hasNum(pct) ? `${formatSigned(value)} (${formatSignedPercent(pct / 100)})` : formatSigned(value);
  // Drawdowns are <= 0 and not signed (rule D6): "-34.04 (-4.63%)".
  const ddWithPct = (value, pct) =>
    hasNum(pct) ? `${formatNumber(value)} (${formatPercent(pct / 100)})` : formatNumber(value);

  // Profit/Loss ratio: null = undefined (N1). ∞ when there are winners but no losing trade,
  // — when there are no closed trades at all. Both shown in a neutral colour.
  const ratio = results.profitToLostRatio;
  const ratioUndefined = ratio == null;
  const ratioFormatted = ratioUndefined
    ? ((results.profitableTradesCount ?? 0) > 0 ? '∞' : '—')
    : formatNumber(ratio);

  const legSuffix = isLongOnly ? '' : ' (long)';
  const SIMPLE = 'Simple (non-compounded).';
  const ACTUAL_YIELD_HINT = `PnL ÷ first entry price, annualized over time spent in position only. ${SIMPLE}`;
  const PNL_PCT_HINT = '% = PnL ÷ first entry price (1 share, not compounded).';
  const OPEN_PCT_HINT = "% = unrealized PnL ÷ that position's entry price.";
  const DD_HINT = 'Peak-to-trough of 1-share equity marked to market at each bar close; % is of account value (first entry + equity) at the peak.';

  // Define metrics to display; `shortSide` rows are dropped when the result is long-only
  // (Total Strategy PnL too, since it would just duplicate Long PnL). `visible: false` rows are
  // dropped too (open-position rows when nothing is open).
  // `tone` overrides the positive/negative colour ('neutral' for undefined values).
  const metrics = [
    {
      label: 'Long PnL',
      value: longPnL,
      formatted: pnlWithPct(longPnL, longPnLPercent),
      isPositive: longPnL >= 0,
      hint: PNL_PCT_HINT
    },
    {
      label: 'Short PnL',
      value: shortPnL,
      formatted: pnlWithPct(shortPnL, shortPnLPercent),
      isPositive: shortPnL >= 0,
      shortSide: true,
      hint: PNL_PCT_HINT
    },
    {
      label: 'Total Strategy PnL',
      value: totalPnL,
      formatted: pnlWithPct(totalPnL, totalPnLPercent),
      isPositive: totalPnL >= 0,
      isHighlighted: true,
      shortSide: true,
      hint: 'Long PnL + Short PnL. % = Long PnL % + Short PnL %, each on its own first entry price.'
    },
    {
      label: 'Buy & Hold PnL',
      value: buyAndHoldPnL,
      formatted: pnlWithPct(buyAndHoldPnL, buyAndHoldPnLPercent),
      isPositive: buyAndHoldPnL >= 0,
      hint: '% = B&H PnL ÷ first close (1 share, not compounded).'
    },
    {
      label: 'Buy & Hold Annual Yield',
      value: buyAndHoldAnnualYield,
      formatted: formatPercent(buyAndHoldAnnualYield / 100),
      isPositive: buyAndHoldAnnualYield >= 0,
      hint: `B&H PnL ÷ first close, annualized over the calendar period. ${SIMPLE}`
    },
    {
      label: 'vs. Buy & Hold',
      value: relativePerformance,
      formatted: hasNum(relativePp)
        ? `${formatSigned(relativePerformance)} (${formatSigned(relativePp)} pp)`
        : formatSigned(relativePerformance),
      isPositive: relativePerformance >= 0,
      isHighlighted: true,
      hint: 'Strategy PnL % minus Buy & Hold PnL %, in percentage points. Each % is on its own first-entry price.'
    },
    {
      label: `Max Drawdown${legSuffix}`,
      value: maxDrawdown,
      formatted: ddWithPct(maxDrawdown, results.maxDrawdownPercent),
      tone: maxDrawdown < 0 ? 'negative' : 'neutral',
      hint: DD_HINT
    },
    {
      label: 'Buy & Hold Max Drawdown',
      value: buyAndHoldMaxDrawdown,
      formatted: ddWithPct(buyAndHoldMaxDrawdown, results.buyAndHoldMaxDrawdownPercent),
      tone: buyAndHoldMaxDrawdown < 0 ? 'negative' : 'neutral',
      hint: DD_HINT
    },
    {
      label: 'Long Actual Yield',
      value: actualYield,
      formatted: formatPercent(actualYield / 100),
      isPositive: actualYield >= 0,
      hint: ACTUAL_YIELD_HINT
    },
    {
      label: 'Short Actual Yield',
      value: actualYieldShort,
      formatted: formatPercent(actualYieldShort / 100),
      isPositive: actualYieldShort >= 0,
      shortSide: true,
      hint: ACTUAL_YIELD_HINT
    },
    {
      label: 'Complex Yield',
      value: complexYield,
      formatted: formatPercent(complexYield / 100),
      isPositive: complexYield >= 0,
      hint: `Long PnL annualized over the full calendar period, plus 4%/yr treasury for time out of the market. ${SIMPLE}`
    },
    {
      label: 'Long Win Rate (closed)',
      value: longWinRate,
      formatted: formatPercent(longWinRate),
      isPositive: longWinRate >= 0.5
    },
    {
      label: 'Open Position (unrealized)',
      value: openPositionPnL,
      formatted: pnlWithPct(openPositionPnL, results.openPositionPnLPercent),
      isPositive: openPositionPnL >= 0,
      hint: OPEN_PCT_HINT,
      visible: hasOpenPosition
    },
    {
      label: 'Short Win Rate (closed)',
      value: shortWinRate,
      formatted: formatPercent(shortWinRate),
      isPositive: shortWinRate >= 0.5,
      shortSide: true
    },
    {
      label: 'Open Short Position (unrealized)',
      value: openShortPositionPnL,
      formatted: pnlWithPct(openShortPositionPnL, results.openShortPositionPnLPercent),
      isPositive: openShortPositionPnL >= 0,
      shortSide: true,
      hint: OPEN_PCT_HINT,
      visible: hasOpenShortPosition
    },
    {
      label: 'Profit/Loss Ratio',
      value: ratio,
      formatted: ratioFormatted,
      isPositive: !ratioUndefined && ratio >= 1,
      tone: ratioUndefined ? 'neutral' : undefined,
      hint: 'Sum of closed wins ÷ sum of closed losses. ∞ = no losing trade; — = no closed trades.'
    }
  ].filter(metric => !(isLongOnly && metric.shortSide) && metric.visible !== false);

  return (
    <div className="performance-table-container">
      <h3 className="performance-table-title">Performance Metrics</h3>
      
      <div className="performance-table-wrapper">
        <table className="performance-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, index) => (
              <tr key={index} className={metric.isHighlighted ? 'highlighted-row' : ''}>
                <td className="metric-label" title={metric.hint}>{metric.label}</td>
                <td className={`metric-value ${metric.tone ?? (metric.isPositive ? 'positive' : 'negative')}`}>
                  {metric.formatted}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PerformanceMetricsTable;