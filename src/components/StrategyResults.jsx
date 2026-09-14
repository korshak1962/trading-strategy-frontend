// src/components/StrategyResults.jsx
import { useState } from 'react';
import TradesTable from './TradesTable';
import PerformanceMetricsTable from './PerformanceMetricsTable';
import TradeStatisticsTable from './TradeStatisticsTable';
import '../ResultsTabs.css';

const StrategyResults = ({ results, mode, fileContext }) => {
  const [activeTab, setActiveTab] = useState(mode === 'optimize' ? 'best-params' : 'summary');
  const hasParams = results.paramsDTO && results.paramsDTO.length > 0;

  // Summary-card values. `?? 0` keeps older responses (without the short-side fields) rendering.
  // `longOnly` comes from the response itself so a stale result is never shown against a toggled checkbox.
  const isLongOnly = results.longOnly === true;
  const longPnL = results.longPnL ?? 0;
  const shortPnL = results.shortPnL ?? 0;
  const actualYield = results.actualYield ?? 0;
  const actualYieldShort = results.actualYieldShort ?? 0;
  const complexYield = results.complexYield ?? 0;
  const profitableLong = results.profitableTradesCount ?? 0;
  const longTrades = profitableLong + (results.lostTradesCount ?? 0);
  const profitableShort = results.profitableShortTradesCount ?? 0;
  const shortTrades = profitableShort + (results.lostShortTradesCount ?? 0);
  const winRateLabel = (wins, total) => (total > 0 ? `${Math.round((wins / total) * 100)}%` : '0%');

  const tabClass = (tab) => `chart-view-tab${activeTab === tab ? ' chart-view-tab--active' : ''}`;

  return (
    <div>
      {/* Tabs */}
      <div>
        <nav className="results-tab-strip">
          {mode === 'optimize' && hasParams && (
            <button className={tabClass('best-params')} onClick={() => setActiveTab('best-params')}>
              Best Parameters
            </button>
          )}
          <button className={tabClass('summary')} onClick={() => setActiveTab('summary')}>
            Summary
          </button>
          <button className={tabClass('performance')} onClick={() => setActiveTab('performance')}>
            Performance
          </button>
          <button className={tabClass('trades')} onClick={() => setActiveTab('trades')}>
            Trades
          </button>
        </nav>
      </div>

      {/* Best Parameters Tab - Optimize mode only */}
      {activeTab === 'best-params' && hasParams && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Best Parameters Found</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Strategy</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Parameter</th>
                <th className="text-right py-2 px-3 text-gray-500 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {results.paramsDTO.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 px-3 text-gray-600">{p.strategy || p.strategyClass || ''}</td>
                  <td className="py-2 px-3">{p.paramName}</td>
                  <td className="py-2 px-3 text-right font-bold text-blue-700">
                    {typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Tab - Quick overview */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Strategy Performance Summary</h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Long side */}
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Long PnL</div>
                <div className={`text-xl font-bold ${longPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {longPnL.toFixed(2)}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Long Trades</div>
                <div className="text-xl font-bold">{longTrades}</div>
                <div className="text-xs text-blue-400 mt-1">win rate {winRateLabel(profitableLong, longTrades)}</div>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Long Yield</div>
                <div className={`text-xl font-bold ${actualYield >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {actualYield.toFixed(2)}%
                </div>
                <div className="text-xs text-blue-400 mt-1">annualized over time in long position</div>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Complex Yield</div>
                <div className={`text-xl font-bold ${complexYield >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {complexYield.toFixed(2)}%
                </div>
                <div className="text-xs text-blue-400 mt-1">long-only view; 4%/yr treasury while out of market</div>
              </div>

              {/* Short side — omitted entirely when the result was evaluated long-only */}
              {!isLongOnly && (
                <>
                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-purple-700 font-medium">Short PnL</div>
                    <div className={`text-xl font-bold ${shortPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {shortPnL.toFixed(2)}
                    </div>
                  </div>

                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-purple-700 font-medium">Short Trades</div>
                    <div className="text-xl font-bold">{shortTrades}</div>
                    <div className="text-xs text-purple-400 mt-1">win rate {winRateLabel(profitableShort, shortTrades)}</div>
                  </div>

                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-purple-700 font-medium">Short Yield</div>
                    <div className={`text-xl font-bold ${actualYieldShort >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {actualYieldShort.toFixed(2)}%
                    </div>
                    <div className="text-xs text-purple-400 mt-1">annualized over time in short position</div>
                  </div>
                </>
              )}
            </div>

            {/* Drawdown comparison */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-red-50 border border-red-100 p-3 rounded">
                <div className="text-sm text-red-700 font-medium">Strategy Max Drawdown</div>
                <div className="text-xl font-bold text-red-600">
                  {(results.maxDrawdown ?? 0) === 0 ? '0' : (results.maxDrawdown).toFixed(2)}
                </div>
                <div className="text-xs text-red-400 mt-1">worst cumulative loss</div>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded">
                <div className="text-sm text-orange-700 font-medium">Buy &amp; Hold Max Drawdown</div>
                <div className="text-xl font-bold text-orange-600">
                  {(results.buyAndHoldMaxDrawdown ?? 0) === 0 ? '0' : (results.buyAndHoldMaxDrawdown).toFixed(2)}
                </div>
                <div className="text-xs text-orange-400 mt-1">worst cumulative loss</div>
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-600">
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
        <TradesTable data={results.chartDataDTO} fileContext={fileContext} />
      )}
    </div>
  );
};

export default StrategyResults;