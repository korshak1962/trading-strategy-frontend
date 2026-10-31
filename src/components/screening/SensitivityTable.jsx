// src/components/screening/SensitivityTable.jsx
//
// One row per tunable param of a screening result (screener BA-021, architect.md §8.2): strategy
// (only with > 1 strategy, E7), param, levels, importance bar (η² with the 90 % CI whisker, the
// analytic noise-floor tick and the permutation-q95 tick), η² [lo, hi], verdict, max invalid share,
// the mini-curve (click → expanded drawer), the screened range, and the editable recommendation
// (RANGE min / max / step, FREEZE at a lattice level, or KEEP the screened range) with its flags.
// The edit state lives in SensitivityView; this component only renders it.

import { Fragment, useState } from 'react';
import ParamCurveCanvas from './ParamCurveCanvas';
import { isNum } from '../stability/stabilityFormat';
import {
  SCREENING_VERDICT_STYLE, flagLabel, fmtEta, fmtEtaCi, fmtLevel, fmtShare, maxInvalidShare, paramRowKey, paramStrategyLabel,
} from './screeningFormat';

const ImportanceBar = ({ p, scale }) => {
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const title = `η² ${fmtEta(p.eta2)} · 90 % CI [${fmtEta(p.ciLo)}, ${fmtEta(p.ciHi)}] · analytic floor ${fmtEta(p.noiseFloor)}`
    + ` · permutation q95 ${fmtEta(p.permQ95)}${isNum(p.permP) ? ` · p ${p.permP.toFixed(3)}` : ''}`;
  return (
    <div className="sens-bar" title={title} data-testid="importance-bar">
      {isNum(p.eta2) && <div className={`sens-bar-fill sens-bar-fill--${(p.verdict || 'INCONCLUSIVE').toLowerCase()}`} style={{ width: pct(p.eta2) }} />}
      {isNum(p.ciLo) && isNum(p.ciHi) && (
        <div className="sens-bar-ci" style={{ left: pct(p.ciLo), width: `calc(${pct(p.ciHi)} - ${pct(p.ciLo)})` }} />
      )}
      {isNum(p.noiseFloor) && <div className="sens-bar-tick sens-bar-tick--floor" style={{ left: pct(p.noiseFloor) }} />}
      {isNum(p.permQ95) && <div className="sens-bar-tick sens-bar-tick--perm" style={{ left: pct(p.permQ95) }} />}
    </div>
  );
};

/**
 * @param {Object} props
 * @param {Array} props.params ParamSensitivityDTO[] (display order already applied)
 * @param {Object} props.edits {rowKey: {action, min, max, step, value, edited}}
 * @param {(rowKey: string, patch: Object) => void} props.onEdit
 * @param {boolean} props.multiStrategy
 * @param {boolean} [props.readOnly]
 * @param {boolean} [props.partial] descriptive-only label
 * @param {Object} [props.previous] {rowKey: SearchSpaceEntry} of the previous profile version
 */
