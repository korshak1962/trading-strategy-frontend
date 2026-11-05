// src/theme/useTheme.js
import { useMemo, useSyncExternalStore } from 'react';
import { getThemeSnapshot, readTokens, setThemeMode, subscribeTheme } from './theme';

/**
 * Current theme for React components.
 * @returns {{mode: 'light'|'dark'|'system', theme: 'light'|'dark', setMode: (m: string) => void}}
 *   `theme` is what is shown; put it in a canvas effect's dependencies to redraw on a switch.
 */
export const useTheme = () => {
  const { mode, theme } = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
  return { mode, theme, setMode: setThemeMode };
};

/**
 * A token set resolved for the current theme, re-read on every theme switch, e.g. for
 * lightweight-charts options:
 *   const colors = useThemeTokens(TV_CHART_TOKENS); // { background: '#131722', ... }
 *   useEffect(() => chart.applyOptions({ layout: { textColor: colors.text } }), [colors]);
 * Pass a module-level (stable) map: the result is memoized on the map and the theme.
 * @param {Object<string, string>} map - key -> CSS custom property name ('--tv-chart-bg')
 */
export const useThemeTokens = (map) => {
  const { theme } = useTheme();
  // theme is a deliberate dependency: the same map resolves to other values after a switch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readTokens(map), [map, theme]);
};
