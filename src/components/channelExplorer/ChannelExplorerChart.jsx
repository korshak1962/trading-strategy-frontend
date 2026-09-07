import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { formatPct } from './format';
import './ChannelExplorerChart.css';

const DIRECTION_COLOR = { 1: '#26a69a', '-1': '#ef5350', 0: '#787b86' };
const SELECTED_COLOR = '#ffd54f';
const HIT_TEST_PX = 8;

// Hierarchy highlighting: the selection's ancestors (Up) or descendants (Down) are tinted
// violet, with DEPTH CARRIED BY ALPHA rather than by line width — width is already spoken for
// by TF_LINE_WIDTH (timeframe coarseness), so grading it here would collide with that meaning.
// Alpha floors at 0.35 so a deep node stays visible against the #131722 background.
const hierarchyColor = (depth) =>
  `rgba(179, 136, 255, ${Math.max(0.35, 1 - 0.18 * (depth - 1)).toFixed(3)})`;

// Line width scales with timeframe coarseness so multiple timeframes' channels
// can be distinguished on one combined chart (color still encodes direction).
export const TF_LINE_WIDTH = { MIN5: 1, HOUR: 1, DAY: 2, WEEK: 3, MONTH: 4 };

// Always return Unix timestamp in seconds so intraday bars (HOUR/MIN5) don't
// collapse to the same YYYY-MM-DD key and break lightweight-charts.
const toTs = (dt) => {
  if (!dt) return null;
  if (Array.isArray(dt)) {
    const [y, m, d, h = 0, min = 0, s = 0] = dt;
    return Math.floor(new Date(y, m - 1, d, h, min, s).getTime() / 1000);
  }
  const str = String(dt);
  // Append seconds if missing so Date() parses as local time (not UTC)
  const normalized = str.length === 16 ? str + ':00' : str.length === 10 ? str + 'T00:00:00' : str;
  return Math.floor(new Date(normalized).getTime() / 1000);
};

// Finds the candle whose timestamp matches `targetTs`, or the nearest one if the
// channel's own timeframe doesn't exactly match the displayed candles (e.g. an HOUR
// channel overlaid on a DAY chart). `candleData` is sorted ascending by time.
const findCandleIndex = (candleData, targetTs) => {
  if (targetTs === null || candleData.length === 0) return -1;
  let lo = 0, hi = candleData.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candleData[mid].time === targetTs) return mid;
    if (candleData[mid].time < targetTs) lo = mid + 1;
    else hi = mid - 1;
  }
  if (lo <= 0) return 0;
  if (lo >= candleData.length) return candleData.length - 1;
  const beforeDiff = Math.abs(candleData[lo - 1].time - targetTs);
  const afterDiff  = Math.abs(candleData[lo].time - targetTs);
  return beforeDiff <= afterDiff ? lo - 1 : lo;
};

// Evaluates a channel line's value at an arbitrary DISPLAYED-CANDLE INDEX, given its
// (ascending, already time-snapped, index-tagged — see snapToCandleGrid) polyline points —
// interpolating between the two points bracketing `idx`, or extrapolating from the nearest
// boundary pair (at the same per-INDEX rate) if `idx` falls outside the polyline's own range.
// The latter is what powers dragging the extension handle past the channel's own detected end,
// and reading a line's value at a displayed candle beyond that end for crossing-marker
// detection. Deliberately index-based rather than time-based everywhere (both interpolation
// and extrapolation): a channel's rate is price-change-per-DISPLAYED-BAR, not
// price-change-per-second, so evaluating by index keeps overnight/weekend/holiday gaps (huge
// in wall-clock seconds, but each still just ONE next bar) from corrupting the line — see the
// FIX 1 note in the task doc for the "staircase" bug this replaced. Interpolates in log-space
// when the channel was fit on log price (matching the backend's own convention), so a
// multi-bar extension continues the same curve rather than a straight $-per-bar line.
function valueAtIndex(points, idx, logPrice) {
  const n = points.length;
  if (n === 0) return null;
  if (n === 1) return points[0].value;
  let p1, p2;
  if (idx <= points[0].idx) {
    [p1, p2] = [points[0], points[1]];
  } else if (idx >= points[n - 1].idx) {
    [p1, p2] = [points[n - 2], points[n - 1]];
  } else {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].idx <= idx) lo = mid; else hi = mid;
    }
    [p1, p2] = [points[lo], points[hi]];
  }
  if (p2.idx === p1.idx) return p2.value;
  const frac = (idx - p1.idx) / (p2.idx - p1.idx);
  if (logPrice) {
    const ln1 = Math.log(p1.value), ln2 = Math.log(p2.value);
    return Math.exp(ln1 + (ln2 - ln1) * frac);
  }
  return p1.value + (p2.value - p1.value) * frac;
}

