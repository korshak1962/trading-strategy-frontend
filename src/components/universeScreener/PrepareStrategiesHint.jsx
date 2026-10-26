// src/components/universeScreener/PrepareStrategiesHint.jsx
//
// Shown under a Backtest / Optimize error when the backend answered 400 because the ticker is a
// universe member with the minimal indicator set (SmaNotAvailableException + "Prepare for
// strategies" hint, owner decision O4): explains it and offers the one-click preparation.
import { useEffect, useRef, useState } from 'react';
import { prepareAndWait } from './prepareFlow';

export default function PrepareStrategiesHint({ ticker, onReady }) {
  const [state, setState] = useState({ busy: false, result: null, progress: null });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = async () => {
    setState({ busy: true, result: null, progress: null });
    const result = await prepareAndWait(ticker, {
      onProgress: (job) => alive.current && setState((s) => ({ ...s, progress: job })),
      isCancelled: () => !alive.current,
    });
    if (!alive.current) return;
    setState({ busy: false, result, progress: null });
    if (result.status === 'READY') onReady?.();
  };

  const pct = Number.isFinite(state.progress?.percent) ? ` ${Math.floor(state.progress.percent)} %` : '';
  return (
    <div className="mt-2 p-3 rounded border border-amber-300 bg-amber-50 text-sm text-amber-900" data-testid="prepare-hint">
      <div>
        <b>{ticker}</b> is a screener-universe ticker with the <b>minimal</b> indicator set (only the SMA lengths the
        screener filters use). Strategies need the full set.
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={state.busy}
          className="py-1 px-3 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-400" data-testid="prepare-hint-run">
          {state.busy ? `Preparing…${pct}` : 'Prepare for strategies'}
        </button>
        <span className="text-xs">A download job computes the indicators (≈ 10–30 s), then run again.</span>
      </div>
      {state.result && (
        <div className={`mt-2 text-xs ${state.result.status === 'READY' ? 'text-green-800' : 'text-red-700'}`}>
          {state.result.text}{state.result.status === 'READY' ? ' Run the backtest again.' : ''}
        </div>
      )}
    </div>
  );
}
