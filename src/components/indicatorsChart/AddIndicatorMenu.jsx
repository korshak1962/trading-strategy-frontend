// src/components/indicatorsChart/AddIndicatorMenu.jsx
//
// "Add indicator" (TASK B2): every registry descriptor from GET /api/indicators/meta (no list of
// kinds in the frontend) plus the built-in Channels, Levels and Volume profile overlays. A kind that does not run
// on the chart's timeframe is listed disabled with the reason.
import { useEffect, useRef, useState } from 'react';
import { CHANNELS, LEVELS, VOLUME_PROFILE } from './indicatorSet';

/**
 * @param {Object} props
 * @param {Array} props.descriptors
 * @param {string} props.timeframe
 * @param {boolean} props.hasChannels
 * @param {boolean} props.hasLevels
 * @param {boolean} [props.hasVolumeProfile]
 * @param {(kind: string) => void} props.onPick
 */
export default function AddIndicatorMenu({ descriptors, timeframe, hasChannels, hasLevels, hasVolumeProfile = false, onPick }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (kind) => { setOpen(false); onPick(kind); };

  return (
    <div className="ic-add" ref={rootRef}>
      <button
        type="button"
        className="ic-btn ic-btn--primary"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!descriptors}
        data-testid="ic-add-indicator"
        title={descriptors ? 'Add an indicator to the chart' : 'Loading the indicator registry…'}
      >
        + Add indicator
      </button>
      {open && (
        <div className="ic-add__menu" role="menu" data-testid="ic-add-menu">
          {(descriptors || []).map(d => {
            const supported = !timeframe || (d.runTimeframes || []).includes(timeframe);
            return (
              <button
                key={d.name}
                type="button"
                role="menuitem"
                className="ic-add__item"
                disabled={!supported}
                onClick={() => pick(d.name)}
                title={supported ? d.description : `${d.displayName} is not supported on ${timeframe} yet`}
                data-testid={`ic-add-${d.name}`}
              >
                <span>{d.displayName}</span>
                <span className="ic-add__unit">{supported ? d.unit.toLowerCase().replace('_', ' ') : `not supported on ${timeframe} yet`}</span>
              </button>
            );
          })}
          <div className="ic-add__sep" />
          <button
            type="button" role="menuitem" className="ic-add__item" disabled={hasChannels}
            onClick={() => pick(CHANNELS)} data-testid="ic-add-CHANNELS"
            title={hasChannels ? 'Channels are already on the chart: edit their chip' : 'Recursive channel detection'}
          >
            <span>Channels</span><span className="ic-add__unit">{hasChannels ? 'added' : 'overlay'}</span>
          </button>
          <button
            type="button" role="menuitem" className="ic-add__item" disabled={hasLevels}
            onClick={() => pick(LEVELS)} data-testid="ic-add-LEVELS"
            title={hasLevels ? 'Levels are already on the chart: edit their chip' : 'Level zones: the zone map as of the To date, computed on load'}
          >
            <span>Levels</span><span className="ic-add__unit">{hasLevels ? 'added' : 'overlay'}</span>
          </button>
          <button
            type="button" role="menuitem" className="ic-add__item" disabled={hasVolumeProfile}
            onClick={() => pick(VOLUME_PROFILE)} data-testid="ic-add-VOLUME_PROFILE"
            title={hasVolumeProfile
              ? 'The volume profile is already on the chart: edit its chip'
              : 'Volume by price over the visible bars (like TradingView VRVP)'}
          >
            <span>Volume profile</span><span className="ic-add__unit">{hasVolumeProfile ? 'added' : 'overlay'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
