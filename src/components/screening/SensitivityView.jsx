// src/components/screening/SensitivityView.jsx
//
// Results body of a screening job, or of a stored parameter profile (screener BA-021, architect.md
// rev 3 §1.2, §8.1, §8.2). Provenance caption; banners (partial run, > 50 % invalid, < 100 valid,
// target not met, snapshot / result warnings); sub-tabs Parameters | Top samples; footer with the
// grid before → after (live from the edited cells), the ETA on the fit half and on the full range,
// [Apply to Optimize form] (min / max / step only, Q3) and [Save as profile] (a partial run needs
// the explicit "save partial profile" confirmation → allowPartial, Q2).

import { useMemo, useState } from 'react';
import '../../ResultsTabs.css';
import './SensitivityView.css';
import SensitivityTable from './SensitivityTable';
import TopSamplesTable from './TopSamplesTable';
import { saveProfileFromJob } from '../../api/strategyApi';
import { objectiveLabel } from '../../utils/objectives';
import { fmtDetectorParams, fmtParams, fmtTs, isNum } from '../stability/stabilityFormat';
import {
  fmtDuration, fmtGrid, fmtMsPerRun, fmtPlan, indexSearchSpace, levelCount, paramRowKey, paramStrategyLabel,
} from './screeningFormat';

// Initial edit state of a row: the recommendation (live result) or the stored search space (profile).
const initialEdit = (p, stored) => {
  const def = p.default || {};
  if (stored) {
    if (stored.frozen) return { action: 'FREEZE', value: stored.value ?? stored.min, edited: !!stored.edited };
    const keep = Math.abs(stored.min - def.min) < 1e-9 && Math.abs(stored.max - def.max) < 1e-9 && Math.abs(stored.step - def.step) < 1e-9;
    return keep
      ? { action: 'KEEP', edited: !!stored.edited }
      : { action: 'RANGE', min: stored.min, max: stored.max, step: stored.step, edited: !!stored.edited };
  }
  const r = p.recommendation || {};
  if (r.action === 'FREEZE') return { action: 'FREEZE', value: r.value ?? r.min, edited: false };
  if (r.action === 'RANGE') return { action: 'RANGE', min: r.min, max: r.max, step: r.step ?? def.step, edited: false };
  return { action: 'KEEP', edited: false };
};

// Edit state → SearchSpaceEntryDTO {strategyClass, paramName, min, max, step, frozen, value, edited}.
const toEntry = (p, e) => {
  const def = p.default || {};
  const base = { strategyClass: p.strategyClass || p.strategyKey, paramName: p.paramName, edited: !!e.edited };
  if (e.action === 'FREEZE') return { ...base, min: e.value, max: e.value, step: def.step, frozen: true, value: e.value };
  if (e.action === 'RANGE') return { ...base, min: e.min, max: e.max, step: e.step, frozen: false, value: null };
  return { ...base, min: def.min, max: def.max, step: def.step, frozen: false, value: null };
};

const rowLevels = (p, e) => {
  if (e.action === 'FREEZE') return 1;
  if (e.action === 'RANGE') return levelCount(e.min, e.max, e.step);
  const def = p.default || {};
  return isNum(p.levels) ? p.levels : levelCount(def.min, def.max, def.step);
};

// A row edit is invalid when a RANGE is empty / reversed or a FREEZE has no value.
const rowError = (e) => {
  if (e.action === 'FREEZE') return isNum(e.value) ? null : 'frozen value missing';
  if (e.action === 'RANGE') {
    if (!isNum(e.min) || !isNum(e.max) || !isNum(e.step)) return 'min / max / step required';
    if (e.max < e.min) return 'max < min';
    if (e.step <= 0 && e.max > e.min) return 'step must be > 0';
  }
  return null;
};

/**
 * @param {Object} props
 * @param {Object} props.result ScreeningResultDTO
 * @param {string|null} props.jobId the screening job (live result); null for a stored profile
 * @param {Object|null} [props.profile] ParamProfileDTO when a stored profile is shown (read-only)
 * @param {(searchSpace: Array, meta: Object) => void} props.onApply fills the Optimize form ranges
 * @param {((params: Object) => void)|null} props.onApplyBacktestValues top-sample values → form (Backtest)
 * @param {(summary: Object) => void} [props.onSaved] after a profile save
 * @param {() => void} [props.onClose] stored view: close
 * @param {boolean} [props.busy] a run is in progress
 */
