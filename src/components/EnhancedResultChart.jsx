// src/components/EnhancedResultChart.jsx
import { memo, useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  ComposedChart,
  Bar,
  Rectangle,
  Cell,
  Brush
} from 'recharts';
import './EnhancedResultChart.css';
import { buildDateLookup } from '../utils/indicatorSeries';
import { cumulativeClosedPnLByBar } from '../utils/ChartDataUtils';
import { parseExchangeTs, fmtExchangeDate, fmtExchangeDateTime, fmtExchangeIntl } from '../utils/dates';

// X-axis tick label for a row key (see barKeyFn): 'YYYY-MM-DD' keys show the date only,
// intraday 'YYYY-MM-DD HH:mm' keys show a short date + time.
const INTRADAY_TICK_FORMAT = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
// Row key function for a price series. Daily-and-coarser bars may carry a non-midnight time
// (e.g. 09:00), so intraday is decided from the data: some calendar day holds more than one bar.
// Intraday -> 'YYYY-MM-DD HH:mm' (unique per bar); otherwise the day-only 'YYYY-MM-DD'.
const barKeyFn = (prices) => {
  const days = new Set();
  const intraday = (prices || []).some(price => {
    const day = fmtExchangeDate(price.date);
    if (days.has(day)) return true;
    days.add(day);
    return false;
  });
  return intraday ? fmtExchangeDateTime : fmtExchangeDate;
};

const formatAxisTick = (value) =>
  (typeof value === 'string' && value.length > 10
    ? fmtExchangeIntl(value, INTRADAY_TICK_FORMAT)
    : fmtExchangeIntl(value));

// Custom tooltip for price chart. Lists only the currently visible indicator series (by id),
// never the "any numeric key on the row" heuristic - rows carry every series the DTO exposes.
const CustomTooltip = ({ active, payload, label, visibleSeries = [] }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;

  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label}</p>
      <p className="tooltip-price">
        Open: <span>{Number(data.open).toFixed(2)}</span>
      </p>
      <p className="tooltip-price">
        High: <span>{Number(data.high).toFixed(2)}</span>
      </p>
      <p className="tooltip-price">
        Low: <span>{Number(data.low).toFixed(2)}</span>
      </p>
      <p className="tooltip-price">
        Close: <span>{Number(data.close).toFixed(2)}</span>
      </p>
      
      {data.signals && data.signals.length > 0 && (
        <div className="tooltip-signals">
          <p className="tooltip-label">Signals:</p>
          {data.signals.map((signal, idx) => (
            <p key={idx} className={`signal-${signal.type}`}>
              {signal.type}: {Number(signal.price).toFixed(2)}
              {signal.comment && <span> - {signal.comment}</span>}
            </p>
          ))}
        </div>
      )}
      
      {visibleSeries
        .filter(series => typeof data[series.id] === 'number')
        .map(series => (
          <p key={series.id} className="tooltip-indicator">
            <span className="tooltip-indicator-name">
              <span className="tooltip-swatch" style={{ backgroundColor: series.color }} />
              {series.name}:
            </span>
            <span>{Number(data[series.id]).toFixed(2)}</span>
          </p>
        ))}
    </div>
  );
};

