// src/components/ReporterStyleChart.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ReporterStyleChart.css';
import PriceChart from './charts/PriceChart';
import PnLChart from './charts/PnLChart';
import CumulativePnLChart from './charts/CumulativePnLChart';
import IndicatorChart from './charts/IndicatorChart';
import ChartTooltip from './charts/ChartTooltip';
import Crosshair from './charts/Crosshair';
import { findMinMaxPriceRange, deriveSignalTradeIndex, signalKey } from '../utils/ChartDrawingUtils';
import { pointsForSeries } from '../utils/indicatorSeries';
import { extractTradesFromSignals, cumulativeClosedPnLByBar, barIndexAtOrAfter } from '../utils/ChartDataUtils';
import { parseExchangeTs, fmtExchangeIntl } from '../utils/dates';

// Pane canvases, top to bottom - used to tell which pane the cursor is over.
const PANE_CANVASES = [
  { pane: 'price', selector: '.price-chart-canvas' },
  { pane: 'trade', selector: '.pnl-chart-canvas' },
  { pane: 'cumulative', selector: '.cumulative-pnl-chart-canvas' },
  { pane: 'indicator', selector: '.indicator-chart-canvas' },
];

// Extra hit width (px, each side) around a trade bar - a 1-2 bar trade is only a few px wide.
const TRADE_HIT_SLOP_PX = 4;
// Past this distance from the container's right edge the tooltip opens to the left of the cursor.
const TOOLTIP_FLIP_MARGIN_PX = 270;

/**
 * ReporterStyleChart component - Main container for financial charts with synchronized zoom
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data including prices, signals, indicators, priceIndicators
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height
 * @param {Array<{id, name, kind, color}>} [props.visibleSeries] - indicator series to draw, from
 *   the shared IndicatorPicker. 'price' kind overlays the candles, 'sub' kind goes to the
 *   indicator pane (rendered only while at least one sub series is visible).
 * @param {boolean} [props.longLegOnly] - true when the result is NOT long-only: the chart data
 *   carries the long leg's signals only, so the PnL pane titles say "(long leg)".
 * @returns {JSX.Element}
 */
