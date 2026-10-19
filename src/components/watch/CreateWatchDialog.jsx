// src/components/watch/CreateWatchDialog.jsx
//
// Create a signal watch from a saved case (screener architect.md "Signal watch" §6.1; BA §4).
// Modes: C (WAIT_ENTRY) - start flat, the model's entry and exit are reported; A (HOLDING) - "I
// already bought on <date> at <price>": the strategy manages that position and reports the sale.
// The entry price defaults to the close of the entry day's bar (first trading bar on/after it).
// Client-side hints (DAY / WEEK only, long-only) are advisory; the backend's 400 codes decide and
// are shown readably. After creation: the warnings (amber) and the baseline state.
import { useEffect, useRef, useState } from 'react';
import './watch.css';
import { createWatch } from '../../api/watchApi';
import { fetchPrices } from '../../api/channelApi';
import { startDownload } from '../../api/downloaderApi';
import { addDaysIso, daysAgoIso, exchangeToday, exchangeZoneForTicker } from '../../utils/dates';
import {
  STATE_LABELS, actionOf, describeCode, describeError, fmtDay, fmtTs, positionText, signalPriceText,
  zoneShort, watchPortfolioLabel, watchBlockReason,
} from './format';

// Yahoo serves ~730 days of hourly history (DownloaderController sources: historyLimitDays.HOUR).
const US_HOUR_HISTORY_DAYS = 729;

const isMoex = (ticker) => typeof ticker === 'string' && ticker.toUpperCase().endsWith('_MOEX');

/**
 * @param {Object} props
 * @param {{id: number, name: string, ticker: string, timeframe: string, longOnly: boolean,
 *   startDate?: string}} props.caseInfo the saved case to watch
 * @param {() => void} props.onClose
 * @param {(created: Object) => void} [props.onCreated] after a 201
 * @param {() => void} [props.onOpenWatchlist] "Open Watchlist" after creation
 */
