// src/components/charts/workspace/layers/levelLayer.js
//
// Level zones on PriceWorkspaceChart (architect design §6.2): the stored zone map of
// GET /api/levels/{ticker} ("as of today", like the A view of the channels), drawn as bands from
// the zone's first touch to the right edge. Which zones: the ones containing the last close plus
// the N nearest above and below it (utils/levelZones.js selectNearest, the Backtest rule).
// A series primitive on the candles, so the bands follow the price scale (log or linear).
//
// data: { zones: LevelZoneDTO[], nearestN }
import { selectNearest } from '../../../../utils/levelZones';
import { readToken } from '../../../../theme/theme';
import { toBarTime, findBarFloorIndex } from '../bars';

const FILL_TOKEN = '--ws-level-zone';
const BORDER_TOKEN = '--ws-level-zone-border';

/** The zones to draw against the last close: containing + N nearest above / below. Pure. */
export const pickLevelZones = (zones, lastClose, nearestN) => {
  const valid = (zones || []).filter(z => z && Number.isFinite(Number(z.low)) && Number.isFinite(Number(z.high)))
    .map(z => ({ ...z, low: Math.min(Number(z.low), Number(z.high)), high: Math.max(Number(z.low), Number(z.high)) }));
  if (!Number.isFinite(lastClose)) return [];
  return selectNearest(valid, lastClose, nearestN);
};

/** Creates a level-zones layer instance (PriceWorkspaceChart layer contract). */
export function createLevelLayer() {
  let ctx = null;
  let data = null;
  let drawn = []; // [{zone, startIdx}]
  let requestUpdate = null;
  let fill = '';
  let border = '';
  let attachedTo = null;

  const renderer = {
    draw(target) {
      if (!ctx || drawn.length === 0) return;
      const ts = ctx.chart.timeScale();
      const candles = ctx.candles;
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        for (const { zone, startIdx } of drawn) {
          const yTop = candles.priceToCoordinate(zone.high);
          const yBottom = candles.priceToCoordinate(zone.low);
          const xc = ts.logicalToCoordinate(startIdx);
          const xn = ts.logicalToCoordinate(startIdx + 1);
          const x0 = xc === null ? null : xc - (xn === null ? 3 : (xn - xc) / 2);
          if (yTop === null || yBottom === null || x0 === null) continue;
          const left = Math.max(0, x0);
          const top = Math.min(yTop, yBottom);
          const h = Math.max(1, Math.abs(yBottom - yTop));
          context.fillStyle = fill;
          context.fillRect(left, top, mediaSize.width - left, h);
          context.strokeStyle = border;
          context.lineWidth = 1;
          context.strokeRect(left + 0.5, top + 0.5, mediaSize.width - left - 1, h - 1);
        }
      });
    },
  };
  const view = { zOrder: () => 'bottom', renderer: () => renderer };
  const primitive = {
    attached(param) { requestUpdate = param.requestUpdate; },
    detached() { requestUpdate = null; },
    paneViews: () => [view],
    updateAllViews() {},
  };

  function rebuild() {
    if (!ctx) return;
    const cd = ctx.candleData();
    const lastClose = cd.length ? cd[cd.length - 1].close : NaN;
    drawn = data && !data.hidden
      ? pickLevelZones(data.zones, lastClose, data.nearestN ?? 2).map(zone => ({
        zone,
        startIdx: Math.max(0, findBarFloorIndex(cd, toBarTime(zone.firstTouch)) ?? 0),
      }))
      : [];
    fill = readToken(FILL_TOKEN);
    border = readToken(BORDER_TOKEN);
    requestUpdate?.();
  }

  return {
    attach(c) {
      ctx = c;
      ctx.candles.attachPrimitive(primitive);
      attachedTo = ctx.candles;
    },
    update(d) {
      data = d;
      rebuild();
    },
    applyTheme() {
      fill = readToken(FILL_TOKEN);
      border = readToken(BORDER_TOKEN);
      requestUpdate?.();
    },
    redraw() {
      requestUpdate?.();
    },
    tooltipRows(barIndex) {
      if (!ctx || drawn.length === 0) return [];
      const bar = ctx.candleData()[barIndex];
      if (!bar) return [];
      return drawn
        .filter(({ zone, startIdx }) => barIndex >= startIdx && zone.low <= bar.close && bar.close <= zone.high)
        .map(({ zone }) => ({
          label: 'Level zone',
          value: `${zone.low.toFixed(2)}–${zone.high.toFixed(2)}`,
          color: border,
          note: `strength ${Number(zone.strength).toFixed(2)} · ${zone.touchCount} touches`,
        }));
    },
    detach() {
      try { attachedTo?.detachPrimitive(primitive); } catch { /* chart gone */ }
      attachedTo = null;
      drawn = [];
      ctx = null;
    },
  };
}
