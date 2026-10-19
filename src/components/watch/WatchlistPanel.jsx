// src/components/watch/WatchlistPanel.jsx
//
// Watchlist tab (screener architect.md "Signal watch — design rev 1" §6.1): the inbox of
// notifications, the watch table and the signal feed. Watches are created from a saved case
// (SavedCasesPanel "Watch" / SaveCaseControl "Watch this setup" → CreateWatchDialog).
// Refreshes on mount, every 60 s while the tab is open and visible, and whenever a new
// notification arrives (latestId from useWatchNotifications).
import { useCallback, useEffect, useRef, useState } from 'react';
import './watch.css';
import {
  deleteWatch, evaluateAll, evaluateWatch, listNotifications, listWatchSignals, listWatches,
  markAllRead, markNotificationRead, setWatchStatus,
} from '../../api/watchApi';
import WatchTable from './WatchTable';
import WatchSignalFeed from './WatchSignalFeed';
import { describeError, fmtTs, positionText, zoneShort } from './format';

const REFRESH_MS = 60_000;
const FEED_LIMIT = 200;
const INBOX_LIMIT = 50;

const NOT_AVAILABLE = 'The backend does not serve the watch API (404) — it may be an older build. '
  + 'Restart the backend with the Signal watch feature.';

/**
 * @param {Object} props
 * @param {(watchId: number, signalId?: number|null) => void} props.onOpenInBacktest deep link
 * @param {number|null} props.latestNotificationId bumps → refresh
 * @param {() => void} props.onNotificationsChanged after mark read (refreshes the badge)
 */
const WatchlistPanel = ({ onOpenInBacktest, latestNotificationId = null, onNotificationsChanged }) => {
  const [watches, setWatches] = useState(null); // null = not loaded yet
  const [loadError, setLoadError] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rowMessages, setRowMessages] = useState({});
  const [panelNotice, setPanelNotice] = useState(null); // {kind, text}
  const [checkingAll, setCheckingAll] = useState(false);

  const [signals, setSignals] = useState([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [filterWatchId, setFilterWatchId] = useState(null);
  const [includeBaseline, setIncludeBaseline] = useState(true);

  const [inbox, setInbox] = useState([]);
  const [inboxBusy, setInboxBusy] = useState(false);

  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mySeq = ++seq.current;
    setSignalsLoading(true);
    const [w, s, n] = await Promise.allSettled([
      listWatches(),
      listWatchSignals({ watchId: filterWatchId, includeBaseline, limit: FEED_LIMIT }),
      listNotifications({ unreadOnly: false, limit: INBOX_LIMIT }),
    ]);
    if (mySeq !== seq.current) return;
    setSignalsLoading(false);
    if (w.status === 'fulfilled') {
      setWatches(Array.isArray(w.value) ? w.value : []);
      setLoadError(null);
    } else {
      setLoadError(w.reason?.status === 404 ? NOT_AVAILABLE : `Could not load watches: ${describeError(w.reason)}`);
      setWatches((prev) => prev ?? []);
    }
    if (s.status === 'fulfilled') setSignals(Array.isArray(s.value) ? s.value : []);
    if (n.status === 'fulfilled') setInbox(Array.isArray(n.value) ? n.value : []);
  }, [filterWatchId, includeBaseline]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // A new notification (badge poll) → reload the table, feed and inbox. Keyed on the id only (the
  // refresh function changes with the feed filters, which the effect above already handles).
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const lastLatest = useRef(latestNotificationId);
  useEffect(() => {
    if (lastLatest.current === latestNotificationId) return;
    lastLatest.current = latestNotificationId;
    refreshRef.current();
  }, [latestNotificationId]);

  const setRowMessage = (id, msg) => setRowMessages((prev) => ({ ...prev, [id]: msg }));

  const rowAction = async (w, fn) => {
    setBusyId(w.id);
    setRowMessage(w.id, null);
    try {
      const msg = await fn();
      if (msg) setRowMessage(w.id, { kind: 'ok', text: msg });
    } catch (err) {
      setRowMessage(w.id, { kind: 'error', text: describeError(err) });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  const handleSetStatus = (w, status) => {
    if (status === 'CLOSED'
      && !window.confirm(`Close the watch "${w.name}"? It stops watching; its history is kept. A closed watch cannot be resumed.`)) {
      return;
    }
    rowAction(w, async () => {
      await setWatchStatus(w.id, status);
      return null;
    });
  };

  const handleCheck = (w) => rowAction(w, async () => {
    try {
      const r = await evaluateWatch(w.id);
      if (r?.error) return `Checked — the run failed: ${r.error}`;
      const parts = [
        `${r?.inserted ?? 0} new`,
        `${r?.confirmed ?? 0} confirmed`,
        `${r?.retracted ?? 0} withdrawn`,
      ];
      const pos = typeof r?.position === 'string' ? r.position : positionText(r?.position);
      return `Checked: ${parts.join(', ')}${pos && pos !== '—' ? ` · now ${pos}` : ''}`
        + `${r?.lastBarDate ? ` · last bar ${fmtTs(r.lastBarDate)}` : ''}`;
    } catch (err) {
      if (err.status === 409 && err.code === 'EVALUATION_IN_PROGRESS') return 'A check is already running.';
      throw err;
    }
  });

  const handleDelete = (w) => {
    if (!window.confirm(`Delete the watch "${w.name}"? This also deletes its signal feed and notifications.`)) return;
    rowAction(w, async () => {
      try {
        await deleteWatch(w.id);
      } catch (err) {
        if (err.status !== 404) throw err; // already gone: the refresh shows it
      }
      if (filterWatchId === w.id) setFilterWatchId(null);
      onNotificationsChanged?.();
      return null;
    });
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    setPanelNotice(null);
    try {
      const r = await evaluateAll();
      setPanelNotice({ kind: 'ok', text: `Queued ${r?.queued ?? 'all'} active watch(es) for a check. The table refreshes when they finish.` });
    } catch (err) {
      setPanelNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setCheckingAll(false);
    }
  };

  const handleMarkRead = async (n) => {
    setInboxBusy(true);
    try {
      await markNotificationRead(n.id);
    } catch (err) {
      if (err.status !== 404) setPanelNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setInboxBusy(false);
      onNotificationsChanged?.();
      refresh();
    }
  };

  const handleMarkAllRead = async () => {
    setInboxBusy(true);
    try {
      await markAllRead();
    } catch (err) {
      setPanelNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setInboxBusy(false);
      onNotificationsChanged?.();
      refresh();
    }
  };

  const openNotification = (n) => {
    if (!n.read) handleMarkRead(n);
    const ids = Array.isArray(n.signalIds) ? n.signalIds : [];
    onOpenInBacktest(n.watchId, ids.length > 0 ? ids[ids.length - 1] : null);
  };

  const all = watches || [];
  const visible = showClosed ? all : all.filter((w) => w.status !== 'CLOSED');
  const closedCount = all.length - all.filter((w) => w.status !== 'CLOSED').length;
  const unread = inbox.filter((n) => !n.read);

  return (
    <div className="flex flex-col gap-8" data-testid="watchlist-panel">
      {/* Watches */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h2 className="text-xl font-bold">Watchlist</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm"
              data-testid="watchlist-refresh"
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              onClick={handleCheckAll}
              disabled={checkingAll || !!loadError}
              className="py-1 px-3 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 text-sm disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-white"
              data-testid="watchlist-check-all"
            >
              {checkingAll ? 'Queuing…' : 'Check all'}
            </button>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Each watch re-runs its frozen case after every download and reports new signals on closed bars.
          Create one with <b>Watch</b> next to a saved case (Strategy Backtester). Click a row to replay it in Backtest.
        </p>

        {loadError && <div className="form-error mb-3" role="alert" data-testid="watchlist-error">{loadError}</div>}
        {panelNotice && (
          <div
            className={`mb-3 p-2 rounded text-sm border ${panelNotice.kind === 'error'
              ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}
            role="status"
          >
            {panelNotice.text}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            data-testid="watchlist-show-closed"
          />
          Show closed{closedCount > 0 ? ` (${closedCount})` : ''}
        </label>

        {watches === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="watchlist-empty">
            {loadError ? '' : 'No watches yet.'}
          </p>
        ) : (
          <WatchTable
            watches={visible}
            busyId={busyId}
            rowMessages={rowMessages}
            onOpen={(w) => onOpenInBacktest(w.id, null)}
            onSetStatus={handleSetStatus}
            onCheck={handleCheck}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Inbox */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold">
            Notifications{unread.length > 0 ? ` (${unread.length} unread)` : ''}
          </h2>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={inboxBusy || unread.length === 0}
            className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 text-sm disabled:text-gray-400 disabled:hover:bg-white"
            data-testid="notifications-read-all"
          >
            Mark all read
          </button>
        </div>
        {inbox.length === 0 ? (
          <p className="text-sm text-gray-500">No notifications.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto" data-testid="notifications-list">
            {inbox.map((n) => (
              <li
                key={n.id}
                className={`py-2 flex items-start justify-between gap-3 ${n.read ? 'text-gray-500' : ''}`}
                data-testid="notification-item"
                data-read={n.read ? 'true' : 'false'}
              >
                <button type="button" onClick={() => openNotification(n)} className="text-left min-w-0 flex-1" title="Open in Backtest">
                  <div className={`text-sm break-words ${n.read ? '' : 'font-semibold text-gray-900'}`}>
                    {!n.read && <span className="inline-block w-2 h-2 mr-1.5 rounded-full bg-blue-600 align-middle" aria-label="unread" />}
                    {n.title}
                  </div>
                  {n.body && <div className="text-xs whitespace-pre-line break-words">{n.body}</div>}
                  <div className="text-xs text-gray-400">
                    {n.kind} · {n.ticker} {n.timeFrame}{n.watchName ? ` · ${n.watchName}` : ''} · {fmtTs(n.createdAt)} {zoneShort(n.zone, n.ticker)}
                  </div>
                </button>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n)}
                    disabled={inboxBusy}
                    className="shrink-0 py-0.5 px-2 text-xs border rounded text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
                    data-testid="notification-mark-read"
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Signal feed */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-3">Signal feed</h2>
        <WatchSignalFeed
          signals={signals}
          watches={all}
          filterWatchId={filterWatchId}
          onFilterChange={setFilterWatchId}
          includeBaseline={includeBaseline}
          onIncludeBaselineChange={setIncludeBaseline}
          onOpen={(s) => onOpenInBacktest(s.watchId, s.id)}
          loading={signalsLoading}
        />
      </div>
    </div>
  );
};

export default WatchlistPanel;