const SensitivityView = ({
  result, jobId, profile = null, onApply, onApplyBacktestValues, onSaved, onClose, busy = false,
}) => {
  const stored = !!profile;
  const params = useMemo(() => (Array.isArray(result?.params) ? result.params : []), [result]);
  const storedIdx = useMemo(() => (stored ? indexSearchSpace(profile.searchSpace) : null), [stored, profile]);
  const previousIdx = useMemo(() => (profile?.previous?.searchSpace ? indexSearchSpace(profile.previous.searchSpace) : null), [profile]);

  const [edits, setEdits] = useState(() => {
    const out = {};
    params.forEach((p) => { out[paramRowKey(p)] = initialEdit(p, storedIdx?.[paramRowKey(p)]); });
    return out;
  });
  const [tab, setTab] = useState('params');
  const [sortBy, setSortBy] = useState('importance');
  const [allowPartial, setAllowPartial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // {ok, text}
  const [applyMsg, setApplyMsg] = useState(null);

  const onEdit = (key, patch) => {
    setEdits((prev) => {
      const cur = prev[key] || {};
      const p = params.find((x) => paramRowKey(x) === key);
      let next = { ...cur, ...patch, edited: true };
      // Switching the action seeds sensible values
      if (patch.action === 'RANGE' && !isNum(cur.min)) {
        const def = p?.default || {};
        next = { ...next, min: def.min, max: def.max, step: def.step };
      }
      if (patch.action === 'FREEZE' && !isNum(cur.value)) {
        const r = p?.recommendation || {};
        next = { ...next, value: isNum(r.value) ? r.value : (p?.default?.value ?? p?.curve?.[0]?.value) };
      }
      return { ...prev, [key]: next };
    });
    setSaveMsg(null);
    setApplyMsg(null);
  };

  const displayed = useMemo(() => {
    if (sortBy !== 'importance') return params;
    return [...params].sort((a, b) => (isNum(b.eta2) ? b.eta2 : -1) - (isNum(a.eta2) ? a.eta2 : -1));
  }, [params, sortBy]);

  const gridAfter = params.reduce((g, p) => Math.min(Number.MAX_SAFE_INTEGER, g * rowLevels(p, edits[paramRowKey(p)] || {})), 1);
  const anyEdited = params.some((p) => edits[paramRowKey(p)]?.edited);
  const errors = params.map((p) => [p.paramName, rowError(edits[paramRowKey(p)] || {})]).filter(([, e]) => e);
  const searchSpace = params.map((p) => toEntry(p, edits[paramRowKey(p)] || {}));
  const msPerRun = isNum(result?.msPerRun) ? result.msPerRun : null;
  const period = result?.period || {};
  const fullFactor = isNum(period.rootBars) && isNum(period.fitBars) && period.fitBars > 0 ? period.rootBars / period.fitBars : 2;
  const multiStrategy = new Set(params.map((p) => p.strategyClass || p.strategyKey)).size > 1;

  const partial = !!result?.partial;
  const evaluated = result?.samplesEvaluated;
  const valid = result?.validSamples;
  const invalid = result?.invalidSamples;
  const invalidShare = isNum(valid) && isNum(invalid) && valid + invalid > 0 ? invalid / (valid + invalid) : null;
  const plan = result?.samplePlan || null;
  const warnings = [...(Array.isArray(result?.warnings) ? result.warnings : []), ...(Array.isArray(period.warnings) ? period.warnings : [])]
    .filter((w) => typeof w === 'string' && w.length > 0);

  const handleApply = () => {
    if (errors.length > 0) return;
    onApply(searchSpace, { partial, stored });
    setApplyMsg('Ranges applied to the Optimize form (values unchanged).');
  };

  const handleSave = async () => {
    if (!jobId || errors.length > 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // Only the edited rows are sent: unlisted params keep the recommendation (backend
      // SaveProfileRequest accepts a partial search space); nothing edited → null.
      const edited = searchSpace.filter((e) => e.edited);
      const summary = await saveProfileFromJob(jobId, { searchSpace: edited.length > 0 ? edited : null, allowPartial: partial && allowPartial });
      setSaveMsg({ ok: true, text: `Saved as profile${isNum(summary?.version) ? ` v${summary.version}` : ''}${summary?.partial ? ' (partial)' : ''}.` });
      if (onSaved) onSaved(summary);
    } catch (err) {
      const text = err.status === 404
        ? 'The screening job is no longer on the server (restarted?) — nothing was saved.'
        : `Save failed: ${err.message}`;
      setSaveMsg({ ok: false, text });
    } finally {
      setSaving(false);
    }
  };

  const strategies = [...new Set(params.map(paramStrategyLabel))].join(' + ') || result?.strategyKey;

  return (
    <div className="bg-white p-6 rounded-lg shadow" data-testid="sensitivity-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold">
          Parameter sensitivity for {result?.ticker} · {result?.timeFrame} · {strategies}
          {stored && <span className="text-base font-normal text-gray-500"> · profile v{profile.version}</span>}
        </h2>
        {stored && onClose && (
          <button type="button" onClick={onClose} className="text-sm text-blue-700 hover:text-blue-900" data-testid="sensitivity-close">
            Close
          </button>
        )}
      </div>

      {/* Provenance caption */}
      <p className="mt-1 text-sm text-gray-600" data-testid="sensitivity-caption">
        {objectiveLabel(result?.objective)} · min trades {result?.minTrades ?? 'n/a'} · seed {result?.seed ?? 'n/a'}
        {result?.longOnly ? ' · long only' : ''}
        {' '}· {result?.fullEnumeration ? 'full enumeration' : fmtPlan(plan)}
        {plan && isNum(plan.batches) && !result?.fullEnumeration ? ` (${plan.batches} batch${plan.batches === 1 ? '' : 'es'}${plan.stopReason ? `, ${plan.stopReason}` : ''})` : ''}
        {' '}· {isNum(evaluated) ? evaluated.toLocaleString('en-US') : '?'} samples
        {isNum(result?.uniqueEvaluated) && result.uniqueEvaluated !== evaluated ? ` (${result.uniqueEvaluated.toLocaleString('en-US')} unique)` : ''}
        {' '}({isNum(valid) ? valid : '?'} valid, {isNum(invalid) ? invalid : '?'} invalid{isNum(result?.errorSamples) && result.errorSamples > 0 ? `, ${result.errorSamples} errors` : ''})
        {msPerRun !== null ? ` · ${fmtMsPerRun(msPerRun)} / run` : ''}
        {isNum(result?.elapsedMs) ? ` · took ${fmtDuration(result.elapsedMs)}` : ''}
      </p>
      <p className="mt-1 text-sm text-gray-600" data-testid="sensitivity-period">
        Fit half {fmtTs(period.fitStart)} … {fmtTs(period.fitEnd)}
        {isNum(period.fitBars) ? ` (${period.fitBars} bars${isNum(period.rootBars) ? ` of ${period.rootBars}` : ''})` : ''}
        {period.rootMid ? ` · check halves start ${fmtTs(period.rootMid)}` : ''}
        {' '}· {period.channelTimeFrame || '?'} channels, {fmtDetectorParams(period.detectorParams)}
        {period.detectedAt ? ` · detected ${fmtTs(period.detectedAt)}` : ''}
        {period.dataEnd ? ` · data to ${fmtTs(period.dataEnd)}` : ''}
        {stored && profile.screenedAt ? ` · screened ${fmtTs(profile.screenedAt)}` : ''}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Each sample is a backtest truncated at the fit end, scored like Optimize on [start, fit end]. No bar after the
        fit half is seen. Verdicts: SENSITIVE = 90 % CI lower bound above the analytic floor and η² above the
        permutation noise floor; INSENSITIVE params are frozen at their best level.
      </p>
      {result?.fixedParams && Object.keys(result.fixedParams).length > 0 && (
        <p className="mt-1 text-xs text-gray-500">Fixed params: {fmtParams(result.fixedParams)}</p>
      )}

      {/* Banners */}
      {partial && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium" role="status" data-testid="sensitivity-partial">
          Partial run — stopped after {isNum(evaluated) ? evaluated.toLocaleString('en-US') : '?'}
          {isNum(result?.samplesPlanned) ? ` of ${result.samplesPlanned.toLocaleString('en-US')}` : ''} samples. Statistics are
          descriptive only (partial): every verdict is INCONCLUSIVE and every recommendation keeps the screened range.
        </div>
      )}
      {isNum(valid) && valid < 100 && !partial && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="sensitivity-few-valid">
          Fewer than 100 valid samples ({valid}) — all params INCONCLUSIVE.
        </div>
      )}
      {invalidShare !== null && invalidShare > 0.5 && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="sensitivity-dead">
          {Math.round(invalidShare * 100)} % of the samples are invalid — the search space is mostly dead
          (too few trades or errors). Consider lowering min trades or widening the period.
        </div>
      )}
      {plan && plan.mode === 'AUTO' && plan.targetMet === false && !partial && !result?.fullEnumeration && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="sensitivity-target">
          The adaptive plan reached its cap ({plan.nMax}) without ≥ {plan.targetPerLevel ?? 30} valid samples on every level;
          the under-filled params are INCONCLUSIVE.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm" role="status" data-testid="sensitivity-warnings">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Sub-tabs */}
      <nav className="results-tab-strip mt-4">
        <button type="button" className={`chart-view-tab${tab === 'params' ? ' chart-view-tab--active' : ''}`} onClick={() => setTab('params')} data-testid="sens-tab-params">
          Sensitivity
        </button>
        <button type="button" className={`chart-view-tab${tab === 'top' ? ' chart-view-tab--active' : ''}`} onClick={() => setTab('top')} data-testid="sens-tab-top">
          Top samples
        </button>
      </nav>

      {tab === 'params' ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <label className="flex items-center gap-1">
              Sort
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sens-input">
                <option value="importance">by η²</option>
                <option value="request">request order</option>
              </select>
            </label>
            {stored && <span>Stored profile (read-only): the ranges as saved. Apply puts them into the Optimize form.</span>}
          </div>
          {params.length === 0 ? (
            <p className="text-sm text-gray-500">No tunable param in the result.</p>
          ) : (
            <SensitivityTable
              params={displayed}
              edits={edits}
              onEdit={onEdit}
              multiStrategy={multiStrategy}
              partial={partial}
              readOnly={stored}
              previous={previousIdx}
            />
          )}

          {/* Footer */}
          <div className="mt-4 p-3 rounded border border-gray-200 bg-gray-50 text-sm" data-testid="sensitivity-footer">
            <div className="tabular-nums">
              Grid {fmtGrid(result?.gridBefore)} → <span className="font-semibold" data-testid="sensitivity-grid-after">{fmtGrid(gridAfter)}</span>
              {/* Reviewer M3: no Optimize ETA on a partial run (its ranges are not a recommendation) */}
              {partial ? null : !anyEdited && isNum(result?.etaAfterFitMs) ? (
                <> · Optimize ETA ≈ {fmtDuration(result.etaAfterFitMs)} on the fit half{isNum(result?.etaAfterFullMs) ? `, ≈ ${fmtDuration(result.etaAfterFullMs)} on the full range` : ''}</>
              ) : msPerRun !== null && (
                <> · Optimize ETA ≈ {fmtDuration(gridAfter * msPerRun)} on the fit half, ≈ {fmtDuration(gridAfter * msPerRun * fullFactor)} on the full range</>
              )}
            </div>
            {errors.length > 0 && (
              <div className="mt-1 text-red-700" role="alert">
                Fix the recommendation of {errors.map(([n, e]) => `${n} (${e})`).join(', ')}.
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={busy || errors.length > 0}
                className="py-1.5 px-3 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                title="Put these ranges (min / max / step) into the Optimize form; frozen params get min = max. Values are not changed."
                data-testid="sensitivity-apply"
              >
                Apply to Optimize form
              </button>
              {!stored && jobId && (
                <>
                  {partial && (
                    <label className="flex items-center gap-1 text-xs text-amber-800">
                      <input
                        type="checkbox"
                        checked={allowPartial}
                        onChange={(e) => setAllowPartial(e.target.checked)}
                        data-testid="sensitivity-allow-partial"
                      />
                      save partial profile
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={busy || saving || errors.length > 0 || (partial && !allowPartial)}
                    className="py-1.5 px-3 text-sm border border-blue-600 text-blue-700 rounded bg-white hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-300"
                    title="Store this search space as the parameter profile of the key (ticker, strategies, timeframe); the previous profile is kept as the previous version"
                    data-testid="sensitivity-save"
                  >
                    {saving ? 'Saving…' : 'Save as profile'}
                  </button>
                </>
              )}
              {applyMsg && <span className="text-xs text-green-700" role="status">{applyMsg}</span>}
              {saveMsg && (
                <span className={`text-xs ${saveMsg.ok ? 'text-green-700' : 'text-red-700'}`} role={saveMsg.ok ? 'status' : 'alert'} data-testid="sensitivity-save-msg">
                  {saveMsg.text}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <TopSamplesTable
          samples={result?.topSamples}
          objective={result?.objective}
          onApplyParams={onApplyBacktestValues}
          busy={busy}
        />
      )}
    </div>
  );
};

export default SensitivityView;
