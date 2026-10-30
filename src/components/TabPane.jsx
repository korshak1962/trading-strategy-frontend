// src/components/TabPane.jsx
//
// Keep-alive tab (screener logs/agents/architect.md "Browser navigation" §2): mounted the first
// time it is shown, afterwards only hidden, so Back / Forward return to the same results, chart and
// scroll without new requests. Children read whether their tab is the visible one with
// useTabActive() (e.g. to ignore global key presses while hidden).
import { useState } from 'react';
import { TabActiveContext } from './tabActive';

/**
 * @param {Object} props
 * @param {boolean} props.active the tab is the visible one
 * @param {import('react').ReactNode} props.children
 */
export default function TabPane({ active, children }) {
  const [mounted, setMounted] = useState(active);
  if (active && !mounted) setMounted(true);
  if (!mounted && !active) return null;
  return (
    <TabActiveContext.Provider value={active}>
      {/* display: contents keeps the page's flex layout as if the wrapper were not there */}
      <div hidden={!active} style={active ? { display: 'contents' } : undefined}>
        {children}
      </div>
    </TabActiveContext.Provider>
  );
}
