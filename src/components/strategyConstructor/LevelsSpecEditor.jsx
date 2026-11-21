// src/components/strategyConstructor/LevelsSpecEditor.jsx
//
// The folded parameters of one Levels occurrence (constructor stage 4b, architect
// architect_constructor_stage4b.md §2.3, §8): the 12 LevelsSpec fields (ranges / integers from
// meta.levels.params), each linkable to a CONST axis (`[P.]levels.<field>`) where the backend
// accepts a link, warmupBars / atrLength shown fixed, and "Apply to all Levels in this strategy"
// (copies the values and the links into every Levels occurrence). Not thresholds: Optimize sweeps
// them only through an axis.
// Re-arm round (architect_constructor_stage4b_rearm.md §3, §6 + owner's edit): the `rearm` checkbox
// (default from meta.levels.defaults, never linked - a structural switch, not an axis) and
// TakeProfitStrength (linkable) next to it; StopBuffer / Upgrade* / TakeProfitStrength are read by
// the pass only with re-arm. No regime SMA here: the regime filter is a separate rule condition.
// Editor UX Stage A (architect §3.2, §5.5; designer §2): rebuilt on the shared ParamBlock - the
// collapsed summary ("Levels: default settings · re-arm", changed fields in plain words, a swept axis's
// range, "same as above", "Levels set 2"), the re-arm box, "Changed from defaults", "Show all
// 15 fields" in groups, the FIXED line. Labels = meta `label` (`plainLabel`); confirmMode = a select
// over `choices` writing the same numbers 0 / 1. The code-style levelsFieldLabel stays for captions.
import { fmtNum } from '../universeScreener/conditionFormat';
import { DEFAULT_LEVELS_META, LEVELS_REARM_FIELDS, rearmOf } from '../../api/constructedApi';
import { LEVELS_HELP, LEVELS_GROUPS } from '../../api/editorTexts';
import ParamBlock from '../common/ParamBlock';
import InfoTooltip from '../common/InfoTooltip';
import { effectiveValue, fieldSummary, sweptAxes } from '../common/paramBlockFormat';
import { levelsSpecOf } from './constructedFormat';

const num = 'p-1 border rounded text-sm w-20';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

/** "(0, 50]" / "integer [1, 500]" of a meta.levels param. */
const rangeText = (p) => `${p.integer ? 'integer ' : ''}${p.minInclusive ? '[' : '('}${fmtNum(p.min)}, ${fmtNum(p.max)}]`;

/** In the Levels pass: the meta flag, or (with re-arm) a field the virtual position reads. */
const inPassOf = (p, rearm) => p.inPass || (rearm && LEVELS_REARM_FIELDS.includes(p.name));

/**
 * @param {Object} props
 * @param {Object} props.spec the editor LevelsSpec (15 numeric fields and the bool `rearm`)
 * @param {(spec: Object) => void} props.onChange
 * @param {string} props.prefix the occurrence's path prefix (`''`, `of.`, `right.x.`, `left.a.`, …)
 * @param {Object} [props.levelsMeta] meta.levels
 * @param {((suffix: string) => JSX.Element|null)|null} [props.renderLink] LinkPicker of a full path; null = no links here
 * @param {((suffix: string) => number|null)|null} [props.linkedValue] linked value of a full path
 * @param {((suffix: string) => Object|null)|null} [props.linkInfo] `{axes: [{name, min, max}]}` of a full path's link
 * @param {(() => void)|null} [props.onApplyToAll] "Apply to all Levels in this strategy"
 * @param {boolean} [props.sameAsPrevious] equal to the previous Levels occurrence of the condition
 * @param {string|null} [props.setLabel] "Levels set 2" when the strategy has several specs
 * @param {boolean} [props.errorOpen] a server error names a Levels field of this condition
 * @param {boolean} props.disabled
 */
