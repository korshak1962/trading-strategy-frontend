// src/components/IndicatorPicker.jsx
import './IndicatorPicker.css';

/**
 * Unified indicator picker shared by the Enhanced / Reporter-Style / Simple result charts.
 *
 * Row 1: master "Show indicators" checkbox.
 * Row 2: one chip per series - colour swatch + name + checkbox + axis hint. Chips are disabled
 *        (but keep their checked state) while the master toggle is off.
 *
 * Renders nothing when there are no series to pick from.
 *
 * @param {Object} props
 * @param {Array<{id, name, kind, color}>} props.seriesList
 * @param {boolean} props.showIndicators
 * @param {(show: boolean) => void} props.onToggleShow
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} props.onToggleSeries
 */
const IndicatorPicker = ({ seriesList, showIndicators, onToggleShow, selectedIds, onToggleSeries }) => {
  if (!seriesList || seriesList.length === 0) return null;

  return (
    <div className="indicator-picker" data-testid="indicator-picker">
      <label className="indicator-picker__master">
        <input
          type="checkbox"
          checked={showIndicators}
          onChange={(e) => onToggleShow(e.target.checked)}
        />
        <span>Show indicators</span>
      </label>

      <div className={`indicator-picker__chips${showIndicators ? '' : ' indicator-picker__chips--disabled'}`}>
        {seriesList.map(series => {
          const checked = selectedIds.has(series.id);
          return (
            <label
              key={series.id}
              className={`indicator-chip${checked ? ' indicator-chip--checked' : ''}`}
              title={`${series.name} (${series.kind === 'price' ? 'price axis overlay' : 'secondary axis / sub-pane'})`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!showIndicators}
                onChange={() => onToggleSeries(series.id)}
              />
              <span className="indicator-chip__swatch" style={{ backgroundColor: series.color }} />
              <span className="indicator-chip__name">{series.name}</span>
              <span className="indicator-chip__kind">({series.kind})</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default IndicatorPicker;
