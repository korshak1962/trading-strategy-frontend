// src/components/charts/workspace/layers/sessionShadeLayer.js
//
// Bars outside the strategy run session (architect design §5, Q1 = A): a shaded background in
// every pane (one IPanePrimitive per pane, zOrder 'bottom', token --ws-offsession-bg) and a
// tooltip line. The candles themselves are muted by PriceWorkspaceChart (barMarks). On DAY / WEEK
// / MONTH every bar is in the session and the layer draws nothing.
//
// data: { offSession: Set<number> (bar times, Unix s), rule: '(09:30, 16:00]' | null }
import { readToken } from '../../../../theme/theme';

const SHADE_TOKEN = '--ws-offsession-bg';

/** Runs [startIndex, endIndex] of consecutive off-session candles. Pure. */
export const offSessionRuns = (candleTimes, offSession) => {
  const runs = [];
  if (!offSession || offSession.size === 0) return runs;
  let start = -1;
  candleTimes.forEach((t, i) => {
    const off = offSession.has(t);
    if (off && start < 0) start = i;
    if (!off && start >= 0) { runs.push([start, i - 1]); start = -1; }
  });
  if (start >= 0) runs.push([start, candleTimes.length - 1]);
  return runs;
};

/** Creates a session shading layer instance (PriceWorkspaceChart layer contract). */
export function createSessionShadeLayer() {
  let ctx = null;
  let data = null;
  let runs = [];
  let offByIndex = [];
  let unsubscribe = null;
  let attachedPanes = [];
  let fill = '';

  const primitives = new Set();

  function makePrimitive() {
    let requestUpdate = null;
    const renderer = {
      // zOrder 'bottom': drawn under the pane's series.
      draw(target) {
        if (!ctx || runs.length === 0 || !fill) return;
        const ts = ctx.chart.timeScale();
        const range = ts.getVisibleLogicalRange();
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.fillStyle = fill;
          const c0 = ts.logicalToCoordinate(0);
          const c1 = ts.logicalToCoordinate(1);
          const spacing = c0 !== null && c1 !== null ? c1 - c0 : 6;
          for (const [a, b] of runs) {
            if (range && (b < range.from - 1 || a > range.to + 1)) continue;
            // Bar centres of whole indices plus half the bar spacing on each side (a fractional
            // logical index does not map to a coordinate reliably).
            const xa = ts.logicalToCoordinate(a);
            const xb = ts.logicalToCoordinate(b);
            if (xa === null || xb === null) continue;
            const half = spacing / 2;
            const x0 = Math.round(xa - half);
            const x1 = Math.round(xb + half);
            context.fillRect(x0, 0, Math.max(1, x1 - x0), mediaSize.height);
          }
        });
      },
    };
    const view = { zOrder: () => 'bottom', renderer: () => renderer };
    const p = {
      attached(param) { requestUpdate = param.requestUpdate; },
      detached() { requestUpdate = null; },
      paneViews: () => [view],
      updateAllViews() {},
      refresh() { requestUpdate?.(); },
    };
    return p;
  }

  function detachFromPanes() {
    for (const { pane, prim } of attachedPanes) {
      try { pane.detachPrimitive(prim); } catch { /* the pane is gone */ }
      primitives.delete(prim);
    }
    attachedPanes = [];
  }

  function onPanes(panes) {
    detachFromPanes();
    if (runs.length === 0) return;
    for (const pane of panes) {
      const prim = makePrimitive();
      pane.attachPrimitive(prim);
      primitives.add(prim);
      attachedPanes.push({ pane, prim });
    }
  }

  function rebuild() {
    if (!ctx) return;
    const times = ctx.candleData().map(c => c.time);
    runs = offSessionRuns(times, data?.offSession);
    offByIndex = times.map(t => Boolean(data?.offSession?.has(t)));
    fill = readToken(SHADE_TOKEN);
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    detachFromPanes();
    if (runs.length > 0) unsubscribe = ctx.subscribePanes(onPanes);
  }

  return {
    attach(c) {
      ctx = c;
    },
    update(d) {
      data = d;
      rebuild();
    },
    applyTheme() {
      fill = readToken(SHADE_TOKEN);
      for (const p of primitives) p.refresh();
    },
    tooltipRows(barIndex) {
      if (!offByIndex[barIndex]) return [];
      const rule = data?.rule || '(09:30, 16:00]';
      return [{ label: 'Off session', note: `outside the strategy run session ${rule} — no strategy decision on this bar` }];
    },
    detach() {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      detachFromPanes();
      runs = [];
      offByIndex = [];
      ctx = null;
    },
  };
}
