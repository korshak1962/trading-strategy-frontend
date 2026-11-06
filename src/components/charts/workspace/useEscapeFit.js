// src/components/charts/workspace/useEscapeFit.js
import { useEffect, useRef } from 'react';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Escape = "Fit" (TASK A5): only while the enclosing tab is the visible one and the focus is not
 * in a form field. In fullscreen the browser takes the first Escape to leave fullscreen; that is
 * expected and not intercepted. Nothing else is undone (selection, extend / delete edits stay).
 * @param {() => void} fit
 * @param {boolean} tabActive
 */
export const useEscapeFit = (fit, tabActive) => {
  const fitRef = useRef(fit);
  const activeRef = useRef(tabActive);
  useEffect(() => { fitRef.current = fit; }, [fit]);
  useEffect(() => { activeRef.current = tabActive; }, [tabActive]);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || !activeRef.current) return;
      const tag = document.activeElement?.tagName;
      if (tag && TYPING_TAGS.has(tag)) return;
      fitRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
