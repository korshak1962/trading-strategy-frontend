// src/components/strategyConstructor/operandSource.js
//
// Editor UX Stage A (screener logs/agents/architect.md §4): the Source ↔ kind mapping of an operand.
// The editor shows one "Source" menu (Price bar, the indicators, Number, Levels, the event functions,
// the position functions) plus a property (Field / Length / Value / Output). The operand JSON is
// unchanged: Source + Field map onto the operand's `kind`.
//
// - sourceOf(operand) → {source, field?}: total; an unknown kind → `UNKNOWN:<kind>`.
// - kindFor(source, field) → kind; kindFor(sourceOf(o)) === o.kind for every kind.
// - transition(operand, source, field, ctx) → the new operand: the composition of the legacy two-select
//   path, unchanged (OperandPicker.changeKind, BrickOperandEditor.changeForm, newPlainOperand), so any
//   user action writes the same operand as master. Picking the current Source / Field is a no-op.
// - sourceGroups(ctx): the grouped menu with the disabled reasons (today's reasons).
//
// Loading an operand only renders sourceOf(); no transition runs, nothing is written.
import {
  FIELD_KINDS, CONST_KIND, LEVEL_KIND, BRICK_OPERAND_KINDS, POSITION_KINDS, descriptorOf, defaultLengthOf, defaultBenchmarkOf,
  operandTfsOf, operandUnitOf, unitLabel, kindName, runTfNotSupportedText, getIndicatorCatalog, unitsOfKind, modeForUnit,
} from '../../api/indicatorCatalog';
import { SCREEN_TFS } from '../../api/screenerApi';
import { unitsClash, RUN_TF } from '../universeScreener/conditionFormat';
import { newLevelOperand, newPlainOperand, newBrickOperand, newPositionOperand } from './constructedFormat';
import { eventNeedsStrength } from '../../api/constructedApi';
import { getEditorHelp, positionRefusedText, BRICK_TEXTS, POSITION_TEXTS, RULE_TEXTS, firstSentence } from '../../api/editorTexts';

export const PRICE_BAR = 'PRICE_BAR';
export const UNKNOWN_PREFIX = 'UNKNOWN:';

/** Sources that render a nested block / their own editor (constructor only). */
export const STAGED_SOURCES = Object.freeze([LEVEL_KIND, ...BRICK_OPERAND_KINDS, ...POSITION_KINDS]);

/** The Source of an operand: `{source, field?}` (field only for Price bar). Total. */
export const sourceOf = (o) => {
  const kind = o?.kind;
  if (FIELD_KINDS.includes(kind)) return { source: PRICE_BAR, field: kind };
  if (kind === CONST_KIND || kind === LEVEL_KIND || BRICK_OPERAND_KINDS.includes(kind) || POSITION_KINDS.includes(kind)) {
    return { source: kind };
  }
  if (kind && descriptorOf(kind)) return { source: kind };
  return { source: `${UNKNOWN_PREFIX}${kind ?? ''}` };
};

/** The kind of a Source (+ Field). Inverse of sourceOf. */
export const kindFor = (source, field = null) => {
  if (source === PRICE_BAR) return field || 'CLOSE';
  if (typeof source === 'string' && source.startsWith(UNKNOWN_PREFIX)) return source.substring(UNKNOWN_PREFIX.length);
  return source;
};

export const isStagedSource = (source) => STAGED_SOURCES.includes(source);

/** The TF codes a plain operand may take (legacy OperandPicker: RUN only with allowRun). */
export const baseTfsOf = (allowRun) => (allowRun ? [RUN_TF, ...SCREEN_TFS] : [...SCREEN_TFS]);

/**
 * Legacy OperandPicker.changeKind: a new kind takes its own default length and an allowed TF; CONST
 * keeps the rest of the operand. CORR: a new kind with a benchmark takes its default benchmark, a
 * kind without one drops `benchmark` (the operand JSON of every other kind stays as before). KAIRI:
 * `mode` is dropped too; a kind with forms takes the form whose unit is `otherUnit` (the left side's
 * unit, on the right side: KAIRI against a DIST_* line gets ATR), else the default form (no `mode`).
 * Applied to `value` as `{...value, ...patch}`.
 */
export const legacyChangeKind = (value, kind, allowRun, otherUnit = null) => {
  if (kind === CONST_KIND) return { ...value, kind };
  const okTfs = operandTfsOf(kind, baseTfsOf(allowRun));
  const { benchmark: _dropped, mode: _droppedMode, ...rest } = value || {};
  const out = {
    ...rest,
    kind,
    n: defaultLengthOf(kind),
    tf: okTfs.includes(value.tf) ? value.tf : okTfs[0],
  };
  // CORR: a new kind with a benchmark takes its default (SPY); any other kind carries none
  const benchmark = defaultBenchmarkOf(kind);
  if (benchmark) out.benchmark = benchmark;
  const mode = modeForUnit(kind, otherUnit);
  if (mode) out.mode = mode;
  return out;
};

