// src/components/TradesTable.jsx
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './TradesTable.css';
import { formatNumber, formatDate } from '../utils/formatters';

const TradesTable = ({ data, fileContext }) => {
  const [trades, setTrades] = useState([]);
  const [sortConfig, setSortConfig] = useState({
    key: 'openDate',
    direction: 'asc'
  });

  useEffect(() => {
    if (!data || !data.signals || data.signals.length === 0) return;

    // Extract trades from signals
    const extractedTrades = extractTradesFromSignals(data.signals, data.prices);
    setTrades(extractedTrades);
  }, [data]);

  const extractTradesFromSignals = (signals, prices) => {
    const extractedTrades = [];
    const openSignals = {};

    // Sort signals by date
    const sortedSignals = [...signals].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
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
          openDate: new Date(openSignal.date),
          closeDate: new Date(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit,
          comment: openSignal.comment || signal.comment
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
          openDate: new Date(openSignal.date),
          closeDate: new Date(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit,
          comment: openSignal.comment || signal.comment
        });
        
        // Clear open signal
        delete openSignals['Short'];
      }
    });

    return extractedTrades;
  };

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
      'Comment':     trade.comment || '',
    }));

    // Append summary footer rows
    rows.push({});
    rows.push({ '#': 'Total P&L', 'Open Price': '', 'Close Price': '', 'P&L': parseFloat(totalPnl.toFixed(2)) });
    rows.push({ '#': 'Win Rate',  'Open Price': '', 'Close Price': '', 'P&L': winRate });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length))
    }));
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

    const fmtDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    const datePart = [fmtDate(startDate), fmtDate(endDate)].filter(Boolean).join('_');

    const parts = [strategyPart, sanitize(ticker), sanitize(timeFrame), paramPart, datePart].filter(Boolean);
    XLSX.writeFile(wb, `${parts.join('_')}.xlsx`);
  };

  return (
    <div className="trades-table-container">
      <div className="trades-table-header">
        <h3 className="trades-table-title">Trade History</h3>
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
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {getSortedTrades().map((trade) => (
                <tr key={trade.id} className={trade.pnl >= 0 ? 'profitable-trade' : 'losing-trade'}>
                  <td>{trade.id}</td>
                  <td className={trade.type === 'Long' ? 'long-trade' : 'short-trade'}>
                    {trade.type}
                  </td>
                  <td>{formatDate(trade.openDate, false)}</td>
                  <td>{formatDate(trade.closeDate, false)}</td>
                  <td>{formatNumber(trade.openPrice)}</td>
                  <td>{formatNumber(trade.closePrice)}</td>
                  <td className={`pnl-cell ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatNumber(trade.pnl)}
                  </td>
                  <td className="comment-cell">{trade.comment}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="summary-label">Total P&L:</td>
                <td className={`pnl-cell ${
                  trades.reduce((sum, trade) => sum + trade.pnl, 0) >= 0 ? 'positive' : 'negative'
                }`}>
                  {formatNumber(trades.reduce((sum, trade) => sum + trade.pnl, 0))}
                </td>
                <td></td>
              </tr>
              <tr>
                <td colSpan="6" className="summary-label">Win Rate:</td>
                <td>
                  {trades.length > 0 
                    ? `${Math.round((trades.filter(t => t.pnl > 0).length / trades.length) * 100)}%`
                    : '0%'
                  }
                </td>
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