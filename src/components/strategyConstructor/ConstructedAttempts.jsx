// src/components/strategyConstructor/ConstructedAttempts.jsx
//
// The attempt counter of a constructed strategy (BA spec §5.3, Q14 / O3): how many versions it
// has and how many backtests / optimization (or screening) jobs ran on THIS version for the ticker
// and TF - an honest measure of how many structures were tried on the same data. Previews and the
// Signals tab are not counted. Read from GET /api/strategy/constructed/{id} (usage[]); a deleted
// strategy (404) shows nothing but the note.
import { useEffect, useState } from 'react';
import { getConstructed } from '../../api/constructedApi';
import { parseConstructedKey } from './constructedFormat';

/**
 * @param {Object} props
 * @param {string} props.strategyKey `Constructed:<id>@<version>`
 * @param {string} props.ticker
 * @param {string} props.timeFrame
 * @param {number|string} [props.refreshKey] a change refetches (a run finished)
 * @param {boolean} [props.compact] one short line (form) instead of a sentence (results)
 */
export default function ConstructedAttempts({ strategyKey, ticker, timeFrame, refreshKey = 0, compact = false }) {
  const parsed = parseConstructedKey(strategyKey);
  const id = parsed?.id ?? null;
  const [state, setState] = useState(null); // {dto} | {missing: true} | {error}

  useEffect(() => {
    if (id == null) return undefined;
    let alive = true;
    getConstructed(id)
      .then((dto) => { if (alive) setState({ dto }); })
      .catch((err) => { if (alive) setState(err.status === 404 ? { missing: true } : { error: err.message }); });
    return () => { alive = false; };
  }, [id, refreshKey]);

  if (!parsed || !state) return null;
  if (state.missing) {
    return <span className="text-xs text-red-700" data-testid="constructed-attempts-missing">deleted — attempts are not available</span>;
  }
  if (state.error) return null;
  const { dto } = state;
  const t = String(ticker || '').trim().toUpperCase();
  const row = dto.usage.find((u) => u.version === parsed.version && String(u.ticker).toUpperCase() === t && u.timeframe === timeFrame);
  const backtests = row?.backtests ?? 0;
  const optimizations = row?.optimizations ?? 0;
  const versions = dto.version ?? parsed.version;
  const text = compact
    ? `${versions} version${versions === 1 ? '' : 's'} · v${parsed.version} on ${t} ${timeFrame}: ${backtests} backtest${backtests === 1 ? '' : 's'}, ${optimizations} optimization${optimizations === 1 ? '' : 's'}`
    : `Attempts: ${versions} version${versions === 1 ? '' : 's'} of «${dto.name}»; v${parsed.version} on ${t} ${timeFrame}: `
      + `${backtests} backtest${backtests === 1 ? '' : 's'}, ${optimizations} optimization / screening job${optimizations === 1 ? '' : 's'}`
      + `${row?.combinations ? ` (${row.combinations.toLocaleString('en-US')} combinations)` : ''}.`;
  return (
    <span className="text-xs text-gray-600" data-testid="constructed-attempts" title="Previews and the Signals tab are not counted">
      {text}
    </span>
  );
}
