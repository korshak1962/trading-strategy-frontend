// src/components/charts/workspace/PriceWorkspaceChart.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, PriceScaleMode } from 'lightweight-charts';
import RangeSlider from '../RangeSlider';
import WorkspaceTooltip from './WorkspaceTooltip';
import { WS_TOKENS, chartThemeOptions, candleThemeOptions } from './workspaceTheme';
import { toCandleData } from './bars';
import { useLogScale, LOG_SCALE_STORAGE_KEY } from './useLogScale';
import { useSliderSync } from './useSliderSync';
import { useEscapeFit } from './useEscapeFit';
import { useThemeTokens } from '../../../theme/useTheme';
import { useTabActive } from '../../tabActive';
import { exchangeZoneForTicker } from '../../../utils/dates';
// The RangeSlider's classes (.reporter-range-slider*) and the tooltip's (.chart-tooltip*) live
// with the Backtest chart: one look for both (TASK §1.2 "the same template").
import '../../ReporterStyleChart.css';
import './PriceWorkspaceChart.css';

/**
 * Layer contract (architect design D2). A layer draws one kind of thing on the shared chart
 * (channels; later indicators, levels, session shading, signals). The chart owns the engine, the
 * candles, the log scale, the slider, the autofit, the tooltip, Escape, fullscreen, the theme and
 * the attribution; everything else is a layer.
 *
 *   descriptor (the `layers` prop): { id, factory: () => layer, data }
 *   layer: {
 *     attach(ctx)              - create series / primitives / DOM; called on mount and again after
 *                                every bars change (the candle grid changed), after a detach
 *     update(data)             - new data (a new `data` reference); always follows attach
 *     applyTheme(tokens)       - recolour every series, marker and primitive (A6a)
 *     tooltipRows(barIndex)    - [{label, value?, color?, note?}] for the hover tooltip (A4)
 *     detach()                 - remove everything it created; the instance may be attached again
 *     redraw()                 - optional: the price scale changed (log toggle, manual zoom,
 *                                resize); DOM drawn over the plot follows it
 *   }
 *   ctx: {
 *     chart, candles, container,
 *     candleData()             - [{time, open, high, low, close}] of the loaded bars, ascending
 *     tokens()                 - the resolved WS_TOKENS of the current theme
 *     paneOf(groupKey)         - pane index of a pane group ('price' -> 0; stage B adds panes)
 *     overlayAutoscale         - autoscaleInfoProvider for overlays: they never move the price
 *                                axis, the candles of the visible window define it (A3)
 *     isLog()                  - the price scale is logarithmic
 *     isTabActive()            - the enclosing tab is the visible one (global key handlers)
 *     setTooltipSuppressed(b)  - hide the tooltip, e.g. while a handle is dragged
 *   }
 * A descriptor with the same id and factory keeps its instance (update(data) only when `data`
 * changed identity); a new factory re-creates it; a removed id is detached.
 */

const PRICE_PANE = 0;
const DEFAULT_HEIGHT = 420;
// The tooltip flips left of the cursor when this much room is not left on the right.
const TOOLTIP_FLIP_PX = 280;
const overlayAutoscale = () => null;
// Price-pane scale margins (A3 ~0.08 / 0.05). They also apply to a manual range: see manualRangeRef.
const SCALE_MARGINS = { top: 0.08, bottom: 0.05 };
// A plot drag becomes a vertical price pan only past this many pixels, and only if mainly vertical.
const VPAN_THRESHOLD_PX = 3;

/**
 * The shared price chart (TASK stage A): candles on lightweight-charts v5 with a log / linear
 * price scale (A1), the bottom range slider (A2), autofit to the candles of the visible window
 * (A3), the hover tooltip (A4), Escape = Fit (A5), the TradingView attribution (A6) and the theme
 * re-applied to every layer (A6a).
 * @param {Object} props
 * @param {Array<{date:string, open:number, high:number, low:number, close:number}>} props.bars
 * @param {string} props.timeframe
 * @param {string} props.ticker
 * @param {Array<{id:string, factory:Function, data:*}>} [props.layers]
 * @param {(range:{startIndex:number, endIndex:number}) => void} [props.onRangeChange]
 * @param {string} [props.storageKey] - localStorage key of the Log choice
 * @param {number} [props.height] - chart height in px (outside fullscreen)
 * @param {React.ReactNode} [props.toolbar] - extra controls in the top-left toolbar
 * @param {React.ReactNode} [props.hint] - text under the chart
 * @param {string} [props.className] - extra class of the wrapper
 * @param {string} [props.containerClassName] - extra class of the chart container
 * @param {string} [props.emptyText]
 */
