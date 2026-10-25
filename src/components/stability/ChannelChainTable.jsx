// src/components/stability/ChannelChainTable.jsx
//
// The chain table of "Parameter stability by channel" (screener TASK_channel_param_stability.md
// §6.1, architect.md §6 item 3): one row per chain level, root first. Fit-best params and their
// metrics on the Check half, WFE, regret, Δ(Fit↔Check), node-best params, Δ to the previous level,
// verdict with reasons and the fit-best's closed trades (Fit / Check). INCONCLUSIVE rows are greyed
// but show every metric returned; null values read "n/a". A row click selects the level.

import {
  VERDICT_STYLE, fmtDelta, fmtDirection, fmtFitCheckTrades, fmtParams, fmtPctPlain, fmtPctSigned, fmtRatio,
  fmtSliceTrades, fmtTs, isNum,
} from './stabilityFormat';

const TH = 'py-2 px-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap';
const TD = 'py-1.5 px-2 text-xs whitespace-nowrap tabular-nums';

const signClass = (v) => (isNum(v) ? (v >= 0 ? 'text-green-700' : 'text-red-700') : 'text-gray-400');

/** "node 1 · fit 2" for the Δ to the previous level; level 0 → "—". */
const fmtPrevDelta = (node) => {
  if (node.level === 0) return '—';
  return `node ${fmtDelta(node.deltaPrevLevelNode)} · fit ${fmtDelta(node.deltaPrevLevelFit)}`;
};

/**
 * @param {Object} props
 * @param {Array<Object>} props.nodes ChannelStabilityDTO.nodes (root first)
 * @param {number} props.selectedIndex index into `nodes`
 * @param {(index: number) => void} props.onSelect
 */
const ChannelChainTable = ({ nodes, selectedIndex, onSelect }) => (
  <div className="overflow-x-auto border border-gray-200 rounded" data-testid="stability-chain-table">
    <table className="min-w-full text-sm">
      <thead className="bg-gray-50">
        <tr className="border-b">
          <th className={TH} rowSpan={2}>Level</th>
          <th className={TH} rowSpan={2}>Start</th>
          <th className={TH} rowSpan={2}>Bars</th>
          <th className={TH} rowSpan={2}>Direction</th>
          <th className={TH} rowSpan={2} title="Best params on the Fit half (the first half of the channel)">Fit-best params</th>
          <th className={`${TH} text-center border-l border-gray-200`} colSpan={5}
            title="Metrics of the Fit-best params on the Check half (the second half, up to the end date)">
            On Check (Fit-best params)
          </th>
          <th className={`${TH} border-l border-gray-200`} rowSpan={2}
            title="Walk-forward efficiency: annual return on Check / annual return on Fit (of the Fit-best). STABLE needs ≥ 0.5">
            WFE
          </th>
          <th className={TH} rowSpan={2}
            title="Check objective of the Fit-best / best Check objective of any combination. STABLE needs ≥ 0.7">
            Regret
          </th>
          <th className={TH} rowSpan={2}
            title="Distance between the Fit-best and the Check-best params, in grid steps (max over params). STABLE needs ≤ 2">
            Δ Fit↔Check
          </th>
          <th className={TH} rowSpan={2} title="Best params on the whole channel">Node-best params</th>
          <th className={TH} rowSpan={2}
            title="Δ in steps to the previous (wider) level: of the node-best params, and of the Fit-best params">
            Δ prev level
          </th>
          <th className={TH} rowSpan={2} title="Verdict; trades = closed trades of the Fit-best on Fit / on Check">Verdict</th>
        </tr>
        <tr className="border-b">
          <th className={`${TH} border-l border-gray-200`}>PnL %</th>
          <th className={TH}>Annual %</th>
          <th className={TH}>Max DD %</th>
          <th className={TH}>Trades</th>
          <th className={TH}>B&amp;H %</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node, i) => {
          const check = node.fitBest?.check || null;
          const bhCheck = node.buyAndHold?.check || null;
          const inconclusive = node.verdict === 'INCONCLUSIVE';
          const selected = i === selectedIndex;
          const reasons = Array.isArray(node.reasons) ? node.reasons : [];
          return (
            <tr
              key={node.level}
              onClick={() => onSelect(i)}
              className={`border-b last:border-0 cursor-pointer ${selected ? 'bg-blue-50 outline outline-1 outline-blue-300' : 'hover:bg-gray-50'} ${inconclusive ? 'text-gray-400' : 'text-gray-800'}`}
              aria-selected={selected}
              data-testid={`stability-row-${node.level}`}
            >
              <td className={`${TD} font-semibold`}>
                {node.level}
                {/* Status of the chain node (incremental channels): a draft is younger than 10 bars or
                    narrower than 5 ATR - display only, absent on an older backend */}
                {(node.status ?? node.channelStatus) === 'PROVISIONAL' && (
                  <span
                    className="ml-1 px-1 rounded border border-dashed border-gray-400 text-[10px] font-normal text-gray-500"
                    title="Draft (provisional) channel: younger than 10 bars or narrower than 5 ATR, redrawn every bar"
                    data-testid={`stability-row-draft-${node.level}`}
                  >
                    draft
                  </span>
                )}
              </td>
              <td className={TD} title={node.channelStart && node.channelStart !== node.start ? `Channel start ${fmtTs(node.channelStart)}` : undefined}>
                {fmtTs(node.start)}
                {node.clippedByTradeStart && <span className="ml-1 text-amber-700" title="Clipped by the trade start">✂</span>}
                {node.sameStartAsPrevious && <span className="ml-1 text-gray-500" title="Same start as the previous level">=</span>}
              </td>
              <td className={TD}>{isNum(node.bars) ? node.bars : 'n/a'}</td>
              <td className={TD}>{fmtDirection(node)}</td>
              <td className={`${TD} font-medium ${inconclusive ? '' : 'text-blue-700'}`}>{fmtParams(node.fitBest?.params)}</td>
              <td className={`${TD} border-l border-gray-200 ${inconclusive ? '' : signClass(check?.pnlPercent)}`}>{fmtPctSigned(check?.pnlPercent)}</td>
              <td className={`${TD} ${inconclusive ? '' : signClass(check?.annualPercent)}`}>{fmtPctSigned(check?.annualPercent)}</td>
              <td className={TD}>{fmtPctPlain(check?.maxDdPercent)}</td>
              <td className={TD}>{fmtSliceTrades(check)}</td>
              <td className={TD}>{fmtPctSigned(bhCheck?.pnlPercent)}</td>
              <td className={`${TD} border-l border-gray-200`}>{fmtRatio(node.wfe)}</td>
              <td className={TD}>{fmtRatio(node.regret)}</td>
              <td className={TD}>{fmtDelta(node.deltaFitCheck)}</td>
              <td className={TD}>{fmtParams(node.nodeBest?.params)}</td>
              <td className={TD}>{fmtPrevDelta(node)}</td>
              <td className={`${TD} whitespace-normal min-w-[10rem]`}>
                <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-semibold ${VERDICT_STYLE[node.verdict] || VERDICT_STYLE.INCONCLUSIVE}`}>
                  {node.verdict || 'n/a'}
                </span>
                <span className="ml-1 text-gray-500" title="Closed trades of the Fit-best: on Fit / on Check">
                  trades {fmtFitCheckTrades(node)}
                </span>
                {reasons.length > 0 && (
                  <ul className="mt-0.5 text-[11px] text-gray-500 list-disc pl-4">
                    {reasons.map((r, k) => <li key={k}>{r}</li>)}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default ChannelChainTable;