// Custom tooltip for trade rectangles
const TradeTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  
  // Check if we're hovering over a trade rectangle
  if (payload[0] && payload[0].name && payload[0].name.startsWith("Trade ")) {
    // Find the trade object from the payload
    const tradeObj = payload[0].payload.trade;
    if (!tradeObj) return null;
    
    return (
      <div className="custom-tooltip">
        <p className="tooltip-trade-header">
          {tradeObj.type} Trade {tradeObj.profit >= 0 ? '(Profit)' : '(Loss)'}
        </p>
        <p className="tooltip-trade-detail">
          Open: {tradeObj.openDate} at {Number(tradeObj.openPrice).toFixed(2)}
        </p>
        <p className="tooltip-trade-detail">
          Close: {tradeObj.closeDate} at {Number(tradeObj.closePrice).toFixed(2)}
        </p>
        <p className={`tooltip-trade-profit ${tradeObj.profit >= 0 ? 'positive' : 'negative'}`}>
          P&L: {Number(tradeObj.profit).toFixed(2)}
        </p>
      </div>
    );
  }
  
  // Handle cumulative profit line (default case)
  const data = payload[0].payload;
  if (data.cumulativeProfit !== undefined) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-date">{data.displayDate || data.date}</p>
        <p className="tooltip-trade-detail">
          Cumulative P&L: <span className={data.cumulativeProfit >= 0 ? "positive" : "negative"}>
            {Number(data.cumulativeProfit).toFixed(2)}
          </span>
        </p>
      </div>
    );
  }
  
  return null;
};

const signalColor = (type) => {
  if (type === 'LongOpen') return 'green';
  if (type === 'LongClose') return 'red';
  if (type === 'ShortOpen') return 'blue';
  if (type === 'ShortClose') return 'orange';
  return 'gray';
};

// Enhanced PnL Chart with synchronized timelines and trade rectangles
// memo + useMemo matter here: the parent re-renders on every Brush drag event (controlled
// brush), and if this chart received a freshly-built `data` array each time, recharts'
// getDerivedStateFromProps would treat it as new data and reset the synced zoom range.
const SynchronizedPnLChart = memo(({ data, trades, height, syncId }) => {
  // Prepare chart data with cumulative profit information (single pass, O(n + trades))
  const chartData = useMemo(() => {
    if (!data || !trades) return [];
    const cumulative = cumulativeClosedPnLByBar(
      data.length,
      trades.map(trade => ({ index: trade.closeIndex, pnl: trade.profit }))
    );
    return data.map((point, index) => ({ ...point, cumulativeProfit: cumulative[index] }));
  }, [data, trades]);

  if (!data || !trades || trades.length === 0) {
    return (
      <div className="no-data-message">
        No trade data available
      </div>
    );
  }

  // Find min/max PnL for proper scaling
  const maxProfit = Math.max(...trades.map(t => Math.abs(t.profit)), 1);
  
  // Create labels for the chart's Legend
  const tradeItems = {};
  trades.forEach((trade, i) => {
    tradeItems[`trade-${i}`] = {
      value: `${trade.type} Trade ${i+1} (${trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)})`,
      type: 'rect',
      color: trade.profit >= 0 ? '#4caf50' : '#f44336'
    };
  });
  
  // Define rendering for trade rectangles
  const renderTradeRectangles = () => {
    return trades.map((trade, i) => {
      // Find the data points at open and close for proper positioning
      const openPoint = data[trade.openIndex];
      const closePoint = data[trade.closeIndex];
      
      if (!openPoint || !closePoint) return null;
      
      // Calculate X position and width based on indices in the data array
      const xPercent = 100 * trade.openIndex / (data.length - 1);
      const widthPercent = 100 * (trade.closeIndex - trade.openIndex) / (data.length - 1);
      
      // Calculate height and Y position based on profit/loss
      // Center at 50% height for zero profit
      const zeroLineY = 50;
      // Scale by profit to determine rectangle height
      const heightPercent = 100 * Math.abs(trade.profit) / (maxProfit * 2);
      // Position either above or below zero line based on profit
      const yPercent = trade.profit >= 0 
        ? zeroLineY - heightPercent 
        : zeroLineY;
      
      return (
        <Rectangle
          key={`trade-${i}`}
          x={`${xPercent}%`}
          y={`${yPercent}%`}
          width={`${Math.max(0.5, widthPercent)}%`} // Ensure minimum visibility
          height={`${heightPercent}%`}
          fill={trade.profit >= 0 ? "#4caf50" : "#f44336"}
          fillOpacity={0.6}
          stroke={trade.profit >= 0 ? "#388e3c" : "#d32f2f"}
          strokeWidth={1}
          rx={2}
          ry={2}
          name={`Trade ${i+1}`}
          className="trade-rectangle"
        />
      );
    });
  };
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart 
        data={chartData}
        margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
        syncId={syncId}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 10 }}
          height={20}
          scale="point"
          type="category"
          tickFormatter={formatAxisTick}
        />
        <YAxis 
          domain={[-maxProfit * 1.1, maxProfit * 1.1]}
          tickFormatter={(value) => value.toFixed(1)}
          label={{ 
            value: 'Profit/Loss', 
            angle: -90, 
            position: 'insideLeft',
            fontSize: 12 
          }}
        />
        <Tooltip content={<TradeTooltip />} />
        <Legend />
        <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
        
        {/* Cumulative Profit Line */}
        <Line
          type="monotone"
          dataKey="cumulativeProfit"
          name="Cumulative P&L"
          stroke="#2196F3"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        
        {/* Custom layer for trade rectangles */}
        <g className="trade-rectangles-layer">
          {renderTradeRectangles()}
        </g>
      </ComposedChart>
    </ResponsiveContainer>
  );
});
SynchronizedPnLChart.displayName = 'SynchronizedPnLChart';

