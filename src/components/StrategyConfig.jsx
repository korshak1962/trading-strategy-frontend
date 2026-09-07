// src/components/StrategyConfig.jsx
import { useState } from 'react';
import './StrategyConfig.css';
import { getParamDescription, OPTIMIZE_FIELD_DESCRIPTIONS } from '../utils/paramDescriptions';

// Small hover/focus tooltip: an "i" icon followed by a floating description box (CSS-driven,
// see .param-info-icon / .param-tooltip in StrategyConfig.css).
const InfoTooltip = ({ text }) => (
  <span className="param-tooltip-anchor">
    <span className="param-info-icon" tabIndex={0} role="img" aria-label="info">i</span>
    <span className="param-tooltip" role="tooltip">{text}</span>
  </span>
);

const StrategyConfig = ({ selectedStrategies, onRemoveStrategy, onUpdateParam, mode }) => {
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
                mode === 'optimize' ? (
                  <div key={paramName} className="param-optimize-card">
                    <div className="param-optimize-name">
                      {paramName}
                      <InfoTooltip text={getParamDescription(strategyName, paramName)} />
                    </div>
                    <div className="param-optimize-fields">
                      {[
                        { label: 'Min',  field: 'min',  val: param.min ?? -1 },
                        { label: 'Max',  field: 'max',  val: param.max ?? 50 },
                        { label: 'Step', field: 'step', val: param.step ?? 1 },
                      ].map(({ label, field, val }) => (
                        <div key={field} className="param-optimize-field">
                          <span className="param-optimize-field-label">
                            {label}
                            <InfoTooltip text={OPTIMIZE_FIELD_DESCRIPTIONS[field]} />
                          </span>
                          <input
                            type="number" step="any" value={val}
                            onChange={(e) => onUpdateParam(strategyName, paramName, field, e.target.value)}
                            className="param-optimize-input"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={paramName} className="param-row">
                    <label className="param-label">
                      {paramName}:
                      <InfoTooltip text={getParamDescription(strategyName, paramName)} />
                    </label>
                    <input
                      type="number"
                      value={param.value}
                      // No min/max here: those fields are the Optimize-mode grid-search range
                      // (see StrategyConfig's Optimize-mode Min/Max/Step fields below), not a
                      // domain constraint on a single Backtest-mode value. A strategy can
                      // legitimately pin min===max to opt a param out of grid-search sweeping
                      // (e.g. CausalChannelBreakoutStrategy's WarmupBars) without that also
                      // locking the value here to that one number.
                      step="any"
                      onChange={(e) => onUpdateParam(strategyName, paramName, 'value', e.target.value)}
                      className="param-input"
                    />
                    <select
                      value={param.timeframe || 'DAY'}
                      onChange={(e) => onUpdateParam(strategyName, paramName, 'timeframe', e.target.value)}
                      className="param-timeframe"
                    >
                      <option value="MIN5">MIN5</option>
                      <option value="HOUR">HOUR</option>
                      <option value="DAY">DAY</option>
                      <option value="WEEK">WEEK</option>
                      <option value="MONTH">MONTH</option>
                    </select>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default StrategyConfig;