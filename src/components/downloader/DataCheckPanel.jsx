// src/components/downloader/DataCheckPanel.jsx
//
// "Data check" section of the Downloader tab: find gaps in a ticker's stored history and
// delete one side of a gap (dry run first, then the real delete, then an automatic re-scan).
// Contract: screener TASK_downloader_gaps.md §2.1 (GET /gaps), §2.2 (POST /delete), §3 (UI).
import { useState, Fragment } from 'react';
import { fetchGaps, deleteRange } from '../../api/downloaderApi';

const GAP_TIMEFRAMES = ['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH'];
const MOEX_SUFFIX = '_MOEX';

const JOB_RUNNING_MESSAGE = 'A download job is running — deleting is disabled until it finishes.';

// Chip → ticker as stored: MOEX tickers are stored with the `_MOEX` suffix (Downloader.resolveDbTicker).
const toDbTicker = (ticker, market) =>
  market === 'MOEX' && !ticker.endsWith(MOEX_SUFFIX) ? `${ticker}${MOEX_SUFFIX}` : ticker;

// "2024-01-05T15:55:00" → "2024-01-05 15:55"; "2024-01-05T00:00:00" → "2024-01-05".
const fmtBar = (s) => {
  if (s == null || s === '') return '—';
  return String(s)
    .replace('T', ' ')
    .replace(/(\d{2}:\d{2}):\d{2}(\.\d+)?$/, '$1')
    .replace(/ 00:00$/, '');
};

const fmtInt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

// The delete response is "the row count per table" (§2.2). Accept a plain map
// {table: n}, a wrapper {counts|tables|rows: {...}} or an array [{table, rows|count}].
const normalizeCounts = (body) => {
  let entries = [];
  if (Array.isArray(body)) {
    entries = body.map((r) => [r?.table ?? r?.name, r?.rows ?? r?.count ?? r?.deleted]);
  } else if (body && typeof body === 'object') {
    const inner = [body.counts, body.tables, body.rows].find((x) => x && typeof x === 'object');
    if (Array.isArray(inner)) return normalizeCounts(inner);
    entries = Object.entries(inner || body).filter(([k]) => k !== 'total' && k !== 'dryRun');
  }
  const rows = entries
    .filter(([t, n]) => t && typeof n === 'number')
    .map(([table, n]) => ({ table, n }));
  const total = typeof body?.total === 'number' ? body.total : rows.reduce((a, r) => a + r.n, 0);
  return { rows, total };
};

const countsText = ({ rows, total }) =>
  rows.length === 0
    ? `${fmtInt(total)} rows`
    : `${fmtInt(total)} rows in: ${rows.map((r) => `${r.table} ${fmtInt(r.n)}`).join(', ')}`;

const gapKey = (tf, g) => `${tf}|${g.lastBefore}|${g.firstAfter}`;

/**
 * @param {string[]} tickers  the chips of the download form (dropdown options)
 * @param {string}   market   'US' | 'MOEX' (decides the `_MOEX` suffix of the options)
 * @param {boolean}  jobActive a download job is QUEUED/RUNNING → delete buttons disabled
 */