const EnhancedResultChart = ({ data, height = 400, visibleSeries = [] }) => {
  const [chartData, setChartData] = useState([]);
  const [showPnLChart, setShowPnLChart] = useState(true);
  const [trades, setTrades] = useState([]);
  // Controlled Brush window. Owned here so that parent re-renders can never reset the zoom;
  // it is only re-initialised when the `data` prop identity changes (new backtest result).
  const [brushRange, setBrushRange] = useState({ startIndex: 0, endIndex: 0 });
  const chartHeight = height; 
  const pnlHeight = 200;
  const syncId = "trading-charts-sync";
  
  useEffect(() => {
    if (!data) return;

    // One key function for rows, the signal map and trade extraction, so they cannot diverge.
    // A day-only key on intraday data would collapse HOUR/MIN5 bars onto duplicate x categories.
    const standardizeDateFormat = barKeyFn(data.prices);

    // Signals grouped by bar key, so each bar looks its signals up in O(1)
    const signalsByDate = new Map();
    data.signals.forEach(signal => {
      const key = standardizeDateFormat(signal.date);
      if (!signalsByDate.has(key)) signalsByDate.set(key, []);
      signalsByDate.get(key).push(signal);
    });

    // One lookup (raw date string -> value) per series of BOTH maps, keyed by series id
    // ('price:<name>' / 'sub:<name>'). Built here, in the data effect, so that toggling series
    // later never rebuilds rows (which would reset the controlled Brush).
    // Raw-string alignment is exact on every timeframe (HOUR/MIN5 included).
    const seriesLookups = [];
    const priceIndicators = data.priceIndicators || {};
    const subIndicators = data.indicators || {};
    Object.keys(priceIndicators).forEach(name => {
      seriesLookups.push({ id: `price:${name}`, lookup: buildDateLookup(priceIndicators[name]) });
    });
    Object.keys(subIndicators).forEach(name => {
      seriesLookups.push({ id: `sub:${name}`, lookup: buildDateLookup(subIndicators[name]) });
    });

    // Process data for the chart with standardized dates
    const processed = data.prices.map((price, index) => {
      const priceDate = standardizeDateFormat(price.date);

      // Signals that occurred on this bar
      const matchingSignals = signalsByDate.get(priceDate) || [];

      // Indicator values for this bar, under the series id keys (no collision with open/close/...)
      const indicatorValues = {};
      seriesLookups.forEach(({ id, lookup }) => {
        const value = lookup.get(price.date);
        if (typeof value === 'number' && !Number.isNaN(value)) {
          indicatorValues[id] = value;
        }
      });

      // Use same date format throughout for synchronization
      return {
        date: priceDate,
        displayDate: fmtExchangeIntl(price.date), // For display purposes
        rawDate: price.date, // Keep the raw date for processing
        open: price.open,
        high: price.high,
        low: price.low,
        close: price.close,
        volume: price.volume,
        index, // Store the index for trade matching
        ...indicatorValues,
        signals: matchingSignals.map(s => ({
          type: s.type,
          price: s.price,
          comment: s.comment
        }))
      };
    });

    setChartData(processed);
    setBrushRange({ startIndex: 0, endIndex: Math.max(0, processed.length - 1) });

    // Extract trades from signals with proper date handling
    const extractedTrades = extractTradesFromSignals(processed, data.signals, standardizeDateFormat);
    setTrades(extractedTrades);
  }, [data]);

  // Function to extract trades from signals with improved date handling
  const extractTradesFromSignals = (processedData, signals, toBarKey) => {
    const extractedTrades = [];
    
    // Create a map of standardized dates to indices for quick lookup
    const dateToIndexMap = {};
    processedData.forEach((point, index) => {
      // Use the standardized date format
      dateToIndexMap[point.date] = index;
    });

    // Sort signals chronologically
    const sortedSignals = [...signals].sort((a, b) => 
      parseExchangeTs(a.date) - parseExchangeTs(b.date)
    );
    
    // Keep track of active trades to avoid duplicates and ensure proper pairing
    let activeTrades = {};
    
    // Process signals to extract complete trades
    sortedSignals.forEach(signal => {
      const signalDateStr = toBarKey(signal.date);
      const signalIndex = dateToIndexMap[signalDateStr];
      
      // Skip signals that don't match any price data point
      if (signalIndex === undefined) return;

      // Handle open signals
      if (signal.type === 'LongOpen' || signal.type === 'ShortOpen') {
        // Store this open signal for later matching
        const tradeKey = signal.type === 'LongOpen' ? 'Long' : 'Short';
        if (!activeTrades[tradeKey]) {
          activeTrades[tradeKey] = {
            signal,
            index: signalIndex
          };
        }
      }
      // Handle close signals
      else if (signal.type === 'LongClose' || signal.type === 'ShortClose') {
        const tradeKey = signal.type === 'LongClose' ? 'Long' : 'Short';
        const openTrade = activeTrades[tradeKey];
        
        // If we have a matching open signal, create a trade
        if (openTrade) {
          let profit = 0;
          
          // Calculate profit based on trade type
          if (tradeKey === 'Long') {
            profit = signal.price - openTrade.signal.price;
          } else {
            profit = openTrade.signal.price - signal.price;
          }
          
          // Ensure open and close dates are in sequence
          const openIsBefore = parseExchangeTs(openTrade.signal.date) < parseExchangeTs(signal.date);
          if (openIsBefore) {
            extractedTrades.push({
              openDate: fmtExchangeIntl(openTrade.signal.date),
              closeDate: fmtExchangeIntl(signal.date),
              openPrice: openTrade.signal.price,
              closePrice: signal.price,
              profit: profit,
              type: tradeKey,
              openIndex: openTrade.index,
              closeIndex: signalIndex,
              // Store the signal objects for reference
              openSignal: openTrade.signal,
              closeSignal: signal,
              // Add a trade object with all data for the tooltip
              trade: {
                openDate: fmtExchangeIntl(openTrade.signal.date),
                closeDate: fmtExchangeIntl(signal.date),
                openPrice: openTrade.signal.price,
                closePrice: signal.price,
                profit: profit,
                type: tradeKey
              }
            });
          }
          
          // Clear this trade type
          delete activeTrades[tradeKey];
        }
      }
    });
    
    return extractedTrades;
  };

// Only build ReferenceDots for signals inside the current brush window — dots outside the
  // visible category domain render nothing anyway, so skipping them keeps brush drags cheap.
  const visibleSignalDots = useMemo(() => {
    const start = Math.max(0, brushRange.startIndex);
    const end = Math.min(chartData.length - 1, brushRange.endIndex);
    const dots = [];
    for (let i = start; i <= end; i++) {
      const entry = chartData[i];
      if (!entry || !entry.signals || entry.signals.length === 0) continue;
      entry.signals.forEach((signal, j) => {
        dots.push(
          <ReferenceDot
            key={`sig-${i}-${j}`}
            x={entry.date}
            y={entry.close}
            yAxisId="price"
            r={6}
            fill={signalColor(signal.type)}
            stroke="white"
            strokeWidth={2}
          />
        );
      });
    }
    return dots;
  }, [chartData, brushRange]);

  // The right-hand axis only exists while some sub-pane series is drawn on it.
  const hasVisibleSubSeries = visibleSeries.some(series => series.kind === 'sub');

  return (
    <div className="enhanced-chart-container">
      <div className="chart-controls">
        <div className="chart-options">
          <label className="control-label">Charts:</label>
          <div className="chart-option-buttons">
            <button
              className={`chart-option-button ${showPnLChart ? 'active' : ''}`}
              onClick={() => setShowPnLChart(!showPnLChart)}
            >
              Trade PnL Chart
            </button>
          </div>
        </div>
      </div>

      {/* Main Price Chart */}
      <div className="price-chart">
        {chartData.length === 0 ? null : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
            syncId={syncId}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10 }}
              height={20}
              type="category"
              scale="point"
              // Ensure consistent tick formatting
              tickFormatter={formatAxisTick}
            />
            <YAxis 
              yAxisId="price"
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              label={{ 
                value: 'Price', 
                angle: -90, 
                position: 'insideLeft',
                fontSize: 12
              }}
            />
            
            {hasVisibleSubSeries && (
              <YAxis
                yAxisId="indicator"
                orientation="right"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10 }}
              />
            )}

            <Tooltip content={<CustomTooltip visibleSeries={visibleSeries} />} />
            <Legend />
            
            {/* Price Line */}
            <Line
              type="linear"
              dataKey="close"
              stroke="#ff0000"
              dot={false}
              activeDot={{ r: 4 }}
              yAxisId="price"
              name="Price"
              isAnimationActive={false}
            />

            {/* Signal dots — ReferenceDot uses the chart's own xScale/yScale */}
            {visibleSignalDots}

            {/* Indicator lines - price overlays on the price axis, sub series on the right axis.
                Price overlays (support/resistance/stop levels) jump discretely and are absent where
                no level exists, so they are drawn as steps with gaps; sub series stay connected. */}
            {visibleSeries.map(series => (
              <Line
                key={series.id}
                type={series.kind === 'price' ? 'stepAfter' : 'linear'}
                dataKey={series.id}
                stroke={series.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls={series.kind !== 'price'}
                yAxisId={series.kind === 'price' ? 'price' : 'indicator'}
                name={series.name}
                isAnimationActive={false}
              />
            ))}
            
            {/* Synchronization brush */}
            <Brush 
              dataKey="date" 
              height={30} 
              stroke="#8884d8"
              fill="#f5f5f5"
              travellerWidth={10}
              gap={5}
              startIndex={brushRange.startIndex}
              endIndex={brushRange.endIndex}
              onChange={({ startIndex, endIndex }) => {
                if (startIndex !== brushRange.startIndex || endIndex !== brushRange.endIndex) {
                  setBrushRange({ startIndex, endIndex });
                }
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Trade PnL Chart */}
      {showPnLChart && (
        <div className="pnl-chart">
          <h3 className="chart-section-title">Trade P&L</h3>
          <SynchronizedPnLChart 
            data={chartData} 
            trades={trades} 
            height={pnlHeight} 
            syncId={syncId}
          />
        </div>
      )}
    </div>
  );
};

export default EnhancedResultChart;