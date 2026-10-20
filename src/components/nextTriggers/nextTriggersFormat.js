// src/components/nextTriggers/nextTriggersFormat.js
//
// Pure text helpers of the next-bar trigger feature, shared by the Summary card, the chart labels,
// the Signals pane chips and the Watchlist column. They read only the normalized object of
// nextTriggersAdapter.js (never the raw JSON). Wording follows the backend's NextTriggerText
// (architect.md §2.12): prices with 2 decimals (the API keeps the full double), "≈" for APPROX only,
// strict inequalities kept ("above 780.00" means 780.00 itself does not buy).

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** A price with 2 decimals (4 below 1), '—' when absent. */
export const fmtTriggerPrice = (v) => {
  if (!isNum(v)) return '—';
  return Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(2);
};

const MINUS = '−';
const signed = (v, digits = 2) => {
  if (!isNum(v)) return '—';
  const abs = Math.abs(v).toFixed(digits);
  if (Number(abs) === 0) return abs;
  return `${v > 0 ? '+' : MINUS}${abs}`;
};

/** 'YYYY-MM-DD' of a LocalDate(Time) string, '—' when absent. */
export const fmtTriggerDay = (v) => (typeof v === 'string' && v.length >= 10 ? v.substring(0, 10) : '—');

/** "2026-10-16 15:35" (a midnight / 09:00 DAY key is shown as the day only). */
export const fmtTriggerTs = (v) => {
  if (typeof v !== 'string' || v.length < 10) return '—';
  const day = v.substring(0, 10);
  const time = v.length >= 16 ? v.substring(11, 16) : null;
  return time && time !== '00:00' ? `${day} ${time}` : day;
};

const OP = Object.freeze({ ABOVE: '>', BELOW: '<', AT_OR_ABOVE: '≥', AT_OR_BELOW: '≤' });
const ON = Object.freeze({ CLOSE: 'close', LOW: 'low', HIGH: 'high' });

export const REASON_LABELS = Object.freeze({
  RETEST: 'retest',
  RUNAWAY: 'runaway',
  BASE: 'base',
  STOP: 'stop',
  SUPPORT_BREAK: 'support break',
  TAKE_PROFIT: 'take profit',
  MA_CROSS: 'MA cross',
  PRICE_VS_MA: 'price vs MA',
  STOP_LOSS: 'stop loss',
  DROP_FROM_PEAK: 'drop from peak',
  REGIME_GATE: 'regime gate',
  BREACH_BAND: 'channel breach band',
  SETUP_ARMS: 'setup arms',
  IF_BOUGHT_STOP: 'if bought, initial stop',
  SETUP_FAILS: 'setup fails',
  SETUP_EXPIRES: 'setup expires',
});

export const reasonLabel = (reason) => (reason ? REASON_LABELS[reason] || reason.toLowerCase().replace(/_/g, ' ') : '');

const fmtFactor = (f) => (isNum(f) ? String(Math.round(f * 10000) / 10000) : '?');

const priceText = (line) => `${line.category === 'APPROX' ? '≈' : ''}${fmtTriggerPrice(line.price)}`;

/** "close > 780.00" / "low ≤ 771.20" */
export const conditionText = (cond) => (cond
  ? `${ON[cond.on] || 'close'} ${OP[cond.direction] || '?'} ${fmtTriggerPrice(cond.price)}`
  : '');

const thresholdText = (line) => `${ON[line.on] || 'close'} ${OP[line.direction] || '?'} ${priceText(line)}`;

/** An intrabar stop (fills at the line, can be placed as a stop order). */
export const isIntrabarStop = (line) => line.side === 'SELL' && line.on === 'LOW';
export const isTakeProfit = (line) => line.side === 'SELL'
  && (line.reason === 'TAKE_PROFIT' || line.direction === 'ABOVE' || line.direction === 'AT_OR_ABOVE')
  && line.category !== 'NECESSARY';

