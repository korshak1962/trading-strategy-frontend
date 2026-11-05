// src/theme/theme.js
//
// Theme state (Light / Dark / System) and token access for code that cannot use CSS directly
// (canvas charts, lightweight-charts options). The colours themselves live only in CSS:
// src/theme/tokens.css (semantic, chart, Channel Explorer tokens) and src/theme/palette.css
// (palette tokens + the Tailwind remap). Light values are on :root, the dark set on
// :root[data-theme="dark"]; this module keeps data-theme on <html> in sync with the chosen mode.
//
// - mode:  what the viewer picked - 'light' | 'dark' | 'system' (default 'system'), remembered in
//          localStorage (best effort: the app works the same without storage).
// - theme: what is shown - 'light' | 'dark' ('system' resolved through prefers-color-scheme).
//
// Canvas code reads colours at draw time with chartColor('price-axis-text') / readToken('--x')
// and redraws when the theme changes (useTheme().theme as an effect dependency). Values are
// cached per theme, so a crosshair redraw does not hit getComputedStyle on every frame.

export const THEME_MODES = Object.freeze(['light', 'dark', 'system']);
export const THEME_STORAGE_KEY = 'tsf.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

const readStoredMode = () => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = () => {
  try {
    return Boolean(window.matchMedia?.(DARK_QUERY).matches);
  } catch {
    return false;
  }
};

let mode = hasDom ? readStoredMode() : 'system';
let theme = 'light';
const listeners = new Set();
const tokenCache = new Map();

/** 'light' | 'dark' for a mode. */
export const resolveTheme = (m) => (m === 'dark' || (m === 'system' && systemPrefersDark()) ? 'dark' : 'light');

const apply = () => {
  theme = resolveTheme(mode);
  tokenCache.clear();
  if (hasDom) document.documentElement.setAttribute('data-theme', theme);
};

const notify = () => listeners.forEach(listener => listener());

/** Current { mode, theme }. A new object only when one of them changes (useSyncExternalStore). */
let snapshot = { mode, theme };
const refreshSnapshot = () => {
  if (snapshot.mode !== mode || snapshot.theme !== theme) snapshot = { mode, theme };
};
export const getThemeSnapshot = () => snapshot;

export const getThemeMode = () => mode;
export const getTheme = () => theme;

/** Picks a mode, remembers it and re-themes the page (every subscriber is notified). */
export const setThemeMode = (next) => {
  if (!THEME_MODES.includes(next)) return;
  mode = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // storage blocked (private window, cleared site data): the choice lasts for this page only
  }
  apply();
  refreshSnapshot();
  notify();
};

/** Subscribes to theme changes; returns the unsubscribe function. */
export const subscribeTheme = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// System mode follows the OS setting live.
if (hasDom) {
  apply();
  refreshSnapshot();
  try {
    const media = window.matchMedia?.(DARK_QUERY);
    const onSystemChange = () => {
      if (mode !== 'system') return;
      apply();
      refreshSnapshot();
      notify();
    };
    if (media?.addEventListener) media.addEventListener('change', onSystemChange);
    else media?.addListener?.(onSystemChange);
  } catch {
    // no matchMedia: System stays Light
  }
}

/**
 * Value of a CSS custom property on <html> for the current theme, e.g. readToken('--c-white').
 * Empty string when the token is not defined (or outside a browser).
 */
export const readToken = (name) => {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const value = hasDom ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  tokenCache.set(name, value);
  return value;
};

/** Reads several tokens at once: readTokens({ bg: '--tv-chart-bg' }) -> { bg: '#131722' }. */
export const readTokens = (map) =>
  Object.fromEntries(Object.entries(map).map(([key, name]) => [key, readToken(name)]));

/** Chart token by its short name: chartColor('grid') reads --chart-grid. */
export const chartColor = (name) => readToken(`--chart-${name}`);

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

/**
 * A colour usable by canvas / lightweight-charts: a 'var(--token[, fallback])' string is resolved
 * to the token's current value, anything else is returned as is. DOM styles take the var()
 * string directly (and follow the theme without a re-render), canvas code passes it through here.
 */
export const resolveColor = (color) => {
  if (typeof color !== 'string') return color;
  const match = VAR_RE.exec(color.trim());
  if (!match) return color;
  return readToken(match[1]) || (match[2] ? resolveColor(match[2]) : '');
};

/** 'var(--chart-x)' for a chart token short name - for colours shared by DOM and canvas. */
export const chartVar = (name) => `var(--chart-${name})`;

/**
 * The colour with a new alpha: '#rrggbb' / '#rgb' / 'rgb(...)' / 'rgba(...)' / 'var(--x)'.
 * Unparseable input is returned unchanged.
 */
export const withAlpha = (color, alpha) => {
  const c = resolveColor(color);
  if (typeof c !== 'string') return c;
  let r; let g; let b;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(ch => ch + ch).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
    if (!rgb) return c;
    [r, g, b] = rgb.slice(1, 4).map(Number);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
