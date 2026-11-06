// src/components/indicatorsChart/IndicatorParamsDialog.jsx
//
// The parameter dialog of the Indicators Chart picker (TASK B2, architect §6.2): opened when an
// indicator is chosen in "Add indicator" or a chip's Edit. Registry indicators: the descriptor's
// params prefilled with IndicatorParam.defaultValue and checked against its range (E11); a
// stored-only SMA length is picked from the lengths stored for the ticker / timeframe (Q5), stale
// ones marked. Channels: the detector panel (RecursiveParamsPanel, as is), the A / B view and the
// coarser channel timeframes. Levels: minimum strength and N nearest. Colour: the theme palette
// (follows a theme switch) or a custom colour.
import { useEffect, useMemo, useRef, useState } from 'react';
import RecursiveParamsPanel, { RECURSIVE_DEFAULT_PARAMS } from '../channelExplorer/RecursiveParamsPanel';
import { CHANNEL_VIEW } from '../../api/channelApi';
import { paletteColor } from '../charts/workspace/workspaceTheme';
import { resolveColor } from '../../theme/theme';
import { formatBarDate } from '../channelExplorer/format';
import { LEVEL_ZONES_MAX_N } from '../../utils/levelZones';
import {
  CHANNELS, LEVELS, DEFAULT_CHANNEL_PARAMS, DEFAULT_LEVEL_PARAMS, TIMEFRAMES, TF_RANK,
  defaultParams, paramError, sanitizeChannelParams, sanitizeLevelParams,
} from './indicatorSet';

const PALETTE = Array.from({ length: 8 }, (_, i) => paletteColor(i));

