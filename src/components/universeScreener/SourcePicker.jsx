// src/components/universeScreener/SourcePicker.jsx
//
// Editor UX Stage A (screener logs/agents/architect.md §3.1, §4): the grouped "Source" menu of an
// operand (Market data · Number · Levels · From the last event · From my open long) and the
// operand's Timeframe select (Run TF / Day / Week, or a muted "Run TF" for the run-TF-only sources).
// Used by the screener rows and the constructor. Option values stay codes (PRICE_BAR, SMA, CONST,
// LEVEL, AT_LAST, …, the TF codes RUN / DAY / WEEK); disabled items carry their reason in `title`.
import FieldLabel from '../common/FieldLabel';
import { useEditorHelp } from '../../api/editorTexts';
import { useIndicatorCatalog } from '../../api/indicatorCatalog';
import { sourceGroups, sourceItemOf, sourceOf, transition } from '../strategyConstructor/operandSource';

const sel = 'p-1 border rounded text-sm bg-white';
const RUN_ONLY_TFS = Object.freeze(['HOUR', 'MIN5', 'MONTH']);

/** A grouped <select> over `groups` (sourceGroups()). */
export function SourceSelect({ groups, value, onChange, disabled, ariaLabel, testId, title }) {
  return (
    <select className={sel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel} data-testid={testId} title={title || undefined}>
      {groups.map((g) => {
        const options = g.items.map((it) => (
          <option key={it.source} value={it.source} disabled={!!it.disabledReason} title={it.disabledReason || it.tooltip || undefined}>
            {it.label}
          </option>
        ));
        return g.label ? <optgroup key={g.name} label={g.label}>{options}</optgroup> : options;
      })}
    </select>
  );
}

/**
 * The Source heading + menu of one operand. `sourceCtx` (constructor): `{levels, bricks, positions,
 * signalType, refusedInRules, levelsSpec}`; `otherUnit` the left side's unit (right side).
 * A pick goes through operandSource.transition, so the operand written equals master's two-select path.
 */
export default function SourcePicker({
  value, onChange, side, runTf = null, otherUnit = null, allowRun = false, sourceCtx = null, disabled = false, testId, ariaLabel,
}) {
  useIndicatorCatalog(); // re-render when a meta registers indicators
  const help = useEditorHelp().operand;
  const current = sourceOf(value).source;
  const groups = sourceGroups({
    side, runTf, otherUnit, current,
    levels: !!sourceCtx?.levels,
    bricks: sourceCtx?.bricks || null,
    positions: sourceCtx?.positions || null,
    signalType: sourceCtx?.signalType ?? null,
    refusedInRules: sourceCtx?.refusedInRules,
  });
  const item = sourceItemOf(groups, current);
  const pick = (source) => onChange(transition(value, source, null, {
    allowRun, levelsSpec: sourceCtx?.levelsSpec, otherUnit,
  }));
  return (
    <FieldLabel label="Source" tooltip={help.help.source}
      testId={testId ? `info-${testId}-source` : undefined}>
      <SourceSelect groups={groups} value={current} onChange={pick} disabled={disabled}
        ariaLabel={ariaLabel || `${side} operand kind`} testId={testId} title={item?.tooltip} />
    </FieldLabel>
  );
}

/**
 * The Timeframe of a plain operand: a select over `tfs` (labels Run TF / Day / Week). On a HOUR / MIN5 /
 * MONTH run only Run TF is offered (the others are disabled with the rule as the reason).
 */
export function TimeframeField({ value, tfs, onChange, runTf = null, allowRun = false, disabled, side, testId }) {
  const help = useEditorHelp().operand;
  const runOnly = allowRun && RUN_ONLY_TFS.includes(runTf);
  const label = (tf) => help.timeframes[tf]?.label || tf;
  const why = `On ${runTf} only Run TF operands with Bars back 0 are allowed`;
  return (
    <FieldLabel label="Timeframe" tooltip={help.help.tf} testId={testId ? `info-${testId}-tf` : undefined}>
      <select className={sel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        aria-label={`${side} timeframe`} data-testid={testId} title={help.timeframes[value]?.tooltip}>
        {tfs.map((tf) => {
          const off = runOnly && tf !== 'RUN' && tf !== value;
          return <option key={tf} value={tf} disabled={off} title={off ? why : help.timeframes[tf]?.tooltip}>{label(tf)}</option>;
        })}
        {!tfs.includes(value) && <option value={value}>{label(value)}</option>}
      </select>
    </FieldLabel>
  );
}

/** The muted "Run TF" of Levels / the event functions / the position functions (no choice). */
export function RunTfOnly() {
  const help = useEditorHelp().operand;
  return (
    <FieldLabel label="Timeframe" tooltip={help.help.tf}>
      <span className="px-1 py-1 text-sm text-gray-500" data-testid="source-run-tf">{help.timeframes.RUN?.label || 'Run TF'}</span>
    </FieldLabel>
  );
}
