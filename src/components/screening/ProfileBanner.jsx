// src/components/screening/ProfileBanner.jsx
//
// Optimize-form banner of the parameter profile of the current key (ticker, strategies, timeframe)
// (screener BA-021, architect.md §5.1). States:
// - 'applied'   the profile's ranges are in the form (auto-applied, or Apply)  → [Revert to defaults]
// - 'edited'    applied, then edited                                           → [Re-apply]
// - 'available' the form holds other ranges (edited / a loaded case)          → [Apply profile]
// Plus staleness (re-screen suggested / required), a partial-profile badge, params of the form the
// profile does not cover, reconcile warnings, [View screening] and [Delete profile].

import { useState } from 'react';
import { objectiveLabel } from '../../utils/objectives';
import { isNum, shortStrategy } from '../stability/stabilityFormat';
import { addedParams, fmtGrid, profileProvenance } from './screeningFormat';

const day = (v) => (v ? String(v).substring(0, 10) : '?');

/**
 * @param {Object} props
 * @param {Object} props.profile ParamProfileDTO
 * @param {'applied'|'edited'|'available'} props.state
 * @param {string[]} [props.missing] form params not covered by the profile (they keep their range)
 * @param {() => void} props.onApply Apply / Re-apply
 * @param {() => void} props.onRevert Revert to defaults
 * @param {() => Promise<void>} props.onDelete
 * @param {(() => void)|null} props.onView open the stored screening
 * @param {boolean} [props.busy]
 */
