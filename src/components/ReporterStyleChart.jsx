// src/components/ReporterStyleChart.jsx
import { useEffect, useRef } from 'react';
import './ReporterStyleChart.css';

const ReporterStyleChart = ({ data, width = 1200, height = 600 }) => {
  const chartRef = useRef(null);
  const pnlChartRef = useRef(null);
  const indicatorChartRef = useRef(null);

  useEffect(() => {
    // Capture ref values at the beginning of the effect
    const chartCanvasRef = chartRef.current;
    const pnlCanvasRef = pnlChartRef.current;
    const indicatorCanvasRef = indicatorChartRef.current;
    
    if (!data || !chartCanvasRef || !pnlCanvasRef || !indicatorCanvasRef) return;

    // Define drawChart function inside the useEffect to avoid dependency warnings
    const drawChartImpl = () => {
      // Set canvas dimensions
      chartCanvasRef.width = width;
      chartCanvasRef.height = height * 0.6;
      pnlCanvasRef.width = width;
      pnlCanvasRef.height = height * 0.2;
      indicatorCanvasRef.width = width;
      indicatorCanvasRef.height = height * 0.2;
      
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
      
      // Find min/max values for scaling
      const minMaxPrice = findMinMaxValues(prices, 'close');
      const dateRange = [new Date(prices[0].date), new Date(prices[prices.length - 1].date)];
      
      // Draw price chart
      drawGrid(chartCtx, chartCanvasRef.width, chartCanvasRef.height);
      drawDateAxis(chartCtx, dateRange, chartCanvasRef.width, chartCanvasRef.height);
      drawPriceAxis(chartCtx, minMaxPrice, chartCanvasRef.width, chartCanvasRef.height);
      drawPriceLine(chartCtx, prices, dateRange, minMaxPrice, chartCanvasRef.width, chartCanvasRef.height);
      
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
  }, [data, width, height]);
  
  // Helper functions for drawing
  
  const drawNoDataMessage = (ctx, width, height, message = "No data available") => {
    ctx.fillStyle = '#888';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  };
  
  const findMinMaxValues = (data, key) => {
    if (!data || data.length === 0) return { min: 0, max: 100 };
    
    let min = data[0][key];
    let max = data[0][key];
    
    data.forEach(item => {
      if (item[key] < min) min = item[key];
      if (item[key] > max) max = item[key];
    });
    
    // Add some padding
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  };
  
  const findMinMaxTradeValues = (trades) => {
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
  
  const findMinMaxValuesForIndicator = (data) => {
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
  
  const drawGrid = (ctx, width, height) => {
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
  
  const drawDateAxis = (ctx, dateRange, width, height) => {
    const [startDate, endDate] = dateRange;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    // Draw date labels
    const numLabels = 10;
    for (let i = 0; i <= numLabels; i++) {
      const x = (i / numLabels) * width;
      const ms = (i / numLabels) * totalMs;
      const date = new Date(startDate.getTime() + ms);
      
      // Format date as YYYY-MM-DD
      const dateString = date.toISOString().split('T')[0];
      
      ctx.fillText(dateString, x, height - 5);
    }
  };
  
  const drawPriceAxis = (ctx, minMax, width, height) => {
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
  
  const drawPnLAxis = (ctx, minMax, width, height) => {
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
  
  const drawIndicatorAxis = (ctx, minMax, width, height, indicatorName) => {
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
  
  const drawPriceLine = (ctx, prices, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    prices.forEach((price, i) => {
      const date = new Date(price.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      const y = height - ((price.close - min) / (max - min)) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  };
  
  const drawIndicatorLine = (ctx, indicators, dateRange, minMax, width, height) => {
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
  
  const drawSignals = (ctx, signals, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    signals.forEach(signal => {
      const date = new Date(signal.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      const y = height - ((signal.price - min) / (max - min)) * height;
      
      // Draw marker based on signal type
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      
      if (signal.type === 'LongOpen') {
        ctx.fillStyle = 'green';
      } else if (signal.type === 'LongClose') {
        ctx.fillStyle = 'red';
      } else if (signal.type === 'ShortOpen') {
        ctx.fillStyle = 'blue';
      } else if (signal.type === 'ShortClose') {
        ctx.fillStyle = 'orange';
      } else {
        ctx.fillStyle = 'gray';
      }
      
      ctx.fill();
      
      // Signal labels have been removed as requested
    });
  };
  
  const extractTradesFromSignals = (signals) => {
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
  };
  
  const drawIndividualTradeBars = (ctx, trades, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    const zeroY = height - ((0 - min) / (max - min)) * height;
    
    // Draw individual trade bars
    trades.forEach(trade => {
      const closeDate = trade.closeDate;
      const x = ((closeDate.getTime() - startDate.getTime()) / totalMs) * width;
      
      // Bar height depends on PnL
      const barHeight = Math.abs(((trade.pnl - 0) / (max - min)) * height);
      // Position from zero line
      const y = trade.pnl >= 0 ? zeroY - barHeight : zeroY;
      
      // Draw bar
      ctx.fillStyle = trade.pnl >= 0 ? 'green' : 'red';
      ctx.fillRect(x - 10, y, 20, barHeight);
      
      // Draw outline
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 10, y, 20, barHeight);
      
      // Draw PnL value above/below the bar
      ctx.fillStyle = 'black';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      const textY = trade.pnl >= 0 ? y - 10 : y + barHeight + 10;
      ctx.fillText(trade.pnl.toFixed(2), x, textY);
    });
  };

  return (
    <div className="reporter-chart-container">
      <h3 className="chart-title">Price Chart with Signals</h3>
      <canvas ref={chartRef} className="price-chart-canvas"></canvas>
      
      <h3 className="chart-title">Individual Trade PnL</h3>
      <canvas ref={pnlChartRef} className="pnl-chart-canvas"></canvas>
      
      <h3 className="chart-title">Indicator Chart</h3>
      <canvas ref={indicatorChartRef} className="indicator-chart-canvas"></canvas>
    </div>
  );
};

export default ReporterStyleChart;