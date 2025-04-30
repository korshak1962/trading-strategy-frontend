// src/components/TradesTable.jsx
import { useState, useEffect } from 'react';
import './TradesTable.css';
import { formatNumber, formatDate } from '../utils/formatters';

const TradesTable = ({ data }) => {
  const [trades, setTrades] = useState([]);
  const [sortConfig, setSortConfig] = useState({
    key: 'openDate',
    direction: 'asc'
  });

  // Clear trades when new data comes in
  useEffect(() => {
    if (!data) {
      setTrades([]);
      return;
    }
    
    // Extract trades from signals
    if (data.signals && data.signals.length > 0) {
      const extractedTrades = extractTradesFromSignals(data.signals);
      setTrades(extractedTrades);
    } else {
      setTrades([]);
    }
  }, [data]);

  const extractTradesFromSignals = (signals) => {
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
          openComment: openSignal.comment || '',
          closeComment: signal.comment || ''
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
          openComment: openSignal.comment || '',
          closeComment: signal.comment || ''
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

  return (
    <div className="trades-table-container">
      <h3 className="trades-table-title">Trade History</h3>
      
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
                <th>Open Comment</th>
                <th>Close Comment</th>
              </tr>
            </thead>
            <tbody>
              {getSortedTrades().map((trade) => (
                <tr key={`${trade.id}-${trade.openDate}-${trade.closeDate}`} className={trade.pnl >= 0 ? 'profitable-trade' : 'losing-trade'}>
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
                  <td className="comment-cell">{trade.openComment}</td>
                  <td className="comment-cell">{trade.closeComment}</td>
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
                <td colSpan="2"></td>
              </tr>
              <tr>
                <td colSpan="6" className="summary-label">Win Rate:</td>
                <td>
                  {trades.length > 0 
                    ? `${Math.round((trades.filter(t => t.pnl > 0).length / trades.length) * 100)}%`
                    : '0%'
                  }
                </td>
                <td colSpan="2"></td>
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