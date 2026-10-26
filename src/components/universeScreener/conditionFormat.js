// src/components/universeScreener/conditionFormat.js
//
// Live captions of filter conditions, the filter's evaluation TF and the client-side copy of the
// backend FilterValidator rules (architect.md "Universe screener rev 1" §8.4). The server stays the
// authority: its 400 message is shown as is.

import {
  METRICS, OPERATORS, SCREEN_TFS, LEVELS, SMA_MIN, SMA_MAX, OFFSET_MIN, OFFSET_MAX, TOLERANCE_LIMIT,
  OPERAND_KINDS, RIGHT_KINDS,
} from '../../api/screenerApi';

const isFiniteNum = (v) => v !== '' && v != null && Number.isFinite(Number(v));
const MINUS = '−';

export const opSymbol = (op) => OPERATORS.find((o) => o.value === op)?.label || op;
export const metricLabel = (m) => METRICS.find((x) => x.value === m)?.label || m;

/** Trims a number for captions: 1.005, 50, -0.25. */
export const fmtNum = (v, dp = 4) => {
  if (!isFiniteNum(v)) return '?';
  const n = Number(v);
  return String(Number(n.toFixed(dp))).replace('-', MINUS);
};

/** `close[−1]`, `SMA(50)[0]`, `WEEK` prefix added by the caller. */
const operandBody = (o) => {
  const off = Number(o.offset) || 0;
  const idx = off === 0 ? '[0]' : `[${MINUS}${Math.abs(off)}]`;
  if (o.kind === 'SMA') return `SMA(${isFiniteNum(o.n) ? Number(o.n) : '?'})${idx}`;
  return `${String(o.kind || '?').toLowerCase()}${idx}`;
};

/** Evaluation TF of a filter: DAY when anything is on DAY, else WEEK (spec §5.4). */
export const evalTfOf = (conditions) => {
  const tfs = [];
  (conditions || []).forEach((c) => {
    if (c.type === 'CHANNEL_METRIC') tfs.push(c.tf);
    else {
      if (c.left && c.left.kind !== 'CONST') tfs.push(c.left.tf);
      if (c.right && c.right.kind !== 'CONST') tfs.push(c.right.tf);
    }
  });
  if (tfs.length === 0) return 'DAY';
  return tfs.includes('DAY') ? 'DAY' : 'WEEK';
};

/** WEEK[0] operand inside a DAY filter: the forming week, provisional until it closes. */
export const isProvisionalOperand = (o, evalTf) =>
  !!o && o.kind !== 'CONST' && o.tf === 'WEEK' && (Number(o.offset) || 0) === 0 && evalTf === 'DAY';

export const operandCaption = (o, evalTf) => {
  if (!o) return '?';
  if (o.kind === 'CONST') return fmtNum(o.value);
  return `${o.tf} ${operandBody(o)}${isProvisionalOperand(o, evalTf) ? ' (provisional)' : ''}`;
};

/** One-line caption of a condition, e.g. `DAY close[0] > WEEK close[−1] × 1.005`. */
export const conditionCaption = (c, evalTf) => {
  if (!c) return '';
  if (c.type === 'CHANNEL_METRIC') {
    const lvl = Number(c.level) === 0 ? 'current channel' : Number(c.level) === 1 ? 'parent (L1)' : 'grandparent (L2)';
    const m = metricLabel(c.metric);
    const hasMin = isFiniteNum(c.min);
    const hasMax = isFiniteNum(c.max);
    let range = '?';
    if (hasMin && hasMax) range = `${fmtNum(c.min)} ≤ ${m} ≤ ${fmtNum(c.max)}`;
    else if (hasMin) range = `${m} ≥ ${fmtNum(c.min)}`;
    else if (hasMax) range = `${m} ≤ ${fmtNum(c.max)}`;
    else range = `${m} (no bound)`;
    return `${c.tf} ${lvl}: ${range}`;
  }
  const tol = Number(c.tolerancePct) || 0;
  const factor = tol === 0 ? '' : ` × ${fmtNum(1 + tol / 100, 6)}`;
  return `${operandCaption(c.left, evalTf)} ${opSymbol(c.op)} ${operandCaption(c.right, evalTf)}${factor}`;
};

/** Short header of a condition column in the results table. */
export const conditionShort = (c, i) => {
  if (!c) return `#${i + 1}`;
  if (c.type === 'CHANNEL_METRIC') return `${c.tf} L${c.level} ${metricLabel(c.metric)}`;
  const side = (o) => (o?.kind === 'CONST' ? fmtNum(o.value) : `${o?.tf === 'WEEK' ? 'W ' : ''}${operandBody(o || {})}`);
  return `${side(c.left)} ${opSymbol(c.op)} ${side(c.right)}`;
};

// ---- validation (copy of FilterValidator) ----

const validateOperand = (o, side) => {
  const errs = [];
  const kinds = side === 'left' ? OPERAND_KINDS : RIGHT_KINDS;
  if (!o || !kinds.includes(o.kind)) {
    errs.push(side === 'left' ? 'the left operand must be a price field or SMA (not a constant)' : 'unknown right operand');
    return errs;
  }
  if (o.kind === 'CONST') {
    if (!isFiniteNum(o.value)) errs.push('the constant must be a number');
    return errs;
  }
  if (!SCREEN_TFS.includes(o.tf)) errs.push(`${side} TF must be DAY or WEEK`);
  const off = Number(o.offset);
  if (!Number.isInteger(off) || off < OFFSET_MIN || off > OFFSET_MAX) {
    errs.push(`${side} offset must be an integer from ${OFFSET_MIN} to ${OFFSET_MAX}`);
  }
  if (o.kind === 'SMA') {
    const n = Number(o.n);
    if (!Number.isInteger(n) || n < SMA_MIN || n > SMA_MAX) errs.push(`SMA length must be ${SMA_MIN}..${SMA_MAX}`);
  }
  return errs;
};

