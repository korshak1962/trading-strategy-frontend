// src/utils/ChartDrawingUtils.js
import { parseExchangeTs } from './dates';

// Helper functions for finding min/max values
export const findMinMaxPriceRange = (prices) => {
    if (!prices || prices.length === 0) return { min: 0, max: 100 };
    
    let min = prices[0].low; // Start with low of first candle
    let max = prices[0].high; // Start with high of first candle
    
    prices.forEach(price => {
      // Check if this price's low is lower than current min
      if (price.low < min) min = price.low;
      // Check if this price's high is higher than current max
      if (price.high > max) max = price.high;
    });
    
    // Add some padding (10%)
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  };
  
  export const findMinMaxValuesForIndicator = (data) => {
    if (!data || data.length === 0) return { min: 0, max: 100 };
    
    let min = data[0].value;
    let max = data[0].value;
    
    data.forEach(item => {
      if (item.value < min) min = item.value;
      if (item.value > max) max = item.value;
    });
    
    // Add some padding
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  };
  
  export const findMinMaxTradeValues = (trades) => {
    if (!trades || trades.length === 0) return { min: -1, max: 1 };
    
    let min = trades[0].pnl;
    let max = trades[0].pnl;
    
    trades.forEach(trade => {
      if (trade.pnl < min) min = trade.pnl;
      if (trade.pnl > max) max = trade.pnl;
    });
    
    // Add some padding and ensure zero is included
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    // Add some padding - 20%
    const padding = absMax * 0.2;
    return { min: -absMax - padding, max: absMax + padding };
  };
  
  /**
   * The drawing ("plot") date range for a logical, zoomed dateRange: the same window widened by
   * half a candle slot on each side, so the first and last candles - centred on their own date -
   * are drawn whole instead of half cut off at x=0 / x=width.
   *
   * Every pane draws with, and every mouse <-> time mapping uses, this one range, so the panes,
   * crosshair, tooltip, signals and zoom stay aligned; the logical range (zoom state, slider,
   * zoom badge) is left as is. A slot is the average bar spacing inside the window, which is the
   * same `width / visibleCandleCount` the price pane sizes its candles from.
   *
   * @param {[Date, Date]|null} dateRange - the logical range
   * @param {number[]} barTimes - every bar's epoch ms, ascending
   * @returns {[Date, Date]|null}
   */
  export const plotDateRange = (dateRange, barTimes) => {
    if (!dateRange || !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) return dateRange;
    const startMs = dateRange[0].getTime();
    const endMs = dateRange[1].getTime();
    const times = barTimes || [];
    let count = 0;
    times.forEach(ms => { if (ms >= startMs && ms <= endMs) count++; });

    let slotMs;
    if (count >= 2 && endMs > startMs) {
      slotMs = (endMs - startMs) / (count - 1);
    } else if (times.length >= 2) {
      // 0-1 bars in view: fall back to the whole series' average bar spacing
      slotMs = (times[times.length - 1] - times[0]) / (times.length - 1);
    } else {
      slotMs = 24 * 60 * 60 * 1000; // a lone bar: any non-zero width centres it
    }
    return [new Date(startMs - slotMs / 2), new Date(endMs + slotMs / 2)];
  };

  // Canvas drawing functions
  export const drawNoDataMessage = (ctx, width, height, message = "No data available") => {
    ctx.fillStyle = '#888';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  };
  
  export const drawGrid = (ctx, width, height) => {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    
    // Draw horizontal grid lines
    const numHLines = 5;
    for (let i = 0; i <= numHLines; i++) {
      const y = (i / numHLines) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw vertical grid lines
    const numVLines = 10;
    for (let i = 0; i <= numVLines; i++) {
      const x = (i / numVLines) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  };
  
  export const drawDateAxis = (ctx, dateRange, width, height) => {
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] || 
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      // Draw a generic axis if no valid date range is provided
      ctx.fillStyle = '#333';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      
      const numLabels = 10;
      for (let i = 0; i <= numLabels; i++) {
        const x = (i / numLabels) * width;
        ctx.fillText(`Point ${i}`, x, height - 5);
      }
      return;
    }
    
    const [startDate, endDate] = dateRange;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    // Draw date labels
    const numLabels = Math.min(10, Math.floor(width / 80)); // Ensure labels don't overlap
    for (let i = 0; i <= numLabels; i++) {
      const x = (i / numLabels) * width;
      const ms = (i / numLabels) * totalMs;
      const date = new Date(startDate.getTime() + ms);
      
      // Format date as YYYY-MM-DD. Dates here are UTC-faked exchange wall clock (utils/dates.js,
      // decision 0.18), so toISOString() yields the exchange calendar day in every browser zone.
      const dateString = date.toISOString().split('T')[0];

      // Edge labels are anchored inward: centred on x=0 / x=width they were half cut off.
      ctx.textAlign = i === 0 ? 'left' : i === numLabels ? 'right' : 'center';
      const labelX = i === 0 ? 2 : i === numLabels ? width - 2 : x;
      // Light backing so the dates stay legible over bars / lines running along the bottom
      const textWidth = ctx.measureText(dateString).width;
      const boxLeft = i === 0 ? labelX : i === numLabels ? labelX - textWidth : labelX - textWidth / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(boxLeft - 2, height - 14, textWidth + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(dateString, labelX, height - 5);
    }
    ctx.textAlign = 'center';
  };

  // Height reserved at the bottom of every pane for the date axis labels (see drawDateAxis).
  export const DATE_AXIS_BAND = 18;
  const VALUE_LABEL_X = 18; // right of the rotated axis title centred at x=8
  const MIN_LABEL_GAP = 12;

  /**
   * Shared value-axis renderer for the price / trade-PnL / indicator / cumulative panes.
   * Labels are left-aligned just right of the rotated axis title (they used to be right-aligned
   * at x=40 and ran into it), kept inside the canvas vertically (the top one was clipped), kept
   * clear of the date-axis band (the bottom one collided with the first date), and drawn on a
   * light backing so they stay readable over candles/bars.
   */
  const drawValueAxis = (ctx, min, max, height, axisTitle, format = (v) => v.toFixed(2)) => {
    ctx.save();
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const numLabels = height < 120 ? 4 : 5; // short panes: fewer, less crowded labels
    const top = 7;
    const bottom = height - DATE_AXIS_BAND - 6;
    let lastY = -Infinity;
    for (let i = numLabels; i >= 0; i--) { // top-down so the gap check keeps the upper labels
      const rawY = height - (i / numLabels) * height;
      const y = Math.min(bottom, Math.max(top, rawY));
      if (y - lastY < MIN_LABEL_GAP) continue;
      lastY = y;
      const text = format(min + (i / numLabels) * (max - min));
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(VALUE_LABEL_X - 2, y - 6, textWidth + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, VALUE_LABEL_X, y);
    }

    if (axisTitle) {
      ctx.translate(8, (height - DATE_AXIS_BAND) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#555';
      ctx.fillText(axisTitle, 0, 0);
    }
    ctx.restore();
  };
  
  export const drawPriceAxis = (ctx, minMax, width, height) => {
    drawValueAxis(ctx, minMax.min, minMax.max, height, 'Price');
  };
  
  export const drawPnLAxis = (ctx, minMax, width, height, axisTitle = 'Trade PnL') => {
    const { min, max } = minMax;
    // Zero line first so the labels' backing sits on top of it
    const zeroY = height - ((0 - min) / (max - min)) * height;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();

    drawValueAxis(ctx, min, max, height, axisTitle);
  };
  
  export const drawIndicatorAxis = (ctx, minMax, width, height, indicatorName) => {
    drawValueAxis(ctx, minMax.min, minMax.max, height, indicatorName);
  };
  
  // Helper functions for drawing shapes
  export const drawUpTriangle = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size); // Top point
    ctx.lineTo(x - size, y + size); // Bottom left
    ctx.lineTo(x + size, y + size); // Bottom right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  
  export const drawDownTriangle = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y + size); // Bottom point
    ctx.lineTo(x - size, y - size); // Top left
    ctx.lineTo(x + size, y - size); // Top right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  
  export const drawCircle = (ctx, x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  
  // Chart element drawing functions. Callers pass the plot range (see plotDateRange) as dateRange.
  export const drawPriceCandlesticks = (ctx, prices, dateRange, minMax, width, height, candleWidth) => {
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] || 
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }
    
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    // Default candle width if not provided
    const defaultCandleWidth = Math.min(
      width / prices.length * 0.8, // Maximum width as percentage of available space per price point
      15 // Hard maximum pixel width
    );
    
    // Use provided candle width or fall back to default
    const actualCandleWidth = candleWidth || defaultCandleWidth;
    
    // Filter to only show prices within the date range
    const visiblePrices = prices.filter(price => {
      const priceDate = parseExchangeTs(price.date);
      return priceDate >= startDate && priceDate <= endDate;
    });
    
    visiblePrices.forEach((price) => {
      const date = parseExchangeTs(price.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      
      // Calculate y coordinates for the price components
      const openY = height - ((price.open - min) / (max - min)) * height;
      const highY = height - ((price.high - min) / (max - min)) * height;
      const lowY = height - ((price.low - min) / (max - min)) * height;
      const closeY = height - ((price.close - min) / (max - min)) * height;
      
      // Determine if it's an up or down candle
      const isUp = price.close >= price.open;
      
      // Set colors based on candle direction
      if (isUp) {
        ctx.strokeStyle = '#22c55e'; // Green for up candles
        ctx.fillStyle = 'rgba(34, 197, 94, 0.5)'; // Semi-transparent green
      } else {
        ctx.strokeStyle = '#ef4444'; // Red for down candles
        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; // Semi-transparent red
      }
      
      // Draw the high-low wick (vertical line)
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // Draw the body (rectangle) for open-close
      const candleHeight = Math.abs(closeY - openY);
      const yStart = isUp ? closeY : openY;
      
      // Draw rectangle with minimum height of 1px
      ctx.fillRect(
        x - actualCandleWidth / 2, 
        yStart, 
        actualCandleWidth, 
        Math.max(candleHeight, 1)
      );
      
      // Draw outline
      ctx.strokeRect(
        x - actualCandleWidth / 2, 
        yStart, 
        actualCandleWidth, 
        Math.max(candleHeight, 1)
      );
    });
  };
  
  export const drawIndicatorLine = (ctx, indicators, dateRange, minMax, width, height, color = 'purple') => {
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] || 
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }
    
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // NaN / non-numeric values break the polyline rather than drawing a bogus segment.
    let started = false;
    indicators.forEach((indicator) => {
      if (typeof indicator.value !== 'number' || Number.isNaN(indicator.value)) {
        started = false;
        return;
      }
      const date = parseExchangeTs(indicator.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      const y = height - ((indicator.value - min) / (max - min)) * height;
      
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  };

  /**
   * Draws price-axis indicator overlays (moving averages, bands, ...) on the price chart, using
   * exactly the same x/y mapping as drawChannels / drawPriceCandlesticks so the lines sit on the
   * candles they belong to.
   *
   * `minMax` is deliberately NOT widened by the overlays: the price axis stays candle-driven, so
   * a series that leaves the candle range (e.g. a wide Bollinger band) clips at the canvas edge.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object<string, Array<{date: string, value: number}>>} priceIndicators - the DTO map
   * @param {Array<{name: string, color: string, stepped?: boolean}>} series - the visible price-kind
   *   series; `stepped` ones (indicatorSeries.js SERIES_STYLE) draw as a step-after line
   * @param {[Date, Date]} dateRange
   * @param {{min: number, max: number}} minMax - the candle-derived price range
   * @param {number} width
   * @param {number} height
   */
  export const drawPriceOverlays = (ctx, priceIndicators, series, dateRange, minMax, width, height) => {
    if (!priceIndicators || !series || series.length === 0) return;
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] ||
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }

    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    if (totalMs <= 0 || max === min) return;
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    const toXY = (ms, value) => ({
      x: ((ms - startMs) / totalMs) * width,
      y: height - ((value - min) / (max - min)) * height,
    });

    series.forEach(entry => {
      const points = priceIndicators[entry.name];
      if (!points || points.length === 0) return;

      // Keep the points inside dateRange plus one point of overhang on each side so the line
      // runs to the canvas edges instead of stopping at the first/last visible bar.
      let firstVisible = -1;
      let lastVisible = -1;
      const timestamps = points.map(point => parseExchangeTs(point.date).getTime());
      for (let i = 0; i < points.length; i++) {
        const ms = timestamps[i];
        if (ms >= startMs && ms <= endMs) {
          if (firstVisible === -1) firstVisible = i;
          lastVisible = i;
        }
      }
      if (firstVisible === -1) return; // nothing of this series in view
      const from = Math.max(0, firstVisible - 1);
      const to = Math.min(points.length - 1, lastVisible + 1);

      ctx.save();
      ctx.strokeStyle = entry.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      let prevY = 0;
      for (let i = from; i <= to; i++) {
        const value = points[i].value;
        if (typeof value !== 'number' || Number.isNaN(value) || Number.isNaN(timestamps[i])) {
          started = false; // break the line across gaps
          continue;
        }
        const { x, y } = toXY(timestamps[i], value);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else if (entry.stepped) {
          // Step-after: hold the previous value up to this bar, then jump (horizontal, then vertical)
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        prevY = y;
      }
      ctx.stroke();
      ctx.restore();
    });
  };
  
  // Identifies a signal for the {@link signalTradeIndex}/click-hit-testing maps - date+type+price
  // is specific enough that two distinct signals should never collide.
  export const signalKey = (signal) => `${signal.date}|${signal.type}|${signal.price}`;

  /**
   * Pairs LongOpen/LongClose and ShortOpen/ShortClose signals chronologically into trades and
   * assigns each a 0-based tradeIndex - closed trades first, in the order they closed, then any
   * still-open trade last. Mirrors the backend's own tradeIndex assignment (see
   * CausalChannelBreakoutStrategy.buildInvolvedChannels: closedTradeRefs appended in chronological
   * close order, then openTradeRefs), which is safe to rely on exactly because both sides share
   * the same "one open position at a time" invariant that strategy is built on - relevant since
   * this mapping is what lets a clicked signal find its own channels even when they're dated far
   * from the signal itself (see the walk-forward "entry backlog" behavior).
   * Returns a Map from {@link signalKey} to tradeIndex.
   */
  export const deriveSignalTradeIndex = (signals) => {
    const map = new Map();
    const sorted = [...(signals || [])].sort((a, b) => parseExchangeTs(a.date) - parseExchangeTs(b.date));
    const openSignals = {}; // 'Long' | 'Short' -> signal
    const trades = []; // {open, close|null}, in the order each trade closed

    sorted.forEach(signal => {
      if (signal.type === 'LongOpen' || signal.type === 'ShortOpen') {
        openSignals[signal.type === 'LongOpen' ? 'Long' : 'Short'] = signal;
      } else if (signal.type === 'LongClose' || signal.type === 'ShortClose') {
        const key = signal.type === 'LongClose' ? 'Long' : 'Short';
        const open = openSignals[key];
        if (open) {
          trades.push({ open, close: signal });
          delete openSignals[key];
        }
      }
    });
    // Still-open trade(s) at the end - at most one, per the invariant above - come last.
    Object.values(openSignals).forEach(open => trades.push({ open, close: null }));

    trades.forEach((trade, tradeIndex) => {
      map.set(signalKey(trade.open), tradeIndex);
      if (trade.close) map.set(signalKey(trade.close), tradeIndex);
    });

    return map;
  };

  // Short signal markers: stroke-only triangles, a little larger than the filled 7px long ones.
  const SHORT_MARKER_SIZE = 9;

  const traceUpTriangle = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
  };

  const traceDownTriangle = (ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y + size);
    ctx.lineTo(x - size, y - size);
    ctx.lineTo(x + size, y - size);
    ctx.closePath();
  };

  const strokeShortMarker = (ctx, color, trace) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    trace();
    ctx.stroke();
    ctx.restore();
  };

  export const drawSignals = (
    ctx, signals, dateRange, minMax, width, height, highlightTradeIndex = null, signalTradeIndex = null
  ) => {
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] ||
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }

    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();

    signals.forEach(signal => {
      const date = parseExchangeTs(signal.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      const y = height - ((signal.price - min) / (max - min)) * height;

      // Halo behind the selected trade's own signal markers - confirms what got clicked, since
      // its channels can sit far away in time (see drawChannels' highlightTradeIndex).
      if (highlightTradeIndex !== null && signalTradeIndex?.get(signalKey(signal)) === highlightTradeIndex) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 210, 0, 0.35)';
        ctx.strokeStyle = 'rgba(180, 140, 0, 0.9)';
        ctx.lineWidth = 1.5;
        drawCircle(ctx, x, y, 11);
        ctx.restore();
      }

      // Set color based on signal type
      if (signal.type === 'LongOpen') {
        ctx.fillStyle = 'green';
        drawUpTriangle(ctx, x, y, 7); // Up triangle for open signals
      } else if (signal.type === 'LongClose') {
        ctx.fillStyle = 'red';
        drawDownTriangle(ctx, x, y, 7); // Down triangle for close signals
      } else if (signal.type === 'ShortOpen') {
        // Sell to open: down triangle. Short markers are outlined and larger than the filled long
        // ones, so on a reversal bar (LongClose + ShortOpen at the same date/price) both stay
        // visible - the outline rings the filled marker - and the hit-test point is unchanged.
        strokeShortMarker(ctx, 'blue', () => traceDownTriangle(ctx, x, y, SHORT_MARKER_SIZE));
      } else if (signal.type === 'ShortClose') {
        // Buy to cover: up triangle (rings a same-point LongOpen on a short->long reversal).
        strokeShortMarker(ctx, 'orange', () => traceUpTriangle(ctx, x, y, SHORT_MARKER_SIZE));
      } else {
        // Default for unknown signal types
        ctx.fillStyle = 'gray';
        drawCircle(ctx, x, y, 6);
      }
    });
  };
  
  // Validated categorical palette (light mode), fixed order - see the dataviz skill's
  // references/palette.md. Colors a trade's parent/entryChild/resumptionLeg trio together so
  // adjacent/overlapping trades' channels are visually distinguishable, instead of every channel
  // drawing in one indistinguishable blue. Cycles past 8 trades (acceptable here since trades are
  // temporally ordered and rarely visually adjacent that many apart, unlike a fixed-category
  // legend where reuse would be misleading).
  const CHANNEL_TRADE_PALETTE = [
    '#2a78d6', // blue
    '#eb6834', // orange
    '#1baf7a', // aqua
    '#eda100', // yellow
    '#e87ba4', // magenta
    '#008300', // green
    '#4a3aa7', // violet
    '#e34948', // red
  ];

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  export const colorForTradeIndex = (tradeIndex, alpha = 0.6) =>
    hexToRgba(CHANNEL_TRADE_PALETTE[tradeIndex % CHANNEL_TRADE_PALETTE.length], alpha);

  export const drawChannels = (ctx, channelGroups, dateRange, minMax, width, height, highlightTradeIndex = null) => {
    // Nothing selected - draw no channels at all. Channels only appear once a signal is clicked
    // (see ReporterStyleChart): with 20+ trades' worth of overlapping lines always on screen,
    // any one signal's actual explanation was impossible to pick out - clicking to reveal exactly
    // one trade's channels, and nothing else, is the whole point.
    if (highlightTradeIndex === null) return;

    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] ||
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }

    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();

    const toXY = (point) => {
      const date = parseExchangeTs(point.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      const y = height - ((point.price - min) / (max - min)) * height;
      return { x, y };
    };

    const drawPolyline = (points) => {
      if (!points || points.length === 0) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        const { x, y } = toXY(p);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    // Only the selected trade's own channel groups - backend sends {tradeIndex, role, channel};
    // tolerate a bare Channel too (older payload shape / other callers) via tradeIndex 0.
    (channelGroups || [])
      .map(group => ({ channel: group.channel ?? group, tradeIndex: group.channel ? group.tradeIndex : 0 }))
      .filter(({ tradeIndex }) => tradeIndex === highlightTradeIndex)
      .filter(({ channel }) => {
        // Skip channels entirely outside the visible date range - same filtering intent as
        // drawSignals' visibleSignals check, just applied to a span instead of a point.
        const channelStart = parseExchangeTs(channel.upperPoints?.[0]?.date ?? channel.startDate);
        const channelEnd = parseExchangeTs(channel.upperPoints?.[channel.upperPoints.length - 1]?.date ?? channel.endDate);
        return !(channelEnd < startDate || channelStart > endDate);
      })
      .forEach(({ channel, tradeIndex }) => {
        ctx.strokeStyle = colorForTradeIndex(tradeIndex, 0.85);
        ctx.lineWidth = 2.5;
        drawPolyline(channel.upperPoints);
        drawPolyline(channel.lowerPoints);
      });
  };

  // Level zone bands (LevelBreakoutRetest, see utils/levelZones.js). Strong zones get a medium
  // fill, weak ones a pale fill with no border; the zone the resistanceTrigger line comes from
  // (segment flag `trigger`, its tracker is ARMED) gets a dashed line along its upper edge - the
  // edge the trigger sits a buffer above. The edge is fuchsia and dashed so it does not read as
  // the (solid, palette-coloured) resistanceTrigger line drawn just above it: fuchsia is not in
  // the indicator palette (utils/indicatorSeries.js), nor a candle / signal colour.
  // Keep the swatches in ReporterStyleChart.css in sync.
  export const LEVEL_ZONE_STYLE = Object.freeze({
    strongFill: 'rgba(74, 58, 167, 0.26)', // violet, from the channel palette
    weakFill: 'rgba(74, 58, 167, 0.09)',
    armedEdge: 'rgba(192, 38, 211, 0.95)', // fuchsia
    armedEdgeWidth: 2,
    armedEdgeDash: [6, 4],
  });

  /**
   * Draws level zone runs as horizontal bands, one fillRect per run (consecutive bars showing the
   * same zone segment are already merged by buildLevelZoneRuns). Same x/y mapping as
   * drawChannels / drawPriceOverlays; drawn under the candles so they stay readable.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{low, high, strong, outlined, startMs, endMs}>} runs - from buildLevelZoneRuns
   * @param {[Date, Date]} dateRange - the plot range
   * @param {{min: number, max: number}} minMax - the candle-derived price range
   * @param {number} width
   * @param {number} height
   */
  export const drawLevelZones = (ctx, runs, dateRange, minMax, width, height) => {
    if (!runs || runs.length === 0) return;
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] ||
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }

    const startMs = dateRange[0].getTime();
    const endMs = dateRange[1].getTime();
    const totalMs = endMs - startMs;
    const { min, max } = minMax;
    if (totalMs <= 0 || max === min) return;

    const xOf = (ms) => ((ms - startMs) / totalMs) * width;
    const yOf = (price) => height - ((price - min) / (max - min)) * height;

    // Weak under strong, the outlined trigger zone on top.
    const rank = (run) => (run.outlined ? 2 : run.strong ? 1 : 0);
    const visible = runs
      .filter(run => run.endMs >= startMs && run.startMs <= endMs && run.high >= min && run.low <= max)
      .sort((a, b) => rank(a) - rank(b));

    ctx.save();
    visible.forEach(run => {
      const x0 = Math.max(0, xOf(run.startMs));
      const x1 = Math.min(width, xOf(run.endMs));
      if (x1 <= x0) return;
      const yTop = yOf(run.high);
      const yBottom = yOf(run.low);
      ctx.fillStyle = run.strong ? LEVEL_ZONE_STYLE.strongFill : LEVEL_ZONE_STYLE.weakFill;
      ctx.fillRect(x0, yTop, x1 - x0, Math.max(1, yBottom - yTop));
      if (run.outlined) {
        ctx.strokeStyle = LEVEL_ZONE_STYLE.armedEdge;
        ctx.lineWidth = LEVEL_ZONE_STYLE.armedEdgeWidth;
        ctx.setLineDash(LEVEL_ZONE_STYLE.armedEdgeDash);
        ctx.beginPath();
        ctx.moveTo(x0, yTop);
        ctx.lineTo(x1, yTop);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.restore();
  };

  export const drawIndividualTradeBars = (ctx, trades, dateRange, minMax, width, height) => {
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] || 
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }
    
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    const zeroY = height - ((0 - min) / (max - min)) * height;
    
    // Draw individual trade bars
    trades.forEach(trade => {
      // Ensure trade dates are properly processed as Date objects
      const openDate = trade.openDate instanceof Date ? trade.openDate : parseExchangeTs(trade.openDate);
      const closeDate = trade.closeDate instanceof Date ? trade.closeDate : parseExchangeTs(trade.closeDate);
      
      // Calculate x positions for open and close dates
      const openX = ((openDate.getTime() - startDate.getTime()) / totalMs) * width;
      const closeX = ((closeDate.getTime() - startDate.getTime()) / totalMs) * width;
      
      // Bar width spans from open to close
      const barWidth = closeX - openX;
      
      // Bar height depends on PnL
      const barHeight = Math.abs(((trade.pnl - 0) / (max - min)) * height);
      
      // Position from zero line
      const y = trade.pnl >= 0 ? zeroY - barHeight : zeroY;
      
      // Draw bar
      ctx.fillStyle = trade.pnl >= 0 ? 'rgba(0, 128, 0, 0.4)' : 'rgba(255, 0, 0, 0.4)';
      ctx.fillRect(openX, y, barWidth, barHeight);
      
      // Draw outline
      ctx.strokeStyle = trade.pnl >= 0 ? 'rgba(0, 100, 0, 0.8)' : 'rgba(180, 0, 0, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(openX, y, barWidth, barHeight);
      
      // Add gradient for visual appeal
      const gradient = ctx.createLinearGradient(openX, y, closeX, y + barHeight);
      if (trade.pnl >= 0) {
        gradient.addColorStop(0, 'rgba(0, 128, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 128, 0, 0.5)');
      } else {
        gradient.addColorStop(0, 'rgba(255, 0, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0.5)');
      }
      
      // Apply gradient to draw a decorative overlay
      ctx.fillStyle = gradient;
      ctx.fillRect(openX, y, barWidth, barHeight);
      
      // Draw a small label if the bar is wide enough
      if (barWidth > 30) {
        ctx.fillStyle = '#000';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        // Position text in middle of bar
        ctx.fillText(trade.pnl.toFixed(2), openX + barWidth / 2, y + barHeight / 2 + 3);
      }
    });
  };

  /**
   * Symmetric-ish value range for the cumulative PnL pane: always includes zero, 10% padding.
   * @param {number[]} values
   */
  export const findMinMaxCumulative = (values) => {
    let min = 0;
    let max = 0;
    (values || []).forEach(v => {
      if (v < min) min = v;
      if (v > max) max = v;
    });
    if (min === max) return { min: -1, max: 1 };
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  };

  /**
   * Realized cumulative PnL as a step line (value changes on each trade's close bar) with a
   * green/red fill against zero. Uses the same time->x mapping as every other pane.
   * @param {Array<{date: Date, value: number}>} points - one per bar, ascending
   */
  export const drawCumulativePnLLine = (ctx, points, dateRange, minMax, width, height) => {
    if (!dateRange || !dateRange[0] || !dateRange[1] ||
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return;
    }
    if (!points || points.length === 0) return;
    const [startDate, endDate] = dateRange;
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const totalMs = endMs - startMs;
    const { min, max } = minMax;
    if (totalMs <= 0 || max === min) return;

    // Visible bars plus one of overhang each side so the line reaches the canvas edges.
    let from = points.findIndex(p => p.date.getTime() >= startMs);
    if (from === -1) return;
    from = Math.max(0, from - 1);
    let to = from;
    while (to < points.length - 1 && points[to].date.getTime() <= endMs) to++;

    const xOf = (ms) => ((ms - startMs) / totalMs) * width;
    const yOf = (v) => height - ((v - min) / (max - min)) * height;
    const zeroY = yOf(0);

    // One step path, reused for the stroke and (closed down to zero) for the fill
    const line = new Path2D();
    const area = new Path2D();
    const firstX = xOf(points[from].date.getTime());
    area.moveTo(firstX, zeroY);
    let prevY = null;
    let lastX = firstX;
    for (let i = from; i <= to; i++) {
      const x = xOf(points[i].date.getTime());
      const y = yOf(points[i].value);
      if (prevY === null) {
        line.moveTo(x, y);
      } else {
        line.lineTo(x, prevY); // step: hold the previous total until this bar
        area.lineTo(x, prevY);
        line.lineTo(x, y);
      }
      area.lineTo(x, y);
      prevY = y;
      lastX = x;
    }
    area.lineTo(lastX, zeroY);
    area.closePath();

    ctx.save();
    // Fill between the curve and zero: green above, red below
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, zeroY);
    ctx.clip();
    ctx.fillStyle = 'rgba(0, 128, 0, 0.15)';
    ctx.fill(area);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, zeroY, width, height - zeroY);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
    ctx.fill(area);
    ctx.restore();

    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.stroke(line);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------------------------
  // LevelBreakoutRetest buy / sell annotations (chartData.levelChart, normalized by
  // utils/levelChart.js). Same x/y mapping as every other price-pane layer. Layer order is set by
  // PriceChart: shading -> level zones -> support segments -> setup windows -> candles ->
  // overlays -> window-end glyphs / "↑" / events -> signals -> marker labels.
  // Keep the legend swatches in ReporterStyleChart.css in sync with LEVEL_CHART_STYLE.
  // ---------------------------------------------------------------------------------------------
  export const LEVEL_CHART_STYLE = Object.freeze({
    positionFill: 'rgba(16, 185, 129, 0.07)',
    supportFill: 'rgba(44, 160, 44, 0.20)',
    supportEdge: 'rgba(21, 128, 61, 0.75)',
    retestBand: 'rgba(34, 197, 94, 0.16)',
    runawayLine: '#ff7f0e', // the Breakout line's orange, dashed
    runawayDash: [5, 4],
    failLine: 'rgba(220, 38, 38, 0.40)',
    glyphTraded: '#16a34a',
    glyphNotTraded: '#d97706',
    glyphFailed: '#dc2626',
    glyphMissed: '#6b7280',
    glyphDropped: '#6b7280',
    upgrade: '#15803d',
    labelBacking: 'rgba(255, 255, 255, 0.85)',
  });

  const EVENT_STYLE = Object.freeze({
    BROKEN_UP: { color: '#ea580c', label: 'BU' },
    FAILED: { color: '#dc2626', label: 'F' },
    MISSED_TIMEOUT: { color: '#6b7280', label: 'MT' },
    MISSED_DWELL: { color: '#6b7280', label: 'MD' },
    BROKEN_DOWN: { color: '#7c3aed', label: 'BD' },
  });

  /** x/y mapping for the price pane, or null when the range is unusable. */
  const priceMapper = (dateRange, minMax, width, height) => {
    if (!dateRange || !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date) || !minMax) return null;
    const startMs = dateRange[0].getTime();
    const endMs = dateRange[1].getTime();
    const totalMs = endMs - startMs;
    const { min, max } = minMax;
    if (!(totalMs > 0) || !(max > min)) return null;
    return {
      startMs,
      endMs,
      xOf: (ms) => ((ms - startMs) / totalMs) * width,
      yOf: (price) => height - ((price - min) / (max - min)) * height,
    };
  };

  /**
   * Very light background from each trade's entry bar to its exit bar (open trade: last bar).
   * @param {Array<{startMs, endMs}>} spans - levelChart.positionSpans
   */
  export const drawPositionShading = (ctx, spans, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !spans || spans.length === 0) return;
    ctx.save();
    ctx.fillStyle = LEVEL_CHART_STYLE.positionFill;
    spans.forEach(span => {
      if (span.endMs < map.startMs || span.startMs > map.endMs) return;
      const x0 = Math.max(0, map.xOf(span.startMs));
      const x1 = Math.min(width, map.xOf(span.endMs));
      if (x1 > x0) ctx.fillRect(x0, 0, x1 - x0, height);
    });
    ctx.restore();
  };

  /**
   * The sticky support zone the Support line hangs from, one band per segment, with its low edge
   * (the line hangs a buffer below it) drawn as a thin line.
   * @param {Array<{startMs, endMs, low, high}>} segments - levelChart.supportSegments
   */
  export const drawSupportSegments = (ctx, segments, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !segments || segments.length === 0) return;
    ctx.save();
    segments.forEach(seg => {
      if (seg.endMs < map.startMs || seg.startMs > map.endMs) return;
      const x0 = Math.max(0, map.xOf(seg.startMs));
      const x1 = Math.min(width, map.xOf(seg.endMs));
      if (x1 <= x0) return;
      const yTop = map.yOf(seg.high);
      const yBottom = map.yOf(seg.low);
      ctx.fillStyle = LEVEL_CHART_STYLE.supportFill;
      ctx.fillRect(x0, yTop, x1 - x0, Math.max(1, yBottom - yTop));
      ctx.strokeStyle = LEVEL_CHART_STYLE.supportEdge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, yBottom);
      ctx.lineTo(x1, yBottom);
      ctx.stroke();
    });
    ctx.restore();
  };

  /**
   * Setup windows (buy logic): per waiting bar, the retest band from the confirm line (or the zone
   * top while ConfirmMode 1 has no confirm line yet) up to the touch line; the dashed orange
   * runaway line only in the AWAIT phase (design n5: runaway is not checked once touched); the
   * faint fail line. Lines are drawn per bar slot and joined by a vertical step between adjacent
   * bars, so they read as stepped lines.
   * @param {Array} windows - levelChart.windows
   * @param {number[]} slotLeft - levelChart.slotLeft (ms)
   * @param {number[]} slotRight - levelChart.slotRight (ms)
   */
  export const drawSetupWindows = (ctx, windows, slotLeft, slotRight, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !windows || windows.length === 0) return;

    const strokeSteps = (points, valueOf, style, dash) => {
      ctx.strokeStyle = style;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      let prev = null; // {barIndex, y}
      points.forEach(point => {
        const value = valueOf(point);
        if (!Number.isFinite(value)) { prev = null; return; }
        const x0 = map.xOf(slotLeft[point.barIndex]);
        const x1 = map.xOf(slotRight[point.barIndex]);
        const y = map.yOf(value);
        if (prev && prev.barIndex === point.barIndex - 1) {
          ctx.lineTo(x0, prev.y);
          ctx.lineTo(x0, y);
        } else {
          ctx.moveTo(x0, y);
        }
        ctx.lineTo(x1, y);
        prev = { barIndex: point.barIndex, y };
      });
      ctx.stroke();
    };

    ctx.save();
    windows.forEach(win => {
      const points = win.points;
      if (points.length === 0) return;
      const firstMs = slotLeft[points[0].barIndex];
      const lastMs = slotRight[points[points.length - 1].barIndex];
      if (lastMs < map.startMs || firstMs > map.endMs) return;

      // Retest band
      ctx.fillStyle = LEVEL_CHART_STYLE.retestBand;
      points.forEach(point => {
        const top = point.touchLine;
        const bottom = Number.isFinite(point.confirmLine) ? point.confirmLine : win.zoneHigh;
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
        const x0 = Math.max(0, map.xOf(slotLeft[point.barIndex]));
        const x1 = Math.min(width, map.xOf(slotRight[point.barIndex]));
        if (x1 <= x0) return;
        const yTop = map.yOf(Math.max(top, bottom));
        const yBottom = map.yOf(Math.min(top, bottom));
        ctx.fillRect(x0, yTop, x1 - x0, Math.max(1, yBottom - yTop));
      });

      ctx.lineWidth = 1;
      strokeSteps(points, point => point.failLine, LEVEL_CHART_STYLE.failLine);
      ctx.lineWidth = 1.5;
      strokeSteps(
        points,
        point => (point.phase === 'AWAIT' ? point.runawayLine : NaN),
        LEVEL_CHART_STYLE.runawayLine,
        LEVEL_CHART_STYLE.runawayDash
      );
    });
    ctx.setLineDash([]);
    ctx.restore();
  };

  /** Radius of a window-end glyph, px. */
  export const WINDOW_GLYPH_R = 4;

  /** Where a window-end glyph sits: the end bar, on the zone's top edge. Null for OPEN windows. */
  export const windowGlyphPoint = (win, barTimes) => {
    if (!win || win.endIndex === -1 || !Number.isFinite(win.zoneHigh)) return null;
    return { ms: barTimes[win.endIndex], price: win.zoneHigh };
  };

  /**
   * Glyph at the bar each setup window ended, on the zone's top edge. The shape carries the
   * outcome: filled circle = confirmed (green traded, amber not traded), × = FAILED, hollow
   * circle = MISSED_*, short dash = DROPPED. OPEN windows have no end and no glyph.
   */
  export const drawWindowEndGlyphs = (ctx, windows, barTimes, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !windows || windows.length === 0) return;
    const r = WINDOW_GLYPH_R;
    ctx.save();
    windows.forEach(win => {
      const at = windowGlyphPoint(win, barTimes);
      if (!at || at.ms < map.startMs || at.ms > map.endMs) return;
      const x = map.xOf(at.ms);
      const y = map.yOf(at.price);
      const outcome = win.outcome || '';
      ctx.beginPath();
      if (outcome.startsWith('CONFIRMED')) {
        ctx.lineWidth = 1.5;
        ctx.fillStyle = win.traded ? LEVEL_CHART_STYLE.glyphTraded : LEVEL_CHART_STYLE.glyphNotTraded;
        ctx.strokeStyle = 'white';
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (outcome === 'FAILED') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = LEVEL_CHART_STYLE.glyphFailed;
        ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
        ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
        ctx.stroke();
      } else if (outcome.startsWith('MISSED')) {
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = LEVEL_CHART_STYLE.glyphMissed;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (outcome === 'DROPPED') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = LEVEL_CHART_STYLE.glyphDropped;
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.stroke();
      }
    });
    ctx.restore();
  };

  /** Horizontal gap, px, between the stepped Exit line's vertical riser and the "↑" glyph. */
  const UPGRADE_GLYPH_DX = 4;

  /**
   * Small "↑" on each ratchet (support upgrade) bar, just under the new exit level and to the
   * RIGHT of the bar's x: the stepped Exit line rises exactly at that x, so a glyph centred there
   * would sit on the riser and disappear (review F1).
   */
  export const drawUpgradeMarkers = (ctx, upgrades, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !upgrades || upgrades.length === 0) return;
    ctx.save();
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = LEVEL_CHART_STYLE.upgrade;
    upgrades.forEach(upgrade => {
      if (upgrade.ms < map.startMs || upgrade.ms > map.endMs) return;
      ctx.fillText('↑', map.xOf(upgrade.ms) + UPGRADE_GLYPH_DX, map.yOf(upgrade.newExitLine) + 1);
    });
    ctx.restore();
  };

  /** Event markers (off by default): a small diamond at the bar's close with a short code above it. */
  export const drawEventMarkers = (ctx, events, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !events || events.length === 0) return;
    ctx.save();
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 1;
    const s = 3.5;
    events.forEach(event => {
      if (event.ms < map.startMs || event.ms > map.endMs) return;
      const style = EVENT_STYLE[event.type] || { color: '#6b7280', label: '?' };
      const x = map.xOf(event.ms);
      const y = map.yOf(event.price);
      ctx.fillStyle = style.color;
      ctx.strokeStyle = 'white';
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillText(style.label, x, y - s - 1);
    });
    ctx.restore();
  };

  /** Height of a marker label's backing box, px; also the one vertical offset step (§4.4). */
  const MARKER_LABEL_BOX_H = 12;

  const boxesOverlap = (a, b) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  /**
   * Text labels on the entry / exit markers that matched a level trade (§4.4-4.5): entry labels
   * under the up-triangle, exit labels above the down-triangle, on a light backing. The caller
   * applies the MARKER_LABEL_LIMIT rule and passes only the matched markers.
   *
   * Collisions (§4.4): each label's box is tested against the labels already drawn in this frame.
   * On overlap it tries once more one step further from its marker (down for entry labels, up for
   * exit labels); if that still overlaps, the label is skipped. Tooltips are unaffected.
   * @param {Array<{signal, label: string, role: 'entry'|'exit'}>} labelled
   */
  export const drawMarkerLabels = (ctx, labelled, dateRange, minMax, width, height) => {
    const map = priceMapper(dateRange, minMax, width, height);
    if (!map || !labelled || labelled.length === 0) return;
    ctx.save();
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    const placed = [];
    labelled.forEach(({ signal, label, role }) => {
      if (!label) return;
      const x = map.xOf(parseExchangeTs(signal.date).getTime());
      const y = map.yOf(signal.price);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const below = role === 'entry';
      const w = ctx.measureText(label).width;
      // Box of the label for a given vertical offset step (0 = default, 1 = one step further away)
      const boxAt = (step) => {
        const shift = step * MARKER_LABEL_BOX_H;
        const textY = below ? y + 10 + shift : y - 10 - shift; // clear of the 7px triangle
        const y0 = below ? textY - 1 : textY - 11;
        return { textY, x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0, y1: y0 + MARKER_LABEL_BOX_H };
      };
      const box = [boxAt(0), boxAt(1)].find(candidate => !placed.some(other => boxesOverlap(candidate, other)));
      if (!box) return; // still colliding after one step: skip this label
      placed.push(box);
      ctx.textBaseline = below ? 'top' : 'bottom';
      ctx.fillStyle = LEVEL_CHART_STYLE.labelBacking;
      ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, MARKER_LABEL_BOX_H);
      ctx.fillStyle = below ? '#166534' : '#991b1b';
      ctx.fillText(label, x, box.textY);
    });
    ctx.restore();
  };