const ProfileBanner = ({
  profile, state, missing = [], onApply, onRevert, onDelete, onView, busy = false,
}) => {
  const { ticker, timeFrame, strategyKey } = profile;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const p = profileProvenance(profile);
  const st = profile?.staleness || {};
  const warnings = Array.isArray(profile?.warnings) ? profile.warnings.filter(Boolean) : [];
  const added = addedParams(profile?.searchSpace);
  // Reviewer M5: a param held fixed during the screening is in provenance.fixedParams, not in the
  // search space; it is not "missing" from the profile. Keys are compared on the simple class name,
  // a constructed strategy on its whole request key (its threshold names contain dots).
  const simple = (k) => shortStrategy(String(k).split('.').pop());
  const fixedEntries = Object.entries(p.fixedParams || {})
    .flatMap(([k, m]) => Object.keys(m || {}).map((n) => [k, n]));
  const fixedKeys = new Set(fixedEntries.map(([k, n]) => `${simple(k)}.${n}`));
  const fixedExact = new Set(fixedEntries.map(([k, n]) => `${k}.${n}`));
  const notCovered = missing.filter((m) => {
    if (fixedExact.has(m)) return false;
    const dot = String(m).lastIndexOf('.');
    return dot < 0 || !fixedKeys.has(`${simple(m.slice(0, dot))}.${m.slice(dot + 1)}`);
  });
  // "Strategy.param" of the form → "<name v3>.param" for a constructed strategy (minor #11)
  const missingLabel = (m) => {
    const k = String(m).match(/^(Constructed:\d+@\d+)\.(.+)$/);
    return k ? `${shortStrategy(k[1])}.${k[2]}` : m;
  };
  // A constructed part of the key is the token Constructed:<id>; label it with the screened version
  const screenedKeys = [
    ...Object.keys(p.fixedParams || {}),
    ...(Array.isArray(profile?.result?.params) ? profile.result.params.map((x) => x?.strategyKey) : []),
  ].filter(Boolean);
  const partLabel = (part) => {
    const screened = screenedKeys.find((k) => k.startsWith(`${part}@`));
    return shortStrategy(screened || part);
  };
  const keyText = `${ticker} · ${String(strategyKey).split('+').map(partLabel).join(' + ')} · ${timeFrame}`;

  const facts = [
    `screened ${day(profile?.screenedAt)}`,
    `fit ${day(p.period.fitStart)} … ${day(p.period.fitEnd)}`,
    objectiveLabel(p.objective),
    `N ${isNum(p.sampleCount) ? p.sampleCount.toLocaleString('en-US') : '?'}${p.sampleMode ? ` (${p.sampleMode})` : ''}`,
    `seed ${p.seed ?? '?'}`,
    `grid ${fmtGrid(p.gridBefore)} → ${fmtGrid(p.gridAfter)}`,
    `data to ${day(p.period.dataEnd)}`,
  ].join(' · ');

  const handleDelete = async () => {
    if (!window.confirm(`Delete the parameter profile of ${keyText} (current and previous version)?`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const btn = 'py-0.5 px-2 text-xs border border-blue-600 text-blue-700 rounded bg-white hover:bg-blue-100 disabled:text-gray-400 disabled:border-gray-300';
  const growth = isNum(st.growthPct) ? Math.round(st.growthPct) : null;

  return (
    <div className="mb-6 p-3 rounded bg-blue-50 border border-blue-300 text-blue-900 text-sm" role="status" data-testid="profile-banner" data-state={state}>
      <div className="font-medium">
        {state === 'applied' && <>Profile v{profile.version} applied</>}
        {state === 'edited' && <>Edited after applying profile v{profile.version}</>}
        {state === 'available' && <>A parameter profile exists for {keyText} (v{profile.version})</>}
        {profile?.partial && (
          <span className="ml-2 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold" data-testid="profile-partial">
            partial ({isNum(p.sampleCount) ? p.sampleCount : '?'}{isNum(p.samplesPlanned) ? ` / ${p.samplesPlanned}` : ''} samples) — ranges unchanged, no verdicts
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-blue-800" data-testid="profile-facts">{facts}</div>
      {profile?.previous && (
        <div className="mt-0.5 text-xs text-blue-700">
          Previous: v{profile.previous.version} screened {day(profile.previous.screenedAt)}, seed {profile.previous.seed ?? '?'}
          {profile.previous.fitEnd ? `, fit to ${day(profile.previous.fitEnd)}` : ''}
          {profile.previous.partial ? ' (partial)' : ''}
        </div>
      )}

      {st.rescreenRequired && (
        <div className="mt-1 text-xs font-medium text-red-700" data-testid="profile-rescreen-required">
          Re-screen required — strategy params changed{Array.isArray(st.reasons) && st.reasons.length > 0 ? `: ${st.reasons.join('; ')}` : ''}
        </div>
      )}
      {st.rescreenSuggested && !st.rescreenRequired && (
        <div className="mt-1 text-xs font-medium text-amber-800" data-testid="profile-rescreen-suggested">
          Re-screen suggested — the fit half grew by {growth !== null ? `${growth} %` : 'more than 25 %'}
          {isNum(st.fitBarsNow) && isNum(st.fitBars) ? ` (${st.fitBars} → ${st.fitBarsNow} bars)` : ''}
        </div>
      )}
      {added.length > 0 && (
        <div className="mt-1 text-xs text-amber-800" data-testid="profile-added">
          Not screened (added to the strategy after the screening; default range): {added.join(', ')}
        </div>
      )}
      {state !== 'available' && notCovered.length > 0 && (
        <div className="mt-1 text-xs text-amber-800">Not in the profile (range kept): {notCovered.map(missingLabel).join(', ')}</div>
      )}
      {warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {state === 'available' && (
          <button type="button" onClick={onApply} disabled={busy} className={btn} data-testid="profile-apply">Apply profile</button>
        )}
        {state === 'edited' && (
          <button type="button" onClick={onApply} disabled={busy} className={btn} data-testid="profile-reapply">Re-apply</button>
        )}
        {state !== 'available' && (
          <button type="button" onClick={onRevert} disabled={busy} className={btn} data-testid="profile-revert">Revert to defaults</button>
        )}
        {onView && (
          <button type="button" onClick={onView} disabled={busy} className={btn} data-testid="profile-view">View screening</button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy || deleting}
          className="py-0.5 px-2 text-xs border border-red-500 text-red-700 rounded bg-white hover:bg-red-50 disabled:text-gray-400 disabled:border-gray-300"
          data-testid="profile-delete"
        >
          {deleting ? 'Deleting…' : 'Delete profile'}
        </button>
      </div>
      {deleteError && <div className="mt-1 text-xs text-red-700" role="alert">Delete failed: {deleteError}</div>}
      <div className="mt-1 text-[11px] text-blue-700">
        A profile changes only the Optimize ranges (min / max / step); Backtest values are never touched.
      </div>
    </div>
  );
};

export default ProfileBanner;
