// src/components/nextTriggers/NextBarCard.jsx
//
// "Next bar" card (screener architect.md §3, BA spec §3.2 / §5.3): the state at the basis bar's
// close, the merged trigger lines for the next bar with category badges and distances, "what
// actually happened" for a run that ended in the past, the live price vs the lines for a bar in
// progress, the always-visible execution note and the per-strategy breakdown (collapsed).
// Reads only the normalized object of nextTriggersAdapter.js.
import { useState } from 'react';
import './nextBarCard.css';
import {
  actionLines, categoryBadge, distanceText, fmtTriggerPrice, fmtTriggerTs, infoLines, isIntrabarStop,
  kindText, lineText, nextBarLabel, nowVsLineText, partialText, statusText, OUTCOME_TEXT,
  DEFAULT_EXECUTION_NOTE, isBenchmark, fmtBarKey, isSetupPreview, setupPreview, previewSentences,
} from './nextTriggersFormat';
import { isConstructedKey, strategyLabel } from '../strategyConstructor/constructedFormat';

const RUN_KIND_TEXT = { BACKTEST: 'backtest run', SIGNALS: 'signals run', WATCH: 'watch run' };

const CategoryBadge = ({ category }) => {
  const b = categoryBadge(category);
  if (!b) return null;
  return <span className={`nbt-badge ${b.cls}`} title={b.title}>{b.text}</span>;
};

const LineRow = ({ line, nowPrice = null, showSource = false }) => {
  const info = line.informational;
  const now = !info ? nowVsLineText(line, nowPrice) : '';
  return (
    <div className={`nbt-line-row${info ? ' nbt-line-row--info' : ''}`} data-testid="next-bar-line" data-side={line.side}>
      <span className={`nbt-side nbt-side--${line.side}`}>{info ? 'info' : line.side === 'VETO' ? 'veto' : line.side}</span>
      <span className={info ? '' : 'font-medium text-gray-900'}>{lineText(line)}</span>
      <CategoryBadge category={line.category} />
      {isIntrabarStop(line) && (
        <span
          className="nbt-badge nbt-badge--stop"
          title="Intrabar stop: fills at the line in the backtest and can be placed as a stop order. A gap through it fills worse in reality."
        >
          intrabar stop
        </span>
      )}
      {(!info || isSetupPreview(line)) && distanceText(line) && (
        <span className="nbt-distance" title="Line minus the basis close: price, % and ATR multiples">{distanceText(line)}</span>
      )}
      {now && <span className="nbt-distance text-emerald-700">· {now}</span>}
      {showSource && line.source && <span className="nbt-distance">· {line.source}</span>}
    </div>
  );
};

/** The lines (or the kind sentence) of one estimate. */
const EstimateBody = ({ estimate, position, nowPrice, showInfo = true, showSource = false, hidePreview = false }) => {
  const lines = actionLines(estimate);
  const infos = showInfo ? infoLines(estimate).filter(l => !(hidePreview && isSetupPreview(l))) : [];
  const sentence = estimate.kind !== 'LINES' || lines.length === 0
    ? kindText(estimate.kind === 'LINES' ? { ...estimate, kind: 'NONE' } : estimate, position)
    : null;
  return (
    <div>
      {sentence && <div className="text-sm text-gray-700" data-testid="next-bar-kind">{sentence}</div>}
      {estimate.kind !== 'POSSIBLE_OUTSIDE_BAND' && lines.map((line, i) => (
        <LineRow key={`l${i}`} line={line} nowPrice={nowPrice} showSource={showSource} />
      ))}
      {infos.map((line, i) => <LineRow key={`i${i}`} line={line} />)}
    </div>
  );
};

/**
 * FLAT, no armed setup: where the zone would break out and the runaway price after that breakout
 * (screener architect.md "setup preview" §3.3). Informational only - never a next-bar order.
 */
const SetupPreview = ({ preview, nt }) => (
  <div className="nbt-preview" data-testid="next-bar-setup-preview">
    <div className="nbt-preview__head">Setup preview (not a next-bar order)</div>
    {[preview.arms, preview.runaway].filter(Boolean).map((line, i) => (
      <LineRow key={i} line={line} showSource={nt.strategies.length > 1} />
    ))}
    <div className="nbt-preview__note" data-testid="next-bar-setup-preview-note">
      {previewSentences(preview, nt).map((s, i) => <div key={i}>{s}</div>)}
    </div>
  </div>
);

