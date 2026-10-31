// src/components/Header.jsx
import './Header.css';

/**
 * @param {Object} props
 * @param {string} props.activeTab
 * @param {(tab: string) => void} props.onChangeTab
 * @param {{count: number, stale: number, errors: number}} [props.watch] Watchlist badge (unread
 *   notifications) and the warning icon (stale / failing watches), visible from any tab
 * @param {number} [props.screenerNew] Screener badge: finished screener runs not seen yet
 */
const Header = ({ activeTab, onChangeTab, watch = null, screenerNew = 0 }) => {
  const unread = watch?.count > 0 ? watch.count : 0;
  const troubled = (watch?.stale || 0) + (watch?.errors || 0);
  return (
    <header className="header">
      <div className="container header-container">
        <div>
          <h1 className="header-title">Trading Strategy Backtester</h1>
          <p className="header-subtitle">Configure, test, and analyze trading strategies</p>
        </div>
        <nav className="header-nav">
          <button
            type="button"
            className={`header-tab${activeTab === 'backtest' ? ' header-tab--active' : ''}`}
            onClick={() => onChangeTab('backtest')}
          >
            Strategy Backtester
          </button>
          <button
            type="button"
            className={`header-tab${activeTab === 'channels' ? ' header-tab--active' : ''}`}
            onClick={() => onChangeTab('channels')}
          >
            Channel Explorer
          </button>
          <button
            type="button"
            className={`header-tab${activeTab === 'screener' ? ' header-tab--active' : ''}`}
            onClick={() => onChangeTab('screener')}
            data-testid="tab-screener"
          >
            Screener
            {screenerNew > 0 && (
              <span className="header-tab-badge" aria-label={`${screenerNew} new screener results`} data-testid="screener-badge">
                {screenerNew > 99 ? '99+' : screenerNew}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`header-tab${activeTab === 'constructor' ? ' header-tab--active' : ''}`}
            onClick={() => onChangeTab('constructor')}
            data-testid="tab-constructor"
          >
            Strategy Constructor
          </button>
          <button
            type="button"
            className={`header-tab${activeTab === 'downloader' ? ' header-tab--active' : ''}`}
            onClick={() => onChangeTab('downloader')}
          >
            Downloader
          </button>
          <button
            type="button"
            className={`header-tab${activeTab === 'watchlist' ? ' header-tab--active' : ''}`}
            onClick={() => onChangeTab('watchlist')}
            data-testid="tab-watchlist"
            title={troubled > 0
              ? `${troubled} watch${troubled === 1 ? '' : 'es'} with stale data or a failing check`
              : undefined}
          >
            Watchlist
            {troubled > 0 && (
              <span className="header-tab-warn" aria-label="Watches need attention" data-testid="watchlist-warn">⚠</span>
            )}
            {unread > 0 && (
              <span className="header-tab-badge" aria-label={`${unread} unread`} data-testid="watchlist-badge">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;