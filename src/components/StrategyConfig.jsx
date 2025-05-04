// src/components/StrategyConfig.jsx
import { useState } from 'react';
import './StrategyConfig.css';

const StrategyConfig = ({ selectedStrategies, onRemoveStrategy, onUpdateParam }) => {
  // Track which strategy panels are expanded
  const [expandedStrategies, setExpandedStrategies] = useState(
    Object.keys(selectedStrategies).reduce((acc, name) => {
      acc[name] = true; // Start with all expanded
      return acc;
    }, {})
  );

  // Toggle expansion state for a strategy
  const toggleExpand = (strategyName) => {
    setExpandedStrategies(prev => ({
      ...prev,
      [strategyName]: !prev[strategyName]
    }));
  };

  // Handle parameter value change - validate only that it's a number
  const handleParamChange = (strategyName, paramName, value) => {
    // Check if it's a valid number
    if (value === '' || !isNaN(value)) {
      // Convert to number if it's a valid entry, otherwise use the original input
      const numValue = value === '' ? value : Number(value);
      onUpdateParam(strategyName, paramName, numValue);
    }
  };

  return (
    <div className="strategy-list">
      {Object.entries(selectedStrategies).map(([strategyName, params]) => (
        <div 
          key={strategyName}
          className="strategy-item"
        >
          {/* Strategy Header */}
          <div 
            className="strategy-header"
            onClick={() => toggleExpand(strategyName)}
          >
            <div className="strategy-name">{strategyName}</div>
            <div className="strategy-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveStrategy(strategyName);
                }}
                className="strategy-remove-btn"
              >
                Remove
              </button>
              <span className="strategy-toggle">
                {expandedStrategies[strategyName] ? '▼' : '►'}
              </span>
            </div>
          </div>
          
          {/* Parameters */}
          {expandedStrategies[strategyName] && (
            <div className="strategy-params">
              {Object.entries(params).map(([paramName, param]) => (
                <div key={paramName} className="param-row">
                  <label className="param-label">{paramName}:</label>
                  <input
                    type="text" // Changed from "number" to "text" for more flexible input
                    value={param.value}
                    onChange={(e) => handleParamChange(
                      strategyName, 
                      paramName, 
                      e.target.value
                    )}
                    className="param-input"
                  />
                  {/* Removed the param-info div that showed min, max, and step values */}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default StrategyConfig;