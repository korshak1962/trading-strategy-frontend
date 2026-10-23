// src/components/screening/ScreeningSettings.jsx
//
// Optimize-form section "Parameter screening" (screener BA-021, architect.md rev 3 §1.2, §7, §7a.3):
// sample plan (the timeframe's default plan, or a FIXED n; an AUTO cap via maxSamples), seed, min
// trades, its own objective (default CALMAR, independent of the Optimize objective) and the
// "Screen parameters" button. The channels come from the stability section when it is enabled,
// otherwise strategy TF + detector defaults; the period is always the fit half of the root channel.
//
// Notices (rev 3): a pre-run "rough" estimate per TF; a neutral "Long run" notice when the upper
// estimate is > 10 min; the amber under-sampling warning only when N is below the recommended plan
// (MIN5 FIXED 500, or a user-set FIXED n / maxSamples below 2000). While a screening job runs, the
// estimate is replaced by the job's measured ETA.

import { OBJECTIVES } from '../../utils/objectives';
import { TIME_FRAME_LABELS, fmtDetectorParams } from '../stability/stabilityFormat';
import {
  LONG_RUN_MS, RECOMMENDED_N, batchInfo, effectivePlan, fmtDuration, fmtDurationRange, fmtGrid, fmtMsPerRun,
  fmtPlan, isUnderSampled, runEstimate, samplePlanFor,
} from './screeningFormat';

/**
 * @param {Object} props
 * @param {Object} props.settings screening form state (screeningFormat.defaultScreeningSettings)
 * @param {(next: Object) => void} props.onChange receives the whole next settings object
 * @param {string} props.timeFrame strategy timeframe
 * @param {number} props.grid grid size of the form's ranges
 * @param {number} props.tunable number of tunable params in the form
 * @param {{enabled: boolean, channelTimeFrame: string, params: Object}} props.stability stability section state
 * @param {() => void} props.onRun "Screen parameters"
 * @param {boolean} props.disabled a run is in progress / no strategies
 * @param {Object|null} [props.activeJob] the running screening job (measured ETA), else null
 */
const ScreeningSettings = ({
  settings, onChange, timeFrame, grid, tunable, stability, onRun, disabled, activeJob = null,
}) => {
  const set = (patch) => onChange({ ...settings, ...patch });
  const tfPlan = samplePlanFor(timeFrame);
  const plan = effectivePlan(settings, timeFrame);
  const est = runEstimate(settings, timeFrame, grid);
  const underSampled = isUnderSampled(settings, timeFrame, grid);
  const longRun = est.msHi > LONG_RUN_MS;
  const tfLabel = TIME_FRAME_LABELS[timeFrame] || timeFrame;
  const channelText = stability?.enabled
    ? `${stability.channelTimeFrame} channels, ${fmtDetectorParams(stability.params)} (from the stability section)`
    : `${timeFrame} channels, default detector params`;

  const running = !!activeJob;
  const measuredEta = running && Number.isFinite(activeJob.etaMs) && (activeJob.done || 0) > 0 ? activeJob.etaMs : null;
  const runningBatch = running ? batchInfo(activeJob.total, plan) : null;

  const inputClass = 'w-full p-1.5 border rounded text-sm';

  return (
    <div className="mb-6 border border-gray-200 rounded p-3" data-testid="screening-settings">
      <div className="text-sm font-medium text-gray-700">Parameter screening</div>
      <p className="mt-1 text-xs text-gray-500">
        Samples the parameter lattice on the fit half of the root channel and shows which params matter.
        Narrows the Optimize search space; it does not pick the final values.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600 col-span-2">
          Sample plan
          <select
            value={settings.planMode}
            onChange={(e) => set({ planMode: e.target.value })}
            disabled={disabled}
            className={inputClass}
            data-testid="screening-plan"
          >
            <option value="DEFAULT">
              {tfPlan.mode === 'AUTO'
                ? `Adaptive ${tfPlan.nMin} → ${tfPlan.nMax} (default for ${tfLabel})`
                : `Fixed ${tfPlan.nMin} (default for ${tfLabel})`}
            </option>
            <option value="FIXED">Fixed sample count</option>
          </select>
        </label>
        {settings.planMode === 'FIXED' ? (
          <label className="text-xs text-gray-600">
            Samples
            <input
              type="number" min={20} max={20000} step={100}
              value={settings.sampleCount}
              onChange={(e) => set({ sampleCount: e.target.value === '' ? '' : Number(e.target.value) })}
              disabled={disabled}
              className={inputClass}
              data-testid="screening-sample-count"
            />
          </label>
        ) : tfPlan.mode === 'AUTO' ? (
          <label className="text-xs text-gray-600" title="Upper bound of the adaptive plan (500..20000)">
            Max samples
            <input
              type="number" min={500} max={20000} step={500}
              value={settings.maxSamples}
              placeholder={String(tfPlan.nMax)}
              onChange={(e) => set({ maxSamples: e.target.value === '' ? '' : Number(e.target.value) })}
              disabled={disabled}
              className={inputClass}
              data-testid="screening-max-samples"
            />
          </label>
        ) : <div />}
        <label className="text-xs text-gray-600">
          Seed
          <input
            type="number" step={1}
            value={settings.seed}
            onChange={(e) => set({ seed: e.target.value === '' ? '' : Number(e.target.value) })}
            disabled={disabled}
            className={inputClass}
            data-testid="screening-seed"
          />
        </label>
        <label className="text-xs text-gray-600" title="A sample with fewer closed trades is invalid">
          Min trades
          <input
            type="number" min={0} max={1000} step={1}
            value={settings.minTrades}
            onChange={(e) => set({ minTrades: e.target.value === '' ? '' : Number(e.target.value) })}
            disabled={disabled}
            className={inputClass}
            data-testid="screening-min-trades"
          />
        </label>
        <label className="text-xs text-gray-600">
          Objective
          <select
            value={settings.objective}
            onChange={(e) => set({ objective: e.target.value })}
            disabled={disabled}
            className={inputClass}
            data-testid="screening-objective"
          >
            {OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <p className="mt-2 text-xs text-gray-500" data-testid="screening-period-hint">
        Period: the fit half of the root channel ({channelText}). No bar after the fit half is used.
      </p>

      <p className="mt-1 text-xs text-gray-500" data-testid="screening-estimate">
        {tunable === 0
          ? 'Nothing to screen — every param is fixed (min = max).'
          : est.fullGrid
            ? <>Grid {fmtGrid(grid)} ≤ {plan.nMax}: full enumeration · rough {fmtDurationRange(est.msLo, est.msHi)} ({fmtMsPerRun(est.msPerRun)} / run)</>
            : <>{tunable} params, grid {fmtGrid(grid)} · {fmtPlan(plan)} samples · rough {fmtDurationRange(est.msLo, est.msHi)} ({fmtMsPerRun(est.msPerRun)} / run on the fit half)</>}
      </p>

      {running ? (
        <p className="mt-2 text-xs text-gray-700" data-testid="screening-measured-eta">
          Screening running: {measuredEta !== null ? <>≈ {fmtDuration(measuredEta)} left (measured)</> : 'measuring…'}
          {runningBatch && <> · batch {runningBatch.k} of ≤ {runningBatch.m}</>}
        </p>
      ) : longRun && (
        <p className="mt-2 p-2 rounded bg-gray-50 border border-gray-200 text-xs text-gray-700" data-testid="screening-long-run">
          Long run: {fmtDurationRange(est.msLo, est.msHi)} ({est.samplesLo === est.samplesHi ? est.samplesHi : `${est.samplesLo}–${est.samplesHi}`} samples × ≈ {fmtMsPerRun(est.msPerRun)}).
          The server runs one job at a time — Optimize is blocked meanwhile. You can leave the page and come back;
          Stop gives a partial, verdict-less result. A backend restart loses the run.
        </p>
      )}

      {underSampled && (
        <p className="mt-2 p-2 rounded bg-amber-50 border border-amber-300 text-xs text-amber-800" role="status" data-testid="screening-undersampled">
          Below the recommended sample size ({RECOMMENDED_N}+): weak effects may come out INCONCLUSIVE or
          INSENSITIVE. Consider BA-022 (two-step).
        </p>
      )}

      <button
        type="button"
        onClick={onRun}
        disabled={disabled || tunable === 0}
        className="mt-3 w-full py-2 px-4 rounded border border-blue-600 text-blue-700 bg-white hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
        data-testid="screening-run"
      >
        Screen parameters
      </button>
    </div>
  );
};

export default ScreeningSettings;
