// src/components/ReporterStyleChart.jsx
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ReporterStyleChart.css';
import PriceChart from './charts/PriceChart';
import PnLChart from './charts/PnLChart';
import CumulativePnLChart from './charts/CumulativePnLChart';
import IndicatorChart from './charts/IndicatorChart';
import ChartTooltip from './charts/ChartTooltip';
import Crosshair from './charts/Crosshair';
import RangeSlider, { RANGE_SLIDER_HEIGHT, RANGE_SLIDER_DATES_HEIGHT } from './charts/RangeSlider';
import {
  findMinMaxPriceRange, deriveSignalTradeIndex, signalKey, plotDateRange, DATE_AXIS_BAND,
  windowGlyphPoint, WINDOW_GLYPH_R
} from '../utils/ChartDrawingUtils';
import { pointsForSeries, seriesLabel } from '../utils/indicatorSeries';
import { LEVEL_ZONE_DESCRIPTIONS, LEVEL_CHART_DESCRIPTIONS } from '../utils/indicatorDescriptions';
import { normalizeLevelChart, statusLine, matchTradeAnnotation, byZoneLowThenId } from '../utils/levelChart';
import IndicatorPicker from './IndicatorPicker';
import { extractTradesFromSignals, cumulativeClosedPnLByBar, barIndexAtOrAfter } from '../utils/ChartDataUtils';
import { parseExchangeTs, fmtExchangeIntl } from '../utils/dates';
import { useElementSize } from '../hooks/useElementSize';
import {
  buildLevelZoneRuns, hasLevelZones, clampNearestN, LEVEL_ZONES_MAX_N, LEVEL_ZONES_DEFAULT_SETTINGS
} from '../utils/levelZones';

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
// Height the range slider (under the price pane) takes out of the `height` budget (track + its
// date row + container flex gap), so the stack still fits the height the fullscreen layout passes in.
const RANGE_SLIDER_BLOCK_PX = RANGE_SLIDER_HEIGHT + 2 + RANGE_SLIDER_DATES_HEIGHT + 16;
// Mouse events inside the range slider belong to the slider (recharts Brush), not to the
// container's drag-zoom / crosshair handlers.
const isInRangeSlider = (target) => Boolean(target?.closest?.('.reporter-range-slider'));
// Likewise the level zone controls: clicking a checkbox / scrolling the N field must not start a
// drag-zoom, clear the signal selection or wheel-zoom the chart.
const isInLevelZoneControls = (target) => Boolean(target?.closest?.('.level-zones-controls'));
// Same for the price legend's toggles and the controls row's buttons: a click on them is not a
// click on the chart (it would otherwise clear the selected signal).
const isInChartUi = (target) => Boolean(target?.closest?.('.price-legend, .chart-controls'));
// The wheel zooms only over the panes and the range slider; over the controls, legend, titles or
// the signal-reason note it scrolls the page as usual.
const isWheelZoomTarget = (target) => Boolean(target?.closest?.('.chart-wrapper, .reporter-range-slider'));
// fitHeight mode: initial guess for the chart's non-pane chrome (controls row, pane titles, flex
// gaps, padding, wrapper borders); replaced by the measured value after the first layout.
const DEFAULT_FIT_CHROME_PX = 250;
// fitHeight mode: smallest pane budget. With the shares below, 400 keeps the price pane >= 220px
// (0.55 * 400; 0.70 * 400 = 280 without the indicator pane) and every sub-pane >= 60px
// (0.15 * 400). On a short screen the block then grows past the first screen and the fullscreen
// container scrolls; on a tall screen the budget is above it and the block fills the screen exactly.
const MIN_FIT_PANE_BUDGET_PX = 400;
// Level zone display settings (N nearest, weak zones, all strong zones), remembered per browser.
const LEVEL_ZONES_STORAGE_KEY = 'reporterChart.levelZones.v1';
const NO_RUNS = [];
// Setup-window hit test (tooltip): extra px around the retest band / runaway line, and the radius
// around a window-end glyph.
const WINDOW_HIT_SLOP_PX = 4;
const GLYPH_HIT_PX = WINDOW_GLYPH_R + 4;
// A signal marker is only ~7px (its drawn triangle half-size); nobody clicks that precisely by
// eye, so the hit target needs to be considerably more forgiving than the marker itself.
const SIGNAL_HIT_RADIUS_PX = 22;

// Value of every series at each bar time, built once per result: Map<seriesId, Map<ms, number>>
// (seriesId = `${kind}:${name}`, see indicatorSeries.js). The tooltip reads it on every mouse move
// instead of scanning the point lists.
const buildSeriesValueIndex = (data) => {
  const index = new Map();
  const add = (kind, source) => {
    Object.entries(source || {}).forEach(([name, points]) => {
      const byMs = new Map();
      (points || []).forEach(point => {
        const ms = parseExchangeTs(point.date).getTime();
        if (!Number.isNaN(ms) && typeof point.value === 'number' && !Number.isNaN(point.value)) {
          byMs.set(ms, point.value);
        }
      });
      index.set(`${kind}:${name}`, byMs);
    });
  };
  add('price', data?.priceIndicators);
  add('sub', data?.indicators);
  return index;
};

// Vertical (price-axis) zoom. The value-axis labels sit at the left of the price pane (drawValueAxis
// draws them from x=18, ~35px wide); this strip is the "price axis" the drag / wheel / double-click
// gestures act on.
const PRICE_AXIS_HIT_PX = 56;
// Axis drag: range factor per px dragged (exp, so up and down are symmetric). Drag up = zoom in.
const Y_DRAG_SENSITIVITY = 0.006;
// Wheel step for the price axis, same 15% as the horizontal wheel zoom, per WHEEL_NOTCH_PX of
// wheel delta - so a trackpad pinch (a stream of small Ctrl+wheel deltas) zooms smoothly instead
// of 15% per event. One event is capped at Y_WHEEL_MAX_NOTCHES notches.
const Y_WHEEL_FACTOR = 1.15;
const WHEEL_NOTCH_PX = 100;
const Y_WHEEL_MAX_NOTCHES = 3;
// Vertical pan limit: at least this fraction of the price pane's height must stay over the
// auto-fit price range of the visible candles, so the candles cannot be panned out of sight.
const Y_PAN_MIN_OVERLAP = 0.1;
// Manual price span limits, relative to the auto-fit span of the visible candles.
const Y_MIN_SPAN_RATIO = 0.01;
const Y_MAX_SPAN_RATIO = 50;
// Price-only fullscreen: smallest price pane height.
const MIN_PRICE_ONLY_PANE_PX = 200;

