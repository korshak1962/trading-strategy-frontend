// src/components/strategyConstructor/LevelsSpecEditor.jsx
//
// The folded parameters of one Levels occurrence (constructor stage 4b, architect
// architect_constructor_stage4b.md §2.3, §8): the 12 LevelsSpec fields (ranges / integers from
// meta.levels.params), each linkable to a CONST axis (`[P.]levels.<field>`) where the backend
// accepts a link, warmupBars / atrLength shown fixed, and "Apply to all Levels in this strategy"
// (copies the values and the links into every Levels occurrence). Not thresholds: Optimize sweeps
// them only through an axis. Style: the channel detector block of ChannelConditionRow.
import { fmtNum } from '../universeScreener/conditionFormat';
import { DEFAULT_LEVELS_META } from '../../api/constructedApi';
import { levelsFieldLabel, levelsSpecLabel, levelsSpecOf } from './constructedFormat';

const num = 'p-1 border rounded text-sm w-20';
const linkedBox = 'px-1.5 py-1 border rounded text-sm bg-indigo-50 border-indigo-300 text-indigo-900 font-mono';

/** "(0, 50]" / "integer [1, 500]" of a meta.levels param. */
const rangeText = (p) => `${p.integer ? 'integer ' : ''}${p.minInclusive ? '[' : '('}${fmtNum(p.min)}, ${fmtNum(p.max)}]`;

/**
 * @param {Object} props
 * @param {Object} props.spec the editor LevelsSpec (14 fields)
 * @param {(spec: Object) => void} props.onChange
 * @param {string} props.prefix the occurrence's path prefix (`''`, `of.`, `right.x.`, `left.a.`, …)
 * @param {Object} [props.levelsMeta] meta.levels
 * @param {((suffix: string) => JSX.Element|null)|null} [props.renderLink] LinkPicker of a full path; null = no links here
 * @param {((suffix: string) => number|null)|null} [props.linkedValue] linked value of a full path
 * @param {(() => void)|null} [props.onApplyToAll] "Apply to all Levels in this strategy"
 * @param {boolean} props.disabled
 */
export default function LevelsSpecEditor({
  spec, onChange, prefix = '', levelsMeta = DEFAULT_LEVELS_META, renderLink = null, linkedValue = null,
  onApplyToAll = null, disabled = false,
}) {
  const meta = levelsMeta || DEFAULT_LEVELS_META;
  const full = levelsSpecOf(spec, meta.defaults);
  const set = (k, v) => onChange({ ...full, ...(spec || {}), [k]: v });
  const linkedCount = linkedValue ? meta.params.filter((p) => linkedValue(`${prefix}levels.${p.name}`) != null).length : 0;
  const label = levelsSpecLabel(full, meta.defaults);
  const summary = `${label || 'defaults'}${linkedCount ? ` · ${linkedCount} linked` : ''}`;
  const tid = `levels-${prefix.replace(/\./g, '-') || 'root'}`;

  return (
    <details className="basis-full w-full mt-1" data-testid={tid}>
      <summary className="cursor-pointer text-xs text-gray-600">
        Levels params: <span className="font-mono" data-testid={`${tid}-summary`}>{summary}</span>
      </summary>
      <div className="mt-2 grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' }}>
        {meta.params.map((p) => {
          const path = `${prefix}levels.${p.name}`;
          const linked = linkedValue ? linkedValue(path) : null;
          return (
            <label key={p.name} className="inline-flex items-center gap-1 text-xs text-gray-600"
              title={`${p.hint} (${rangeText(p)}, default ${fmtNum(p.defaultValue)})${p.inPass ? '' : ' - read only: changing it reruns no Levels pass'}`}>
              <span className="w-32 shrink-0">{levelsFieldLabel(p.name)}</span>
              {linked != null ? (
                <span className={linkedBox} title="Linked: the value comes from the axes" data-testid={`linked-${path}`}>{fmtNum(linked)}</span>
              ) : (
                <input type="number" step={p.integer ? 1 : 'any'} className={num} value={spec?.[p.name] ?? ''}
                  disabled={disabled} aria-label={`Levels ${p.name}`} data-testid={`levels-input-${path}`}
                  onChange={(e) => set(p.name, e.target.value)} />
              )}
              {renderLink?.(path)}
            </label>
          );
        })}
        {Object.entries(meta.fixed || {}).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 text-xs text-gray-500" title="Fixed in stage 4b">
            <span className="w-32 shrink-0">{k === 'warmupBars' ? 'WarmupBars' : k === 'atrLength' ? 'AtrLength' : k}</span>
            <span className="px-1.5 py-1 border rounded text-sm bg-gray-100 font-mono">{fmtNum(v)}</span>
            fixed
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onApplyToAll && (
          <button type="button" disabled={disabled} onClick={onApplyToAll}
            className="py-0.5 px-2 border rounded text-xs text-indigo-700 border-indigo-300 hover:bg-indigo-50 disabled:text-gray-400"
            title="Copy these values and links into every Levels condition / operand of this strategy"
            data-testid={`${tid}-apply-all`}>
            Apply to all Levels in this strategy
          </button>
        )}
        <span className="text-xs text-gray-500">
          Not thresholds: Optimize sweeps them only through an axis (link). Levels runs over the bars of the run window, so its events depend on the window start.
          {!renderLink && ' Links are not available here (a Levels value inside a nested comparison).'}
        </span>
      </div>
    </details>
  );
}
