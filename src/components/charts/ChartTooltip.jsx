// src/components/charts/ChartTooltip.jsx
import { useLayoutEffect, useRef } from 'react';
import { formatDate, formatSigned, formatSignedPercent } from '../../utils/formatters';
import { fmtExchangeIntl } from '../../utils/dates';
import {
  OUTCOME_TEXT, NOT_TRADED_TEXT, ENTRY_TRIGGER_TEXT, EXIT_REASON_LONG_TEXT, isConfirmedOutcome, barsHeld
} from '../../utils/levelChart';

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

// --- LevelBreakoutRetest annotations (utils/levelChart.js) ---
const fmtPx = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
const fmtBarDate = (ms) => (Number.isFinite(ms) ? fmtExchangeIntl(ms, TOOLTIP_TS_FORMAT) : '–');
const fmtBand = (low, high) => (Number.isFinite(low) && Number.isFinite(high) ? `${fmtPx(low)}–${fmtPx(high)}` : '–');
const Row = ({ label, children }) => (
  <div>{label}: <span style={{ float: 'right', marginLeft: 12 }}>{children}</span></div>
);

/** Entry marker of a level trade: trigger, zone band, entry price, initial stop and exit line. */
const EntryTooltipBody = ({ trade }) => (
  <>
    <div style={{ fontWeight: 'bold', marginBottom: '5px', color: 'green' }}>
      Entry: {ENTRY_TRIGGER_TEXT[trade.entryTrigger] || trade.entryTrigger || 'long'}
    </div>
    <div className="chart-tooltip-muted">{fmtBarDate(trade.entryMs)}</div>
    {trade.entryTrigger === 'ADOPTED' && (
      <div className="chart-tooltip-muted">Opened by another strategy; taken over by LevelBreakoutRetest</div>
    )}
    <Row label="Zone">
      {trade.entryTrigger === 'ADOPTED' && !(Number.isFinite(trade.entryZoneLow) && Number.isFinite(trade.entryZoneHigh))
        ? 'none below price'
        : fmtBand(trade.entryZoneLow, trade.entryZoneHigh)}
    </Row>
    <Row label="Entry price">{fmtPx(trade.entryPrice)}</Row>
    <Row label="Initial stop">{fmtPx(trade.initialStop)}</Row>
    <Row label="Initial exit line">{fmtPx(trade.initialExitLine)}</Row>
  </>
);

/** Exit marker of a level trade: reason, price, P&L %, bars held, support upgrades, MFE %. */
const ExitTooltipBody = ({ trade }) => {
  const pnlPct = Number.isFinite(trade.exitPrice) && trade.entryPrice > 0
    ? (trade.exitPrice - trade.entryPrice) / trade.entryPrice : NaN;
  // mfeClose is already a fraction: max(close over the trade) / entryPrice - 1 (TradeAnnotationVO)
  const mfePct = trade.mfeClose;
  const held = barsHeld(trade);
  return (
    <>
      <div style={{ fontWeight: 'bold', marginBottom: '5px', color: 'red' }}>
        Exit: {EXIT_REASON_LONG_TEXT[trade.exitReason] || trade.exitReason || 'close'}
      </div>
      <div className="chart-tooltip-muted">{fmtBarDate(trade.exitMs)}</div>
      <Row label="Exit price">{fmtPx(trade.exitPrice)}</Row>
      <Row label="P&L">
        {Number.isFinite(pnlPct)
          ? <span className={pnlClass(pnlPct)} style={{ fontWeight: 'bold' }}>{formatSignedPercent(pnlPct)}</span>
          : '–'}
      </Row>
      <Row label="Bars held">{Number.isFinite(held) ? held : '–'}</Row>
      <Row label="Support upgrades">{Number.isFinite(trade.supportUpgrades) ? trade.supportUpgrades : '–'}</Row>
      <Row label="MFE">{Number.isFinite(mfePct) ? formatSignedPercent(mfePct) : '–'}</Row>
    </>
  );
};

/** Setup window: zone, breakout date, outcome, and why a confirm did not trade. */
const SetupWindowTooltipBody = ({ setupWindow }) => {
  const confirmed = isConfirmedOutcome(setupWindow.outcome);
  return (
    <>
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Setup window</div>
      <Row label="Zone">{fmtBand(setupWindow.zoneLow, setupWindow.zoneHigh)}</Row>
      <Row label="Breakout">{fmtBarDate(setupWindow.breakoutMs)}</Row>
      {Number.isFinite(setupWindow.touchMs) && <Row label="Retest touch">{fmtBarDate(setupWindow.touchMs)}</Row>}
      <Row label="Ended">{Number.isFinite(setupWindow.endMs) ? fmtBarDate(setupWindow.endMs) : 'open'}</Row>
      <div style={{ marginTop: '4px' }}>
        Outcome: <strong>{OUTCOME_TEXT[setupWindow.outcome] || setupWindow.outcome}</strong>
      </div>
      {confirmed && (
        setupWindow.traded
          ? <div className="chart-tooltip-positive">Traded: this confirm opened the position</div>
          : (
            <div className="chart-tooltip-negative">
              Not traded: {NOT_TRADED_TEXT[setupWindow.notTradedReason] || setupWindow.notTradedReason || 'reason unknown'}
            </div>
          )
      )}
    </>
  );
};

// --- Level zone details (utils/levelChart.js describeZone), screener
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
      {zone.trigger === true && (
        <Row label="Breakout line">this zone sets it: {fmtFixed(zone.breakoutLine)}</Row>
      )}
      <Row label="Fail / support line">{fmtPx(zone.failLine)}</Row>
      {zone.roles.length > 0 && (
        <div>
          Role:
          {zone.roles.map(role => <div key={role} className="chart-tooltip-zone__role">{role}</div>)}
        </div>
      )}
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

// Gap between the cursor and the tooltip, px.
const TOOLTIP_OFFSET_PX = 15;

/**
 * ChartTooltip component for displaying data on hover. The body depends on the pane under the
 * cursor (`tooltipData.kind`): 'trade' -> trade PnL, 'cumulative' -> cumulative PnL, 'entry' /
 * 'exit' -> a LevelBreakoutRetest trade marker, 'setupWindow' -> a LevelBreakoutRetest setup
 * window, anything else -> the bar's OHLCV + the level status line (if any) + indicators + signals.
 * @param {Object} props - Component props
 * @param {Object} props.tooltipData - Data to display in tooltip
 * @param {string} [props.tooltipData.kind] - 'price' (default) | 'trade' | 'cumulative' | 'entry' |
 *   'exit' | 'setupWindow'
 * @param {{text: string, note: string|null}|null} [props.tooltipData.status] - level strategy status
 *   line for the bar ('price' kind; utils/levelChart.js statusLine)
 * @param {Object} props.tooltipData.price - Price data ('price' kind)
 * @param {Array} props.tooltipData.signals - Signals at this point ('price' kind)
 * @param {Array<{name: string, value: number, color: string}>} props.tooltipData.indicators -
 *   visible indicator values at this point, in picker order ('price' kind)
 * @param {Object} props.tooltipData.position - {x, y} cursor position relative to the container
 * @param {boolean} [props.tooltipData.flip] - place the tooltip left of the cursor (right edge)
 * @param {Array<Object>} [props.tooltipData.zones] - hovered level zones (levelChart.js describeZone),
 *   appended as zone blocks ('price' and 'setupWindow' kinds)
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
    const height = el.offsetHeight;
    const bottomLimit = Math.min(parentRect.bottom, window.innerHeight) - parentRect.top;
    let top = y + TOOLTIP_OFFSET_PX;
    if (top + height > bottomLimit) {
      const topLimit = Math.max(0, -parentRect.top); // keep the head on screen too
      top = Math.max(topLimit, y - TOOLTIP_OFFSET_PX - height);
    }
    el.style.top = `${top}px`;
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

  if (kind === 'entry' || kind === 'exit' || kind === 'setupWindow') {
    return (
      <div ref={tooltipRef} className={className} style={style}>
        {kind === 'entry' && <EntryTooltipBody trade={tooltipData.trade} />}
        {kind === 'exit' && <ExitTooltipBody trade={tooltipData.trade} />}
        {kind === 'setupWindow' && <SetupWindowTooltipBody setupWindow={tooltipData.window} />}
        {kind === 'setupWindow' && <ZoneSections zones={zones} />}
      </div>
    );
  }

  const { price, signals, indicators, status } = tooltipData;
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

      {/* Level strategy status for this bar (flat / waiting / in position) */}
      {status && (
        <div className="chart-tooltip-status" style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #eee', maxWidth: 260 }}>
          {status.text}
          {status.note && <div className="chart-tooltip-muted" style={{ fontSize: '0.8em' }}>{status.note}</div>}
        </div>
      )}

      {/* Hovered level zones (under the status line, before the indicators) */}
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
