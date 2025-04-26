// src/components/ReporterStyleChart.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import './ReporterStyleChart.css';

const ReporterStyleChart = ({ data, width = 1200, height = 600 }) => {
  const chartRef = useRef(null);
  const pnlChartRef = useRef(null);
  const indicatorChartRef = useRef(null);
  const containerRef = useRef(null);
  
  // State for crosshair position
  const [crosshairPosition, setCrosshairPosition] = useState({ x: 0, y: 0 });
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  
  // Store data for tooltip
  const chartData = useRef({
    prices: [],
    dateRange: [],
    canvasPositions: {}
  });

  // Define drawing helper functions using useCallback to fix dependency issues
  const findMinMaxPriceRange = useCallback((prices) => {
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
  }, []);

  const findMinMaxValuesForIndicator = useCallback((data) => {
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
  }, []);

  const findMinMaxTradeValues = useCallback((trades) => {
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
  }, []);

  const drawNoDataMessage = useCallback((ctx, width, height, message = "No data available") => {
    ctx.fillStyle = '#888';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  }, []);

  const drawGrid = useCallback((ctx, width, height) => {
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
  }, []);

  const drawDateAxis = useCallback((ctx, dateRange, width, height) => {
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
  }, []);

  const drawPriceAxis = useCallback((ctx, minMax, width, height) => {
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
  }, []);

  const drawPnLAxis = useCallback((ctx, minMax, width, height) => {
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
  }, []);

  const drawIndicatorAxis = useCallback((ctx, minMax, width, height, indicatorName) => {
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
  }, []);

  // New function to draw price candlesticks
  const drawPriceCandlesticks = useCallback((ctx, prices, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    // Calculate appropriate candlestick width based on number of price points
    const candleWidth = Math.min(
      width / prices.length * 0.8, // Maximum width as percentage of available space per price point
      15 // Hard maximum pixel width
    );
    
    prices.forEach((price) => {
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
  }, []);

  const drawIndicatorLine = useCallback((ctx, indicators, dateRange, minMax, width, height) => {
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
  }, []);

 // Helper functions for drawing shapes - define these before they're used in other functions
  const drawUpTriangle = useCallback((ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size); // Top point
    ctx.lineTo(x - size, y + size); // Bottom left
    ctx.lineTo(x + size, y + size); // Bottom right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, []);

  const drawDownTriangle = useCallback((ctx, x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y + size); // Bottom point
    ctx.lineTo(x - size, y - size); // Top left
    ctx.lineTo(x + size, y - size); // Top right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, []);

  const drawCircle = useCallback((ctx, x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, []);

  // Update the drawSignals function - move this after the shape functions
  const drawSignals = useCallback((ctx, signals, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    signals.forEach(signal => {
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
  }, [drawUpTriangle, drawDownTriangle, drawCircle]);

 

  const drawIndividualTradeBars = useCallback((ctx, trades, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    const zeroY = height - ((0 - min) / (max - min)) * height;
    
    // Draw individual trade bars
    trades.forEach(trade => {
      // Calculate x positions for open and close dates
      const openX = ((trade.openDate.getTime() - startDate.getTime()) / totalMs) * width;
      const closeX = ((trade.closeDate.getTime() - startDate.getTime()) / totalMs) * width;
      
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
  }, []);

  const extractTradesFromSignals = useCallback((signals) => {
    const extractedTrades = [];
    const openSignals = {};

    // Sort signals by date
    const sortedSignals = [...signals].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    sortedSignals.forEach(signal => {
      if (signal.type === 'LongOpen') {
        // Store open signal
        openSignals['Long'] = signal;
      } 
      else if (signal.type === 'LongClose' && openSignals['Long']) {
        // Create a trade
        const openSignal = openSignals['Long'];
        const profit = signal.price - openSignal.price;
        
        extractedTrades.push({
          type: 'Long',
          openDate: new Date(openSignal.date),
          closeDate: new Date(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit
        });
        
        // Clear open signal
        delete openSignals['Long'];
      }
      else if (signal.type === 'ShortOpen') {
        // Store open signal
        openSignals['Short'] = signal;
      }
      else if (signal.type === 'ShortClose' && openSignals['Short']) {
        // Create a trade
        const openSignal = openSignals['Short'];
        const profit = openSignal.price - signal.price; // Reversed for short
        
        extractedTrades.push({
          type: 'Short',
          openDate: new Date(openSignal.date),
          closeDate: new Date(signal.date),
          openPrice: openSignal.price,
          closePrice: signal.price,
          pnl: profit
        });
        
        // Clear open signal
        delete openSignals['Short'];
      }
    });

    return extractedTrades;
  }, []);

  useEffect(() => {
    // Store references to elements that will be used in the cleanup function
    const chartCanvasRef = chartRef.current;
    const pnlCanvasRef = pnlChartRef.current;
    const indicatorCanvasRef = indicatorChartRef.current;
    const containerElement = containerRef.current;
    
    if (!data || !chartCanvasRef || !pnlCanvasRef || !indicatorCanvasRef) return;

    // Use container width if available, otherwise use provided width
    const containerWidth = containerElement ? containerElement.clientWidth : width;
    const actualWidth = Math.min(containerWidth - 40, width); // Leave some margin
    
    // Set canvas dimensions
    chartCanvasRef.width = actualWidth;
    chartCanvasRef.height = height * 0.6;
    pnlCanvasRef.width = actualWidth;
    pnlCanvasRef.height = height * 0.2;
    indicatorCanvasRef.width = actualWidth;
    indicatorCanvasRef.height = height * 0.2;
    
    // Store canvas positions for crosshair calculations
    const chartRect = chartCanvasRef.getBoundingClientRect();
    const pnlRect = pnlCanvasRef.getBoundingClientRect();
    const indicatorRect = indicatorCanvasRef.getBoundingClientRect();
    
    chartData.current.canvasPositions = {
      chart: { top: chartRect.top, height: chartRect.height, left: chartRect.left, width: chartRect.width },
      pnl: { top: pnlRect.top, height: pnlRect.height, left: pnlRect.left, width: pnlRect.width },
      indicator: { top: indicatorRect.top, height: indicatorRect.height, left: indicatorRect.left, width: indicatorRect.width }
    };
    
    // Store prices for tooltip
    if (data.prices) {
      chartData.current.prices = data.prices.map(price => ({
        date: new Date(price.date),
        open: price.open,
        high: price.high,
        low: price.low,
        close: price.close,
        volume: price.volume
      }));
      
      if (data.prices.length > 0) {
        chartData.current.dateRange = [
          new Date(data.prices[0].date),
          new Date(data.prices[data.prices.length - 1].date)
        ];
      }
    }
    
    // Define drawChart function inside the useEffect
    const drawChartImpl = () => {
      // Get drawing contexts
      const chartCtx = chartCanvasRef.getContext('2d');
      const pnlCtx = pnlCanvasRef.getContext('2d');
      const indicatorCtx = indicatorCanvasRef.getContext('2d');
      
      // Clear canvases
      chartCtx.clearRect(0, 0, chartCanvasRef.width, chartCanvasRef.height);
      pnlCtx.clearRect(0, 0, pnlCanvasRef.width, pnlCanvasRef.height);
      indicatorCtx.clearRect(0, 0, indicatorCanvasRef.width, indicatorCanvasRef.height);
      
      if (!data.prices || data.prices.length === 0) {
        drawNoDataMessage(chartCtx, chartCanvasRef.width, chartCanvasRef.height);
        return;
      }
      
      // Extract and process data
      const prices = data.prices;
      const signals = data.signals || [];
      const indicators = data.indicators || {};
      
      // Find min/max values for scaling - now using high-low range
      const minMaxPrice = findMinMaxPriceRange(prices);
      const dateRange = [new Date(prices[0].date), new Date(prices[prices.length - 1].date)];
      
      // Draw price chart
      drawGrid(chartCtx, chartCanvasRef.width, chartCanvasRef.height);
      drawDateAxis(chartCtx, dateRange, chartCanvasRef.width, chartCanvasRef.height);
      drawPriceAxis(chartCtx, minMaxPrice, chartCanvasRef.width, chartCanvasRef.height);
      
      // Use candlesticks instead of line
      drawPriceCandlesticks(chartCtx, prices, dateRange, minMaxPrice, chartCanvasRef.width, chartCanvasRef.height);
      
      // Draw signals if available
      if (signals.length > 0) {
        drawSignals(chartCtx, signals, dateRange, minMaxPrice, chartCanvasRef.width, chartCanvasRef.height);
      }
      
      // Draw indicators if available
      const indicatorNames = Object.keys(indicators);
      if (indicatorNames.length > 0) {
        const mainIndicator = indicatorNames[0]; // Just use the first indicator for simplicity
        const indicatorData = indicators[mainIndicator];
        const minMaxIndicator = findMinMaxValuesForIndicator(indicatorData);
        
        drawGrid(indicatorCtx, indicatorCanvasRef.width, indicatorCanvasRef.height);
        drawDateAxis(indicatorCtx, dateRange, indicatorCanvasRef.width, indicatorCanvasRef.height);
        drawIndicatorAxis(indicatorCtx, minMaxIndicator, indicatorCanvasRef.width, indicatorCanvasRef.height, mainIndicator);
        drawIndicatorLine(indicatorCtx, indicatorData, dateRange, minMaxIndicator, indicatorCanvasRef.width, indicatorCanvasRef.height);
      } else {
        drawNoDataMessage(indicatorCtx, indicatorCanvasRef.width, indicatorCanvasRef.height, "No indicator data available");
      }
      
      // Extract trades and draw individual PnL bars
      if (signals.length > 0) {
        const trades = extractTradesFromSignals(signals);
        if (trades.length > 0) {
          // Find min/max PnL values for scaling
          const minMaxPnL = findMinMaxTradeValues(trades);
          
          drawGrid(pnlCtx, pnlCanvasRef.width, pnlCanvasRef.height);
          drawDateAxis(pnlCtx, dateRange, pnlCanvasRef.width, pnlCanvasRef.height);
          drawPnLAxis(pnlCtx, minMaxPnL, pnlCanvasRef.width, pnlCanvasRef.height);
          drawIndividualTradeBars(pnlCtx, trades, dateRange, minMaxPnL, pnlCanvasRef.width, pnlCanvasRef.height);
        } else {
          drawNoDataMessage(pnlCtx, pnlCanvasRef.width, pnlCanvasRef.height, "No completed trades available");
        }
      } else {
        drawNoDataMessage(pnlCtx, pnlCanvasRef.width, pnlCanvasRef.height, "No trade signals available");
      }
    };

    // Call the implementation
    drawChartImpl();
    
    // Add cleanup function to avoid memory leaks
    return () => {
      // Use the captured refs from the beginning of the effect
      if (chartCanvasRef) {
        const chartCtx = chartCanvasRef.getContext('2d');
        chartCtx.clearRect(0, 0, chartCanvasRef.width, chartCanvasRef.height);
      }
      
      if (pnlCanvasRef) {
        const pnlCtx = pnlCanvasRef.getContext('2d');
        pnlCtx.clearRect(0, 0, pnlCanvasRef.width, pnlCanvasRef.height);
      }
      
      if (indicatorCanvasRef) {
        const indicatorCtx = indicatorCanvasRef.getContext('2d');
        indicatorCtx.clearRect(0, 0, indicatorCanvasRef.width, indicatorCanvasRef.height);
      }
    };
  }, [
    data, 
    width, 
    height, 
    drawNoDataMessage, 
    drawGrid, 
    drawDateAxis, 
    drawPriceAxis, 
    drawPriceCandlesticks, 
    drawSignals, 
    drawIndicatorAxis, 
    drawIndicatorLine, 
    drawPnLAxis, 
    drawIndividualTradeBars,
    findMinMaxPriceRange,
    findMinMaxValuesForIndicator,
    findMinMaxTradeValues,
    extractTradesFromSignals
  ]);
  
  // Set up event handlers for crosshair
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      
      // Get container position
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Get mouse position relative to container
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;
      
      // Update crosshair position
      setCrosshairPosition({ x, y });
      setShowCrosshair(true);
      
      // Find tooltip data
      updateTooltipData(x, y);
    };
    
    const handleMouseLeave = () => {
      setShowCrosshair(false);
      setTooltipData(null);
    };
    
    // Update tooltip data based on mouse position
    const updateTooltipData = (mouseX, mouseY) => {
      // Skip if we don't have prices
      if (!chartData.current.prices || chartData.current.prices.length === 0) return;
      
      // Find which chart the mouse is over
      const { canvasPositions } = chartData.current;
      
      // Check if mouse is over price chart - removed unused activeChart variable
      if (chartRef.current) {
        const rect = chartRef.current.getBoundingClientRect();
        if (
          mouseX >= 0 && 
          mouseX <= rect.width && 
          mouseY >= canvasPositions.chart.top - containerRef.current.getBoundingClientRect().top && 
          mouseY <= canvasPositions.chart.top - containerRef.current.getBoundingClientRect().top + canvasPositions.chart.height
        ) {
          // Mouse is over price chart
        }
      }
      
      // Find price data at mouse position
      const prices = chartData.current.prices;
      const dateRange = chartData.current.dateRange;
      
      if (prices.length > 0 && dateRange.length === 2) {
        const totalTime = dateRange[1].getTime() - dateRange[0].getTime();
        const chartWidth = chartRef.current.width;
        
        // Calculate date at mouse position
        const mouseRatio = mouseX / chartWidth;
        const mouseDate = new Date(dateRange[0].getTime() + mouseRatio * totalTime);
        
        // Find closest price point
        let closestPrice = null;
        let minTimeDiff = Infinity;
        
        for (const price of prices) {
          const timeDiff = Math.abs(price.date.getTime() - mouseDate.getTime());
          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestPrice = price;
          }
        }
        
        // Find signals for this price point
        let signals = [];
        if (data.signals) {
          signals = data.signals.filter(signal => 
            new Date(signal.date).toISOString() === closestPrice.date.toISOString()
          );
        }
        
        // Find indicator values for this date
        const indicatorValues = {};
        if (data.indicators) {
          Object.entries(data.indicators).forEach(([name, values]) => {
            const matchingIndicator = values.find(ind => 
              new Date(ind.date).toISOString() === closestPrice.date.toISOString()
            );
            if (matchingIndicator) {
              indicatorValues[name] = matchingIndicator.value;
            }
          });
        }
        
        if (closestPrice) {
          setTooltipData({
            price: closestPrice,
            signals,
            indicators: indicatorValues,
            position: { x: mouseX, y: mouseY }
          });
        }
      }
    };
    
    // Add mouse event listeners to container
    const currentContainerRef = containerRef.current;
    if (currentContainerRef) {
      currentContainerRef.addEventListener('mousemove', handleMouseMove);
      currentContainerRef.addEventListener('mouseleave', handleMouseLeave);
    }
    
    // Cleanup
    return () => {
      if (currentContainerRef) {
        currentContainerRef.removeEventListener('mousemove', handleMouseMove);
        currentContainerRef.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [data]);
  
  // Render tooltip
  const renderTooltip = () => {
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
        
        {/* Show indicator values if available */}
        {Object.entries(indicators).map(([name, value]) => (
          <div key={name}>
            {name}: <span style={{ float: 'right' }}>{value.toFixed(2)}</span>
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

  return (
    <div className="reporter-chart-container" ref={containerRef}>
      <h3 className="chart-title">Price Chart with Signals</h3>
      <div className="chart-wrapper">
        <canvas ref={chartRef} className="price-chart-canvas"></canvas>
        
        {/* Crosshair lines */}
        {showCrosshair && (
          <>
            <div 
              className="crosshair-line vertical" 
              style={{ left: crosshairPosition.x }}
            ></div>
            <div 
              className="crosshair-line horizontal" 
              style={{ top: crosshairPosition.y }}
            ></div>
          </>
        )}
      </div>
      
      <h3 className="chart-title">Individual Trade PnL</h3>
      <div className="chart-wrapper">
        <canvas ref={pnlChartRef} className="pnl-chart-canvas"></canvas>
        
        {/* Vertical crosshair for PnL chart */}
        {showCrosshair && (
          <div 
            className="crosshair-line vertical" 
            style={{ left: crosshairPosition.x }}
          ></div>
        )}
      </div>
      
      <h3 className="chart-title">Indicator Chart</h3>
      <div className="chart-wrapper">
        <canvas ref={indicatorChartRef} className="indicator-chart-canvas"></canvas>
        
        {/* Vertical crosshair for indicator chart */}
        {showCrosshair && (
          <div 
            className="crosshair-line vertical" 
            style={{ left: crosshairPosition.x }}
          ></div>
        )}
      </div>
      
      {/* Render tooltip if data available */}
      {renderTooltip()}
    </div>
  );
};

export default ReporterStyleChart;