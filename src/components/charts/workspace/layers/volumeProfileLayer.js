// src/components/charts/workspace/layers/volumeProfileLayer.js
//
// Volume profile of the visible range on PriceWorkspaceChart (TASK_indicators_chart_volume,
// architect design rev 2 D4-D6), like TradingView's VRVP: volume by price rows over the bars
// currently on screen, drawn as horizontal bars growing leftwards from the plot's right edge.
//
// A series primitive on the candles (as levelLayer): every row's lo / hi is mapped with
// candles.priceToCoordinate at draw time, so the rows follow Log / Linear, a manual price zoom,
// the vertical pan and Fit by themselves. zOrder 'normal': over the candles and the level zones
// ('bottom'), under the crosshair and the indicator / channel lines. No autoscaleInfo (never moves
// the price axis), no hitTest and no click subscription (a click in the strip still reaches a level
// zone or a channel line), no selection (Escape is not used). The row under the cursor (tooltip)
// is drawn stronger: hover feedback only.
//
// Recompute: on attach / update at once; on a visible-range change after a trailing debounce of
// VP_RECOMPUTE_DEBOUNCE_MS (the previous profile stays drawn meanwhile: its rows are prices). The
// visible bars are ceil(from)..floor(to) of the candle grid, clipped to [0, n - 1].
//
// data: {
//   rows, widthPct,               // sanitized params (indicatorSet.sanitizeVolumeProfileParams)
//   volume: {times, values},      // bar times (Unix s) and volumes (number | null) of the /prices rows
//   openFromTime: ?number,        // first open (unfinished) bar's time when known, else null
//   hidden?: boolean,
// }
import { computeVolumeProfile, formatShare, rowIndexOf } from '../../../../utils/volumeProfile';
import { withAlpha } from '../../../../theme/theme';

export const VP_RECOMPUTE_DEBOUNCE_MS = 60;
const FILL_ALPHA = 0.35;
const HOVER_ALPHA = 0.6;