const CreateWatchDialog = ({ caseInfo, onClose, onCreated, onOpenWatchlist }) => {
  const ticker = caseInfo.ticker || '';
  const zone = exchangeZoneForTicker(ticker);
  const today = exchangeToday(zone);
  const caseStartDay = caseInfo.startDate ? String(caseInfo.startDate).substring(0, 10) : '';

  const [mode, setMode] = useState('WAIT_ENTRY');
  const [entryDate, setEntryDate] = useState(today);
  const [entryPrice, setEntryPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [priceHint, setPriceHint] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [downloadMsg, setDownloadMsg] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const priceSeq = useRef(0);

  const hint = watchBlockReason(caseInfo);

  // Default entry price: close of the first DAY bar on/after the entry date (a weekend or holiday
  // entry → the next trading bar, like the backend's seeding).
  useEffect(() => {
    if (mode !== 'HOLDING' || !entryDate || !ticker) return undefined;
    const mySeq = ++priceSeq.current;
    const timer = setTimeout(async () => {
      try {
        const bars = await fetchPrices(ticker, 'DAY', entryDate, `${addDaysIso(entryDate, 7)}T23:59:59`);
        if (mySeq !== priceSeq.current) return;
        const bar = Array.isArray(bars) ? bars[0] : null;
        if (bar && Number.isFinite(bar.close)) {
          setPriceHint(`Close of ${fmtDay(bar.date)}: ${bar.close}`
            + (Number.isFinite(bar.low) && Number.isFinite(bar.high) ? ` (low ${bar.low}, high ${bar.high})` : ''));
          if (!priceTouched) setEntryPrice(String(bar.close));
        } else {
          setPriceHint(`No DAY bar of ${ticker} on or after ${entryDate} in the database`);
        }
      } catch {
        if (mySeq === priceSeq.current) setPriceHint(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [mode, entryDate, ticker, priceTouched]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const body = { caseId: caseInfo.id, mode };
    if (mode === 'HOLDING') {
      if (!entryDate) { setError('Enter the date you bought.'); return; }
      if (entryDate > today) { setError(`The entry date cannot be after the exchange's today (${today}).`); return; }
      const price = Number(entryPrice);
      if (!Number.isFinite(price) || price <= 0) { setError('Enter the price you bought at (a positive number).'); return; }
      body.entryDate = entryDate;
      body.entryPrice = price;
    }
    if (name.trim()) body.name = name.trim();
    if (note.trim()) body.note = note.trim();
    setSubmitting(true);
    try {
      const res = await createWatch(body);
      setCreated(res || {});
      onCreated?.(res);
    } catch (err) {
      setError(err.status === 404 && !err.code
        ? 'The backend does not serve the watch API (404) — restart it with the Signal watch feature.'
        : describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // "Download now": the market's WATCH portfolio (DATA_OUTDATED) or this ticker's hourly history
  // (NO_RAW_HISTORY), through the existing downloader. 409 = a download is already running.
  const handleDownload = async (kind) => {
    setDownloading(true);
    setDownloadMsg(null);
    const moex = isMoex(ticker);
    const portfolio = moex ? 'WATCH_MOEX' : 'WATCH_US';
    let body;
    if (kind === 'NO_RAW_HISTORY') {
      let from = caseStartDay || daysAgoIso(US_HOUR_HISTORY_DAYS, zone);
      if (!moex) {
        const horizon = daysAgoIso(US_HOUR_HISTORY_DAYS, zone);
        if (from < horizon) from = horizon;
      }
      body = {
        market: moex ? 'MOEX' : 'US',
        tickers: [moex ? ticker.replace(/_MOEX$/i, '') : ticker],
        timeFrame: 'HOUR',
        from,
      };
    } else {
      body = { portfolio, timeFrame: 'HOUR', from: today };
    }
    try {
      const res = await startDownload(body);
      if (res.conflict) setDownloadMsg({ kind: 'error', text: `A download is already running${res.error ? `: ${res.error}` : ''}.` });
      else setDownloadMsg({ kind: 'ok', text: `Download started (job ${res.jobId}). Follow it in the Downloader tab; the watch is checked when it finishes.` });
    } catch (err) {
      setDownloadMsg({ kind: 'error', text: err.message });
    } finally {
      setDownloading(false);
    }
  };

  const warnings = Array.isArray(created?.warnings) ? created.warnings : [];
  const baseline = Array.isArray(created?.baseline) ? created.baseline : [];
  const watch = created?.watch || null;
  const downloadKinds = warnings.map((w) => w.code).filter((c) => c === 'DATA_OUTDATED' || c === 'NO_RAW_HISTORY');

  return (
    <div className="watch-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="watch-modal" role="dialog" aria-modal="true" aria-labelledby="create-watch-title" data-testid="create-watch-dialog">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 id="create-watch-title" className="text-lg font-bold">Watch this case</h2>
            <p className="text-sm text-gray-600 break-words">
              {caseInfo.name} · {ticker} {caseInfo.timeframe}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="text-gray-400 hover:text-gray-700 leading-none" aria-label="Close">✕</button>
        </div>

        {!created ? (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            {hint && (
              <div className="p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="create-watch-hint">
                {hint}. The backend will most likely refuse it.
              </div>
            )}

            <fieldset className="flex flex-col gap-2" disabled={submitting}>
              <legend className="text-sm font-medium text-gray-700 mb-1">Mode</legend>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name="watch-mode" value="WAIT_ENTRY" checked={mode === 'WAIT_ENTRY'}
                  onChange={() => setMode('WAIT_ENTRY')} className="mt-1" data-testid="watch-mode-wait" />
                <span>
                  <b>C · Wait for an entry</b>
                  <span className="block text-xs text-gray-500">Start flat. You are told when the model buys, then when it sells.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name="watch-mode" value="HOLDING" checked={mode === 'HOLDING'}
                  onChange={() => setMode('HOLDING')} className="mt-1" data-testid="watch-mode-holding" />
                <span>
                  <b>A · I already hold it</b>
                  <span className="block text-xs text-gray-500">
                    The strategy manages your position from the day you bought, and tells you when to sell.
                  </span>
                </span>
              </label>
            </fieldset>

            {mode === 'HOLDING' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">Bought on ({zoneShort(zone)})</span>
                  <input
                    type="date"
                    value={entryDate}
                    max={today}
                    min={caseStartDay || undefined}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="p-1.5 border rounded"
                    disabled={submitting}
                    data-testid="watch-entry-date"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">Price</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={entryPrice}
                    onChange={(e) => { setEntryPrice(e.target.value); setPriceTouched(true); }}
                    className="p-1.5 border rounded"
                    disabled={submitting}
                    data-testid="watch-entry-price"
                  />
                </label>
                {priceHint && (
                  <p className="col-span-2 text-xs text-gray-500">
                    {priceHint}
                    {priceTouched && (
                      <button type="button" className="ml-2 text-blue-600 hover:underline" onClick={() => setPriceTouched(false)}>
                        use the close
                      </button>
                    )}
                  </p>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">Name</span>
              <input type="text" value={name} maxLength={128} onChange={(e) => setName(e.target.value)}
                placeholder="Empty = <case name> · <mode>" className="p-1.5 border rounded" disabled={submitting}
                data-testid="watch-name" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">Note</span>
              <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)} className="p-1.5 border rounded resize-y" disabled={submitting} />
            </label>

            <p className="text-xs text-gray-500">
              The case&apos;s parameters are frozen into the watch: later edits or deletion of the case do not change it.
            </p>

            {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm" role="alert" data-testid="create-watch-error">{error}</div>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 disabled:text-gray-400">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="py-1 px-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400" data-testid="create-watch-submit">
                {submitting ? 'Creating…' : 'Create watch'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3" data-testid="create-watch-result">
            <div className="p-2 rounded bg-green-50 border border-green-200 text-green-800 text-sm" role="status">
              Watch «{watch?.name || name || caseInfo.name}» created.
            </div>

            {watch && (
              <div className="text-sm text-gray-700">
                <div>Model position: <b>{positionText(watch.position)}</b>{watch.position?.seeded ? ' (your entry)' : ''}</div>
                <div className="text-xs text-gray-500">
                  Linked {fmtTs(watch.linkedAt)} {zoneShort(watch.zone, watch.ticker)} · trade start {fmtDay(watch.tradeStart)}
                  {watch.nextWatchRunAt ? ` · next WATCH download ${fmtTs(watch.nextWatchRunAt)} ${zoneShort(watch.zone, watch.ticker)}` : ''}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="create-watch-warnings">
                <ul className="list-disc pl-5">
                  {warnings.map((w, i) => (
                    <li key={i} data-code={w.code}>{describeCode(w.code, w.message)}</li>
                  ))}
                </ul>
                {downloadKinds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {downloadKinds.includes('DATA_OUTDATED') && (
                      <button type="button" onClick={() => handleDownload('DATA_OUTDATED')} disabled={downloading}
                        className="py-0.5 px-2 text-xs border border-amber-600 rounded bg-white hover:bg-amber-50 disabled:text-gray-400"
                        data-testid="watch-download-now">
                        Download {watchPortfolioLabel(isMoex(ticker) ? 'WATCH_MOEX' : 'WATCH_US')} now
                      </button>
                    )}
                    {downloadKinds.includes('NO_RAW_HISTORY') && (
                      <button type="button" onClick={() => handleDownload('NO_RAW_HISTORY')} disabled={downloading}
                        className="py-0.5 px-2 text-xs border border-amber-600 rounded bg-white hover:bg-amber-50 disabled:text-gray-400"
                        data-testid="watch-download-history">
                        Download {ticker} hourly history
                      </button>
                    )}
                  </div>
                )}
                {downloadMsg && (
                  <div className={`mt-1 text-xs ${downloadMsg.kind === 'error' ? 'text-red-700' : 'text-green-800'}`}>{downloadMsg.text}</div>
                )}
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Signals already visible ({baseline.length})</div>
              {baseline.length === 0 ? (
                <p className="text-xs text-gray-500">None — the watch reports the next signal on a closed bar.</p>
              ) : (
                <ul className="text-xs max-h-40 overflow-y-auto divide-y divide-gray-100" data-testid="create-watch-baseline">
                  {baseline.map((s) => (
                    <li key={s.id ?? `${s.barDate}-${s.type}`} className={`py-1 watch-sig--${s.state}`}>
                      <span className={`watch-action--${actionOf(s)}`}>{actionOf(s)}</span> {fmtDay(s.barDate)} {signalPriceText(s)}
                      <span className={`ml-1 watch-state-badge watch-state-badge--${s.state}`}>{STATE_LABELS[s.state] || s.state}</span>
                      {s.state === 'PROVISIONAL' && <span className="ml-1 text-gray-500">— the bar has not closed; you are told when it does</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {onOpenWatchlist && (
                <button type="button" onClick={() => { onClose(); onOpenWatchlist(); }}
                  className="py-1 px-3 border border-blue-600 text-blue-600 rounded hover:bg-blue-50" data-testid="create-watch-open-watchlist">
                  Open Watchlist
                </button>
              )}
              <button type="button" onClick={onClose} className="py-1 px-3 rounded bg-blue-600 text-white hover:bg-blue-700">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateWatchDialog;
