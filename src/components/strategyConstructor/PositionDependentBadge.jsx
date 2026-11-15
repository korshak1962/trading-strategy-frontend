// src/components/strategyConstructor/PositionDependentBadge.jsx
//
// "PD" mark of a position-dependent constructed version (stage 4c-1): a rule reads the trade
// (AT_ENTRY / MAX_SINCE_ENTRY / MIN_SINCE_ENTRY), so the version runs bar by bar on the merged
// position (PositionalConstructedStrategy). The flag is derived from the definition, never stored.
// Colours from the theme tokens (light and dark).

const DEFAULT_TITLE = 'Position-dependent: a rule reads the trade (AT_ENTRY / MAX_SINCE_ENTRY / MIN_SINCE_ENTRY, LONG only), '
  + 'so the strategy runs bar by bar on the merged position. In a case the position is shared with the other strategies.';

/**
 * @param {Object} props
 * @param {string} [props.testId]
 * @param {string} [props.title] tooltip
 * @param {boolean} [props.long] "position-dependent" instead of "PD"
 */
export default function PositionDependentBadge({ testId = 'pd-badge', title = DEFAULT_TITLE, long = false }) {
  return (
    <span className="ml-1 px-1.5 rounded border text-xs font-medium align-middle bg-purple-50 text-purple-800"
      style={{ borderColor: 'var(--c-purple-200)' }} title={title} data-testid={testId}>
      {long ? 'position-dependent' : 'PD'}
    </span>
  );
}
