// src/components/PerformanceMetricsTable.jsx
import { formatNumber, formatPercent, calculateWinRate } from '../utils/formatters';
import './PerformanceTable.css';

const PerformanceMetricsTable = ({ results }) => {
  // Calculate additional metrics. `?? 0` keeps older responses without the short-side fields working.
  const isLongOnly = results.longOnly === true;
  const longPnL = results.longPnL ?? 0;
  const shortPnL = results.shortPnL ?? 0;
  // In long-only mode the short leg was never evaluated, so total == long PnL.
  const totalPnL = isLongOnly ? longPnL : longPnL + shortPnL;
  const relativePerformance = totalPnL - results.buyAndHoldPnL;
  const actualYield = results.actualYield ?? 0;
  const actualYieldShort = results.actualYieldShort ?? 0;
  const longWinRate = calculateWinRate(results.profitableTradesCount ?? 0, results.lostTradesCount ?? 0);
  const shortWinRate = calculateWinRate(results.profitableShortTradesCount ?? 0, results.lostShortTradesCount ?? 0);

  // Define metrics to display; `shortSide` rows are dropped when the result is long-only
  // (Total Strategy PnL too, since it would just duplicate Long PnL).
  const metrics = [
    {
      label: 'Long PnL',
      value: longPnL,
      formatted: formatNumber(longPnL),
      isPositive: longPnL >= 0
    },
    {
      label: 'Short PnL',
      value: shortPnL,
      formatted: formatNumber(shortPnL),
      isPositive: shortPnL >= 0,
      shortSide: true
    },
    {
      label: 'Total Strategy PnL',
      value: totalPnL,
      formatted: formatNumber(totalPnL),
      isPositive: totalPnL >= 0,
      isHighlighted: true,
      shortSide: true
    },
    {
      label: 'Buy & Hold PnL', 
      value: results.buyAndHoldPnL, 
      formatted: formatNumber(results.buyAndHoldPnL),
      isPositive: results.buyAndHoldPnL >= 0 
    },
    { 
      label: 'vs. Buy & Hold', 
      value: relativePerformance, 
      formatted: formatNumber(relativePerformance),
      isPositive: relativePerformance >= 0,
      isHighlighted: true
    },
    {
      label: 'Long Actual Yield',
      value: actualYield,
      formatted: formatPercent(actualYield / 100),
      isPositive: actualYield >= 0
    },
    {
      label: 'Short Actual Yield',
      value: actualYieldShort,
      formatted: formatPercent(actualYieldShort / 100),
      isPositive: actualYieldShort >= 0,
      shortSide: true
    },
    {
      label: 'Complex Yield',
      value: results.complexYield,
      formatted: formatPercent(results.complexYield / 100),
      isPositive: results.complexYield >= 0
    },
    {
      label: 'Long Win Rate',
      value: longWinRate,
      formatted: formatPercent(longWinRate),
      isPositive: longWinRate >= 0.5
    },
    {
      label: 'Short Win Rate',
      value: shortWinRate,
      formatted: formatPercent(shortWinRate),
      isPositive: shortWinRate >= 0.5,
      shortSide: true
    },
    {
      label: 'Profit/Loss Ratio',
      value: results.profitToLostRatio,
      formatted: formatNumber(results.profitToLostRatio),
      isPositive: results.profitToLostRatio >= 1
    }
  ].filter(metric => !(isLongOnly && metric.shortSide));

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
                <td className="metric-label">{metric.label}</td>
                <td className={`metric-value ${metric.isPositive ? 'positive' : 'negative'}`}>
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