const loadLevelZoneSettings = () => {
  try {
    const raw = window.localStorage.getItem(LEVEL_ZONES_STORAGE_KEY);
    if (!raw) return { ...LEVEL_ZONES_DEFAULT_SETTINGS };
    const stored = JSON.parse(raw) || {};
    return {
      nearestN: clampNearestN(stored.nearestN ?? LEVEL_ZONES_DEFAULT_SETTINGS.nearestN),
      showWeak: stored.showWeak === true,
      allStrong: stored.allStrong === true,
    };
  } catch {
    return { ...LEVEL_ZONES_DEFAULT_SETTINGS };
  }
};

const saveLevelZoneSettings = (settings) => {
  try {
    window.localStorage.setItem(LEVEL_ZONES_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private window, blocked site data) - the settings just aren't kept
  }
};

/**
 * ReporterStyleChart component - Main container for financial charts with synchronized zoom
 * @param {Object} props - Component props
 * @param {Object} props.data - Chart data including prices, signals, indicators, priceIndicators
 * @param {number} props.width - Chart width
 * @param {number} props.height - Chart height: the panes + range slider budget, or with
 *   `fitHeight` the total outer height of the whole chart block.
 * @param {boolean} [props.fitHeight] - fullscreen layout: the chart measures its own non-pane
 *   chrome (controls row, titles, gaps) and sizes the panes so the block is exactly `height` tall.
 * @param {Array<{id, name, kind, color}>} [props.visibleSeries] - indicator series to draw, from
 *   the shared IndicatorPicker. 'price' kind overlays the candles, 'sub' kind goes to the
 *   indicator pane (rendered only while at least one sub series is visible).
 * @param {boolean} [props.longLegOnly] - true when the result is NOT long-only but the chart data
 *   carries the long leg's signals only (an older backend without `data.includesShortSignals`),
 *   so the PnL pane titles say "(long leg)". When the backend merges the short leg's signals in
 *   (`data.includesShortSignals`) the caller passes false and the panes cover long + short.
 * @param {Object} [props.indicatorSelection] - the shared indicator selection (App's
 *   useIndicatorSelection: seriesList, showIndicators, setShowIndicators, selectedIds, toggleSeries).
 *   Its 'price' series are listed in the legend right above the price pane, where each item also
 *   toggles its series - the same state as the IndicatorPicker, so the two stay in sync. Without
 *   it the legend lists only the visible price series, read-only.
 * @returns {JSX.Element}
 */
