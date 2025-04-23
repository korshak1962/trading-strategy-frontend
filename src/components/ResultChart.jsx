// src/components/ResultChart.jsx
import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const ResultChart = ({ data }) => {
  const [chartData, setChartData] = useState([]);
  const [selectedIndicator, setSelectedIndicator] = useState('');
  const [availableIndicators, setAvailableIndicators] = useState([]);

  useEffect(() => {
    if (!data) return;

    // Process data for the chart
    const processed = data.prices.map((price, index) => {
      // Find signals that occurred on this price's date
      const matchingSignals = data.signals.filter(
        signal => signal.date === price.date
      );

      // Find indicator values for this date
      const indicatorValues = {};
      if (data.indicators) {
        Object.entries(data.indicators).forEach(([indicatorName, indicatorData]) => {
          const matchingIndicator = indicatorData.find(
            indicator => indicator.date === price.date
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
      setAvailableIndicators(Object.keys(data.indicators));
      if (Object.keys(data.indicators).length > 0) {
        setSelectedIndicator(Object.keys(data.indicators)[0]);
      }
    }
  }, [data]);

  const getSignalMarker = (entry) => {
    if (!entry.signals || entry.signals.length === 0) return null;

    return entry.signals.map((signal, idx) => {
      const color = signal.type.includes('Long') 
        ? (signal.type === 'LongOpen' ? 'green' : 'red')
        : (signal.type === 'ShortOpen' ? 'blue' : 'orange');
        
      return (
        <ReferenceLine 
          key={`signal-${idx}`}
          x={entry.date} 
          stroke={color} 
          strokeDasharray="3 3"
          label={{
            value: signal.type,
            position: 'insideBottomRight',
            fill: color,
            fontSize: 10
          }}
        />
      );
    });
  };

  return (
    <div className="h-96">
      <div className="mb-4">
        <label className="mr-2">Indicator:</label>
        <select
          value={selectedIndicator}
          onChange={(e) => setSelectedIndicator(e.target.value)}
          className="p-1 border rounded"
        >
          <option value="">None</option>
          {availableIndicators.map(indicator => (
            <option key={indicator} value={indicator}>
              {indicator}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
              style: { textAnchor: 'middle' },
              fontSize: 12
            }}
          />
          
          {selectedIndicator && (
            <YAxis 
              yAxisId="indicator"
              orientation="right"
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              label={{ 
                value: selectedIndicator, 
                angle: 90, 
                position: 'insideRight',
                style: { textAnchor: 'middle' },
                fontSize: 12
              }}
            />
          )}
          
          <Tooltip 
            formatter={(value, name) => {
              return [Number(value).toFixed(2), name];
            }}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend />
          
          <Line 
            type="monotone" 
            dataKey="close" 
            stroke="#1E40AF" 
            dot={false}
            yAxisId="price"
            name="Close Price"
          />
          
          {selectedIndicator && (
            <Line 
              type="monotone" 
              dataKey={selectedIndicator} 
              stroke="#10B981" 
              dot={false}
              yAxisId="indicator"
              name={selectedIndicator}
            />
          )}
          
          {chartData.map((entry, index) => getSignalMarker(entry))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ResultChart;