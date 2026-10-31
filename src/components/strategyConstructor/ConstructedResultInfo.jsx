// src/components/strategyConstructor/ConstructedResultInfo.jsx
//
// Summary-tab card of a backtest / optimization whose config holds constructed strategies (BA spec
// §5.2, §5.3; Q11, Q14): "constructed thresholds in sweep: K, trades: T, T/K = x" with the
// overfitting warning at T/K < 10, and the attempt counter per constructed strategy (versions,
// backtests and optimization jobs on this ticker / TF).
import { MIN_TRADES_PER_THRESHOLD } from '../../api/constructedApi';
import ConstructedAttempts from './ConstructedAttempts';
import { resultTradeCount, strategyDisplayName, sweepThresholdCount, tradesPerThreshold } from './constructedFormat';

/**
 * @param {Object} props
 * @param {Object} props.results StrategyResultDTO
 * @param {Object|null} props.config the StrategiesConfigDTO of the result (recorded at submit)
 * @param {Array} props.availableStrategies
 * @param {string|number} props.refreshKey refetch of the attempt counters
 */
export default function ConstructedResultInfo({ results, config, availableStrategies, refreshKey }) {
  const { k, keys } = sweepThresholdCount(config?.strategyNameToParams);
  if (keys.length === 0) return null;
  const t = resultTradeCount(results);
  const r = tradesPerThreshold(k, t, MIN_TRADES_PER_THRESHOLD);
  const ticker = config?.ticker || results?.ticker || '';
  const timeFrame = config?.timeFrame || '';
  return (
    <div className="bg-white p-4 rounded-lg shadow" data-testid="constructed-result-info">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Constructed strategies</h3>
      <p className="text-sm text-gray-700" data-testid="constructed-trades-per-threshold">
        Thresholds in sweep: <b>{k}</b> · trades: <b>{t}</b>
        {r.ratio != null && <> · T/K = <b>{r.ratio.toFixed(1)}</b></>}
        {k === 0 && <span className="text-gray-500"> (all thresholds fixed)</span>}
      </p>
      {r.warn && (
        <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status"
          data-testid="constructed-overfit-warning">
          Fewer than {MIN_TRADES_PER_THRESHOLD} trades per threshold in sweep ({t} trades for {k} thresholds):
          the best values are likely fitted to noise. Fix some thresholds, or check the structure on data it was not designed on
          (trade start / screening fit half / stability by channel).
        </div>
      )}
      <ul className="mt-2 space-y-1">
        {keys.map((key) => (
          <li key={key} className="text-sm">
            <span className="font-medium">{strategyDisplayName(key, availableStrategies)}</span>{' '}
            <ConstructedAttempts strategyKey={key} ticker={ticker} timeFrame={timeFrame} refreshKey={refreshKey} />
          </li>
        ))}
      </ul>
    </div>
  );
}
