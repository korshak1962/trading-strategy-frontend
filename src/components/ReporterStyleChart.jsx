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
      
      // Calculate and draw PnL
      if (signals.length > 0) {
        const pnlData = calculatePnL(signals, prices);
        const minMaxPnL = findMinMaxValues(pnlData, 'pnl');
        
        drawGrid(pnlCtx, pnlCanvasRef.width, pnlCanvasRef.height);
        drawDateAxis(pnlCtx, dateRange, pnlCanvasRef.width, pnlCanvasRef.height);
        drawPnLAxis(pnlCtx, minMaxPnL, pnlCanvasRef.width, pnlCanvasRef.height);
        drawPnLBars(pnlCtx, pnlData, dateRange, minMaxPnL, pnlCanvasRef.width, pnlCanvasRef.height);
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
    
    // Draw axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('PnL', 0, 0);
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
  
  const calculatePnL = (signals, prices) => {
    // Simplified PnL calculation
    const pnlData = [];
    let currentPosition = null;
    let entryPrice = 0;
    let cumulativePnL = 0;
    
    // Map prices by date for quick lookup
    const priceMap = {};
    prices.forEach(price => {
      priceMap[price.date] = price.close;
    });
    
    // Initialize PnL data with 0
    prices.forEach(price => {
      pnlData.push({
        date: price.date,
        pnl: 0
      });
    });
    
    // Process signals to calculate PnL
    signals.forEach(signal => {
      if (signal.type === 'LongOpen') {
        currentPosition = 'long';
        entryPrice = signal.price;
      } else if (signal.type === 'LongClose' && currentPosition === 'long') {
        // Calculate profit/loss for this trade
        const profit = signal.price - entryPrice;
        cumulativePnL += profit;
        currentPosition = null;
        
        // Update pnl data
        const index = pnlData.findIndex(p => p.date === signal.date);
        if (index >= 0) {
          for (let i = index; i < pnlData.length; i++) {
            pnlData[i].pnl = cumulativePnL;
          }
        }
      } else if (signal.type === 'ShortOpen') {
        currentPosition = 'short';
        entryPrice = signal.price;
      } else if (signal.type === 'ShortClose' && currentPosition === 'short') {
        // Calculate profit/loss for this trade (reversed for short)
        const profit = entryPrice - signal.price;
        cumulativePnL += profit;
        currentPosition = null;
        
        // Update pnl data
        const index = pnlData.findIndex(p => p.date === signal.date);
        if (index >= 0) {
          for (let i = index; i < pnlData.length; i++) {
            pnlData[i].pnl = cumulativePnL;
          }
        }
      }
    });
    
    return pnlData;
  };
  
  const drawPnLBars = (ctx, pnlData, dateRange, minMax, width, height) => {
    const [startDate, endDate] = dateRange;
    const { min, max } = minMax;
    const totalMs = endDate.getTime() - startDate.getTime();
    
    // Find points where PnL changes
    const pnlChanges = [];
    let lastPnL = 0;
    
    pnlData.forEach((point, i) => {
      if (i === 0 || point.pnl !== lastPnL) {
        pnlChanges.push(point);
        lastPnL = point.pnl;
      }
    });
    
    // Draw bars for each PnL change
    pnlChanges.forEach(point => {
      const date = new Date(point.date);
      const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
      
      // Calculate bar height
      const y = height - ((point.pnl - min) / (max - min)) * height;
      
      // Draw bar
      ctx.fillStyle = point.pnl >= 0 ? 'green' : 'red';
      ctx.fillRect(x - 5, y, 10, height - y);
    });
  };

  return (
    <div className="reporter-chart-container">
      <h3 className="chart-title">Price Chart with Signals</h3>
      <canvas ref={chartRef} className="price-chart-canvas"></canvas>
      
      <h3 className="chart-title">PnL Chart</h3>
      <canvas ref={pnlChartRef} className="pnl-chart-canvas"></canvas>
      
      <h3 className="chart-title">Indicator Chart</h3>
      <canvas ref={indicatorChartRef} className="indicator-chart-canvas"></canvas>
    </div>
  );
};

export default ReporterStyleChart;