const toHex = (color) => {
  const c = resolveColor(color);
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c || '');
  if (!rgb) return '#888888';
  return `#${rgb.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * @param {Object} props
 * @param {string} props.kind - registry name, 'CHANNELS' or 'LEVELS'
 * @param {Object|null} props.descriptor - the registry descriptor (registry kinds)
 * @param {Object|null} props.item - the item being edited; null when adding
 * @param {string} props.defaultColor - colour of a new registry item
 * @param {Object|null} props.meta - GET /api/indicators/meta of the loaded ticker / timeframe, or null
 * @param {string} props.chartTf - the candle timeframe
 * @param {Object|null} props.channelConstants - read-only confirmation constants of the last detection
 * @param {(patch: {params: Object, color?: string}) => void} props.onSubmit
 * @param {() => void} props.onCancel
 */
export default function IndicatorParamsDialog({
  kind, descriptor, item, defaultColor, meta, chartTf, channelConstants = null, onSubmit, onCancel,
}) {
  const isChannels = kind === CHANNELS;
  const isLevels = kind === LEVELS;
  const [values, setValues] = useState(() => {
    if (isChannels) return sanitizeChannelParams(item?.params || DEFAULT_CHANNEL_PARAMS);
    if (isLevels) return sanitizeLevelParams(item?.params || DEFAULT_LEVEL_PARAMS);
    const base = defaultParams(descriptor);
    return Object.fromEntries(Object.entries({ ...base, ...(item?.params || {}) }).map(([k, v]) => [k, String(v)]));
  });
  const [color, setColor] = useState(item?.color || defaultColor);
  const firstFieldRef = useRef(null);

  useEffect(() => { firstFieldRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const stored = meta?.smaStored || null;
  const storedText = meta?.smaStoredText || null;

  const errors = useMemo(() => {
    if (isChannels || isLevels) return {};
    const out = {};
    for (const p of descriptor?.params || []) {
      const err = paramError(p, values[p.name]);
      if (err) { out[p.name] = err; continue; }
      if (p.storedOnly && stored && !stored.some(s => s.length === Number(values[p.name]))) {
        out[p.name] = `${descriptor.displayName}(${values[p.name]}) is not stored for ${meta.ticker} ${meta.timeframe}. Stored: ${storedText || 'none'}`;
      }
    }
    return out;
  }, [isChannels, isLevels, descriptor, values, stored, storedText, meta]);
  const valid = Object.keys(errors).length === 0;

  const title = isChannels ? 'Channels' : isLevels ? 'Levels' : (descriptor?.displayName || kind);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    if (isChannels) { onSubmit({ params: sanitizeChannelParams(values) }); return; }
    if (isLevels) { onSubmit({ params: sanitizeLevelParams(values) }); return; }
    const params = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]));
    onSubmit({ params, color });
  };

  const coarser = TIMEFRAMES.filter(tf => TF_RANK[tf] > TF_RANK[chartTf]);

  return (
    <div className="ic-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="ic-dialog" role="dialog" aria-modal="true" aria-label={`${title} parameters`} onSubmit={submit} data-testid="ic-dialog">
        <div className="ic-dialog__title">{item ? 'Edit' : 'Add'} {title}</div>
        {descriptor?.description && <div className="ic-dialog__desc">{descriptor.description}</div>}

        {!isChannels && !isLevels && (
          <>
            {(descriptor?.params || []).length === 0 && <div className="ic-dialog__hint">{title} has no parameters.</div>}
            {(descriptor?.params || []).map((p, idx) => (
              <label key={p.name} className="ic-dialog__field">
                <span className="ic-dialog__label">{p.description || p.name}</span>
                {p.storedOnly && stored ? (
                  <select
                    ref={idx === 0 ? firstFieldRef : undefined}
                    value={values[p.name]}
                    onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                    data-testid={`ic-param-${p.name}`}
                  >
                    {!stored.some(s => String(s.length) === String(values[p.name])) && (
                      <option value={values[p.name]}>{values[p.name]} (not stored)</option>
                    )}
                    {stored.map(s => (
                      <option key={s.length} value={String(s.length)}>
                        {s.length}{s.fresh ? '' : ` (stale: stored to ${formatBarDate(s.last)})`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    ref={idx === 0 ? firstFieldRef : undefined}
                    type="number"
                    value={values[p.name]}
                    min={p.min ?? undefined}
                    max={p.max ?? undefined}
                    step={p.integer ? 1 : (p.step ?? 'any')}
                    onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                    data-testid={`ic-param-${p.name}`}
                  />
                )}
                <span className="ic-dialog__hint">
                  {p.storedOnly
                    ? `Stored lengths only${storedText ? `: ${storedText}` : ''}`
                    : `${p.min ?? '…'} – ${p.max ?? '…'}${p.integer ? ', whole number' : ''}`}
                </span>
                {errors[p.name] && <span className="ic-dialog__error" data-testid="ic-param-error">{errors[p.name]}</span>}
              </label>
            ))}
            {descriptor?.warmup && <div className="ic-dialog__hint">Warm-up: {descriptor.warmup}.</div>}
            <div className="ic-dialog__field">
              <span className="ic-dialog__label">Colour</span>
              <div className="ic-swatches">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`ic-swatch${color === c ? ' ic-swatch--active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`Palette colour ${c}`}
                    aria-pressed={color === c}
                  />
                ))}
                <input
                  type="color"
                  className="ic-swatch-custom"
                  value={toHex(color)}
                  onChange={e => setColor(e.target.value)}
                  title="Custom colour"
                />
              </div>
            </div>
          </>
        )}

        {isChannels && (
          <>
            <div className="ic-dialog__field">
              <span className="ic-dialog__label">Channels view</span>
              <div className="ta-view-toggle" role="group" aria-label="Channels view">
                {[[CHANNEL_VIEW.FULL, 'A · As seen today'], [CHANNEL_VIEW.INCREMENTAL, 'B · As the strategy saw them']].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className={`ta-view-btn${values.view === v ? ' ta-view-btn--active' : ''}`}
                    aria-pressed={values.view === v}
                    onClick={() => setValues(s => ({ ...s, view: v }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="ic-dialog__hint">
                A: one detection over the whole range, which already knows how every past channel continued (full-history view).
                B: the channels the strategy traded on, bar by bar. Judge trades by eye only in B.
              </span>
            </div>
            <label className="ta-checkbox-label">
              <input
                ref={firstFieldRef}
                type="checkbox"
                checked={values.lastActualChannelsOnly}
                onChange={e => setValues(s => ({ ...s, lastActualChannelsOnly: e.target.checked }))}
              />
              Show only last actual channels
            </label>
            {coarser.length > 0 && (
              <div className="ic-dialog__field">
                <span className="ic-dialog__label">Also detect on (drawn on {chartTf} candles)</span>
                <div className="ta-tf-toggles">
                  {coarser.map(tf => (
                    <button
                      key={tf}
                      type="button"
                      className={`ta-tf-btn${values.coarserTfs.includes(tf) ? ' ta-tf-btn--active' : ''}`}
                      onClick={() => setValues(s => ({
                        ...s,
                        coarserTfs: s.coarserTfs.includes(tf) ? s.coarserTfs.filter(t => t !== tf) : [...s.coarserTfs, tf],
                      }))}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <RecursiveParamsPanel
              params={values.detector}
              setParam={(key, value) => setValues(s => ({ ...s, detector: { ...s.detector, [key]: value } }))}
              onReset={() => setValues(s => ({ ...s, detector: { ...RECURSIVE_DEFAULT_PARAMS } }))}
              constants={channelConstants}
            />
          </>
        )}

        {isLevels && (
          <>
            <label className="ic-dialog__field">
              <span className="ic-dialog__label">Minimum strength</span>
              <input
                ref={firstFieldRef}
                type="number"
                min={0}
                step="any"
                value={values.minStrength}
                onChange={e => setValues(s => ({ ...s, minStrength: e.target.value }))}
              />
            </label>
            <label className="ic-dialog__field">
              <span className="ic-dialog__label">Nearest zones above / below the last close</span>
              <input
                type="number"
                min={0}
                max={LEVEL_ZONES_MAX_N}
                step={1}
                value={values.nearestN}
                onChange={e => setValues(s => ({ ...s, nearestN: e.target.value }))}
              />
              <span className="ic-dialog__hint">0..{LEVEL_ZONES_MAX_N}; zones containing the last close are always drawn. The stored zone map as of today.</span>
            </label>
          </>
        )}

        <div className="ic-dialog__actions">
          <button type="button" className="ic-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="ic-btn ic-btn--primary" disabled={!valid} data-testid="ic-dialog-ok">OK</button>
        </div>
      </form>
    </div>
  );
}
