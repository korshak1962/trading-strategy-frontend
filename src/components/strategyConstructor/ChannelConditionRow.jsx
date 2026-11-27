// src/components/strategyConstructor/ChannelConditionRow.jsx
//
// A channel condition of a constructed strategy's rule (stage 4a, screener architect.md "этап 4a"
// §6, K1): channel TF (RUN = the run's TF / DAY / WEEK), level (0 current / 1 parent /
// 2 grandparent), a semantics-B metric (meta.channel.metrics: Position, Slope %/year, Width %,
// Width, Age, Exists), min / max - each linkable to a CONST axis (`R<r>.C<c>.min` / `.max`) - and
// the folded "Channel detector" block (coverage, min bars, min width, min age). Semantics B: on bar
// t the channel tree after bar t−1, replayed from the ticker's first stored DAY bar - no look-ahead.
// Frame and style: the screener's RowShell (ConditionRows.jsx).
// Editor UX Stage A (architect §3.2, §5.5; designer §4.6): headings Source "Channel" · Timeframe ·
// Channel (Current (0) / Parent (1) / Grandparent (2)) · Metric · Min · Max with ⓘ; the detector is a
// collapsed ParamBlock ("Channel detector: default settings" / "Min age 30 bars"), not linkable.
import { useState } from 'react';
import { RowShell } from '../universeScreener/ConditionRows';
import { fmtNum } from '../universeScreener/conditionFormat';
import { DEFAULT_CHANNEL_META, CHANNEL_KEYS } from '../../api/constructedApi';
import { CHANNEL_HELP, firstSentence, RULE_TEXTS } from '../../api/editorTexts';
import FieldLabel from '../common/FieldLabel';
import ParamBlock from '../common/ParamBlock';
import { CHANNEL_LEVEL_LABEL, channelMetricOf, channelSpecOf } from './constructedFormat';

const sel = 'p-1 border rounded text-sm bg-white';
const num = 'p-1 border rounded text-sm w-20';
const UNIT_TEXT = Object.freeze({ RATIO: '', PERCENT: '%', BARS: 'bars', PRICE_RANGE: 'price', PRICE: 'price' });
const TF_LABEL = Object.freeze({ RUN: 'Run TF', DAY: 'Day', WEEK: 'Week' });

const toPct = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? String(v ?? '') : String(Number((Number(v) * 100).toFixed(6))));
const fromPct = (t) => (t !== '' && Number.isFinite(Number(t)) ? Number((Number(t) / 100).toFixed(10)) : t);
const pctText = (v) => String(Number((Number(v) * 100).toFixed(6)));

/** Summary words of the four detector params (Stage A, designer §4.6). */
const DETECTOR_FIELDS = Object.freeze({
  coveragePct: { summaryLabel: 'Coverage', percent: true, unitSuffix: ' %', aria: 'channel coverage %' },
  minBars: { summaryLabel: 'Min length', unitSuffix: ' bars', aria: 'channel min bars' },
  minWidthPct: { summaryLabel: 'Min width', percent: true, unitSuffix: ' %', aria: 'channel min width %' },
  minAgeBars: { summaryLabel: 'Min age', unitSuffix: ' bars', aria: 'channel min age bars' },
});

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
 * @param {boolean} [props.sameAsPrevious] its detector params equal the previous channel condition's (Stage A)
 * @param {boolean} [props.errorOpen] a server error names the channel params (Stage A)
 * @param {(() => void)|null} [props.onApplyToAll] copy the detector params into every channel condition (Stage A)
 * @param {number} props.index
 * @param {number} props.count
 * @param {boolean} props.disabled
 * @param {string[]} props.errors
 * @param {() => void} props.onRemove
 * @param {(delta: number) => void} props.onMove
 */
