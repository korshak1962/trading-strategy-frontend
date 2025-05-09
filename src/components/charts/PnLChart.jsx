// src/components/charts/PnLChart.jsx
import { useEffect, useRef } from 'react';
import { 
  findMinMaxTradeValues,
  drawNoDataMessage,
  drawGrid,
  drawDateAxis,
  drawPnLAxis,
  drawIndividualTradeBars
} from '../../utils/ChartDrawingUtils';
import { extractTradesFromSignals } from '../../utils/ChartDataUtils';

/**
 * PnLChart component renders the profit/loss chart for trades
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @param {Object} props.dateRange - Date range [startDate, endDate]
 * @returns {JSX.Element}
 */
const PnLChart = ({ data, width, height, dateRange }) => {
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
    
    // Extract trades from signals
    if (signals.length > 0) {
      const allTrades = extractTradesFromSignals(signals);
      
      if (allTrades.length > 0) {
        // Filter trades to only show those within the date range
        const visibleTrades = allTrades.filter(trade => {
          const openDate = trade.openDate instanceof Date ? trade.openDate : new Date(trade.openDate);
          const closeDate = trade.closeDate instanceof Date ? trade.closeDate : new Date(trade.closeDate);
          
          // Include trade if any part of it is in the visible range
          return (
            (openDate >= chartDateRange[0] && openDate <= chartDateRange[1]) ||
            (closeDate >= chartDateRange[0] && closeDate <= chartDateRange[1]) ||
            (openDate <= chartDateRange[0] && closeDate >= chartDateRange[1])
          );
        });
        
        if (visibleTrades.length > 0) {
          // Find min/max PnL values for scaling based on visible trades
          const minMaxPnL = findMinMaxTradeValues(visibleTrades);
          
          // Draw chart components
          drawGrid(ctx, width, height);
          drawDateAxis(ctx, chartDateRange, width, height);
          drawPnLAxis(ctx, minMaxPnL, width, height);
          drawIndividualTradeBars(ctx, visibleTrades, chartDateRange, minMaxPnL, width, height);
        } else {
          drawNoDataMessage(ctx, width, height, "No trades visible in current range");
        }
      } else {
        drawNoDataMessage(ctx, width, height, "No completed trades available");
      }
    } else {
      drawNoDataMessage(ctx, width, height, "No trade signals available");
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
      <canvas ref={canvasRef} className="pnl-chart-canvas"></canvas>
    </div>
  );
};

export default PnLChart;