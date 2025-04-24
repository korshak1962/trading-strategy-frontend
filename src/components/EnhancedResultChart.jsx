// src/components/EnhancedResultChart.jsx
import { useEffect, useState } from 'react';
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
  ComposedChart,
  Bar,
  Rectangle,
  Cell,
  Brush
} from 'recharts';
import './EnhancedResultChart.css';

// Custom tooltip for price chart
const CustomTooltip = ({ active, payload, label }) => {
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
      
      {Object.entries(data).filter(([key, value]) => 
        key !== 'date' && 
        key !== 'open' && 
        key !== 'high' && 
        key !== 'low' && 
        key !== 'close' && 
        key !== 'volume' && 
        key !== 'signals' &&
        typeof value === 'number'
      ).map(([key, value]) => (
        <p key={key} className="tooltip-indicator">
          {key}: <span>{Number(value).toFixed(2)}</span>
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

// Enhanced PnL Chart with synchronized timelines and trade rectangles
const SynchronizedPnLChart = ({ data, trades, height, syncId }) => {
  if (!data || !trades || trades.length === 0) {
    return (
      <div className="no-data-message">
        No trade data available
      </div>
    );
  }
  
  // Prepare chart data with cumulative profit information
  const chartData = data.map((point, index) => {
    // Calculate cumulative profit based on completed trades
    const completedTrades = trades.filter(trade => 
      trade.closeIndex <= index
    );
    
    const cumulativeProfit = completedTrades.reduce(
      (sum, trade) => sum + trade.profit, 
      0
    );
    
    // Map trades that are active at this point for rendering
    return {
      ...point,
      cumulativeProfit
    };
  });

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
};

const EnhancedResultChart = ({ data, height = 400 }) => {
  const [chartData, setChartData] = useState([]);
  const [selectedIndicators, setSelectedIndicators] = useState([]);
  const [availableIndicators, setAvailableIndicators] = useState([]);
  const [showPnLChart, setShowPnLChart] = useState(true);
  const [trades, setTrades] = useState([]);
  const chartHeight = height; 
  const pnlHeight = 200;
  const syncId = "trading-charts-sync";
  
  useEffect(() => {
    if (!data) return;

    // Create a proper date scale - convert all dates to same format for consistency
    const standardizeDateFormat = (dateStr) => {
      // Ensure consistent ISO-style date format for comparison
      return new Date(dateStr).toISOString().split('T')[0];
    };

    // Process data for the chart with standardized dates
    const processed = data.prices.map((price, index) => {
      const priceDate = standardizeDateFormat(price.date);
      
      // Find signals that occurred on this price's date
      const matchingSignals = data.signals.filter(signal => 
        standardizeDateFormat(signal.date) === priceDate
      );

      // Find indicator values for this date
      const indicatorValues = {};
      if (data.indicators) {
        Object.entries(data.indicators).forEach(([indicatorName, indicatorData]) => {
          const matchingIndicator = indicatorData.find(indicator => 
            standardizeDateFormat(indicator.date) === priceDate
          );
          if (matchingIndicator) {
            indicatorValues[indicatorName] = matchingIndicator.value;
          }
        });
      }

      // Use same date format throughout for synchronization
      return {
        date: priceDate,
        displayDate: new Date(price.date).toLocaleDateString(), // For display purposes
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

    // Extract trades from signals with proper date handling
    const extractedTrades = extractTradesFromSignals(processed, data.signals);
    setTrades(extractedTrades);

    // Extract available indicators
    if (data.indicators) {
      const indicators = Object.keys(data.indicators);
      setAvailableIndicators(indicators);
      if (indicators.length > 0) {
        // Initially select the first indicator
        setSelectedIndicators([indicators[0]]);
      }
    }
  }, [data]);

  // Function to extract trades from signals with improved date handling
  const extractTradesFromSignals = (processedData, signals) => {
    const extractedTrades = [];
    
    // Create a map of standardized dates to indices for quick lookup
    const dateToIndexMap = {};
    processedData.forEach((point, index) => {
      // Use the standardized date format
      dateToIndexMap[point.date] = index;
    });

    // Sort signals chronologically
    const sortedSignals = [...signals].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    // Keep track of active trades to avoid duplicates and ensure proper pairing
    let activeTrades = {};
    
    // Process signals to extract complete trades
    sortedSignals.forEach(signal => {
      const signalDateStr = new Date(signal.date).toISOString().split('T')[0];
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
          const openIsBefore = new Date(openTrade.signal.date) < new Date(signal.date);
          if (openIsBefore) {
            extractedTrades.push({
              openDate: new Date(openTrade.signal.date).toLocaleDateString(),
              closeDate: new Date(signal.date).toLocaleDateString(),
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
                openDate: new Date(openTrade.signal.date).toLocaleDateString(),
                closeDate: new Date(signal.date).toLocaleDateString(),
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

  const toggleIndicator = (indicator) => {
    if (selectedIndicators.includes(indicator)) {
      setSelectedIndicators(selectedIndicators.filter(i => i !== indicator));
    } else {
      setSelectedIndicators([...selectedIndicators, indicator]);
    }
  };

  // Custom dot component for signals
  const renderSignalDot = (props) => {
    const { cx, cy, payload } = props;
    if (!payload.signals || payload.signals.length === 0) return null;
    
    return payload.signals.map((signal, idx) => {
      let color = 'gray';
      
      if (signal.type === 'LongOpen') color = 'green';
      else if (signal.type === 'LongClose') color = 'red';
      else if (signal.type === 'ShortOpen') color = 'blue';
      else if (signal.type === 'ShortClose') color = 'orange';
      
      return (
        <circle 
          key={`${cx}-${cy}-${idx}`} 
          cx={cx} 
          cy={cy} 
          r={6} 
          fill={color} 
          stroke="white" 
          strokeWidth={2}
        />
      );
    });
  };

  const getSignalMarker = (entry, dataIndex) => {
    if (!entry.signals || entry.signals.length === 0) return null;

    return entry.signals.map((signal, idx) => {
      let color = 'gray';
      
      if (signal.type === 'LongOpen') {
        color = 'green';
      } else if (signal.type === 'LongClose') {
        color = 'red';
      } else if (signal.type === 'ShortOpen') {
        color = 'blue';
      } else if (signal.type === 'ShortClose') {
        color = 'orange';
      }
      
      return (
        <ReferenceLine 
          key={`signal-${dataIndex}-${idx}`}
          x={entry.date} 
          stroke={color}
          yAxisId="price" 
          strokeDasharray="3 3"
        />
      );
    });
  };
  
  const getChartColor = (indicator) => {
    // Simple color algorithm based on the indicator name
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
    const hash = indicator.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="enhanced-chart-container">
      <div className="chart-controls">
        <div className="indicator-toggles">
          <label className="control-label">Indicators:</label>
          <div className="indicator-buttons">
            {availableIndicators.map(indicator => (
              <button
                key={indicator}
                className={`indicator-button ${selectedIndicators.includes(indicator) ? 'active' : ''}`}
                onClick={() => toggleIndicator(indicator)}
              >
                {indicator}
              </button>
            ))}
          </div>
        </div>
        
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
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
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
            
            {selectedIndicators.length > 0 && (
              <YAxis 
                yAxisId="indicator"
                orientation="right"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10 }}
              />
            )}
            
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            {/* Price Line */}
            <Line 
              type="linear" 
              dataKey="close" 
              stroke="#ff0000" 
              dot={false}
              yAxisId="price"
              name="Price"
              isAnimationActive={false} // Disable animation for better synchronization
            />
            
            {/* Dynamic indicator lines */}
            {selectedIndicators.map(indicator => (
              <Line 
                key={indicator}
                type="monotone" 
                dataKey={indicator} 
                stroke={getChartColor(indicator)} 
                dot={false}
                yAxisId="indicator"
                name={indicator}
                isAnimationActive={false} // Disable animation for better synchronization
              />
            ))}
            
            {/* Render signals */}
            <Line 
              dataKey="close"
              stroke="transparent"
              dot={renderSignalDot}
              yAxisId="price"
              name="Signals"
              isAnimationActive={false} // Disable animation for better synchronization
            />
            
            {chartData.map((entry, index) => getSignalMarker(entry, index))}
            
            {/* Synchronization brush */}
            <Brush 
              dataKey="date" 
              height={30} 
              stroke="#8884d8"
              fill="#f5f5f5"
              travellerWidth={10}
              gap={5}
            />
          </ComposedChart>
        </ResponsiveContainer>
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