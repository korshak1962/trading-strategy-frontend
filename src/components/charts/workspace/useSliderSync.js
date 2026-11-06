// src/components/charts/workspace/useSliderSync.js
import { useCallback, useEffect, useRef, useState } from 'react';

const sameRange = (a, b) => a && b && a.startIndex === b.startIndex && a.endIndex === b.endIndex;

/**
 * Two-way binding of the bottom RangeSlider and the chart's time axis (TASK A2), in bar indices
 * of the loaded bars (channel extensions past the last bar are not part of the slider).
 * - slider -> chart: setVisibleLogicalRange({from: start - 0.5, to: end + 0.5});
 * - chart -> slider: `fromLogical` is subscribed to subscribeVisibleLogicalRangeChange; it maps
 *   back with ceil / floor (so the slider's own range maps to itself) and only sets state when the
 *   indices really changed (no feedback loop, no re-render on a pure pixel scroll).
 * @param {number} barCount
 * @param {(range: {startIndex:number, endIndex:number}) => void} [onRangeChange]
 */
export const useSliderSync = (barCount, onRangeChange) => {
  const [range, setRange] = useState({ startIndex: 0, endIndex: Math.max(0, barCount - 1) });
  const rangeRef = useRef(range);
  const countRef = useRef(barCount);
  const chartRef = useRef(null);
  const onChangeRef = useRef(onRangeChange);
  useEffect(() => { countRef.current = barCount; }, [barCount]);
  useEffect(() => { onChangeRef.current = onRangeChange; }, [onRangeChange]);

  const apply = useCallback((next) => {
    if (sameRange(rangeRef.current, next)) return;
    rangeRef.current = next;
    setRange(next);
    onChangeRef.current?.(next);
  }, []);

  /** Chart -> slider: a visible logical range (or null). */
  const fromLogical = useCallback((logical) => {
    const n = countRef.current;
    if (!logical || n < 1) return;
    const startIndex = Math.max(0, Math.min(n - 1, Math.ceil(logical.from)));
    const endIndex = Math.max(startIndex, Math.min(n - 1, Math.floor(logical.to)));
    apply({ startIndex, endIndex });
  }, [apply]);

  /** Slider -> chart. */
  const onSliderChange = useCallback(({ startIndex, endIndex }) => {
    apply({ startIndex, endIndex });
    chartRef.current?.timeScale().setVisibleLogicalRange({ from: startIndex - 0.5, to: endIndex + 0.5 });
  }, [apply]);

  /** The chart the slider drives (null on teardown). */
  const bindChart = useCallback((chart) => { chartRef.current = chart; }, []);

  return { range, fromLogical, onSliderChange, bindChart };
};