export default function ChannelConditionRow({
  condition, onChange, channelMeta = DEFAULT_CHANNEL_META, renderLink = null, linkedValue = null, caption,
  sameAsPrevious = false, errorOpen = false, onApplyToAll = null, ...shell
}) {
  const meta = channelMeta || DEFAULT_CHANNEL_META;
  const help = meta.help || CHANNEL_HELP;
  const tfHint = (tf) => help[`tf.${tf}`] || undefined;
  const set = (patch) => onChange({ ...condition, ...patch });
  const spec = channelSpecOf(condition, meta.defaults);
  const setSpec = (k, v) => onChange({ ...condition, channel: { ...spec, ...(condition.channel || {}), [k]: v } });
  const metric = channelMetricOf(condition.metric, meta.metrics);
  const metrics = meta.metrics.some((m) => m.name === condition.metric)
    ? meta.metrics
    : [...meta.metrics, { name: condition.metric, label: `${condition.metric} (not in semantics B)`, unit: null, tooltip: '' }];
  const unit = UNIT_TEXT[metric?.unit] ?? '';
  const ch = condition.channel || {};

  const bound = (suffix) => {
    const linked = linkedValue ? linkedValue(suffix) : null;
    return (
      <FieldLabel label={suffix === 'min' ? 'Min' : 'Max'} tooltip={help[suffix]} testId={`info-channel-${suffix}`}>
        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
          {linked != null ? (
            <span className="px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono"
              title="Linked: the bound comes from the axes" data-testid={`linked-${suffix}`}>{fmtNum(linked)}</span>
          ) : (
            <input type="number" step="any" className={num} value={condition[suffix] ?? ''}
              disabled={shell.disabled} onChange={(e) => set({ [suffix]: e.target.value })} aria-label={`channel ${suffix}`}
              placeholder="none" data-testid={`channel-${suffix}`} />
          )}
          {renderLink?.(suffix)}
        </span>
      </FieldLabel>
    );
  };

  const detectorFields = CHANNEL_KEYS.map((k) => {
    const d = DETECTOR_FIELDS[k];
    const r = meta.ranges?.[k] || {};
    const control = d.percent ? (
      <span className="inline-flex items-center gap-1">
        <PercentInput value={ch[k] ?? spec[k]} disabled={shell.disabled} label={d.aria} onChange={(v) => setSpec(k, v)} testId={`channel-${k}`} />
        %
      </span>
    ) : (
      <input type="number" step="1" min="0" className={num} value={ch[k] ?? spec[k]} disabled={shell.disabled}
        onChange={(e) => setSpec(k, e.target.value)} aria-label={d.aria} data-testid={`channel-${k}`} />
    );
    return {
      key: k,
      label: help[`field.${k}`] || k,
      summaryLabel: d.summaryLabel,
      unitSuffix: d.unitSuffix,
      display: d.percent ? pctText : undefined,
      tooltip: help[k],
      value: ch[k] ?? spec[k],
      defaultValue: meta.defaults?.[k],
      min: r.min,
      max: r.max,
      minInclusive: !r.minExclusive,
      maxExclusive: !!r.maxExclusive,
      integer: !!r.integer,
      linkedValue: null,
      link: null,
      render: () => control,
      reset: () => setSpec(k, meta.defaults?.[k]),
    };
  });

  return (
    <RowShell {...shell} caption={caption} testId="channel-condition"
      heading={{ text: 'Channel', tooltip: RULE_TEXTS.rowChannel, className: 'text-indigo-700' }}
      help={firstSentence(metric?.tooltip)}>
      <FieldLabel label="Source" tooltip={help.source}>
        <span className="px-1 py-1 text-sm text-gray-500"
          title="Semantics B: on bar t the channel tree after bar t−1 (no look-ahead), replayed from the ticker's first stored DAY bar">
          Channel
        </span>
      </FieldLabel>
      <FieldLabel label="Timeframe" tooltip={help.tf} testId="info-channel-tf">
        <select className={sel} value={condition.tf} disabled={shell.disabled} onChange={(e) => set({ tf: e.target.value })}
          aria-label="channel timeframe" title={tfHint(condition.tf)} data-testid="channel-tf">
          {meta.timeframes.map((tf) => <option key={tf} value={tf} title={tfHint(tf)}>{TF_LABEL[tf] || tf}</option>)}
          {!meta.timeframes.includes(condition.tf) && <option value={condition.tf}>{condition.tf}</option>}
        </select>
      </FieldLabel>
      <FieldLabel label="Channel" tooltip={help.level} testId="info-channel-level">
        <select className={sel} value={condition.level} disabled={shell.disabled}
          onChange={(e) => set({ level: parseInt(e.target.value, 10) })} aria-label="channel level" data-testid="channel-level">
          {meta.levels.map((l) => <option key={l} value={l}>{help[`level.${l}`] || CHANNEL_LEVEL_LABEL[l] || l}</option>)}
        </select>
      </FieldLabel>
      <FieldLabel label="Metric" tooltip={help.metric} code={condition.metric || null} testId="info-channel-metric">
        <select className={sel} value={condition.metric} disabled={shell.disabled} onChange={(e) => set({ metric: e.target.value })}
          aria-label="channel metric" title={metric?.tooltip} data-testid="channel-metric">
          {metrics.map((m) => <option key={m.name} value={m.name} title={m.tooltip}>{m.label || m.name}</option>)}
        </select>
      </FieldLabel>
      {bound('min')}
      {bound('max')}
      {unit && <span className="text-xs text-gray-500 pb-1">{unit}</span>}
      {condition.metric === 'EXISTS' && (
        <span className="text-xs text-gray-500 pb-1">0 = no channel, 1 = exists; Min 0 / Max 0 = “no channel”</span>
      )}

      <ParamBlock
        id="channel-detector"
        legacyTestId="channel-detector"
        title="Channel detector"
        tooltip={help.detector}
        defaultsText="default settings"
        changedTitle="Changed from defaults"
        fields={detectorFields}
        sameAsPrevious={sameAsPrevious}
        errorOpen={errorOpen}
        onApplyToAll={onApplyToAll}
        applyLabel="Apply to all channel conditions in this strategy"
        applyTooltip={help.applyToAll}
        disabled={shell.disabled}
        footer={(
          <span className="text-xs text-gray-500">
            Not a threshold: these params are fixed, never swept. Bar t sees the channel tree built up to bar t−1, replayed from
            the ticker&apos;s first stored DAY bar, so the strategy may show other channels than the Channel Explorer / screener on a short window.
          </span>
        )}
      />
    </RowShell>
  );
}
