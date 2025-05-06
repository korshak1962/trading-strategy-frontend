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
  
  // State for optimization mode
  const [optimizationMode, setOptimizationMode] = useState(false);
  
  // Local state to track input values during editing
  const [inputValues, setInputValues] = useState({});

  // Toggle expansion state for a strategy
  const toggleExpand = (strategyName) => {
    setExpandedStrategies(prev => ({
      ...prev,
      [strategyName]: !prev[strategyName]
    }));
  };

  // Handle parameter value change - store as string during editing
  const handleParamChange = (strategyName, paramName, field, value) => {
    // Update local state for controlled inputs
    setInputValues(prev => ({
      ...prev,
      [`${strategyName}-${paramName}-${field}`]: value
    }));
    
    // Only update parent state if it's a valid number or empty
    if (value === '' || !isNaN(parseFloat(value))) {
      // For valid numbers, convert to float
      const processedValue = value === '' ? '' : parseFloat(value);
      onUpdateParam(strategyName, paramName, processedValue, field);
    }
  };

  // Get current input value (from local state or from props)
  const getInputValue = (strategyName, paramName, field, defaultValue) => {
    const key = `${strategyName}-${paramName}-${field}`;
    return inputValues[key] !== undefined ? inputValues[key] : defaultValue;
  };

  return (
    <div>
      <div className="strategy-header-with-checkbox">
        <h3 className="config-title">Configure Strategies</h3>
        <label className="optimization-mode-label">
          <input
            type="checkbox"
            checked={optimizationMode}
            onChange={() => setOptimizationMode(!optimizationMode)}
            className="optimization-mode-checkbox"
          />
          Turn on optimization mode
        </label>
      </div>
      
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
                    <span className="param-label">{paramName}:</span>
                    <input
                      type="text"
                      value={getInputValue(strategyName, paramName, 'value', param.value)}
                      onChange={(e) => handleParamChange(
                        strategyName, 
                        paramName,
                        'value',
                        e.target.value
                      )}
                      className="param-input"
                    />
                    
                    {/* Optimization fields - only visible when optimization mode is on */}
                    {optimizationMode && (
                      <>
                        <span className="param-optimization-label">Min:</span>
                        <input
                          type="text"
                          value={getInputValue(strategyName, paramName, 'min', param.min)}
                          onChange={(e) => handleParamChange(
                            strategyName,
                            paramName,
                            'min',
                            e.target.value
                          )}
                          className="param-optimization-input"
                        />
                        
                        <span className="param-optimization-label">Max:</span>
                        <input
                          type="text"
                          value={getInputValue(strategyName, paramName, 'max', param.max)}
                          onChange={(e) => handleParamChange(
                            strategyName,
                            paramName,
                            'max',
                            e.target.value
                          )}
                          className="param-optimization-input"
                        />
                        
                        <span className="step-label">Step:</span>
                        <input
                          type="text"
                          value={getInputValue(strategyName, paramName, 'step', param.step)}
                          onChange={(e) => handleParamChange(
                            strategyName,
                            paramName,
                            'step',
                            e.target.value
                          )}
                          className="step-input"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrategyConfig;