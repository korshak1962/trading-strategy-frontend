import { useCallback, useMemo, useState } from 'react';
import PriceWorkspaceChart from '../charts/workspace/PriceWorkspaceChart';
import { createChannelLayer } from '../charts/workspace/layers/channelLayer';
import { formatPct, formatStatus, formatAge, formatExitSide, formatBarDate } from './format';
import './ChannelExplorerChart.css';

// `exits` (B view only, else []): viewInfo[tf].lastExits of the visible timeframes, each tagged
// with its `timeframe` - {depth, side: UP|DOWN, barDate, recompute, broken {id, startDate,
// upperPoints, lowerPoints}}.
const NO_EXITS = [];

/**
 * The Channel Explorer chart: the shared PriceWorkspaceChart (log scale, slider, autofit,
 * tooltip, Esc = Fit, theme, attribution) with the channels layer. A thin wrapper until stage B
 * moves the tab onto the workspace (architect design §6.1).
 *
 * Selection is shared with the parent's channel cards: `selectedKey` (a channelKey or null) is
 * the parent's selection, applied in place whenever it differs from the chart's own;
 * `onSelectChannel(key|null)` reports every selection change made on the chart (line click,
 * empty-space click, Delete) or a requested key that cannot be selected here.
 * The parent memoises `channels` / `zoomChannels` / `exits`: a new array reference rebuilds the
 * channel lines (the chart itself, its zoom and pan, stay).
 */
export default function ChannelExplorerChart({
  prices, channels, zoomChannels, runId, exits = NO_EXITS, selectedKey = null, onSelectChannel = null,
  ticker = null, timeframe = null,
}) {
  // The selected Channel object, only for the readout under the chart.
  const [selectedChannel, setSelectedChannel] = useState(null);
  // Hierarchy highlight mode: 'off' | 'up' | 'down'. A mode change repaints the lines in place.
  const [hierarchyMode, setHierarchyMode] = useState('up');

  // The backend emits `id`/`parentId` on every channel; without them the tree is unexpressible
  // and the control hides itself.
  const hierarchyAvailable = (channels || []).some(c => c && c.id);

  const onSelectedChannel = useCallback((ch) => setSelectedChannel(ch), []);
  const layerData = useMemo(() => ({
    channels, zoomChannels, runId, exits, selectedKey, hierarchyMode,
    onSelect: onSelectChannel, onSelectedChannel,
  }), [channels, zoomChannels, runId, exits, selectedKey, hierarchyMode, onSelectChannel, onSelectedChannel]);
  const layers = useMemo(() => [{ id: 'channels', factory: createChannelLayer, data: layerData }], [layerData]);

  const toolbar = hierarchyAvailable && (
    <div className="ch-hierarchy-toggle" role="group" aria-label="Hierarchy highlight">
      <span className="ch-hierarchy-label">Hierarchy</span>
      {[['off', 'Off'], ['up', 'Up'], ['down', 'Down']].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`ch-hierarchy-btn${hierarchyMode === value ? ' ch-hierarchy-btn--active' : ''}`}
          aria-pressed={hierarchyMode === value}
          onClick={() => setHierarchyMode(value)}
          title={
            value === 'off'
              ? 'No hierarchy highlighting'
              : value === 'up'
                ? "Tint the selected channel's parent channels"
                : "Tint the selected channel's child channels"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );

  const hint = (
    <>
      {selectedChannel && (
        <>
          <strong>Selected channel</strong>
          {typeof selectedChannel.widthPct === 'number' && <> — Width: {formatPct(selectedChannel.widthPct)}</>}
          {typeof selectedChannel.widthAtr === 'number' && <> ({selectedChannel.widthAtr.toFixed(2)} ATR)</>}
          {typeof selectedChannel.depth === 'number' && selectedChannel.depth >= 0 && <> · depth {selectedChannel.depth}</>}
          {formatStatus(selectedChannel) && <> · {formatStatus(selectedChannel)}</>}
          {selectedChannel.current && <> · current channel</>}
          {formatAge(selectedChannel.ageBars) && <> · age {formatAge(selectedChannel.ageBars)}</>}
          {selectedChannel.builtDate && <> · built {formatBarDate(selectedChannel.builtDate)}</>}
          <br />
        </>
      )}
      Click a channel line (or its card below) to select it · drag the yellow handle to extend/shrink · Delete/Backspace to remove
      · ▲/▼ arrows mark where a close price crossed a channel boundary
      · Log = logarithmic price scale (channels are fitted on ln(price), so they draw straight)
      · drag the chart to pan, scroll over the price axis to zoom vertically, double-click it or Fit to reset
      · drag the slider below to pick the period · Esc to reset zoom
      · ⛶ for full screen, Esc to exit
      {hierarchyAvailable && " · Hierarchy Up/Down tints the selection's parents/children violet, fading with distance"}
      · dashed faded lines = draft (provisional) channels, a thicker line = the current channel
      {exits.length > 0 && ` · orange dots = the last exit per depth (${exits.map(e => `d${e.depth ?? '?'} ${formatExitSide(e.side)}`).join(', ')}), dotted orange = the broken channel`}
    </>
  );

  return (
    <PriceWorkspaceChart
      bars={prices}
      ticker={ticker}
      timeframe={timeframe}
      layers={layers}
      toolbar={toolbar}
      hint={hint}
      className="ch-chart-wrapper"
      containerClassName="ch-chart-container"
    />
  );
}