const fmtCell = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : fmtTriggerPrice(v)) : '—';
  if (typeof v === 'string' || typeof v === 'boolean') return String(v);
  return null; // nested objects are left out of the one-line tracker summary
};

/** LevelBreakoutRetest tracker detail: one line per tracker, its primitive fields as k=v. */
const TrackerList = ({ trackers }) => (
  <ul className="mt-1 ml-3 list-disc text-xs text-gray-600" data-testid="next-bar-trackers">
    {trackers.map((t, i) => (
      <li key={i}>
        {Object.entries(t)
          .map(([k, v]) => [k, fmtCell(v)])
          .filter(([, v]) => v !== null)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}
      </li>
    ))}
  </ul>
);

const StrategyBreakdown = ({ nt }) => (
  <div className="mt-2 flex flex-col gap-2" data-testid="next-bar-breakdown">
    {nt.strategies.map(s => (
      <div key={s.key} className="border-l-2 border-gray-200 pl-2" data-testid="next-bar-strategy" data-key={s.key}>
        <div className="text-sm font-medium text-gray-800">
          {strategyLabel(s.key)}
          {s.strategyClass && s.strategyClass !== s.key && !isConstructedKey(s.key) && <span className="font-normal text-gray-500"> ({s.strategyClass})</span>}
          {s.kind !== 'LINES' && !isBenchmark(s) && (
            <span className="ml-2 nbt-badge">{s.kind.toLowerCase().replace(/_/g, ' ')}</span>
          )}
        </div>
        <EstimateBody estimate={s} position={nt.position} nowPrice={nt.nextBar.inProgress ? nt.nextBar.nowPrice : null} />
        {s.kind === 'POSSIBLE_OUTSIDE_BAND' && s.reason && <div className="text-xs text-gray-500">{s.reason}</div>}
        {s.trackers.length > 0 && <TrackerList trackers={s.trackers} />}
      </div>
    ))}
  </div>
);

const ActualRow = ({ actual, nt }) => {
  const cls = actual.outcome === 'BUY' ? 'text-green-700' : actual.outcome === 'SELL' ? 'text-red-700' : 'text-gray-700';
  const which = actual.line ? lineText(actual.line) : actual.lineText;
  return (
    <div className="mt-3 p-2 rounded bg-gray-50 border border-gray-200 text-sm" data-testid="next-bar-actual">
      <span className="font-medium text-gray-800">What actually happened</span>
      {actual.date && <> on {fmtBarKey(nt, actual.date)}</>}:{' '}
      <span className={`font-semibold ${cls}`}>{OUTCOME_TEXT[actual.outcome]}</span>
      {which && <> — {which}</>}
      {actual.close !== null && (
        <span className="nbt-distance">
          {' '}· O {fmtTriggerPrice(actual.open)} H {fmtTriggerPrice(actual.high)} L {fmtTriggerPrice(actual.low)} C {fmtTriggerPrice(actual.close)}
        </span>
      )}
      <div className="text-xs text-gray-500">Per the lines evaluated on the real bar (replay-verified).</div>
    </div>
  );
};

/**
 * @param {Object} props
 * @param {Object|null} props.nt - adaptNextTriggers() result; null renders nothing
 * @param {boolean} [props.compact=false] - smaller layout for the Watchlist detail row
 * @param {boolean} [props.stale=false] - an earlier estimate kept after a failed / newer run ("as of …")
 */
