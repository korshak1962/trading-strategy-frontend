// src/utils/ChartDrawingUtils.js

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
      
      // Format date as YYYY-MM-DD
      const dateString = date.toISOString().split('T')[0];
      
      ctx.fillText(dateString, x, height - 5);
    }
  };
  
  export const drawPriceAxis = (ctx, minMax, width, height) => {
    const { min, max } = minMax;
    
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    
    // Draw price labels
    const numLabels = 5;
    for (let i = 0; i <= numLabels; i++) {
      const y = height - (i / numLabels) * height;
      const price = min + (i / numLabels) * (max - min);
      
      ctx.fillText(price.toFixed(2), 40, y);
    }
    
    // Draw axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Price', 0, 0);
    ctx.restore();
  };
  
  export const drawPnLAxis = (ctx, minMax, width, height) => {
    const { min, max } = minMax;
    
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    
    // Draw PnL labels
    const numLabels = 5;
    for (let i = 0; i <= numLabels; i++) {
      const y = height - (i / numLabels) * height;
      const pnl = min + (i / numLabels) * (max - min);
      
      ctx.fillText(pnl.toFixed(2), 40, y);
    }
    
    // Draw zero line
    const zeroY = height - ((0 - min) / (max - min)) * height;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    
    // Draw axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#333';
    ctx.fillText('Trade PnL', 0, 0);
    ctx.restore();
  };
  
  export const drawIndicatorAxis = (ctx, minMax, width, height, indicatorName) => {
    const { min, max } = minMax;
    
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    
    // Draw indicator labels
    const numLabels = 5;
    for (let i = 0; i <= numLabels; i++) {
      const y = height - (i / numLabels) * height;
      const value = min + (i / numLabels) * (max - min);
      
      ctx.fillText(value.toFixed(2), 40, y);
    }
    
    // Draw axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(indicatorName, 0, 0);
    ctx.restore();
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
  
  // Chart element drawing functions
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
      const priceDate = new Date(price.date);
      return priceDate >= startDate && priceDate <= endDate;
    });
    
    visiblePrices.forEach((price) => {
      const date = new Date(price.date);
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
  
  export const drawIndicatorLine = (ctx, indicators, dateRange, minMax, width, height) => {
    // Guard against undefined or incomplete dateRange
    if (!dateRange || !dateRange[0] || !dateRange[1] || 
        !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
      return; // Skip drawing if no valid date range
    }
    
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    ctx.strokeStyle = 'purple';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    indicators.forEach((indicator, i) => {
      const date = new Date(indicator.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      const y = height - ((indicator.value - min) / (max - min)) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
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
    const sorted = [...(signals || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
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
      const date = new Date(signal.date);
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
        ctx.fillStyle = 'blue';
        drawUpTriangle(ctx, x, y, 7); // Up triangle for open signals
      } else if (signal.type === 'ShortClose') {
        ctx.fillStyle = 'orange';
        drawDownTriangle(ctx, x, y, 7); // Down triangle for close signals
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
      const date = new Date(point.date);
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
        const channelStart = new Date(channel.upperPoints?.[0]?.date ?? channel.startDate);
        const channelEnd = new Date(channel.upperPoints?.[channel.upperPoints.length - 1]?.date ?? channel.endDate);
        return !(channelEnd < startDate || channelStart > endDate);
      })
      .forEach(({ channel, tradeIndex }) => {
        ctx.strokeStyle = colorForTradeIndex(tradeIndex, 0.85);
        ctx.lineWidth = 2.5;
        drawPolyline(channel.upperPoints);
        drawPolyline(channel.lowerPoints);
      });
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
      const openDate = trade.openDate instanceof Date ? trade.openDate : new Date(trade.openDate);
      const closeDate = trade.closeDate instanceof Date ? trade.closeDate : new Date(trade.closeDate);
      
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