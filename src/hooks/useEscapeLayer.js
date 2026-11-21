// src/hooks/useEscapeLayer.js
//
// Registers an Escape layer on the app's escape stack (utils/escapeStack.js) while `enabled`:
// Escape reaches the innermost active layer only (a confirmation before a dialog before a popover
// before the editor). The handler is read through a ref, so a re-render does not move the layer;
// return `false` from it to let the next layer have the key.
import { useEffect, useRef } from 'react';
import { escapeStack } from '../utils/escapeStack';

/**
 * @param {(e: KeyboardEvent) => (boolean|void)} handler
 * @param {{enabled?: boolean, level?: number}} [opts] level: ESCAPE_LEVEL.*
 */
export function useEscapeLayer(handler, { enabled = true, level = 0 } = {}) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; }, [handler]);
  useEffect(() => {
    if (!enabled) return undefined;
    return escapeStack.push({ handler: (e) => ref.current?.(e), level });
  }, [enabled, level]);
}

export default useEscapeLayer;