export default function PriceWorkspaceChart({
  bars, timeframe, ticker, layers = null, onRangeChange = null,
  storageKey = LOG_SCALE_STORAGE_KEY, height = DEFAULT_HEIGHT, toolbar = null, hint = null,
  className = '', containerClassName = '', emptyText = 'No price data available',
}) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candlesRef = useRef(null);
  const candleDataRef = useRef([]);
  const ctxRef = useRef(null);
  // id -> {factory, instance, data, attached}
  const layerMapRef = useRef(new Map());
  const layersPropRef = useRef(layers);
  // Manual price-axis zoom of the price pane: null = auto-fit to the visible candles (A3).
  // Rule (fix round 1): the axis goes manual ONLY on an explicit price-axis gesture - a wheel over
  // the price axis or a mainly vertical drag of the plot (|dy| > 3 px and |dy| > |dx|). A
  // horizontal pan, a time zoom and every slider move keep / re-run the autofit to the candles
  // of the new window. An explicit manual range is sticky across time changes (the slider follows
  // the time axis, it does not touch the price axis) until Fit, Escape, a double-click on the
  // price axis, a new load or a Log / Linear switch - the A3 reset gestures.
  // The range is stored as the price range of the scale's INNER area (inside scaleMargins),
  // which is what autoscaleInfoProvider's priceRange means to lightweight-charts.
  const manualRangeRef = useRef(null);
  const tooltipSuppressedRef = useRef(false);

  const tabActive = useTabActive();
  const tabActiveRef = useRef(tabActive);
  useEffect(() => { tabActiveRef.current = tabActive; }, [tabActive]);

  const tokens = useThemeTokens(WS_TOKENS);
  const tokensRef = useRef(tokens);

  const [log, setLog] = useLogScale(storageKey);
  const logRef = useRef(log);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tip, setTip] = useState(null);
  const [sliderWidth, setSliderWidth] = useState(0);

  const candleData = useMemo(() => toCandleData(bars), [bars]);
  const hasBars = candleData.length > 0;
  const sliderRows = useMemo(() => candleData.map(c => ({ ms: c.time * 1000, close: c.close })), [candleData]);
  const { range, fromLogical, onSliderChange, bindChart } = useSliderSync(candleData.length, onRangeChange);
  const zone = exchangeZoneForTicker(ticker);

  useEffect(() => { layersPropRef.current = layers; }, [layers]);

  // ---- fullscreen (native API: Escape-to-exit for free) ----
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapperRef.current?.requestFullscreen();
  };

  /** Re-runs the price pane's autoscale (after the manual range or the scale mode changed). */
  const refreshPriceScale = useCallback(() => {
    // Re-applying (even empty) options makes lightweight-charts re-invoke autoscaleInfoProvider.
    candlesRef.current?.applyOptions({});
    // Layers with DOM over the plot (the channel handle) follow the new scale after the repaint.
    requestAnimationFrame(() => {
      for (const entry of layerMapRef.current.values()) entry.instance.redraw?.();
    });
  }, []);

  /**
   * The whole loaded history on the time axis: exactly the bars -0.5 .. n-0.5, the same mapping
   * the slider uses (useSliderSync), so Fit and a full slider are one and the same range.
   */
  const fitTime = useCallback(() => {
    const n = candleDataRef.current.length;
    if (n > 0) chartRef.current?.timeScale().setVisibleLogicalRange({ from: -0.5, to: n - 0.5 });
  }, []);

  /** Fit: full history, auto price range (A3 "Fit", double-click on the price axis, Escape). */
  const fit = useCallback(() => {
    if (!chartRef.current) return;
    manualRangeRef.current = null;
    // The library's own price-axis drag switches autoScale off; Fit turns it back on.
    chartRef.current.priceScale('right').applyOptions({ autoScale: true });
    refreshPriceScale();
    fitTime();
  }, [refreshPriceScale, fitTime]);
  useEscapeFit(fit, tabActive);

  // ---- layers: attach / update / detach against the current descriptors ----
  const syncLayers = useCallback((descriptors) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const map = layerMapRef.current;
    const seen = new Set();
    for (const d of descriptors || []) {
      if (!d || !d.id || typeof d.factory !== 'function') continue;
      seen.add(d.id);
      let entry = map.get(d.id);
      if (entry && entry.factory !== d.factory) {
        entry.instance.detach();
        map.delete(d.id);
        entry = null;
      }
      if (!entry) {
        const instance = d.factory();
        instance.attach(ctx);
        instance.update(d.data);
        map.set(d.id, { factory: d.factory, instance, data: d.data });
      } else if (entry.data !== d.data) {
        entry.data = d.data;
        entry.instance.update(d.data);
      }
    }
    for (const [id, entry] of map) {
      if (seen.has(id)) continue;
      entry.instance.detach();
      map.delete(id);
    }
  }, []);

  const detachAllLayers = useCallback(() => {
    for (const entry of layerMapRef.current.values()) entry.instance.detach();
    layerMapRef.current.clear();
  }, []);

  const measureSlider = useCallback(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el || el.clientWidth === 0) return;
    const w = Math.max(0, Math.floor(el.clientWidth - chart.priceScale('right').width()));
    setSliderWidth(prev => (prev === w ? prev : w));
  }, []);

  // ---- the chart itself: created once per "has bars" period ----
  useEffect(() => {
    if (!hasBars || !containerRef.current) return undefined;
    const el = containerRef.current;
    const theme = tokensRef.current;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      rightPriceScale: {
        scaleMargins: SCALE_MARGINS,
        mode: logRef.current ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 1 },
      // A6: the visible link to tradingview.com (Apache-2.0 NOTICE obligation). Never hidden.
      layout: { attributionLogo: true },
    });
    chart.applyOptions(chartThemeOptions(theme));
    chartRef.current = chart;
    // Dev builds only: the chart API on its container, for Playwright checks of the testers.
    if (import.meta.env.DEV) el.__wsChart = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      ...candleThemeOptions(theme),
      lastValueVisible: false,
      priceLineVisible: false,
      // Manual: the stored range is already the inner (inside scaleMargins) range, see setManual.
      autoscaleInfoProvider: (original) => (manualRangeRef.current
        ? { priceRange: manualRangeRef.current, margins: { above: 0, below: 0 } }
        : original()),
    }, PRICE_PANE);
    candlesRef.current = candles;
    bindChart(chart);

    ctxRef.current = {
      chart,
      candles,
      container: el,
      candleData: () => candleDataRef.current,
      tokens: () => tokensRef.current,
      paneOf: () => PRICE_PANE,
      overlayAutoscale,
      isLog: () => logRef.current,
      isTabActive: () => tabActiveRef.current,
      setTooltipSuppressed: (on) => {
        tooltipSuppressedRef.current = Boolean(on);
        if (on) setTip(null);
      },
    };

    const ro = new ResizeObserver(() => {
      // 0 wide = the tab is hidden (keep-alive): keep the size; showing it fires again.
      if (el.clientWidth === 0) return;
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      measureSlider();
      requestAnimationFrame(() => {
        for (const entry of layerMapRef.current.values()) entry.instance.redraw?.();
      });
    });
    ro.observe(el);

    const onLogicalRange = (logical) => {
      fromLogical(logical);
      measureSlider();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRange);

    // ---- A4 tooltip ----
    const onCrosshair = (param) => {
      const data = candleDataRef.current;
      const point = param.point;
      if (tooltipSuppressedRef.current || !point || param.logical === undefined
        || (param.paneIndex !== undefined && param.paneIndex !== PRICE_PANE)) {
        setTip(null);
        return;
      }
      const plotWidth = el.clientWidth - chart.priceScale('right').width();
      if (point.x < 0 || point.x > plotWidth || point.y < 0 || point.y > chart.paneSize(PRICE_PANE).height) {
        setTip(null);
        return;
      }
      const i = Math.round(param.logical);
      if (i < 0 || i >= data.length) { setTip(null); return; }
      const rows = [];
      for (const entry of layerMapRef.current.values()) {
        const r = entry.instance.tooltipRows?.(i);
        if (r && r.length) rows.push(...r);
      }
      setTip({
        x: point.x,
        y: point.y,
        flip: point.x + TOOLTIP_FLIP_PX > plotWidth,
        bar: data[i],
        prevClose: i > 0 ? data[i - 1].close : null,
        rows,
      });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    // ---- price axis: wheel zoom, double-click = Fit, vertical pan of the plot ----
    // lightweight-charts' wheel only zooms time and its drag only pans time; the price axis is
    // zoomed / panned by hand through the candles' autoscaleInfoProvider. In log mode the math is
    // done on ln(price), so the price under the cursor stays put in both scales.
    const toScale = (v) => (logRef.current ? Math.log(v) : v);
    const fromScale = (v) => (logRef.current ? Math.exp(v) : v);
    const paneHeight = () => chart.paneSize(PRICE_PANE).height;
    const overPriceAxis = (e) => {
      const rect = el.getBoundingClientRect();
      return e.clientX - rect.left >= rect.width - chart.priceScale('right').width()
        && e.clientY - rect.top < paneHeight();
    };
    /** The price range shown from the pane's top edge to its bottom edge (margins included). */
    const visibleRange = () => {
      const top = candles.coordinateToPrice(0);
      const bottom = candles.coordinateToPrice(paneHeight());
      if (top === null || bottom === null) return null;
      return { minValue: Math.min(top, bottom), maxValue: Math.max(top, bottom) };
    };
    const validForScale = (r) => r && Number.isFinite(r.minValue) && Number.isFinite(r.maxValue)
      && r.maxValue > r.minValue && (!logRef.current || r.minValue > 0);
    /**
     * Makes `visible` (edge-to-edge, as visibleRange() reads it) the manual range. lightweight-charts
     * lays the autoscale priceRange out INSIDE scaleMargins, so the margins are taken off here in
     * scale space; otherwise every wheel tick / pan step would be stretched by them and the price
     * under the cursor would drift (tester minor, ~0.8 % over 3 ticks).
     */
    const setManual = (visible) => {
      if (!validForScale(visible)) return false;
      const lo = toScale(visible.minValue);
      const hi = toScale(visible.maxValue);
      const span = hi - lo;
      const inner = {
        minValue: fromScale(lo + span * SCALE_MARGINS.bottom),
        maxValue: fromScale(hi - span * SCALE_MARGINS.top),
      };
      if (!validForScale(inner)) return false;
      manualRangeRef.current = inner;
      refreshPriceScale();
      return true;
    };

    function onWheel(e) {
      if (!overPriceAxis(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const cursor = candles.coordinateToPrice(e.clientY - rect.top);
      const cur = visibleRange();
      if (cursor === null || !validForScale(cur) || (logRef.current && cursor <= 0)) return;
      // Scroll up zooms in, down zooms out, anchored on the cursor's price.
      const factor = e.deltaY < 0 ? 0.9 : 1 / 0.9;
      const c = toScale(cursor);
      const top = fromScale(c + (toScale(cur.maxValue) - c) * factor);
      const bottom = fromScale(c + (toScale(cur.minValue) - c) * factor);
      setManual({ minValue: Math.min(top, bottom), maxValue: Math.max(top, bottom) });
    }
    // Capture phase: the library's own wheel listener sits on its inner canvas and would zoom
    // time first during the bubble phase.
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });

    function onDblClick(e) {
      if (overPriceAxis(e)) fit();
    }
    el.addEventListener('dblclick', onDblClick);

    // A left drag in the plot is the library's time pan. It ALSO pans the price axis only once it
    // is recognised as vertical: the first move past VPAN_THRESHOLD_PX decides the gesture, and
    // |dy| > |dx| makes it a price pan for the rest of the drag; otherwise the drag stays a pure
    // time pan and the price axis keeps auto-fitting (A3, fix round 1).
    let vDrag = null;
    function inPlotArea(e) {
      const rect = el.getBoundingClientRect();
      return e.clientX - rect.left < rect.width - chart.priceScale('right').width()
        && e.clientY - rect.top < paneHeight();
    }
    function onPlotMouseMove(e) {
      if (!vDrag) return;
      const dx = e.clientX - vDrag.x;
      const dy = e.clientY - vDrag.y;
      if (vDrag.mode === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= VPAN_THRESHOLD_PX) return;
        vDrag.mode = Math.abs(dy) > Math.abs(dx) ? 'price' : 'time';
        if (vDrag.mode === 'price') {
          // Read the range only now: an auto axis may have refit since mousedown.
          vDrag.range = visibleRange();
          vDrag.y0 = vDrag.y;
        }
      }
      if (vDrag.mode !== 'price' || !validForScale(vDrag.range)) return;
      // Shift (not scale) by the pixel delta: the price under the cursor stays under it.
      const lo = toScale(vDrag.range.minValue);
      const hi = toScale(vDrag.range.maxValue);
      const delta = (e.clientY - vDrag.y0) * ((hi - lo) / paneHeight());
      setManual({ minValue: fromScale(lo + delta), maxValue: fromScale(hi + delta) });
    }
    function onPlotMouseUp() {
      vDrag = null;
      window.removeEventListener('mousemove', onPlotMouseMove);
      window.removeEventListener('mouseup', onPlotMouseUp);
    }
    function onPlotMouseDown(e) {
      // Not preventDefault: the library's own time pan keeps seeing the same drag.
      if (e.button !== 0 || !inPlotArea(e)) return;
      vDrag = { x: e.clientX, y: e.clientY, mode: null, range: null, y0: e.clientY };
      window.addEventListener('mousemove', onPlotMouseMove);
      window.addEventListener('mouseup', onPlotMouseUp);
    }
    el.addEventListener('mousedown', onPlotMouseDown);

    return () => {
      detachAllLayers();
      window.removeEventListener('mousemove', onPlotMouseMove);
      window.removeEventListener('mouseup', onPlotMouseUp);
      el.removeEventListener('wheel', onWheel, { capture: true });
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('mousedown', onPlotMouseDown);
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLogicalRange);
      ro.disconnect();
      bindChart(null);
      ctxRef.current = null;
      chartRef.current = null;
      candlesRef.current = null;
      chart.remove();
    };
  }, [hasBars, bindChart, fromLogical, measureSlider, refreshPriceScale, fit, detachAllLayers]);

  // ---- bars: new candle grid -> set data, fit, re-attach every layer on the new grid ----
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || !candles) return;
    candleDataRef.current = candleData;
    manualRangeRef.current = null;
    chart.priceScale('right').applyOptions({ autoScale: true });
    setTip(null);
    candles.setData(candleData);
    fitTime();
    // Layers are re-attached (not just updated): their series sit on the old grid. The same
    // instances, so their own state (e.g. channel edits of the current run) survives.
    for (const entry of layerMapRef.current.values()) {
      entry.instance.detach();
      entry.instance.attach(ctxRef.current);
      entry.instance.update(entry.data);
    }
    syncLayers(layersPropRef.current);
    const raf = requestAnimationFrame(measureSlider);
    return () => cancelAnimationFrame(raf);
  }, [candleData, hasBars, syncLayers, measureSlider, fitTime]);

  // ---- layer descriptors changed (same bars) ----
  useEffect(() => {
    syncLayers(layers);
  }, [layers, syncLayers]);

  // ---- A1 log / linear ----
  useEffect(() => {
    logRef.current = log;
    const chart = chartRef.current;
    if (!chart) return;
    // A manual zoom is in the other scale's terms: reset it on a mode change.
    manualRangeRef.current = null;
    chart.priceScale('right').applyOptions({
      mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      autoScale: true,
    });
    refreshPriceScale();
    requestAnimationFrame(measureSlider);
  }, [log, refreshPriceScale, measureSlider]);

  // ---- A6a theme: chart options, candles, then every layer's series / markers / primitives ----
  useEffect(() => {
    tokensRef.current = tokens;
    chartRef.current?.applyOptions(chartThemeOptions(tokens));
    candlesRef.current?.applyOptions(candleThemeOptions(tokens));
    for (const entry of layerMapRef.current.values()) entry.instance.applyTheme?.(tokens);
  }, [tokens]);

  if (!hasBars) {
    return <div className="ws-chart-empty">{emptyText}</div>;
  }

  return (
    <div className={`ws-chart-wrapper${className ? ` ${className}` : ''}`} ref={wrapperRef} data-testid="ws-chart">
      <div className="ws-toolbar">
        <button
          type="button"
          className="ws-tool-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          data-testid="ws-fullscreen"
        >
          {isFullscreen ? '✕' : '⛶'}
        </button>
        <button
          type="button"
          className={`ws-tool-btn ws-tool-btn--text${log ? ' ws-tool-btn--active' : ''}`}
          onClick={() => setLog(!log)}
          aria-pressed={log}
          title={log
            ? 'Logarithmic price scale (channels fitted on ln(price) draw straight). Click for linear.'
            : 'Linear price scale. Click for logarithmic.'}
          data-testid="ws-log-toggle"
        >
          Log
        </button>
        <button
          type="button"
          className="ws-tool-btn ws-tool-btn--text"
          onClick={fit}
          title="Fit: full history, auto price range (Esc, or double-click the price axis)"
          data-testid="ws-fit"
        >
          Fit
        </button>
        {toolbar}
      </div>
      {/* The tooltip is a sibling of the chart container, not its child: lightweight-charts owns
          the container's DOM. */}
      <div className="ws-plot" style={isFullscreen ? undefined : { height }}>
        <div
          className={`ws-chart-container${containerClassName ? ` ${containerClassName}` : ''}`}
          ref={containerRef}
        />
        {tip && <WorkspaceTooltip tip={tip} timeframe={timeframe} zone={zone} />}
      </div>
      <div className="ws-slider" data-testid="ws-slider">
        {sliderWidth > 0 && (
          <RangeSlider
            rows={sliderRows}
            startIndex={range.startIndex}
            endIndex={range.endIndex}
            onChange={onSliderChange}
            width={sliderWidth}
          />
        )}
      </div>
      {hint && <div className="ws-chart-hint">{hint}</div>}
    </div>
  );
}