/**
 * Full text of one line, e.g. "BUY if close > 780.00", "BUY if close > 771.20 and low ≤ 771.20",
 * "stop: SELL if low < 649.01", "vetoes buys if close < 757.65", "setup arms above 785.40".
 */
export const lineText = (line) => {
  if (!line) return '';
  const andPart = line.and ? ` and ${conditionText(line.and)}` : '';
  if (line.informational || line.side === 'INFO') {
    switch (line.reason) {
      case 'SETUP_ARMS': return `setup arms above ${priceText(line)} (entry not before the bar after next)`;
      case 'IF_BOUGHT_STOP': return `if bought: initial stop ${priceText(line)}`;
      case 'SETUP_FAILS': return `setup fails if ${thresholdText(line)}`;
      case 'SETUP_EXPIRES': return 'setup expires after this bar';
      default: return line.price === null
        ? reasonLabel(line.reason)
        : `${reasonLabel(line.reason) || 'info'}: ${thresholdText(line)}${andPart}`;
    }
  }
  if (line.side === 'VETO') return `vetoes buys if ${thresholdText(line)}${andPart}`;
  if (line.category === 'NECESSARY') {
    return `${line.side} possible only if ${thresholdText(line)}`;
  }
  if (line.peakTrail) {
    return `stop: SELL if low < ${priceText(line)} (rises to high × ${fmtFactor(line.peakTrail.factor)} on a high above ${fmtTriggerPrice(line.peakTrail.floorMax)})`;
  }
  if (isIntrabarStop(line)) return `stop: SELL if ${thresholdText(line)}${andPart}`;
  if (isTakeProfit(line)) return `take profit: SELL if ${thresholdText(line)}${andPart}`;
  return `${line.side} if ${thresholdText(line)}${andPart}`;
};

/** Short form for the Watchlist column: "BUY > 780.00", "SELL < 742.10", "stop < 649.01". */
export const lineShortText = (line) => {
  if (!line) return '';
  const op = OP[line.direction] || '?';
  const cond = line.and ? ` if ${conditionText(line.and)}` : '';
  if (isIntrabarStop(line)) return `stop ${op} ${priceText(line)}`;
  if (isTakeProfit(line)) return `TP ${op} ${priceText(line)}`;
  return `${line.side} ${line.on === 'CLOSE' ? '' : `${ON[line.on]} `}${op} ${priceText(line)}${cond}`;
};

/** "−5.66 (−0.74 %, −0.81 ATR)" from the basis close; '' when unknown. */
export const distanceText = (line) => {
  if (!line || !isNum(line.distance)) return '';
  const parts = [];
  if (isNum(line.distancePct)) parts.push(`${signed(line.distancePct)} %`);
  if (isNum(line.distanceAtr)) parts.push(`${signed(line.distanceAtr, 1)} ATR`);
  return `${signed(line.distance)}${parts.length ? ` (${parts.join(', ')})` : ''}`;
};

/** "now 768.30: 2.90 below the line" for a bar in progress; '' when no live price. */
export const nowVsLineText = (line, nowPrice) => {
  if (!line || !isNum(line.price) || !isNum(nowPrice)) return '';
  const d = nowPrice - line.price;
  if (Math.abs(d) < 1e-9) return `now ${fmtTriggerPrice(nowPrice)}: at the line`;
  return `now ${fmtTriggerPrice(nowPrice)}: ${fmtTriggerPrice(Math.abs(d))} ${d > 0 ? 'above' : 'below'} the line`;
};