/**
 * Legacy BrickOperandEditor.changeForm, verbatim (form = 'VALUE' | LEVEL | a brick | a position kind).
 * Returns the operand unchanged when the form is the current one.
 */
export const legacyChangeForm = (value, f, { levelsSpec, otherUnit = null, positionKinds = POSITION_KINDS } = {}) => {
  const form = STAGED_SOURCES.includes(value?.kind) ? value.kind : 'VALUE';
  if (f === form) return value;
  if (f === 'VALUE') return newPlainOperand();
  if (f === LEVEL_KIND) return newLevelOperand(levelsSpec, otherUnit === 'ATR_MULTIPLE' ? 'DIST_SUPPORT_ATR' : 'SUPPORT_LINE');
  if (positionKinds.includes(f)) return newPositionOperand(f, value, levelsSpec); // STICKY_SINCE_ENTRY: the Levels template
  return newBrickOperand(f, levelsSpec, BRICK_OPERAND_KINDS.includes(value?.kind) ? value : null);
};

/**
 * The operand after the user picks `source` (+ `field` for Price bar).
 * @param {Object} operand the current operand
 * @param {string} source the picked Source
 * @param {string|null} field the picked field (Price bar), default: the current field, else CLOSE
 * @param {{allowRun?: boolean, levelsSpec?: Object, otherUnit?: string|null, positionKinds?: string[]}} ctx
 */
export const transition = (operand, source, field = null, ctx = {}) => {
  const cur = sourceOf(operand);
  if (source === cur.source && (source !== PRICE_BAR || !field || field === cur.field)) return operand;
  if (isStagedSource(source)) return legacyChangeForm(operand, source, ctx);
  const kind = kindFor(source, source === PRICE_BAR ? (field || 'CLOSE') : null);
  if (isStagedSource(operand?.kind)) {
    // staged → plain: the legacy "value" form gives RUN close[0]; picking close there was a no-op
    const plain = newPlainOperand();
    return kind === plain.kind ? plain : legacyChangeKind(plain, kind, ctx.allowRun, ctx.otherUnit);
  }
  if (kind === operand?.kind) return operand;
  return legacyChangeKind(operand, kind, ctx.allowRun, ctx.otherUnit);
};

// ---- the menu ----

/**
 * Why a plain kind is disabled (legacy OperandPicker.disabledReason); null = selectable. A kind with
 * forms (KAIRI) fits when any of its forms has the left side's unit (`unitsOfKind`).
 */
export const plainDisabledReason = (kind, runTf, otherUnit) => {
  const notRun = runTfNotSupportedText(kind, runTf);
  if (notRun) return notRun;
  const u = operandUnitOf({ kind });
  if (unitsClash(u, otherUnit) && !unitsOfKind(kind).includes(otherUnit)) {
    return `${kindName(kind)} is a ${unitLabel(u)} value; the left side is a ${unitLabel(otherUnit)} value: `
      + (u === 'PRICE_RANGE' || otherUnit === 'PRICE_RANGE'
        ? 'ATR compares only with ATR or a number'
        : 'compare values of one unit (or a number)');
  }
  return null;
};

const POSITION_REFUSED_DEFAULT = Object.freeze(['ShortClose']);

/**
 * The grouped Source menu.
 * @param {Object} ctx
 * @param {'left'|'right'} ctx.side the right side also offers Number
 * @param {string|null} ctx.runTf the run TF (disables an indicator that does not run there)
 * @param {string|null} ctx.otherUnit the left side's unit (right side): disables kinds of another unit
 * @param {boolean} [ctx.levels] offer Levels (constructor)
 * @param {Array} [ctx.bricks] brick kinds `[{name, label, tooltip}]` to offer (constructor, not inside an anchor)
 * @param {Array} [ctx.positions] position kinds `[{name, label, tooltip}]` to offer (a rule side only)
 * @param {string|null} [ctx.signalType] the rule's signal type: "From my open long" is refused in ShortClose
 * @param {string[]} [ctx.refusedInRules] meta.position.refusedInRules
 * @param {string} ctx.current the current Source (always listed, never disabled)
 * @returns {Array<{name, label, tooltip, items: Array<{source, label, tooltip, disabledReason}>}>}
 */
