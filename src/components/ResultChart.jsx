// src/components/ResultChart.jsx
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './ResultChart.css';
import { buildDateLookup } from '../utils/indicatorSeries';

// Tooltip listing OHLC plus only the currently visible indicator series (with their colours).
const SimpleTooltip = ({ active, payload, label, visibleSeries = [] }) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="simple-tooltip">
      <p className="simple-tooltip__date">Date: {label}</p>
      <p><span>Close Price:</span> <span>{Number(row.close).toFixed(2)}</span></p>
      {visibleSeries
        .filter(series => typeof row[series.id] === 'number')
        .map(series => (
          <p key={series.id}>
            <span className="simple-tooltip__name">
              <span className="simple-tooltip__swatch" style={{ backgroundColor: series.color }} />
              {series.name}:
            </span>
            <span>{Number(row[series.id]).toFixed(2)}</span>
          </p>
        ))}
    </div>
  );
};

/**
 * Simple line chart of close price + signal markers + indicator lines.
 * @param {Object} props
 * @param {Object} props.data - chartDataDTO
 * @param {Array<{id, name, kind, color}>} [props.visibleSeries] - series to draw (already
 *   filtered by the shared IndicatorPicker). `kind === 'price'` draws on the price axis,
 *   `kind === 'sub'` on the right-hand axis.
 */
const ResultChart = ({ data, visibleSeries = [] }) => {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    if (!data) return;

    // One raw-date-string lookup per series of both maps, keyed by series id.
    const seriesLookups = [];
    const priceIndicators = data.priceIndicators || {};
    const subIndicators = data.indicators || {};
    Object.keys(priceIndicators).forEach(name => {
      seriesLookups.push({ id: `price:${name}`, lookup: buildDateLookup(priceIndicators[name]) });
    });
    Object.keys(subIndicators).forEach(name => {
      seriesLookups.push({ id: `sub:${name}`, lookup: buildDateLookup(subIndicators[name]) });
    });

    // Process data for the chart
    const processed = data.prices.map((price) => {
      // Find signals that occurred on this price's date
      const matchingSignals = data.signals.filter(
        signal => signal.date === price.date
      );

      const indicatorValues = {};
      seriesLookups.forEach(({ id, lookup }) => {
        const value = lookup.get(price.date);
        if (typeof value === 'number' && !Number.isNaN(value)) {
          indicatorValues[id] = value;
        }
      });

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
  }, [data]);

  const getSignalMarker = (entry) => {
    if (!entry.signals || entry.signals.length === 0) return null;

    return entry.signals.map((signal, idx) => {
      const color = signal.type.includes('Long')
        ? (signal.type === 'LongOpen' ? 'green' : 'red')
        : (signal.type === 'ShortOpen' ? 'blue' : 'orange');

      return (
        <ReferenceLine
          key={`signal-${entry.date}-${idx}`}
          yAxisId="price"
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

  const subSeries = visibleSeries.filter(series => series.kind === 'sub');
  const hasSubSeries = subSeries.length > 0;

  return (
    <div className="chart-container">
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

          {hasSubSeries && (
            <YAxis
              yAxisId="indicator"
              orientation="right"
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              label={{
                value: subSeries.map(series => series.name).join(', '),
                angle: 90,
                position: 'insideRight',
                style: { textAnchor: 'middle' },
                fontSize: 12
              }}
            />
          )}

          <Tooltip content={<SimpleTooltip visibleSeries={visibleSeries} />} />
          <Legend />

          <Line
            type="monotone"
            dataKey="close"
            stroke="#1E40AF"
            dot={false}
            yAxisId="price"
            name="Close Price"
          />

          {visibleSeries.map(series => (
            <Line
              key={series.id}
              type="monotone"
              dataKey={series.id}
              stroke={series.color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              yAxisId={series.kind === 'price' ? 'price' : 'indicator'}
              name={series.name}
              isAnimationActive={false}
            />
          ))}

          {chartData.map(entry => getSignalMarker(entry))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ResultChart;