const SensitivityTable = ({ params, edits, onEdit, multiStrategy, readOnly = false, partial = false, previous = null }) => {
  const [expanded, setExpanded] = useState(null);
  const scale = Math.max(
    0.01,
    ...params.map((p) => Math.max(...[p.eta2, p.ciHi, p.noiseFloor, p.permQ95].filter(isNum), 0))
  ) * 1.1;
  const colCount = multiStrategy ? 11 : 10;

  return (
    <div className="overflow-x-auto">
      <table className="sens-table" data-testid="sensitivity-table">
        <thead>
          <tr>
            {multiStrategy && <th>Strategy</th>}
            <th>Param</th>
            <th title="Lattice levels screened">Levels</th>
            <th title="η² bar · whisker = 90 % bootstrap CI · grey tick = analytic floor (L−1)/(N−1) · red tick = permutation q95">Importance</th>
            <th>η² [90 % CI]</th>
            <th>Verdict</th>
            <th title="Max over levels of the invalid share (too few trades / error)">Invalid</th>
            <th title="median (solid), p75 (dashed), p90 (dotted); green bars = top-decile enrichment; grey strip = invalid share. Click to expand.">Curve</th>
            <th>Screened range</th>
            <th>Recommendation</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => {
            const key = paramRowKey(p);
            const e = edits[key] || {};
            const levels = Array.isArray(p.curve) ? p.curve.map((l) => l.value) : [];
            const def = p.default || {};
            const flags = [...(p.recommendation?.flags || [])];
            if (e.edited && !flags.includes('EDITED')) flags.push('EDITED');
            const hull = e.action === 'FREEZE'
              ? { frozen: true, value: e.value, min: e.value, max: e.value }
              : e.action === 'RANGE' ? { min: e.min, max: e.max } : null;
            const prev = previous?.[key];
            return (
              <Fragment key={key}>
                <tr data-testid={`sens-row-${p.paramName}`}>
                  {multiStrategy && <td className="whitespace-nowrap">{paramStrategyLabel(p)}</td>}
                  <td className="whitespace-nowrap font-medium">
                    {p.paramName}
                    {p.kind === 'CATEGORICAL' && <span className="sens-chip ml-1" title="Categorical: no order between levels">cat.</span>}
                  </td>
                  <td className="tabular-nums">{isNum(p.levels) ? p.levels : levels.length}</td>
                  <td><ImportanceBar p={p} scale={scale} /></td>
                  <td className="tabular-nums whitespace-nowrap">{fmtEtaCi(p)}</td>
                  <td>
                    <span
                      className={`px-1.5 py-0.5 rounded border text-xs font-semibold ${SCREENING_VERDICT_STYLE[p.verdict] || SCREENING_VERDICT_STYLE.INCONCLUSIVE}`}
                      title={(p.reasons || []).join('; ') || undefined}
                    >
                      {p.verdict || 'n/a'}
                    </span>
                    {partial && <div className="text-[10px] text-gray-500">descriptive only (partial)</div>}
                    {!partial && (p.reasons || []).length > 0 && (
                      <div className="text-[10px] text-gray-500 max-w-[14rem]">{p.reasons.join('; ')}</div>
                    )}
                  </td>
                  <td className="tabular-nums">{fmtShare(maxInvalidShare(p.curve))}</td>
                  <td>
                    <ParamCurveCanvas
                      curve={p.curve}
                      offAtZero={!!p.offAtZero}
                      hull={hull}
                      width={160}
                      height={48}
                      onClick={() => setExpanded((k) => (k === key ? null : key))}
                    />
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {fmtLevel(def.min, p.offAtZero)}…{fmtLevel(def.max, p.offAtZero)} / {fmtLevel(def.step)}
                    {prev && (
                      <div className="text-[10px] text-gray-500" title="The previous profile version">
                        prev: {prev.frozen ? `frozen ${fmtLevel(prev.value, p.offAtZero)}` : `${fmtLevel(prev.min)}…${fmtLevel(prev.max)} / ${fmtLevel(prev.step)}`}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <select
                        value={e.action || 'KEEP'}
                        disabled={readOnly}
                        onChange={(ev) => onEdit(key, { action: ev.target.value })}
                        className="sens-input"
                        data-testid={`sens-action-${p.paramName}`}
                      >
                        <option value="RANGE">Range</option>
                        <option value="FREEZE">Freeze</option>
                        <option value="KEEP">Keep</option>
                      </select>
                      {e.action === 'RANGE' && (
                        <>
                          {['min', 'max', 'step'].map((f) => (
                            <input
                              key={f}
                              type="number" step="any"
                              value={e[f] ?? ''}
                              disabled={readOnly}
                              title={f}
                              onChange={(ev) => onEdit(key, { [f]: ev.target.value === '' ? '' : Number(ev.target.value) })}
                              className="sens-input sens-input--num"
                              data-testid={`sens-${f}-${p.paramName}`}
                            />
                          ))}
                        </>
                      )}
                      {e.action === 'FREEZE' && (
                        <select
                          value={isNum(e.value) ? String(e.value) : ''}
                          disabled={readOnly}
                          onChange={(ev) => onEdit(key, { value: Number(ev.target.value) })}
                          className="sens-input"
                          data-testid={`sens-value-${p.paramName}`}
                        >
                          {!isNum(e.value) && <option value="">—</option>}
                          {levels.map((v) => <option key={v} value={String(v)}>{fmtLevel(v, p.offAtZero)}</option>)}
                        </select>
                      )}
                      {e.action === 'KEEP' && <span className="text-xs text-gray-500">screened range</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {flags.map((f) => <span key={f} className={`sens-chip${f === 'EDITED' ? ' sens-chip--edited' : ''}`}>{flagLabel(f)}</span>)}
                    </div>
                  </td>
                </tr>
                {expanded === key && (
                  <tr className="sens-drawer">
                    <td colSpan={colCount}>
                      <div className="flex flex-wrap items-start gap-4 py-2">
                        <ParamCurveCanvas curve={p.curve} offAtZero={!!p.offAtZero} hull={hull} width={480} height={160} large />
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <div><span className="font-medium">{p.paramName}</span> · {p.kind || 'ORDERED'}{p.offAtZero ? ' · 0 = off' : ''}</div>
                          <div>η² {fmtEta(p.eta2)} · 90 % CI [{fmtEta(p.ciLo)}, {fmtEta(p.ciHi)}]</div>
                          <div>Analytic floor (L−1)/(N−1) {fmtEta(p.noiseFloor)} · permutation q95 {fmtEta(p.permQ95)}{isNum(p.permP) ? ` · p ${p.permP.toFixed(3)}` : ''}</div>
                          <div>Default value {fmtLevel(def.value, p.offAtZero)}</div>
                          <div className="text-gray-500">
                            Lines: median (solid), p75 (dashed), p90 (dotted), left scale. Green bars: top-decile
                            enrichment, right scale (dashed = 1.0). Grey strip: invalid share. Shaded: recommended range; red dot: frozen level.
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SensitivityTable;
