// src/components/charts/ChannelLayerControl.jsx
//
// Toolbar control of the channel tree layer on the strategy result chart (utils/channelLayer.js):
// on / off, the A / B view, the load state and a small legend. Shown only for a result whose
// config contains a channel strategy. Light theme, like the rest of the strategy screen.

import { CHANNEL_VIEW } from '../../api/channelApi';
import { CHANNEL_TREE_COLORS, CHANNEL_TREE_DASH } from '../../utils/ChartDrawingUtils';
import { formatBarDate } from '../channelExplorer/format';

const VIEWS = [
  { value: CHANNEL_VIEW.FULL, label: 'A · as seen today',
    title: 'Full detection over the data window: past channels are drawn knowing the bars that came after them (look-ahead by meaning).' },
  { value: CHANNEL_VIEW.INCREMENTAL, label: 'B · as the strategy saw them',
    title: 'The bar-by-bar replay the strategy traded on (same data window and structural params). Judge the trades by eye only here.' },
];

const STRATEGY_SHORT = { ChannelQuartileStrategy: 'ChannelQuartile', CausalChannelBreakoutStrategy: 'CausalChannelBreakout' };

const Swatch = ({ dashed = false, thick = false, faint = false }) => (
  <svg width="22" height="8" aria-hidden="true" className="inline-block align-middle mr-1">
    <line
      x1="1" y1="4" x2="21" y2="4"
      stroke={CHANNEL_TREE_COLORS[1]}
      strokeOpacity={faint ? 0.45 : 0.75}
      strokeWidth={thick ? 2.25 : 1.25}
      strokeDasharray={dashed ? CHANNEL_TREE_DASH.join(' ') : undefined}
    />
  </svg>
);

/**
 * @param {Object} props
 * @param {Object} props.source resolveChannelSource result (non-null: the caller hides the control otherwise)
 * @param {boolean} props.enabled
 * @param {(on: boolean) => void} props.onToggle
 * @param {'FULL'|'INCREMENTAL'} props.view
 * @param {(view: string) => void} props.onViewChange
 * @param {{channels: Array, viewInfo: Object|null, loading: boolean, error: string|null}} props.layer
 */
const ChannelLayerControl = ({ source, enabled, onToggle, view, onViewChange, layer }) => {
  const info = layer?.viewInfo || null;
  const count = layer?.channels?.length ?? 0;
  const drafts = (layer?.channels || []).filter((c) => c.status === 'PROVISIONAL').length;
  return (
    <div className="channel-layer-row text-xs text-gray-700 border border-gray-200 rounded px-2 py-1 bg-white" data-testid="channel-layer-control">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 font-medium" title={`Channel tree of ${source.strategy || 'the first channel strategy'} (its structural params and yield filter)`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            data-testid="channel-layer-toggle"
          />
          Channels{source.strategy ? ` (${STRATEGY_SHORT[source.strategy] || source.strategy})` : ''}
        </label>
        <div className="inline-flex" role="group" aria-label="Channels view">
          {VIEWS.map((v, i) => (
            <button
              key={v.value}
              type="button"
              disabled={!enabled}
              aria-pressed={view === v.value}
              title={v.title}
              onClick={() => onViewChange(v.value)}
              data-testid={`channel-layer-view-${v.value}`}
              className={`px-2 py-0.5 border ${i === 0 ? 'rounded-l' : 'rounded-r -ml-px'} ${view === v.value
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {enabled && (
          <span className="text-gray-500" data-testid="channel-layer-status">
            {layer?.loading
              ? (view === CHANNEL_VIEW.INCREMENTAL ? 'replaying…' : 'detecting…')
              : layer?.error
                ? <span className="text-red-700">{layer.error}</span>
                : `${count} channel${count === 1 ? '' : 's'}${drafts ? `, ${drafts} draft` : ''}`}
          </span>
        )}
      </div>
      {enabled && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-gray-500">
          <span><Swatch /> confirmed</span>
          <span><Swatch dashed faint /> draft (redrawn every bar)</span>
          <span><Swatch thick /> current</span>
          {view === CHANNEL_VIEW.FULL && <span className="text-amber-700">A knows the future — the strategy saw B</span>}
          {view === CHANNEL_VIEW.INCREMENTAL && info?.lastProcessedBarDate && (
            <span>after {formatBarDate(info.lastProcessedBarDate)}{info.formingBarDate ? ` · forming bar ${formatBarDate(info.formingBarDate)} not processed` : ''}</span>
          )}
          {info?.message && <span className="text-amber-700">{info.message}</span>}
        </div>
      )}
    </div>
  );
};

export default ChannelLayerControl;
