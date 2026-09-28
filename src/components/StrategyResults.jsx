// src/components/StrategyResults.jsx
import { useState } from 'react';
import TradesTable from './TradesTable';
import PerformanceMetricsTable from './PerformanceMetricsTable';
import TradeStatisticsTable from './TradeStatisticsTable';
import { formatNumber, formatPercent, formatSigned, formatSignedPercent } from '../utils/formatters';
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
  // Open position is excluded from the win/loss counts (closed trades only) and shown separately.
  const hasOpenPosition = results.hasOpenPosition === true;
  const openPositionPnL = results.openPositionPnL ?? 0;
  const hasOpenShortPosition = results.hasOpenShortPosition === true;
  const openShortPositionPnL = results.openShortPositionPnL ?? 0;
  // Percent fields (percent units, 8.47 = 8.47%). When an older backend omits a field the
  // % part is simply not rendered, so these stay undefined rather than defaulting to 0.
  const longPnLPercent = results.longPnLPercent;
  const shortPnLPercent = results.shortPnLPercent;
  const openPositionPnLPercent = results.openPositionPnLPercent;
  const openShortPositionPnLPercent = results.openShortPositionPnLPercent;
  const maxDrawdown = results.maxDrawdown ?? 0;
  const buyAndHoldMaxDrawdown = results.buyAndHoldMaxDrawdown ?? 0;
  const maxDrawdownPercent = results.maxDrawdownPercent;
  const buyAndHoldMaxDrawdownPercent = results.buyAndHoldMaxDrawdownPercent;
  const hasNum = (v) => typeof v === 'number' && Number.isFinite(v);
  // Signed "% of first entry" line / "(+x%)" suffix; empty when the field is absent.
  const pctSuffix = (pct) => (hasNum(pct) ? `, ${formatSignedPercent(pct / 100)}` : '');
  const openLabel = (pnl, pct) => ` · 1 open (${formatSigned(pnl)}${pctSuffix(pct)})`;
  // Drawdowns are always <= 0 and carry their own "-": not signed (rule D6).
  // Same formatting as the Performance tab: "-1,234.56 (-4.63%)", 0 shows as "0.00".
  const ddValue = (dd) => formatNumber(dd);
  const ddPct = (pct) => (hasNum(pct) ? ` (${formatPercent(pct / 100)})` : '');

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
                  {formatSigned(longPnL)}
                </div>
                {hasNum(longPnLPercent) && (
                  <div className="text-xs text-blue-400 mt-1">
                    {formatSignedPercent(longPnLPercent / 100)} of first entry
                  </div>
                )}
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Long Trades</div>
                <div className="text-xl font-bold">{longTrades}</div>
                <div className="text-xs text-blue-400 mt-1">
                  win rate {winRateLabel(profitableLong, longTrades)}
                  {hasOpenPosition && openLabel(openPositionPnL, openPositionPnLPercent)}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Long Yield</div>
                <div className={`text-xl font-bold ${actualYield >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {actualYield.toFixed(2)}%
                </div>
                <div className="text-xs text-blue-400 mt-1">annualized over time in long position · simple, not compounded</div>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-700 font-medium">Complex Yield</div>
                <div className={`text-xl font-bold ${complexYield >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {complexYield.toFixed(2)}%
                </div>
                <div className="text-xs text-blue-400 mt-1">long-only view; 4%/yr treasury while out of market · simple, not compounded</div>
              </div>

              {/* Short side — omitted entirely when the result was evaluated long-only */}
              {!isLongOnly && (
                <>
                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-purple-700 font-medium">Short PnL</div>
                    <div className={`text-xl font-bold ${shortPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatSigned(shortPnL)}
                    </div>
                    {hasNum(shortPnLPercent) && (
                      <div className="text-xs text-purple-400 mt-1">
                        {formatSignedPercent(shortPnLPercent / 100)} of first entry
                      </div>
                    )}
                  </div>

                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-purple-700 font-medium">Short Trades</div>
                    <div className="text-xl font-bold">{shortTrades}</div>
                    <div className="text-xs text-purple-400 mt-1">
                      win rate {winRateLabel(profitableShort, shortTrades)}
                      {hasOpenShortPosition && openLabel(openShortPositionPnL, openShortPositionPnLPercent)}
                    </div>
                  </div>

                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-purple-700 font-medium">Short Yield</div>
                    <div className={`text-xl font-bold ${actualYieldShort >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {actualYieldShort.toFixed(2)}%
                    </div>
                    <div className="text-xs text-purple-400 mt-1">annualized over time in short position · simple, not compounded</div>
                  </div>
                </>
              )}
            </div>

            {/* Drawdown comparison */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-red-50 border border-red-100 p-3 rounded">
                <div className="text-sm text-red-700 font-medium">
                  Strategy Max Drawdown{!isLongOnly && ' (long leg)'}
                </div>
                <div className="text-xl font-bold text-red-600">
                  {ddValue(maxDrawdown)}{ddPct(maxDrawdownPercent)}
                </div>
                <div className="text-xs text-red-400 mt-1">
                  peak-to-trough, marked to market · $/share and % of account at peak
                  {!isLongOnly && ' · short leg not included'}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded">
                <div className="text-sm text-orange-700 font-medium">Buy &amp; Hold Max Drawdown</div>
                <div className="text-xl font-bold text-orange-600">
                  {ddValue(buyAndHoldMaxDrawdown)}{ddPct(buyAndHoldMaxDrawdownPercent)}
                </div>
                <div className="text-xs text-orange-400 mt-1">peak-to-trough, marked to market · $/share and % of account at peak</div>
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
          <TradeStatisticsTable results={results} longLegOnly={!isLongOnly} />
        </div>
      )}

      {/* Trades Tab - Table of all trades */}
      {activeTab === 'trades' && (
        <TradesTable
          data={results.chartDataDTO}
          fileContext={fileContext}
          hasOpenPosition={hasOpenPosition}
          openPositionPnL={openPositionPnL}
          openPositionPnLPercent={openPositionPnLPercent}
          longLegOnly={!isLongOnly}
        />
      )}
    </div>
  );
};

export default StrategyResults;