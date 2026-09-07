// src/hooks/useElementSize.js
import { useState, useEffect } from 'react';

/**
 * Tracks the live content-box size of `node` via ResizeObserver - used to recompute chart
 * width/height when the element's size changes for a reason React doesn't otherwise re-render
 * for, chiefly entering/exiting fullscreen.
 *
 * Takes the DOM node itself (nullable), not a ref object - see {@link useFullscreen}'s doc
 * comment for why: a plain `useRef` + `useEffect([ref])` never re-attaches the observer if the
 * target element mounts after this hook's owning component already did.
 */
export function useElementSize(node) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(node);

    // Seed with the current size immediately - ResizeObserver's first callback is async,
    // so without this the first render after the node appears sees {width:0, height:0}.
    setSize({ width: node.clientWidth, height: node.clientHeight });

    return () => observer.disconnect();
  }, [node]);

  return size;
}
