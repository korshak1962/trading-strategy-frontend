// src/components/StrategySelector.jsx
import { useState } from 'react';
import './StrategySelector.css';

const StrategySelector = ({ availableStrategies, onAddStrategy }) => {
  const [selectedStrategy, setSelectedStrategy] = useState('');

  const handleAddStrategy = () => {
    if (!selectedStrategy) return;
    
    const strategy = availableStrategies.find(s => s.name === selectedStrategy);
    if (strategy) {
      onAddStrategy(strategy);
      setSelectedStrategy('');
    }
  };

  return (
    <div className="strategy-selector">
      <div className="strategy-selector-controls">
        <select
          value={selectedStrategy}
          onChange={(e) => setSelectedStrategy(e.target.value)}
          className="form-select strategy-selector-select"
        >
          <option value="">Select a strategy</option>
          {availableStrategies.map((strategy) => (
            <option key={strategy.name} value={strategy.name}>
              {strategy.name}
            </option>
          ))}
        </select>
        
        <button
          type="button"
          onClick={handleAddStrategy}
          disabled={!selectedStrategy}
          className="btn btn-success"
        >
          Add Strategy
        </button>
      </div>
      
      {selectedStrategy && (
        <div className="strategy-info">
          <h4 className="strategy-name">{availableStrategies.find(s => s.name === selectedStrategy)?.name}</h4>
          <p className="strategy-description">
            {availableStrategies.find(s => s.name === selectedStrategy)?.description}
          </p>
        </div>
      )}
    </div>
  );
};

export default StrategySelector;