// src/utils/escapeStack.js
//
// Innermost-first Escape (screener logs/agents/architect_constructor_preview_backtest_v1.md §3.3,
// designer_constructor_preview_v1.md §2.4): a stack of layers, one `document` keydown listener;
// Escape goes to the innermost active layer only. A layer has a `level` (higher = more inner: a
// confirmation 40 > a dialog 30 > a popover 20 > an editor 10); within one level the layer pushed
// last is the innermost. The handler returns `false` when it did not use the key (the next layer
// gets it); anything else consumes it (`preventDefault()`, no other layer runs).
// Ignored: other keys, an event already `defaultPrevented` (a combobox that closed its own list),
// IME composition (`isComposing`).
// Pure module (no React): the hook is hooks/useEscapeLayer.js.

/** The layer levels used by the app (higher = handled first). */
export const ESCAPE_LEVEL = Object.freeze({ EDITOR: 10, POPOVER: 20, DIALOG: 30, CONFIRM: 40 });

/**
 * @param {{addListener?: (fn: (e: KeyboardEvent) => void) => void,
 *          removeListener?: (fn: (e: KeyboardEvent) => void) => void}} [env] where the single
 *   keydown listener is attached (default: `document`); attached with the first layer, removed with the last.
 */
export const createEscapeStack = (env = {}) => {
  const layers = [];
  let seq = 0;
  const add = env.addListener
    ?? ((fn) => { if (typeof document !== 'undefined') document.addEventListener('keydown', fn); });
  const remove = env.removeListener
    ?? ((fn) => { if (typeof document !== 'undefined') document.removeEventListener('keydown', fn); });

  /** The layers, innermost first (level desc, then push order desc). */
  const ordered = () => [...layers].sort((a, b) => (b.level - a.level) || (b.seq - a.seq));

  /**
   * Escape → the innermost active layer. Returns true when a layer consumed the key.
   * @param {{key: string, defaultPrevented?: boolean, isComposing?: boolean, preventDefault?: () => void}} event
   */
  const handle = (event) => {
    if (!event || event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false;
    for (const layer of ordered()) {
      if (layer.isActive && layer.isActive() === false) continue;
      if (layer.handler(event) === false) continue;
      event.preventDefault?.();
      return true;
    }
    return false;
  };

  const listener = (e) => { handle(e); };

  /**
   * @param {{handler: (e) => (boolean|void), level?: number, isActive?: () => boolean}} layer
   * @returns {() => void} removes the layer
   */
  const push = ({ handler, level = 0, isActive = null }) => {
    const entry = { handler, level, isActive, seq: ++seq };
    layers.push(entry);
    if (layers.length === 1) add(listener);
    return () => {
      const i = layers.indexOf(entry);
      if (i < 0) return;
      layers.splice(i, 1);
      if (layers.length === 0) remove(listener);
    };
  };

  return { push, handle, size: () => layers.length };
};

/** The app's one stack (all useEscapeLayer hooks share it). */
export const escapeStack = createEscapeStack();
