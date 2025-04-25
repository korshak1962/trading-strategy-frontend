// src/components/TradeStatisticsTable.jsx
import { useEffect, useState, useCallback } from 'react';
import { formatNumber, formatPercent } from '../utils/formatters';
import './PerformanceTable.css';

const TradeStatisticsTable = ({ results }) => {
  const [tradeStats, setTradeStats] = useState({
    total: 0,
    profitable: 0,
    losing: 0,
    longTrades: 0,
    shortTrades: 0,
    avgDuration: 0,
    avgProfit: 0,
    avgLoss: 0,
    maxProfit: 0,
    maxLoss: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0
  });

  const extractTradesFromSignals = useCallback((signals) => {
    const extractedTrades = [];
    const openSignals = {};

    // Sort signals by date
    const sortedSignals = [...signals].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    sortedSignals.forEach(signal => {
      if (signal.type === 'LongOpen') {
        // Store open signal
        openSignals['Long'] = signal;
      } 
      else if (signal.type === 'LongClose' && openSignals['Long']) {
        // Create a trade
        const openSignal = openSignals['Long'];
        const profit = signal.price - openSignal.price;
        
        extractedTrades.push({
          type: 'Long',
          openDate: openSignal.date,
          closeDate: signal.date,
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit
        });
        
        // Clear open signal
        delete openSignals['Long'];
      }
      else if (signal.type === 'ShortOpen') {
        // Store open signal
        openSignals['Short'] = signal;
      }
      else if (signal.type === 'ShortClose' && openSignals['Short']) {
        // Create a trade
        const openSignal = openSignals['Short'];
        const profit = openSignal.price - signal.price; // Reversed for short
        
        extractedTrades.push({
          type: 'Short',
          openDate: openSignal.date,
          closeDate: signal.date,
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit
        });
        
        // Clear open signal
        delete openSignals['Short'];
      }
    });

    return extractedTrades;
  }, []);

  const calculateTradeStatistics = useCallback((signals) => {
    // Extract complete trades
    const trades = extractTradesFromSignals(signals);
    
    if (trades.length === 0) return;

    // Basic statistics
    const totalTrades = trades.length;
    const profitableTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl <= 0).length;
    const longTrades = trades.filter(t => t.type === 'Long').length;
    const shortTrades = trades.filter(t => t.type === 'Short').length;
    
    // Calculate trade durations in days
    const tradeDurations = trades.map(t => {
      const openDate = new Date(t.openDate);
      const closeDate = new Date(t.closeDate);
      return Math.ceil((closeDate - openDate) / (1000 * 60 * 60 * 24)); // Days
    });
    
    const avgDuration = tradeDurations.reduce((sum, d) => sum + d, 0) / totalTrades;
    
    // Profits and losses
    const profits = trades.filter(t => t.pnl > 0).map(t => t.pnl);
    const losses = trades.filter(t => t.pnl <= 0).map(t => t.pnl);
    
    const avgProfit = profits.length ? profits.reduce((sum, p) => sum + p, 0) / profits.length : 0;
    const avgLoss = losses.length ? losses.reduce((sum, l) => sum + l, 0) / losses.length : 0;
    const maxProfit = profits.length ? Math.max(...profits) : 0;
    const maxLoss = losses.length ? Math.min(...losses) : 0;
    
    // Consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentConsecutiveWins = 0;
    let currentConsecutiveLosses = 0;
    
    trades.forEach(trade => {
      if (trade.pnl > 0) {
        currentConsecutiveWins++;
        currentConsecutiveLosses = 0;
        if (currentConsecutiveWins > maxConsecutiveWins) {
          maxConsecutiveWins = currentConsecutiveWins;
        }
      } else {
        currentConsecutiveLosses++;
        currentConsecutiveWins = 0;
        if (currentConsecutiveLosses > maxConsecutiveLosses) {
          maxConsecutiveLosses = currentConsecutiveLosses;
        }
      }
    });
    
    setTradeStats({
      total: totalTrades,
      profitable: profitableTrades,
      losing: losingTrades,
      longTrades,
      shortTrades,
      avgDuration,
      avgProfit,
      avgLoss,
      maxProfit,
      maxLoss,
      consecutiveWins: maxConsecutiveWins,
      consecutiveLosses: maxConsecutiveLosses
    });
  }, [extractTradesFromSignals]);

  useEffect(() => {
    if (!results || !results.chartDataDTO || !results.chartDataDTO.signals) return;

    // Process signals to extract detailed trade statistics
    const signals = results.chartDataDTO.signals;
    calculateTradeStatistics(signals);
  }, [results, calculateTradeStatistics]);

  // Define statistics to display
  const statistics = [
    { 
      label: 'Total Trades', 
      value: tradeStats.total, 
      formatted: tradeStats.total.toString()
    },
    { 
      label: 'Profitable Trades', 
      value: tradeStats.profitable, 
      formatted: tradeStats.profitable.toString(),
      isPositive: true
    },
    { 
      label: 'Losing Trades', 
      value: tradeStats.losing, 
      formatted: tradeStats.losing.toString(),
      isNegative: true
    },
    { 
      label: 'Win Rate', 
      value: tradeStats.total ? tradeStats.profitable / tradeStats.total : 0, 
      formatted: formatPercent(tradeStats.total ? tradeStats.profitable / tradeStats.total : 0),
      isPositive: (tradeStats.profitable / tradeStats.total) >= 0.5
    },
    { 
      label: 'Long Trades', 
      value: tradeStats.longTrades, 
      formatted: tradeStats.longTrades.toString()
    },
    { 
      label: 'Short Trades', 
      value: tradeStats.shortTrades, 
      formatted: tradeStats.shortTrades.toString()
    },
    { 
      label: 'Avg. Trade Duration', 
      value: tradeStats.avgDuration, 
      formatted: `${tradeStats.avgDuration.toFixed(1)} days`
    },
    { 
      label: 'Avg. Profit per Winning Trade', 
      value: tradeStats.avgProfit, 
      formatted: formatNumber(tradeStats.avgProfit),
      isPositive: true
    },
    { 
      label: 'Avg. Loss per Losing Trade', 
      value: tradeStats.avgLoss, 
      formatted: formatNumber(tradeStats.avgLoss),
      isNegative: true
    },
    { 
      label: 'Max Profit Trade', 
      value: tradeStats.maxProfit, 
      formatted: formatNumber(tradeStats.maxProfit),
      isPositive: true
    },
    { 
      label: 'Max Loss Trade', 
      value: tradeStats.maxLoss, 
      formatted: formatNumber(tradeStats.maxLoss),
      isNegative: true
    },
    { 
      label: 'Max Consecutive Wins', 
      value: tradeStats.consecutiveWins, 
      formatted: tradeStats.consecutiveWins.toString(),
      isPositive: true
    },
    { 
      label: 'Max Consecutive Losses', 
      value: tradeStats.consecutiveLosses, 
      formatted: tradeStats.consecutiveLosses.toString(),
      isNegative: true
    }
  ];

  return (
    <div className="performance-table-container">
      <h3 className="performance-table-title">Trade Statistics</h3>
      
      <div className="performance-table-wrapper">
        <table className="performance-table">
          <thead>
            <tr>
              <th>Statistic</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {statistics.map((stat, index) => (
              <tr key={index}>
                <td className="metric-label">{stat.label}</td>
                <td className={`metric-value ${stat.isPositive ? 'positive' : ''} ${stat.isNegative ? 'negative' : ''}`}>
                  {stat.formatted}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeStatisticsTable;