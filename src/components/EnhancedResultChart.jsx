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
  ReferenceArea,
  ComposedChart,
  Bar,
  Cell,
  Brush
} from 'recharts';
import './EnhancedResultChart.css';
import { buildDateLookup } from '../utils/indicatorSeries';
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

// Human-readable date for tooltips, following the same intraday rule as the row key:
// intraday (HOUR/MIN5) keys get date + time, day-and-coarser keys the date only.
const INTRADAY_DISPLAY_FORMAT = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const displayDateFn = (barKey) => (barKey === fmtExchangeDateTime
  ? (v) => fmtExchangeIntl(v, INTRADAY_DISPLAY_FORMAT)
  : (v) => fmtExchangeIntl(v));

// Memoized per key: with the default interval recharts formats EVERY category on each render
// (to measure labels), i.e. ~1500 Intl.DateTimeFormat constructions per axis per Brush drag
// step on HOUR data - that dominated the drag cost. Keys are bar-key strings, so the cache is
// bounded by the bars seen; it is cleared if it ever grows past a generous cap.
const axisTickCache = new Map();
const AXIS_TICK_CACHE_MAX = 50000;
const formatAxisTick = (value) => {
  let label = axisTickCache.get(value);
  if (label === undefined) {
    label = typeof value === 'string' && value.length > 10
      ? fmtExchangeIntl(value, INTRADAY_TICK_FORMAT)
      : fmtExchangeIntl(value);
    if (axisTickCache.size >= AXIS_TICK_CACHE_MAX) axisTickCache.clear();
    axisTickCache.set(value, label);
  }
  return label;
};

// P&L axis ticks are multiples of a nice step: print with at most 2 decimals, no trailing zeros.
const formatPnLTick = (value) => String(Number(value.toFixed(2)));

// Nice axis for [min, max] (the caller always includes 0). Padding of 2% of the data span only
// on a side with data beyond 0. Each candidate step s in {1, 2, 2.5, 5} x 10^n gives the domain
// [floor(min/s)*s, ceil(max/s)*s] with a labelled tick at every multiple of s (so both ends are
// ticks, and 0 is one); candidates with 3..8 ticks are kept and the one with the least empty
// space (domain span - data span) wins, ties going to fewer ticks. All-zero data -> [-1, 1].
const niceAxis = (rawMin, rawMax) => {
  const min = Math.min(rawMin, 0);
  const max = Math.max(rawMax, 0);
  if (max - min < 1e-9) return { yDomain: [-1, 1], yTicks: [-1, 0, 1] };
  const pad = (max - min) * 0.02;
  const padMin = min < 0 ? min - pad : 0;
  const padMax = max > 0 ? max + pad : 0;
  const dataSpan = padMax - padMin;
  const base = Math.floor(Math.log10(dataSpan / 6));
  let best = null;
  for (let e = base - 1; e <= base + 2; e++) {
    [1, 2, 2.5, 5].forEach(m => {
      const step = m * 10 ** e;
      const kLo = Math.floor(padMin / step + 1e-9);
      const kHi = Math.ceil(padMax / step - 1e-9);
      const count = kHi - kLo + 1;
      if (count < 3 || count > 8) return;
      const empty = (kHi - kLo) * step - dataSpan;
      if (!best || empty < best.empty - 1e-9 || (Math.abs(empty - best.empty) <= 1e-9 && count < best.count)) {
        best = { kLo, kHi, step, count, empty };
      }
    });
  }
  const ticks = [];
  for (let k = best.kLo; k <= best.kHi; k++) ticks.push(Number((k * best.step).toFixed(10)));
  return { yDomain: [ticks[0], ticks[ticks.length - 1]], yTicks: ticks };
};

// Stable empty default, so a missing openTrades prop does not break the pane's memoization
const NO_TRADES = [];

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

// Unrealized P&L of a position marked at `price`
const unrealizedPnL = (trade, price) =>
  (trade.type === 'Long' ? price - trade.openPrice : trade.openPrice - price);

// Fixed Y axis width, shared by every Y axis of both panes so their plot areas line up
const Y_AXIS_WIDTH = 60;
const PNL_MARGIN_RIGHT = 30;

// Tooltip for the P&L pane: date, equity at the hovered bar, and every trade whose span covers
// that bar (the bands are ReferenceAreas, which are not tooltip items themselves). Closed trades
// show their realized P&L; an open position its unrealized P&L at the hovered bar's close.
const TradeTooltip = ({ active, payload, trades = [], openTrades = [] }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  if (typeof data.equity !== 'number') return null;

  const barTrades = trades.filter(t => t.openIndex <= data.index && data.index <= t.closeIndex);
  const barOpenTrades = openTrades.filter(t => t.openIndex <= data.index);

  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{data.displayDate || data.date}</p>
      <p className="tooltip-trade-detail">
        Equity (P&L): <span className={data.equity >= 0 ? "positive" : "negative"}>
          {data.equity.toFixed(2)}
        </span>
      </p>
      {barTrades.map((trade, i) => (
        <div key={`closed-${i}`}>
          <p className="tooltip-trade-header">
            {trade.type} Trade {trade.profit >= 0 ? '(Profit)' : '(Loss)'}
          </p>
          <p className="tooltip-trade-detail">
            Open: {trade.openDate} at {Number(trade.openPrice).toFixed(2)}
          </p>
          <p className="tooltip-trade-detail">
            Close: {trade.closeDate} at {Number(trade.closePrice).toFixed(2)}
          </p>
          <p className={`tooltip-trade-profit ${trade.profit >= 0 ? 'positive' : 'negative'}`}>
            Realized P&L: {Number(trade.profit).toFixed(2)}
          </p>
        </div>
      ))}
      {barOpenTrades.map((trade, i) => {
        const unrealized = unrealizedPnL(trade, data.close);
        return (
          <div key={`open-${i}`}>
            <p className="tooltip-trade-header">{trade.type} Trade (Open)</p>
            <p className="tooltip-trade-detail">
              Open: {trade.openDate} at {Number(trade.openPrice).toFixed(2)}
            </p>
            <p className="tooltip-trade-detail">Close: Open</p>
            <p className={`tooltip-trade-profit ${unrealized >= 0 ? 'positive' : 'negative'}`}>
              Unrealized P&L: {unrealized.toFixed(2)}
            </p>
          </div>
        );
      })}
    </div>
  );
};

const signalColor = (type) => {
  if (type === 'LongOpen') return 'green';
  if (type === 'LongClose') return 'red';
  if (type === 'ShortOpen') return 'blue';
  if (type === 'ShortClose') return 'orange';
  return 'gray';
};

// Mark-to-market equity per bar, O(n + trades):
//   equity[i] = realized P&L of trades closed at or before bar i
//             + unrealized P&L of every trade open at bar i, marked at close[i].
// A closed trade is "open" on bars openIndex..closeIndex-1 (on its close bar it is realized);
// an open position from openIndex to the last bar. The unrealized sum of the active trades is
// close[i] * (longs - shorts) - (sum of long open prices - sum of short open prices), so two
// difference arrays (coefficient and constant) give it per bar without walking each trade.
const equityByBar = (data, trades, openTrades) => {
  const n = data.length;
  const realizedAt = new Array(n + 1).fill(0);
  const coefDiff = new Array(n + 1).fill(0);
  const constDiff = new Array(n + 1).fill(0);
  const activate = (trade, from, toExclusive) => {
    const to = Math.min(toExclusive, n);
    if (from < 0 || from >= to) return;
    const sign = trade.type === 'Long' ? 1 : -1;
    coefDiff[from] += sign;
    coefDiff[to] -= sign;
    constDiff[from] -= sign * trade.openPrice;
    constDiff[to] += sign * trade.openPrice;
  };
  trades.forEach(trade => {
    if (trade.closeIndex >= 0 && trade.closeIndex < n && Number.isFinite(trade.profit)) {
      realizedAt[trade.closeIndex] += trade.profit;
    }
    activate(trade, trade.openIndex, trade.closeIndex);
  });
  openTrades.forEach(trade => activate(trade, trade.openIndex, n));
  const equity = new Array(n);
  let realized = 0;
  let coef = 0;
  let constant = 0;
  for (let i = 0; i < n; i++) {
    realized += realizedAt[i];
    coef += coefDiff[i];
    constant += constDiff[i];
    equity[i] = realized + (coef !== 0 ? coef * data[i].close : 0) + constant;
  }
  return equity;
};

