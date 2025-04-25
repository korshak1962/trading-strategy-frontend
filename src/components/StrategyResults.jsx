// src/components/StrategyResults.jsx
import { useState } from 'react';
import TradesTable from './TradesTable';
import PerformanceMetricsTable from './PerformanceMetricsTable';
import TradeStatisticsTable from './TradeStatisticsTable';

const StrategyResults = ({ results }) => {
  const [activeTab, setActiveTab] = useState('summary');

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
              activeTab === 'performance'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('performance')}
          >
            Performance
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

      {/* Summary Tab - Quick overview */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Strategy Performance Summary</h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Quick metrics */}
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Total PnL</div>
                <div className={`text-xl font-bold ${(results.longPnL + results.shortPnL) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(results.longPnL + results.shortPnL).toFixed(2)}
                </div>
              </div>
              
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Win Rate</div>
                <div className="text-xl font-bold">
                  {results.profitableTradesCount + results.lostTradesCount > 0 
                    ? `${Math.round((results.profitableTradesCount / (results.profitableTradesCount + results.lostTradesCount)) * 100)}%` 
                    : '0%'}
                </div>
              </div>
              
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Total Trades</div>
                <div className="text-xl font-bold">
                  {results.profitableTradesCount + results.lostTradesCount}
                </div>
              </div>
              
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Annual Return</div>
                <div className={`text-xl font-bold ${results.annualPercentageReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(results.annualPercentageReturn).toFixed(2)}%
                </div>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              Click on the Performance or Trades tabs to see more detailed analysis.
            </div>
          </div>
        </div>
      )}

      {/* Performance Tab - Detailed metrics */}
      {activeTab === 'performance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PerformanceMetricsTable results={results} />
          <TradeStatisticsTable results={results} />
        </div>
      )}

      {/* Trades Tab - Table of all trades */}
      {activeTab === 'trades' && (
        <TradesTable data={results.chartDataDTO} />
      )}
    </div>
  );
};

export default StrategyResults;