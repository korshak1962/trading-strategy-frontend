// src/components/common/ParamBlock.jsx
//
// Editor UX Stage A (screener logs/agents/architect.md §5.5, designer §2 / §4.6): a collapsible
// parameter block - "Levels: class defaults · re-arm" / "Channel detector: Min age 30 bars" when
// collapsed; expanded: an optional top slot (the re-arm box), "Changed from defaults" (the changed
// fields, editable, with "(default x) ↺"), "Show all N fields" (grouped), the FIXED line and an
// "Apply to all" button. An invalid field (client range check, or `errorOpen` from a server error
// naming the block) opens the block and marks the summary with a red "!". Read-only: greyed, the ⓘ
// still works. Pure logic in paramBlockFormat.js.
import { useState } from 'react';
import InfoTooltip from './InfoTooltip';
import { blockSummary, changedFields, fieldError } from './paramBlockFormat';
import { fmtNum } from '../universeScreener/conditionFormat';

/**
 * @param {Object} props
 * @param {string} props.id test-id suffix (`paramblock-<id>`)
 * @param {string} props.title "Levels" / "Channel detector"
 * @param {string|null} [props.setLabel] replaces the title ("Levels set 2")
 * @param {string} props.tooltip the ⓘ of the summary
 * @param {string} props.defaultsText "class defaults" / "default settings"
 * @param {string[]} [props.tail] summary parts after the fields (" · re-arm")
 * @param {Array} props.fields `{key, label, tooltip, group, value, defaultValue, min, max, minInclusive, maxExclusive,
 *   integer, linkedValue, link, render(), reset?()}`
 * @param {Array<{name, label}>} [props.groups] the field groups of "Show all", in order
 * @param {Array<{name, label, value, tooltip}>} [props.fixed] the FIXED line
 * @param {JSX.Element} [props.topSlot] always shown when expanded (the re-arm box)
 * @param {boolean} [props.sameAsPrevious] the summary reads "same as above"
 * @param {boolean} [props.errorOpen] a server error names this block: open, red "!"
 * @param {(() => void)|null} [props.onApplyToAll]
 * @param {string} [props.applyLabel]
 * @param {string} [props.applyTooltip]
 * @param {string} [props.changedTitle] "Changed from class defaults"
 * @param {JSX.Element} [props.footer] a note under the block
 * @param {boolean} props.disabled
 * @param {string} [props.legacyTestId] the block's former test id (kept on the wrapper)
 * @param {{summary?: string, applyAll?: string}} [props.legacyIds] former test ids of the summary / apply button
 * @param {number} [props.extraCount] fields shown elsewhere (the top slot) for "Show all N fields"
 */
