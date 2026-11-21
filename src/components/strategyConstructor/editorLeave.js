// src/components/strategyConstructor/editorLeave.js
//
// Leaving the constructor editor (screener architect_constructor_preview_backtest_v1.md §3.3,
// designer_constructor_preview_v1.md §2.3-§2.4): Close ✕, the bottom Close, "← Strategies" and
// Escape all ask the same question. A clean draft closes at once; a dirty one opens the in-app
// "Unsaved changes" confirmation (Keep editing / Discard changes / Save and close, no browser
// dialogs); nothing happens while saving. Escape first leaves a fullscreen / price-only chart or a
// modal to its own handler, and the first Escape in a text field only blurs it.
// Pure logic: StrategyConstructorPanel wires it to state.
import { definitionSignature, newDraft } from './constructedFormat';

/** Choices of the "Unsaved changes" confirmation. */
export const LEAVE_CHOICE = Object.freeze({ KEEP: 'keep', DISCARD: 'discard', SAVE: 'save' });

/**
 * Close / ← Strategies / Escape on the editor.
 * @returns {'ignore'|'confirm'|'close'} ignore while saving; confirm when dirty; else close now
 */
export const requestLeave = ({ dirty, saving }) => {
  if (saving) return 'ignore';
  return dirty ? 'confirm' : 'close';
};

/**
 * A choice in the confirmation → the next step. The confirmation closes in every case.
 * @returns {'stay'|'close'|'save'} stay = keep editing; close = discard and close; save = run Save,
 *   then afterSaveAndClose
 */
export const resolveLeave = (choice) => {
  if (choice === LEAVE_CHOICE.DISCARD) return 'close';
  if (choice === LEAVE_CHOICE.SAVE) return 'save';
  return 'stay';
};

/** "Save and close" after the save: close on success, stay (with the save error shown) otherwise. */
export const afterSaveAndClose = (saved) => (saved ? 'close' : 'stay');

/**
 * A new draft nobody typed into (still exactly newDraft()) is clean: closing it asks nothing.
 * @param {Object|null} draft
 * @param {Object|null} saved the stored version (null for a new draft)
 */
export const isPristineNewDraft = (draft, saved) => {
  if (!draft || saved || draft.id != null) return false;
  if ((draft.name || '').trim() || (draft.note || '').trim()) return false;
  return definitionSignature(draft) === definitionSignature(newDraft());
};

/**
 * Dirty for the leave question: a stored strategy with changes, or a new draft with any input.
 * @param {{draft: Object|null, saved: Object|null, dirty: boolean}} p `dirty` = the panel's flag
 */
export const leaveDirty = ({ draft, saved, dirty }) => !!draft && dirty && !isPristineNewDraft(draft, saved);

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** A text field (the first Escape there only blurs it): input (text-like), textarea, select, contenteditable. */
export const isTextField = (el) => {
  if (!el || !el.tagName) return false;
  const tag = String(el.tagName).toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
  return el.isContentEditable === true;
};

/**
 * Escape on the editor layer.
 * @param {{fullscreen?: boolean, priceOnly?: boolean, modalOpen?: boolean, focusInTextField?: boolean,
 *   dirty: boolean, saving: boolean}} s
 * @returns {'pass'|'blur'|'ignore'|'confirm'|'close'} pass = not ours (fullscreen / price-only chart /
 *   another modal handles it, the key is not consumed); blur = leave the text field only; ignore =
 *   consumed, nothing happens (saving); confirm / close as requestLeave
 */
export const editorEscapeAction = ({
  fullscreen = false, priceOnly = false, modalOpen = false, focusInTextField = false, dirty, saving,
}) => {
  if (fullscreen || priceOnly || modalOpen) return 'pass';
  if (focusInTextField) return 'blur';
  return requestLeave({ dirty, saving });
};
