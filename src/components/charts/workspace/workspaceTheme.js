// src/components/charts/workspace/workspaceTheme.js
//
// Colours of the shared price workspace chart (PriceWorkspaceChart, lightweight-charts v5).
// The values live only in CSS (src/theme/tokens.css, --tv-*: light on :root, dark under
// :root[data-theme="dark"]); useThemeTokens(WS_TOKENS) resolves them for the current theme and
// PriceWorkspaceChart re-applies them in place on a switch: the chart options, the candles and
// then every layer through layer.applyTheme(tokens) (TASK A6a, dark-theme review m4).

/** key -> CSS custom property. Module-level and frozen: useThemeTokens memoizes on it. */
export const WS_TOKENS = Object.freeze({
  bg: '--tv-chart-bg',
  text: '--tv-chart-text',
  grid: '--tv-chart-grid',
  border: '--tv-chart-border',
  crosshair: '--tv-chart-crosshair',
  crosshairLabel: '--tv-chart-crosshair-label',
  up: '--tv-candle-up',
  down: '--tv-candle-down',
  flat: '--tv-direction-flat',
  selected: '--tv-selected',
  exit: '--tv-exit',
  brokenLine: '--tv-broken-line',
  depthRgb: '--tv-depth-rgb',
});

/** Chart-level options (layout, grid, crosshair, scales) for a resolved token set. */
export const chartThemeOptions = (tv) => ({
  layout: { background: { type: 'solid', color: tv.bg }, textColor: tv.text, attributionLogo: true },
  grid: { vertLines: { color: tv.grid }, horzLines: { color: tv.grid } },
  crosshair: {
    vertLine: { color: tv.crosshair, labelBackgroundColor: tv.crosshairLabel },
    horzLine: { color: tv.crosshair, labelBackgroundColor: tv.crosshairLabel },
  },
  rightPriceScale: { borderColor: tv.border },
  timeScale: { borderColor: tv.border },
});

/** Candle colours for a resolved token set. */
export const candleThemeOptions = (tv) => ({
  upColor: tv.up,
  downColor: tv.down,
  borderUpColor: tv.up,
  borderDownColor: tv.down,
  wickUpColor: tv.up,
  wickDownColor: tv.down,
});

const SERIES_PALETTE_SIZE = 8;

/**
 * The i-th colour of the theme's categorical palette as a token reference
 * ('var(--chart-series-N)'); resolve it with theme.js resolveColor() at draw time, so it follows a
 * theme switch. Used for auto-assigned indicator colours (stage B).
 */
export const paletteColor = (i) =>
  `var(--chart-series-${((Math.max(0, Math.trunc(i)) % SERIES_PALETTE_SIZE) + 1)})`;
