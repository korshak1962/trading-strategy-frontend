// src/utils/ChartDrawingUtils.js

/**
 * Filters data points to only include those within the visible date range
 * @param {Array} data - Array of data points with date property
 * @param {Array} dateRange - [startDate, endDate] date range
 * @returns {Array} Filtered data
 */
export const filterDataByDateRange = (data, dateRange) => {
  if (!data || data.length === 0 || !dateRange || !dateRange[0] || !dateRange[1]) {
    return data;
  }
  
  // Ensure the date range is in the correct order (start before end)
  const [rangeStart, rangeEnd] = dateRange[0] <= dateRange[1] 
    ? [dateRange[0], dateRange[1]] 
    : [dateRange[1], dateRange[0]];
  
  const startTime = rangeStart.getTime();
  const endTime = rangeEnd.getTime();
  
  return data.filter(item => {
    const itemDate = new Date(item.date);
    const itemTime = itemDate.getTime();
    return itemTime >= startTime && itemTime <= endTime;
  });
};

// Helper functions for finding min/max values
export const findMinMaxPriceRange = (prices, dateRange) => {
  if (!prices || prices.length === 0) return { min: 0, max: 100 };
  
  // Filter prices if dateRange is provided
  let visiblePrices = prices;
  if (dateRange && dateRange[0] && dateRange[1]) {
    // Ensure the date range is in the correct order
    const [rangeStart, rangeEnd] = dateRange[0] <= dateRange[1] 
      ? [dateRange[0], dateRange[1]] 
      : [dateRange[1], dateRange[0]];
      
    visiblePrices = prices.filter(price => {
      const priceDate = new Date(price.date);
      return priceDate >= rangeStart && priceDate <= rangeEnd;
    });
    
    // Fall back to all prices if no visible prices
    if (visiblePrices.length === 0) visiblePrices = prices;
  }
  
  let min = visiblePrices[0].low; // Start with low of first candle
  let max = visiblePrices[0].high; // Start with high of first candle
  
  visiblePrices.forEach(price => {
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
  
  // Ensure dates are in the correct order (start before end)
  const [startDate, endDate] = dateRange[0] <= dateRange[1] 
    ? [dateRange[0], dateRange[1]] 
    : [dateRange[1], dateRange[0]];
  
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
export const drawPriceCandlesticks = (ctx, prices, dateRange, minMax, width, height) => {
  // Guard against undefined or incomplete dateRange
  if (!dateRange || !dateRange[0] || !dateRange[1] || 
      !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
    return; // Skip drawing if no valid date range
  }
  
  // Ensure dates are in the correct order (start before end)
  const [startDate, endDate] = dateRange[0] <= dateRange[1] 
    ? [dateRange[0], dateRange[1]] 
    : [dateRange[1], dateRange[0]];
  
  const { min, max } = minMax;
  const totalMs = endDate.getTime() - startDate.getTime();
  
  // IMPORTANT: Filter prices to only include those in the visible date range
  const visiblePrices = prices.filter(price => {
    const priceDate = new Date(price.date);
    return priceDate >= startDate && priceDate <= endDate;
  });
  
  // Calculate appropriate candlestick width based on number of visible price points
  const candleWidth = Math.min(
    width / Math.max(visiblePrices.length, 1) * 0.8, // Maximum width as percentage of available space per price point
    15 // Hard maximum pixel width
  );
  
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
      ctx.fillStyle = 'rgba(34, 197, 94, 1)'; // Semi-transparent green
    } else {
      ctx.strokeStyle = '#ef4444'; // Red for down candles
      ctx.fillStyle = 'rgba(239, 68, 68, 1)'; // Semi-transparent red
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
      x - candleWidth / 2, 
      yStart, 
      candleWidth, 
      Math.max(candleHeight, 1)
    );
    
    // Draw outline
    ctx.strokeRect(
      x - candleWidth / 2, 
      yStart, 
      candleWidth, 
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
  
  // Ensure dates are in the correct order (start before end)
  const [startDate, endDate] = dateRange[0] <= dateRange[1] 
    ? [dateRange[0], dateRange[1]] 
    : [dateRange[1], dateRange[0]];
  
  const { min, max } = minMax;
  const totalMs = endDate.getTime() - startDate.getTime();
  
  // Filter indicators to only include those in the visible date range
  const visibleIndicators = indicators.filter(indicator => {
    const indicatorDate = new Date(indicator.date);
    return indicatorDate >= startDate && indicatorDate <= endDate;
  });
  
  // Don't draw if no visible indicators
  if (visibleIndicators.length === 0) return;
  
  ctx.strokeStyle = 'purple';
  ctx.lineWidth = 1;
  ctx.beginPath();
  
  visibleIndicators.forEach((indicator, i) => {
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

export const drawSignals = (ctx, signals, dateRange, minMax, width, height) => {
  // Guard against undefined or incomplete dateRange
  if (!dateRange || !dateRange[0] || !dateRange[1] || 
      !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
    return; // Skip drawing if no valid date range
  }
  
  // Ensure dates are in the correct order (start before end)
  const [startDate, endDate] = dateRange[0] <= dateRange[1] 
    ? [dateRange[0], dateRange[1]] 
    : [dateRange[1], dateRange[0]];
  
  const { min, max } = minMax;
  const totalMs = endDate.getTime() - startDate.getTime();
  
  // Filter signals to only include those in the visible date range
  const visibleSignals = signals.filter(signal => {
    const signalDate = new Date(signal.date);
    return signalDate >= startDate && signalDate <= endDate;
  });
  
  visibleSignals.forEach(signal => {
    const date = new Date(signal.date);
    const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
    const y = height - ((signal.price - min) / (max - min)) * height;
    
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

export const drawIndividualTradeBars = (ctx, trades, dateRange, minMax, width, height) => {
  // Guard against undefined or incomplete dateRange
  if (!dateRange || !dateRange[0] || !dateRange[1] || 
      !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
    return; // Skip drawing if no valid date range
  }
  
  // Ensure dates are in the correct order (start before end)
  const [startDate, endDate] = dateRange[0] <= dateRange[1] 
    ? [dateRange[0], dateRange[1]] 
    : [dateRange[1], dateRange[0]];
  
  const { min, max } = minMax;
  const totalMs = endDate.getTime() - startDate.getTime();
  
  // Filter trades to only include those within the date range
  const visibleTrades = trades.filter(trade => {
    const openDate = trade.openDate instanceof Date ? trade.openDate : new Date(trade.openDate);
    const closeDate = trade.closeDate instanceof Date ? trade.closeDate : new Date(trade.closeDate);
    // A trade is visible if its close date is within range
    // or if it overlaps with the range (opens before end and closes after start)
    return (closeDate >= startDate && closeDate <= endDate) || 
           (openDate <= endDate && closeDate >= startDate);
  });
  
  if (visibleTrades.length === 0) {
    drawNoDataMessage(ctx, width, height, "No trades in selected date range");
    return;
  }
  
  const zeroY = height - ((0 - min) / (max - min)) * height;
  
  // Draw individual trade bars
  visibleTrades.forEach(trade => {
    // Ensure trade dates are properly processed as Date objects
    const openDate = trade.openDate instanceof Date ? trade.openDate : new Date(trade.openDate);
    const closeDate = trade.closeDate instanceof Date ? trade.closeDate : new Date(trade.closeDate);
    
    // Handle trades that may start before the visible range
    const effectiveOpenDate = openDate < startDate ? startDate : openDate;
    const effectiveCloseDate = closeDate > endDate ? endDate : closeDate;
    
    // Calculate x positions for open and close dates
    const openX = ((effectiveOpenDate.getTime() - startDate.getTime()) / totalMs) * width;
    const closeX = ((effectiveCloseDate.getTime() - startDate.getTime()) / totalMs) * width;
    
    // Bar width spans from open to close
    const barWidth = Math.max(closeX - openX, 2); // Minimum width of 2px for visibility
    
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