// src/components/indicatorsChart/StaleTailPrompt.jsx
//
// Q3 (owner decision 2026-11-06): when a stored SMA ends before the prices, ASK the user whether
// to calculate the missing rows - an inline panel above the chart, never window.confirm. One panel
// per load listing every stale length that can be topped up. "Calculate" writes the rows through
// the existing calculation path (POST /api/indicators/sma-tail) and redraws; "Not now" is
// remembered for this session per (ticker, timeframe, length): the chip keeps its warning.
import { formatBarDate } from '../channelExplorer/format';

/**
 * @param {Object} props
 * @param {string} props.ticker
 * @param {string} props.timeframe
 * @param {Array<{length: number, storedTo: string, pricesTo: string, missingBars: number}>} props.stale
 * @param {boolean} props.busy
 * @param {?{text: string, retry: boolean}} props.error
 * @param {?string} props.done - a result line after a successful calculation
 * @param {() => void} props.onCalculate
 * @param {() => void} props.onDismiss
 */
export default function StaleTailPrompt({ ticker, timeframe, stale, busy, error, done, onCalculate, onDismiss }) {
  if (stale.length === 0 && !error && !done) return null;
  if (stale.length === 0) {
    return (
      <div className={`ic-stale${error ? ' ic-stale--error' : ' ic-stale--done'}`} data-testid="ic-stale-prompt" role="status">
        <span>{error ? error.text : done}</span>
        <div className="ic-stale__actions">
          <button type="button" className="ic-btn" onClick={onDismiss}>Close</button>
        </div>
      </div>
    );
  }
  const lines = stale.map(s => `SMA(${s.length}) is stored to ${formatBarDate(s.storedTo)}, prices to ${formatBarDate(s.pricesTo)}`
    + ` (${s.missingBars} bar${s.missingBars === 1 ? '' : 's'} missing)`);
  return (
    <div className="ic-stale" data-testid="ic-stale-prompt" role="alertdialog" aria-label="Stale SMA tail">
      <div className="ic-stale__text">
        {lines.map(l => <div key={l}>{l}.</div>)}
        <div>
          Calculate the missing rows for {ticker} {timeframe}? They are written to the database the same way a
          download writes them. Until then the line stops at the last stored row and a strategy on this range is refused.
        </div>
        {error && <div className="ic-stale__error" data-testid="ic-stale-error">{error.text}</div>}
      </div>
      <div className="ic-stale__actions">
        <button type="button" className="ic-btn ic-btn--primary" onClick={onCalculate} disabled={busy} data-testid="ic-stale-calculate">
          {busy ? 'Calculating…' : error?.retry ? 'Retry' : 'Calculate'}
        </button>
        <button type="button" className="ic-btn" onClick={onDismiss} disabled={busy} data-testid="ic-stale-dismiss">Not now</button>
      </div>
    </div>
  );
}
