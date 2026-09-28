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
 * IndicatorChart component renders the sub-pane technical indicators (data.indicators) - every
 * visible series in its own colour over one shared min/max of the visible points.
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @param {Object} props.dateRange - Date range [startDate, endDate]
 * @param {Array<{name, color}>} [props.subSeries] - visible sub-pane series (from the shared
 *   IndicatorPicker); values come from data.indicators[name].
 * @returns {JSX.Element}
 */
const IndicatorChart = ({ data, width, height, dateRange, subSeries = [] }) => {
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
    
    // Visible points of every selected sub series, in the current date range
    const visibleBySeries = subSeries
      .map(series => ({
        series,
        points: (indicators[series.name] || []).filter(item => {
          if (typeof item.value !== 'number' || Number.isNaN(item.value)) return false;
          const itemDate = new Date(item.date);
          return itemDate >= chartDateRange[0] && itemDate <= chartDateRange[1];
        })
      }))
      .filter(entry => entry.points.length > 0);

    if (subSeries.length > 0) {
      if (visibleBySeries.length > 0) {
        // One shared min/max across all visible series so they are comparable in the pane
        const minMaxIndicator = findMinMaxValuesForIndicator(
          visibleBySeries.flatMap(entry => entry.points)
        );
        const axisLabel = visibleBySeries.map(entry => entry.series.name).join(', ');

        // Draw chart components
        drawGrid(ctx, width, height);
        visibleBySeries.forEach(({ series, points }) => {
          drawIndicatorLine(ctx, points, chartDateRange, minMaxIndicator, width, height, series.color);
        });
        // Axes last, so their labels sit on top of the lines
        drawDateAxis(ctx, chartDateRange, width, height);
        drawIndicatorAxis(ctx, minMaxIndicator, width, height, axisLabel);
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
  }, [data, width, height, dateRange, subSeries]);

  return (
    <div className="chart-wrapper">
      <canvas ref={canvasRef} className="indicator-chart-canvas"></canvas>
    </div>
  );
};

export default IndicatorChart;