const NextBarCard = ({ nt, compact = false, stale = false }) => {
  const [open, setOpen] = useState(false);
  if (!nt) return null;

  const m = nt.merged;
  const nb = nt.nextBar;
  const nowPrice = nb.inProgress ? nb.nowPrice : null;
  const statusMsg = statusText(nt);
  const tradingFrom = nt.tradeStart ? `, trading from ${fmtBarKey(nt, nt.tradeStart)}` : '';
  const runKind = RUN_KIND_TEXT[nt.runKind] || 'run';
  const partial = m ? partialText(m) : null;
  const preview = setupPreview(nt);

  return (
    <div
      className={compact ? 'p-3 rounded border border-gray-200 bg-white' : 'bg-white p-4 rounded-lg shadow'}
      data-testid="next-bar-card"
    >
      <div className="flex flex-wrap items-baseline gap-2 mb-1">
        <h3 className={compact ? 'text-sm font-semibold text-gray-900' : 'text-lg font-medium text-gray-900'}>
          Next bar{' '}
          <span className="font-normal text-gray-600" data-testid="next-bar-label">
            {[nextBarLabel(nt) === 'next bar' ? null : nextBarLabel(nt), nb.inProgress ? '(in progress)' : null]
              .filter(Boolean).join(' ')}
          </span>
        </h3>
        {m?.partial && <span className="nbt-badge nbt-badge--partial" title={partial || ''}>partial</span>}
        {nb.inProgress && nowPrice !== null && (
          <span className="nbt-badge nbt-badge--live" title={nb.nowAt ? `last update ${fmtTriggerTs(nb.nowAt)}` : ''}>
            now {fmtTriggerPrice(nowPrice)}
          </span>
        )}
        {stale && (
          <span className="nbt-badge nbt-badge--stale" title="An earlier estimate, kept because the latest check did not produce a new one">
            as of {fmtBarKey(nt, nt.basisBarDate)}
          </span>
        )}
      </div>

      {nt.basisBarDate && (
        <div className="text-sm text-gray-600 mb-2" data-testid="next-bar-state">
          State at {fmtBarKey(nt, nt.basisBarDate)} close
          {nt.basisClose !== null && <> ({fmtTriggerPrice(nt.basisClose)})</>}:{' '}
          <span className={`font-semibold ${nt.position === 'LONG' ? 'text-green-700' : 'text-gray-800'}`}>{nt.position || '—'}</span>
          {nt.position === 'LONG' && nt.positionEntryPrice !== null && <> @ {fmtTriggerPrice(nt.positionEntryPrice)}</>}
          {nt.positionSeeded && <> (your entry)</>}
          {' '}({runKind}{tradingFrom})
          {nt.atr !== null && <span className="nbt-distance"> · ATR {fmtTriggerPrice(nt.atr)}</span>}
        </div>
      )}

      {statusMsg ? (
        <div className={`text-sm ${nt.status === 'ERROR' ? 'text-red-700' : 'text-gray-700'}`} data-testid="next-bar-status">
          {statusMsg}
        </div>
      ) : nt.position === 'SHORT' ? (
        <div className="text-sm text-gray-700">Short positions are not estimated in v1.</div>
      ) : m ? (
        <div data-testid="next-bar-merged">
          <EstimateBody
            estimate={m} position={nt.position} nowPrice={nowPrice} showSource={nt.strategies.length > 1}
            hidePreview={Boolean(preview)}
          />
          {preview && <SetupPreview preview={preview} nt={nt} />}
          {partial && <div className="mt-1 text-xs text-purple-800" data-testid="next-bar-partial">{partial}</div>}
        </div>
      ) : (
        <div className="text-sm text-gray-500">—</div>
      )}

      {nt.actual && <ActualRow actual={nt.actual} nt={nt} />}

      {nt.warnings.length > 0 && (
        <div className="mt-2 text-xs text-amber-800" data-testid="next-bar-warnings">
          {nt.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      <div className="mt-3 nbt-note" data-testid="next-bar-execution-note">
        <span className="font-semibold">Execution: </span>{nt.executionNote || DEFAULT_EXECUTION_NOTE}
      </div>

      {nt.strategies.length > 0 && nt.status === 'OK' && (
        <div className="mt-2">
          <button type="button" className="nbt-toggle" onClick={() => setOpen(o => !o)} data-testid="next-bar-breakdown-toggle">
            {open ? '▾' : '▸'} Per strategy ({nt.strategies.length})
          </button>
          {open && <StrategyBreakdown nt={nt} />}
        </div>
      )}
    </div>
  );
};

export default NextBarCard;
