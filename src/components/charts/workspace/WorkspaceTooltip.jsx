// src/components/charts/workspace/WorkspaceTooltip.jsx
import { useLayoutEffect, useRef } from 'react';
import { fmtExchangeIntl, MOEX_ZONE } from '../../../utils/dates';

const TOOLTIP_OFFSET_PX = 14;
const INTRADAY_TF = new Set(['MIN5', 'HOUR']);
const DATE_FORMAT = { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' };
const DATE_TIME_FORMAT = { ...DATE_FORMAT, hour: '2-digit', minute: '2-digit', hour12: false };

const fmtPrice = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');

/** 'NY' / 'MSK': the exchange wall clock the bar times are shown in (decision 0.18). */
const zoneLabel = (zone) => (zone === MOEX_ZONE ? 'MSK' : 'NY');

/**
 * Hover tooltip of PriceWorkspaceChart (TASK A4), in the look of ChartTooltip.jsx (its
 * .chart-tooltip classes and tokens): the bar's date (and time on HOUR / MIN5, exchange wall clock
 * with the zone label), O / H / L / C, the change from the previous close, then the rows every
 * layer contributes (layer.tooltipRows(barIndex)).
 * @param {Object} props
 * @param {{x:number, y:number, flip:boolean, bar:Object, prevClose:?number,
 *   rows: Array<{label:string, value?:string, color?:string, note?:string}>}} props.tip
 * @param {string} props.timeframe
 * @param {string} props.zone - exchange zone id
 */
const WorkspaceTooltip = ({ tip, timeframe, zone }) => {
  const ref = useRef(null);

  // After every render: flip up when the tooltip would pass the bottom of the chart container.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const height = el.offsetHeight;
    let top = tip.y + TOOLTIP_OFFSET_PX;
    if (top + height > parent.clientHeight) top = Math.max(0, tip.y - TOOLTIP_OFFSET_PX - height);
    el.style.top = `${top}px`;
  });

  const { bar, prevClose, rows } = tip;
  const change = Number.isFinite(prevClose) && prevClose !== 0 ? (bar.close - prevClose) / prevClose : null;
  const changeClass = change === null ? '' : change >= 0 ? 'chart-tooltip-positive' : 'chart-tooltip-negative';
  const ms = bar.time * 1000;
  const style = {
    position: 'absolute',
    left: tip.flip ? tip.x - TOOLTIP_OFFSET_PX : tip.x + TOOLTIP_OFFSET_PX,
    top: tip.y + TOOLTIP_OFFSET_PX,
    transform: tip.flip ? 'translateX(-100%)' : undefined,
  };

  return (
    <div ref={ref} className="chart-tooltip ws-tooltip" style={style} data-testid="ws-tooltip">
      <div className="ws-tooltip__date">
        {fmtExchangeIntl(ms, INTRADAY_TF.has(timeframe) ? DATE_TIME_FORMAT : DATE_FORMAT)}
        {INTRADAY_TF.has(timeframe) && <span className="chart-tooltip-muted"> {zoneLabel(zone)}</span>}
      </div>
      <div className="ws-tooltip__ohlc">
        <span>O <b>{fmtPrice(bar.open)}</b></span>
        <span>H <b>{fmtPrice(bar.high)}</b></span>
        <span>L <b>{fmtPrice(bar.low)}</b></span>
        <span>C <b>{fmtPrice(bar.close)}</b></span>
      </div>
      <div>
        Change:{' '}
        {change === null
          ? <span className="chart-tooltip-muted">– (first bar)</span>
          : <b className={changeClass}>{change >= 0 ? '+' : '−'}{Math.abs(change * 100).toFixed(2)}%</b>}
      </div>
      {rows.length > 0 && (
        <div className="chart-tooltip-section">
          {rows.map((row, i) => (
            <div key={i} className="ws-tooltip__row">
              <span className="ws-tooltip__label">
                {row.color && <span className="ws-tooltip__swatch" style={{ background: row.color }} />}
                {row.label}
              </span>
              {row.value !== undefined && <span className="ws-tooltip__value">{row.value}</span>}
              {row.note && <div className="chart-tooltip-muted ws-tooltip__note">{row.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkspaceTooltip;
