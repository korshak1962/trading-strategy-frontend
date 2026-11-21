// src/components/charts/ChartTooltip.jsx
import { useLayoutEffect, useRef } from 'react';
import { formatDate, formatSigned, formatSignedPercent } from '../../utils/formatters';
import { fmtExchangeIntl } from '../../utils/dates';
import { voteText, VOTE_COLORS, blockedByText } from '../signals/signalPanes';
import { truncateLabel } from '../../utils/indicatorSeries';

// m7: a signal comment (a constructed rule's text) is cut to this many characters in the tooltip.
const COMMENT_MAX = 160;

// Bar timestamp in the exchange wall clock (decision 0.18): price.date is a UTC-faked Date.
const TOOLTIP_TS_FORMAT = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' };

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

// --- Shared row helpers ---
const fmtPx = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
const fmtBarDate = (ms) => (Number.isFinite(ms) ? fmtExchangeIntl(ms, TOOLTIP_TS_FORMAT) : '–');
const fmtBand = (low, high) => (Number.isFinite(low) && Number.isFinite(high) ? `${fmtPx(low)}–${fmtPx(high)}` : '–');
const Row = ({ label, children, testId }) => (
  <div data-testid={testId}>{label}: <span style={{ float: 'right', marginLeft: 12 }}>{children}</span></div>
);

// --- Level zone details (utils/levelZones.js describeZone), screener
// TASK_level_lines_always_zone_hover_fullscreen.md §F2 ---
// At most this many zone blocks per tooltip; the rest are counted ("+N more zones").
const ZONE_TOOLTIP_MAX = 2;
const fmtFixed = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–');
const fmtSignedFixed = (v, digits) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;

const zonePositionText = (position) => {
  if (!position) return '–';
  if (position.side === 'contains') return 'contains previous close';
  const atr = Number.isFinite(position.atr) ? `${fmtSignedFixed(position.atr, 1)} ATR ` : '';
  const pct = Number.isFinite(position.pct) ? `(${fmtSignedFixed(position.pct * 100, 1)}%)` : '';
  return `${position.side}, ${atr}${pct}`.trim();
};

const zoneStrengthText = (zone) => {
  if (!Number.isFinite(zone.strength)) return '–';
  const gate = Number.isFinite(zone.strengthGate) ? ` (gate ${zone.strengthGate})` : '';
  return `${zone.strength.toFixed(2)}${zone.strengthExact ? '' : ' at segment start'}${gate}`;
};

const zoneTouchesText = (zone) => {
  if (!Number.isFinite(zone.touchCount)) return '–';
  const min = Number.isFinite(zone.minTouches) ? ` (min ${zone.minTouches})` : '';
  const flips = Number.isFinite(zone.flipCount) ? `, flips ${zone.flipCount}` : '';
  return `${zone.touchCount}${min}${flips}`;
};

const zoneTrackerText = (armed) => {
  if (armed === true) return 'armed (can break out)';
  if (armed === false) return 'not armed (waiting / traded)';
  return '–';
};

/**
 * '250d as of 2023-11-02: up 2 / down 1 / failed 0, last 2023-10-05' - the zone's breakout history
 * over the 250 bars up to the segment's `from` (level range zones stage 2; absent when the
 * strategy keeps none, and then not shown).
 */
const zoneBreakoutsText = (zone) => {
  const b = zone.breakouts;
  const last = Number.isFinite(b.lastMs) ? `, last ${fmtBarDate(b.lastMs)}` : '';
  return `250d as of ${fmtBarDate(zone.fromMs)}: up ${b.up} / down ${b.down} / failed ${b.failed}${last}`;
};

