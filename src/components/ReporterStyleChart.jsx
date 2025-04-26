// src/components/ReporterStyleChart.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import './ReporterStyleChart.css';
import PriceChart from './charts/PriceChart';
import PnLChart from './charts/PnLChart';
import IndicatorChart from './charts/IndicatorChart';
import ChartTooltip from './charts/ChartTooltip';
import Crosshair from './charts/Crosshair';

/**
 * ReporterStyleChart component - Main container for financial charts with synchronized zoom
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data including prices, signals, indicators
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @returns {JSX.Element}
 */
const ReporterStyleChart = ({ data, width = 1200, height = 600 }) => {
  const containerRef = useRef(null);
  
  // State for crosshair position
  const [crosshairPosition, setCrosshairPosition] = useState({ x: 0, y: 0 });
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  
  // State for zoom
  const [zoomActive, setZoomActive] = useState(false);
  const [zoomStart, setZoomStart] = useState(null);
  const [zoomEnd, setZoomEnd] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [originalDateRange, setOriginalDateRange] = useState(null);
  
  // Calculate sub-chart heights
  const priceChartHeight = height * 0.6;
  const pnlChartHeight = height * 0.2;
  const indicatorChartHeight = height * 0.2;
  
  // Store data for tooltip
  const chartData = useRef({
    prices: [],
    dateRange: []
  });
  
  // Process and store data for tooltips and zoom
  useEffect(() => {
    if (!data || !data.prices || data.prices.length === 0) return;
    
    // Store processed price data
    chartData.current.prices = data.prices.map(price => ({
      date: new Date(price.date),
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume
    }));
    
    // Store date range
    if (data.prices.length > 0) {
      const range = [
        new Date(data.prices[0].date),
        new Date(data.prices[data.prices.length - 1].date)
      ];
      
      chartData.current.dateRange = range;
      
      // Initialize dateRange state if it's not already set
      if (!dateRange) {
        setDateRange(range);
        setOriginalDateRange(range);
      }
    }
  }, [data, dateRange]);
  
  // Function to update tooltip data based on mouse position
  const updateTooltipData = useCallback((mouseX, mouseY) => {
    // Skip if we don't have prices
    if (!chartData.current.prices || chartData.current.prices.length === 0) return;
    
    // Find price data at mouse position
    const prices = chartData.current.prices;
    const currentDateRange = dateRange || chartData.current.dateRange;
    
    if (prices.length > 0 && currentDateRange.length === 2 && containerRef.current) {
      // Calculate container width
      const containerWidth = containerRef.current.clientWidth;
      
      // Calculate date at mouse position
      const mouseRatio = mouseX / containerWidth;
      const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
      const mouseDate = new Date(currentDateRange[0].getTime() + mouseRatio * totalTime);
      
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
      
      if (!closestPrice) return;
      
      // Find signals for this price point
      let signals = [];
      if (data && data.signals) {
        signals = data.signals.filter(signal => 
          new Date(signal.date).toISOString() === closestPrice.date.toISOString()
        );
      }
      
      // Find indicator values for this date
      const indicatorValues = {};
      if (data && data.indicators) {
        Object.entries(data.indicators).forEach(([name, values]) => {
          const matchingIndicator = values.find(ind => 
            new Date(ind.date).toISOString() === closestPrice.date.toISOString()
          );
          if (matchingIndicator) {
            indicatorValues[name] = matchingIndicator.value;
          }
        });
      }
      
      setTooltipData({
        price: closestPrice,
        signals,
        indicators: indicatorValues,
        position: { x: mouseX, y: mouseY }
      });
    }
  }, [data, dateRange]);
  
  // Handle mouse down for zoom selection start
  const handleMouseDown = useCallback((e) => {
    if (!containerRef.current) return;
    
    // Only activate zoom with left mouse button
    if (e.button !== 0) return;
    
    // Get container position
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // Get mouse position relative to container
    const x = e.clientX - containerRect.left;
    
    // Start zoom selection
    setZoomActive(true);
    setZoomStart(x);
    setZoomEnd(x);
  }, []);
  
  // Handle mouse move for zoom selection
  const handleMouseMove = useCallback((e) => {
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
    
    // Update zoom selection if active
    if (zoomActive) {
      setZoomEnd(x);
    }
  }, [zoomActive, updateTooltipData]);
  
  // Handle mouse up for zoom selection end
  const handleMouseUp = useCallback((e) => {
    if (!zoomActive || !containerRef.current) {
      setZoomActive(false);
      return;
    }
    
    // Calculate zoom range
    const containerWidth = containerRef.current.clientWidth;
    const currentDateRange = dateRange || chartData.current.dateRange;
    
    if (!currentDateRange || currentDateRange.length !== 2) {
      setZoomActive(false);
      return;
    }
    
    // Get start and end dates for zoom
    const startRatio = Math.max(0, Math.min(zoomStart, zoomEnd)) / containerWidth;
    const endRatio = Math.min(1, Math.max(zoomStart, zoomEnd)) / containerWidth;
    
    // Only apply zoom if selection is significant (more than 5% of width)
    if (Math.abs(endRatio - startRatio) < 0.05) {
      setZoomActive(false);
      return;
    }
    
    const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
    const newStartDate = new Date(currentDateRange[0].getTime() + startRatio * totalTime);
    const newEndDate = new Date(currentDateRange[0].getTime() + endRatio * totalTime);
    
    // Apply zoom
    setDateRange([newStartDate, newEndDate]);
    setZoomActive(false);
  }, [zoomActive, zoomStart, zoomEnd, dateRange]);
  
  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setShowCrosshair(false);
    setTooltipData(null);
    
    // Cancel zoom if active
    if (zoomActive) {
      setZoomActive(false);
    }
  }, [zoomActive]);
  
  // Reset zoom to original date range
  const handleResetZoom = useCallback(() => {
    setDateRange(originalDateRange);
  }, [originalDateRange]);
  
  // Set up event handlers for crosshair, tooltip, and zoom
  useEffect(() => {
    // Add mouse event listeners to container
    const currentContainerRef = containerRef.current;
    if (currentContainerRef) {
      currentContainerRef.addEventListener('mousedown', handleMouseDown);
      currentContainerRef.addEventListener('mousemove', handleMouseMove);
      currentContainerRef.addEventListener('mouseup', handleMouseUp);
      currentContainerRef.addEventListener('mouseleave', handleMouseLeave);
    }
    
    // Cleanup
    return () => {
      if (currentContainerRef) {
        currentContainerRef.removeEventListener('mousedown', handleMouseDown);
        currentContainerRef.removeEventListener('mousemove', handleMouseMove);
        currentContainerRef.removeEventListener('mouseup', handleMouseUp);
        currentContainerRef.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave]);
  
  // Calculate chart width based on container
  const getChartWidth = () => {
    if (!containerRef.current) return width;
    const containerWidth = containerRef.current.clientWidth;
    return Math.min(containerWidth - 20, width); // 20px padding
  };
  
  // Render zoom selection overlay
  const renderZoomSelection = () => {
    if (!zoomActive || zoomStart === null || zoomEnd === null) return null;
    
    const left = Math.min(zoomStart, zoomEnd);
    const width = Math.abs(zoomEnd - zoomStart);
    
    return (
      <div 
        className="zoom-selection"
        style={{
          position: 'absolute',
          left,
          top: 0,
          width,
          height: '100%',
          backgroundColor: 'rgba(33, 150, 243, 0.2)',
          border: '1px solid rgba(33, 150, 243, 0.5)',
          pointerEvents: 'none'
        }}
      />
    );
  };
  
  // Format date for display
  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString(undefined, { 
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  return (
    <div className="reporter-chart-container" ref={containerRef}>
      {/* Zoom controls */}
      <div className="chart-controls">
        <div className="zoom-info">
          <button 
            className="zoom-reset-btn"
            onClick={handleResetZoom}
            disabled={!dateRange || (originalDateRange && 
              dateRange[0].getTime() === originalDateRange[0].getTime() &&
              dateRange[1].getTime() === originalDateRange[1].getTime())}
          >
            Reset Zoom
          </button>
          <div className="zoom-instructions">
            Click and drag horizontally to zoom in on a specific time range
          </div>
        </div>
        
        {/* Show date range when zoomed */}
        {dateRange && originalDateRange && (
          dateRange[0].getTime() !== originalDateRange[0].getTime() ||
          dateRange[1].getTime() !== originalDateRange[1].getTime()
        ) && (
          <div className="zoom-range-display">
            {formatDate(dateRange[0])} - {formatDate(dateRange[1])}
          </div>
        )}
      </div>
      
      <h3 className="chart-title">Price Chart with Signals</h3>
      <div className="chart-wrapper position-relative">
        <PriceChart 
          data={data} 
          width={getChartWidth()} 
          height={priceChartHeight} 
          dateRange={dateRange}
        />
        <Crosshair 
          show={showCrosshair} 
          position={crosshairPosition} 
          horizontal={true} 
          vertical={true}
        />
        {renderZoomSelection()}
      </div>
      
      <h3 className="chart-title">Individual Trade PnL</h3>
      <div className="chart-wrapper position-relative">
        <PnLChart 
          data={data} 
          width={getChartWidth()} 
          height={pnlChartHeight} 
          dateRange={dateRange}
        />
        <Crosshair 
          show={showCrosshair} 
          position={crosshairPosition} 
          horizontal={false} 
          vertical={true}
        />
      </div>
      
      <h3 className="chart-title">Indicator Chart</h3>
      <div className="chart-wrapper position-relative">
        <IndicatorChart 
          data={data} 
          width={getChartWidth()} 
          height={indicatorChartHeight} 
          dateRange={dateRange}
        />
        <Crosshair 
          show={showCrosshair} 
          position={crosshairPosition} 
          horizontal={false} 
          vertical={true}
        />
      </div>
      
      {/* Render tooltip if data available */}
      <ChartTooltip tooltipData={tooltipData} />
    </div>
  );
};

export default ReporterStyleChart;