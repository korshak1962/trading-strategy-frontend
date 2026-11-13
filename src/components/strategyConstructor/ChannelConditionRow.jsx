// src/components/strategyConstructor/ChannelConditionRow.jsx
//
// A channel condition of a constructed strategy's rule (stage 4a, screener architect.md "этап 4a"
// §6, K1): channel TF (RUN = the run's TF / DAY / WEEK), level (0 current / 1 parent /
// 2 grandparent), a semantics-B metric (meta.channel.metrics: Position, Slope %/year, Width %,
// Width, Age, Exists), min / max - each linkable to a CONST axis (`R<r>.C<c>.min` / `.max`) - and
// the folded "Channel detector" block (coverage, min bars, min width, min age). Semantics B: on bar
// t the channel tree after bar t−1, replayed from the ticker's first stored DAY bar - no look-ahead.
// Frame and style: the screener's RowShell (ConditionRows.jsx).
import { useState } from 'react';
import { RowShell } from '../universeScreener/ConditionRows';
import { fmtNum } from '../universeScreener/conditionFormat';
import { DEFAULT_CHANNEL_META } from '../../api/constructedApi';
import {
  CHANNEL_LEVEL_LABEL, channelMetricOf, channelSpecOf, channelSpecLabel,
} from './constructedFormat';

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-20';
const UNIT_TEXT = Object.freeze({ RATIO: '', PERCENT: '%', BARS: 'bars', PRICE_RANGE: 'price', PRICE: 'price' });
const TF_HINT = Object.freeze({
  RUN: 'The TF the strategy runs on (DAY or WEEK)',
  DAY: 'A DAY channel: the strategy then runs on DAY only',
  WEEK: 'A WEEK channel (weeks built from DAY bars); on a DAY run the tree after the previous week',
});

const toPct = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? String(v ?? '') : String(Number((Number(v) * 100).toFixed(6))));
const fromPct = (t) => (t !== '' && Number.isFinite(Number(t)) ? Number((Number(t) / 100).toFixed(10)) : t);

/**
 * A number box that shows a fraction as a percentage (0.95 ↔ 95) and keeps the typed text while
 * it is not a number yet ("95." on the way to "95.5").
 */
