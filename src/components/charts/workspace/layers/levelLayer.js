// src/components/charts/workspace/layers/levelLayer.js
//
// Level zones on PriceWorkspaceChart (architect design §6.2): the stored zone map of
// GET /api/levels/{ticker} ("as of today", like the A view of the channels), drawn as bands from
// the zone's first touch to the right edge. Which zones: the ones containing the last close plus
// the N nearest above and below it (utils/levelZones.js selectNearest, the Backtest rule), or
// every zone that passed minStrength when `allZones` is set.
// A series primitive on the candles, so the bands follow the price scale (log or linear).
//
// Hover / click (TASK_level_zone_hover_select): the tooltip lists the zone(s) under the cursor's
// PRICE (not the bar's close); a click on a zone selects it (highlighted band), a second click on
// it, a click outside every zone or Escape drops the selection. A zone thinner than
// 2 * HIT_TOLERANCE_PX on screen (e.g. low == high) is hit within HIT_TOLERANCE_PX of its line.
// A click on a channel line belongs to the channel: the zone click is decided after the other
// click subscribers ran (microtask) and skipped when one of them claimed it (ctx.claimClick).
//
// data: { zones: LevelZoneDTO[], nearestN, allZones, selectedId, onSelect(zone|null) }
import { selectNearest } from '../../../../utils/levelZones';
import { readToken, withAlpha } from '../../../../theme/theme';
import { toBarTime, findBarFloorIndex } from '../bars';

const FILL_TOKEN = '--ws-level-zone';
const BORDER_TOKEN = '--ws-level-zone-border';
const SELECTED_TOKEN = '--tv-selected';
const SELECTED_FILL_ALPHA = 0.18;
/** Half the minimum hit height of a zone band in px: a thin zone is caught within this of its line. */
export const HIT_TOLERANCE_PX = 4;

const validZones = (zones) => (zones || [])
  .filter(z => z && Number.isFinite(Number(z.low)) && Number.isFinite(Number(z.high)))
  .map(z => ({ ...z, low: Math.min(Number(z.low), Number(z.high)), high: Math.max(Number(z.low), Number(z.high)) }));

/**
 * The zones to draw against the last close: containing + N nearest above / below, or every
 * (valid) zone when `allZones`. Pure.
 */
