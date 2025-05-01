// src/components/charts/ReporterStyleChart.jsx
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
  const [forceRender, setForceRender] = useState(0); // Counter to force render
  
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
  
  // New state for storing the exact date at mousedown
  const [selectionStartDate, setSelectionStartDate] = useState(null);
  
  // Calculate sub-chart heights
  const priceChartHeight = height * 0.6;
  const pnlChartHeight = height * 0.2;
  const indicatorChartHeight = height * 0.2;
  
  // Store data for tooltip
  const chartData = useRef({
    prices: [],
    dateRange: []
  });
  
  // Reset date range when data changes
  useEffect(() => {
    if (data && data.prices && data.prices.length > 0) {
      // Reset date range to null to force recalculation based on new data
      setDateRange(null);
      setOriginalDateRange(null);
    }
  }, [data]);
  
  // Process and store data for tooltips and zoom
  useEffect(() => {
    if (!data || !data.prices || data.prices.length === 0) return;
    
    try {
      // Store processed price data with proper Date objects
      chartData.current.prices = data.prices.map(price => ({
        date: new Date(price.date),
        open: price.open,
        high: price.high,
        low: price.low,
        close: price.close,
        volume: price.volume
      }));
      
      // Sort the prices by date to ensure correct chronological order
      chartData.current.prices.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      // Set date range based on the first and last price points
      if (chartData.current.prices.length > 0) {
        const firstPrice = chartData.current.prices[0];
        const lastPrice = chartData.current.prices[chartData.current.prices.length - 1];
        
        const correctDateRange = [
          new Date(firstPrice.date),
          new Date(lastPrice.date)
        ];
        
        console.log('Setting initial date range:', {
          first: correctDateRange[0].toISOString(),
          last: correctDateRange[1].toISOString()
        });
        
        chartData.current.dateRange = correctDateRange;
        
        // Initialize dateRange state if it's not already set
        if (!dateRange) {
          setDateRange(correctDateRange);
          setOriginalDateRange(correctDateRange);
        }
      }
    } catch (error) {
      console.error('Error processing price data:', error);
    }
  }, [data, dateRange]);
  
  // Function to force a re-render of the charts
  const triggerRerender = useCallback(() => {
    setForceRender(prev => prev + 1);
  }, []);
  
  // Calculate the exact date at a specific x position
  const calculateDateAtPosition = useCallback((xPosition) => {
    if (!containerRef.current || !dateRange) return null;
    
    const containerWidth = containerRef.current.clientWidth;
    const mouseRatio = xPosition / containerWidth;
    const [startDate, endDate] = dateRange[0] <= dateRange[1] 
      ? [dateRange[0], dateRange[1]] 
      : [dateRange[1], dateRange[0]];
    
    const totalTime = endDate.getTime() - startDate.getTime();
    return new Date(startDate.getTime() + mouseRatio * totalTime);
  }, [dateRange]);
  
  // Function to update tooltip data based on mouse position
  const updateTooltipData = useCallback((mouseX, mouseY) => {
    // Skip if we don't have prices
    if (!chartData.current.prices || chartData.current.prices.length === 0) return;
    
    // Calculate the exact date at mouse position using the same function as zoom
    const mouseDate = calculateDateAtPosition(mouseX);
    if (!mouseDate) return;
    
    // Find price data at mouse position
    const prices = chartData.current.prices;
    const currentDateRange = dateRange || chartData.current.dateRange;
    
    if (prices.length > 0 && currentDateRange?.length === 2) {
      // Ensure dates are properly ordered
      const orderedDates = [...currentDateRange].sort((a, b) => a.getTime() - b.getTime());
      const startDate = orderedDates[0];
      const endDate = orderedDates[1];
      
      // Find closest price point to the mouse date
      let closestPrice = null;
      let minTimeDiff = Infinity;
      
      // Filter prices to only consider those within the visible date range
      const visiblePrices = prices.filter(price => 
        price.date >= startDate && price.date <= endDate
      );
      
      for (const price of visiblePrices) {
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
        signals = data.signals.filter(signal => {
          const signalDate = new Date(signal.date);
          return signalDate.toISOString() === closestPrice.date.toISOString();
        });
      }
      
      // Find indicator values for this date
      const indicatorValues = {};
      if (data && data.indicators) {
        Object.entries(data.indicators).forEach(([name, values]) => {
          const matchingIndicator = values.find(ind => {
            const indDate = new Date(ind.date);
            return indDate.toISOString() === closestPrice.date.toISOString();
          });
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
  }, [data, dateRange, calculateDateAtPosition]);
  
  // Handle mouse down for zoom selection start
  const handleMouseDown = useCallback((e) => {
    if (!containerRef.current) return;
    
    // Only activate zoom with left mouse button
    if (e.button !== 0) return;
    
    // Get container position
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // Get mouse position relative to container
    const x = e.clientX - containerRect.left;
    
    // Calculate the exact date at this x position
    const exactDateAtMouseDown = calculateDateAtPosition(x);
    if (!exactDateAtMouseDown) return;
    
    // Start zoom selection
    setZoomActive(true);
    setZoomStart(x);
    setZoomEnd(x);
    setSelectionStartDate(exactDateAtMouseDown);
  }, [calculateDateAtPosition]);
  
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
  const handleMouseUp = useCallback(() => {
    if (!zoomActive || !containerRef.current || !selectionStartDate) {
      setZoomActive(false);
      return;
    }
    
    // Calculate the exact date at current mouse position
    const exactDateAtMouseUp = calculateDateAtPosition(zoomEnd);
    if (!exactDateAtMouseUp) {
      setZoomActive(false);
      return;
    }
    
    // Only apply zoom if selection is significant (more than 5% of width)
    if (Math.abs(zoomEnd - zoomStart) < containerRef.current.clientWidth * 0.05) {
      setZoomActive(false);
      return;
    }
    
    // First clear zoom active state
    setZoomActive(false);
    
    // Sort the dates so start is before end
    const newDateRange = [selectionStartDate, exactDateAtMouseUp].sort((a, b) => a - b);
    
    // Apply the new date range
    setDateRange(newDateRange);
    // Force a render after applying zoom
    setTimeout(triggerRerender, 50);
  }, [zoomActive, zoomStart, zoomEnd, selectionStartDate, calculateDateAtPosition, triggerRerender]);
  
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
    // Force a render after resetting zoom
    setTimeout(triggerRerender, 50);
  }, [originalDateRange, triggerRerender]);
  
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
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
    
    try {
      return date.toLocaleDateString(undefined, { 
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.warn('Error formatting date:', error);
      // Fallback formatting
      return date.toString().split('T')[0];
    }
  };
  
  // Ensure dateRange is properly ordered before passing to child components
  const getOrderedDateRange = () => {
    if (!dateRange || dateRange.length !== 2) return null;
    
    // Make sure both entries are valid Date objects
    if (!(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date) || 
        isNaN(dateRange[0].getTime()) || isNaN(dateRange[1].getTime())) {
      return null;
    }
    
    return dateRange[0] <= dateRange[1] 
      ? dateRange 
      : [dateRange[1], dateRange[0]];
  };
  
  return (
    <div className="reporter-chart-container" ref={containerRef}>
      {/* Zoom controls */}
      <div className="chart-controls">
        <div className="zoom-info">
          <button 
            className="zoom-reset-btn"
            onClick={handleResetZoom}
            disabled={!dateRange || !originalDateRange || (
              dateRange[0] instanceof Date && originalDateRange[0] instanceof Date &&
              dateRange[1] instanceof Date && originalDateRange[1] instanceof Date &&
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
        {dateRange && originalDateRange && dateRange[0] instanceof Date && dateRange[1] instanceof Date && 
         originalDateRange[0] instanceof Date && originalDateRange[1] instanceof Date && (
          dateRange[0].getTime() !== originalDateRange[0].getTime() ||
          dateRange[1].getTime() !== originalDateRange[1].getTime()
        ) && (
          <div className="zoom-range-display">
            {formatDate(dateRange[0] <= dateRange[1] ? dateRange[0] : dateRange[1])} - {formatDate(dateRange[0] <= dateRange[1] ? dateRange[1] : dateRange[0])}
          </div>
        )}
      </div>
      
      <h3 className="chart-title">Price Chart with Signals</h3>
      <div className="chart-wrapper position-relative">
        <PriceChart 
          data={data} 
          width={getChartWidth()} 
          height={priceChartHeight} 
          dateRange={getOrderedDateRange()}
          key={`price-${forceRender}`}
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
          dateRange={getOrderedDateRange()}
          key={`pnl-${forceRender}`}
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
          dateRange={getOrderedDateRange()}
          key={`indicator-${forceRender}`}
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