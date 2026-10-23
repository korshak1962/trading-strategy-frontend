// src/components/screening/ParamCurveCanvas.jsx
//
// Canvas mini-chart of one param's per-level statistics (screener BA-021, architect.md §8.3).
// Canvas only (no Recharts / lightweight-charts), device-pixel-ratio scaled as PnLChart.jsx.
// - one x slot per lattice level ("off" label for 0 where the param is off-at-zero)
// - median (solid), p75 (dashed), p90 (dotted) of the objective on the left scale
// - enrichment bars (light fill) on the right scale with the 1.0 reference line
// - invalid share as a grey strip under the plot
// - the recommended hull shaded, a frozen level marked with a dot
// - hover tooltip with all LevelStats (chart-tooltip styles of ReporterStyleChart.css)

import { useEffect, useMemo, useRef, useState } from 'react';
import '../ReporterStyleChart.css';
import { isNum } from '../stability/stabilityFormat';
import { fmtLevel, fmtShare } from './screeningFormat';

const COLORS = {
  median: '#2563eb',
  p75: '#2563eb',
  p90: '#7c3aed',
  enrich: 'rgba(16, 185, 129, 0.22)',
  enrichRef: 'rgba(16, 185, 129, 0.8)',
  invalid: '#9ca3af',
  hull: 'rgba(59, 130, 246, 0.10)',
  frozen: '#dc2626',
  axis: '#9ca3af',
  text: '#6b7280',
};

const fmt = (v, d = 3) => (isNum(v) ? Number(v.toFixed(d)).toString() : 'n/a');

/**
 * @param {Object} props
 * @param {Array} props.curve LevelStats[] in lattice order
 * @param {boolean} [props.offAtZero]
 * @param {{min?: number, max?: number, value?: number, frozen?: boolean}|null} [props.hull] recommended range
 * @param {number} props.width CSS px
 * @param {number} props.height CSS px
 * @param {boolean} [props.large] axis labels and level labels (expanded drawer)
 * @param {() => void} [props.onClick]
 */
