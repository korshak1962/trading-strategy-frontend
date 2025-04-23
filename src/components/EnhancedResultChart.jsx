// src/components/EnhancedResultChart.jsx - Fixed key issues
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ComposedChart } from 'recharts';
import './EnhancedResultChart.css';

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

// Custom component for PnL chart
const PnLChart = ({ data, height }) => {
  // Calculate cumulative PnL for trades
  const cumulativePnL = [];
  let runningPnL = 0;
  
  data.forEach((point) => {
    if (point.signals && point.signals.length) {
      const closingSignals = point.signals.filter(
        signal => signal.type === 'LongClose' || signal.type === 'ShortClose'
      );
      
      // Simplified PnL calculation - in a real application you would use actual trade data
      closingSignals.forEach(signal => {
        if (signal.pnl) {
          runningPnL += signal.pnl;
        }
      });
    }
    
    cumulativePnL.push({
      date: point.date,
      pnl: runningPnL
    });
  });
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={cumulativePnL} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis 
          domain={['auto', 'auto']}
          tick={{ fontSize: 10 }}
          label={{ 
            value: 'PnL', 
            angle: -90, 
            position: 'insideLeft',
            fontSize: 12
          }}
        />
        <Tooltip />
        <Line 
          type="monotone" 
          dataKey="pnl" 
          stroke="#2e7d32" 
          dot={false}
          name="Trade PnL"
        />
        <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
      </LineChart>
    </ResponsiveContainer>
  );
};

const EnhancedResultChart = ({ data, height = 400 }) => {
  const [chartData, setChartData] = useState([]);
  const [selectedIndicators, setSelectedIndicators] = useState([]);
  const [availableIndicators, setAvailableIndicators] = useState([]);
  const [showPnLChart, setShowPnLChart] = useState(true);
  const chartHeight = height;  // Use prop directly
  const pnlHeight = 100;  // Fixed value
  
  useEffect(() => {
    if (!data) return;

    // Process data for the chart
    const processed = data.prices.map((price) => {
      // Find signals that occurred on this price's date
      const matchingSignals = data.signals.filter(
        signal => new Date(signal.date).toISOString() === new Date(price.date).toISOString()
      );

      // Find indicator values for this date
      const indicatorValues = {};
      if (data.indicators) {
        Object.entries(data.indicators).forEach(([indicatorName, indicatorData]) => {
          const matchingIndicator = indicatorData.find(
            indicator => new Date(indicator.date).toISOString() === new Date(price.date).toISOString()
          );
          if (matchingIndicator) {
            indicatorValues[indicatorName] = matchingIndicator.value;
          }
        });
      }

      return {
        date: new Date(price.date).toLocaleDateString(),
        open: price.open,
        high: price.high,
        low: price.low,
        close: price.close,
        volume: price.volume,
        ...indicatorValues,
        signals: matchingSignals.map(s => ({
          type: s.type,
          price: s.price,
          comment: s.comment
        }))
      };
    });

    setChartData(processed);

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
      let offsetY = 0;
      
      if (signal.type === 'LongOpen') {
        color = 'green';
        offsetY = -20;
      } else if (signal.type === 'LongClose') {
        color = 'red';
        offsetY = 20;
      } else if (signal.type === 'ShortOpen') {
        color = 'blue';
        offsetY = -20;
      } else if (signal.type === 'ShortClose') {
        color = 'orange';
        offsetY = 20;
      }
      
      return (
        <ReferenceLine 
          key={`signal-${dataIndex}-${idx}`}
          x={entry.date} 
          stroke={color}
          yAxisId="price" 
          strokeDasharray="3 3"
          label={{
            value: signal.type,
            position: 'insideBottomRight',
            fill: color,
            fontSize: 10,
            offset: offsetY
          }}
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
              PnL Chart
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
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
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
            />
            
            {/* SMA Line (if in the data) */}
            {chartData.length > 0 && chartData[0].SMA_48 && (
              <Line 
                type="monotone" 
                dataKey="SMA_48" 
                stroke="#8884d8" 
                dot={false}
                yAxisId="price"
                name="SMA_48"
              />
            )}

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
              />
            ))}
            
            {/* Render signals */}
            <Line 
              dataKey="close"
              stroke="transparent"
              dot={renderSignalDot}
              yAxisId="price"
              name="Signals"
            />
            
            {chartData.map((entry, index) => getSignalMarker(entry, index))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {/* PnL Chart */}
      {showPnLChart && (
        <div className="pnl-chart">
          <PnLChart data={chartData} height={pnlHeight} />
        </div>
      )}
    </div>
  );
};

export default EnhancedResultChart;