// Enhanced PnL Chart with synchronized timelines: one mark-to-market equity line over faint
// full-height trade bands.
// memo + useMemo matter here: the parent re-renders on every Brush drag event (controlled
// brush), and if this chart received a freshly-built `data` array each time, recharts'
// getDerivedStateFromProps would treat it as new data and reset the synced zoom range.
// The visible window (startIndex/endIndex, primitives) IS passed in, so this re-renders on
// each Brush drag - that is safe, because chartData keeps its identity across those renders.
// rightReserve matches the price chart's right indicator axis (0 when it is hidden) so the two
// plot areas start and end at the same x pixels.
const SynchronizedPnLChart = memo(({ data, trades, openTrades = NO_TRADES, height, syncId, startIndex, endIndex, xInterval, rightReserve = 0 }) => {
  const chartData = useMemo(() => {
    if (!data || !trades) return [];
    const equity = equityByBar(data, trades, openTrades);
    return data.map((point, index) => ({ ...point, equity: equity[index] }));
  }, [data, trades, openTrades]);

  // Open positions marked to market at the last bar's close (decides the band colour)
  const openMarks = useMemo(() => {
    const last = data && data[data.length - 1];
    if (!last) return [];
    return openTrades.map(t => ({ ...t, profit: unrealizedPnL(t, last.close) }));
  }, [data, openTrades]);

  // Visible (brushed) window, clamped to the data
  const lastIndex = chartData.length - 1;
  const visStart = Math.max(0, Math.min(startIndex ?? 0, lastIndex));
  const visEnd = Math.max(visStart, Math.min(endIndex ?? lastIndex, lastIndex));

  // Y axis fitted to the VISIBLE part of the equity line and 0 (so a brush zoom rescales it),
  // with a little padding, rounded out to nice ticks.
  const { yDomain, yTicks } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (let i = visStart; i <= visEnd && i < chartData.length; i++) {
      const v = chartData[i].equity;
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return niceAxis(min, max);
  }, [chartData, visStart, visEnd]);

  const tooltipContent = useMemo(
    () => <TradeTooltip trades={trades} openTrades={openTrades} />,
    [trades, openTrades]
  );

  // Trade bands: one full-height ReferenceArea per trade (no y1/y2) from open bar to close bar
  // (open position: to the last bar), green for profit / red for loss, faint, behind the line.
  // The x axis is a category point scale whose domain is only the visible (brushed) bars, and a
  // category outside it makes ReferenceArea discard the whole rect - so clamp each trade to the
  // visible window and skip trades fully outside it. A trade collapsed to a single bar is
  // widened to a neighbouring bar so it stays visible. Memoized on the window so the elements
  // are only rebuilt when it actually moves.
  const tradeBands = useMemo(() => {
    const band = (trade, closeIndex, key, isOpen) => {
      if (closeIndex < visStart || trade.openIndex > visEnd) return null;
      let from = Math.max(trade.openIndex, visStart);
      let to = Math.min(closeIndex, visEnd);
      if (from === to) {
        if (to < visEnd) to += 1;
        else if (from > visStart) from -= 1;
      }
      const color = trade.profit >= 0 ? "#4caf50" : "#f44336";
      return (
        <ReferenceArea
          key={key}
          x1={chartData[from].date}
          x2={chartData[to].date}
          fill={color}
          fillOpacity={isOpen ? 0.08 : 0.14}
          stroke={isOpen ? color : 'none'}
          strokeOpacity={0.6}
          strokeDasharray={isOpen ? "4 3" : undefined}
        />
      );
    };
    return [
      ...(trades || []).map((trade, i) => band(trade, trade.closeIndex, `trade-${i}`, false)),
      ...openMarks.map((trade, i) => band(trade, lastIndex, `open-${i}`, true))
    ];
  }, [chartData, trades, openMarks, lastIndex, visStart, visEnd]);

  if (!data || !trades || (trades.length === 0 && openTrades.length === 0)) {
    return (
      <div className="no-data-message">
        No trade data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={chartData}
        margin={{ top: 10, right: PNL_MARGIN_RIGHT + rightReserve, left: 10, bottom: 5 }}
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
          interval={xInterval}
        />
        <YAxis
          width={Y_AXIS_WIDTH}
          tick={{ fontSize: 10 }}
          domain={yDomain}
          ticks={yTicks}
          interval={0}
          tickFormatter={formatPnLTick}
          label={{
            value: 'Profit/Loss',
            angle: -90,
            position: 'insideLeft',
            fontSize: 12
          }}
        />
        <Tooltip content={tooltipContent} />
        <Legend />

        {/* Trade bands (behind the equity line) */}
        {tradeBands}

        <ReferenceLine y={0} stroke="#666" strokeWidth={1} />

        {/* Mark-to-market equity: realized + unrealized P&L at every bar's close */}
        <Line
          type="linear"
          dataKey="equity"
          name="Equity (P&L)"
          stroke="#2196F3"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});
SynchronizedPnLChart.displayName = 'SynchronizedPnLChart';

const EnhancedResultChart = ({ data, height = 400, visibleSeries = [] }) => {
  const [chartData, setChartData] = useState([]);
  const [showPnLChart, setShowPnLChart] = useState(true);
  const [trades, setTrades] = useState([]);
  // Positions still open at the last bar (open signal without a matching close)
  const [openTrades, setOpenTrades] = useState([]);
  // Controlled Brush window. Owned here so that parent re-renders can never reset the zoom;
  // it is only re-initialised when the `data` prop identity changes (new backtest result).
  const [brushRange, setBrushRange] = useState({ startIndex: 0, endIndex: 0 });
  const chartHeight = height; 
  const pnlHeight = 200;
  // Price chart width, reported by its ResponsiveContainer; drives the x tick interval below.
  const [chartWidth, setChartWidth] = useState(0);
  const syncId = "trading-charts-sync";
  
  useEffect(() => {
    if (!data) return;

    // One key function for rows, the signal map and trade extraction, so they cannot diverge.
    // A day-only key on intraday data would collapse HOUR/MIN5 bars onto duplicate x categories.
    const standardizeDateFormat = barKeyFn(data.prices);
    const toDisplayDate = displayDateFn(standardizeDateFormat);

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
        displayDate: toDisplayDate(price.date), // For display purposes
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
    const { closed, open } = extractTradesFromSignals(processed, data.signals, standardizeDateFormat, toDisplayDate);
    setTrades(closed);
    setOpenTrades(open);
  }, [data]);

  // Function to extract trades from signals with improved date handling
  const extractTradesFromSignals = (processedData, signals, toBarKey, toDisplayDate) => {
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
              openDate: toDisplayDate(openTrade.signal.date),
              closeDate: toDisplayDate(signal.date),
              openPrice: openTrade.signal.price,
              closePrice: signal.price,
              profit: profit,
              type: tradeKey,
              openIndex: openTrade.index,
              closeIndex: signalIndex,
              // Store the signal objects for reference
              openSignal: openTrade.signal,
              closeSignal: signal
            });
          }
          
          // Clear this trade type
          delete activeTrades[tradeKey];
        }
      }
    });
    
    // Whatever is still active after the last signal is an open position
    const openPositions = Object.entries(activeTrades).map(([tradeKey, openTrade]) => ({
      type: tradeKey,
      openDate: toDisplayDate(openTrade.signal.date),
      openPrice: openTrade.signal.price,
      openIndex: openTrade.index
    }));

    return { closed: extractedTrades, open: openPositions };
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

  // Built once per visibleSeries change, not on every Brush drag re-render.
  const priceTooltip = useMemo(() => <CustomTooltip visibleSeries={visibleSeries} />, [visibleSeries]);
  const indicatorLines = useMemo(() => visibleSeries.map(series => (
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
  )), [visibleSeries]);

  // The right-hand axis only exists while some sub-pane series is drawn on it.
  const hasVisibleSubSeries = visibleSeries.some(series => series.kind === 'sub');

  // Explicit x tick interval (every Nth visible bar) sized to the chart width. With recharts'
  // default 'preserveEnd' every category label is measured in the DOM on each render, which on
  // HOUR/MIN5 (~1500 bars) cost hundreds of ms per Brush drag step, in both panes. A number is
  // the cheap path. Until the width is known the default is kept.
  const xInterval = useMemo(() => {
    if (chartWidth <= 0 || chartData.length === 0) return 'preserveEnd';
    const intraday = String(chartData[0].date).length > 10;
    const maxTicks = Math.max(2, Math.floor(chartWidth / (intraday ? 90 : 75)));
    const visible = Math.max(1, brushRange.endIndex - brushRange.startIndex + 1);
    return Math.max(0, Math.ceil(visible / maxTicks) - 1);
  }, [chartWidth, chartData, brushRange]);

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
        <ResponsiveContainer width="100%" height={chartHeight} onResize={setChartWidth}>
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
          interval={xInterval}
            />
            <YAxis 
              yAxisId="price"
              width={Y_AXIS_WIDTH}
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
                width={Y_AXIS_WIDTH}
                orientation="right"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10 }}
              />
            )}

            <Tooltip content={priceTooltip} />
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
            {indicatorLines}
            
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
            openTrades={openTrades}
            height={pnlHeight}
            syncId={syncId}
            startIndex={brushRange.startIndex}
            endIndex={brushRange.endIndex}
            xInterval={xInterval}
            rightReserve={hasVisibleSubSeries ? Y_AXIS_WIDTH : 0}
          />
        </div>
      )}
    </div>
  );
};

export default EnhancedResultChart;