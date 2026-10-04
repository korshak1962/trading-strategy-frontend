// src/components/charts/PriceChart.jsx
import { useEffect, useRef } from 'react';
import {
  findMinMaxPriceRange,
  drawNoDataMessage,
  drawGrid,
  drawDateAxis,
  drawPriceAxis,
  drawPriceCandlesticks,
  drawChannels,
  drawPriceOverlays,
  drawSignals
} from '../../utils/ChartDrawingUtils';
import { parseExchangeTs, exchangeToday } from '../../utils/dates';

/**
 * PriceChart component renders the price candlestick chart with signals
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @param {Object} props.dateRange - Date range [startDate, endDate]
 * @param {number|null} [props.highlightTradeIndex] - When set, that trade's channels/signals are
 *   emphasized and everything else is dimmed (see ReporterStyleChart's click-to-select).
 * @param {Map} [props.signalTradeIndex] - signalKey -> tradeIndex, from deriveSignalTradeIndex.
 * @param {Array<{name, color}>} [props.priceSeries] - visible price-axis indicator series
 *   (from the shared IndicatorPicker); values come from data.priceIndicators[name].
 * @returns {JSX.Element}
 */
const PriceChart = ({
  data, width, height, dateRange, highlightTradeIndex = null, signalTradeIndex = null, priceSeries = []
}) => {
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
    const channels = data.channels || [];
    
    // Use passed dateRange if provided and valid, otherwise calculate it
    let chartDateRange = dateRange;
    
    if (!chartDateRange || !chartDateRange[0] || !chartDateRange[1] || 
        !(chartDateRange[0] instanceof Date) || !(chartDateRange[1] instanceof Date)) {
      try {
        // Try to extract date range from prices
        chartDateRange = [
          parseExchangeTs(prices[0].date),
          parseExchangeTs(prices[prices.length - 1].date)
        ];
        
        // Validate the calculated date range
        if (isNaN(chartDateRange[0].getTime()) || isNaN(chartDateRange[1].getTime())) {
          // If dates are invalid, create a fallback range
          const now = parseExchangeTs(exchangeToday()); // UTC-faked exchange today (decision 0.18)
          chartDateRange = [
            new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            now
          ];
        }
      } catch (e) {
        // Fallback to a default range if all else fails
        console.warn('Error creating date range from prices:', e);
        const now = parseExchangeTs(exchangeToday()); // UTC-faked exchange today (decision 0.18)
        chartDateRange = [
          new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          now
        ];
      }
    }

    // Filter to only show prices within the date range
    const visiblePrices = prices.filter(price => {
      const priceDate = parseExchangeTs(price.date);
      return priceDate >= chartDateRange[0] && priceDate <= chartDateRange[1];
    });
    
    // Calculate how many candles we're displaying in the current view
    const visibleCandleCount = visiblePrices.length;
    
    // Calculate optimal candle width based on zoom level
    const candleWidthRatio = 0.8; // 80% of available space per candle
    const candleSpacing = width / Math.max(visibleCandleCount, 1);
    const candleWidth = Math.min(
      candleSpacing * candleWidthRatio, 
      20 // Maximum width in pixels
    );
    
    // Find min/max values only for visible prices (for vertical scaling)
    let minMaxPrice;
    if (visiblePrices.length > 0) {
      // Calculate min/max only for the visible price range
      minMaxPrice = findMinMaxPriceRange(visiblePrices);
    } else {
      // Fall back to the entire dataset if no visible prices
      minMaxPrice = findMinMaxPriceRange(prices);
    }
    
    // Draw chart components
    drawGrid(ctx, width, height);
    
    // Draw price candlesticks with the calculated width
    drawPriceCandlesticks(ctx, prices, chartDateRange, minMaxPrice, width, height, candleWidth);

    // Price-axis indicator overlays (MAs, bands) over the candles, under channels and signals.
    // The axis range stays candle-driven (minMaxPrice is not widened by the overlays).
    drawPriceOverlays(ctx, data.priceIndicators || {}, priceSeries, chartDateRange, minMaxPrice, width, height);

    // Draw channel lines (if any) behind signal markers, in front of candlesticks
    drawChannels(ctx, channels, chartDateRange, minMaxPrice, width, height, highlightTradeIndex);

    // Draw signals that are within the date range
    if (signals.length > 0) {
      const visibleSignals = signals.filter(signal => {
        const signalDate = parseExchangeTs(signal.date);
        return signalDate >= chartDateRange[0] && signalDate <= chartDateRange[1];
      });

      if (visibleSignals.length > 0) {
        drawSignals(
          ctx, visibleSignals, chartDateRange, minMaxPrice, width, height,
          highlightTradeIndex, signalTradeIndex
        );
      }
    }

    // Axes last, so their labels sit on top of candles / overlays / signals
    drawDateAxis(ctx, chartDateRange, width, height);
    drawPriceAxis(ctx, minMaxPrice, width, height);
    
    // Clean up function
    return () => {
      if (canvasElement) {
        const ctx = canvasElement.getContext('2d');
        ctx.clearRect(0, 0, width, height);
      }
    };
  }, [data, width, height, dateRange, highlightTradeIndex, signalTradeIndex, priceSeries]);

  return (
    <div className="chart-wrapper">
      <canvas ref={canvasRef} className="price-chart-canvas"></canvas>
    </div>
  );
};

export default PriceChart;