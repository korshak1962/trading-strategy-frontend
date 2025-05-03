// src/components/StrategySelector.jsx
import { useState } from 'react';
import './StrategySelector.css';
import CaseIdSelector from './CaseIdSelector';

const StrategySelector = ({ availableStrategies, onAddStrategy, onLoadCaseId, selectedStrategies }) => {
  const [selectedStrategy, setSelectedStrategy] = useState('');

  // Helper function to generate a unique strategy name
  const generateUniqueStrategyName = (originalName) => {
    // If the strategy doesn't exist in the selected strategies, return the original name
    if (!selectedStrategies[originalName]) {
      return originalName;
    }

    // Strategy already exists, so we need to find a unique name
    let counter = 1;
    let newName = `${originalName}${counter}`;
    
    // Keep incrementing the counter until we find a name that doesn't exist
    while (selectedStrategies[newName]) {
      counter++;
      newName = `${originalName}${counter}`;
    }
    
    return newName;
  };

  const handleAddStrategy = () => {
    if (!selectedStrategy) return;
    
    const strategy = availableStrategies.find(s => s.name === selectedStrategy);
    if (strategy) {
      // Create a copy of the strategy object to avoid modifying the original
      const strategyCopy = { ...strategy };
      
      // Generate a unique name for the strategy if it already exists
      strategyCopy.name = generateUniqueStrategyName(strategy.name);
      
      // Add the strategy with the potentially modified name
      onAddStrategy(strategyCopy);
      setSelectedStrategy('');
    }
  };

  return (
    <div className="strategy-selector">
      <div className="strategy-selector-row">
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
          
          <CaseIdSelector onSelectCaseId={onLoadCaseId} />
        </div>
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