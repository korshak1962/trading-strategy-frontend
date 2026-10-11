// src/components/IndicatorPicker.jsx
import './IndicatorPicker.css';
import { getIndicatorTooltip } from '../utils/indicatorDescriptions';
import { seriesLabel, SERIES_GROUP_LABELS } from '../utils/indicatorSeries';

const GROUP_TITLES = Object.freeze({
  details: 'Details: the inputs of the drawn lines (LevelBreakoutRetest: the initial stop and the sticky support line the Exit line is built from). Hidden by default; this box turns the whole group on or off.',
});

/**
 * Indicator picker for the Strategy Backtester result chart (ReporterStyleChart).
 *
 * Row 1: master "Show indicators" checkbox.
 * Row 2: one chip per series - checkbox + colour swatch + display label + axis hint, with a
 *        tooltip that describes the series (indicatorDescriptions.js). Chips are disabled (but keep
 *        their checked state) while the master toggle is off. Grouped series (SERIES_STYLE `group`,
 *        e.g. "Details") follow the ungrouped ones in their own box, led by a group checkbox that
 *        turns all of them on or off (`onToggleGroup`).
 *
 * Used twice with the same shared selection state: in the toolbar above the chart (default
 * variant) and as the legend next to the price pane (`variant="legend"`: compact, transparent,
 * with the level zone swatches passed as `children` after the chips).
 *
 * Without `onToggleShow` / `onToggleSeries` the checkboxes are read-only (disabled).
 * Renders nothing when there are neither series nor children.
 *
 * @param {Object} props
 * @param {Array<{id, name, label, kind, color, group}>} props.seriesList
 * @param {boolean} props.showIndicators
 * @param {(show: boolean) => void} [props.onToggleShow]
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} [props.onToggleSeries]
 * @param {(group: string, on: boolean) => void} [props.onToggleGroup]
 * @param {'toolbar'|'legend'} [props.variant='toolbar']
 * @param {string} [props.className] - extra class on the root
 * @param {string} [props.testId='indicator-picker']
 * @param {React.ReactNode} [props.children] - extra items after the chips (legend swatches)
 */
const IndicatorPicker = ({
  seriesList, showIndicators, onToggleShow, selectedIds, onToggleSeries, onToggleGroup,
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

  const list = seriesList || [];
  const ungrouped = list.filter(series => !series.group);
  const groupMap = new Map();
  list.filter(series => series.group).forEach(series => {
    if (!groupMap.has(series.group)) groupMap.set(series.group, []);
    groupMap.get(series.group).push(series);
  });
  const groups = Array.from(groupMap.entries());

  const renderChip = (series) => {
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
        <span className="indicator-chip__name">{seriesLabel(series)}</span>
        <span className="indicator-chip__kind">({series.kind})</span>
      </label>
    );
  };

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
          {ungrouped.map(renderChip)}
          {groups.map(([group, members]) => {
            const onCount = members.filter(series => selectedIds.has(series.id)).length;
            const allOn = onCount === members.length;
            return (
              <span key={group} className="indicator-group" data-testid={`indicator-group-${group}`}>
                <label className="indicator-group__toggle" title={GROUP_TITLES[group] || undefined}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = onCount > 0 && !allOn; }}
                    disabled={readOnly || !onToggleGroup || !showIndicators}
                    onChange={() => onToggleGroup?.(group, !allOn)}
                  />
                  <span>{SERIES_GROUP_LABELS[group] || group}</span>
                </label>
                {members.map(renderChip)}
              </span>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
};

export default IndicatorPicker;
