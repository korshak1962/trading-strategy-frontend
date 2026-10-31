// src/components/StrategySelector.jsx
import './StrategySelector.css';
import { isConstructedInfo, parseConstructedKey } from './strategyConstructor/constructedFormat';

// A constructed strategy (StrategyInfoDTO kind CONSTRUCTED, name = request key Constructed:<id>@<v>)
// is listed by its display name and version; selecting it pins that version (O2).
const constructedLabel = (s) => {
  const version = s.version ?? parseConstructedKey(s.name)?.version;
  return `${s.displayName || s.name}${version != null ? ` · v${version}` : ''}`;
};

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

  const builtIn = availableStrategies.filter(s => !isConstructedInfo(s));
  const constructed = availableStrategies.filter(isConstructedInfo);

  return (
    <div className="strategy-selector">
      <div className="strategy-selector-controls">
        <select
          defaultValue=""
          onChange={handleChange}
          className="strategy-selector-select block w-full max-w-full min-w-0 p-2 border rounded bg-white"
          data-testid="strategy-selector"
        >
          <option value="">Select a strategy</option>
          {constructed.length === 0 ? builtIn.map((strategy) => (
            <option key={strategy.name} value={strategy.name}>
              {strategy.name}
            </option>
          )) : (
            <>
              <optgroup label="Strategies">
                {builtIn.map((strategy) => (
                  <option key={strategy.name} value={strategy.name}>{strategy.name}</option>
                ))}
              </optgroup>
              <optgroup label="Constructed strategies">
                {constructed.map((strategy) => (
                  <option key={strategy.name} value={strategy.name}>{constructedLabel(strategy)}</option>
                ))}
              </optgroup>
            </>
          )}
        </select>
      </div>
    </div>
  );
};

export default StrategySelector;
