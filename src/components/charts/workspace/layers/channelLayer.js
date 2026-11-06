// src/components/charts/workspace/layers/channelLayer.js
//
// Channels layer of PriceWorkspaceChart (architect design D2, §6.1): the recursive channels with
// click-to-select, the extend / shrink handle, Delete, the ▲/▼ crossing arrows, the hierarchy
// tint and the B-view exits. Moved from ChannelExplorerChart.jsx without a change of behaviour;
// lightweight-charts v5 API (addSeries(LineSeries), createSeriesMarkers).
//
// data: {
//   channels, zoomChannels, runId, exits,
//   selectedKey,                 // the parent's selection (a channelKey or null)
//   hierarchyMode,               // 'off' | 'up' | 'down'
//   onSelect(key|null),          // every selection change made on the chart, or a requested key
//                                // that cannot be selected here
//   onSelectedChannel(ch|null),  // the selected Channel object (for the readout under the chart)
// }
import { LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { withAlpha } from '../../../../theme/theme';
import { isProvisional, channelKey } from '../../../channelExplorer/format';
import { toBarTime, findBarIndex, findBarFloorIndex } from '../bars';

// Line width scales with timeframe coarseness so several timeframes' channels can be told apart
// on one chart (colour still encodes direction).
export const TF_LINE_WIDTH = Object.freeze({ MIN5: 1, HOUR: 1, DAY: 2, WEEK: 3, MONTH: 4 });

// A PROVISIONAL channel (the "pencil sketch") is drawn dashed and faded; the CURRENT channel one
// step thicker.
const PROVISIONAL_ALPHA = 0.5;
const HIT_TEST_PX = 8;
const LINE_SOLID = 0;
const LINE_DOTTED = 1;
const LINE_DASHED = 2;
const EXITS_KEY = '__exits__';
const NO_EXITS = [];

const directionColor = (tv, direction) => ({ 1: tv.up, '-1': tv.down }[direction] ?? tv.flat);

// Hierarchy highlighting: depth carried by alpha (width already means timeframe coarseness);
// alpha floors at 0.35 so a deep node stays visible. depthRgb: the --tv-depth-rgb token.
const hierarchyColor = (depthRgb, depth) =>
  `rgba(${depthRgb}, ${Math.max(0.35, 1 - 0.18 * (depth - 1)).toFixed(3)})`;

// Default line extension past the channel's own detected end: 25% of its span (min 3 bars),
// capped at the last candle. Draggable down to 0 or out to the last candle.
const defaultExtension = (spanBars, endIdx, lastIdx) =>
  Math.max(0, Math.min(Math.max(Math.round(spanBars * 0.25), 3), lastIdx - endIdx));

// A channel line's value at a DISPLAYED-CANDLE INDEX: interpolated between the two polyline points
// bracketing `idx`, or extrapolated from the nearest boundary pair at the same per-INDEX rate.
// Index-based (never wall-clock time) so overnight / weekend gaps, each one bar, do not corrupt the
// rate (FIX 1, the "staircase" bug). In log space when the channel was fit on ln(price), so an
// extension continues the same line - straight on a log scale.
export function valueAtIndex(points, idx, logPrice) {
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

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const fmtPrice = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');

/** Creates a channels layer instance (PriceWorkspaceChart layer contract). */
export function createChannelLayer() {
  let ctx = null;
  let data = {};
  // Built state (per attach / per rebuild)
  let entries = [];
  let brokenSeries = [];      // [{series}] broken-channel lines of the B-view exits
  let markersByKey = new Map();
  let markersApi = null;
  let handle = null;
  let needsZoom = false;
  let dragging = false;
  let suppressNextClick = false;
  // Edit state: survives re-attaches (a new candle grid) and data updates; reset by a new run.
  let selectedKey = null;
  let extensionOverrides = new Map();
  let deletedKeys = new Set();
  let lastRunId;
  let runSeen = false;

  const candleData = () => ctx.candleData();
  const lastIdx = () => candleData().length - 1;
  const tv = () => ctx.tokens();

  // Snaps each polyline point onto the displayed candle grid (floor) - an unsnapped time would
  // inject a phantom slot into the shared time axis. Consecutive points on one candle collapse to
  // the LAST one. Each point is tagged with its candle index for valueAtIndex.
  function snapToCandleGrid(points) {
    const cd = candleData();
    const deduped = [];
    for (const p of points) {
      const idx = findBarFloorIndex(cd, p.time);
      if (idx < 0) continue;
      const snapped = { time: cd[idx].time, value: p.value, idx };
      if (deduped.length > 0 && deduped[deduped.length - 1].time === snapped.time) {
        deduped[deduped.length - 1] = snapped;
      } else {
        deduped.push(snapped);
      }
    }
    return deduped;
  }

  function buildBasePoints(rawPoints) {
    const pts = (rawPoints || [])
      .map(p => ({ time: toBarTime(p.date), value: p.price }))
      .filter(p => p.time !== null)
      .sort((a, b) => a.time - b.time);
    return snapToCandleGrid(pts);
  }

  // The natural polyline plus a projection, per displayed candle, out to extendedEndIdx.
  function buildExtendedData(basePoints, entry, extendedEndIdx) {
    const cd = candleData();
    const out = basePoints.slice();
    const lastBaseIdx = out.length ? out[out.length - 1].idx : null;
    for (let i = entry.endIdx + 1; i <= extendedEndIdx; i++) {
      if (lastBaseIdx !== null && i <= lastBaseIdx) continue;
      out.push({ time: cd[i].time, value: valueAtIndex(basePoints, i, entry.ch.logPrice), idx: i });
    }
    return out;
  }

  function setChannelData(entry, extension) {
    const extendedEndIdx = Math.min(entry.endIdx + Math.max(0, extension), lastIdx());
    entry.upperData = buildExtendedData(entry.upperBase, entry, extendedEndIdx);
    entry.lowerData = buildExtendedData(entry.lowerBase, entry, extendedEndIdx);
    entry.upperSeries.setData(entry.upperData.map(({ time, value }) => ({ time, value })));
    entry.lowerSeries.setData(entry.lowerData.map(({ time, value }) => ({ time, value })));
    entry.extendedEndIdx = extendedEndIdx;
  }

  // A crossing: the close moves from one side of a line to the other between consecutive bars,
  // over the channel's displayed (possibly extended) range.
  function crossingsForEntry(entry) {
    const cd = candleData();
    const theme = tv();
    const markers = [];
    for (let i = entry.startIdx + 1; i <= entry.extendedEndIdx; i++) {
      const prevClose = cd[i - 1].close;
      const close = cd[i].close;
      for (const base of [entry.upperBase, entry.lowerBase]) {
        const prevDelta = prevClose - valueAtIndex(base, i - 1, entry.ch.logPrice);
        const delta = close - valueAtIndex(base, i, entry.ch.logPrice);
        if (prevDelta === 0 || delta === 0) continue;
        if (prevDelta < 0 && delta > 0) {
          markers.push({ time: cd[i].time, position: 'belowBar', color: theme.up, shape: 'arrowUp' });
        } else if (prevDelta > 0 && delta < 0) {
          markers.push({ time: cd[i].time, position: 'aboveBar', color: theme.down, shape: 'arrowDown' });
        }
      }
    }
    return markers;
  }

  function exitMarkers() {
    const cd = candleData();
    const theme = tv();
    const out = [];
    for (const ex of data.exits || NO_EXITS) {
      const ts = toBarTime(ex?.barDate);
      if (ts === null) continue;
      const idx = findBarFloorIndex(cd, ts);
      if (idx < 0) continue;
      out.push({
        time: cd[idx].time,
        position: ex.side === 'UP' ? 'aboveBar' : 'belowBar',
        color: theme.exit,
        shape: 'circle',
        text: `exit d${ex.depth ?? '?'}${ex.recompute ? ' ⟳' : ''}`,
      });
    }
    return out;
  }

  function refreshMarkers() {
    if (!markersApi) return;
    const all = [];
    for (const arr of markersByKey.values()) all.push(...arr);
    all.sort((a, b) => a.time - b.time);
    markersApi.setMarkers(all);
  }

  function findEntry(key) {
    return entries.find(e => e.key === key) || null;
  }

  function buildHierarchyIndex() {
    const byId = new Map();
    const childrenOf = new Map();
    for (const e of entries) {
      const id = e.ch?.id;
      if (id && !byId.has(id)) byId.set(id, e);
    }
    for (const e of entries) {
      const pid = e.ch?.parentId ?? null;
      if (!pid || !e.ch?.id || !byId.has(pid)) continue;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(e);
    }
    return { byId, childrenOf };
  }

  // entryKey -> depth (1 = immediate parent / child) from the selection; the walk is intersected
  // with what the response returned, and `visited` stops self / cyclic links.
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

  // Recomputes EVERY entry's colour from (selection, mode, theme): stale tints are impossible.
  function repaintHighlights() {
    const theme = tv();
    const hier = computeHierarchySet(findEntry(selectedKey), data.hierarchyMode ?? 'up');
    for (const entry of entries) {
      let opts;
      if (entry.key === selectedKey) {
        opts = { color: theme.selected, lineWidth: Math.min(entry.baseWidth + 2, 4) };
      } else if (hier.has(entry.key)) {
        opts = { color: hierarchyColor(theme.depthRgb, hier.get(entry.key)), lineWidth: Math.min(entry.baseWidth + 1, 4) };
      } else {
        opts = { color: entry.color, lineWidth: entry.baseWidth };
      }
      entry.upperSeries.applyOptions(opts);
      entry.lowerSeries.applyOptions(opts);
    }
  }

  const baseColor = (ch) => {
    const lineColor = directionColor(tv(), ch.direction);
    return isProvisional(ch) ? withAlpha(lineColor, PROVISIONAL_ALPHA) : lineColor;
  };

  function updateHandle() {
    if (!handle) return;
    const entry = findEntry(selectedKey);
    if (!entry) { handle.style.display = 'none'; return; }
    const idx = entry.extendedEndIdx;
    const x = ctx.chart.timeScale().timeToCoordinate(candleData()[idx].time);
    const uy = entry.upperSeries.priceToCoordinate(valueAtIndex(entry.upperBase, idx, entry.ch.logPrice));
    const ly = entry.lowerSeries.priceToCoordinate(valueAtIndex(entry.lowerBase, idx, entry.ch.logPrice));
    if (x === null || uy === null || ly === null) { handle.style.display = 'none'; return; }
    // Only inside the plot: never over the price-axis labels (or left of the plot).
    const plotWidth = ctx.container.clientWidth - ctx.chart.priceScale('right').width();
    if (x < 0 || x > plotWidth) { handle.style.display = 'none'; return; }
    handle.style.display = 'block';
    handle.style.left = `${x}px`;
    handle.style.top = `${(uy + ly) / 2}px`;
  }

  // Scrolls the time axis (keeping its zoom when the channel fits) so the channel is visible.
  function revealEntry(entry) {
    const ts = ctx.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const from = entry.startIdx, to = entry.extendedEndIdx;
    if (from >= range.from && to <= range.to) return;
    const width = range.to - range.from;
    const span = to - from;
    if (span + 4 <= width) {
      const start = Math.max(0, Math.round((from + to) / 2 - width / 2));
      ts.setVisibleLogicalRange({ from: start, to: start + width });
    } else {
      const pad = Math.max(2, Math.round(span * 0.1));
      ts.setVisibleLogicalRange({ from: from - pad, to: to + pad });
    }
  }

  // `fromProp`: the key came from the parent, which is only told back when it cannot be
  // selected here; the axis scrolls to the channel when it is out of view.
  function selectChannel(requestedKey, fromProp = false) {
    const entry = requestedKey ? findEntry(requestedKey) : null;
    const key = entry ? requestedKey : null;
    selectedKey = key;
    repaintHighlights();
    if (fromProp && entry) revealEntry(entry);
    updateHandle();
    data.onSelectedChannel?.(entry ? entry.ch : null);
    if (!fromProp || key !== requestedKey) data.onSelect?.(key);
  }

  function removeBuilt() {
    if (!ctx) return;
    for (const e of entries) {
      ctx.chart.removeSeries(e.upperSeries);
      ctx.chart.removeSeries(e.lowerSeries);
    }
    for (const s of brokenSeries) ctx.chart.removeSeries(s);
    entries = [];
    brokenSeries = [];
    markersByKey = new Map();
  }

  // Builds every channel's series and markers from data + the current candle grid.
  function build() {
    removeBuilt();
    const cd = candleData();
    if (cd.length === 0) return;
    const theme = tv();
    const last = lastIdx();
    for (const ch of data.channels || []) {
      const key = channelKey(ch);
      if (deletedKeys.has(key)) continue;
      const startTs = toBarTime(ch.startDate);
      const endTs = toBarTime(ch.endDate);
      if (startTs === null || endTs === null || endTs <= startTs) continue;
      const startIdx = findBarIndex(cd, startTs);
      const endIdx = findBarIndex(cd, endTs);
      if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) continue;
      const upperBase = buildBasePoints(ch.upperPoints);
      const lowerBase = buildBasePoints(ch.lowerPoints);
      if (upperBase.length === 0 || lowerBase.length === 0) continue;
      const spanBars = endIdx - startIdx;
      const provisional = isProvisional(ch);
      const color = baseColor(ch);
      const tfWidth = TF_LINE_WIDTH[ch.timeframe] ?? 1;
      const baseWidth = ch.current ? Math.min(tfWidth + 1, 4) : tfWidth;
      const baseLineOpts = {
        color,
        lineWidth: baseWidth,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: ctx.overlayAutoscale,
      };
      // Projected (unconfirmed) sides and provisional channels are dashed; the highlight repaint
      // only sets colour / width, so the dash survives selection.
      const pane = ctx.paneOf('price');
      const upperSeries = ctx.chart.addSeries(LineSeries,
        { ...baseLineOpts, lineStyle: (provisional || ch.projectedUpper) ? LINE_DASHED : LINE_SOLID }, pane);
      const lowerSeries = ctx.chart.addSeries(LineSeries,
        { ...baseLineOpts, lineStyle: (provisional || ch.projectedLower) ? LINE_DASHED : LINE_SOLID }, pane);
      const entry = {
        key, ch, color, baseWidth, startIdx, endIdx, spanBars,
        upperBase, lowerBase, upperSeries, lowerSeries,
        upperData: [], lowerData: [], extendedEndIdx: endIdx,
      };
      setChannelData(entry, extensionOverrides.get(key) ?? defaultExtension(spanBars, endIdx, last));
      markersByKey.set(key, crossingsForEntry(entry));
      entries.push(entry);
    }

    // Last exit per depth (B view): a marker on the exit bar and the broken channel's own lines
    // (dotted, not selectable). One reserved marker key, so per-channel recomputation never drops it.
    for (const ex of data.exits || NO_EXITS) {
      const broken = ex?.broken;
      if (!broken || toBarTime(ex.barDate) === null) continue;
      for (const raw of [broken.upperPoints, broken.lowerPoints]) {
        const pts = buildBasePoints(raw);
        if (pts.length < 2) continue;
        const s = ctx.chart.addSeries(LineSeries, {
          color: theme.brokenLine,
          lineWidth: 1,
          lineStyle: LINE_DOTTED,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: ctx.overlayAutoscale,
        }, ctx.paneOf('price'));
        s.setData(pts.map(({ time, value }) => ({ time, value })));
        brokenSeries.push(s);
      }
    }
    const exits = exitMarkers();
    if (exits.length > 0) markersByKey.set(EXITS_KEY, exits);
    refreshMarkers();
    repaintHighlights();
    updateHandle();

    // A selection whose channel is no longer drawn is dropped on both sides.
    if (selectedKey && !findEntry(selectedKey)) {
      selectedKey = null;
      updateHandle();
      data.onSelectedChannel?.(null);
      data.onSelect?.(null);
    }
  }

  // Zoom to the date range of the FULL detected set (zoomChannels, all selected timeframes,
  // regardless of visibility) with one channel-span of context before it - only on a new run or a
  // new candle grid, never on a visibility toggle.
  function applyZoom() {
    const cd = candleData();
    const source = data.zoomChannels ?? data.channels;
    if (!source || source.length === 0 || cd.length === 0) return;
    let minTs = Infinity, maxTs = -Infinity;
    for (const ch of source) {
      const s = toBarTime(ch.startDate);
      const e = toBarTime(ch.endDate);
      if (s !== null && s < minTs) minTs = s;
      if (e !== null && e > maxTs) maxTs = e;
    }
    if (minTs === Infinity) return;
    const span = maxTs - minTs;
    ctx.chart.timeScale().setVisibleRange({
      from: Math.max(cd[0].time, minTs - span),
      to: maxTs + Math.floor(span * 0.1),
    });
  }

  // ---- interaction ----
  function handleChartClick(param) {
    if (suppressNextClick) { suppressNextClick = false; return; }
    if (param.paneIndex !== undefined && param.paneIndex !== ctx.paneOf('price')) return;
    if (!param.point) { selectChannel(null); return; }
    const { x: px, y: py } = param.point;
    const ts = ctx.chart.timeScale();
    let best = null, bestDist = HIT_TEST_PX;
    for (const entry of entries) {
      for (const [series, pts] of [[entry.upperSeries, entry.upperData], [entry.lowerSeries, entry.lowerData]]) {
        for (let i = 0; i < pts.length - 1; i++) {
          const x1 = ts.timeToCoordinate(pts[i].time);
          const x2 = ts.timeToCoordinate(pts[i + 1].time);
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

  function onWindowMouseMove(e) {
    if (!dragging) return;
    const entry = findEntry(selectedKey);
    if (!entry) return;
    const rect = ctx.container.getBoundingClientRect();
    const t = ctx.chart.timeScale().coordinateToTime(e.clientX - rect.left);
    let targetIdx = t !== null ? findBarIndex(candleData(), t) : entry.extendedEndIdx;
    targetIdx = Math.max(entry.endIdx, Math.min(targetIdx, lastIdx()));
    const extension = targetIdx - entry.endIdx;
    extensionOverrides.set(entry.key, extension);
    setChannelData(entry, extension);
    markersByKey.set(entry.key, crossingsForEntry(entry));
    refreshMarkers();
    repaintHighlights();
    updateHandle();
  }
  function onWindowMouseUp() {
    dragging = false;
    // Swallow only the click this very mouseup may produce (it is dispatched in the same task);
    // when none comes, the flag must not eat the user's next real click.
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 0);
    ctx?.setTooltipSuppressed(false);
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
  }
  function onHandleMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    ctx.setTooltipSuppressed(true);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  // Delete / Backspace removes the selected channel (only while the tab is visible and the focus
  // is not in a form field).
  function onKeyDown(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (!ctx.isTabActive()) return;
    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
    const entry = findEntry(selectedKey);
    if (!selectedKey || !entry) return;
    ctx.chart.removeSeries(entry.upperSeries);
    ctx.chart.removeSeries(entry.lowerSeries);
    entries.splice(entries.indexOf(entry), 1);
    deletedKeys.add(selectedKey);
    markersByKey.delete(selectedKey);
    refreshMarkers();
    selectedKey = null;
    repaintHighlights();
    updateHandle();
    data.onSelectedChannel?.(null);
    data.onSelect?.(null);
  }

  return {
    id: 'channels',

    attach(c) {
      ctx = c;
      // autoScale off: the arrows must not widen the auto price range (A3: candles define it).
      markersApi = createSeriesMarkers(ctx.candles, [], { autoScale: false });
      handle = document.createElement('div');
      handle.className = 'ws-channel-handle ch-chart-handle';
      handle.style.display = 'none';
      ctx.container.appendChild(handle);
      handle.addEventListener('mousedown', onHandleMouseDown);
      ctx.chart.subscribeClick(handleChartClick);
      ctx.chart.timeScale().subscribeVisibleLogicalRangeChange(updateHandle);
      // Handle position also depends on the price scale (log toggle, manual zoom, resize).
      ctx.chart.subscribeCrosshairMove(updateHandle);
      window.addEventListener('keydown', onKeyDown);
      needsZoom = true;
    },

    update(next) {
      const prev = data;
      data = next || {};
      if (!runSeen || data.runId !== lastRunId) {
        // A genuinely new detection run resets the per-run edits.
        if (runSeen) {
          selectedKey = null;
          extensionOverrides = new Map();
          deletedKeys = new Set();
          data.onSelectedChannel?.(null);
        }
        runSeen = true;
        lastRunId = data.runId;
        needsZoom = true;
      }
      const structural = needsZoom || entries.length === 0
        || prev.channels !== data.channels || prev.exits !== data.exits;
      if (structural) build();
      if (needsZoom) {
        applyZoom();
        needsZoom = false;
      }
      if (!structural && prev.hierarchyMode !== data.hierarchyMode) repaintHighlights();
      const requested = data.selectedKey ?? null;
      if (requested !== selectedKey) selectChannel(requested, true);
      updateHandle();
    },

    // The price scale changed (log toggle, manual zoom, resize): the handle moves with the lines.
    redraw() {
      updateHandle();
    },

    applyTheme() {
      if (!ctx) return;
      const theme = tv();
      for (const entry of entries) entry.color = baseColor(entry.ch);
      for (const s of brokenSeries) s.applyOptions({ color: theme.brokenLine });
      for (const entry of entries) markersByKey.set(entry.key, crossingsForEntry(entry));
      const exits = exitMarkers();
      if (exits.length > 0) markersByKey.set(EXITS_KEY, exits);
      refreshMarkers();
      repaintHighlights();
    },

    // The selected channel at that bar, else the current one there, else the thickest / deepest
    // drawn there: its bounds and the close's position 0..1 (log space when logPrice, as the
    // screener's POSITION).
    tooltipRows(barIndex) {
      const covering = entries.filter(e => barIndex >= e.startIdx && barIndex <= e.extendedEndIdx);
      if (covering.length === 0) return [];
      const pick = covering.find(e => e.key === selectedKey)
        || covering.find(e => e.ch.current)
        || covering.slice().sort((a, b) => (b.baseWidth - a.baseWidth) || ((b.ch.depth ?? 0) - (a.ch.depth ?? 0)))[0];
      const upper = valueAtIndex(pick.upperBase, barIndex, pick.ch.logPrice);
      const lower = valueAtIndex(pick.lowerBase, barIndex, pick.ch.logPrice);
      const close = candleData()[barIndex]?.close;
      let position = null;
      if ([upper, lower, close].every(Number.isFinite) && upper !== lower) {
        const useLog = pick.ch.logPrice !== false && upper > 0 && lower > 0 && close > 0;
        position = useLog
          ? (Math.log(close) - Math.log(lower)) / (Math.log(upper) - Math.log(lower))
          : (close - lower) / (upper - lower);
      }
      const which = pick.key === selectedKey ? 'selected' : pick.ch.current ? 'current' : 'drawn';
      const extended = barIndex > pick.endIdx ? ' · extended' : '';
      const color = pick.key === selectedKey ? tv().selected : pick.color;
      return [
        { label: `Channel ${pick.ch.timeframe ?? ''} (${which}${extended})`, color },
        { label: 'Upper', value: fmtPrice(upper) },
        { label: 'Lower', value: fmtPrice(lower) },
        { label: 'Position', value: position === null ? '–' : position.toFixed(2) },
      ];
    },

    detach() {
      if (!ctx) return;
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      ctx.chart.unsubscribeClick(handleChartClick);
      ctx.chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateHandle);
      ctx.chart.unsubscribeCrosshairMove(updateHandle);
      if (handle) {
        handle.removeEventListener('mousedown', onHandleMouseDown);
        handle.remove();
        handle = null;
      }
      removeBuilt();
      markersApi?.detach();
      markersApi = null;
      if (dragging) ctx.setTooltipSuppressed(false);
      dragging = false;
      ctx = null;
    },
  };
}