const ParamCurveCanvas = ({ curve, offAtZero = false, hull = null, width, height, large = false, onClick }) => {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null); // {index, x, y}

  const levels = useMemo(() => (Array.isArray(curve) ? curve : []), [curve]);
  const n = levels.length;
  const padL = large ? 40 : 2;
  const padR = large ? 34 : 2;
  const padT = large ? 8 : 3;
  const stripH = large ? 8 : 4;
  const labelH = large ? 16 : 0;
  const plotH = Math.max(10, height - padT - stripH - labelH - 3);
  const plotW = Math.max(10, width - padL - padR);
  const slotW = n > 0 ? plotW / n : plotW;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const xOf = (i) => padL + slotW * (i + 0.5);
    ctx.clearRect(0, 0, width, height);
    if (n === 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px sans-serif';
      ctx.fillText('no data', 4, height / 2);
      return;
    }

    // Left scale: objective percentiles of the valid samples
    const vals = [];
    levels.forEach((l) => [l.median, l.p75, l.p90].forEach((v) => { if (isNum(v)) vals.push(v); }));
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 1;
    if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
    const yObj = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
    // Right scale: enrichment 0..max(2, max)
    const enrMax = Math.max(2, ...levels.map((l) => (isNum(l.enrichment) ? l.enrichment : 0)));
    const yEnr = (v) => padT + plotH - (v / enrMax) * plotH;

    // Recommended hull
    if (hull && isNum(hull.min) && isNum(hull.max)) {
      const idx = levels.map((l, i) => (l.value >= hull.min - 1e-9 && l.value <= hull.max + 1e-9 ? i : -1)).filter((i) => i >= 0);
      if (idx.length > 0) {
        ctx.fillStyle = COLORS.hull;
        const x0 = padL + slotW * idx[0];
        const x1 = padL + slotW * (idx[idx.length - 1] + 1);
        ctx.fillRect(x0, padT, x1 - x0, plotH);
      }
    }

    // Enrichment bars + 1.0 reference
    levels.forEach((l, i) => {
      if (!isNum(l.enrichment)) return;
      const y = yEnr(l.enrichment);
      ctx.fillStyle = COLORS.enrich;
      ctx.fillRect(xOf(i) - slotW * 0.35, y, slotW * 0.7, padT + plotH - y);
    });
    ctx.strokeStyle = COLORS.enrichRef;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yEnr(1));
    ctx.lineTo(padL + plotW, yEnr(1));
    ctx.stroke();
    ctx.setLineDash([]);

    // Percentile lines
    const line = (key, color, dash, widthPx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      levels.forEach((l, i) => {
        const v = l[key];
        if (!isNum(v)) { started = false; return; }
        const x = xOf(i);
        const y = yObj(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      if (n === 1 || large) {
        ctx.fillStyle = color;
        levels.forEach((l, i) => { if (isNum(l[key])) { ctx.beginPath(); ctx.arc(xOf(i), yObj(l[key]), 1.5, 0, Math.PI * 2); ctx.fill(); } });
      }
    };
    line('p90', COLORS.p90, [1, 2], 1);
    line('p75', COLORS.p75, [4, 2], 1);
    line('median', COLORS.median, [], 1.5);

    // Frozen level
    if (hull && hull.frozen && isNum(hull.value)) {
      const i = levels.findIndex((l) => Math.abs(l.value - hull.value) < 1e-9);
      if (i >= 0) {
        const v = isNum(levels[i].median) ? levels[i].median : lo;
        ctx.fillStyle = COLORS.frozen;
        ctx.beginPath();
        ctx.arc(xOf(i), yObj(v), large ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Invalid-share strip
    const stripY = padT + plotH + 2;
    levels.forEach((l, i) => {
      const share = isNum(l.invalidShare) ? Math.max(0, Math.min(1, l.invalidShare)) : 0;
      ctx.fillStyle = `rgba(156, 163, 175, ${0.1 + 0.9 * share})`;
      ctx.fillRect(padL + slotW * i + 0.5, stripY, Math.max(1, slotW - 1), stripH);
    });

    if (large) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(fmt(hi, 2), padL - 3, padT + 8);
      ctx.fillText(fmt(lo, 2), padL - 3, padT + plotH);
      ctx.textAlign = 'left';
      ctx.fillText(fmt(enrMax, 1), padL + plotW + 3, padT + 8);
      ctx.fillText('1.0', padL + plotW + 3, yEnr(1) + 3);
      ctx.textAlign = 'center';
      const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 28))));
      levels.forEach((l, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        ctx.fillText(fmtLevel(l.value, offAtZero), xOf(i), height - 3);
      });
      ctx.textAlign = 'left';
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, padT, plotW, plotH);
    }
  }, [levels, n, width, height, hull, large, offAtZero, padL, padT, plotH, plotW, slotW, stripH]);

  const handleMove = (e) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.min(n - 1, Math.max(0, Math.floor((x - padL) / slotW)));
    setHover({ index: i, x, y: e.clientY - rect.top });
  };

  const h = hover ? levels[hover.index] : null;

  return (
    <div className="relative inline-block" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        className={onClick ? 'cursor-pointer' : undefined}
        data-testid="param-curve"
      />
      {h && (
        <div
          className="chart-tooltip absolute"
          style={{ left: hover.x > width / 2 ? undefined : hover.x + 12, right: hover.x > width / 2 ? width - hover.x + 12 : undefined, top: Math.max(0, hover.y - 10) }}
        >
          <div className="font-semibold">Level {fmtLevel(h.value, offAtZero)}</div>
          <div>Samples {h.count ?? 'n/a'} · valid {h.valid ?? 'n/a'} · invalid {fmtShare(h.invalidShare)}</div>
          <div>Mean {fmt(h.mean)} · median {fmt(h.median)}</div>
          <div>p75 {fmt(h.p75)} · p90 {fmt(h.p90)}</div>
          <div>Top-decile enrichment {isNum(h.enrichment) ? h.enrichment.toFixed(2) : 'n/a'}</div>
        </div>
      )}
    </div>
  );
};

export default ParamCurveCanvas;
