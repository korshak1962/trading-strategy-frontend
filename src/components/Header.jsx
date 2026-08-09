// src/components/Header.jsx
import './Header.css';

const Header = ({ activeTab, onChangeTab }) => {
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
        </nav>
      </div>
    </header>
  );
};

export default Header;