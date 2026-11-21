// src/components/strategyConstructor/UnsavedChangesDialog.jsx
//
// The in-app "Unsaved changes" confirmation of the constructor editor (designer_constructor_preview_v1.md
// §2.4; no window.confirm): Keep editing (initial focus; also Escape, ✕ and a click on the backdrop) ·
// Discard changes · Save and close (disabled while the draft fails the client validation). Focus
// stays inside while it is open and returns to the element that had it when it closes.
import { useEffect, useRef } from 'react';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { ESCAPE_LEVEL } from '../../utils/escapeStack';
import { LEAVE_CHOICE } from './editorLeave';
import '../watch/watch.css';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {Object} props
 * @param {string} props.name the strategy's name (or "New strategy")
 * @param {number|null} props.nextVersion the version a save creates (shown when the rules changed on a stored strategy)
 * @param {boolean} props.canSave the draft passes the client validation
 * @param {(choice: 'keep'|'discard'|'save') => void} props.onChoice
 */
export default function UnsavedChangesDialog({ name, nextVersion = null, canSave, onChoice }) {
  const boxRef = useRef(null);
  const keepRef = useRef(null);

  useEscapeLayer(() => { onChoice(LEAVE_CHOICE.KEEP); }, { level: ESCAPE_LEVEL.CONFIRM });

  useEffect(() => {
    const previous = document.activeElement;
    keepRef.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  // Focus trap: Tab / Shift+Tab wrap inside the dialog
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(boxRef.current?.querySelectorAll(FOCUSABLE) || []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="watch-modal-backdrop" role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onChoice(LEAVE_CHOICE.KEEP); }}>
      <div ref={boxRef} className="watch-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="unsaved-title" aria-describedby="unsaved-body" onKeyDown={onKeyDown} data-testid="unsaved-dialog">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 id="unsaved-title" className="text-lg font-bold">Unsaved changes</h2>
          <button type="button" onClick={() => onChoice(LEAVE_CHOICE.KEEP)} className="text-gray-500 hover:text-gray-800"
            aria-label="Keep editing">✕</button>
        </div>
        <div id="unsaved-body" className="text-sm text-gray-700">
          <p>«{name}» has changes that are not saved.</p>
          {nextVersion != null && <p className="mt-1">Saving the rule changes creates v{nextVersion}.</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" ref={keepRef} onClick={() => onChoice(LEAVE_CHOICE.KEEP)}
            className="py-2 px-4 border rounded text-gray-700 hover:bg-gray-100" data-testid="unsaved-keep">
            Keep editing
          </button>
          <button type="button" onClick={() => onChoice(LEAVE_CHOICE.DISCARD)}
            className="py-2 px-4 border border-red-600 text-red-700 rounded hover:bg-red-50" data-testid="unsaved-discard">
            Discard changes
          </button>
          <button type="button" onClick={() => onChoice(LEAVE_CHOICE.SAVE)} disabled={!canSave}
            title={canSave ? undefined : 'Fix the errors in the rules first'}
            className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400" data-testid="unsaved-save">
            Save and close
          </button>
        </div>
      </div>
    </div>
  );
}
