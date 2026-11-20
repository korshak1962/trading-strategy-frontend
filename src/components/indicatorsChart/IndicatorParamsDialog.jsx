// src/components/indicatorsChart/IndicatorParamsDialog.jsx
//
// The parameter dialog of the Indicators Chart picker (TASK B2, architect §6.2): opened when an
// indicator is chosen in "Add indicator" or a chip's Edit. Registry indicators: the descriptor's
// params prefilled with IndicatorParam.defaultValue and checked against its range (E11); a
// stored-only SMA length is picked from the lengths stored for the ticker / timeframe (Q5), stale
// ones marked. Channels: the detector panel (RecursiveParamsPanel, as is), the A / B view and the
// coarser channel timeframes. Levels: minimum strength, N nearest and the detection variant
// (GET /api/levels/variants, level range zones stage 2). Volume profile: rows and
// width (no colour: the theme's candle up / down). Colour: the theme palette (follows a theme
// switch) or a custom colour. A descriptor's choice params (CORR's benchmark, KAIRI's form) are a
// <select> of the choices of the ticker's market (all when no ticker is loaded; a choice without a
// market - KAIRI's forms - is offered everywhere); their value stays a string.
import { useEffect, useMemo, useRef, useState } from 'react';
import RecursiveParamsPanel, { RECURSIVE_DEFAULT_PARAMS } from '../channelExplorer/RecursiveParamsPanel';
import { CHANNEL_VIEW } from '../../api/channelApi';
import { paletteColor } from '../charts/workspace/workspaceTheme';
import { resolveColor } from '../../theme/theme';
import { formatBarKey } from '../charts/workspace/bars';
import { LEVEL_CHART_MAX_N } from '../../utils/levelZones';
import {
  VP_ROWS_MIN, VP_ROWS_MAX, VP_WIDTH_MIN, VP_WIDTH_MAX,
} from '../../utils/volumeProfile';
import {
  CHANNELS, LEVELS, VOLUME_PROFILE, DEFAULT_CHANNEL_PARAMS, DEFAULT_LEVEL_PARAMS, DEFAULT_VOLUME_PROFILE_PARAMS,
  TIMEFRAMES, TF_RANK, defaultParams, paramError, sanitizeChannelParams, sanitizeLevelParams,
  sanitizeVolumeProfileParams, volumeProfileParamErrors,
} from './indicatorSet';
import { normalizeChoiceParams, benchmarkTickerIssue, marketOfTicker, unitLabel } from '../../api/indicatorCatalog';

const PALETTE = Array.from({ length: 8 }, (_, i) => paletteColor(i));
const NO_VARIANTS = Object.freeze({ list: null, error: null });

/** Option text of a variant row: the legacy row is marked as the map strategies and watches trade. */
const variantOptionText = (v) => {
  const tags = [];
  if (v.legacy) tags.push('used by strategies');
  if (v.isDefault && !v.legacy) tags.push('default');
  return tags.length ? `${v.label} (${tags.join(', ')})` : v.label;
};

/**
 * Levels "Detection variant" select (level range zones, stage 2). `value` is the stored id or null
 * (= the default row); the select's '' option stands for null, so picking the default row stores
 * null and the request sends no `variant`. A stored id the list does not hold is kept as an
 * "(unknown)" option; without the list (old backend, error) only the default and the stored id are
 * offered, with a quiet note.
 */
function LevelVariantField({ value, variants, onChange }) {
  const list = variants?.list || null;
  const def = list?.find(v => v.isDefault) || null;
  const legacy = list?.find(v => v.legacy) || null;
  const selectValue = value && (!def || value !== def.id) ? value : '';
  const known = selectValue === '' ? def : list?.find(v => v.id === selectValue) || null;
  const others = (list || []).filter(v => v !== def);
  let hint;
  if (variants?.error) hint = 'Variants could not be loaded; the default map is used.';
  else if (!list) hint = 'Loading variants…';
  else hint = known?.description || (selectValue ? 'Not offered by the server; the map request may be refused.' : '');
  const shownId = selectValue || def?.id || null;
  const differsFromStrategies = Boolean(legacy && shownId && shownId !== legacy.id);
  return (
    <label className="ic-dialog__field">
      <span className="ic-dialog__label">Detection variant</span>
      <select
        value={selectValue}
        onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
        data-testid="ic-levels-variant"
        title={known?.description || undefined}
      >
        <option value="" title={def?.description || undefined}>{def ? variantOptionText(def) : 'Default'}</option>
        {others.map(v => (
          <option key={v.id} value={v.id} title={v.description || undefined}>{variantOptionText(v)}</option>
        ))}
        {selectValue !== '' && !known && <option value={selectValue}>{selectValue} (unknown)</option>}
      </select>
      {hint && <span className="ic-dialog__hint" data-testid="ic-levels-variant-hint">{hint}</span>}
      {differsFromStrategies && (
        <span className="ic-dialog__hint" data-testid="ic-levels-variant-note">
          Chart only: strategies and watches still trade the {legacy.label} map.
        </span>
      )}
    </label>
  );
}