export const pickLevelZones = (zones, lastClose, nearestN, allZones = false) => {
  const valid = validZones(zones);
  if (allZones) return valid;
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
  let selFill = '';
  let selBorder = '';
  let attachedTo = null;

  const selectedId = () => (data?.selectedId ?? null);

  const readColors = () => {
    fill = readToken(FILL_TOKEN);
    border = readToken(BORDER_TOKEN);
    selBorder = readToken(SELECTED_TOKEN);
    selFill = withAlpha(selBorder, SELECTED_FILL_ALPHA);
  };

  /** The zone band in media px: {left, top, bottom} or null when off scale. */
  const bandOf = (zone, startIdx) => {
    const ts = ctx.chart.timeScale();
    const yTop = ctx.candles.priceToCoordinate(zone.high);
    const yBottom = ctx.candles.priceToCoordinate(zone.low);
    const xc = ts.logicalToCoordinate(startIdx);
    const xn = ts.logicalToCoordinate(startIdx + 1);
    const x0 = xc === null ? null : xc - (xn === null ? 3 : (xn - xc) / 2);
    if (yTop === null || yBottom === null || x0 === null) return null;
    return { left: Math.max(0, x0), top: Math.min(yTop, yBottom), bottom: Math.max(yTop, yBottom) };
  };

  /**
   * The drawn zones hit at bar `barIndex` and screen y `y` (px on the price pane), narrowest band
   * first. A band thinner than 2 * HIT_TOLERANCE_PX is widened to that around its middle.
   */
  const hitsAt = (barIndex, y) => {
    if (!ctx || !Number.isFinite(y)) return [];
    const out = [];
    for (const d of drawn) {
      if (barIndex < d.startIdx) continue;
      const band = bandOf(d.zone, d.startIdx);
      if (!band) continue;
      let { top, bottom } = band;
      if (bottom - top < 2 * HIT_TOLERANCE_PX) {
        const mid = (top + bottom) / 2;
        top = mid - HIT_TOLERANCE_PX;
        bottom = mid + HIT_TOLERANCE_PX;
      }
      if (y >= top && y <= bottom) out.push({ ...d, height: band.bottom - band.top });
    }
    return out.sort((a, b) => a.height - b.height);
  };

  const renderer = {
    draw(target) {
      if (!ctx || drawn.length === 0) return;
      const sel = selectedId();
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        let selectedBand = null;
        for (const { zone, startIdx } of drawn) {
          const band = bandOf(zone, startIdx);
          if (!band) continue;
          const isSel = sel !== null && zone.id === sel;
          const h = Math.max(1, band.bottom - band.top);
          if (isSel) { selectedBand = { ...band, h }; continue; }
          context.fillStyle = fill;
          context.fillRect(band.left, band.top, mediaSize.width - band.left, h);
          context.strokeStyle = border;
          context.lineWidth = 1;
          context.strokeRect(band.left + 0.5, band.top + 0.5, mediaSize.width - band.left - 1, h - 1);
        }
        // The selected zone last, on top of the others.
        if (selectedBand) {
          const { left, top, h } = selectedBand;
          context.fillStyle = selFill;
          context.fillRect(left, top, mediaSize.width - left, h);
          context.strokeStyle = selBorder;
          context.lineWidth = 2;
          context.strokeRect(left + 1, top + 1, Math.max(0, mediaSize.width - left - 2), Math.max(0, h - 2));
          if (h <= 2) {
            context.fillStyle = selBorder;
            context.fillRect(left, top - 1, mediaSize.width - left, 2);
          }
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
      ? pickLevelZones(data.zones, lastClose, data.nearestN ?? 2, data.allZones === true).map(zone => ({
        zone,
        startIdx: Math.max(0, findBarFloorIndex(cd, toBarTime(zone.firstTouch)) ?? 0),
      }))
      : [];
    readColors();
    requestUpdate?.();
    // A selection whose zone is no longer drawn (N / strength / data changed) is dropped.
    const sel = selectedId();
    if (sel !== null && !drawn.some(d => d.zone.id === sel)) data?.onSelect?.(null);
  }

  // ---- click: select / toggle / clear ----
  function decideClick(param) {
    if (!ctx || drawn.length === 0) return;
    if (ctx.isClickClaimed?.(param)) return; // a channel line took this click
    if (param.paneIndex !== undefined && param.paneIndex !== ctx.paneOf('price')) return;
    const sel = selectedId();
    if (!param.point || param.logical === undefined || param.logical === null) {
      if (sel !== null) data?.onSelect?.(null);
      return;
    }
    const hits = hitsAt(Math.round(param.logical), param.point.y);
    if (hits.length === 0) {
      if (sel !== null) data?.onSelect?.(null);
      return;
    }
    // A second click on the selected zone drops it; otherwise the narrowest zone under the cursor.
    if (sel !== null && hits.some(h => h.zone.id === sel)) { data?.onSelect?.(null); return; }
    data?.onSelect?.(hits[0].zone);
  }
  function handleChartClick(param) {
    // After every other click subscriber (the channel layer claims a click on its lines).
    queueMicrotask(() => decideClick(param));
  }

  return {
    attach(c) {
      ctx = c;
      ctx.candles.attachPrimitive(primitive);
      attachedTo = ctx.candles;
      ctx.chart.subscribeClick(handleChartClick);
    },
    update(d) {
      data = d;
      rebuild();
    },
    applyTheme() {
      readColors();
      requestUpdate?.();
    },
    redraw() {
      requestUpdate?.();
    },
    escape() {
      if (!ctx || selectedId() === null || !data?.onSelect) return false;
      if (!ctx.isTabActive()) return false;
      data.onSelect(null);
      return true;
    },
    tooltipRows(barIndex, hover) {
      if (!ctx || drawn.length === 0) return [];
      const price = hover?.price;
      if (price === null || price === undefined || !Number.isFinite(price)) return [];
      const y = ctx.candles.priceToCoordinate(price);
      if (y === null) return [];
      const sel = selectedId();
      return hitsAt(barIndex, y).map(({ zone }) => ({
        label: zone.id === sel ? 'Level zone (selected)' : 'Level zone',
        value: `${zone.low.toFixed(2)}–${zone.high.toFixed(2)}`,
        color: zone.id === sel ? selBorder : border,
        note: `strength ${Number(zone.strength).toFixed(2)} · ${zone.touchCount} touches`,
      }));
    },
    detach() {
      try { attachedTo?.detachPrimitive(primitive); } catch { /* chart gone */ }
      try { ctx?.chart.unsubscribeClick(handleChartClick); } catch { /* chart gone */ }
      attachedTo = null;
      drawn = [];
      ctx = null;
    },
  };
}
