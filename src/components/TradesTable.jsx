// src/components/TradesTable.jsx
import { Fragment, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import './TradesTable.css';
import { formatNumber, formatDate, formatSigned, formatSignedPercent } from '../utils/formatters';
import { parseExchangeTs, toLocalIsoDate } from '../utils/dates';
import { reasonOf, splitReason, reasonTitle, toggleExpanded, excelOpenReason } from './tradesReason';
import { useEscapeLayer } from '../hooks/useEscapeLayer';
import { ESCAPE_LEVEL } from '../utils/escapeStack';

/**
 * A reason cell (Stage B, designer §6.3 / m7a): rule head semibold + the first sentence, clamped to
 * 2 lines, and a muted `· also …` line; the full text (and the code comment) in the title. A click
 * toggles the trade's expand row.
 */
const ReasonCell = ({ text, code, onToggle, testId }) => {
  const { head, body, also } = splitReason(text);
  return (
    <td className="comment-cell" title={reasonTitle(text, code)} onClick={text ? onToggle : undefined} data-testid={testId}>
      <div className="comment-clamp">
        {head && <span className="reason-head">{head}</span>}
        {head && ' · '}
        {body || (head ? '' : '—')}
      </div>
      {also && <div className="reason-also">· {also}</div>}
    </td>
  );
};

const TradesTable = ({
  data,
  fileContext,
  hasOpenPosition = false,
  openPositionPnL = 0,
  openPositionPnLPercent,
  // Open short position, shown only when the chart data carries the short leg's signals
  // (chartDataDTO.includesShortSignals) - otherwise this table has no short trades to qualify.
  hasOpenShortPosition = false,
  openShortPositionPnL = 0,
  openShortPositionPnLPercent,
  // True when the result is not long-only but the chart data carries long signals only (older
  // backend without includesShortSignals), so this table shows the long leg alone and says so.
  longLegOnly = false,
  // Signal watch deep link (StrategyResultDTO.seededEntry {date, price}): the long trade opened by
  // the seeded position is the user's own entry, not a model signal - marked "SEEDED (your entry)".
  seededEntry = null,
}) => {
  const seededMs = seededEntry?.date ? parseExchangeTs(seededEntry.date).getTime() : NaN;
  const isSeededOpen = (signal) => {
    if (Number.isFinite(seededMs) && parseExchangeTs(signal.date).getTime() === seededMs
      && (typeof seededEntry.price !== 'number' || Math.abs(signal.price - seededEntry.price) < 1e-9)) return true;
    return typeof signal.comment === 'string' && signal.comment.startsWith('SEEDED');
  };
  const legLabel = longLegOnly ? 'long leg, ' : '';
  const totalQualifiers = [
    longLegOnly && 'long leg',
    (hasOpenPosition || hasOpenShortPosition) && 'closed',
  ].filter(Boolean);
  const totalLabel = `Total P&L${totalQualifiers.length ? ` (${totalQualifiers.join(', ')})` : ''}`;
  // Open-position % comes from the backend; blank when an older backend omits it.
  const pctOrBlank = (pct) =>
    (typeof pct === 'number' && Number.isFinite(pct) ? formatSignedPercent(pct / 100) : '');
  // Per-trade % on the trade's own entry price. The short pnl is already sign-reversed.
  const tradePnlPercent = (pnl, openPrice) => (openPrice ? (pnl / openPrice) * 100 : 0);
  // m7a: trades whose expand row (both reasons in full) is open; Esc closes them
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) => setExpanded((e) => toggleExpanded(e, id));
  useEscapeLayer(() => { setExpanded(new Set()); }, { enabled: expanded.size > 0, level: ESCAPE_LEVEL.POPOVER });
  const [sortConfig, setSortConfig] = useState({
    key: 'openDate',
    direction: 'asc'
  });

  const extractTradesFromSignals = (signals) => {
    const extractedTrades = [];
    const openSignals = {};

    // Sort signals by date
    const sortedSignals = [...signals].sort((a, b) => 
      parseExchangeTs(a.date) - parseExchangeTs(b.date)
    );

    sortedSignals.forEach(signal => {
      if (signal.type === 'LongOpen') {
        // Store open signal
        openSignals['Long'] = signal;
      } 
      else if (signal.type === 'LongClose' && openSignals['Long']) {
        // Create a trade
        const openSignal = openSignals['Long'];
        const profit = signal.price - openSignal.price;
        
        extractedTrades.push({
          id: extractedTrades.length + 1,
          type: 'Long',
          openDate: parseExchangeTs(openSignal.date),
          closeDate: parseExchangeTs(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit,
          pnlPercent: tradePnlPercent(profit, openSignal.price),
          // Stage B: the plain-English twin (displayComment) when the backend sends one, else the code comment
          openReason: reasonOf(openSignal).text,
          closeReason: reasonOf(signal).text,
          openCode: reasonOf(openSignal).code,
          closeCode: reasonOf(signal).code,
          seeded: isSeededOpen(openSignal),
        });
        
        // Clear open signal
        delete openSignals['Long'];
      }
      else if (signal.type === 'ShortOpen') {
        // Store open signal
        openSignals['Short'] = signal;
      }
      else if (signal.type === 'ShortClose' && openSignals['Short']) {
        // Create a trade
        const openSignal = openSignals['Short'];
        const profit = openSignal.price - signal.price; // Reversed for short
        
        extractedTrades.push({
          id: extractedTrades.length + 1,
          type: 'Short',
          openDate: parseExchangeTs(openSignal.date),
          closeDate: parseExchangeTs(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit,
          pnlPercent: tradePnlPercent(profit, openSignal.price),
          openReason: reasonOf(openSignal).text,
          closeReason: reasonOf(signal).text,
          openCode: reasonOf(openSignal).code,
          closeCode: reasonOf(signal).code,
        });
        
        // Clear open signal
        delete openSignals['Short'];
      }
    });

    return extractedTrades;
  };

  // Derived from the current result on every change, so a run with no signals shows an empty
  // table instead of keeping the previous run's trades.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- extractTradesFromSignals is a pure helper (+ seededEntry)
  const trades = useMemo(() => extractTradesFromSignals(data?.signals || []), [data, seededEntry]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedTrades = () => {
    const sortableTrades = [...trades];
    if (sortConfig.key) {
      sortableTrades.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableTrades;
  };

  const getClassNamesFor = (name) => {
    if (!sortConfig) {
      return;
    }
    return sortConfig.key === name ? sortConfig.direction : undefined;
  };

  const exportToExcel = () => {
    const sortedTrades = getSortedTrades();
    const totalPnl = sortedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = sortedTrades.length > 0
      ? `${Math.round((sortedTrades.filter(t => t.pnl > 0).length / sortedTrades.length) * 100)}%`
      : '0%';

    // Build data rows
    const rows = sortedTrades.map(trade => ({
      '#':           trade.id,
      'Type':        trade.type,
      'Open Date':   formatDate(trade.openDate, false),
      'Close Date':  formatDate(trade.closeDate, false),
      'Open Price':  trade.openPrice,
      'Close Price': trade.closePrice,
      'P&L':         parseFloat(trade.pnl.toFixed(2)),
      'P&L %':       parseFloat(trade.pnlPercent.toFixed(2)),
      // Stage B (S5): the plain-English reasons (displayComment ?? comment); width cap 60, no wrap (owner Q2)
      'Open Reason':  excelOpenReason(trade),
      'Close Reason': trade.closeReason,
    }));

    // Append summary footer rows
    rows.push({});
    rows.push({ '#': 'Total P&L', 'Open Price': '', 'Close Price': '', 'P&L': parseFloat(totalPnl.toFixed(2)) });
    rows.push({ '#': 'Win Rate',  'Open Price': '', 'Close Price': '', 'P&L': winRate });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths; the free-text reason columns are capped so one long comment
    // does not produce a huge column.
    const REASON_COL_MAX_WCH = 60;
    const reasonCols = new Set(['Open Reason', 'Close Reason']);
    const colWidths = Object.keys(rows[0] || {}).map(key => {
      const wch = Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length));
      return { wch: reasonCols.has(key) ? Math.min(wch, REASON_COL_MAX_WCH) : wch };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trade History');

    // Build a meaningful filename: Strategies_Ticker_Timeframe_Params_Date
    const sanitize = (s) => String(s).replace(/[^a-zA-Z0-9._+-]/g, '');
    const { ticker = '', timeFrame = '', selectedStrategies = {}, startDate, endDate } = fileContext || {};

    const strategyPart = Object.keys(selectedStrategies).map(sanitize).join('+') || 'trades';

    const paramPart = Object.entries(selectedStrategies)
      .flatMap(([, params]) =>
        Object.entries(params).map(([name, p]) => `${sanitize(name)}-${sanitize(p.value ?? '')}`)
      )
      .join('_');

    // User-picked range (local Dates): their literal calendar day, never toISOString() (UTC shift).
    const fmtDate = (d) => (d instanceof Date ? toLocalIsoDate(d) : d ? String(d).slice(0, 10) : '');
    const datePart = [fmtDate(startDate), fmtDate(endDate)].filter(Boolean).join('_');

    const parts = [strategyPart, sanitize(ticker), sanitize(timeFrame), paramPart, datePart].filter(Boolean);
    XLSX.writeFile(wb, `${parts.join('_')}.xlsx`);
  };

  return (
    <div className="trades-table-container">
      <div className="trades-table-header">
        <h3 className="trades-table-title">Trade History{longLegOnly && ' (long leg)'}</h3>
        {trades.length > 0 && (
          <button className="export-excel-btn" onClick={exportToExcel} title="Export to Excel">
            ⬇ Export to Excel
          </button>
        )}
      </div>
      
      {trades.length > 0 ? (
        <div className="trades-table-wrapper">
          <table className="trades-table">
            <thead>
              <tr>
                <th onClick={() => requestSort('id')} className={getClassNamesFor('id')}>
                  # <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('type')} className={getClassNamesFor('type')}>
                  Type <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('openDate')} className={getClassNamesFor('openDate')}>
                  Open Date <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('closeDate')} className={getClassNamesFor('closeDate')}>
                  Close Date <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('openPrice')} className={getClassNamesFor('openPrice')}>
                  Open Price <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('closePrice')} className={getClassNamesFor('closePrice')}>
                  Close Price <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('pnl')} className={getClassNamesFor('pnl')}>
                  P&L <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('pnlPercent')} className={getClassNamesFor('pnlPercent')}>
                  P&L % <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('openReason')} className={getClassNamesFor('openReason')}>
                  Open Reason <span className="sort-icon"></span>
                </th>
                <th onClick={() => requestSort('closeReason')} className={getClassNamesFor('closeReason')}>
                  Close Reason <span className="sort-icon"></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {getSortedTrades().map((trade) => {
                const open = expanded.has(trade.id);
                const hasReason = !!(trade.openReason || trade.closeReason);
                return (
                <Fragment key={trade.id}>
                <tr className={trade.pnl >= 0 ? 'profitable-trade' : 'losing-trade'}>
                  <td className="whitespace-nowrap">
                    {hasReason && (
                      <button type="button" className="reason-toggle" aria-expanded={open}
                        aria-label={open ? 'Hide the full reasons' : 'Show the full reasons'}
                        title={open ? 'Hide the full reasons (Esc)' : 'Show the full reasons'}
                        onClick={() => toggle(trade.id)} data-testid="trade-reason-toggle">
                        {open ? '▾' : '▸'}
                      </button>
                    )}
                    {trade.id}
                  </td>
                  <td className={trade.type === 'Long' ? 'long-trade' : 'short-trade'}>
                    {trade.type}
                    {trade.seeded && (
                      <span
                        className="ml-1 px-1 rounded bg-amber-100 text-amber-800 border border-amber-300 text-xs font-normal whitespace-nowrap"
                        title="The position you already held (seeded from the watch), not a model entry"
                        data-testid="trade-seeded"
                      >
                        SEEDED (your entry)
                      </span>
                    )}
                  </td>
                  <td>{formatDate(trade.openDate, false)}</td>
                  <td>{formatDate(trade.closeDate, false)}</td>
                  <td>{formatNumber(trade.openPrice)}</td>
                  <td>{formatNumber(trade.closePrice)}</td>
                  <td className={`pnl-cell ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatSigned(trade.pnl)}
                  </td>
                  <td className={`pnl-cell ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatSignedPercent(trade.pnlPercent / 100)}
                  </td>
                  <ReasonCell text={trade.openReason} code={trade.openCode} onToggle={() => toggle(trade.id)} testId="trade-open-reason" />
                  <ReasonCell text={trade.closeReason} code={trade.closeCode} onToggle={() => toggle(trade.id)} testId="trade-close-reason" />
                </tr>
                {open && (
                  <tr className="trade-reason-detail" data-testid="trade-reason-detail">
                    <td colSpan="10">
                      <dl className="trade-reason-list">
                        <dt>Opened by</dt>
                        <dd>{trade.openReason || '—'}</dd>
                        <dt>Closed by</dt>
                        <dd>{trade.closeReason || '—'}</dd>
                      </dl>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="summary-label">{totalLabel}:</td>
                <td className={`pnl-cell ${
                  trades.reduce((sum, trade) => sum + trade.pnl, 0) >= 0 ? 'positive' : 'negative'
                }`}>
                  {formatSigned(trades.reduce((sum, trade) => sum + trade.pnl, 0))}
                </td>
                {/* A sum of per-trade % is not meaningful: the % cell stays blank. */}
                <td></td>
                <td></td>
                <td></td>
              </tr>
              {hasOpenPosition && (
                <tr>
                  <td colSpan="6" className="summary-label">Open long position (unrealized):</td>
                  <td className={`pnl-cell ${openPositionPnL >= 0 ? 'positive' : 'negative'}`}>
                    {formatSigned(openPositionPnL)}
                  </td>
                  <td className={`pnl-cell ${openPositionPnL >= 0 ? 'positive' : 'negative'}`}>
                    {pctOrBlank(openPositionPnLPercent)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              )}
              {hasOpenShortPosition && (
                <tr>
                  <td colSpan="6" className="summary-label">Open short position (unrealized):</td>
                  <td className={`pnl-cell ${openShortPositionPnL >= 0 ? 'positive' : 'negative'}`}>
                    {formatSigned(openShortPositionPnL)}
                  </td>
                  <td className={`pnl-cell ${openShortPositionPnL >= 0 ? 'positive' : 'negative'}`}>
                    {pctOrBlank(openShortPositionPnLPercent)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              )}
              <tr>
                <td colSpan="6" className="summary-label">Win Rate ({legLabel}closed):</td>
                <td>
                  {trades.length > 0 
                    ? `${Math.round((trades.filter(t => t.pnl > 0).length / trades.length) * 100)}%`
                    : '0%'
                  }
                </td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="no-trades-message">
          No trade data available
        </div>
      )}
    </div>
  );
};

export default TradesTable;