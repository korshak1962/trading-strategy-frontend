// src/components/StrategyResults.jsx
import { useState } from 'react';

const StrategyResults = ({ results }) => {
  const [activeTab, setActiveTab] = useState('summary');

  // Format number with commas and 2 decimal places
  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  // Format percentage
  const formatPercent = (num) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num / 100);
  };

  // Calculate win rate
  const calculateWinRate = () => {
    const totalTrades = results.profitableTradesCount + results.lostTradesCount;
    return totalTrades > 0 ? results.profitableTradesCount / totalTrades : 0;
  };

  return (
    <div>
      {/* Tabs */}
      <div className="border-b mb-4">
        <nav className="flex -mb-px">
          <button
            className={`py-2 px-4 font-medium border-b-2 ${
              activeTab === 'summary'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={`py-2 px-4 font-medium border-b-2 ${
              activeTab === 'trades'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('trades')}
          >
            Trades
          </button>
        </nav>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Performance Metrics */}
          <div className="bg-gray-50 p-4 rounded">
            <h3 className="text-lg font-medium mb-4">Performance Metrics</h3>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm font-medium">Long PnL:</div>
              <div className="text-sm text-right">
                <span className={results.longPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatNumber(results.longPnL)}
                </span>
              </div>
              
              <div className="text-sm font-medium">Short PnL:</div>
              <div className="text-sm text-right">
                <span className={results.shortPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatNumber(results.shortPnL)}
                </span>
              </div>
              
              <div className="text-sm font-medium">Buy & Hold PnL:</div>
              <div className="text-sm text-right">
                <span className={results.buyAndHoldPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatNumber(results.buyAndHoldPnL)}
                </span>
              </div>
              
              <div className="text-sm font-medium">Annual Return:</div>
              <div className="text-sm text-right">
                <span className={results.annualPercentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatPercent(results.annualPercentageReturn)}
                </span>
              </div>
              
              <div className="text-sm font-medium">Profit/Loss Ratio:</div>
              <div className="text-sm text-right">
                <span className={results.profitToLostRatio >= 1 ? 'text-green-600' : 'text-red-600'}>
                  {formatNumber(results.profitToLostRatio)}
                </span>
              </div>
              
              <div className="text-sm font-medium">Win Rate:</div>
              <div className="text-sm text-right">
                <span className={calculateWinRate() >= 0.5 ? 'text-green-600' : 'text-red-600'}>
                  {formatPercent(calculateWinRate() * 100)}
                </span>
              </div>
            </div>
          </div>
          
          {/* Trade Statistics */}
          <div className="bg-gray-50 p-4 rounded">
            <h3 className="text-lg font-medium mb-4">Trade Statistics</h3>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm font-medium">Total Trades:</div>
              <div className="text-sm text-right">
                {results.profitableTradesCount + results.lostTradesCount}
              </div>
              
              <div className="text-sm font-medium">Profitable Trades:</div>
              <div className="text-sm text-right text-green-600">
                {results.profitableTradesCount}
              </div>
              
              <div className="text-sm font-medium">Losing Trades:</div>
              <div className="text-sm text-right text-red-600">
                {results.lostTradesCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trades Tab */}
      {activeTab === 'trades' && (
        <div className="overflow-auto max-h-96">
          {results.chartDataDTO?.signals?.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comment</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.chartDataDTO.signals.map((signal, index) => (
                  <tr key={index}>
                    <td className={`px-3 py-2 text-sm ${
                      signal.type === 'LongOpen' || signal.type === 'ShortOpen' 
                        ? 'text-green-600 font-medium' 
                        : 'text-red-600 font-medium'
                    }`}>
                      {signal.type}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {new Date(signal.date).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {formatNumber(signal.price)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500">
                      {signal.comment}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No trade signals available
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StrategyResults;