/** 618.2M / 37.71M / 950.0K / 812 - volume in a short form. */
export const formatVolume = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e11 ? 1 : 2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e8 ? 1 : 2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e5 ? 1 : 2)}K`;
  return String(Math.round(v));
};

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/** Creates a volume-profile layer instance (PriceWorkspaceChart layer contract). */
export function createVolumeProfileLayer() {
  let ctx = null;
  let data = null;
  let requestUpdate = null;
  let attachedTo = null;
  // Per-bar inputs aligned to ctx.candleData() indices (prepared once per attach / update).
  let bars = [];
  let barTimes = null;
  let inputsId = 0;
  let profile = null;
  let profileBars = 0; // visible bars of the profile
  let profileHasOpenBar = false;
  let cacheKey = null;
  let timer = null;
  let hoveredRow = -1;
  let upFill = '';
  let downFill = '';
  let upHover = '';
  let downHover = '';
  let upSolid = '';
  let lastMediaWidth = 0;

  const readColors = () => {
    const tv = ctx?.tokens?.() || {};
    upSolid = tv.up || '#26a69a';
    upFill = withAlpha(tv.up || '#26a69a', FILL_ALPHA);
    downFill = withAlpha(tv.down || '#ef5350', FILL_ALPHA);
    upHover = withAlpha(tv.up || '#26a69a', HOVER_ALPHA);
    downHover = withAlpha(tv.down || '#ef5350', HOVER_ALPHA);
  };

  const widthPct = () => Number(data?.widthPct) || 30;

  const renderer = {
    draw(target) {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        lastMediaWidth = mediaSize.width;
        if (!ctx || !profile || !(profile.maxRowTotal > 0)) return;
        const W = (mediaSize.width * widthPct()) / 100;
        const right = mediaSize.width;
        const { rows, maxRowTotal } = profile;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!(row.total > 0)) continue;
          const yHi = ctx.candles.priceToCoordinate(row.hi);
          const yLo = ctx.candles.priceToCoordinate(row.lo);
          if (yHi === null || yLo === null) continue;
          const top = Math.min(yHi, yLo);
          const bottom = Math.max(yHi, yLo);
          if (bottom < 0 || top > mediaSize.height) continue;
          // 1 px gap between rows (TV look); never thinner than 1 px.
          const h = Math.max(1, bottom - top - 1);
          const L = (W * row.total) / maxRowTotal;
          const lUp = (L * row.up) / row.total;
          const hovered = i === hoveredRow;
          if (lUp > 0) {
            context.fillStyle = hovered ? upHover : upFill;
            context.fillRect(right - lUp, top, lUp, h);
          }
          const lDown = L - lUp;
          if (lDown > 0) {
            context.fillStyle = hovered ? downHover : downFill;
            context.fillRect(right - L, top, lDown, h);
          }
        }
      });
    },
  };
  const view = { zOrder: () => 'normal', renderer: () => renderer };
  const primitive = {
    attached(param) { requestUpdate = param.requestUpdate; },
    detached() { requestUpdate = null; },
    paneViews: () => [view],
    updateAllViews() {},
  };

  /** Aligns the volume column to the candle grid by time (a mismatch leaves a bar without volume). */
  function prepareInputs() {
    const cd = ctx ? ctx.candleData() : [];
    const byTime = new Map();
    const vt = data?.volume?.times || [];
    const vv = data?.volume?.values || [];
    for (let i = 0; i < vt.length; i++) byTime.set(vt[i], vv[i]);
    bars = cd.map((c) => {
      const v = byTime.get(c.time);
      return { low: c.low, high: c.high, open: c.open, close: c.close, volume: typeof v === 'number' && Number.isFinite(v) ? v : null };
    });
    barTimes = cd.map(c => c.time);
    inputsId++;
    cacheKey = null;
  }

  /** Visible bar indices [i0, i1] of the candle grid, or null when none is visible. */
  function visibleIndices() {
    const n = bars.length;
    if (!ctx || n === 0) return null;
    let range = null;
    try { range = ctx.chart.timeScale().getVisibleLogicalRange(); } catch { range = null; }
    if (!range) return null;
    const i0 = Math.max(0, Math.ceil(range.from));
    const i1 = Math.min(n - 1, Math.floor(range.to));
    return i0 <= i1 ? [i0, i1] : null;
  }

  function recompute() {
    if (!ctx) return;
    if (!data || data.hidden) {
      profile = null;
      cacheKey = null;
      requestUpdate?.();
      return;
    }
    const vis = visibleIndices();
    const rows = Number(data.rows) || 24;
    const key = vis ? `${vis[0]}:${vis[1]}:${rows}:${inputsId}` : `none:${inputsId}`;
    if (key === cacheKey) return;
    cacheKey = key;
    if (!vis) {
      profile = null;
      profileBars = 0;
      profileHasOpenBar = false;
    } else {
      profile = computeVolumeProfile(bars.slice(vis[0], vis[1] + 1), { rows });
      profileBars = vis[1] - vis[0] + 1;
      const openFrom = data.openFromTime;
      profileHasOpenBar = Number.isFinite(openFrom) && barTimes[vis[1]] >= openFrom;
    }
    hoveredRow = -1;
    requestUpdate?.();
  }

  function onRange() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; recompute(); }, VP_RECOMPUTE_DEBOUNCE_MS);
  }

  /** Plot width in media px (without the price axis). */
  function plotWidth() {
    if (lastMediaWidth > 0) return lastMediaWidth;
    try {
      return ctx.container.clientWidth - ctx.chart.priceScale('right').width();
    } catch {
      return 0;
    }
  }

  function setHovered(i) {
    if (i === hoveredRow) return;
    hoveredRow = i;
    requestUpdate?.();
  }

  // The cursor left the plot (the chart then asks no layer for tooltip rows): drop the highlight.
  function onCrosshair(param) {
    if (!param || !param.point) setHovered(-1);
  }

  return {
    attach(c) {
      ctx = c;
      readColors();
      ctx.candles.attachPrimitive(primitive);
      attachedTo = ctx.candles;
      ctx.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
      ctx.chart.subscribeCrosshairMove(onCrosshair);
    },
    update(d) {
      data = d;
      prepareInputs();
      recompute();
    },
    applyTheme() {
      readColors();
      requestUpdate?.();
    },
    redraw() {
      requestUpdate?.();
    },
    tooltipRows(barIndex, hover) {
      const none = () => { setHovered(-1); return []; };
      if (!ctx || !data || data.hidden || !profile || !(profile.total > 0)) return none();
      if (!hover || hover.paneIndex !== ctx.paneOf('price')) return none();
      const price = hover.price;
      const x = hover.x;
      if (!Number.isFinite(price) || !Number.isFinite(x)) return none();
      const pw = plotWidth();
      const W = (pw * widthPct()) / 100;
      if (!(pw > 0) || x < pw - W) return none();
      if (price < profile.lo || price > profile.hi) return none();
      const i = rowIndexOf(price, profile.lo, profile.rowHeight, profile.rows.length);
      const row = profile.rows[i];
      setHovered(i);
      const notes = [
        `${formatVolume(row.total)} · up ${formatShare(row.up, row.total)} % / down ${formatShare(row.down, row.total)} %`
          + ` · ${pct(row.total, profile.total).toFixed(1)} % of ${formatVolume(profile.total)} visible`
          + ` (${profile.rows.length} rows, ${profileBars} bars)`,
      ];
      const extra = [];
      if (profile.barsNoVolume > 0) {
        extra.push(`${profile.barsNoVolume} of ${profileBars} bars without volume skipped`);
      }
      if (profileHasOpenBar) extra.push("includes the open bar's partial volume");
      if (extra.length) notes.push(extra.join(' · '));
      return [{
        label: 'Volume profile',
        value: `${row.lo.toFixed(2)}–${row.hi.toFixed(2)}`,
        color: upSolid,
        note: notes.join('\n'),
      }];
    },
    detach() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      try { ctx?.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange); } catch { /* chart gone */ }
      try { ctx?.chart.unsubscribeCrosshairMove(onCrosshair); } catch { /* chart gone */ }
      try { attachedTo?.detachPrimitive(primitive); } catch { /* chart gone */ }
      attachedTo = null;
      profile = null;
      cacheKey = null;
      hoveredRow = -1;
      ctx = null;
    },
  };
}
