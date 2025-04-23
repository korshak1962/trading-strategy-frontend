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
                    type="number"
                    value={param.value}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    onChange={(e) => onUpdateParam(
                      strategyName, 
                      paramName, 
                      e.target.value
                    )}
                    className="param-input"
                  />
                  <div className="param-info">
                    Min: {param.min}, Max: {param.max}, Step: {param.step}
                  </div>
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