// src/components/ReporterStyleChart.jsx
import { useEffect, useRef, useState } from 'react';
import './ReporterStyleChart.css';
import { 
  findMinMaxPriceRange, 
  findMinMaxValuesForIndicator,
  findMinMaxTradeValues,
  drawNoDataMessage,
  drawGrid,
  drawDateAxis,
  drawPriceAxis,
  drawPnLAxis,
  drawIndicatorAxis,
  drawPriceCandlesticks,
  drawIndicatorLine,
  drawUpTriangle,
  drawDownTriangle,
  drawCircle,
  drawSignals,
  drawIndividualTradeBars
} from '../utils/ChartDrawingUtils';
import { extractTradesFromSignals } from '../utils/ChartDataUtils';

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
  }, [data, width, height]);
  
  // Set up event handlers for crosshair and tooltip
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
  
  // Function to update tooltip data based on mouse position
  const updateTooltipData = (mouseX, mouseY) => {
    // Skip if we don't have prices
    if (!chartData.current.prices || chartData.current.prices.length === 0) return;
    
    // Find which chart the mouse is over
    const { canvasPositions } = chartData.current;
    
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