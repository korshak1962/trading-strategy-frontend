// src/components/StrategySelector.jsx
import './StrategySelector.css';

const StrategySelector = ({ availableStrategies, onAddStrategy }) => {

  const handleChange = (e) => {
    const name = e.target.value;
    if (!name) return;

    const strategy = availableStrategies.find(s => s.name === name);
    if (strategy) {
      onAddStrategy(strategy);
    }
    // Reset dropdown so the same strategy can be added again if needed
    e.target.value = '';
  };

  return (
    <div className="strategy-selector">
      <div className="strategy-selector-controls">
        <select
          defaultValue=""
          onChange={handleChange}
          className="form-select strategy-selector-select"
        >
          <option value="">Select a strategy</option>
          {availableStrategies.map((strategy) => (
            <option key={strategy.name} value={strategy.name}>
              {strategy.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default StrategySelector;
