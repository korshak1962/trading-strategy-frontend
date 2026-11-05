// src/components/UnreadableBadge.jsx
//
// Badge of a stored version this server cannot read (screener logs/agents/architect.md stage 3b-0,
// F0): a constructed strategy (ConstructedStrategySummaryDTO.unreadable) or a screener filter
// (FilterDTO.unreadable) saved by a newer server. The tooltip is the backend's reason. Theme
// classes only (amber surface / text, remapped for Dark in src/theme/palette.css).

export const UNREADABLE_TEXT = 'not readable by this server (newer format)';

/** @param {{reason: string, testId?: string}} props */
export default function UnreadableBadge({ reason, testId = 'unreadable-badge' }) {
  return (
    <span className="ml-1 px-1.5 rounded border border-amber-300 bg-amber-100 text-amber-800 text-xs font-normal whitespace-nowrap"
      title={reason || UNREADABLE_TEXT} data-testid={testId}>
      {UNREADABLE_TEXT}
    </span>
  );
}