const ReporterStyleChart = ({ data, width = 1200, height = 600, visibleSeries = [], longLegOnly = false }) => {
  const containerRef = useRef(null);
  const legSuffix = longLegOnly ? ' (long leg)' : '';

  // Closed trades, paired once and shared by the trade pane, the cumulative pane and the tooltip.
  const trades = useMemo(() => extractTradesFromSignals(data?.signals || []), [data]);

  // Realized cumulative PnL per price bar - the same computation the Enhanced chart uses
  // (cumulativeClosedPnLByBar): each trade's PnL is booked on the bar it closed on (the first bar
  // at/after its close date) and carried forward.
  const cumulativePoints = useMemo(() => {
    const prices = data?.prices || [];
    if (prices.length === 0) return [];
    const barTimes = prices.map(price => parseExchangeTs(price.date).getTime());
    const closes = trades.map(trade => {
      const index = barIndexAtOrAfter(barTimes, trade.closeDate.getTime());
      return { index: index === -1 ? barTimes.length - 1 : index, pnl: trade.pnl };
    });
    const cumulative = cumulativeClosedPnLByBar(barTimes.length, closes);
    // Running count of closed trades per bar, for the tooltip ("N closed trades so far")
    const closedCount = cumulativeClosedPnLByBar(barTimes.length, closes.map(({ index }) => ({ index, pnl: 1 })));
    return barTimes.map((ms, i) => ({ date: new Date(ms), value: cumulative[i], closedCount: closedCount[i] }));
  }, [data, trades]);

  // Split once per selection change - PriceChart / IndicatorChart key their draw effects on these.
  const priceSeries = useMemo(() => visibleSeries.filter(series => series.kind === 'price'), [visibleSeries]);
  const subSeries = useMemo(() => visibleSeries.filter(series => series.kind === 'sub'), [visibleSeries]);
  
  // State for crosshair position
  // x: relative to the plot (all panes share it); y: relative to the hovered pane's canvas
  const [crosshairPosition, setCrosshairPosition] = useState({ x: 0, y: 0 });
  const [hoverPane, setHoverPane] = useState(null);
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

  // Drawable width of the chart wrappers (container content box minus the wrapper border).
  // Measured with a ResizeObserver so the canvases always fill the wrapper exactly: drawing at
  // the raw `width` prop (1200) inside a narrower `overflow: hidden` wrapper silently clips the
  // most recent bars off the right edge.
  const [measuredWidth, setMeasuredWidth] = useState(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const inner = Math.floor(el.clientWidth - padding - 2); // 2 = chart-wrapper border
      // Only commit real changes: a state update per observer tick would re-render (and redraw
      // three canvases) on every no-op notification.
      if (inner > 0) setMeasuredWidth(prev => (prev === inner ? prev : inner));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Bounding rect of the price canvas - the single source of truth for mouse -> date mapping.
  // The container is wider than the canvas (padding, borders), so using its rect skews the
  // tooltip/zoom by a few bars.
  const getPlotRect = useCallback(() => {
    const canvas = containerRef.current?.querySelector('.price-chart-canvas');
    return canvas ? canvas.getBoundingClientRect() : null;
  }, []);
  
  // Calculate sub-chart heights
  // Shares add up to 1.0 with every pane shown, so the fullscreen layout (which passes the
  // available height) still fits after the cumulative pane was added.
  const priceChartHeight = height * 0.55;
  const pnlChartHeight = height * 0.15;
  const cumulativeChartHeight = height * 0.15;
  const indicatorChartHeight = height * 0.15;
  
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
      date: parseExchangeTs(price.date),
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume
    }));
    
    // Store date range
    if (data.prices.length > 0) {
      const range = [
        parseExchangeTs(data.prices[0].date),
        parseExchangeTs(data.prices[data.prices.length - 1].date)
      ];
      
      chartData.current.dateRange = range;
      
      // Initialize dateRange state if it's not already set
      if (!dateRange) {
        setDateRange(range);
        setOriginalDateRange(range);
      }
    }
  }, [data, dateRange]);
  
  // Which pane canvas contains the pointer ('price' | 'trade' | 'cumulative' | 'indicator'),
  // plus the pointer's y within it. Null between panes (titles, gaps).
  const getHoveredPane = useCallback((clientY) => {
    const container = containerRef.current;
    if (!container) return null;
    for (const { pane, selector } of PANE_CANVASES) {
      const canvas = container.querySelector(selector);
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return { pane, y: clientY - rect.top };
    }
    return null;
  }, []);

  // Function to update tooltip data based on mouse position.
  // mouseX is plot-relative (drives the date); tooltipPos is container-relative (placement - the
  // container is the tooltip's offset parent, so price-canvas coordinates put it too high on
  // the lower panes).
  const updateTooltipData = useCallback((mouseX, pane, tooltipPos) => {
    // Skip if we don't have prices
    if (!chartData.current.prices || chartData.current.prices.length === 0) return;

    // Find price data at mouse position
    const prices = chartData.current.prices;
    const currentDateRange = dateRange || chartData.current.dateRange;

    const plotRect = getPlotRect();
    if (prices.length > 0 && currentDateRange.length === 2 && plotRect && plotRect.width > 0) {
      // Calculate date at mouse position
      const mouseRatio = mouseX / plotRect.width;
      const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
      const mouseMs = currentDateRange[0].getTime() + mouseRatio * totalTime;
      const containerWidth = containerRef.current?.clientWidth ?? plotRect.width;
      const placement = {
        position: tooltipPos,
        flip: tooltipPos.x > containerWidth - TOOLTIP_FLIP_MARGIN_PX
      };

      // Individual Trade PnL pane: the trade(s) whose bar spans the cursor - not prices.
      if (pane === 'trade') {
        const slopMs = (TRADE_HIT_SLOP_PX / plotRect.width) * totalTime;
        const hits = trades.filter(trade =>
          trade.openDate.getTime() - slopMs <= mouseMs && mouseMs <= trade.closeDate.getTime() + slopMs
        );
        setTooltipData({ kind: 'trade', date: new Date(mouseMs), trades: hits, legLabel: legSuffix, ...placement });
        return;
      }

      // Find closest price point
      let closestIndex = -1;
      let minTimeDiff = Infinity;
      prices.forEach((price, index) => {
        const timeDiff = Math.abs(price.date.getTime() - mouseMs);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestIndex = index;
        }
      });
      const closestPrice = prices[closestIndex];
      if (!closestPrice) return;

      // Cumulative PnL pane: the realized total at this bar.
      if (pane === 'cumulative') {
        const point = cumulativePoints[closestIndex];
        if (!point) return;
        setTooltipData({
          kind: 'cumulative',
          date: closestPrice.date,
          value: point.value,
          closedCount: point.closedCount,
          legLabel: legSuffix,
          ...placement
        });
        return;
      }

      // Find signals for this price point
      let signals = [];
      if (data && data.signals) {
        signals = data.signals.filter(signal => 
          parseExchangeTs(signal.date).getTime() === closestPrice.date.getTime()
        );
      }
      
      // Indicator values at this bar - only the visible series, in picker order, with colour
      const closestMs = closestPrice.date.getTime();
      const indicatorValues = [];
      visibleSeries.forEach(series => {
        const matchingIndicator = pointsForSeries(data, series).find(ind =>
          parseExchangeTs(ind.date).getTime() === closestMs
        );
        if (matchingIndicator && typeof matchingIndicator.value === 'number' && !Number.isNaN(matchingIndicator.value)) {
          indicatorValues.push({ name: series.name, value: matchingIndicator.value, color: series.color });
        }
      });
      
      setTooltipData({
        kind: 'price',
        price: closestPrice,
        signals,
        indicators: indicatorValues,
        ...placement
      });
    }
  }, [data, dateRange, visibleSeries, getPlotRect, trades, cumulativePoints, legSuffix]);

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
      const sDate = parseExchangeTs(signal.date);
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
      const channelEnd = parseExchangeTs(relevantChannel.channel.endDate).getTime();
      const gapDays = Math.round((parseExchangeTs(signal.date).getTime() - channelEnd) / (1000 * 60 * 60 * 24));
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
    
    const plotRect = getPlotRect();
    if (!plotRect) return;
    
    // Get mouse position relative to the plot
    const x = e.clientX - plotRect.left;
    
    // Start zoom selection
    setZoomActive(true);
    setZoomStart(x);
    setZoomEnd(x);
  }, [getPlotRect]);
  
  // Handle mouse move for zoom selection
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return;
    
    const plotRect = getPlotRect();
    if (!plotRect) return;
    
    // Get mouse position relative to the plot
    const x = e.clientX - plotRect.left;
    const hovered = getHoveredPane(e.clientY);

    // Update crosshair position (horizontal line only on the pane under the cursor)
    setCrosshairPosition({ x, y: hovered ? hovered.y : 0 });
    setHoverPane(hovered ? hovered.pane : null);
    setShowCrosshair(true);

    // Find tooltip data - its body depends on the pane under the cursor
    if (hovered) {
      const containerRect = containerRef.current.getBoundingClientRect();
      updateTooltipData(x, hovered.pane, {
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top
      });
    } else {
      setTooltipData(null);
    }

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
  }, [zoomActive, updateTooltipData, findNearestSignal, getPlotRect, getHoveredPane]);

  // Handle mouse up for zoom selection end
  const handleMouseUp = useCallback((e) => {
    if (!zoomActive || !containerRef.current) {
      setZoomActive(false);
      return;
    }

    // Calculate zoom range
    const plotRect = getPlotRect();
    const containerWidth = plotRect ? plotRect.width : containerRef.current.clientWidth;
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
    selectedTradeIndex, getSignalReasonText, getPlotRect
  ]);
  
  // Handle mouse wheel for zoom in/out
  const handleMouseWheel = useCallback((e) => {
    if (!containerRef.current) return;
    e.preventDefault(); // Prevent page scrolling
    
    // Get current dateRange or use the original
    const currentDateRange = dateRange || chartData.current.dateRange;
    
    if (!currentDateRange || currentDateRange.length !== 2) return;
    
    const plotRect = getPlotRect();
    if (!plotRect || plotRect.width === 0) return;
    
    // Get mouse position relative to the plot width
    const mouseX = e.clientX - plotRect.left;
    const mouseRatio = mouseX / plotRect.width;
    
    // Calculate current date at mouse position
    const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
    const pivotTime = currentDateRange[0].getTime() + mouseRatio * totalTime;
    
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
  }, [dateRange, originalDateRange, getPlotRect]);
  
  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setShowCrosshair(false);
    setHoverPane(null);
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
  const getChartWidth = () => measuredWidth ?? width;
  
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
    // UTC-faked exchange wall clock (decision 0.18) — never the browser zone.
    return fmtExchangeIntl(date, { 
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
          priceSeries={priceSeries}
        />
        <Crosshair 
          show={showCrosshair} 
          position={crosshairPosition} 
          horizontal={hoverPane === 'price'}
          vertical={true}
        />
        {renderZoomSelection()}
      </div>

      <h3 className="chart-title">Individual Trade PnL{legSuffix}</h3>
      <div className="chart-wrapper position-relative">
        <PnLChart
          data={data}
          width={getChartWidth()}
          height={pnlChartHeight}
          dateRange={dateRange}
          trades={trades}
        />
        <Crosshair
          show={showCrosshair}
          position={crosshairPosition}
          horizontal={hoverPane === 'trade'}
          vertical={true}
        />
      </div>

      <h3 className="chart-title">Cumulative PnL (closed trades{longLegOnly ? ', long leg' : ''})</h3>
      <div className="chart-wrapper position-relative">
        <CumulativePnLChart
          points={cumulativePoints}
          hasTrades={trades.length > 0}
          width={getChartWidth()}
          height={cumulativeChartHeight}
          dateRange={dateRange}
        />
        <Crosshair
          show={showCrosshair}
          position={crosshairPosition}
          horizontal={hoverPane === 'cumulative'}
          vertical={true}
        />
      </div>
      
      {/* Sub-pane indicators - only while some sub series is selected in the picker */}
      {subSeries.length > 0 && (
        <>
          <h3 className="chart-title">Indicator Chart</h3>
          <div className="chart-wrapper position-relative">
            <IndicatorChart 
              data={data} 
              width={getChartWidth()} 
              height={indicatorChartHeight} 
              dateRange={dateRange}
              subSeries={subSeries}
            />
            <Crosshair 
              show={showCrosshair} 
              position={crosshairPosition} 
              horizontal={hoverPane === 'indicator'}
              vertical={true}
            />
          </div>
        </>
      )}
      
      {/* Render tooltip if data available */}
      <ChartTooltip tooltipData={tooltipData} />
    </div>
  );
};

export default ReporterStyleChart;