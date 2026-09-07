// src/hooks/useFullscreen.js
import { useState, useEffect, useCallback } from 'react';

/**
 * Toggles the native Fullscreen API on `node`, tracking whether it's currently the fullscreen
 * element (so callers can e.g. swap a button's icon/label and recompute chart dimensions).
 * Exiting via Esc, browser chrome, or any other route the browser offers is picked up
 * automatically via the `fullscreenchange` event.
 *
 * Takes the DOM node itself (nullable), not a ref object - callers whose target element mounts
 * conditionally (e.g. only once some data is loaded) should hold it in state via a callback ref
 * (`<div ref={setNode}>`) rather than `useRef`, so this hook's effects re-run when the node
 * actually appears instead of only once at the owning component's first mount.
 */
export function useFullscreen(node) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === node);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [node]);

  const toggleFullscreen = useCallback(() => {
    if (!node) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      node.requestFullscreen?.();
    }
  }, [node]);

  return { isFullscreen, toggleFullscreen };
}
