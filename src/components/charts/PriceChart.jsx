// src/components/charts/PriceChart.jsx
import { useEffect, useRef } from 'react';
import { 
  findMinMaxPriceRange,
  drawNoDataMessage,
  drawGrid,
  drawDateAxis,
  drawPriceAxis,
  drawPriceCandlesticks,
  drawSignals,
  filterDataByDateRange
} from '../../utils/ChartDrawingUtils';

/**
 * PriceChart component renders the price candlestick chart with signals
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @param {Object} props.dateRange - Date range [startDate, endDate]
 * @returns {JSX.Element}
 */
const PriceChart = ({ data, width, height, dateRange }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

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
    
    if (!data || !data.prices || data.prices.length === 0) {
      drawNoDataMessage(ctx, width, height);
      return;
    }
    
    // Extract data
    const prices = data.prices;
    const signals = data.signals || [];
    
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
    
    // Filter prices to only those in current date range
    const visiblePrices = filterDataByDateRange(prices, chartDateRange);
    
    // Find min/max values for scaling using only visible prices
    const minMaxPrice = findMinMaxPriceRange(visiblePrices);
    
    // Filter signals to only those in current date range
    const visibleSignals = filterDataByDateRange(signals, chartDateRange);
    
    // Draw chart components
    drawGrid(ctx, width, height);
    drawDateAxis(ctx, chartDateRange, width, height);
    drawPriceAxis(ctx, minMaxPrice, width, height);
    
    // Draw price candlesticks
    drawPriceCandlesticks(ctx, visiblePrices, chartDateRange, minMaxPrice, width, height);
    
    // Draw signals if available
    if (visibleSignals.length > 0) {
      drawSignals(ctx, visibleSignals, chartDateRange, minMaxPrice, width, height);
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
      <canvas ref={canvasRef} className="price-chart-canvas"></canvas>
    </div>
  );
};

export default PriceChart;