const ReporterStyleChart = ({
  data, width = 1200, height = 600, fitHeight = false, visibleSeries = [], longLegOnly = false,
  indicatorSelection = null
}) => {
  const containerRef = useRef(null);
  const legSuffix = longLegOnly ? ' (long leg)' : '';

  // Closed trades, paired once and shared by the trade pane, the cumulative pane and the tooltip.
  const trades = useMemo(() => extractTradesFromSignals(data?.signals || []), [data]);

  // Realized cumulative PnL per price bar (cumulativeClosedPnLByBar): each trade's PnL is booked on the bar it closed on (the first bar
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

  // Legend next to the price pane: the shared selection (App's useIndicatorSelection) - or, without
  // one, a read-only list of the drawn series.
  const legendSelection = useMemo(() => indicatorSelection || {
    seriesList: visibleSeries,
    showIndicators: true,
    selectedIds: new Set(visibleSeries.map(series => series.id)),
  }, [indicatorSelection, visibleSeries]);

  // Level zones (LevelBreakoutRetest only - other strategies send none and get no controls).
  // Selection per bar is done here, once per result/setting change, not on every redraw.
  const showLevelZoneControls = hasLevelZones(data);
  const [levelZoneSettings, setLevelZoneSettings] = useState(loadLevelZoneSettings);
  const updateLevelZoneSettings = useCallback((patch) => {
    setLevelZoneSettings(prev => ({ ...prev, ...patch }));
  }, []);
  // Persisted after commit, not inside the state updater (updaters must stay pure).
  useEffect(() => { saveLevelZoneSettings(levelZoneSettings); }, [levelZoneSettings]);
  // The N field's text while it is being edited (null = show the applied value). Lets the field be
  // cleared / retyped; the applied N only ever takes valid, clamped values. Typing a number applies
  // it at once; blur or Enter commits - an empty / invalid entry falls back to the last valid N.
  const [nearestNDraft, setNearestNDraft] = useState(null);
  const handleNearestNChange = useCallback((e) => {
    const raw = e.target.value;
    setNearestNDraft(raw);
    if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
      updateLevelZoneSettings({ nearestN: clampNearestN(raw) });
    }
  }, [updateLevelZoneSettings]);
  const commitNearestN = useCallback(() => setNearestNDraft(null), []);
  const levelZoneRuns = useMemo(() => {
    if (!hasLevelZones(data)) return NO_RUNS;
    return buildLevelZoneRuns(data.prices, data.levelZones, levelZoneSettings);
  }, [data, levelZoneSettings]);

  // LevelBreakoutRetest buy / sell annotations (data.levelChart; null for other strategies and
  // older backends - then nothing below changes the chart). Normalized once per result.
  const levelChart = useMemo(() => normalizeLevelChart(data?.levelChart, data?.prices), [data]);
  // "Events" toggle, off by default; not persisted. Shows the event markers and the setup windows
  // that ended while the position was long (§4.1).
  const [showEvents, setShowEvents] = useState(false);
  const hasEvents = Boolean(levelChart && levelChart.events.length > 0);
  // Series values by bar time, for the tooltip's indicator rows and status line.
  const seriesValueIndex = useMemo(() => buildSeriesValueIndex(data), [data]);
  const seriesValueAt = useCallback((name, barIndex) => {
    const ms = levelChart?.barTimes[barIndex];
    const value = seriesValueIndex.get(`price:${name}`)?.get(ms);
    return value === undefined ? NaN : value;
  }, [levelChart, seriesValueIndex]);
  // "Show indicators" also hides the setup windows' band and lines (§4.1); markers, glyphs, "↑",
  // the support zone and the position shading stay.
  const showLevelLines = Boolean(legendSelection.showIndicators);

  // Price-only fullscreen: just the price pane (+ zone controls, slider) filling the viewport.
  // Independent of App's "Fullscreen" (whole results area): it is a fixed overlay over the
  // viewport, and when nothing is natively fullscreen yet it also requests native fullscreen on
  // this container. Exits with its button, Esc, or whenever the native fullscreen state changes
  // away from this container (the browser eats Esc in native fullscreen and only reports the change).
  const [priceOnly, setPriceOnly] = useState(false);
  // Entered while another element (App's "Fullscreen") was natively fullscreen: then a real Esc is
  // taken by the browser and leaves that fullscreen too, so the button must not promise "Esc".
  const [priceOnlyNested, setPriceOnlyNested] = useState(false);
  // Read by measureFitChrome (a layout effect). Synced in a layout effect declared before it, so it
  // is already current when that effect runs in the same commit - not assigned during render.
  const priceOnlyRef = useRef(false);
  useLayoutEffect(() => { priceOnlyRef.current = priceOnly; }, [priceOnly]);
  const priceOnlyToggleRef = useRef(null);
  // The legend above the price pane lists only what that pane draws: the price-axis series. Sub-pane
  // series ("long PnL", "current PnL", RSI, ...) change nothing there and are toggled from the
  // toolbar IndicatorPicker above the chart (also present in App's fullscreen).
  const legendSeriesList = useMemo(
    () => (legendSelection.seriesList || []).filter(series => series.kind === 'price'),
    [legendSelection]
  );
  const [pricePaneNode, setPricePaneNode] = useState(null);
  const pricePaneSize = useElementSize(pricePaneNode);
  const enterPriceOnly = useCallback(() => {
    setPriceOnly(true);
    const el = containerRef.current;
    setPriceOnlyNested(Boolean(document.fullscreenElement && document.fullscreenElement !== el));
    if (el && !document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => { /* denied - the fixed overlay still fills the viewport */ });
    }
  }, []);
  const exitPriceOnly = useCallback(() => {
    setPriceOnly(false);
    if (containerRef.current && document.fullscreenElement === containerRef.current) {
      document.exitFullscreen?.().catch(() => { /* already left fullscreen */ });
    }
  }, []);
  useEffect(() => {
    if (!priceOnly) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') exitPriceOnly(); };
    const onFullscreenChange = () => {
      if (document.fullscreenElement !== containerRef.current) setPriceOnly(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [priceOnly, exitPriceOnly]);

  // Price-only is modal: focus moves into it on entry and stays there (Tab / Shift+Tab wrap inside
  // the container, focus landing outside is pulled back), so keyboard users cannot reach the
  // controls hidden behind the overlay. On exit focus returns to the toggle button.
  useEffect(() => {
    if (!priceOnly) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const focusables = () => Array.from(container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.getClientRects().length > 0 && el.getAttribute('aria-hidden') !== 'true');
    const toggle = priceOnlyToggleRef.current;
    (toggle || focusables()[0] || container).focus({ preventScroll: true });
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!container.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (e) => {
      if (!container.contains(e.target)) (focusables()[0] || container).focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      // Back on the (same) toggle button, now labelled "Price chart only".
      if (toggle && toggle.isConnected) toggle.focus({ preventScroll: true });
    };
  }, [priceOnly]);

  // Vertical zoom: a manual price-axis range, or null = auto-fit to the visible candles (what
  // PriceChart does by itself). Once set it stays put under horizontal zoom / pan (like a manually
  // scaled price axis elsewhere) until Reset Zoom, "Auto-fit price axis" or a double-click on the axis.
  const [priceYRange, setPriceYRange] = useState(null);
  const [yDrag, setYDrag] = useState(null); // {mode: 'scale'|'pan', startY, start: {min,max}, height}

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
  
  // fitHeight: non-pane chrome = rendered block height - the panes' canvases - the slider block.
  // Canvases and block are measured in the same pass, so the value does not depend on whether
  // the canvases already picked up the latest heights - no feedback oscillation. Measured after
  // layout and again whenever the block resizes (the chrome changes e.g. when the signal-reason
  // note appears or the controls row re-wraps); the 1px tolerance swallows sub-pixel jitter.
  const [fitChromePx, setFitChromePx] = useState(DEFAULT_FIT_CHROME_PX);
  const measureFitChrome = useCallback(() => {
    const el = containerRef.current;
    if (!el || priceOnlyRef.current) return; // price-only lays out the price pane by flex instead
    const panes = PANE_CANVASES.reduce((sum, { selector }) => {
      const canvas = el.querySelector(selector);
      return sum + (canvas ? canvas.getBoundingClientRect().height : 0);
    }, 0);
    if (panes <= 0) return;
    const chrome = Math.ceil(el.getBoundingClientRect().height - panes - RANGE_SLIDER_BLOCK_PX);
    if (chrome > 0) setFitChromePx(prev => (Math.abs(chrome - prev) > 1 ? chrome : prev));
  }, []);
  useLayoutEffect(() => {
    if (fitHeight) measureFitChrome();
  }, [fitHeight, height, width, priceOnly, measureFitChrome]);
  useEffect(() => {
    const el = containerRef.current;
    if (!fitHeight || !el) return;
    const observer = new ResizeObserver(measureFitChrome);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitHeight, measureFitChrome]);

  // Calculate sub-chart heights
  // Shares add up to 1.0 with every pane shown, so the fullscreen layout (which passes the
  // available height) still fits after the cumulative pane was added.
  // The range slider's block is taken off the top so it fits too; with fitHeight the measured
  // chrome as well, and the indicator pane's share goes to the price pane while it is hidden.
  const paneBudget = Math.max(fitHeight ? MIN_FIT_PANE_BUDGET_PX : 200, height - RANGE_SLIDER_BLOCK_PX - (fitHeight ? fitChromePx : 0));
  const hasIndicatorPane = subSeries.length > 0;
  // Price-only fullscreen: the price pane's wrapper takes the remaining viewport height (flex), and
  // the canvas is sized to it.
  const priceChartHeight = priceOnly
    ? Math.max(MIN_PRICE_ONLY_PANE_PX, Math.floor(pricePaneSize.height))
    : paneBudget * (fitHeight && !hasIndicatorPane ? 0.70 : 0.55);
  const pnlChartHeight = paneBudget * 0.15;
  const cumulativeChartHeight = paneBudget * 0.15;
  const indicatorChartHeight = paneBudget * 0.15;
  
  // Store data for tooltip
  const chartData = useRef({
    prices: [],
    dateRange: []
  });
  
  // Process and store data for tooltips and zoom
  useEffect(() => {
    // A new result always drops the previous result's zoom and selection.
    setSelectedTradeIndex(null);
    setSelectedSignalReason(null);
    setPriceYRange(null);
    if (!data || !data.prices || data.prices.length === 0) {
      // No bars: clear rather than keep the previous result's tooltip prices and zoom range.
      chartData.current.prices = [];
      chartData.current.dateRange = [];
      setDateRange(null);
      setOriginalDateRange(null);
      return;
    }

    // Store processed price data
    chartData.current.prices = data.prices.map(price => ({
      date: parseExchangeTs(price.date),
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume
    }));
    
    // Store date range. A new result (new `data` identity) always starts at the full range -
    // the zoom and any signal selection belong to the previous result.
    const range = [
      parseExchangeTs(data.prices[0].date),
      parseExchangeTs(data.prices[data.prices.length - 1].date)
    ];
    chartData.current.dateRange = range;
    setDateRange(range);
    setOriginalDateRange(range);
  }, [data]);

  // Bottom range slider rows: one per bar (stable identity per result, so the Brush keeps state).
  const sliderRows = useMemo(() => (data?.prices || []).map(price => ({
    ms: parseExchangeTs(price.date).getTime(),
    close: price.close
  })), [data]);

  // What the panes actually draw: dateRange widened by half a candle slot each side so the edge
  // candles are not cut in half. Every pane gets this, and every mouse <-> time mapping below
  // uses it, so they all agree; dateRange itself stays the logical zoom window (slider, badge).
  const plotRange = useMemo(
    () => plotDateRange(dateRange, sliderRows.map(row => row.ms)),
    [dateRange, sliderRows]
  );

  // The auto-fit price range PriceChart draws without a manual range: the candles in the logical
  // window (dateRange), padded - the base for vertical zoom gestures and their span limits.
  const autoPriceRange = useMemo(() => {
    const prices = data?.prices || [];
    if (prices.length === 0) return null;
    if (!dateRange) return findMinMaxPriceRange(prices);
    const startMs = dateRange[0].getTime();
    const endMs = dateRange[1].getTime();
    const visible = prices.filter(price => {
      const ms = parseExchangeTs(price.date).getTime();
      return ms >= startMs && ms <= endMs;
    });
    return findMinMaxPriceRange(visible.length > 0 ? visible : prices);
  }, [data, dateRange]);
  const effectivePriceRange = priceYRange || autoPriceRange;

  // Keeps a manual price range's span within limits relative to the auto-fit span.
  const clampPriceRange = useCallback((min, max) => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    const autoSpan = autoPriceRange ? autoPriceRange.max - autoPriceRange.min : max - min;
    if (!(autoSpan > 0)) return { min, max };
    const span = Math.min(autoSpan * Y_MAX_SPAN_RATIO, Math.max(autoSpan * Y_MIN_SPAN_RATIO, max - min));
    const center = (min + max) / 2;
    return { min: center - span / 2, max: center + span / 2 };
  }, [autoPriceRange]);

  // Keeps a manual price range's position within limits: at least Y_PAN_MIN_OVERLAP of the pane
  // height stays over the auto-fit range, i.e. min in [autoMin - (1 - k)*span, autoMax - k*span].
  // The span is unchanged; null passes through.
  const boundPriceRange = useCallback((range) => {
    if (!range || !autoPriceRange) return range;
    const span = range.max - range.min;
    const lo = autoPriceRange.min - (1 - Y_PAN_MIN_OVERLAP) * span;
    const hi = autoPriceRange.max - Y_PAN_MIN_OVERLAP * span;
    if (!(span > 0) || !(hi >= lo)) return range;
    const min = Math.min(hi, Math.max(lo, range.min));
    return min === range.min ? range : { min, max: min + span };
  }, [autoPriceRange]);

  // Pointer position over the price canvas, or null when outside it. `onAxis`: in the price-axis strip.
  const getPricePanePoint = useCallback((clientX, clientY) => {
    const canvas = containerRef.current?.querySelector('.price-chart-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    if (px < 0 || px > rect.width || py < 0 || py > rect.height || rect.height <= 0) return null;
    return { px, py, height: rect.height, onAxis: px <= PRICE_AXIS_HIT_PX };
  }, []);

  // Price-axis drag in progress: follow the pointer on window, so it keeps working outside the pane.
  useEffect(() => {
    if (!yDrag) return;
    const onMove = (e) => {
      // Button released outside the window (no mouseup reached us): end the drag instead of sticking.
      if (e.buttons === 0) { setYDrag(null); return; }
      const dy = e.clientY - yDrag.startY;
      const { min, max } = yDrag.start;
      if (yDrag.mode === 'scale') {
        const factor = Math.exp(dy * Y_DRAG_SENSITIVITY); // drag up (dy < 0) = zoom in
        const center = (min + max) / 2;
        const half = ((max - min) / 2) * factor;
        setPriceYRange(boundPriceRange(clampPriceRange(center - half, center + half)));
      } else {
        const shift = (dy / yDrag.height) * (max - min); // content follows the pointer
        setPriceYRange(boundPriceRange({ min: min + shift, max: max + shift }));
      }
    };
    const onUp = () => setYDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [yDrag, clampPriceRange, boundPriceRange]);

  // dateRange -> slider indices: first bar at/after the range start, last bar at/before its end.
  // Derived (not separate state), so wheel zoom / drag zoom / Reset Zoom move the slider and
  // there is nothing to keep in sync.
  const sliderIndices = useMemo(() => {
    const n = sliderRows.length;
    const last = Math.max(0, n - 1);
    if (n === 0 || !dateRange) return { startIndex: 0, endIndex: last };
    const barTimes = sliderRows.map(row => row.ms);
    let startIndex = barIndexAtOrAfter(barTimes, dateRange[0].getTime());
    if (startIndex === -1) startIndex = last;
    const afterEnd = barIndexAtOrAfter(barTimes, dateRange[1].getTime() + 1);
    let endIndex = afterEnd === -1 ? last : afterEnd - 1;
    // A window narrower than one bar holds no bar: show the bar it starts on.
    if (endIndex < startIndex) endIndex = startIndex;
    return { startIndex, endIndex };
  }, [sliderRows, dateRange]);

  // Slider -> dateRange: snap to the bar dates. Only called when the indices actually changed
  // (RangeSlider compares), and the derived indices then equal these, so there is no loop.
  const handleSliderChange = useCallback(({ startIndex, endIndex }) => {
    const start = sliderRows[startIndex];
    const end = sliderRows[endIndex];
    if (!start || !end) return;
    setDateRange([new Date(start.ms), new Date(end.ms)]);
  }, [sliderRows]);
  
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

  // The price axis PriceChart is drawing right now: the manual range, else the auto-fit of the
  // candles in the logical window.
  const currentPriceScale = useCallback(() => {
    if (priceYRange) return priceYRange;
    const currentDateRange = plotRange || chartData.current.dateRange;
    if (!currentDateRange || currentDateRange.length !== 2) return null;
    const [startDate, endDate] = dateRange || currentDateRange;
    const visiblePrices = chartData.current.prices.filter(p => p.date >= startDate && p.date <= endDate);
    return findMinMaxPriceRange(visiblePrices.length > 0 ? visiblePrices : chartData.current.prices);
  }, [priceYRange, plotRange, dateRange]);

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

    // Same x mapping (plot range), drawn set (logical window) and price scale as PriceChart
    const currentDateRange = plotRange || chartData.current.dateRange;
    if (!currentDateRange || currentDateRange.length !== 2) return null;
    const plotStart = currentDateRange[0];
    const totalMs = currentDateRange[1].getTime() - plotStart.getTime();
    const [startDate, endDate] = dateRange || currentDateRange;

    const minMax = currentPriceScale();
    if (!minMax) return null;

    let closest = null;
    let closestDist = Infinity;
    data.signals.forEach(signal => {
      const sDate = parseExchangeTs(signal.date);
      if (sDate < startDate || sDate > endDate) return;
      const x = ((sDate.getTime() - plotStart.getTime()) / totalMs) * rect.width;
      const y = rect.height - ((signal.price - minMax.min) / (minMax.max - minMax.min)) * rect.height;
      // Vertically zoomed: a marker outside the price range is clipped away (PriceChart), so it
      // must not be clickable at its off-plot position either.
      if (priceYRange && (y < 0 || y > rect.height - DATE_AXIS_BAND)) return;
      const dist = Math.hypot(x - px, y - py);
      if (dist < closestDist) {
        closestDist = dist;
        closest = signal;
      }
    });
    if (!closest) return null;

    // Every signal drawn at the very same point as the nearest one - a reversal bar carries a
    // close of one leg and an open of the other (e.g. LongClose + ShortOpen) at one date/price.
    // Nearest first, then the backend's order (closes before opens).
    const coincident = [closest, ...data.signals.filter(signal =>
      signal !== closest && signal.date === closest.date && signal.price === closest.price)];

    return { signal: closest, signals: coincident, dist: closestDist, canvas };
  }, [data, dateRange, plotRange, priceYRange, currentPriceScale]);

  // The setup window under the cursor on bar `barIndex` of the price pane: a window-end glyph
  // (always drawn) first, then - only while "Show indicators" draws them - a retest band or the
  // runaway line of a window waiting on that bar. Lowest zone first (zone.low, then id). Windows
  // that ended while long are hit only while "Events" draws them. Null when nothing is hit.
  const findSetupWindowAt = useCallback((barIndex, clientY) => {
    if (!levelChart || barIndex < 0) return null;
    const canvas = containerRef.current?.querySelector('.price-chart-canvas');
    const minMax = currentPriceScale();
    if (!canvas || !minMax || !(minMax.max > minMax.min)) return null;
    const rect = canvas.getBoundingClientRect();
    const py = clientY - rect.top;
    if (py < 0 || py > rect.height || rect.height <= 0) return null;
    const yOf = (price) => rect.height - ((price - minMax.min) / (minMax.max - minMax.min)) * rect.height;

    const drawn = (win) => showEvents || !win.endsWhileLong;
    const ending = (levelChart.windowsEndingAt.get(barIndex) || []).filter(drawn);
    const glyphHit = ending.find(candidate => {
      const at = windowGlyphPoint(candidate, levelChart.barTimes);
      return at && Math.abs(yOf(at.price) - py) <= GLYPH_HIT_PX;
    });
    if (glyphHit) return glyphHit;
    if (!showLevelLines) return null;

    const waiting = (levelChart.windowPointsByBar.get(barIndex) || [])
      .filter(({ window: candidate }) => drawn(candidate))
      .sort((a, b) => byZoneLowThenId(a.window, b.window));
    const hit = waiting.find(({ window: candidate, point }) => {
      const bottom = Number.isFinite(point.confirmLine) ? point.confirmLine : candidate.zoneHigh;
      const levels = [point.touchLine, bottom].filter(Number.isFinite);
      if (point.phase === 'AWAIT' && Number.isFinite(point.runawayLine)
        && Math.abs(yOf(point.runawayLine) - py) <= WINDOW_HIT_SLOP_PX) return true;
      if (levels.length === 0) return false;
      const yTop = yOf(Math.max(...levels)) - WINDOW_HIT_SLOP_PX;
      const yBottom = yOf(Math.min(...levels)) + WINDOW_HIT_SLOP_PX;
      return py >= yTop && py <= yBottom;
    });
    return hit ? hit.window : null;
  }, [levelChart, currentPriceScale, showLevelLines, showEvents]);

  // Function to update tooltip data based on mouse position.
  // mouseX is plot-relative (drives the date); tooltipPos is container-relative (placement - the
  // container is the tooltip's offset parent, so price-canvas coordinates put it too high on
  // the lower panes).
  const updateTooltipData = useCallback((mouseX, pane, tooltipPos, clientX, clientY) => {
    // Skip if we don't have prices
    if (!chartData.current.prices || chartData.current.prices.length === 0) return;

    // Find price data at mouse position
    const prices = chartData.current.prices;
    const currentDateRange = plotRange || chartData.current.dateRange;

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

      // Find closest price point among the drawn bars (those in the logical window) - over the
      // half-slot margin, or an empty weekend at a window edge, the nearest bar in time can be one
      // that is not drawn.
      const shownRange = dateRange || currentDateRange;
      const startMs = shownRange[0].getTime();
      const endMs = shownRange[1].getTime();
      const anyDrawn = prices.some(price => price.date.getTime() >= startMs && price.date.getTime() <= endMs);
      let closestIndex = -1;
      let minTimeDiff = Infinity;
      prices.forEach((price, index) => {
        const ms = price.date.getTime();
        if (anyDrawn && (ms < startMs || ms > endMs)) return;
        const timeDiff = Math.abs(ms - mouseMs);
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

      // Level strategy, price pane: a matched entry / exit marker under the cursor, else a setup
      // window (its end glyph, or its retest band / runaway line while those are drawn).
      if (levelChart && pane === 'price') {
        const nearest = findNearestSignal(clientX, clientY);
        if (nearest && nearest.dist <= SIGNAL_HIT_RADIUS_PX) {
          const hit = nearest.signals
            .map(signal => ({ signal, match: matchTradeAnnotation(levelChart, signal) }))
            .find(entry => entry.match);
          if (hit) {
            setTooltipData({
              kind: hit.match.role, // 'entry' | 'exit'
              trade: hit.match.trade,
              signal: hit.signal,
              ...placement
            });
            return;
          }
        }
        const setupWindow = findSetupWindowAt(closestIndex, clientY);
        if (setupWindow) {
          setTooltipData({ kind: 'setupWindow', window: setupWindow, ...placement });
          return;
        }
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
        const byMs = seriesValueIndex.get(series.id);
        const value = byMs
          ? byMs.get(closestMs)
          : pointsForSeries(data, series).find(ind => parseExchangeTs(ind.date).getTime() === closestMs)?.value;
        if (typeof value === 'number' && !Number.isNaN(value)) {
          indicatorValues.push({ name: seriesLabel(series), value, color: series.color });
        }
      });

      setTooltipData({
        kind: 'price',
        price: closestPrice,
        signals,
        indicators: indicatorValues,
        status: levelChart ? statusLine(levelChart, closestIndex, seriesValueAt) : null,
        ...placement
      });
    }
  }, [
    data, dateRange, plotRange, visibleSeries, getPlotRect, trades, cumulativePoints, legSuffix,
    levelChart, seriesValueIndex, seriesValueAt, findNearestSignal, findSetupWindowAt
  ]);

  // The signals at the clicked point (nearest first), or null when the click missed every signal.
  const findClickedSignals = useCallback((clientX, clientY) => {
    const nearest = findNearestSignal(clientX, clientY);
    return nearest && nearest.dist <= SIGNAL_HIT_RADIUS_PX ? nearest.signals : null;
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
    // The range slider handles its own drags; the level zone controls are plain form inputs
    if (isInRangeSlider(e.target) || isInLevelZoneControls(e.target) || isInChartUi(e.target)) return;

    // Price axis strip: drag scales the price axis; Shift + drag anywhere on the price pane pans
    // it vertically. Neither starts the horizontal drag-zoom.
    const pricePoint = getPricePanePoint(e.clientX, e.clientY);
    if (pricePoint && (pricePoint.onAxis || e.shiftKey) && effectivePriceRange) {
      e.preventDefault(); // no text selection while dragging
      setYDrag({
        mode: pricePoint.onAxis ? 'scale' : 'pan',
        startY: e.clientY,
        start: effectivePriceRange,
        height: pricePoint.height,
      });
      return;
    }

    const plotRect = getPlotRect();
    if (!plotRect) return;

    // Get mouse position relative to the plot
    const x = e.clientX - plotRect.left;
    
    // Start zoom selection
    setZoomActive(true);
    setZoomStart(x);
    setZoomEnd(x);
  }, [getPlotRect, getPricePanePoint, effectivePriceRange]);
  
  // Handle mouse move for zoom selection
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return;
    
    // Over the range slider: no crosshair/tooltip (unless a pane drag-zoom is in progress)
    if (!zoomActive && isInRangeSlider(e.target)) {
      setShowCrosshair(false);
      setHoverPane(null);
      setTooltipData(null);
      return;
    }

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
      }, e.clientX, e.clientY);
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
      const canvas = containerRef.current.querySelector('.price-chart-canvas');
      const pricePoint = getPricePanePoint(e.clientX, e.clientY);
      if (yDrag || pricePoint?.onAxis) {
        if (canvas) canvas.style.cursor = yDrag?.mode === 'pan' ? 'grabbing' : 'ns-resize';
      } else {
        const nearest = findNearestSignal(e.clientX, e.clientY);
        const hovering = nearest && nearest.dist <= SIGNAL_HIT_RADIUS_PX;
        if (canvas) canvas.style.cursor = hovering ? 'pointer' : '';
      }
    }
  }, [zoomActive, yDrag, updateTooltipData, findNearestSignal, getPlotRect, getHoveredPane, getPricePanePoint]);

  // Handle mouse up for zoom selection end
  const handleMouseUp = useCallback((e) => {
    if (!zoomActive || !containerRef.current) {
      setZoomActive(false);
      return;
    }

    // Calculate zoom range
    const plotRect = getPlotRect();
    const containerWidth = plotRect ? plotRect.width : containerRef.current.clientWidth;
    // Pixels map to time through the plot range (what is drawn), not the logical dateRange
    const currentDateRange = plotRange || chartData.current.dateRange;

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
      const clickedSignals = findClickedSignals(e.clientX, e.clientY);
      const clickedSignal = clickedSignals ? clickedSignals[0] : null;
      const clickedTradeIndex = clickedSignal ? signalTradeIndexMap.get(signalKey(clickedSignal)) : undefined;

      if (clickedTradeIndex !== undefined && clickedTradeIndex !== selectedTradeIndex) {
        // New trade selected - reveal its channels (nothing was drawn before this) and the
        // reason it fired. Deliberately does NOT touch dateRange/zoom - zoom is entirely the
        // user's to control, before or after selecting; the channels just render wherever they
        // fall relative to whatever the user is currently looking at, including outside it.
        setSelectedTradeIndex(clickedTradeIndex);
        // A reversal point holds two signals (one per leg): show both reasons, each with the
        // gap note for its own trade's channels.
        setSelectedSignalReason(clickedSignals.map(signal => ({
          type: signal.type,
          text: getSignalReasonText(signal, signalTradeIndexMap.get(signalKey(signal))),
        })));
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
    // A drag into the half-slot margin must not take the window past the data's own range
    const originalRange = originalDateRange || chartData.current.dateRange;
    const newStartDate = new Date(Math.max(
      currentDateRange[0].getTime() + startRatio * totalTime, originalRange[0].getTime()));
    const newEndDate = new Date(Math.min(
      currentDateRange[0].getTime() + endRatio * totalTime, originalRange[1].getTime()));
    if (newEndDate <= newStartDate) {
      setZoomActive(false);
      return;
    }

    // Apply zoom
    setDateRange([newStartDate, newEndDate]);
    setZoomActive(false);
  }, [
    zoomActive, zoomStart, zoomEnd, plotRange, originalDateRange, findClickedSignals, signalTradeIndexMap,
    selectedTradeIndex, getSignalReasonText, getPlotRect
  ]);
  
  // Handle mouse wheel for zoom in/out
  const handleMouseWheel = useCallback((e) => {
    if (!containerRef.current) return;
    // Only over the panes / range slider: the controls row, legend, zone controls, titles and the
    // reason note scroll the page normally (and the N field keeps its own wheel behaviour).
    if (!isWheelZoomTarget(e.target)) return;
    e.preventDefault(); // Prevent page scrolling (and Ctrl+wheel page zoom)

    // Vertical zoom: Shift/Ctrl + wheel over the price pane, or the plain wheel over its price
    // axis strip - scales the price axis around the price under the cursor.
    const pricePoint = getPricePanePoint(e.clientX, e.clientY);
    if (pricePoint && (e.shiftKey || e.ctrlKey || e.metaKey || pricePoint.onAxis)) {
      // Legacy mousewheel / DOMMouseScroll duplicates of the same tick: handled once, as 'wheel'.
      if (e.type !== 'wheel' || !effectivePriceRange) return;
      // Shift+wheel arrives as horizontal scroll (deltaX) in Chromium / Windows
      const rawDelta = e.deltaY || e.deltaX;
      if (!rawDelta) return;
      // Normalised to px (deltaMode 1 = lines, 2 = pages); the step scales with the delta's size:
      // a mouse notch (~100px) = one 15% step, a pinch's small deltas = proportionally less.
      const deltaPx = rawDelta * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
      const notches = Math.min(Y_WHEEL_MAX_NOTCHES, Math.abs(deltaPx) / WHEEL_NOTCH_PX);
      const step = Math.pow(Y_WHEEL_FACTOR, notches);
      const factor = deltaPx > 0 ? step : 1 / step; // wheel down = zoom out
      const { min, max } = effectivePriceRange;
      const pivot = max - (pricePoint.py / pricePoint.height) * (max - min);
      const next = clampPriceRange(pivot - (pivot - min) * factor, pivot + (max - pivot) * factor);
      if (next) {
        // The span clamp recentres; keep the pivot under the cursor instead.
        const ratio = (pivot - min) / (max - min);
        const span = next.max - next.min;
        setPriceYRange(boundPriceRange({ min: pivot - ratio * span, max: pivot - ratio * span + span }));
      }
      return;
    }

    // Get current dateRange or use the original
    const currentDateRange = dateRange || chartData.current.dateRange;
    
    if (!currentDateRange || currentDateRange.length !== 2) return;
    
    const plotRect = getPlotRect();
    if (!plotRect || plotRect.width === 0) return;
    
    // Get mouse position relative to the plot width
    const mouseX = e.clientX - plotRect.left;
    const mouseRatio = mouseX / plotRect.width;
    
    // Calculate current date at mouse position - through the drawn plot range, so the pivot is
    // the bar actually under the cursor
    const plot = plotRange || currentDateRange;
    const pivotTime = plot[0].getTime() + mouseRatio * (plot[1].getTime() - plot[0].getTime());
    const totalTime = currentDateRange[1].getTime() - currentDateRange[0].getTime();
    
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
    // (clamped: over the half-slot margins the pivot lies just outside the logical window)
    const pivotRatio = Math.min(1, Math.max(0, (pivotTime - currentDateRange[0].getTime()) / totalTime));
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
  }, [dateRange, plotRange, originalDateRange, getPlotRect, getPricePanePoint, effectivePriceRange, clampPriceRange, boundPriceRange]);
  
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
  // Reset Zoom resets both axes: the date window and any manual price-axis range.
  const handleResetZoom = useCallback(() => {
    setDateRange(originalDateRange);
    setPriceYRange(null);
  }, [originalDateRange]);

  // Double-click on the price axis strip: back to auto-fit (vertical only).
  const handleDoubleClick = useCallback((e) => {
    const pricePoint = getPricePanePoint(e.clientX, e.clientY);
    if (pricePoint?.onAxis) setPriceYRange(null);
  }, [getPricePanePoint]);
  
  // Set up event handlers for crosshair, tooltip, and zoom
  useEffect(() => {
    // Add mouse event listeners to container
    const currentContainerRef = containerRef.current;
    if (currentContainerRef) {
      currentContainerRef.addEventListener('mousedown', handleMouseDown);
      currentContainerRef.addEventListener('mousemove', handleMouseMove);
      currentContainerRef.addEventListener('mouseup', handleMouseUp);
      currentContainerRef.addEventListener('mouseleave', handleMouseLeave);
      currentContainerRef.addEventListener('dblclick', handleDoubleClick);

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
        currentContainerRef.removeEventListener('dblclick', handleDoubleClick);

        currentContainerRef.removeEventListener('wheel', handleMouseWheel);
        currentContainerRef.removeEventListener('mousewheel', handleMouseWheel);
        currentContainerRef.removeEventListener('DOMMouseScroll', handleMouseWheel);
      }
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave, handleMouseWheel, handleDoubleClick]);
  
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
  
  const isZoomed = Boolean(dateRange && originalDateRange && (
    dateRange[0].getTime() !== originalDateRange[0].getTime() ||
    dateRange[1].getTime() !== originalDateRange[1].getTime()
  ));

  return (
    <div
      className={`reporter-chart-container${priceOnly ? ' reporter-chart-container--price-only' : ''}`}
      ref={containerRef}
    >
      {/* Zoom controls */}
      <div className="chart-controls">
        <div className="zoom-info">
          <button 
            className="zoom-reset-btn"
            onClick={handleResetZoom}
            disabled={!isZoomed && !priceYRange}
          >
            Reset Zoom
          </button>
          <div className="zoom-instructions">
            Click and drag horizontally to zoom in on a specific time range, use the mouse wheel to zoom in/out,
            or drag the slider below the price chart (its handles resize the window, its middle pans it).
            Price axis: drag the price labels up/down (or use the wheel over them), or Shift/Ctrl + wheel over
            the price chart, to zoom vertically; Shift + drag pans it; double-click the labels to auto-fit.
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

        {/* Always laid out (hidden while the axis is auto-fit), like the date badge: appearing on
            the first axis drag must not re-wrap the row and shift the pane under the pointer. */}
        <button
          type="button"
          className="zoom-reset-btn price-autofit-btn"
          onClick={() => setPriceYRange(null)}
          title="Back to fitting the price axis to the visible candles"
          style={{ visibility: priceYRange ? 'visible' : 'hidden' }}
          aria-hidden={!priceYRange}
          tabIndex={priceYRange ? 0 : -1}
        >
          Auto-fit price axis
        </button>

        {/* Date range badge - always rendered (hidden at full range) so it appearing on the first
            zoom never shifts the layout (which made the range slider jump mid-drag). */}
        {dateRange && (
          <div
            className="zoom-range-display"
            style={{ visibility: isZoomed ? 'visible' : 'hidden' }}
            aria-hidden={!isZoomed}
          >
            {formatDate(dateRange[0])} - {formatDate(dateRange[1])}
          </div>
        )}

        <button
          ref={priceOnlyToggleRef}
          type="button"
          className="zoom-reset-btn price-only-toggle-btn"
          onClick={priceOnly ? exitPriceOnly : enterPriceOnly}
          title={!priceOnly
            ? 'Price chart and level zones only, filling the screen'
            : priceOnlyNested
              ? 'Back to all charts, staying in fullscreen. Esc leaves fullscreen entirely.'
              : 'Back to all charts (Esc)'}
        >
          {!priceOnly ? '⛶ Price chart only' : priceOnlyNested ? '⤢ Back to all charts' : '⤢ Exit price chart (Esc)'}
        </button>
      </div>

      {(showLevelZoneControls || hasEvents) && (
        <div className="level-zones-controls" data-testid="level-zones-controls">
          {showLevelZoneControls && (<>
          <span className="level-zones-controls__title">Level zones</span>
          <label className="level-zones-controls__item" title="Zones drawn per bar: the one containing the previous close, plus this many nearest above and below">
            N nearest
            <input
              type="number"
              className="level-zones-controls__number"
              min={0}
              max={LEVEL_ZONES_MAX_N}
              step={1}
              value={nearestNDraft ?? levelZoneSettings.nearestN}
              onChange={handleNearestNChange}
              onBlur={commitNearestN}
              onKeyDown={(e) => { if (e.key === 'Enter') commitNearestN(); }}
            />
          </label>
          <label className="level-zones-controls__item">
            <input
              type="checkbox"
              checked={levelZoneSettings.showWeak}
              onChange={(e) => updateLevelZoneSettings({ showWeak: e.target.checked })}
            />
            Show weak zones
          </label>
          <label className="level-zones-controls__item" title="Debug: every strong zone, without the nearest-N filter">
            <input
              type="checkbox"
              checked={levelZoneSettings.allStrong}
              onChange={(e) => updateLevelZoneSettings({ allStrong: e.target.checked })}
            />
            All strong zones
          </label>
          </>)}
          {hasEvents && (
            <label className="level-zones-controls__item" title={LEVEL_CHART_DESCRIPTIONS.events}>
              <input
                type="checkbox"
                checked={showEvents}
                onChange={(e) => setShowEvents(e.target.checked)}
                data-testid="level-events-toggle"
              />
              Events
            </label>
          )}
        </div>
      )}

      {selectedSignalReason && (
        <div className="signal-reason-note">
          {selectedSignalReason.length === 1 ? (
            <><strong>Signal reason:</strong> {selectedSignalReason[0].text}</>
          ) : (
            <>
              <strong>Signal reasons (reversal):</strong>
              {selectedSignalReason.map(({ type, text }, index) => (
                <div key={index} className="signal-reason-line">
                  <strong>{type}:</strong> {text}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Title + legend of what the price pane draws, right above it (and so also in both
          fullscreen modes): the same "Show indicators" + series chips as the IndicatorPicker above
          the chart (shared selection state, so the two stay in sync), but only the price-axis
          series, followed by the level zone swatches. */}
      <div className="price-chart-header">
        <h3 className="chart-title">Price Chart with Signals</h3>
        <IndicatorPicker
          variant="legend"
          className="price-legend"
          testId="price-legend"
          seriesList={legendSeriesList}
          showIndicators={Boolean(legendSelection.showIndicators)}
          onToggleShow={legendSelection.setShowIndicators}
          selectedIds={legendSelection.selectedIds || new Set()}
          onToggleSeries={legendSelection.toggleSeries}
          onToggleGroup={legendSelection.toggleGroup}
        >
          {levelChart && (
            <span className="price-legend__zones" data-testid="level-chart-legend">
              <span className="price-legend__zone" title={LEVEL_CHART_DESCRIPTIONS.retestBand}>
                <span className="level-chart-swatch level-chart-swatch--retest" /> retest band
              </span>
              <span className="price-legend__zone" title={LEVEL_CHART_DESCRIPTIONS.supportZone}>
                <span className="level-chart-swatch level-chart-swatch--support" /> support zone
              </span>
              <span className="price-legend__zone" title={LEVEL_CHART_DESCRIPTIONS.position}>
                <span className="level-chart-swatch level-chart-swatch--position" /> in position
              </span>
            </span>
          )}
          {showLevelZoneControls && (
            <span className="price-legend__zones">
              <span className="price-legend__zone" title={LEVEL_ZONE_DESCRIPTIONS.strong}>
                <span className="level-zones-swatch level-zones-swatch--strong" /> strong zone
              </span>
              <span className="price-legend__zone" title={LEVEL_ZONE_DESCRIPTIONS.weak}>
                <span className="level-zones-swatch level-zones-swatch--weak" /> weak zone
              </span>
              <span className="price-legend__zone" title={LEVEL_ZONE_DESCRIPTIONS.trigger}>
                <span className="level-zones-swatch level-zones-swatch--armed" /> resistance trigger zone
              </span>
            </span>
          )}
        </IndicatorPicker>
      </div>
      <div
        ref={setPricePaneNode}
        className={`chart-wrapper position-relative${priceOnly ? ' price-only-pane' : ''}`}
      >
        <PriceChart
          data={data}
          width={getChartWidth()}
          height={priceChartHeight}
          dateRange={plotRange}
          visibleRange={dateRange}
          highlightTradeIndex={selectedTradeIndex}
          signalTradeIndex={signalTradeIndexMap}
          priceSeries={priceSeries}
          levelZoneRuns={levelZoneRuns}
          priceRange={priceYRange}
          levelChart={levelChart}
          showLevelLines={showLevelLines}
          showEvents={showEvents}
        />
        <Crosshair 
          show={showCrosshair} 
          position={crosshairPosition} 
          horizontal={hoverPane === 'price'}
          vertical={true}
        />
        {renderZoomSelection()}
      </div>

      {/* Range slider directly under the price pane - two-way synced
          with dateRange. Panes are hit-tested by their own canvas rects (getHoveredPane), so
          sitting between panes does not shift the lower panes' crosshair/tooltip. */}
      <RangeSlider
        rows={sliderRows}
        startIndex={sliderIndices.startIndex}
        endIndex={sliderIndices.endIndex}
        onChange={handleSliderChange}
        width={getChartWidth()}
      />

      {/* Lower panes - not in price-only fullscreen */}
      {!priceOnly && (<>
      <h3 className="chart-title">Individual Trade PnL{legSuffix}</h3>
      <div className="chart-wrapper position-relative">
        <PnLChart
          data={data}
          width={getChartWidth()}
          height={pnlChartHeight}
          dateRange={plotRange}
          trades={trades}
        />
        <Crosshair
          show={showCrosshair}
          position={crosshairPosition}
          horizontal={hoverPane === 'trade'}
          vertical={true}
        />
      </div>

      <h3 className="chart-title">
        Cumulative PnL (closed trades{longLegOnly ? ', long leg' : ''}{data?.includesShortSignals === true ? ', long + short' : ''})
      </h3>
      <div className="chart-wrapper position-relative">
        <CumulativePnLChart
          points={cumulativePoints}
          hasTrades={trades.length > 0}
          width={getChartWidth()}
          height={cumulativeChartHeight}
          dateRange={plotRange}
        />
        <Crosshair
          show={showCrosshair}
          position={crosshairPosition}
          horizontal={hoverPane === 'cumulative'}
          vertical={true}
        />
      </div>
      
      {/* Sub-pane indicators - only while some sub series is selected in the picker */}
      {hasIndicatorPane && (
        <>
          <h3 className="chart-title">Indicator Chart</h3>
          <div className="chart-wrapper position-relative">
            <IndicatorChart 
              data={data} 
              width={getChartWidth()} 
              height={indicatorChartHeight} 
              dateRange={plotRange}
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
      </>)}

      {/* Render tooltip if data available */}
      <ChartTooltip tooltipData={tooltipData} />
    </div>
  );
};

export default ReporterStyleChart;