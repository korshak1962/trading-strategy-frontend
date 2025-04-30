// src/components/PerformanceMetricsTable.jsx
import { useEffect, useState } from 'react';
import { formatNumber, formatPercent, calculateWinRate } from '../utils/formatters';
import './PerformanceTable.css';

const PerformanceMetricsTable = ({ results }) => {
  // State for metrics to ensure proper updates
  const [metrics, setMetrics] = useState([]);
  
  // Update metrics when results change
  useEffect(() => {
    if (!results) return;
    
    // Calculate additional metrics
    const totalPnL = results.longPnL + results.shortPnL;
    const relativePerformance = totalPnL - results.buyAndHoldPnL;
    const winRate = calculateWinRate(results.profitableTradesCount, results.lostTradesCount);
    
    // Define metrics to display
    const updatedMetrics = [
      { 
        label: 'Long PnL', 
        value: results.longPnL, 
        formatted: formatNumber(results.longPnL),
        isPositive: results.longPnL >= 0 
      },
      { 
        label: 'Short PnL', 
        value: results.shortPnL, 
        formatted: formatNumber(results.shortPnL),
        isPositive: results.shortPnL >= 0 
      },
      { 
        label: 'Total Strategy PnL', 
        value: totalPnL, 
        formatted: formatNumber(totalPnL),
        isPositive: totalPnL >= 0,
        isHighlighted: true
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
        label: 'Annual Return', 
        value: results.annualPercentageReturn, 
        formatted: formatPercent(results.annualPercentageReturn / 100),
        isPositive: results.annualPercentageReturn >= 0 
      },
      { 
        label: 'Win Rate', 
        value: winRate, 
        formatted: formatPercent(winRate),
        isPositive: winRate >= 0.5 
      },
      { 
        label: 'Profit/Loss Ratio', 
        value: results.profitToLostRatio, 
        formatted: formatNumber(results.profitToLostRatio),
        isPositive: results.profitToLostRatio >= 1 
      }
    ];
    
    setMetrics(updatedMetrics);
  }, [results]);

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
              <tr key={`${metric.label}-${index}`} className={metric.isHighlighted ? 'highlighted-row' : ''}>
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