/** Category badge: null for EXACT (plain number). */
export const categoryBadge = (category) => {
  switch (category) {
    case 'DERIVED': return {
      text: '≈ solved from SMA',
      title: 'DERIVED: the exact algebraic inverse of an indicator rule that includes this bar\'s own close '
        + '(SMA, regime gate). As exact as a fixed level, up to float rounding.',
      cls: 'nbt-badge--derived',
    };
    case 'CONDITIONAL': return {
      text: 'conditional',
      title: 'CONDITIONAL: exact threshold, but it trades only if the intrabar condition shown also holds on the bar.',
      cls: 'nbt-badge--conditional',
    };
    case 'APPROX': return {
      text: 'approximate',
      title: 'APPROX: numerical estimate - depends on quantities the price alone does not decide.',
      cls: 'nbt-badge--approx',
    };
    case 'NECESSARY': return {
      text: 'only possible outside',
      title: 'NECESSARY: no signal is possible while the close stays inside the band; outside it a signal is '
        + 'possible but not promised (the channel is re-detected on that bar).',
      cls: 'nbt-badge--necessary',
    };
    default: return null;
  }
};

export const isBenchmark = (estimate) => /BuyAndHold/i.test(estimate?.strategyClass || estimate?.key || '');

/** [A, B] of a POSSIBLE_OUTSIDE_BAND estimate (BELOW line, ABOVE line), or null. */
export const bandOf = (estimate) => {
  if (!estimate) return null;
  const lines = estimate.lines.filter(l => l.category === 'NECESSARY' && isNum(l.price));
  const low = lines.find(l => l.direction === 'BELOW' || l.direction === 'AT_OR_BELOW');
  const high = lines.find(l => l.direction === 'ABOVE' || l.direction === 'AT_OR_ABOVE');
  return low && high ? [low.price, high.price] : null;
};

const withReason = (text, reason) => (reason ? `${text} (${reason})` : text);

/**
 * The estimate as one sentence when it has no plain lines to list; null for kind LINES.
 * @param {Object} estimate - adapter estimate
 * @param {'FLAT'|'LONG'|'SHORT'|null} position - at the start of the next bar
 */
export const kindText = (estimate, position) => {
  if (!estimate) return null;
  const action = position === 'LONG' ? 'sell' : 'buy';
  switch (estimate.kind) {
    case 'UNCONDITIONAL': return withReason(`${action.toUpperCase()} at any price`, estimate.reason);
    case 'NONE': return withReason(`no ${action} possible`, estimate.reason);
    case 'NOT_ESTIMABLE':
      if (isBenchmark(estimate)) return 'N/A — benchmark (closes the PnL on the range end; gives no signal in a merged run)';
      return withReason('not estimable', estimate.reason);
    case 'UNAVAILABLE': return withReason('unavailable', estimate.reason);
    case 'POSSIBLE_OUTSIDE_BAND': {
      const band = bandOf(estimate);
      return band
        ? `no signal possible if close stays within [${fmtTriggerPrice(band[0])}, ${fmtTriggerPrice(band[1])}]; `
          + `possible only if close < ${fmtTriggerPrice(band[0])} or > ${fmtTriggerPrice(band[1])}`
        : withReason('a signal is possible only outside the channel band', estimate.reason);
    }
    case 'POSSIBLE_ANY_PRICE': return withReason('a signal is possible at any price', estimate.reason);
    default: return null;
  }
};

/** Actionable (non-informational) BUY / SELL / VETO lines with a price. */
export const actionLines = (estimate) => (estimate
  ? estimate.lines.filter(l => !l.informational && l.price !== null)
  : []);

export const infoLines = (estimate) => (estimate ? estimate.lines.filter(l => l.informational) : []);

/** The line nearest to the basis close among the actionable BUY / SELL lines (Watchlist primary). */
export const primaryLine = (estimate) => {
  const lines = actionLines(estimate).filter(l => l.side === 'BUY' || l.side === 'SELL');
  if (lines.length === 0) return null;
  return [...lines].sort((a, b) => Math.abs(a.distance ?? Infinity) - Math.abs(b.distance ?? Infinity))[0];
};

/** "2026-10-19" / "week of 2026-10-18" / "next bar" - the backend's label wins. */
export const nextBarLabel = (nt) => {
  const nb = nt?.nextBar;
  if (!nb) return 'next bar';
  if (nb.label) return nb.label;
  const day = fmtTriggerDay(nb.expectedDate);
  return day !== '—' ? day : 'next bar';
};