const toHex = (color) => {
  const c = resolveColor(color);
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c || '');
  if (!rgb) return '#888888';
  return `#${rgb.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * @param {Object} props
 * @param {string} props.kind - registry name, 'CHANNELS', 'LEVELS' or 'VOLUME_PROFILE'
 * @param {Object|null} props.descriptor - the registry descriptor (registry kinds)
 * @param {Object|null} props.item - the item being edited; null when adding
 * @param {string} props.defaultColor - colour of a new registry item
 * @param {Object|null} props.meta - GET /api/indicators/meta of the loaded ticker / timeframe, or null
 * @param {string} props.chartTf - the candle timeframe
 * @param {string|null} [props.levelsAsOf] - the bar the loaded level-zone map is as of, or null
 * @param {Object|null} props.channelConstants - read-only confirmation constants of the last detection
 * @param {{list: Array<Object>|null, error: string|null}} [props.levelVariants] - GET /api/levels/variants
 *   (normalized) or its error; list null while loading
 * @param {string|null} [props.ticker] - the ticker of the chart (filters a benchmark's choices by its market)
 * @param {(patch: {params: Object, color?: string}) => void} props.onSubmit
 * @param {() => void} props.onCancel
 */
export default function IndicatorParamsDialog({
  kind, descriptor, item, defaultColor, meta, chartTf, levelsAsOf = null, channelConstants = null,
  levelVariants = NO_VARIANTS, ticker = null, onSubmit, onCancel,
}) {
  const isChannels = kind === CHANNELS;
  const isLevels = kind === LEVELS;
  const isVolumeProfile = kind === VOLUME_PROFILE;
  const isBuiltInKind = isChannels || isLevels || isVolumeProfile;
  const [values, setValues] = useState(() => {
    if (isVolumeProfile) {
      const p = sanitizeVolumeProfileParams(item?.params || DEFAULT_VOLUME_PROFILE_PARAMS);
      return { rows: String(p.rows), widthPct: String(p.widthPct) };
    }
    if (isChannels) return sanitizeChannelParams(item?.params || DEFAULT_CHANNEL_PARAMS);
    if (isLevels) return sanitizeLevelParams(item?.params || DEFAULT_LEVEL_PARAMS);
    const base = defaultParams(descriptor);
    return Object.fromEntries(Object.entries({ ...base, ...(item?.params || {}) }).map(([k, v]) => [k, String(v)]));
  });
  const [color, setColor] = useState(item?.color || defaultColor);
  const firstFieldRef = useRef(null);
  const choiceParams = useMemo(() => (isBuiltInKind ? [] : normalizeChoiceParams(descriptor?.choiceParams)), [isBuiltInKind, descriptor]);
  const choiceNames = useMemo(() => new Set(choiceParams.map(p => p.name)), [choiceParams]);
  const choiceMarket = ticker ? marketOfTicker(ticker) : null;

  useEffect(() => { firstFieldRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const stored = meta?.smaStored || null;
  const storedText = meta?.smaStoredText || null;

  const errors = useMemo(() => {
    if (isVolumeProfile) return volumeProfileParamErrors(values);
    if (isChannels || isLevels) return {};
    const out = {};
    for (const p of descriptor?.params || []) {
      const err = paramError(p, values[p.name]);
      if (err) { out[p.name] = err; continue; }
      if (p.storedOnly && stored && !stored.some(s => s.length === Number(values[p.name]))) {
        out[p.name] = `${descriptor.displayName}(${values[p.name]}) is not stored for ${meta.ticker} ${meta.timeframe}. Stored: ${storedText || 'none'}`;
      }
    }
    for (const p of choiceParams) {
      const v = values[p.name];
      if (!p.choices.some(c => c.value === v)) out[p.name] = `Pick a ${p.name} from the list`;
      else {
        const issue = benchmarkTickerIssue(descriptor, v, ticker);
        if (issue) out[p.name] = issue;
      }
    }
    return out;
  }, [isChannels, isLevels, isVolumeProfile, descriptor, values, stored, storedText, meta, choiceParams, ticker]);
  const valid = Object.keys(errors).length === 0;

  const title = isChannels ? 'Channels' : isLevels ? 'Levels' : isVolumeProfile ? 'Volume profile' : (descriptor?.displayName || kind);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    if (isChannels) { onSubmit({ params: sanitizeChannelParams(values) }); return; }
    if (isLevels) { onSubmit({ params: sanitizeLevelParams(values) }); return; }
    if (isVolumeProfile) { onSubmit({ params: sanitizeVolumeProfileParams(values) }); return; }
    // numeric params as numbers; a choice param (CORR's benchmark) stays the ticker string
    const params = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, choiceNames.has(k) ? v : Number(v)]));
    onSubmit({ params, color });
  };

  const coarser = TIMEFRAMES.filter(tf => TF_RANK[tf] > TF_RANK[chartTf]);

  return (
    <div className="ic-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="ic-dialog" role="dialog" aria-modal="true" aria-label={`${title} parameters`} onSubmit={submit} data-testid="ic-dialog">
        <div className="ic-dialog__title">{item ? 'Edit' : 'Add'} {title}</div>
        {descriptor?.description && <div className="ic-dialog__desc">{descriptor.description}</div>}

        {!isBuiltInKind && (
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
                        {s.length}{s.fresh ? '' : ` (stale: stored to ${formatBarKey(s.last, meta?.timeframe)})`}
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
            {choiceParams.map(p => {
              const shown = p.choices.filter(c => !choiceMarket || !c.market || c.market === choiceMarket);
              const byMarket = p.choices.some(c => c.market);
              const cur = values[p.name];
              const known = p.choices.find(c => c.value === cur) || null;
              return (
                <label key={p.name} className="ic-dialog__field">
                  <span className="ic-dialog__label">{p.description || p.name}</span>
                  <select
                    value={cur ?? ''}
                    onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                    data-testid={`ic-param-${p.name}`}
                    title={known?.label || undefined}
                  >
                    {shown.map(c => <option key={c.value} value={c.value} title={c.label}>{c.label}</option>)}
                    {cur && !shown.some(c => c.value === cur) && (
                      <option value={cur}>{known ? `${known.label} (${known.market})` : `${cur} (unknown)`}</option>
                    )}
                  </select>
                  <span className="ic-dialog__hint">
                    {!byMarket ? (known?.unit ? `Unit: ${unitLabel(known.unit)}` : p.choices.map(c => c.value).join(', '))
                      : choiceMarket ? `${choiceMarket} market: ${shown.map(c => c.value).join(', ') || 'none yet'}` : p.choices.map(c => c.value).join(', ')}
                  </span>
                  {errors[p.name] && <span className="ic-dialog__error" data-testid="ic-param-error">{errors[p.name]}</span>}
                </label>
              );
            })}
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
            <label className="ta-checkbox-label">
              <input
                type="checkbox"
                checked={values.allZones === true}
                onChange={e => setValues(s => ({ ...s, allZones: e.target.checked }))}
                data-testid="ic-levels-all"
              />
              All zones (every zone of the map with strength ≥ the minimum)
            </label>
            <label className="ic-dialog__field">
              <span className="ic-dialog__label">Nearest zones above / below the close of the map's bar</span>
              <input
                type="number"
                min={0}
                max={LEVEL_CHART_MAX_N}
                step={1}
                value={values.nearestN}
                disabled={values.allZones === true}
                onChange={e => setValues(s => ({ ...s, nearestN: e.target.value }))}
                data-testid="ic-levels-n"
              />
              <span className="ic-dialog__hint">
                {values.allZones
                  ? 'Ignored while "All zones" is on.'
                  : `0..${LEVEL_CHART_MAX_N}; zones containing that close are always drawn.`}
                {' '}Zone map as of {levelsAsOf ? formatBarKey(levelsAsOf, chartTf) : 'the To date (last closed bar)'};
                bands are the zones as of that date, drawn back to their first touch.
              </span>
            </label>
            <LevelVariantField
              value={values.variant}
              variants={levelVariants}
              onChange={(variant) => setValues(s => ({ ...s, variant }))}
            />
          </>
        )}

        {isVolumeProfile && (
          <>
            <div className="ic-dialog__desc" data-testid="ic-vp-help">
              Volume by price over the bars currently visible; recalculated when you scroll or zoom. Simplified:
              each bar&apos;s volume is spread evenly over its low–high range (no intrabar data); a bar with
              low = high puts all its volume in one row. Green = bars that closed at or above their open, red =
              below. Bars outside the run session are included. POC and Value Area are not shown yet.
            </div>
            <label className="ic-dialog__field">
              <span className="ic-dialog__label">Rows</span>
              <input
                ref={firstFieldRef}
                type="number"
                min={VP_ROWS_MIN}
                max={VP_ROWS_MAX}
                step={1}
                value={values.rows}
                onChange={e => setValues(s => ({ ...s, rows: e.target.value }))}
                data-testid="ic-vp-rows"
              />
              <span className="ic-dialog__hint">{VP_ROWS_MIN} – {VP_ROWS_MAX}, whole number; rows are equal in price</span>
              {errors.rows && <span className="ic-dialog__error" data-testid="ic-param-error">{errors.rows}</span>}
            </label>
            <label className="ic-dialog__field">
              <span className="ic-dialog__label">Width, % of the chart</span>
              <input
                type="number"
                min={VP_WIDTH_MIN}
                max={VP_WIDTH_MAX}
                step={1}
                value={values.widthPct}
                onChange={e => setValues(s => ({ ...s, widthPct: e.target.value }))}
                data-testid="ic-vp-width"
              />
              <span className="ic-dialog__hint">{VP_WIDTH_MIN} – {VP_WIDTH_MAX}, whole number</span>
              {errors.widthPct && <span className="ic-dialog__error" data-testid="ic-param-error">{errors.widthPct}</span>}
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