export default function ParamBlock({
  id, title, setLabel = null, tooltip = '', defaultsText, tail = [], fields, groups = [], fixed = [], topSlot = null,
  sameAsPrevious = false, errorOpen = false, onApplyToAll = null, applyLabel = 'Apply to all', applyTooltip = '',
  changedTitle = 'Changed from defaults', footer = null, disabled = false, legacyTestId, legacyIds = {}, extraCount = 0,
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const errors = fields.map((f) => fieldError(f)).filter(Boolean);
  const invalid = errors.length > 0 || errorOpen;
  const expanded = open || invalid;
  const summary = blockSummary({ fields, defaultsText, tail, sameAsPrevious });
  const changed = changedFields(fields);
  const total = fields.length + fixed.length + extraCount;
  const tid = `paramblock-${id}`;
  const groupOf = (name) => fields.filter((f) => (f.group || '') === name);
  const ungrouped = fields.filter((f) => !groups.some((g) => g.name === f.group));

  const fieldRow = (f, withDefault) => (
    <span key={f.key} className={`inline-flex items-center gap-1 text-xs ${disabled ? 'text-gray-400' : 'text-gray-600'}`}>
      <span className={`shrink-0 ${fieldError(f) ? 'text-red-700' : ''}`}>
        {f.label}
        <InfoTooltip text={f.tooltip} code={f.code || null} editor align="left" />
      </span>
      <span className={fieldError(f) ? 'rounded ring-1 ring-red-400' : ''}>{f.render()}</span>
      {withDefault && (
        <span className="text-[11px] text-gray-500">
          (default {fmtNum(f.defaultValue)})
          {f.reset && f.linkedValue == null && (
            <button type="button" disabled={disabled} onClick={f.reset} className="ml-1 text-indigo-700 disabled:text-gray-400"
              title="Back to the default" aria-label={`Reset ${f.label}`} data-testid={`${tid}-reset-${f.key}`}>↺</button>
          )}
        </span>
      )}
    </span>
  );

  return (
    <div className="basis-full w-full mt-1" data-testid={legacyTestId}>
      <div data-testid={tid}>
        <button type="button" className="text-xs text-gray-600 text-left bg-transparent border-0 p-0 shadow-none hover:text-gray-900" onClick={() => setOpen((o) => !o)}
          aria-expanded={expanded} data-testid={`${tid}-toggle`}>
          <span className="inline-block w-3">{expanded ? '▾' : '▸'}</span>
          {setLabel || title}:{' '}
          <span className="font-mono" data-testid={`${tid}-summary`}>
            <span data-testid={legacyIds.summary}>{summary}</span>
          </span>
          {invalid && <span className="ml-1 font-bold text-red-600" title={errors.join('; ') || 'A server error names this block'}>!</span>}
        </button>
        <InfoTooltip text={tooltip} editor align="left" testId={`info-${tid}`} />
        {expanded && (
          <div className={`mt-1 ml-3 flex flex-col gap-2 ${disabled ? 'opacity-80' : ''}`}>
            {topSlot}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">
                {changedTitle}: {changed.length ? '' : <span className="text-gray-500">none</span>}
              </span>
              <button type="button" className="ml-auto text-xs text-indigo-700" onClick={() => setShowAll(!showAll)}
                aria-expanded={showAll} data-testid={`${tid}-showall`}>
                {showAll ? `Hide fields ▴` : `Show all ${total} fields ▾`}
              </button>
            </div>
            {changed.length > 0 && !showAll && (
              <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid={`${tid}-changed`}>
                {changed.map((f) => fieldRow(f, true))}
              </div>
            )}
            {errors.length > 0 && (
              <ul className="text-xs text-red-600 list-disc list-inside">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
            {showAll && (
              <div className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' }}
                data-testid={`${tid}-all`}>
                {groups.filter((g) => groupOf(g.name).length).map((g) => (
                  <div key={g.name} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{g.label}</span>
                    {groupOf(g.name).map((f) => fieldRow(f, false))}
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div className="flex flex-col gap-1">{ungrouped.map((f) => fieldRow(f, false))}</div>
                )}
              </div>
            )}
            {fixed.length > 0 && (
              <div className="text-xs text-gray-500" data-testid={`${tid}-fixed`}>
                <span className="font-semibold uppercase tracking-wide mr-2">Fixed</span>
                {fixed.map((x, i) => (
                  <span key={x.name}>
                    {i > 0 && ' · '}
                    {x.label} {fmtNum(x.value)}
                    <InfoTooltip text={x.tooltip} editor align="left" />
                  </span>
                ))}
              </div>
            )}
            {(onApplyToAll || footer) && (
              <div className="flex flex-wrap items-center gap-2">
                {onApplyToAll && (
                  <>
                    <button type="button" disabled={disabled} onClick={onApplyToAll}
                      className="py-0.5 px-2 border rounded text-xs text-indigo-700 border-indigo-300 hover:bg-indigo-50 disabled:text-gray-400"
                      data-testid={legacyIds.applyAll || `${tid}-apply-all`}>
                      {applyLabel}
                    </button>
                    <InfoTooltip text={applyTooltip} editor align="left" />
                  </>
                )}
                {footer}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