/** One hovered level zone: every characteristic the backend sends plus the derived values. */
const ZoneSection = ({ zone }) => {
  const kind = zone.strong === true ? 'strong' : zone.strong === false ? 'weak' : null;
  return (
    <div className="chart-tooltip-section chart-tooltip-zone" data-testid="zone-tooltip-section">
      <div style={{ fontWeight: 'bold' }}>
        Zone #{zone.zoneId ?? '–'}{kind ? `, ${kind}` : ''}
      </div>
      <Row label="Band">{fmtBand(zone.low, zone.high)}</Row>
      <Row label="Width">
        {fmtPx(zone.width)}{Number.isFinite(zone.widthAtr) ? ` (${zone.widthAtr.toFixed(2)} ATR)` : ''}
      </Row>
      <Row label="Center">{fmtPx(zone.center)}</Row>
      <Row label="Position">{zonePositionText(zone.position)}</Row>
      <Row label="Strength">{zoneStrengthText(zone)}</Row>
      <Row label="Touches">{zoneTouchesText(zone)}</Row>
      <Row label="First touch">{fmtBarDate(zone.firstTouchMs)}</Row>
      <Row label="Last touch">{fmtBarDate(zone.lastTouchMs)}</Row>
      <Row label="Breakout tracker">{zoneTrackerText(zone.armed)}</Row>
      {zone.breakouts && (
        <Row label="Breakouts" testId="zone-tooltip-breakouts">{zoneBreakoutsText(zone)}</Row>
      )}
      {zone.trigger === true && (
        <Row label="Breakout line">this zone sets it: {fmtFixed(zone.breakoutLine)}</Row>
      )}
      <Row label="Fail / support line">{fmtPx(zone.failLine)}</Row>
      <Row label="State valid">
        {Number.isFinite(zone.fromMs)
          ? `${fmtBarDate(zone.fromMs)} – ${Number.isFinite(zone.toMs) ? fmtBarDate(zone.toMs) : 'last bar'}`
          : '–'}
      </Row>
    </div>
  );
};

/** The hovered zones, lowest first (already sorted by the caller), capped at ZONE_TOOLTIP_MAX. */
const ZoneSections = ({ zones }) => {
  if (!zones || zones.length === 0) return null;
  const shown = zones.slice(0, ZONE_TOOLTIP_MAX);
  const more = zones.length - shown.length;
  return (
    <>
      {shown.map((zone, index) => <ZoneSection key={`${zone.zoneId}-${index}`} zone={zone} />)}
      {more > 0 && <div className="chart-tooltip-muted">+{more} more zone{more === 1 ? '' : 's'} here</div>}
    </>
  );
};

/** Signals mode vote strip: the vote run under the cursor and its bar range. */
const VoteTooltipBody = ({ vote, longOnly }) => {
  if (!vote) return <div className="chart-tooltip-muted">No vote here (warm-up)</div>;
  return (
    <>
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
        <span className="vote-swatch" style={{ backgroundColor: VOTE_COLORS[vote.type] || 'var(--chart-vote-missing)' }} />
        Vote: {voteText(vote.type, longOnly)}
      </div>
      <div className="chart-tooltip-muted">
        {fmtBarDate(vote.barStartMs ?? vote.startMs)} – {fmtBarDate(vote.barEndMs ?? vote.endMs)}
      </div>
    </>
  );
};

// Gap between the cursor and the tooltip, px.
const TOOLTIP_OFFSET_PX = 15;

/**
 * ChartTooltip component for displaying data on hover. The body depends on the pane under the
 * cursor (`tooltipData.kind`): 'trade' -> trade PnL, 'cumulative' -> cumulative PnL, 'vote' ->
 * a Signals mode vote, anything else -> the bar's OHLCV + hovered level zones + indicators + signals.
 * @param {Object} props - Component props
 * @param {Object} props.tooltipData - Data to display in tooltip
 * @param {string} [props.tooltipData.kind] - 'price' (default) | 'trade' | 'cumulative' | 'vote'
 * @param {Object} props.tooltipData.price - Price data ('price' kind)
 * @param {Array} props.tooltipData.signals - Signals at this point ('price' kind)
 * @param {Array<{name: string, value: number, color: string}>} props.tooltipData.indicators -
 *   visible indicator values at this point, in picker order ('price' kind)
 * @param {Object} props.tooltipData.position - {x, y} cursor position relative to the container
 * @param {boolean} [props.tooltipData.flip] - place the tooltip left of the cursor (right edge)
 * @param {Array<Object>} [props.tooltipData.zones] - hovered level zones (levelZones.js describeZone),
 *   appended as zone blocks ('price' kind)
 * Near the bottom edge (of the chart container or the viewport, whichever is higher) the tooltip
 * opens above the cursor instead, so it never runs off-screen (matters most in fullscreen).
 * @returns {JSX.Element|null}
 */