export const sourceGroups = (ctx) => {
  const help = getEditorHelp().operand;
  const { side, runTf = null, otherUnit = null, current = null } = ctx;
  const g = (name) => ({ name, label: help.groups[name]?.label || name, tooltip: help.groups[name]?.tooltip || '', items: [] });
  const market = g('MARKET');
  const fieldReasons = FIELD_KINDS.map((k) => plainDisabledReason(k, runTf, side === 'right' ? otherUnit : null));
  market.items.push({
    source: PRICE_BAR, label: help.sources.PRICE_BAR?.label || 'Price bar', tooltip: help.sources.PRICE_BAR?.tooltip || '',
    // Price bar is disabled only when every field is
    disabledReason: fieldReasons.every(Boolean) ? fieldReasons[FIELD_KINDS.indexOf('CLOSE')] : null,
  });
  getIndicatorCatalog().kinds.filter((k) => !FIELD_KINDS.includes(k)).forEach((k) => {
    const d = descriptorOf(k);
    market.items.push({
      source: k, label: d?.menuLabel || d?.displayName || k, tooltip: d?.tooltip || d?.description || '',
      disabledReason: plainDisabledReason(k, runTf, side === 'right' ? otherUnit : null),
    });
  });
  const groups = [market];
  if (side === 'right') {
    const num = g('NUMBER');
    num.items.push({ source: CONST_KIND, label: help.sources.CONST?.label || 'Number', tooltip: help.sources.CONST?.tooltip || '', disabledReason: null });
    groups.push(num);
  }
  if (ctx.levels) {
    const lv = g('LEVELS');
    lv.items.push({ source: LEVEL_KIND, label: help.sources.LEVEL?.label || 'Levels', tooltip: help.sources.LEVEL?.tooltip || '', disabledReason: null });
    groups.push(lv);
  }
  if (Array.isArray(ctx.bricks) && ctx.bricks.length) {
    const ev = g('EVENT_FUNCTIONS');
    ctx.bricks.forEach((k) => ev.items.push({ source: k.name, label: k.label || k.name, tooltip: k.tooltip || k.hint || '', disabledReason: null }));
    groups.push(ev);
  }
  if (Array.isArray(ctx.positions) && ctx.positions.length) {
    const pos = g('POSITION_FUNCTIONS');
    const refused = (ctx.refusedInRules || POSITION_REFUSED_DEFAULT).includes(ctx.signalType);
    ctx.positions.forEach((k) => pos.items.push({
      source: k.name, label: k.label || k.name, tooltip: k.tooltip || k.hint || '',
      disabledReason: refused ? (ctx.refusedText || positionRefusedText()) : null,
    }));
    groups.push(pos);
  }
  // the current Source is never disabled; one this menu does not list is appended as is
  groups.forEach((gr) => gr.items.forEach((it) => { if (it.source === current) it.disabledReason = null; }));
  if (current && !groups.some((gr) => gr.items.some((it) => it.source === current))) {
    const kind = kindFor(current);
    const staged = isStagedSource(kind);
    groups.push({
      name: 'CURRENT', label: '', tooltip: '', items: [{
        source: current,
        label: current.startsWith(UNKNOWN_PREFIX) ? `${kind} (not in this version)` : `${kind}${staged ? ' (not allowed here)' : ''}`,
        tooltip: '', disabledReason: null,
      }],
    });
  }
  return groups;
};

/** The item of `source` in the groups (for its tooltip / label), or null. */
export const sourceItemOf = (groups, source) => {
  for (const gr of groups) {
    const it = gr.items.find((x) => x.source === source);
    if (it) return it;
  }
  return null;
};

/**
 * The ⓘ text of an operand's Source (the help line of a comparison). `kinds`: the live meta kinds
 * (meta.bricks.kinds / meta.position.kinds, `{name, tooltip, hint}`) the Source menu shows, so the
 * help line of an event / since-entry source reads the same text as its ⓘ (tester M7); the static
 * fallbacks only when no kind is given.
 */
export const sourceTooltipOf = (o, kinds = null) => {
  const help = getEditorHelp().operand;
  const { source, field } = sourceOf(o);
  if (source === PRICE_BAR) return help.barFields[field]?.tooltip || help.sources.PRICE_BAR?.tooltip || '';
  if (source === CONST_KIND || source === LEVEL_KIND) return help.sources[source]?.tooltip || '';
  if (BRICK_OPERAND_KINDS.includes(source) || POSITION_KINDS.includes(source)) {
    const k = Array.isArray(kinds) ? kinds.find((x) => x?.name === source) : null;
    const live = (k && (k.tooltip || k.hint)) || '';
    if (live) return live;
    return (BRICK_OPERAND_KINDS.includes(source) ? BRICK_TEXTS : POSITION_TEXTS)[source]?.tooltip || '';
  }
  const d = descriptorOf(source);
  return d?.tooltip || d?.description || '';
};

/** The help line of a comparison: the first sentence of each side's Source tooltip (distinct ones). */
export const compareHelpLine = (sideTips) => sideTips.map(firstSentence).filter(Boolean)
  .filter((t, i, a) => a.indexOf(t) === i).join(' · ');

/**
 * The Levels Event menu: the `inMenu` events, plus the selected one when it is out of the menu
 * (BROKEN_DOWN, labelled "(retired)") or unknown to this build ("(not in this version)").
 */
export const eventMenuOf = (events, selected) => {
  const shown = (events || []).filter((e) => e.inMenu !== false || e.name === selected);
  if (selected && !(events || []).some((e) => e.name === selected)) {
    shown.push({ name: selected, label: `${selected} ${RULE_TEXTS.unknownSuffix}`, tooltip: '', hint: '', needsStrength: eventNeedsStrength(selected) });
  }
  return shown;
};