const partialNames = (estimate) => estimate.partialBecause.map(p => p.key.replace(/Strategy$/, '')).join(', ');

/** Partial wording (architect §2.5): certain-but-incomplete vs may-veto, as the backend gives it. */
export const partialText = (estimate) => {
  if (!estimate?.partial) return null;
  const names = partialNames(estimate);
  const details = estimate.partialBecause
    .map(p => {
      const band = p.kind === 'POSSIBLE_OUTSIDE_BAND' ? bandOf(p) : null;
      if (band) return `${p.key.replace(/Strategy$/, '')} possible only if close < ${fmtTriggerPrice(band[0])} or > ${fmtTriggerPrice(band[1])}`;
      return p.reason ? `${p.key.replace(/Strategy$/, '')}: ${p.reason}` : null;
    })
    .filter(Boolean);
  if (details.length) return `partial: ${details.join('; ')}`;
  return names ? `partial: ${names} not fully estimable` : 'partial';
};

const STATUS_TEXT = {
  NO_CLOSED_BAR: 'No closed bar yet — nothing to estimate from.',
  WINDOW_NOT_OPEN: 'The trading window is not open on the next bar.',
  ERROR: 'The next-bar estimate failed.',
};

/** Text for a non-OK status ('' for OK). */
export const statusText = (nt) => {
  if (!nt || nt.status === 'OK') return '';
  if (nt.status === 'WINDOW_NOT_OPEN' && nt.tradeStart) return `Trading window opens ${fmtTriggerDay(nt.tradeStart)}`;
  const base = STATUS_TEXT[nt.status] || nt.status;
  return nt.message ? `${base} ${nt.message}` : base;
};

/**
 * The merged estimate in one line, same wording as the backend notification:
 * "Next bar (2026-10-20): SELL if close < 742.10 · stop if low < 649.01".
 */
export const oneLiner = (nt) => {
  if (!nt) return '';
  const label = nextBarLabel(nt);
  const head = label === 'next bar' ? 'Next bar' : `Next bar (${label})`;
  if (nt.status !== 'OK') return statusText(nt);
  if (nt.position === 'SHORT') return `${head}: short positions are not estimated`;
  const m = nt.merged;
  if (!m) return `${head}: —`;
  let body;
  if (m.kind === 'LINES') {
    const lines = actionLines(m);
    // BUY alternatives read as "…, or …" (backend NextTriggerText); exits / vetoes as "… · …"
    const buys = lines.filter(l => l.side === 'BUY').map(lineText);
    const rest = lines.filter(l => l.side !== 'BUY').map(lineText);
    const parts = [buys.join(', or '), ...rest].filter(Boolean);
    body = parts.length ? parts.join(' · ') : (kindText({ ...m, kind: 'NONE' }, nt.position));
  } else {
    body = kindText(m, nt.position);
  }
  if (m.kind === 'NONE' && nt.position !== 'LONG') {
    const arms = [...infoLines(m), ...nt.strategies.flatMap(infoLines)].find(l => l.reason === 'SETUP_ARMS');
    if (arms) body += `; setup arms above ${fmtTriggerPrice(arms.price)}`;
  }
  const partial = m.partial ? ` · ${partialText(m)}` : '';
  return `${head}: ${body}${partial}`;
};

/**
 * Watchlist column: { tone: 'buy'|'sell'|'none'|'muted', text, more, partial, title }.
 * tone 'buy' / 'sell' = the merged estimate has a line of that side.
 */
