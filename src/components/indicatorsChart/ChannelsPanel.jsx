// src/components/indicatorsChart/ChannelsPanel.jsx
//
// Under the chart, while the channels overlay is on: the per-timeframe visibility tabs, the
// per-timeframe facts of the result (viewInfo) and the channel cards. Moved from the former
// ChannelExplorer.jsx without a change of behaviour; the selection is shared with the chart.
import { useEffect, useRef } from 'react';
import { CHANNEL_VIEW } from '../../api/channelApi';
import { TF_LINE_WIDTH } from '../charts/workspace/layers/channelLayer';
import {
  isProvisional, formatStatus, formatAge, formatBarDate, formatExitSide, channelKey, formatPct, formatSlopePctYear,
} from '../channelExplorer/format';

const DIRECTION_LABEL = { 1: '▲ Ascending', '-1': '▼ Descending', 0: '→ Flat' };
// Theme tokens (src/theme/tokens.css --tv-*), the same hues as the chart's channel lines.
const DIRECTION_COLOR = { 1: 'var(--tv-candle-up)', '-1': 'var(--tv-candle-down)', 0: 'var(--tv-direction-flat)' };

/**
 * @param {Object} props
 * @param {ReturnType<import('./useChannelsOverlay').useChannelsOverlay>} props.overlay
 * @param {boolean} props.scrollToSelection - the selection came from the chart: scroll its card into view
 * @param {(key: ?string) => void} props.onToggleCard
 */
export default function ChannelsPanel({ overlay, scrollToSelection, onToggleCard }) {
  const cardRefs = useRef(new Map());
  const { result, tfs, visibleTfs, toggleVisibleTf, cards, selectedKey, viewInfos, resultView, channels } = overlay;

  useEffect(() => {
    if (!scrollToSelection.current || !selectedKey) return;
    scrollToSelection.current = false;
    cardRefs.current.get(selectedKey)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedKey, scrollToSelection]);

  if (!result) return null;

  return (
    <div className="ic-channels" data-testid="ic-channels-panel">
      <div className="ta-tf-tabs">
        {tfs.map(tf => (
          <button
            key={tf}
            type="button"
            className={`ta-tab${visibleTfs.has(tf) ? ' ta-tab--active' : ''}`}
            onClick={() => toggleVisibleTf(tf)}
            title={`Toggle ${tf} channels on the chart`}
          >
            <span className="ta-tab-width-swatch" style={{ height: `${TF_LINE_WIDTH[tf] ?? 1}px` }} />
            {tf}
            <span className="ta-tab-count">{result.channelsByTimeframe?.[tf]?.length ?? 0}</span>
          </button>
        ))}
      </div>

      <ViewInfoBlock viewInfos={viewInfos} resultView={resultView} result={result} />

      {cards.length > 0 ? (
        <div className="ta-ch-summary">
          {cards.map((ch) => {
            const key = channelKey(ch);
            const selected = key === selectedKey;
            const slope = formatSlopePctYear(ch);
            const widthAtr = typeof ch.widthAtr === 'number' && Number.isFinite(ch.widthAtr) ? `${ch.widthAtr.toFixed(2)} ATR` : null;
            const widthPct = typeof ch.widthPct === 'number' && Number.isFinite(ch.widthPct) ? formatPct(ch.widthPct) : null;
            const width = [widthAtr, widthPct].filter(Boolean).join(' / ');
            return (
              <div
                key={key}
                ref={el => { if (el) cardRefs.current.set(key, el); else cardRefs.current.delete(key); }}
                className={`ta-ch-card${isProvisional(ch) ? ' ta-ch-card--provisional' : ''}${ch.current ? ' ta-ch-card--current' : ''}${selected ? ' ta-ch-card--selected' : ''}`}
                data-testid="ce-channel-card"
                data-status={ch.status || ''}
                data-selected={selected ? 'true' : 'false'}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                title={selected ? 'Click to deselect this channel' : 'Click to select this channel on the chart'}
                onClick={() => onToggleCard(key)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCard(key); }
                }}
              >
                <span className="ta-ch-dir" style={{ color: DIRECTION_COLOR[ch.direction] }}>
                  {DIRECTION_LABEL[ch.direction]}
                  <span className="ta-ch-tf">{ch.timeframe}</span>
                  {typeof ch.depth === 'number' && ch.depth >= 0 && <span className="ta-ch-tf">d{ch.depth}</span>}
                  {formatStatus(ch) && (
                    <span className={`ta-ch-badge${isProvisional(ch) ? ' ta-ch-badge--provisional' : ''}`}>{formatStatus(ch)}</span>
                  )}
                  {ch.current && <span className="ta-ch-badge ta-ch-badge--current">current</span>}
                </span>
                <span className="ta-ch-meta">
                  Score {ch.score?.toFixed(1)} · Touches {ch.touchesUpper}↑ {ch.touchesLower}↓
                </span>
                {(slope || width) && (
                  <span className="ta-ch-meta ta-ch-metrics" data-testid="ce-card-metrics">
                    {slope && <span>Slope <strong>{slope}</strong></span>}
                    {width && <span>Width <strong>{width}</strong></span>}
                  </span>
                )}
                <span className="ta-ch-dates">
                  <span className="ta-nowrap">{ch.startDate?.substring(0, 10)} → {ch.endDate?.substring(0, 10)}</span>
                  {formatAge(ch.ageBars) && <> <span className="ta-nowrap">· age {formatAge(ch.ageBars)}</span></>}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        channels.length === 0 && <div className="status-msg">No channels detected for the selected timeframe(s) in this range.</div>
      )}
    </div>
  );
}

const VIEW_NAME = { FULL: 'A · as seen today', INCREMENTAL: 'B · as the strategy saw them' };

const fmtMs = (ms) => (ms === null ? null : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

// Per-timeframe facts of the result on screen (viewInfo): what was processed, the bar that is
// still forming (B: drawn as a candle, not processed), the current channel and its age, the last
// exits, the replay time, and the "too few bars" message (E20). Renders nothing on an older
// backend that sends no viewInfo.
function ViewInfoBlock({ viewInfos, resultView, result }) {
  const shown = viewInfos.filter(v => v.info);
  if (shown.length === 0) return null;
  return (
    <div className="ta-view-info" data-testid="ce-view-info">
      {shown.map(({ tf, info }) => {
        const channels = result?.channelsByTimeframe?.[tf] || [];
        const current = channels.find(c => c.current)
          || (info.currentChannelId ? channels.find(c => c.id === info.currentChannelId) : null)
          || null;
        return (
          <div key={tf} className="ta-view-info-card" data-testid={`ce-view-info-${tf}`}>
            <span><strong>{tf}</strong> · {VIEW_NAME[info.view || resultView] || info.view || '?'}</span>
            {info.message && <span className="ta-view-info-warn" data-testid="ce-view-message">{info.message}</span>}
            <span>
              Bars {formatBarDate(info.firstBarDate)} → {formatBarDate(info.lastProcessedBarDate)}
              {info.barCount !== null && ` (${info.barCount} processed)`}
            </span>
            {info.formingBarDate && (
              <span data-testid="ce-forming-bar">
                Forming bar {formatBarDate(info.formingBarDate)}: drawn, not processed
              </span>
            )}
            <span data-testid="ce-current-channel">
              {current ? (
                <>
                  Current channel: from {formatBarDate(current.startDate)}
                  {formatAge(current.ageBars) ? `, age ${formatAge(current.ageBars)}` : ''}
                  {typeof current.depth === 'number' && current.depth >= 0 ? `, depth ${current.depth}` : ''}
                </>
              ) : info.currentChannelId ? (
                <>
                  Current channel {info.currentChannelId}
                  {formatAge(info.currentChannelAgeBars) ? `, age ${formatAge(info.currentChannelAgeBars)}` : ''} (not in the drawn set)
                </>
              ) : (
                <>No current channel</>
              )}
            </span>
            {info.lastExits.length > 0 && (
              <span data-testid="ce-last-exits">
                Last exits: {info.lastExits.map(e => `d${e.depth ?? '?'} ${formatExitSide(e.side)} ${formatBarDate(e.barDate)}`).join(' · ')}
              </span>
            )}
            {(info.view || resultView) === CHANNEL_VIEW.INCREMENTAL && fmtMs(info.replayMs) && <span>Replay {fmtMs(info.replayMs)}</span>}
          </div>
        );
      })}
    </div>
  );
}