export default function LevelsSpecEditor({
  spec, onChange, prefix = '', levelsMeta = DEFAULT_LEVELS_META, renderLink = null, linkedValue = null, linkInfo = null,
  onApplyToAll = null, sameAsPrevious = false, setLabel = null, errorOpen = false, disabled = false,
}) {
  const meta = levelsMeta || DEFAULT_LEVELS_META;
  const help = meta.help || LEVELS_HELP;
  const full = levelsSpecOf(spec, meta.defaults);
  const set = (k, v) => onChange({ ...full, ...(spec || {}), [k]: v });
  const tid = `levels-${prefix.replace(/\./g, '-') || 'root'}`;
  const rearm = rearmOf(spec, meta.defaults?.rearm);

  /** One ParamBlock field of a meta param. */
  const toField = (p) => {
    const path = `${prefix}levels.${p.name}`;
    const linked = linkedValue ? linkedValue(path) : null;
    const usedNote = inPassOf(p, rearm) ? '' : ' Read only by the re-arm replay: off now.';
    const control = () => {
      if (linked != null) {
        return <span className={linkedBox} title="Linked: the value comes from the axes" data-testid={`linked-${path}`}>{fmtNum(linked)}</span>;
      }
      if (Array.isArray(p.choices) && p.choices.length) {
        const cur = Number.isFinite(Number(spec?.[p.name])) && spec?.[p.name] !== '' ? Number(spec[p.name]) : full[p.name];
        return (
          <select className="p-1 border rounded text-sm bg-white" value={String(cur)} disabled={disabled}
            aria-label={`Levels ${p.name}`} data-testid={`levels-input-${path}`}
            onChange={(e) => set(p.name, Number(e.target.value))}>
            {p.choices.map((c) => <option key={c.value} value={String(c.value)}>{c.label}</option>)}
            {!p.choices.some((c) => c.value === cur) && <option value={String(cur)}>{fmtNum(cur)}</option>}
          </select>
        );
      }
      return (
        <input type="number" step={p.integer ? 1 : 'any'} className={num} value={spec?.[p.name] ?? ''}
          disabled={disabled} aria-label={`Levels ${p.name}`} data-testid={`levels-input-${path}`}
          onChange={(e) => set(p.name, e.target.value)} />
      );
    };
    return {
      key: p.name,
      label: p.plainLabel || p.name,
      tooltip: `${p.tooltip || p.hint} Range ${rangeText(p)}, default ${fmtNum(p.defaultValue)}.${usedNote}`,
      group: p.group,
      value: spec?.[p.name],
      defaultValue: meta.defaults?.[p.name] ?? p.defaultValue,
      min: p.min,
      max: p.max,
      minInclusive: p.minInclusive,
      integer: p.integer,
      linkedValue: linked,
      link: linkInfo ? linkInfo(path) : null,
      render: () => (
        <span className="inline-flex items-center gap-1">
          {control()}
          {renderLink?.(path)}
        </span>
      ),
      reset: () => set(p.name, meta.defaults?.[p.name] ?? p.defaultValue),
    };
  };
  const tpParam = meta.params.find((p) => p.name === 'takeProfitStrength');
  const tpField = tpParam ? toField(tpParam) : null;
  const fields = meta.params.filter((p) => p.name !== 'takeProfitStrength').map(toField);
  const tp = tpField ? effectiveValue(tpField) : 0;
  const tail = rearm
    ? ['re-arm', tp > 0 || (tpField && sweptAxes(tpField).length) ? fieldSummary({ ...tpField, label: 'take-profit' }) : null]
    : ['no re-arm'];
  const groups = LEVELS_GROUPS.filter((g) => g !== 'REARM').map((name) => ({ name, label: help[`group.${name}`] || name }));
  const fixed = (meta.fixedParams || []).map((f) => ({ name: f.name, label: f.label, value: f.value, tooltip: f.tooltip }));

  const rearmBox = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-amber-200 bg-amber-50/50 px-2 py-1"
      data-testid={`${tid}-rearm-box`}>
      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={rearm} disabled={disabled} onChange={(e) => set('rearm', e.target.checked)}
            aria-label="Levels re-arm" data-testid={`levels-rearm-${prefix.replace(/\./g, '-') || 'root'}`} />
          {help.rearmLabel || 'Re-arm after stop / support break'}
        </label>
        <InfoTooltip text={help.rearm || meta.rearmHint} editor align="left" />
      </span>
      {tpField && (
        <span className={`inline-flex items-center gap-1 text-xs ${rearm ? 'text-gray-600' : 'text-gray-400'}`}>
          {tpField.label}
          <InfoTooltip text={tpField.tooltip} editor align="left" />
          {tpField.render()}
        </span>
      )}
      <span className="text-[11px] text-gray-500">
        {rearm
          ? "Replays its own solo virtual position; set the take-profit strength equal to your take-profit rule's (link both to one axis)."
          : 'Off: a zone confirms once (no replayed position); the take-profit strength is ignored.'}
      </span>
    </div>
  );

  return (
    <ParamBlock
      id={tid}
      legacyTestId={tid}
      legacyIds={{ summary: `${tid}-summary`, applyAll: `${tid}-apply-all` }}
      title="Levels"
      setLabel={setLabel}
      tooltip={help.summary}
      defaultsText="default settings"
      changedTitle="Changed from defaults"
      tail={tail}
      fields={fields}
      groups={groups}
      fixed={fixed}
      topSlot={rearmBox}
      extraCount={tpField ? 1 : 0}
      sameAsPrevious={sameAsPrevious}
      errorOpen={errorOpen}
      onApplyToAll={onApplyToAll}
      applyLabel="Apply to all Levels in this strategy"
      applyTooltip={help.applyToAll}
      disabled={disabled}
      footer={(
        <span className="text-xs text-gray-500">
          Not thresholds: Optimize sweeps them only through an axis (link). Levels runs over the bars of the run window, so its events depend on the window start.
          {!renderLink && ' Links are not available here (a Levels value inside a nested comparison).'}
        </span>
      )}
    />
  );
}
