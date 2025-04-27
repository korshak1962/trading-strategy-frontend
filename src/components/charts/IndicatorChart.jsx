// src/components/charts/IndicatorChart.jsx
import { useEffect, useRef } from 'react';
import { 
  findMinMaxValuesForIndicator,
  drawNoDataMessage,
  drawGrid,
  drawDateAxis,
  drawIndicatorAxis,
  drawIndicatorLine
} from '../../utils/ChartDrawingUtils';

/**
 * IndicatorChart component renders technical indicators
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @param {Object} props.dateRange - Date range [startDate, endDate]
 * @returns {JSX.Element}
 */
const IndicatorChart = ({ data, width, height, dateRange }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement || !data) return;

    // Get device pixel ratio for high-DPI displays
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Set physical canvas size
    canvasElement.width = width * pixelRatio;
    canvasElement.height = height * pixelRatio;
    
    // Set display size via CSS
    canvasElement.style.width = `${width}px`;
    canvasElement.style.height = `${height}px`;
    
    // Get drawing context
    const ctx = canvasElement.getContext('2d');
    
    // Scale context for high-DPI displays
    ctx.scale(pixelRatio, pixelRatio);
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (!data.prices || data.prices.length === 0) {
      drawNoDataMessage(ctx, width, height);
      return;
    }
    
    // Extract data
    const prices = data.prices;
    const indicators = data.indicators || {};
    
    // Use passed dateRange if provided and valid, otherwise calculate it
    let chartDateRange = dateRange;
    
    if (!chartDateRange || !chartDateRange[0] || !chartDateRange[1] || 
        !(chartDateRange[0] instanceof Date) || !(chartDateRange[1] instanceof Date)) {
      try {
        // Try to extract date range from prices
        chartDateRange = [
          new Date(prices[0].date),
          new Date(prices[prices.length - 1].date)
        ];
        
        // Validate the calculated date range
        if (isNaN(chartDateRange[0].getTime()) || isNaN(chartDateRange[1].getTime())) {
          // If dates are invalid, create a fallback range
          const now = new Date();
          chartDateRange = [
            new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
            now
          ];
        }
      } catch (e) {
        // Fallback to a default range if all else fails
        console.warn('Error creating date range from prices:', e);
        const now = new Date();
        chartDateRange = [
          new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
          now
        ];
      }
    }
    
    // Draw indicators if available
    const indicatorNames = Object.keys(indicators);
    
    if (indicatorNames.length > 0) {
      // Just use the first indicator for simplicity
      const mainIndicator = indicatorNames[0]; 
      const indicatorData = indicators[mainIndicator];
      
      // Filter indicator data to only show values within the date range
      const visibleIndicatorData = indicatorData.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= chartDateRange[0] && itemDate <= chartDateRange[1];
      });
      
      if (visibleIndicatorData.length > 0) {
        // Calculate min/max based on the visible indicator data
        const minMaxIndicator = findMinMaxValuesForIndicator(visibleIndicatorData);
        
        // Draw chart components
        drawGrid(ctx, width, height);
        drawDateAxis(ctx, chartDateRange, width, height);
        drawIndicatorAxis(ctx, minMaxIndicator, width, height, mainIndicator);
        drawIndicatorLine(ctx, visibleIndicatorData, chartDateRange, minMaxIndicator, width, height);
      } else {
        drawNoDataMessage(ctx, width, height, "No indicator data in current range");
      }
    } else {
      drawNoDataMessage(ctx, width, height, "No indicator data available");
    }
    
    // Clean up function
    return () => {
      if (canvasElement) {
        const ctx = canvasElement.getContext('2d');
        ctx.clearRect(0, 0, width, height);
      }
    };
  }, [data, width, height, dateRange]);

  return (
    <div className="chart-wrapper">
      <canvas ref={canvasRef} className="indicator-chart-canvas"></canvas>
    </div>
  );
};

export default IndicatorChart;