// src/components/common/paramBlockFormat.js
//
// Editor UX Stage A (screener logs/agents/architect.md §5.5): the pure logic of the collapsible
// "defaults / changed / show all" parameter block (ParamBlock.jsx), shared by the Levels params and
// the channel detector. Editor text only: nothing here feeds a caption, a request or a stored value.
import { fmtNum } from '../universeScreener/conditionFormat';
import {
  applyLinks, getAtPath, levelsOccurrences, pruneLinks,
} from '../../api/constructedApi';
import { levelsSpecOf, levelsSpecsOf } from '../strategyConstructor/constructedFormat';

const finite = (v) => v !== '' && v != null && Number.isFinite(Number(v));

/**
 * A ParamBlock field `{key, label, value, defaultValue, min, max, minInclusive, maxExclusive, integer,
 * linkedValue, link: {axes: [{name, min, max}]}|null}`.
 * The effective value: the linked value (at the axes' defaults) when linked, else the typed value
 * (an empty value = the default).
 */
export const effectiveValue = (f) => {
  if (f.linkedValue != null && Number.isFinite(Number(f.linkedValue))) return Number(f.linkedValue);
  return finite(f.value) ? Number(f.value) : (finite(f.defaultValue) ? Number(f.defaultValue) : null);
};

/** The swept axes of a field's link (min < max). */
export const sweptAxes = (f) => (f.link?.axes || []).filter((a) => finite(a.min) && finite(a.max) && Number(a.min) < Number(a.max));

/**
 * Changed: the effective value differs from the default, or a linked axis is swept (min < max).
 * A link fixed at the default counts as default.
 */
export const isChanged = (f) => {
  if (sweptAxes(f).length) return true;
  const v = effectiveValue(f);
  return v != null && finite(f.defaultValue) && Math.abs(v - Number(f.defaultValue)) > 1e-12;
};

export const changedFields = (fields) => (fields || []).filter(isChanged);

/** A client range error of a typed (unlinked) value, null when fine (an empty value = the default). */
export const fieldError = (f) => {
  if (f.linkedValue != null) return null;
  if (f.value === '' || f.value == null) return null;
  if (!finite(f.value)) return `${f.label}: not a number`;
  const v = Number(f.value);
  if (f.integer && !Number.isInteger(v)) return `${f.label}: a whole number`;
  const lowOk = !finite(f.min) || (f.minInclusive === false ? v > Number(f.min) : v >= Number(f.min));
  const highOk = !finite(f.max) || (f.maxExclusive ? v < Number(f.max) : v <= Number(f.max));
  if (!lowOk || !highOk) {
    return `${f.label}: ${f.minInclusive === false ? '(' : '['}${fmtNum(f.min)}, ${fmtNum(f.max)}${f.maxExclusive ? ')' : ']'}`;
  }
  return null;
};

/** "Stop buffer, ATR 1" or, swept, "Stop buffer, ATR 1 (axis $StopBuffer 0.5…1.5)". */
export const fieldSummary = (f) => {
  const v = effectiveValue(f);
  const shown = v == null ? '?' : (f.display ? f.display(v) : fmtNum(v).replace('−', '-'));
  const text = `${f.summaryLabel || f.label} ${shown}${f.unitSuffix || ''}`;
  const swept = sweptAxes(f);
  if (!swept.length) return text;
  return `${text} (${swept.map((a) => `axis ${a.name} ${fmtNum(a.min).replace('−', '-')}…${fmtNum(a.max).replace('−', '-')}`).join(', ')})`;
};

/**
 * The collapsed summary: "same as above", else the changed fields (or `defaultsText`), then `tail`
 * parts (" · re-arm", " · take-profit 4").
 */
export const blockSummary = ({ fields, defaultsText, tail = [], sameAsPrevious = false }) => {
  if (sameAsPrevious) return 'same as above';
  const changed = changedFields(fields).map(fieldSummary);
  return [changed.length ? changed.join(' · ') : defaultsText, ...tail.filter(Boolean)].join(' · ');
};

// ---- Levels occurrences of one condition ----

const termsKey = (terms) => (Array.isArray(terms) && terms.length
  ? terms.map((t) => `${t.sign < 0 ? '-' : '+'}${t.axis}`).sort().join('') : '');

/**
 * Per Levels occurrence of a rule condition `{condition, links}`: `{prefix: {sameAsPrevious, setLabel}}`.
 * - sameAsPrevious: its spec (links applied at the axes' defaults) and its field links equal the
 *   previous occurrence's in the same condition;
 * - setLabel: "Levels set n" when the strategy has several distinct specs (the `@L<n>` tags), else null.
 */
export const levelsBlockInfo = (rc, axes = [], allRules = [], defaults = undefined) => {
  const links = pruneLinks(rc?.condition, rc?.links);
  const applied = applyLinks(rc?.condition, links, axes);
  const specs = levelsSpecsOf(allRules, axes, defaults);
  const out = {};
  let prev = null;
  levelsOccurrences(applied).forEach((o) => {
    const specKey = JSON.stringify(levelsSpecOf(getAtPath(applied, o.path), defaults));
    const linkKey = Object.keys(links || {}).filter((s) => s.startsWith(`${o.prefix}levels.`)).sort()
      .map((s) => `${s.substring(o.prefix.length)}=${termsKey(links[s])}`).join(';');
    const key = `${specKey}|${linkKey}`;
    const tag = specs.length > 1 ? specs.find((x) => x.key === specKey)?.tag : null;
    out[o.prefix] = {
      sameAsPrevious: prev != null && prev === key,
      setLabel: tag ? `Levels set ${tag.substring(1)}` : null,
    };
    prev = key;
  });
  return out;
};

/** The link info of a threshold path for ParamBlock: `{axes: [{name, min, max}]}` or null. */
export const linkInfoOf = (terms, axes = []) => {
  if (!Array.isArray(terms) || !terms.length) return null;
  return {
    axes: terms.map((t) => {
      const a = (axes || []).find((x) => x.name === t.axis);
      return { name: t.axis, min: finite(a?.min) ? Number(a.min) : null, max: finite(a?.max) ? Number(a.max) : null };
    }),
  };
};
