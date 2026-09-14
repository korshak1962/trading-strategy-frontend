// src/components/charts/ChartTooltip.jsx
import React from 'react';

/**
 * ChartTooltip component for displaying data on hover
 * @param {Object} props - Component props
 * @param {Object} props.tooltipData - Data to display in tooltip
 * @param {Object} props.tooltipData.price - Price data
 * @param {Array} props.tooltipData.signals - Signals at this point
 * @param {Array<{name: string, value: number, color: string}>} props.tooltipData.indicators -
 *   visible indicator values at this point, in picker order
 * @param {Object} props.tooltipData.position - {x, y} position
 * @returns {JSX.Element|null}
 */
const ChartTooltip = ({ tooltipData }) => {
  if (!tooltipData) return null;
  
  const { price, signals, indicators, position } = tooltipData;
  const { x, y } = position;
  
  return (
    <div 
      className="chart-tooltip" 
      style={{ 
        position: 'absolute', 
        left: x + 15, 
        top: y + 15
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
        {price.date.toLocaleString()}
      </div>
      <div>Open: <span style={{ float: 'right' }}>{price.open.toFixed(2)}</span></div>
      <div>High: <span style={{ float: 'right' }}>{price.high.toFixed(2)}</span></div>
      <div>Low: <span style={{ float: 'right' }}>{price.low.toFixed(2)}</span></div>
      <div>Close: <span style={{ float: 'right' }}>{price.close.toFixed(2)}</span></div>
      <div>Volume: <span style={{ float: 'right' }}>{price.volume.toLocaleString()}</span></div>
      
      {/* Visible indicator values, each with the same colour dot as its line / picker chip */}
      {(indicators || []).map(({ name, value, color }, index) => (
        <div key={`${name}-${index}`}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: color,
              marginRight: 5,
              verticalAlign: 'middle'
            }}
          />
          {name}: <span style={{ float: 'right' }}>{Number(value).toFixed(2)}</span>
        </div>
      ))}
      
      {/* Show signals if available */}
      {signals.length > 0 && (
        <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #eee' }}>
          <div style={{ fontWeight: 'bold' }}>Signals:</div>
          {signals.map((signal, index) => (
            <div key={index} style={{ 
              color: signal.type.includes('Long') 
                ? (signal.type === 'LongOpen' ? 'green' : 'red')
                : (signal.type === 'ShortOpen' ? 'blue' : 'orange')
            }}>
              {signal.type} @ {signal.price.toFixed(2)}
              {signal.comment && <div style={{ fontSize: '0.8em' }}>{signal.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChartTooltip;