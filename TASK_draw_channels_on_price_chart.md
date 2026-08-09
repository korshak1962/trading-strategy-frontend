# TASK: Draw channel structure on the price chart

## Context

Paired with `TASK_channel_breakout_configurable_and_channel_geometry.md` in the `screener` project
(land that one first - this depends on its output shape). Once that's done,
`submitStrategies`/`optimize-strategies` responses will include a new `chartDataDTO.channels` field
(a list of `korshak.com.screener.vo.Channel`-shaped objects) whenever the selected strategy is
channel-aware (e.g. `ChannelBreakoutStrategy`) - empty/absent for every other strategy.

**No new API call needed.** `strategyApi.js`'s existing `submitStrategies`/`optimizeStrategies`
calls already fetch this data as part of the same response `PriceChart.jsx` already consumes for
prices and signals - just read the new field, no new fetch.

Each channel object carries `upperPoints`/`lowerPoints: [{date, price}, ...]` - ready-to-plot
polylines, already resolved by the backend. Don't derive on-screen points from any other field on
the object (raw slope/intercept fields, if present, are fit-space and not meant for direct
rendering - this mirrors the exact convention `drawSignals`/`drawIndicatorLine` already follow for
their own data).

## PART A - `drawChannels` in `ChartDrawingUtils.js`

New function, same style/signature pattern as the existing `drawSignals`:

```js
export const drawChannels = (ctx, channels, dateRange, minMax, width, height) => {
  if (!dateRange || !dateRange[0] || !dateRange[1] ||
      !(dateRange[0] instanceof Date) || !(dateRange[1] instanceof Date)) {
    return;
  }
  const [startDate, endDate] = dateRange;
  const { min, max } = minMax;
  const totalMs = endDate.getTime() - startDate.getTime();

  const toXY = (point) => {
    const date = new Date(point.date);
    const x = ((date.getTime() - startDate.getTime()) / totalMs) * width;
    const y = height - ((point.price - min) / (max - min)) * height;
    return { x, y };
  };

  const drawPolyline = (points) => {
    if (!points || points.length === 0) return;
    ctx.beginPath();
    points.forEach((p, i) => {
      const { x, y } = toXY(p);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  ctx.strokeStyle = 'rgba(33, 150, 243, 0.5)'; // distinct from candlesticks (green/red),
  ctx.lineWidth = 1.5;                          // signals (green/red/blue/orange), and the
                                                 // indicator line (purple) - see Part B note
  (channels || []).forEach(channel => {
    // Skip channels entirely outside the visible date range - same filtering intent as
    // drawSignals' visibleSignals check, just applied to a span instead of a point.
    const channelStart = new Date(channel.upperPoints?.[0]?.date ?? channel.startDate);
    const channelEnd = new Date(channel.upperPoints?.[channel.upperPoints.length - 1]?.date ?? channel.endDate);
    if (channelEnd < startDate || channelStart > endDate) return;

    drawPolyline(channel.upperPoints);
    drawPolyline(channel.lowerPoints);
  });
};
```

(Written out in full above since the shape needs to match the backend's field names exactly - adjust
only if `channel.upperPoints`/`lowerPoints`/`startDate`/`endDate` turn out named differently on the
actual JSON once Part A of the paired backend task lands; verify field names against a real response
rather than assuming this snippet is final.)

## PART B - Wire it into `PriceChart.jsx`

Call `drawChannels(ctx, data.channels, chartDateRange, minMaxPrice, width, height)` right after
`drawPriceCandlesticks(...)` and *before* the existing `drawSignals(...)` call - channel lines should
sit visually behind the candlesticks and signal markers, not obscure them. Use the same
`data.channels || []` defensive pattern already used for `data.signals || []` immediately above it
in this file.

**Color note:** the chosen `rgba(33, 150, 243, 0.5)` (semi-transparent blue) doesn't collide with
existing candlestick colors (green `#22c55e` / red `#ef4444`), signal marker colors (green / red /
blue / orange per `drawSignals`), or the indicator line (`purple`) - keep it that way if adjusting;
pick something else that stays distinguishable from all of those, not just some.

## PART C - No strategy-specific branching needed

`data.channels` will simply be empty/absent for any non-channel-aware strategy - `drawChannels`
already no-ops gracefully on that (mirrors how `drawSignals` handles zero signals). Don't add any
`if (strategyName === 'ChannelBreakoutStrategy')`-style special-casing anywhere in the chart code -
the whole point of doing this at the `ChartDataDTO` level is that it stays generic for whichever
future channel-aware strategies get added later, with zero frontend changes needed for them either.

## PART D - Verify

1. Run `ChannelBreakoutStrategy` through the existing UI (select it from the strategy dropdown,
   submit) and visually confirm channel lines render, aligned with where the signal markers sit -
   a signal marker should visibly sit right at the point where its channel's boundary lines end.
2. Confirm a non-channel strategy (e.g. `TrendChangeStrategy` or `MaCrossoverStrategy`) still renders
   exactly as before - no stray lines, no console errors from a missing `channels` field.
3. Run "Optimize" mode with `ChannelBreakoutStrategy` and confirm channels still render for the
   winning parameter combination - this is the direct frontend-side check for the backend task's
   Part C concern (the optimize path needs the same wiring as plain submit); if channels are present
   in Submit mode but missing in Optimize mode, that's the backend gap manifesting here, not a
   frontend bug to chase.
4. Zoom in/out (existing wheel/drag zoom) and confirm channel lines stay correctly positioned and get
   appropriately clipped/filtered at the edges, same as candlesticks and signals already do.

## Out of scope

Anything in `screener`'s backend - that's the paired task in `screener`'s own directory. If the
`chartDataDTO.channels` field isn't showing up as expected, confirm that task actually landed first
before debugging on the frontend side.