export const compactSummary = (nt) => {
  if (!nt) return null;
  const title = oneLiner(nt);
  if (nt.status !== 'OK') return { tone: 'muted', text: statusText(nt), more: 0, partial: false, title };
  const m = nt.merged;
  if (!m) return { tone: 'muted', text: '—', more: 0, partial: false, title };
  const primary = m.kind === 'LINES' ? primaryLine(m) : null;
  if (primary) {
    const dist = isNum(primary.distancePct)
      ? ` (${signed(primary.distancePct, 1)} %${isNum(primary.distanceAtr) ? `, ${signed(primary.distanceAtr, 1)} ATR` : ''})`
      : '';
    const others = actionLines(m).filter(l => l !== primary && (l.side === 'BUY' || l.side === 'SELL')).length;
    return {
      tone: primary.side === 'BUY' ? 'buy' : 'sell',
      text: `${lineShortText(primary)}${dist}`,
      more: others,
      partial: m.partial,
      title,
    };
  }
  const text = m.kind === 'NONE'
    ? `— ${m.reason || (nt.position === 'LONG' ? 'no sell possible' : 'no setup')}`
    : (kindText(m, nt.position) || '—');
  return { tone: 'none', text, more: 0, partial: m.partial, title };
};

export const OUTCOME_TEXT = Object.freeze({
  BUY: 'BUY — the model bought',
  SELL: 'SELL — the model sold',
  NO_ACTION: 'no action',
  UNKNOWN_PARTIAL: 'no estimable line fired (a not-estimable strategy may still have acted)',
});

/** "The default execution note" when an older payload carries none (BA §5.3). */
export const DEFAULT_EXECUTION_NOTE = 'Close-based lines: act at the close (MOC / last minutes) if the price is beyond '
  + 'the line; a stop order at a close-based line is a different rule. Intrabar stops (marked) can be placed as stop '
  + 'orders; a gap through them fills worse than the backtest.';

/**
 * One-line chip of a Signals pane: a strategy's own estimate (for the merged position, OQ7), or
 * the merged one (strategyKey null). null when there is nothing to show for that pane.
 * @returns {{tone: 'buy'|'sell'|'none', text: string, title: string}|null}
 */
export const paneChip = (nt, strategyKey = null) => {
  if (!nt) return null;
  const label = nextBarLabel(nt);
  if (nt.status !== 'OK') {
    return strategyKey ? null : { tone: 'none', text: `next bar: ${statusText(nt)}`, title: statusText(nt) };
  }
  if (nt.position === 'SHORT') return { tone: 'none', text: 'next bar: short not estimated', title: oneLiner(nt) };
  const estimate = strategyKey ? nt.strategyByKey[strategyKey] : nt.merged;
  if (!estimate) return null;
  const lines = estimate.kind === 'LINES' ? actionLines(estimate) : [];
  const body = lines.length > 0
    ? lines.map(lineText).join(' · ')
    : kindText(estimate.kind === 'LINES' ? { ...estimate, kind: 'NONE' } : estimate, nt.position) || '—';
  const partial = estimate.partial ? ` · ${partialText(estimate)}` : '';
  const sides = new Set(lines.map(l => l.side));
  const tone = sides.has('BUY') ? 'buy' : sides.has('SELL') ? 'sell' : 'none';
  const text = `next bar: ${body}${estimate.partial ? ' · partial' : ''}`;
  const title = `Next bar (${label}), position ${nt.position || '—'} at the ${fmtBarKey(nt, nt.basisBarDate)} close`
    + `${strategyKey ? ' (the merged position this strategy runs on)' : ''}:\n${body}${partial}`;
  return { tone, text, title };
};

/**
 * A bar key of this estimate for display: the day only on DAY / WEEK / MONTH (the next bar then has
 * an expected date; their keys carry a technical time such as 09:00), date and time intraday.
 */
const isDailyOrLonger = (nt) => Boolean(nt?.nextBar?.expectedDate)
  || /^(\d{4}-\d{2}(-\d{2})?$|week of)/.test(nt?.nextBar?.label || '');
export const fmtBarKey = (nt, v) => (isDailyOrLonger(nt) ? fmtTriggerDay(v) : fmtTriggerTs(v));