export default function DataCheckPanel({ tickers, market, jobActive }) {
  const options = [...new Set((tickers || []).map((t) => toDbTicker(t, market)))];
  // null = not edited yet → prefilled with the first chip
  const [tickerInput, setTickerInput] = useState(null);
  const ticker = (tickerInput ?? options[0] ?? '').trim().toUpperCase();

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [result, setResult] = useState(null); // { ticker, blocks: [...] }
  const [cascade, setCascade] = useState({}); // gapKey → bool (off by default)
  const [pending, setPending] = useState(null); // dry-run confirmation awaiting the 2nd click
  const [busyKey, setBusyKey] = useState(null); // gapKey whose dry run / delete is in flight
  const [actionError, setActionError] = useState(null); // { key, message }
  const [notice, setNotice] = useState(null);

  const scan = async (t) => {
    setScanning(true);
    setScanError(null);
    try {
      const blocks = await fetchGaps(t, GAP_TIMEFRAMES);
      setResult({ ticker: t, blocks: Array.isArray(blocks) ? blocks : [] });
    } catch (err) {
      setResult(null);
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleFind = async (e) => {
    e.preventDefault();
    setNotice(null);
    setPending(null);
    setActionError(null);
    if (!ticker) { setScanError('Enter a ticker'); return; }
    await scan(ticker);
  };

  const deleteBody = (tf, g, side, dryRun) => ({
    ticker: result.ticker,
    timeFrame: tf,
    side,
    boundary: side === 'BEFORE' ? g.firstAfter : g.lastBefore,
    cascade: !!cascade[gapKey(tf, g)],
    dryRun,
  });

  const actionFailed = (key, err) => {
    setActionError({
      key,
      // A 409 has two causes (a download job runs, or another gap delete is in progress): show
      // the backend's own text, and fall back to the job-running wording only without a body.
      message: err.status === 409 ? (err.detail || JOB_RUNNING_MESSAGE) : err.message,
    });
  };

  // First click: dry run → in-page confirmation with the row count per table.
  const handlePreview = async (tf, g, side) => {
    const key = gapKey(tf, g);
    const body = deleteBody(tf, g, side, true);
    setNotice(null);
    setActionError(null);
    setPending(null);
    setBusyKey(key);
    try {
      const counts = normalizeCounts(await deleteRange(body));
      setPending({ key, body, counts });
    } catch (err) {
      actionFailed(key, err);
    } finally {
      setBusyKey(null);
    }
  };

  // Second click: the real delete, then an automatic re-scan.
  const handleConfirm = async () => {
    if (!pending) return;
    const { key, body } = pending;
    setActionError(null);
    setBusyKey(key);
    try {
      const counts = normalizeCounts(await deleteRange({ ...body, dryRun: false }));
      setPending(null);
      const done = `Deleted ${countsText(counts)} (${body.ticker} ${body.timeFrame}, `
        + `${body.side === 'BEFORE' ? 'before' : 'after'} ${fmtBar(body.boundary)}`
        + `${body.cascade ? ', cascaded to higher timeframes' : ''}).`;
      setNotice(`${done} Re-scanning…`);
      await scan(body.ticker);
      setNotice(`${done} Gaps re-scanned.`);
    } catch (err) {
      actionFailed(key, err);
    } finally {
      setBusyKey(null);
    }
  };

  const toggleCascade = (key) => {
    setCascade((prev) => ({ ...prev, [key]: !prev[key] }));
    // the preview counts no longer match the checkbox
    setPending((p) => (p && p.key === key ? null : p));
  };

  const deleteDisabled = jobActive || busyKey !== null;

  return (
    <div className="bg-white p-6 rounded-lg shadow mt-8">
      <h2 className="text-xl font-bold mb-1">Data check</h2>
      <p className="mb-4 text-sm text-gray-600">
        Find gaps in a ticker&apos;s stored history (trading calendar = SPY for US, SBER_MOEX for MOEX)
        and delete one side of a gap. The smaller side is usually the one to delete; both bar counts are shown.
      </p>

      <form onSubmit={handleFind} className="flex flex-wrap items-end gap-2" noValidate>
        <div className="min-w-[12rem]">
          <label htmlFor="dc-ticker" className="block text-sm font-medium text-gray-700 mb-2">Ticker (as stored)</label>
          <input
            id="dc-ticker"
            list="dc-ticker-options"
            value={tickerInput ?? options[0] ?? ''}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="e.g. SPY"
            autoComplete="off"
            className="w-full p-2 border rounded"
          />
          <datalist id="dc-ticker-options">
            {options.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={scanning || !ticker}
          className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {scanning ? 'Scanning…' : 'Find gaps'}
        </button>
      </form>

      {jobActive && (
        <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status">
          {JOB_RUNNING_MESSAGE} Find gaps still works.
        </div>
      )}
      {scanError && <div className="form-error" role="alert">{scanError}</div>}
      {notice && (
        <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm" role="status">
          {notice}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-6">
          {result.blocks.length === 0 && (
            <p className="text-sm text-gray-500">No timeframes returned for {result.ticker}.</p>
          )}
          {result.blocks.map((b) => {
            const gaps = Array.isArray(b.gaps) ? b.gaps : [];
            return (
              <div key={b.timeFrame} data-testid={`gaps-${b.timeFrame}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                  <h3 className="font-semibold">{result.ticker} · {b.timeFrame}</h3>
                  <span className="text-sm text-gray-600">
                    {b.bars > 0
                      ? <>{fmtBar(b.firstBar)} … {fmtBar(b.lastBar)}, {fmtInt(b.bars)} bars</>
                      : 'no data'}
                  </span>
                  {b.calendar && b.bars > 0 && (
                    <span className="text-xs text-gray-400">calendar: {b.calendar}</span>
                  )}
                  {b.bars > 0 && gaps.length === 0 && (
                    <span className="text-sm text-green-700 font-medium">no gaps</span>
                  )}
                </div>

                {gaps.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="px-2 py-1 text-left border-b">From (last bar before)</th>
                          <th className="px-2 py-1 text-left border-b">To (first bar after)</th>
                          <th className="px-2 py-1 text-right border-b">Missing trading days</th>
                          <th className="px-2 py-1 text-right border-b">Bars before</th>
                          <th className="px-2 py-1 text-right border-b">Bars after</th>
                          <th className="px-2 py-1 text-left border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gaps.map((g) => {
                          const key = gapKey(b.timeFrame, g);
                          const isPending = pending?.key === key;
                          const rowError = actionError?.key === key ? actionError.message : null;
                          return (
                            <Fragment key={key}>
                              <tr className="border-b align-top">
                                <td className="px-2 py-1 whitespace-nowrap">{fmtBar(g.lastBefore)}</td>
                                <td className="px-2 py-1 whitespace-nowrap">
                                  {fmtBar(g.firstAfter)}
                                  {g.calendarFallback && (
                                    <span
                                      className="ml-2 px-1 rounded bg-gray-100 text-gray-600 text-xs"
                                      title="Before the reference ticker's first bar: found with a Mon–Fri calendar, so it may be an exchange holiday"
                                    >
                                      weekday calendar
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1 text-right">{fmtInt(g.missingDays)}</td>
                                <td className="px-2 py-1 text-right">{fmtInt(g.barsBefore)}</td>
                                <td className="px-2 py-1 text-right">{fmtInt(g.barsAfter)}</td>
                                <td className="px-2 py-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handlePreview(b.timeFrame, g, 'BEFORE')}
                                      disabled={deleteDisabled}
                                      title={jobActive ? JOB_RUNNING_MESSAGE : `Delete every ${b.timeFrame} row before ${fmtBar(g.firstAfter)}`}
                                      className="px-2 py-0.5 rounded border border-red-600 text-red-600 hover:bg-red-50 text-xs disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                                    >
                                      Delete before
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePreview(b.timeFrame, g, 'AFTER')}
                                      disabled={deleteDisabled}
                                      title={jobActive ? JOB_RUNNING_MESSAGE : `Delete every ${b.timeFrame} row after ${fmtBar(g.lastBefore)}`}
                                      className="px-2 py-0.5 rounded border border-red-600 text-red-600 hover:bg-red-50 text-xs disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                                    >
                                      Delete after
                                    </button>
                                    <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={!!cascade[key]}
                                        onChange={() => toggleCascade(key)}
                                        disabled={busyKey !== null}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      cascade to higher timeframes
                                    </label>
                                    {busyKey === key && <span className="text-xs text-gray-500">working…</span>}
                                  </div>
                                </td>
                              </tr>
                              {(isPending || rowError) && (
                                <tr className="border-b">
                                  <td colSpan={6} className="px-2 py-2">
                                    {isPending && (
                                      <div className="p-3 rounded bg-red-50 border border-red-300 text-red-800 text-sm" role="alertdialog" aria-label="Confirm delete">
                                        <p className="font-medium">
                                          Delete {pending.body.side === 'BEFORE' ? 'before' : 'after'}{' '}
                                          {fmtBar(pending.body.boundary)} ({pending.body.ticker} {pending.body.timeFrame}
                                          {pending.body.cascade ? ' + higher timeframes' : ''})?
                                        </p>
                                        <p className="mt-1">Delete {countsText(pending.counts)}.</p>
                                        {pending.body.side === 'BEFORE' && (
                                          <p className="mt-1 text-xs">
                                            Deleting before a gap also removes all indicator rows of that timeframe;
                                            the next Download rebuilds them over the remaining history.
                                          </p>
                                        )}
                                        <div className="mt-2 flex gap-2">
                                          <button
                                            type="button"
                                            onClick={handleConfirm}
                                            disabled={deleteDisabled || pending.counts.total === 0}
                                            className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400"
                                          >
                                            {busyKey === key ? 'Deleting…' : `Confirm delete (${fmtInt(pending.counts.total)} rows)`}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setPending(null)}
                                            disabled={busyKey !== null}
                                            className="px-3 py-1 rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:text-gray-400"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    {rowError && <div className="form-error" role="alert">{rowError}</div>}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
