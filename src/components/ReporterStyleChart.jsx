// src/components/ReporterStyleChart.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import './ReporterStyleChart.css';
import PriceChart from './charts/PriceChart';
import PnLChart from './charts/PnLChart';
import IndicatorChart from './charts/IndicatorChart';
import ChartTooltip from './charts/ChartTooltip';
import Crosshair from './charts/Crosshair';

/**
 * ReporterStyleChart component - Main container for financial charts
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
  
  // Calculate sub-chart heights
  const priceChartHeight = height * 0.6;
  const pnlChartHeight = height * 0.2;
  const indicatorChartHeight = height * 0.2;
  
  // Store data for tooltip
  const chartData = useRef({
    prices: [],
    dateRange: []
  });
  
  // Process and store data for tooltips
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
      chartData.current.dateRange = [
        new Date(data.prices[0].date),
        new Date(data.prices[data.prices.length - 1].date)
      ];
    }
  }, [data]);
  
  // Function to update tooltip data based on mouse position
  const updateTooltipData = useCallback((mouseX, mouseY) => {
    // Skip if we don't have prices
    if (!chartData.current.prices || chartData.current.prices.length === 0) return;
    
    // Find price data at mouse position
    const prices = chartData.current.prices;
    const dateRange = chartData.current.dateRange;
    
    if (prices.length > 0 && dateRange.length === 2 && containerRef.current) {
      // Calculate container width
      const containerWidth = containerRef.current.clientWidth;
      
      // Calculate date at mouse position
      const mouseRatio = mouseX / containerWidth;
      const totalTime = dateRange[1].getTime() - dateRange[0].getTime();
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
  }, [data]);
  
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
  }, [updateTooltipData]);
  
  // Calculate chart width based on container
  const getChartWidth = () => {
    if (!containerRef.current) return width;
    const containerWidth = containerRef.current.clientWidth;
    return Math.min(containerWidth - 20, width); // 20px padding
  };
  
  return (
    <div className="reporter-chart-container" ref={containerRef}>
      <h3 className="chart-title">Price Chart with Signals</h3>
      <div className="chart-wrapper position-relative">
        <PriceChart 
          data={data} 
          width={getChartWidth()} 
          height={priceChartHeight} 
          dateRange={chartData.current.dateRange}
        />
        <Crosshair 
          show={showCrosshair} 
          position={crosshairPosition} 
          horizontal={true} 
          vertical={true}
        />
      </div>
      
      <h3 className="chart-title">Individual Trade PnL</h3>
      <div className="chart-wrapper position-relative">
        <PnLChart 
          data={data} 
          width={getChartWidth()} 
          height={pnlChartHeight} 
          dateRange={chartData.current.dateRange}
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
          dateRange={chartData.current.dateRange}
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