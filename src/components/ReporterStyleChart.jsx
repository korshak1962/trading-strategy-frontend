// src/components/ReporterStyleChart.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ReporterStyleChart.css';
import PriceChart from './charts/PriceChart';
import PnLChart from './charts/PnLChart';
import IndicatorChart from './charts/IndicatorChart';
import ChartTooltip from './charts/ChartTooltip';
import Crosshair from './charts/Crosshair';
import { findMinMaxPriceRange, deriveSignalTradeIndex, signalKey } from '../utils/ChartDrawingUtils';

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

  // Click-to-select a trade: reveals its parent/entryChild/resumptionLeg channels (nothing is
  // drawn until a signal is clicked - see drawChannels) and its own signal markers get a halo.
  // Deliberately independent of dateRange/zoom: selecting a signal does NOT change the current
  // view, and manually zooming/panning afterward does not clear the selection - the two are
  // orthogonal, so a selection made once stays visible under whatever the user zooms to next.
  const [selectedTradeIndex, setSelectedTradeIndex] = useState(null);
  const [selectedSignalReason, setSelectedSignalReason] = useState(null);
  const signalTradeIndexMap = useMemo(() => deriveSignalTradeIndex(data?.signals), [data]);
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

  // A signal marker is only ~7px (its drawn triangle half-size); nobody clicks that precisely by
  // eye, so the hit target needs to be considerably more forgiving than the marker itself.
  const SIGNAL_HIT_RADIUS_PX = 22;

  // Finds the signal nearest a point, in the Price sub-chart specifically (returns
  // {signal, dist, canvas} or null if the point isn't within that canvas or there's no visible
  // date range - regardless of distance, so callers can apply their own threshold/feedback).
  // Measures against the canvas's own bounding rect rather than reusing the crosshair's
  // container-relative math, since the price chart sits below a header this component doesn't
  // otherwise need to account for.
  const findNearestSignal = useCallback((clientX, clientY) => {
    if (!containerRef.current || !data?.signals?.length) return null;
    const canvas = containerRef.current.querySelector('.price-chart-canvas');
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    if (px < 0 || px > rect.width || py < 0 || py > rect.height) return null;

    const currentDateRange = dateRange || chartData.current.dateRange;
    if (!currentDateRange || currentDateRange.length !== 2) return null;
    const [startDate, endDate] = currentDateRange;
    const totalMs = endDate.getTime() - startDate.getTime();

    const visiblePrices = chartData.current.prices.filter(p => p.date >= startDate && p.date <= endDate);
    const minMax = findMinMaxPriceRange(visiblePrices.length > 0 ? visiblePrices : chartData.current.prices);

    let closest = null;
    let closestDist = Infinity;
    data.signals.forEach(signal => {
      const sDate = new Date(signal.date);
      if (sDate < startDate || sDate > endDate) return;
      const x = ((sDate.getTime() - startDate.getTime()) / totalMs) * rect.width;
      const y = rect.height - ((signal.price - minMax.min) / (minMax.max - minMax.min)) * rect.height;
      const dist = Math.hypot(x - px, y - py);
      if (dist < closestDist) {
        closestDist = dist;
        closest = signal;
      }
    });

    return closest ? { signal: closest, dist: closestDist, canvas } : null;
  }, [data, dateRange]);

  const findClickedSignal = useCallback((clientX, clientY) => {
    const nearest = findNearestSignal(clientX, clientY);
    return nearest && nearest.dist <= SIGNAL_HIT_RADIUS_PX ? nearest.signal : null;
  }, [findNearestSignal]);

  // The reason text shown above the chart once a signal is clicked. The backend already writes a
  // precise, factual explanation into every Signal's own comment (which channel/bars produced
  // it - see Utils.createSignal call sites in CausalChannelBreakoutStrategy) - that IS the reason
  // this signal was generated, so show it verbatim rather than re-deriving something looser.
  // Appends a plain-language note when the channel that explains this signal ends well before the
  // signal's own date - entryChild for an Open (the walk-forward "entry backlog":
  // checkForNewEntry only runs once the previous position closes, so a confirmed-but-not-yet-
  // recognized pattern can sit unclaimed a long time) or resumptionLeg for a Close (B.7: the exit
  // only fires once that recovery leg is itself confirmed, which can lag well behind where it
  // visibly completed) - since the channels drawn will sit correspondingly far from the signal
  // marker on the timeline, which is otherwise easy to mistake for the channels being wrong or
  // missing entirely.
  const getSignalReasonText = useCallback((signal, tradeIndex) => {
    if (!signal) return null;
    let text = signal.comment || `${signal.type} signal.`;

    const isOpen = signal.type.endsWith('Open');
    const relevantRole = isOpen ? 'entryChild' : 'resumptionLeg';
    const relevantChannel = (data?.channels || [])
      .find(g => g.tradeIndex === tradeIndex && g.role === relevantRole);
    if (relevantChannel) {
      const channelEnd = new Date(relevantChannel.channel.endDate).getTime();
      const gapDays = Math.round((new Date(signal.date).getTime() - channelEnd) / (1000 * 60 * 60 * 24));
      if (gapDays > 3) {
        const why = isOpen
          ? 'the strategy only looks for a new entry once the previous position closes, so an already-confirmed pattern can sit unclaimed for a while'
          : 'the exit only fires once this recovery is itself confirmed, which can lag well behind where it visibly completed';
        text += ` (The highlighted channels end ${gapDays} days before this signal - ${why}, so you may need to zoom out to see both together.)`;
      }
    }
    return text;
  }, [data]);

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

    // Cursor feedback for "you're close enough to click this signal" - a direct style mutation
    // (not React state) since it needs to update on every mouse move without forcing a re-render.
    if (!zoomActive) {
      const nearest = findNearestSignal(e.clientX, e.clientY);
      const hovering = nearest && nearest.dist <= SIGNAL_HIT_RADIUS_PX;
      const canvas = containerRef.current.querySelector('.price-chart-canvas');
      if (canvas) canvas.style.cursor = hovering ? 'pointer' : '';
    }
  }, [zoomActive, updateTooltipData, findNearestSignal]);

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

    // Get start and end dates for zoom. Divide by containerWidth BEFORE clamping to [0, 1] -
    // clamping the raw pixel offset against the literal bound 1 (instead of the ratio) collapsed
    // endRatio to ~1/containerWidth on virtually every drag, since zoomStart/zoomEnd are pixel
    // values almost always greater than 1.
    const startRatio = Math.max(0, Math.min(zoomStart, zoomEnd) / containerWidth);
    const endRatio = Math.min(1, Math.max(zoomStart, zoomEnd) / containerWidth);

    // Only apply zoom if selection is significant (more than 5% of width) - anything smaller is
    // a click, not a drag: check whether it landed on a signal and toggle trade highlighting.
    if (Math.abs(endRatio - startRatio) < 0.05) {
      const clickedSignal = findClickedSignal(e.clientX, e.clientY);
      const clickedTradeIndex = clickedSignal ? signalTradeIndexMap.get(signalKey(clickedSignal)) : undefined;

      if (clickedTradeIndex !== undefined && clickedTradeIndex !== selectedTradeIndex) {
        // New trade selected - reveal its channels (nothing was drawn before this) and the
        // reason it fired. Deliberately does NOT touch dateRange/zoom - zoom is entirely the
        // user's to control, before or after selecting; the channels just render wherever they
        // fall relative to whatever the user is currently looking at, including outside it.
        setSelectedTradeIndex(clickedTradeIndex);
        setSelectedSignalReason(getSignalReasonText(clickedSignal, clickedTradeIndex));
      } else if (selectedTradeIndex !== null) {
        // Deselecting (same signal clicked again, or empty space clicked while something was
        // selected) - clear the channels/reason, leaving the current zoom exactly as it is.
        setSelectedTradeIndex(null);
        setSelectedSignalReason(null);
      }
      // else: plain click on empty space with nothing selected - no-op (unchanged behavior).
      setZoomActive(false);
      return;
    }

    const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
    const newStartDate = new Date(currentDateRange[0].getTime() + startRatio * totalTime);
    const newEndDate = new Date(currentDateRange[0].getTime() + endRatio * totalTime);

    // Apply zoom
    setDateRange([newStartDate, newEndDate]);
    setZoomActive(false);
  }, [
    zoomActive, zoomStart, zoomEnd, dateRange, findClickedSignal, signalTradeIndexMap,
    selectedTradeIndex, getSignalReasonText
  ]);
  
  // Handle mouse wheel for zoom in/out
  const handleMouseWheel = useCallback((e) => {
    if (!containerRef.current) return;
    e.preventDefault(); // Prevent page scrolling
    
    // Get current dateRange or use the original
    const currentDateRange = dateRange || chartData.current.dateRange;
    
    if (!currentDateRange || currentDateRange.length !== 2) return;
    
    // Get container position
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // Get mouse position relative to container width
    const mouseX = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;
    const mouseRatio = mouseX / containerWidth;
    
    // Calculate current date at mouse position
    const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
    const pivotTime = currentDateRange[0].getTime() + mouseRatio * totalTime;
    const pivotDate = new Date(pivotTime);
    
    // Determine zoom direction and factor
    // Normalize wheel delta across browsers
    const delta = e.deltaY || e.detail || e.wheelDelta;
    const zoomOut = delta > 0;
    
    // Use a zoom factor of 15% per wheel tick
    const zoomFactor = zoomOut ? 1.15 : 0.85; 
    
    // Calculate new timespan
    const currentTimespan = totalTime;
    const newTimespan = currentTimespan * zoomFactor;
    
    // Calculate new start and end dates based on the pivot point
    const pivotRatio = (pivotTime - currentDateRange[0].getTime()) / totalTime;
    const newStartTime = pivotTime - (pivotRatio * newTimespan);
    const newEndTime = newStartTime + newTimespan;
    
    // Create new date objects
    const newStartDate = new Date(newStartTime);
    const newEndDate = new Date(newEndTime);
    
    // Apply bounds checking against original date range
    const originalRange = originalDateRange || chartData.current.dateRange;
    const minStartTime = originalRange[0].getTime();
    const maxEndTime = originalRange[1].getTime();
    const originalTimespan = maxEndTime - minStartTime;
    
    // Don't allow zooming out beyond original range
    if (newStartTime <= minStartTime && newEndTime >= maxEndTime) {
      setDateRange(originalRange);
      return;
    }
    
    // Don't allow zooming in too far (prevent excessive zoom)
    const minTimespan = originalTimespan * 0.01; // Minimum 1% of original range
    if (newTimespan < minTimespan) return;
    
    // Apply the zoom, keeping within the original bounds
    const boundedStart = new Date(Math.max(newStartTime, minStartTime));
    const boundedEnd = new Date(Math.min(newEndTime, maxEndTime));
    
    setDateRange([boundedStart, boundedEnd]);
  }, [dateRange, originalDateRange]);
  
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
      
      // Add wheel event listener with passive: false to prevent scrolling
      // Use all variations for cross-browser compatibility
      currentContainerRef.addEventListener('wheel', handleMouseWheel, { passive: false });
      currentContainerRef.addEventListener('mousewheel', handleMouseWheel, { passive: false });
      currentContainerRef.addEventListener('DOMMouseScroll', handleMouseWheel, { passive: false });
    }
    
    // Cleanup
    return () => {
      if (currentContainerRef) {
        currentContainerRef.removeEventListener('mousedown', handleMouseDown);
        currentContainerRef.removeEventListener('mousemove', handleMouseMove);
        currentContainerRef.removeEventListener('mouseup', handleMouseUp);
        currentContainerRef.removeEventListener('mouseleave', handleMouseLeave);
        
        currentContainerRef.removeEventListener('wheel', handleMouseWheel);
        currentContainerRef.removeEventListener('mousewheel', handleMouseWheel);
        currentContainerRef.removeEventListener('DOMMouseScroll', handleMouseWheel);
      }
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave, handleMouseWheel]);
  
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
            Click and drag horizontally to zoom in on a specific time range, or use the mouse wheel to zoom in/out.
            Click a signal to reveal the channels that produced it, at whatever zoom you're currently at.
          </div>
        </div>

        {selectedTradeIndex !== null && (
          <button
            type="button"
            className="zoom-reset-btn"
            onClick={() => { setSelectedTradeIndex(null); setSelectedSignalReason(null); }}
          >
            Clear signal selection
          </button>
        )}

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

      {selectedSignalReason && (
        <div className="signal-reason-note">
          <strong>Signal reason:</strong> {selectedSignalReason}
        </div>
      )}

      <h3 className="chart-title">Price Chart with Signals</h3>
      <div className="chart-wrapper position-relative">
        <PriceChart
          data={data}
          width={getChartWidth()}
          height={priceChartHeight}
          dateRange={dateRange}
          highlightTradeIndex={selectedTradeIndex}
          signalTradeIndex={signalTradeIndexMap}
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