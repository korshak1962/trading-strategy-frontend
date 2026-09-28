// src/components/charts/ChartTooltip.jsx
import { formatDate, formatSigned, formatSignedPercent } from '../../utils/formatters';

const pnlClass = (value) => (value >= 0 ? 'chart-tooltip-positive' : 'chart-tooltip-negative');
const shortDate = (date) => formatDate(date, false);

/**
 * Tooltip body for the Individual Trade PnL pane: the trade(s) whose bar is under the cursor.
 */
const TradeTooltipBody = ({ date, trades, legLabel }) => (
  <>
    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{shortDate(date)}</div>
    {trades.length === 0 && <div className="chart-tooltip-muted">No trade at this date{legLabel}</div>}
    {trades.map((trade, index) => {
      const pct = trade.openPrice ? trade.pnl / trade.openPrice : null;
      return (
        <div key={index} className={index > 0 ? 'chart-tooltip-section' : undefined}>
          <div>
            {trade.type} trade PnL:{' '}
            <span className={pnlClass(trade.pnl)} style={{ fontWeight: 'bold' }}>
              {formatSigned(trade.pnl)}{pct !== null && ` (${formatSignedPercent(pct)})`}
            </span>
          </div>
          <div className="chart-tooltip-muted">
            {shortDate(trade.openDate)} @ {trade.openPrice.toFixed(2)} → {shortDate(trade.closeDate)} @ {trade.closePrice.toFixed(2)}
          </div>
        </div>
      );
    })}
  </>
);

/**
 * Tooltip body for the Cumulative PnL pane: realized total at the bar under the cursor.
 */
const CumulativeTooltipBody = ({ date, value, closedCount, legLabel }) => (
  <>
    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{shortDate(date)}</div>
    <div>
      Cumulative PnL:{' '}
      <span className={pnlClass(value)} style={{ fontWeight: 'bold' }}>{formatSigned(value)}</span>
    </div>
    <div className="chart-tooltip-muted">
      {closedCount} closed trade{closedCount === 1 ? '' : 's'} so far{legLabel}
    </div>
  </>
);

/**
 * ChartTooltip component for displaying data on hover. The body depends on the pane under the
 * cursor (`tooltipData.kind`): 'trade' -> trade PnL, 'cumulative' -> cumulative PnL, anything
 * else -> the bar's OHLCV + indicators + signals.
 * @param {Object} props - Component props
 * @param {Object} props.tooltipData - Data to display in tooltip
 * @param {string} [props.tooltipData.kind] - 'price' (default) | 'trade' | 'cumulative'
 * @param {Object} props.tooltipData.price - Price data ('price' kind)
 * @param {Array} props.tooltipData.signals - Signals at this point ('price' kind)
 * @param {Array<{name: string, value: number, color: string}>} props.tooltipData.indicators -
 *   visible indicator values at this point, in picker order ('price' kind)
 * @param {Object} props.tooltipData.position - {x, y} cursor position relative to the container
 * @param {boolean} [props.tooltipData.flip] - place the tooltip left of the cursor (right edge)
 * @returns {JSX.Element|null}
 */
const ChartTooltip = ({ tooltipData }) => {
  if (!tooltipData) return null;

  const { kind = 'price', position, flip } = tooltipData;
  const { x, y } = position;
  const style = {
    position: 'absolute',
    left: flip ? x - 15 : x + 15,
    top: y + 15,
    transform: flip ? 'translateX(-100%)' : undefined
  };

  if (kind === 'trade') {
    return (
      <div className="chart-tooltip" style={style}>
        <TradeTooltipBody date={tooltipData.date} trades={tooltipData.trades} legLabel={tooltipData.legLabel} />
      </div>
    );
  }

  if (kind === 'cumulative') {
    return (
      <div className="chart-tooltip" style={style}>
        <CumulativeTooltipBody
          date={tooltipData.date}
          value={tooltipData.value}
          closedCount={tooltipData.closedCount}
          legLabel={tooltipData.legLabel}
        />
      </div>
    );
  }

  const { price, signals, indicators } = tooltipData;
  return (
    <div className="chart-tooltip" style={style}>
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
