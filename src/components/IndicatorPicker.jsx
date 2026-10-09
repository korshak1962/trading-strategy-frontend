// src/components/IndicatorPicker.jsx
import './IndicatorPicker.css';
import { getIndicatorTooltip } from '../utils/indicatorDescriptions';

/**
 * Indicator picker for the Strategy Backtester result chart (ReporterStyleChart).
 *
 * Row 1: master "Show indicators" checkbox.
 * Row 2: one chip per series - checkbox + colour swatch + name + axis hint, with a tooltip that
 *        describes the series (indicatorDescriptions.js). Chips are disabled (but keep their
 *        checked state) while the master toggle is off.
 *
 * Used twice with the same shared selection state: in the toolbar above the chart (default
 * variant) and as the legend next to the price pane (`variant="legend"`: compact, transparent,
 * with the level zone swatches passed as `children` after the chips).
 *
 * Without `onToggleShow` / `onToggleSeries` the checkboxes are read-only (disabled).
 * Renders nothing when there are neither series nor children.
 *
 * @param {Object} props
 * @param {Array<{id, name, kind, color}>} props.seriesList
 * @param {boolean} props.showIndicators
 * @param {(show: boolean) => void} [props.onToggleShow]
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} [props.onToggleSeries]
 * @param {'toolbar'|'legend'} [props.variant='toolbar']
 * @param {string} [props.className] - extra class on the root
 * @param {string} [props.testId='indicator-picker']
 * @param {React.ReactNode} [props.children] - extra items after the chips (legend swatches)
 */
const IndicatorPicker = ({
  seriesList, showIndicators, onToggleShow, selectedIds, onToggleSeries,
  variant = 'toolbar', className = '', testId = 'indicator-picker', children = null,
}) => {
  const hasSeries = Boolean(seriesList && seriesList.length > 0);
  if (!hasSeries && !children) return null;
  const readOnly = !onToggleShow || !onToggleSeries;

  const rootClass = [
    'indicator-picker',
    variant === 'legend' ? 'indicator-picker--legend' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-testid={testId}>
      {hasSeries && (
        <label
          className="indicator-picker__master"
          title="Draw the selected indicator series on the chart. Off hides them all but keeps the selection."
        >
          <input
            type="checkbox"
            checked={showIndicators}
            disabled={readOnly}
            onChange={(e) => onToggleShow?.(e.target.checked)}
          />
          <span>Show indicators</span>
        </label>
      )}

      {hasSeries && (
        <div className={`indicator-picker__chips${showIndicators ? '' : ' indicator-picker__chips--disabled'}`}>
          {seriesList.map(series => {
            const checked = selectedIds.has(series.id);
            return (
              <label
                key={series.id}
                className={`indicator-chip${checked ? ' indicator-chip--checked' : ''}`}
                title={getIndicatorTooltip(series)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={readOnly || !showIndicators}
                  onChange={() => onToggleSeries?.(series.id)}
                />
                <span className="indicator-chip__swatch" style={{ backgroundColor: series.color }} />
                <span className="indicator-chip__name">{series.name}</span>
                <span className="indicator-chip__kind">({series.kind})</span>
              </label>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
};

export default IndicatorPicker;
