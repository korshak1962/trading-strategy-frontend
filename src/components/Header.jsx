// src/components/Header.jsx
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="container">
        <h1 className="header-title">Trading Strategy Backtester</h1>
        <p className="header-subtitle">Configure, test, and analyze trading strategies</p>
      </div>
    </header>
  );
};

export default Header;