// Finds the last displayed candle at-or-before `targetTs` (floor, not nearest) — used to snap
// a polyline point's own timestamp onto the displayed candle grid. Falls back to the first
// candle if `targetTs` is earlier than every displayed candle.
const findCandleFloorIndex = (candleData, targetTs) => {
  if (targetTs === null || candleData.length === 0) return -1;
  if (candleData[0].time > targetTs) return 0;
  let lo = 0, hi = candleData.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candleData[mid].time <= targetTs) lo = mid; else hi = mid - 1;
  }
  return lo;
};

// Identifies a channel across re-renders within the same detection run (no backend ID
// exists). Stable as long as the underlying detection result doesn't change — edits keyed
// on this are reset whenever `runId` changes (see ChannelExplorerChart's runId prop).
const channelKey = (ch) =>
  `${ch.timeframe}|${ch.startDate}|${ch.endDate}|${ch.upper.anchorBarIndex}|${ch.lower.anchorBarIndex}|${ch.direction}`;

// Default line extension past the channel's own detected end: 25% of its span (min 3
// bars), capped at the last available candle. Draggable from here down to 0 (exactly the
// detected end) or out to the last candle.
const defaultExtension = (spanBars, endIdx, lastIdx) =>
  Math.max(0, Math.min(Math.max(Math.round(spanBars * 0.25), 3), lastIdx - endIdx));