const ChartTooltip = ({ tooltipData }) => {
  const tooltipRef = useRef(null);
  // After every render: flip up when the tooltip would pass the bottom edge. Written straight to
  // the DOM (not state) so a mouse move costs no second render; it runs after React applied
  // `top`, so it always overrides it with the right value.
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el || !tooltipData) return;
    const parent = el.offsetParent;
    if (!parent) return;
    const y = tooltipData.position.y;
    const parentRect = parent.getBoundingClientRect();
    el.style.maxHeight = ''; // measure the natural height (the cap below is from the previous move)
    const height = el.offsetHeight;
    const bottomLimit = Math.min(parentRect.bottom, window.innerHeight) - parentRect.top;
    const topLimit = Math.max(0, -parentRect.top); // keep the head on screen / inside the chart too
    let top = y + TOOLTIP_OFFSET_PX;
    if (top + height > bottomLimit) {
      top = Math.max(topLimit, y - TOOLTIP_OFFSET_PX - height);
    }
    el.style.top = `${top}px`;
    // m7: a tooltip taller than the chart (long rule texts) never runs past its top or bottom edge
    const room = bottomLimit - top;
    el.style.maxHeight = room > 0 ? `${room}px` : '';
    el.style.overflow = room > 0 && height > room ? 'hidden' : '';
  });

  if (!tooltipData) return null;

  const { kind = 'price', position, flip, zones } = tooltipData;
  const { x, y } = position;
  const style = {
    position: 'absolute',
    left: flip ? x - TOOLTIP_OFFSET_PX : x + TOOLTIP_OFFSET_PX,
    top: y + TOOLTIP_OFFSET_PX,
    transform: flip ? 'translateX(-100%)' : undefined
  };
  const hasZones = Array.isArray(zones) && zones.length > 0;
  const className = `chart-tooltip${hasZones ? ' chart-tooltip--zones' : ''}`;

  if (kind === 'trade') {
    return (
      <div ref={tooltipRef} className="chart-tooltip" style={style}>
        <TradeTooltipBody date={tooltipData.date} trades={tooltipData.trades} legLabel={tooltipData.legLabel} />
      </div>
    );
  }

  if (kind === 'cumulative') {
    return (
      <div ref={tooltipRef} className="chart-tooltip" style={style}>
        <CumulativeTooltipBody
          date={tooltipData.date}
          value={tooltipData.value}
          closedCount={tooltipData.closedCount}
          legLabel={tooltipData.legLabel}
        />
      </div>
    );
  }

  if (kind === 'vote') {
    return (
      <div ref={tooltipRef} className="chart-tooltip" style={style}>
        <VoteTooltipBody vote={tooltipData.vote} longOnly={tooltipData.longOnly} />
      </div>
    );
  }

  const { price, signals, indicators } = tooltipData;
  return (
    <div ref={tooltipRef} className={className} style={style}>
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
        {fmtExchangeIntl(price.date, TOOLTIP_TS_FORMAT)}
      </div>
      <div>Open: <span style={{ float: 'right' }}>{price.open.toFixed(2)}</span></div>
      <div>High: <span style={{ float: 'right' }}>{price.high.toFixed(2)}</span></div>
      <div>Low: <span style={{ float: 'right' }}>{price.low.toFixed(2)}</span></div>
      <div>Close: <span style={{ float: 'right' }}>{price.close.toFixed(2)}</span></div>
      <div>Volume: <span style={{ float: 'right' }}>{price.volume.toLocaleString()}</span></div>

      {/* Hovered level zones (before the indicators) */}
      <ZoneSections zones={zones} />

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
          <span title={name}>{truncateLabel(name)}</span>: <span style={{ float: 'right' }}>{Number(value).toFixed(2)}</span>
        </div>
      ))}

      {/* Show signals if available */}
      {signals.length > 0 && (
        <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid var(--chart-divider)' }}>
          <div style={{ fontWeight: 'bold' }}>Signals:</div>
          {signals.map((signal, index) => (
            <div key={index} style={{
              color: signal.type === 'LongBlock'
                ? 'var(--chart-signal-muted-text)'
                : signal.type.includes('Long')
                  ? (signal.type === 'LongOpen' ? 'var(--chart-long-open-text)' : 'var(--chart-long-close-text)')
                  : (signal.type === 'ShortOpen' ? 'var(--chart-short-open-text)' : 'var(--chart-short-close-text)')
            }}>
              {signal.type} @ {signal.price.toFixed(2)}
              {/* Signals mode: a strategy signal the merge did not execute / the merged trade's sources */}
              {signal.reason === 'OUTSIDE_WINDOW'
                ? <span className="chart-tooltip-muted"> (not executed — before trade start)</span>
                : signal.executed === false && (
                  <span className="chart-tooltip-muted">
                    {/* a PD LongOpen that lost the bar to a constructed strategy's LongBlock */}
                    {blockedByText(signal.blockedBy) ? ` (${blockedByText(signal.blockedBy)})` : ' (not executed in the merge)'}
                  </span>
                )}
              {Array.isArray(signal.sources) && signal.sources.length > 0 && (
                <div className="chart-tooltip-muted">from: {signal.sources.join(', ')}</div>
              )}
              {signal.comment && <div style={{ fontSize: '0.8em' }}>{truncateLabel(signal.comment, COMMENT_MAX)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChartTooltip;
