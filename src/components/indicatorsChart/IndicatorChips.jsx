// src/components/indicatorsChart/IndicatorChips.jsx
//
// One chip per displayed indicator (TASK B2): colour, label, edit, hide / show, remove, and its
// state: an error (issue.message), a stale SMA tail (warning + "Calculate tail"), inactive on this
// timeframe (with the reason). Channels carry the A / B view toggle and "full-history view (A)";
// Levels "current zone map".
import { CHANNEL_VIEW } from '../../api/channelApi';
import { CHANNELS, LEVELS } from './indicatorSet';

/**
 * @param {Object} props
 * @param {Array<{item: Object, label: string, color: ?string, state: string, message: ?string,
 *   topUpLength: ?number}>} props.chips - state: ok | loading | error | stale | inactive
 * @param {(id: string) => void} props.onEdit
 * @param {(id: string) => void} props.onToggleHidden
 * @param {(id: string) => void} props.onRemove
 * @param {(length: number) => void} props.onTopUp
 * @param {boolean} props.topUpBusy
 * @param {(view: string) => void} props.onChannelView
 */
export default function IndicatorChips({ chips, onEdit, onToggleHidden, onRemove, onTopUp, topUpBusy, onChannelView }) {
  if (chips.length === 0) return null;
  return (
    <div className="ic-chips" data-testid="ic-chips">
      {chips.map(({ item, label, color, state, message, topUpLength }) => (
        <div
          key={item.id}
          className={`ic-chip ic-chip--${state}${item.hidden ? ' ic-chip--hidden' : ''}`}
          data-testid="ic-chip"
          data-kind={item.kind}
          data-state={state}
          title={message || undefined}
        >
          {color && <span className="ic-chip__swatch" style={{ background: color }} />}
          <span className="ic-chip__label">{label}</span>
          {item.kind === CHANNELS && (
            <span className="ic-chip__sub">
              <span className="ta-view-toggle ic-chip__view" role="group" aria-label="Channels view">
                {[[CHANNEL_VIEW.FULL, 'A'], [CHANNEL_VIEW.INCREMENTAL, 'B']].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    className={`ta-view-btn${item.params.view === v ? ' ta-view-btn--active' : ''}`}
                    aria-pressed={item.params.view === v}
                    onClick={() => onChannelView(v)}
                    title={v === CHANNEL_VIEW.FULL
                      ? 'A: as seen today - one detection over the whole range (knows how past channels continued)'
                      : 'B: as the strategy saw them - bar by bar, closed bars only'}
                    data-testid={`ic-channels-view-${v}`}
                  >
                    {l}
                  </button>
                ))}
              </span>
              {item.params.view === CHANNEL_VIEW.FULL ? 'full-history view (A)' : 'strategy view (B)'}
            </span>
          )}
          {item.kind === LEVELS && <span className="ic-chip__sub">current zone map</span>}
          {state === 'loading' && <span className="ic-chip__sub">loading…</span>}
          {(state === 'error' || state === 'stale' || state === 'inactive') && message && (
            <span className={`ic-chip__msg ic-chip__msg--${state}`} data-testid="ic-chip-msg">
              {state === 'stale' ? '⚠ ' : state === 'error' ? '✕ ' : ''}{message}
            </span>
          )}
          {state === 'stale' && topUpLength !== null && topUpLength !== undefined && (
            <button
              type="button"
              className="ic-chip__btn ic-chip__btn--text"
              onClick={() => onTopUp(topUpLength)}
              disabled={topUpBusy}
              data-testid="ic-chip-topup"
              title="Calculate the missing SMA rows of this length (written to the database)"
            >
              Calculate tail
            </button>
          )}
          <button type="button" className="ic-chip__btn" onClick={() => onEdit(item.id)} title="Edit parameters" aria-label={`Edit ${label}`} data-testid="ic-chip-edit">✎</button>
          <button
            type="button"
            className="ic-chip__btn"
            onClick={() => onToggleHidden(item.id)}
            title={item.hidden ? 'Show' : 'Hide'}
            aria-label={`${item.hidden ? 'Show' : 'Hide'} ${label}`}
            aria-pressed={item.hidden}
            data-testid="ic-chip-hide"
          >
            {item.hidden ? '◌' : '●'}
          </button>
          <button type="button" className="ic-chip__btn" onClick={() => onRemove(item.id)} title="Remove" aria-label={`Remove ${label}`} data-testid="ic-chip-remove">×</button>
        </div>
      ))}
    </div>
  );
}