function PercentInput({ value, onChange, disabled, label, testId }) {
  const [text, setText] = useState(toPct(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) { // the value changed from outside (another condition copied, an undo): show it
    setSeen(value);
    setText(toPct(value));
  }
  return (
    <input type="text" inputMode="decimal" className={num} value={text} disabled={disabled} aria-label={label} data-testid={testId}
      onChange={(e) => {
        const next = fromPct(e.target.value);
        setText(e.target.value);
        setSeen(next);
        onChange(next);
      }} />
  );
}

/**
 * @param {Object} props
 * @param {Object} props.condition editor channel condition {type: 'CHANNEL_METRIC', tf, level, metric, min, max, channel}
 * @param {(c: Object) => void} props.onChange
 * @param {Object} [props.channelMeta] meta.channel (metrics, levels, timeframes, defaults, ranges)
 * @param {(suffix: 'min'|'max') => JSX.Element|null} [props.renderLink] the LinkPicker of a bound
 * @param {(suffix: 'min'|'max') => number|null} [props.linkedValue] the linked value of a bound, null when not linked
 * @param {string} props.caption the condition's caption with link notes
 * @param {number} props.index
 * @param {number} props.count
 * @param {boolean} props.disabled
 * @param {string[]} props.errors
 * @param {() => void} props.onRemove
 * @param {(delta: number) => void} props.onMove
 */
export default function ChannelConditionRow({
  condition, onChange, channelMeta = DEFAULT_CHANNEL_META, renderLink = null, linkedValue = null, caption, ...shell
}) {
  const meta = channelMeta || DEFAULT_CHANNEL_META;
  const set = (patch) => onChange({ ...condition, ...patch });
  const spec = channelSpecOf(condition, meta.defaults);
  const setSpec = (k, v) => onChange({ ...condition, channel: { ...spec, ...(condition.channel || {}), [k]: v } });
  const metric = channelMetricOf(condition.metric, meta.metrics);
  const metrics = meta.metrics.some((m) => m.name === condition.metric)
    ? meta.metrics
    : [...meta.metrics, { name: condition.metric, label: `${condition.metric} (not in semantics B)`, unit: null, hint: '' }];
  const unit = UNIT_TEXT[metric?.unit] ?? '';
  const ch = condition.channel || {};
  const detectorSummary = channelSpecLabel(spec, meta.defaults).trim() || 'defaults (0.95 / 5 / 0.05, age ≥ 0)';

  const bound = (suffix) => {
    const linked = linkedValue ? linkedValue(suffix) : null;
    return (
      <label className="inline-flex items-center gap-1 text-xs text-gray-600">
        {suffix}
        {linked != null ? (
          <span className="px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono"
            title="Linked: the bound comes from the axes" data-testid={`linked-${suffix}`}>{fmtNum(linked)}</span>
        ) : (
          <input type="number" step="any" className={num} value={condition[suffix] ?? ''}
            disabled={shell.disabled} onChange={(e) => set({ [suffix]: e.target.value })} aria-label={`channel ${suffix}`}
            placeholder="none" data-testid={`channel-${suffix}`} />
        )}
        {renderLink?.(suffix)}
      </label>
    );
  };

  return (
    <RowShell {...shell} caption={caption} testId="channel-condition">
      <span className="text-xs font-semibold text-indigo-700"
        title="Semantics B: on bar t the channel tree after bar t−1 (no look-ahead), replayed from the ticker's first stored DAY bar">
        Channel
      </span>
      <select className={sel} value={condition.tf} disabled={shell.disabled} onChange={(e) => set({ tf: e.target.value })}
        aria-label="channel timeframe" title={TF_HINT[condition.tf]} data-testid="channel-tf">
        {meta.timeframes.map((tf) => <option key={tf} value={tf} title={TF_HINT[tf]}>{tf}</option>)}
        {!meta.timeframes.includes(condition.tf) && <option value={condition.tf}>{condition.tf}</option>}
      </select>
      <select className={sel} value={condition.level} disabled={shell.disabled}
        onChange={(e) => set({ level: parseInt(e.target.value, 10) })} aria-label="channel level" data-testid="channel-level">
        {meta.levels.map((l) => <option key={l} value={l}>{CHANNEL_LEVEL_LABEL[l] ?? l}</option>)}
      </select>
      <select className={sel} value={condition.metric} disabled={shell.disabled} onChange={(e) => set({ metric: e.target.value })}
        aria-label="channel metric" title={metric?.hint} data-testid="channel-metric">
        {metrics.map((m) => <option key={m.name} value={m.name} title={m.hint}>{m.label || m.name}</option>)}
      </select>
      {bound('min')}
      {bound('max')}
      {unit && <span className="text-xs text-gray-500">{unit}</span>}
      {condition.metric === 'EXISTS' && (
        <span className="text-xs text-gray-500">0 = no channel, 1 = exists; in [0, 0] → “no channel”</span>
      )}

      <details className="basis-full w-full mt-1" data-testid="channel-detector">
        <summary className="cursor-pointer text-xs text-gray-600">
          Channel detector: <span className="font-mono">{detectorSummary}</span>
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1 text-xs text-gray-600"
            title="Share of the bars inside the channel (as the Channel Explorer / screener detector)">
            coverage
            <PercentInput value={ch.coveragePct ?? spec.coveragePct} disabled={shell.disabled} label="channel coverage %"
              onChange={(v) => setSpec('coveragePct', v)} testId="channel-coveragePct" />
            %
          </label>
          <label className="inline-flex items-center gap-1 text-xs text-gray-600" title="Minimum bars of a channel">
            min bars
            <input type="number" step="1" className={num} value={ch.minBars ?? spec.minBars} disabled={shell.disabled}
              onChange={(e) => setSpec('minBars', e.target.value)} aria-label="channel min bars" data-testid="channel-minBars" />
          </label>
          <label className="inline-flex items-center gap-1 text-xs text-gray-600"
            title="Recursion stops splitting a channel once its envelope is this tight, as a percentage of price">
            min width
            <PercentInput value={ch.minWidthPct ?? spec.minWidthPct} disabled={shell.disabled} label="channel min width %"
              onChange={(v) => setSpec('minWidthPct', v)} testId="channel-minWidthPct" />
            %
          </label>
          <label className="inline-flex items-center gap-1 text-xs text-gray-600"
            title="Level 0 = the deepest confirmed channel at least this many bars old (else its parent). ChannelQuartile uses 30 on DAY">
            min age
            <input type="number" step="1" min="0" className={num} value={ch.minAgeBars ?? spec.minAgeBars} disabled={shell.disabled}
              onChange={(e) => setSpec('minAgeBars', e.target.value)} aria-label="channel min age bars" data-testid="channel-minAgeBars" />
            bars
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Channel at least N bars old (ChannelQuartile uses 30). Not a threshold: these params are fixed, never swept.
          Bar t sees the channel tree built up to bar t−1, replayed from the ticker&apos;s first stored DAY bar,
          so the strategy may show other channels than the Channel Explorer / screener on a short window.
        </p>
      </details>
    </RowShell>
  );
}