export default function ChannelExplorerChart({ prices, channels, zoomChannels, runId }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The raw selected Channel object (or null), lifted out of selectedKeyRef purely for the
  // width readout below the chart. Deliberately local React state, not passed up to the
  // parent - see selectedKeyRef's own comment: a parent re-render on every selection would
  // give ChannelExplorer's `channelsForChart` a new array reference and tear down/rebuild this
  // whole chart (losing zoom/pan). Safe here because this effect's own dependency array
  // ([prices, channels, zoomChannels, runId]) doesn't include this state, so setting it only
  // re-renders the lightweight JSX below, never re-runs the chart-building effect itself.
  const [selectedChannel, setSelectedChannel] = useState(null);

  // Hierarchy highlight mode: 'off' | 'up' | 'down'. Deliberately owned HERE and not passed in
  // as a prop — a parent-owned value would have to enter the chart-building effect's dependency
  // array, so every toggle would tear down and rebuild the chart, discarding the user's zoom,
  // pan, selection and any extended channels. The ref is what the effect's own closures read
  // (they are created once per build and would otherwise capture a stale mode), and repaintRef
  // is the effect's repaint function published outward so the toggle can recolour the existing
  // series in place instead of rebuilding anything.
  const [hierarchyMode, setHierarchyModeState] = useState('up');
  const hierarchyModeRef = useRef('up');
  const repaintRef = useRef(() => {});

  const setHierarchyMode = (mode) => {
    hierarchyModeRef.current = mode;   // ref first: repaint reads the ref, not the state
    setHierarchyModeState(mode);
    repaintRef.current();
  };

  // The backend emits `id`/`parentId` on every channel; an older backend (or any response
  // lacking them) leaves the tree unexpressible, so the control hides itself and the walks
  // below degrade to no-ops rather than throwing.
  const hierarchyAvailable = (channels || []).some(c => c && c.id);

  // Native Fullscreen API: gets Escape-to-exit for free (the browser handles it), rather
  // than reimplementing a CSS-only "fake fullscreen" plus our own keydown listener.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current?.requestFullscreen();
    }
  };

  // Edit state persists across effect re-runs (e.g. toggling timeframe visibility) via
  // refs, not React state — selecting/dragging must not trigger a parent re-render, which
  // would tear down and rebuild the whole chart (losing zoom/pan) on every drag frame.
  const selectedKeyRef = useRef(null);
  const extensionOverridesRef = useRef(new Map());
  const deletedKeysRef = useRef(new Set());
  const lastRunIdRef = useRef(runId);
  // Manual vertical (price-axis) zoom: null means "let the chart auto-fit visible data" (the
  // library's default). Set means every series sharing the price scale is pinned to this exact
  // range via autoscaleInfoProvider — lightweight-charts v4 has no direct setVisibleRange for
  // price (unlike timeScale), and mouse-wheel only ever zooms the time axis regardless of cursor
  // position, so scroll-to-zoom on the price axis has to be built by hand.
  const manualPriceRangeRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !prices || prices.length === 0) return;
    const el = containerRef.current;

    // A genuinely new detection run resets all edits (selection/extension/deletion) — this
    // is per-run scratch state, not meant to survive clicking "Find Channels" again.
    if (lastRunIdRef.current !== runId) {
      selectedKeyRef.current = null;
      extensionOverridesRef.current = new Map();
      deletedKeysRef.current = new Set();
      manualPriceRangeRef.current = null;
      lastRunIdRef.current = runId;
      setSelectedChannel(null);
    }

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: 'solid', color: '#131722' },
        textColor: '#787b86',
      },
      grid: {
        vertLines: { color: '#1e2030' },
        horzLines: { color: '#1e2030' },
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
        scaleMargins: { top: 0.08, bottom: 0.05 },
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const ro = new ResizeObserver(() => {
      // Height too, not just width: the container is a fixed CSS height normally, but grows
      // to fill the viewport in fullscreen mode (see .ch-chart-wrapper:fullscreen in the
      // stylesheet) — lightweight-charts doesn't auto-track its container's size on its own,
      // it only resizes when told to via applyOptions.
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      updateHandle();
    });
    ro.observe(el);

    // Price candlesticks — use Unix timestamps throughout
    const candleData = prices
      .map(p => ({ time: toTs(p.date), open: p.open, high: p.high, low: p.low, close: p.close }))
      .filter(p => p.time !== null)
      .sort((a, b) => a.time - b.time);

    // Shared by every series on the right price scale (candles + every channel line) so a
    // manual zoom applies uniformly — if only the candle series were pinned, an extended
    // channel line running far outside the candle range would still pull the shared scale
    // back open on its own.
    function autoscaleProvider(original) {
      // margins pinned to 0 once manual: the range we compute each wheel tick is read back
      // from pixel coordinates that already include whatever margin was visually showing —
      // letting the library re-add its configured scaleMargins on top of that every tick
      // would compound outward indefinitely instead of settling on the requested zoom.
      return manualPriceRangeRef.current
        ? { priceRange: manualPriceRangeRef.current, margins: { above: 0, below: 0 } }
        : original();
    }

    const priceSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: autoscaleProvider,
    });
    priceSeries.setData(candleData);

    const allPriceScaleSeries = [priceSeries];
    const lastIdx = candleData.length - 1;
    const channelEntries = [];
    // channelKey -> array of markers for that channel's current (possibly extended) line
    // range. Recomputed per-channel (not globally) on every build/drag/delete so dragging
    // one channel doesn't require re-scanning all the others' crossings each frame.
    const markersByKey = new Map();

    // A crossing is where the close price moves from one side of a line to the other
    // between consecutive bars — the standard breakout/breakdown definition, distinct from
    // a wick merely poking through and closing back inside. Scans the channel's *displayed*
    // range (start through its current extended end), so dragging the handle further out
    // reveals more crossings, same as the visual motivation for extending lines at all.
    // Line values come from valueAtIndex against the channel's own (unextended) polyline —
    // interpolated within its natural span, extrapolated beyond it by DISPLAYED-CANDLE INDEX
    // (never wall-clock time — see valueAtIndex), exactly like the line series itself.
    function crossingsForEntry(entry) {
      const markers = [];
      for (let i = entry.startIdx + 1; i <= entry.extendedEndIdx; i++) {
        const prevClose = candleData[i - 1].close;
        const close = candleData[i].close;
        for (const side of ['upper', 'lower']) {
          const basePoints = side === 'upper' ? entry.upperBase : entry.lowerBase;
          const prevVal = valueAtIndex(basePoints, i - 1, entry.ch.logPrice);
          const val = valueAtIndex(basePoints, i, entry.ch.logPrice);
          const prevDelta = prevClose - prevVal;
          const delta = close - val;
          if (prevDelta === 0 || delta === 0) continue;
          if (prevDelta < 0 && delta > 0) {
            markers.push({ time: candleData[i].time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp' });
          } else if (prevDelta > 0 && delta < 0) {
            markers.push({ time: candleData[i].time, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown' });
          }
        }
      }
      return markers;
    }

    function refreshMarkers() {
      const all = [];
      for (const arr of markersByKey.values()) all.push(...arr);
      all.sort((a, b) => a.time - b.time);
      priceSeries.setMarkers(all);
    }

    // Snaps each polyline point's time onto the displayed candle grid (floor: the last
    // displayed candle at-or-before the point's own time) — lightweight-charts merges every
    // series' time values into one shared time axis, so an unsnapped time that doesn't match
    // any displayed candle injects a phantom time slot and visibly distorts candle spacing
    // across the WHOLE chart, not just this line. Consecutive points that snap to the same
    // candle are collapsed, keeping the LAST one of each run (the price the line actually
    // reaches by that bar, not the first) — a plain forward scan that always keeps whatever
    // point was most recently seen for the current time bucket, so the true first and last
    // points of the original polyline are never dropped by an off-by-one at the boundaries.
    // Each snapped point is tagged with its DISPLAYED-CANDLE INDEX (`idx`, not just `time`) —
    // this is an exact match (never a fuzzy/nearest lookup) since the point's time was just
    // snapped onto that exact candle's time — so valueAtIndex can do all interpolation and
    // extrapolation via bar-count arithmetic instead of wall-clock time (see FIX 1: extending a
    // line by wall-clock time inflates the rate ~17x-65x across overnight/weekend gaps).
    function snapToCandleGrid(points) {
      const deduped = [];
      for (const p of points) {
        const idx = findCandleFloorIndex(candleData, p.time);
        if (idx < 0) continue;
        const snapped = { time: candleData[idx].time, value: p.value, idx };
        if (deduped.length > 0 && deduped[deduped.length - 1].time === snapped.time) {
          deduped[deduped.length - 1] = snapped;
        } else {
          deduped.push(snapped);
        }
      }
      return deduped;
    }

    // Builds a channel line's natural (unextended) series data directly from the backend's
    // polyline sample points — already computed in the channel's own log/linear fit-space, on
    // its own native bar axis, so no bar-index arithmetic is needed here at all. Sorted
    // defensively (should already be ascending from the backend, matching how candleData is
    // sorted defensively too) then snapped onto the displayed candle grid.
    function buildBasePoints(rawPoints) {
      const pts = (rawPoints || [])
        .map(p => ({ time: toTs(p.date), value: p.price }))
        .filter(p => p.time !== null)
        .sort((a, b) => a.time - b.time);
      return snapToCandleGrid(pts);
    }

    // Extends a channel's natural polyline out to `extendedEndIdx`: the backend polyline only
    // covers the channel's own detected span (startBar..endBar), so dragging the handle past
    // that end requires projecting forward at each subsequent DISPLAYED candle using
    // valueAtIndex's extrapolation (rate derived from the line's own last two polyline points,
    // per DISPLAYED-CANDLE INDEX — never per elapsed wall-clock time; see FIX 1 / valueAtIndex).
    function buildExtendedData(basePoints, entry, extendedEndIdx, logPrice) {
      const data = basePoints.slice();
      const lastBaseIdx = data.length ? data[data.length - 1].idx : null;
      for (let i = entry.endIdx + 1; i <= extendedEndIdx; i++) {
        if (lastBaseIdx !== null && i <= lastBaseIdx) continue;
        data.push({ time: candleData[i].time, value: valueAtIndex(basePoints, i, logPrice), idx: i });
      }
      return data;
    }

    // Recomputes and applies a channel's line data for a given extension (bars past its own
    // detected end). Called both at initial build and on every drag frame. entry.upperData/
    // lowerData (the final, possibly-extended series data) double as the pixel-hit-testable
    // sample points for click-to-select — see handleChartClick below.
    function setChannelData(entry, extension) {
      const extendedEndIdx = Math.min(entry.endIdx + Math.max(0, extension), lastIdx);
      entry.upperData = buildExtendedData(entry.upperBase, entry, extendedEndIdx, entry.ch.logPrice);
      entry.lowerData = buildExtendedData(entry.lowerBase, entry, extendedEndIdx, entry.ch.logPrice);
      entry.upperSeries.setData(entry.upperData);
      entry.lowerSeries.setData(entry.lowerData);
      entry.extendedEndIdx = extendedEndIdx;
    }

    function findEntry(key) {
      return channelEntries.find(e => e.key === key) || null;
    }

    // Derived fresh on each repaint rather than cached, so a channel deleted with
    // Delete/Backspace (which splices channelEntries) drops out of the tree automatically —
    // there is no second structure that could go stale and leave us calling applyOptions on a
    // series that has already been removed from the chart. O(n) like the repaint it feeds.
    function buildHierarchyIndex() {
      const byId = new Map();
      const childrenOf = new Map();
      for (const e of channelEntries) {
        const id = e.ch?.id;
        if (id && !byId.has(id)) byId.set(id, e);
      }
      for (const e of channelEntries) {
        const pid = e.ch?.parentId ?? null;
        if (!pid || !e.ch?.id || !byId.has(pid)) continue;
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid).push(e);
      }
      return { byId, childrenOf };
    }

    // Walks the recursion tree from the selected channel and returns entryKey -> depth (1 =
    // immediate parent/child). The result is the walk INTERSECTED WITH WHAT THE RESPONSE
    // ACTUALLY RETURNED: an id that resolves to nothing simply ends the chain. That is the
    // normal case under the "last actual channels" filter, where descendants are legitimately
    // absent — it is correct behaviour, not an error, and needs no warning or disabling.
    // `visited` is seeded with the selection's own id and shared by both directions, so a
    // malformed self- or cyclic parent link terminates instead of looping forever.
    function computeHierarchySet(entry, mode) {
      const out = new Map();
      if (!entry || mode === 'off' || !entry.ch?.id) return out;
      const { byId, childrenOf } = buildHierarchyIndex();
      const visited = new Set([entry.ch.id]);

      if (mode === 'up') {
        let cur = entry;
        let depth = 1;
        for (;;) {
          const pid = cur.ch?.parentId ?? null;
          if (!pid || visited.has(pid)) break;
          const parent = byId.get(pid);
          if (!parent) break;
          visited.add(pid);
          out.set(parent.key, depth++);
          cur = parent;
        }
      } else {
        let frontier = [entry];
        let depth = 1;
        while (frontier.length > 0) {
          const next = [];
          for (const node of frontier) {
            for (const child of childrenOf.get(node.ch.id) || []) {
              if (!child.ch?.id || visited.has(child.ch.id)) continue;
              visited.add(child.ch.id);
              out.set(child.key, depth);
              next.push(child);
            }
          }
          frontier = next;
          depth++;
        }
      }
      return out;
    }

    // Recomputes EVERY entry's colour from (selection, mode). This replaced a per-entry
    // applyHighlight(entry, selected): mutating only the entries whose selected-ness changed
    // left previously-tinted hierarchy lines violet after a deselect, a new selection, or a
    // drag. The explicit else-branch resetting to entry.color/baseWidth is what makes stale
    // colour structurally impossible. Selection is tested BEFORE hierarchy membership so a
    // degenerate self-referencing id can never paint the selection itself violet.
    function repaintHighlights() {
      const selectedKey = selectedKeyRef.current;
      const hier = computeHierarchySet(findEntry(selectedKey), hierarchyModeRef.current);
      for (const entry of channelEntries) {
        let opts;
        if (entry.key === selectedKey) {
          opts = { color: SELECTED_COLOR, lineWidth: Math.min(entry.baseWidth + 2, 4) };
        } else if (hier.has(entry.key)) {
          // +1 (vs the selection's +2), both capped at 4, so a hierarchy line can never
          // outgrow the selection even at MONTH's baseWidth of 4.
          opts = { color: hierarchyColor(hier.get(entry.key)), lineWidth: Math.min(entry.baseWidth + 1, 4) };
        } else {
          opts = { color: entry.color, lineWidth: entry.baseWidth };
        }
        entry.upperSeries.applyOptions(opts);
        entry.lowerSeries.applyOptions(opts);
      }
    }
    repaintRef.current = repaintHighlights;

    // Channel lines — built directly from the backend's upperPoints/lowerPoints polylines
    // (real dates, no bar-index arithmetic), so overlaying channels whose own native
    // timeframe differs from the displayed candle series works correctly by construction —
    // see buildBasePoints/setChannelData above.
    (channels || []).forEach(ch => {
      const key = channelKey(ch);
      if (deletedKeysRef.current.has(key)) return;

      const color = DIRECTION_COLOR[ch.direction] ?? '#787b86';
      const startTs = toTs(ch.startDate);
      const endTs   = toTs(ch.endDate);
      if (startTs === null || endTs === null || endTs <= startTs) return;

      const startIdx = findCandleIndex(candleData, startTs);
      const endIdx   = findCandleIndex(candleData, endTs);
      if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return;

      const upperBase = buildBasePoints(ch.upperPoints);
      const lowerBase = buildBasePoints(ch.lowerPoints);
      if (upperBase.length === 0 || lowerBase.length === 0) return;

      const spanBars = endIdx - startIdx;
      if (spanBars < 1) return;

      const baseWidth = TF_LINE_WIDTH[ch.timeframe] ?? 1;
      const baseLineOpts = {
        color,
        lineWidth: baseWidth,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: autoscaleProvider,
      };
      // Projected (unconfirmed) sides render dashed — see OpenChannelMode: the line is a
      // parallel projected through a single extreme bar, not an independently-validated line.
      const upperSeries = chart.addLineSeries({ ...baseLineOpts, lineStyle: ch.projectedUpper ? 2 : 0 });
      const lowerSeries = chart.addLineSeries({ ...baseLineOpts, lineStyle: ch.projectedLower ? 2 : 0 });
      allPriceScaleSeries.push(upperSeries, lowerSeries);

      const entry = {
        key, ch, color, baseWidth,
        startIdx, endIdx, spanBars,
        upperBase, lowerBase,
        upperSeries, lowerSeries,
        upperData: [], lowerData: [],
        extendedEndIdx: endIdx,
      };
      setChannelData(entry, extensionOverridesRef.current.get(key) ?? defaultExtension(spanBars, endIdx, lastIdx));
      markersByKey.set(key, crossingsForEntry(entry));
      channelEntries.push(entry);
    });
    refreshMarkers();

    // ---- drag handle (a plain DOM element positioned over the chart's own canvas — v4 of
    // lightweight-charts has no built-in interactive drawing/plugin API for this) ----
    const handle = document.createElement('div');
    handle.className = 'ch-chart-handle';
    handle.style.display = 'none';
    el.appendChild(handle);

    function updateHandle() {
      const entry = findEntry(selectedKeyRef.current);
      if (!entry) { handle.style.display = 'none'; return; }
      // Reads the line's value at entry.extendedEndIdx, which is frequently beyond the base
      // polyline's own span — routed through valueAtIndex (index-based) rather than the
      // handle's displayed time, so this stays correct across weekend/holiday gaps too.
      const idx = entry.extendedEndIdx;
      const t = candleData[idx].time;
      const x = chart.timeScale().timeToCoordinate(t);
      const uy = entry.upperSeries.priceToCoordinate(valueAtIndex(entry.upperBase, idx, entry.ch.logPrice));
      const ly = entry.lowerSeries.priceToCoordinate(valueAtIndex(entry.lowerBase, idx, entry.ch.logPrice));
      if (x === null || uy === null || ly === null) { handle.style.display = 'none'; return; }
      handle.style.display = 'block';
      handle.style.left = `${x}px`;
      handle.style.top = `${(uy + ly) / 2}px`;
    }

    function selectChannel(key) {
      selectedKeyRef.current = key;
      const entry = findEntry(key);
      // Full repaint, not a two-entry swap: the outgoing selection's hierarchy has to be
      // cleared and the incoming one's painted, and those are different sets of lines.
      repaintHighlights();
      updateHandle();
      setSelectedChannel(entry ? entry.ch : null);
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // ---- click a line to select it; click empty space to deselect ----
    // Hit-tests against each side's own final (possibly-extended) polyline-derived data —
    // entry.upperData/lowerData, computed in setChannelData — rather than a shared
    // per-candle sample grid, since the upper and lower polylines can carry different time
    // points (independently sampled by the backend).
    let suppressNextClick = false;
    function handleChartClick(param) {
      if (suppressNextClick) { suppressNextClick = false; return; }
      if (!param.point) { selectChannel(null); return; }
      const { x: px, y: py } = param.point;

      let best = null, bestDist = HIT_TEST_PX;
      for (const entry of channelEntries) {
        for (const side of ['upper', 'lower']) {
          const series = side === 'upper' ? entry.upperSeries : entry.lowerSeries;
          const pts = side === 'upper' ? entry.upperData : entry.lowerData;
          for (let i = 0; i < pts.length - 1; i++) {
            const x1 = chart.timeScale().timeToCoordinate(pts[i].time);
            const x2 = chart.timeScale().timeToCoordinate(pts[i + 1].time);
            if (x1 === null || x2 === null) continue;
            const y1 = series.priceToCoordinate(pts[i].value);
            const y2 = series.priceToCoordinate(pts[i + 1].value);
            if (y1 === null || y2 === null) continue;
            const d = distToSegment(px, py, x1, y1, x2, y2);
            if (d < bestDist) { bestDist = d; best = entry.key; }
          }
        }
      }
      selectChannel(best);
    }
    chart.subscribeClick(handleChartClick);

    // ---- drag the handle to extend/shrink the selected channel's right edge ----
    let dragging = false;
    function onHandleMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
    }
    function onWindowMouseMove(e) {
      if (!dragging) return;
      const entry = findEntry(selectedKeyRef.current);
      if (!entry) return;
      const rect = el.getBoundingClientRect();
      const t = chart.timeScale().coordinateToTime(e.clientX - rect.left);
      let targetIdx = t !== null ? findCandleIndex(candleData, t) : entry.extendedEndIdx;
      targetIdx = Math.max(entry.endIdx, Math.min(targetIdx, lastIdx));
      const extension = targetIdx - entry.endIdx;
      extensionOverridesRef.current.set(entry.key, extension);
      setChannelData(entry, extension);
      markersByKey.set(entry.key, crossingsForEntry(entry));
      refreshMarkers();
      // setChannelData's setData() doesn't touch series options, but repaint here anyway so a
      // drag can never be the one path that leaves the tiers inconsistent.
      repaintHighlights();
      updateHandle();
    }
    function onWindowMouseUp() {
      dragging = false;
      suppressNextClick = true;
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    }
    handle.addEventListener('mousedown', onHandleMouseDown);

    // ---- Delete/Backspace removes the selected channel ----
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
      const key = selectedKeyRef.current;
      const entry = findEntry(key);
      if (!key || !entry) return;
      chart.removeSeries(entry.upperSeries);
      chart.removeSeries(entry.lowerSeries);
      const seriesIdx = allPriceScaleSeries.indexOf(entry.upperSeries);
      if (seriesIdx >= 0) allPriceScaleSeries.splice(seriesIdx, 1);
      const seriesIdx2 = allPriceScaleSeries.indexOf(entry.lowerSeries);
      if (seriesIdx2 >= 0) allPriceScaleSeries.splice(seriesIdx2, 1);
      const idx = channelEntries.indexOf(entry);
      if (idx >= 0) channelEntries.splice(idx, 1);
      deletedKeysRef.current.add(key);
      markersByKey.delete(key);
      refreshMarkers();
      selectedKeyRef.current = null;
      // The deleted node is already out of channelEntries, so the index rebuilt inside this
      // repaint no longer contains it — any chain that ran through it now ends there instead
      // of pointing at a removed series.
      repaintHighlights();
      updateHandle();
      setSelectedChannel(null);
    }
    window.addEventListener('keydown', onKeyDown);

    // ---- scroll-to-zoom on the price axis ----
    // lightweight-charts' native mouse-wheel handling only ever zooms the time axis,
    // regardless of cursor position — there's no built-in way to zoom the price scale with
    // the wheel. Detect wheel events specifically over the price-axis label region (the
    // right-edge strip) and manually rescale via the shared autoscaleProvider, leaving wheel
    // behavior over the plot area untouched (still zooms time, as before).
    function onWheel(e) {
      const priceScaleWidth = chart.priceScale('right').width();
      const rect = el.getBoundingClientRect();
      const xInChart = e.clientX - rect.left;
      if (xInChart < rect.width - priceScaleWidth) return; // not over the price axis
      e.preventDefault();
      e.stopPropagation();

      const yInChart = e.clientY - rect.top;
      const cursorPrice = priceSeries.coordinateToPrice(yInChart);
      if (cursorPrice === null) return;

      // Current logical bounds. Once a manual range is active, read it straight from our own
      // ref rather than re-deriving it via coordinateToPrice at the pane edges — those
      // coordinates include whatever scaleMargins padding the price scale is configured with,
      // and feeding that padded value back in as next tick's "core" range would re-add the
      // same padding on every scroll, compounding the range outward indefinitely. Only the
      // very first tick (no manual range yet) needs to read the native auto-fitted bounds.
      let topPrice, bottomPrice;
      if (manualPriceRangeRef.current) {
        topPrice = manualPriceRangeRef.current.maxValue;
        bottomPrice = manualPriceRangeRef.current.minValue;
      } else {
        topPrice = priceSeries.coordinateToPrice(0);
        bottomPrice = priceSeries.coordinateToPrice(chart.paneSize().height);
        if (topPrice === null || bottomPrice === null) return;
      }

      // Scroll up (deltaY < 0) zooms in (range shrinks); scroll down zooms out — same sense
      // as the existing time-axis wheel zoom. Anchored on the cursor's price so the point
      // under the mouse stays put, matching the time-axis zoom's own anchoring behavior.
      const factor = e.deltaY < 0 ? 0.9 : 1 / 0.9;
      const newTop    = cursorPrice + (topPrice - cursorPrice) * factor;
      const newBottom = cursorPrice + (bottomPrice - cursorPrice) * factor;
      manualPriceRangeRef.current = {
        minValue: Math.min(newTop, newBottom),
        maxValue: Math.max(newTop, newBottom),
      };
      // Re-applying (even identical) options is what reliably nudges lightweight-charts to
      // re-invoke autoscaleInfoProvider and repaint — merely mutating the ref's contents
      // doesn't by itself trigger a recompute since nothing about the series' own data or
      // the visible time range changed.
      for (const s of allPriceScaleSeries) s.applyOptions({});
    }
    // Capture phase: lightweight-charts attaches its own wheel listener directly to its
    // internal canvas (a descendant of `el`), which fires first during the bubble phase — by
    // the time a bubble-phase listener on `el` would run, the native time-axis zoom has
    // already happened, so preventDefault/stopPropagation there can't undo it. Listening on
    // the capture phase instead runs before the event ever reaches that inner listener.
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });

    // ---- double-click the price axis to reset to auto-fit ----
    function onDblClick(e) {
      const priceScaleWidth = chart.priceScale('right').width();
      const rect = el.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width - priceScaleWidth) return;
      manualPriceRangeRef.current = null;
      for (const s of allPriceScaleSeries) s.applyOptions({});
    }
    el.addEventListener('dblclick', onDblClick);

    // ---- drag the chart body to pan vertically ----
    // The native library only ever pans the time axis on drag, never price — dragging the
    // main plot area already pans time (untouched, handled internally by the chart), this
    // adds price panning on top of the SAME drag gesture so a diagonal drag moves both axes,
    // matching how the horizontal drag already feels. Deliberately not preventDefault/
    // stopPropagation here: the native time-pan listener needs to keep seeing this same
    // mousedown/mousemove sequence to keep doing its own job undisturbed.
    let vDragging = false;
    let vDragStartY = 0;
    let vDragStartRange = null;
    function inPlotArea(e) {
      const rect = el.getBoundingClientRect();
      const xInChart = e.clientX - rect.left;
      const yInChart = e.clientY - rect.top;
      const priceScaleWidth = chart.priceScale('right').width();
      return xInChart < rect.width - priceScaleWidth && yInChart < chart.paneSize().height;
    }
    function onPlotMouseDown(e) {
      if (e.button !== 0 || !inPlotArea(e)) return;
      let top, bottom;
      if (manualPriceRangeRef.current) {
        top = manualPriceRangeRef.current.maxValue;
        bottom = manualPriceRangeRef.current.minValue;
      } else {
        top = priceSeries.coordinateToPrice(0);
        bottom = priceSeries.coordinateToPrice(chart.paneSize().height);
        if (top === null || bottom === null) return;
      }
      vDragging = true;
      vDragStartY = e.clientY;
      vDragStartRange = { minValue: bottom, maxValue: top };
      window.addEventListener('mousemove', onPlotMouseMove);
      window.addEventListener('mouseup', onPlotMouseUp);
    }
    function onPlotMouseMove(e) {
      if (!vDragging) return;
      const span = vDragStartRange.maxValue - vDragStartRange.minValue;
      const pricePerPixel = span / chart.paneSize().height;
      // Shifts (not scales) the range by the same pixel delta the cursor moved, so whatever
      // price point was under the cursor at drag-start stays under the cursor as you drag —
      // the same feel as grabbing and moving the chart, just on the price axis instead of time.
      const priceDelta = (e.clientY - vDragStartY) * pricePerPixel;
      manualPriceRangeRef.current = {
        minValue: vDragStartRange.minValue + priceDelta,
        maxValue: vDragStartRange.maxValue + priceDelta,
      };
      for (const s of allPriceScaleSeries) s.applyOptions({});
    }
    function onPlotMouseUp() {
      vDragging = false;
      window.removeEventListener('mousemove', onPlotMouseMove);
      window.removeEventListener('mouseup', onPlotMouseUp);
    }
    el.addEventListener('mousedown', onPlotMouseDown);

    chart.timeScale().subscribeVisibleLogicalRangeChange(updateHandle);

    // Restores all three tiers after a rebuild (e.g. toggling a timeframe's visibility), not
    // just the selection — the hierarchy tint has to come back too.
    repaintHighlights();
    updateHandle();

    chart.timeScale().fitContent();

    // Zoom to the date range of the *full* detected channel set (all selected
    // timeframes, regardless of which are currently toggled visible) so that
    // short-window channels (HOUR/MIN5) don't appear as a tiny sliver at the
    // far right of a long price history. Deliberately computed from
    // `zoomChannels` (falls back to `channels`) rather than the possibly
    // visibility-filtered `channels` prop: basing this on the visible subset
    // would make the viewport jump every time a timeframe tab is toggled,
    // since a different subset of channels spans a different date range.
    // Toggling visibility should only add/remove lines, never move the
    // viewport — it should only change on a new detection run.
    const zoomSource = zoomChannels ?? channels;
    if (zoomSource && zoomSource.length > 0) {
      let minTs = Infinity, maxTs = -Infinity;
      zoomSource.forEach(ch => {
        const s = toTs(ch.startDate);
        const e = toTs(ch.endDate);
        if (s !== null && s < minTs) minTs = s;
        if (e !== null && e > maxTs) maxTs = e;
      });
      if (minTs !== Infinity) {
        const span = maxTs - minTs;
        // Show one channel-span of context before the earliest channel
        chart.timeScale().setVisibleRange({
          from: Math.max(candleData[0]?.time ?? minTs, minTs - span),
          to:   maxTs + Math.floor(span * 0.1),
        });
      }
    }

    return () => {
      // Drop the published repaint before the chart is torn down, so a mode toggle racing a
      // rebuild can't call applyOptions on series belonging to a removed chart.
      repaintRef.current = () => {};
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('mousemove', onPlotMouseMove);
      window.removeEventListener('mouseup', onPlotMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('wheel', onWheel, { capture: true });
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('mousedown', onPlotMouseDown);
      chart.unsubscribeClick(handleChartClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateHandle);
      handle.removeEventListener('mousedown', onHandleMouseDown);
      if (handle.parentNode) handle.parentNode.removeChild(handle);
      ro.disconnect();
      chart.remove();
    };
  }, [prices, channels, zoomChannels, runId]);

  if (!prices || prices.length === 0) {
    return <div className="ch-chart-empty">No price data available</div>;
  }

  return (
    <div className="ch-chart-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="ch-chart-fullscreen-btn"
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
      >
        {isFullscreen ? '✕' : '⛶'}
      </button>
      {hierarchyAvailable && (
        <div className="ch-hierarchy-toggle" role="group" aria-label="Hierarchy highlight">
          <span className="ch-hierarchy-label">Hierarchy</span>
          {[['off', 'Off'], ['up', 'Up'], ['down', 'Down']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`ch-hierarchy-btn${hierarchyMode === value ? ' ch-hierarchy-btn--active' : ''}`}
              aria-pressed={hierarchyMode === value}
              onClick={() => setHierarchyMode(value)}
              title={
                value === 'off'
                  ? 'No hierarchy highlighting'
                  : value === 'up'
                    ? "Tint the selected channel's parent channels"
                    : "Tint the selected channel's child channels"
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="ch-chart-container" ref={containerRef} />
      <div className="ch-chart-hint">
        {selectedChannel && typeof selectedChannel.widthPct === 'number' && (
          <>
            <strong>Selected channel</strong> — Width: {formatPct(selectedChannel.widthPct)}
            <br />
          </>
        )}
        Click a channel line to select it · drag the yellow handle to extend/shrink · Delete/Backspace to remove
        · ▲/▼ arrows mark where a close price crossed a channel boundary
        · drag the chart to pan, scroll over the price axis to zoom vertically, double-click it to reset
        · ⛶ for full screen, Esc to exit
        {hierarchyAvailable && " · Hierarchy Up/Down tints the selection's parents/children violet, fading with distance"}
      </div>
    </div>
  );
}