/** Errors of one condition (array of strings, empty = valid). */
export const validateCondition = (c) => {
  const errs = [];
  if (c.type === 'CHANNEL_METRIC') {
    if (!SCREEN_TFS.includes(c.tf)) errs.push('TF must be DAY or WEEK');
    if (!LEVELS.includes(Number(c.level))) errs.push('level must be 0, 1 or 2');
    if (!METRICS.some((m) => m.value === c.metric)) errs.push('unknown metric');
    const hasMin = isFiniteNum(c.min);
    const hasMax = isFiniteNum(c.max);
    if (c.min !== '' && c.min != null && !hasMin) errs.push('min must be a number');
    if (c.max !== '' && c.max != null && !hasMax) errs.push('max must be a number');
    if (!hasMin && !hasMax) errs.push('set min, max or both');
    if (hasMin && hasMax && Number(c.min) > Number(c.max)) errs.push('min must be ≤ max');
    return errs;
  }
  if (c.type === 'COMPARE') {
    errs.push(...validateOperand(c.left, 'left'));
    errs.push(...validateOperand(c.right, 'right'));
    if (!OPERATORS.some((o) => o.value === c.op)) errs.push('unknown operator');
    if (!isFiniteNum(c.tolerancePct)) errs.push('tolerance must be a number');
    else if (Math.abs(Number(c.tolerancePct)) >= TOLERANCE_LIMIT) {
      errs.push(`tolerance must be between −${TOLERANCE_LIMIT} and ${TOLERANCE_LIMIT} % (exclusive)`);
    }
    return errs;
  }
  return ['unknown condition type'];
};

/**
 * Errors of a filter draft: `{general: string[], conditions: string[][]}`; `ok` when both are empty.
 * `today` = the exchange's today (YYYY-MM-DD).
 */
export const validateFilter = (draft, today) => {
  const general = [];
  const name = (draft.name || '').trim();
  if (!name) general.push('Name is required');
  else if (name.length > 128) general.push('Name is at most 128 characters');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate || '')) general.push('Start date is required');
  else if (today && draft.startDate > today) general.push('Start date must not be in the future');
  const p = draft.detectorParams || {};
  // Same bounds as the backend FilterValidator (fractions, as /api/channels/detect).
  if (!(Number(p.coveragePct) > 0.5 && Number(p.coveragePct) <= 1)) general.push('Channel coverage must be in (50, 100] %');
  if (!(Number.isInteger(Number(p.minBars)) && Number(p.minBars) >= 2 && Number(p.minBars) <= 1000)) general.push('Min bars must be an integer 2..1000');
  if (!(Number(p.minWidthPct) >= 0 && Number(p.minWidthPct) < 1)) general.push('Min width must be in [0, 100) %');
  if (!(Number.isFinite(Number(p.minAnnualYieldPct)) && Number.isFinite(Number(p.maxAnnualYieldPct))
    && Number(p.minAnnualYieldPct) <= Number(p.maxAnnualYieldPct))) general.push('Min annual yield must not exceed max annual yield');
  const conds = draft.conditions || [];
  if (conds.length === 0) general.push('Add at least one condition');
  const conditions = conds.map(validateCondition);
  return { general, conditions, ok: general.length === 0 && conditions.every((e) => e.length === 0) };
};

// ---- empty rows ----

export const newMetricCondition = () => ({
  type: 'CHANNEL_METRIC', tf: 'DAY', level: 0, metric: 'WIDTH_PCT', min: '', max: '',
});

export const newCompareCondition = () => ({
  type: 'COMPARE',
  left: { kind: 'CLOSE', n: 50, tf: 'DAY', offset: 0, value: '' },
  op: 'GT',
  right: { kind: 'SMA', n: 50, tf: 'DAY', offset: 0, value: '' },
  tolerancePct: 0,
});

// ---- result display ----

export const STATUS_LABEL = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', NOT_EVALUATED: 'not evaluated' });

export const STATUS_CLASS = Object.freeze({
  PASS: 'bg-green-100 text-green-800',
  FAIL: 'bg-red-100 text-red-800',
  NOT_EVALUATED: 'bg-gray-100 text-gray-600',
});

/** Human text of a ticker / condition reason code. */
export const REASON_TEXT = Object.freeze({
  STALE_DATA: 'stale data (no bar on the basis day)',
  NO_HISTORY: 'no price history',
  DOWNLOAD_FAILED: 'download failed',
  NOT_MET: 'condition not met',
  DATA_GAP: 'data gap (missing bar vs the SPY calendar)',
  INDICATOR_MISSING: 'SMA not computed yet',
  WEEK_INCONSISTENT: 'stored WEEK differs from the DAY aggregate',
  INSUFFICIENT_HISTORY: 'not enough history',
  NO_CURRENT_CHANNEL: 'no current (confirmed, visible) channel',
  NO_PARENT_LEVEL_1: 'no visible parent (level 1)',
  NO_PARENT_LEVEL_2: 'no visible grandparent (level 2)',
});

export const reasonText = (r) => (r ? REASON_TEXT[r] || r : '');
