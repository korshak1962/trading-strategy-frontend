// src/components/strategyConstructor/listRowIntent.js
//
// A row of "Constructed strategies" opens the strategy in the editor (designer_constructor_preview_v1.md
// §2.1): a click / Enter / Space on the row opens it; Ctrl / Cmd + click and a middle click open
// `#/constructor?id=N` in a new browser tab; a click that ends a text selection does nothing (the
// name can be copied); an unreadable row (saved by a newer server: Delete only) and a row being
// deleted never open. Keys on the Delete button never reach here (it stops propagation).
// Pure logic for ConstructedStrategyList.

/**
 * @param {{button?: number, ctrlKey?: boolean, metaKey?: boolean}} e the mouse event (click / auxclick)
 * @param {{unreadable?: boolean, busy?: boolean, hasSelection?: boolean}} row
 * @returns {'open'|'newTab'|null}
 */
export const rowClickIntent = (e, { unreadable = false, busy = false, hasSelection = false } = {}) => {
  if (unreadable || busy) return null;
  const button = e?.button ?? 0;
  if (button === 1) return 'newTab';
  if (button !== 0) return null;
  if (e?.ctrlKey || e?.metaKey) return 'newTab';
  if (hasSelection) return null;
  return 'open';
};

/**
 * @param {{key: string, target?: any, currentTarget?: any}} e keydown on the row
 * @param {{unreadable?: boolean, busy?: boolean}} row
 * @returns {'open'|null} only when the row itself has focus (not a button inside it)
 */
export const rowKeyIntent = (e, { unreadable = false, busy = false } = {}) => {
  if (unreadable || busy) return null;
  if (e?.target !== undefined && e?.currentTarget !== undefined && e.target !== e.currentTarget) return null;
  return e?.key === 'Enter' || e?.key === ' ' || e?.key === 'Spacebar' ? 'open' : null;
};

/** The URL of a strategy in the editor, for a new browser tab. */
export const strategyEditorUrl = (id, loc = (typeof window !== 'undefined' ? window.location : null)) => {
  const base = loc ? `${loc.pathname || ''}${loc.search || ''}` : '';
  return `${base}#/constructor?id=${id}`;
};
