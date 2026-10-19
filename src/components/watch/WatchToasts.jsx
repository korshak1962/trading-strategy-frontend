// src/components/watch/WatchToasts.jsx
//
// Toast stack (top right) for new watch notifications (useWatchNotifications). A toast stays
// until closed by hand (BA §6: no auto-hide). Clicking its body opens the Watchlist and marks the
// notification read (App's onOpen); the ✕ only hides the toast — it stays unread in the badge.
import './watch.css';
import { fmtTs, zoneShort } from './format';

const KIND_LABEL = {
  SIGNALS: 'New signal',
  RETRACTED: 'Signal withdrawn',
  BROKEN: 'Watch broken',
};

/**
 * @param {Object} props
 * @param {Array<Object>} props.toasts WatchNotificationDTO[], newest first
 * @param {(n: Object) => void} props.onOpen toast clicked
 * @param {(id: number) => void} props.onDismiss
 * @param {() => void} props.onDismissAll
 */
const WatchToasts = ({ toasts, onOpen, onDismiss, onDismissAll }) => {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="watch-toasts" aria-live="polite" data-testid="watch-toasts">
      {toasts.length > 1 && (
        <button
          type="button"
          onClick={onDismissAll}
          className="self-end text-xs px-2 py-0.5 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 shadow"
          data-testid="watch-toasts-dismiss-all"
        >
          Close all
        </button>
      )}
      {toasts.map((n) => (
        <div
          key={n.id}
          className={`watch-toast watch-toast--${n.kind || 'SIGNALS'}`}
          role="status"
          data-testid="watch-toast"
          data-notification-id={n.id}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpen(n)}
              className="text-left min-w-0 flex-1"
              title="Open the Watchlist"
            >
              <div className="text-xs text-gray-500">
                {KIND_LABEL[n.kind] || 'Watch'} · {n.ticker} {n.timeFrame}
                {n.watchName ? ` · ${n.watchName}` : ''}
              </div>
              <div className="font-semibold text-gray-900 break-words">{n.title}</div>
              {n.body && (
                <div className="mt-1 text-xs text-gray-700 whitespace-pre-line break-words max-h-32 overflow-y-auto">
                  {n.body}
                </div>
              )}
              <div className="mt-1 text-xs text-gray-400">
                {fmtTs(n.createdAt)} {zoneShort(n.zone, n.ticker)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onDismiss(n.id)}
              className="text-gray-400 hover:text-gray-700 leading-none"
              aria-label="Close notification"
              title="Close (stays unread)"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WatchToasts;
