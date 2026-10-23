// src/components/screening/TopSamplesTable.jsx
//
// Top-20 valid samples of a screening (screener BA-021, architect.md §1.2 / §2.5): rank, objective,
// closed trades, PnL %, annual %, max DD %, the full param values (fixed ones included) and
// "Apply as Backtest values" per row (values only; the ranges stay as they are).

import { fmtParams, fmtPctPlain, fmtPctSigned, isNum } from '../stability/stabilityFormat';
import { objectiveLabel } from '../../utils/objectives';

/**
 * @param {Object} props
 * @param {Array} props.samples TopSampleDTO[]
 * @param {string} props.objective objective name of the screening
 * @param {((params: Object) => void)|null} props.onApplyParams {strategy: {param: value}} → form values, Backtest mode
 * @param {boolean} [props.busy]
 */
const TopSamplesTable = ({ samples, objective, onApplyParams, busy = false }) => {
  if (!Array.isArray(samples) || samples.length === 0) {
    return <p className="text-sm text-gray-500">No valid sample.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-gray-500">
        Best valid samples on the fit half. A single best sample is not a recommendation — the screening narrows
        ranges; Optimize picks the values.
      </p>
      <table className="sens-table" data-testid="top-samples-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{objectiveLabel(objective)}</th>
            <th>Trades</th>
            <th>PnL %</th>
            <th>Annual %</th>
            <th>Max DD %</th>
            <th>Params</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <tr key={`${s.rank}-${s.sampleIndex}`}>
              <td className="tabular-nums">{s.rank}</td>
              <td className="tabular-nums">{isNum(s.objective) ? s.objective.toFixed(3) : 'n/a'}</td>
              <td className="tabular-nums">{isNum(s.closedTrades) ? s.closedTrades : 'n/a'}</td>
              <td className="tabular-nums">{fmtPctSigned(s.pnlPercent)}</td>
              <td className="tabular-nums">{fmtPctSigned(s.annualPercent)}</td>
              <td className="tabular-nums">{fmtPctPlain(s.maxDdPercent)}</td>
              <td className="text-xs">{fmtParams(s.params)}</td>
              <td>
                {onApplyParams && (
                  <button
                    type="button"
                    onClick={() => onApplyParams(s.params)}
                    disabled={busy || !s.params}
                    className="py-0.5 px-2 text-xs border border-blue-600 text-blue-700 rounded bg-white hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-300 whitespace-nowrap"
                    title="Put these values into the form (Backtest mode); the Optimize ranges are not changed"
                  >
                    Apply as Backtest values
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TopSamplesTable;
