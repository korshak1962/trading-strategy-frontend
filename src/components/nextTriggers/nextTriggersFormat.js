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
  BREACH_BAND: 'channel breach band', // pre-incremental-channels next_triggers rows only
  CHANNEL_EXIT: 'channel exit (close ± 0.5 ATR)',
  SETUP_ARMS: 'setup arms',
  RUNAWAY_AFTER_BREAKOUT: 'runaway after breakout',
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
      case 'RUNAWAY_AFTER_BREAKOUT': return `after a breakout: runaway BUY if close > ${priceText(line)}${andPart}`
        + ', from the bar after the breakout bar'
        + `${line.category === 'APPROX' ? ' (approximate: ATR will change)' : ''}`
        + `${line.meta?.regimeGate === true ? '; the regime gate also applies' : ''}`;
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
      // The band's own reason (CHANNEL_EXIT: close beyond a confirmed channel line ± 0.5 ATR)
      const bandReason = estimate.lines.find(l => l.category === 'NECESSARY' && l.reason)?.reason;
      const bandLabel = bandReason ? ` (${reasonLabel(bandReason)})` : '';
      return band
        ? `no signal possible if close stays within [${fmtTriggerPrice(band[0])}, ${fmtTriggerPrice(band[1])}]; `
          + `possible only if close < ${fmtTriggerPrice(band[0])} or > ${fmtTriggerPrice(band[1])}${bandLabel}`
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

// ---------------------------------------------------------------------------------------------
// Setup preview (screener architect.md "setup preview" §3.1): a FLAT LevelBreakoutRetest with no
// armed setup can not buy on the next bar, but its INFO lines say where the zone would break out
// (SETUP_ARMS) and, from the bar after that breakout, where a runaway close would buy
// (RUNAWAY_AFTER_BREAKOUT, newer backends only). Never an order for the next bar.
// ---------------------------------------------------------------------------------------------

export const PREVIEW_REASONS = Object.freeze(['SETUP_ARMS', 'RUNAWAY_AFTER_BREAKOUT']);

/** An informational setup-preview line (breakout / runaway after breakout). */
export const isSetupPreview = (line) => Boolean(line?.informational) && PREVIEW_REASONS.includes(line.reason);

const sameZone = (a, b) => (a.meta?.zoneId ?? null) === (b.meta?.zoneId ?? null)
  && (a.source ?? null) === (b.source ?? null);

/**
 * { arms, runaway } of a list of info lines: the arms line nearest to the basis close and the
 * runaway line of the same zone (null on older payloads / RunawayAtr 0). null without an arms line.
 */
const previewOfLines = (lines) => {
  const arms = lines
    .filter(l => l.informational && l.reason === 'SETUP_ARMS' && isNum(l.price))
    .sort((a, b) => Math.abs(a.distance ?? Infinity) - Math.abs(b.distance ?? Infinity))[0];
  if (!arms) return null;
  const runaway = lines.find(l => l.informational && l.reason === 'RUNAWAY_AFTER_BREAKOUT'
    && isNum(l.price) && sameZone(l, arms)) || null;
  return { arms, runaway };
};

/** An ATR multiple: "1.0", "0.5", "0.25". */
const fmtMult = (f) => (Number.isInteger(f) ? f.toFixed(1) : fmtFactor(f));

// One gate for every view (column, card, Signals chip, chart): status OK, not LONG / SHORT, and the
// merged estimate is NONE - never under "BUY at any price", UNAVAILABLE, NOT_ESTIMABLE, ... (as oneLiner)
const previewAllowed = (nt) => Boolean(nt) && nt.status === 'OK'
  && nt.position !== 'LONG' && nt.position !== 'SHORT' && nt.merged?.kind === 'NONE';

/**
 * The setup preview of the merged estimate: null when LONG / SHORT, status not OK, the merged
 * estimate is not of kind NONE or has actionable lines (then the BUY lines are the next-bar answer, as before).
 * Reads the merged info lines first, then every strategy's (the same source oneLiner uses).
 */
export const setupPreview = (nt) => {
  if (!previewAllowed(nt) || actionLines(nt.merged).length > 0) return null;
  return previewOfLines(infoLines(nt.merged)) || previewOfLines(nt.strategies.flatMap(infoLines));
};

/** The setup preview of one estimate (a Signals pane), same gating as setupPreview. */
export const estimatePreview = (nt, estimate) => {
  if (!previewAllowed(nt) || !estimate || estimate.kind !== 'NONE' || actionLines(estimate).length > 0) return null;
  return previewOfLines(infoLines(estimate));
};

/** "arms > 788.60 (+2.0 %) · runaway ≈ 785.11 after breakout" (withPct false: no distance). */
export const previewShortText = (p, withPct = true) => {
  if (!p) return '';
  const pct = withPct && isNum(p.arms.distancePct) ? ` (${signed(p.arms.distancePct, 1)} %)` : '';
  const runaway = p.runaway
    ? ` · runaway ${p.runaway.category === 'APPROX' ? '≈ ' : ''}${fmtTriggerPrice(p.runaway.price)} after breakout`
    : '';
  return `arms > ${fmtTriggerPrice(p.arms.price)}${pct}${runaway}`;
};

/** "setup arms above 788.60, then runaway above ≈785.11" (backend NextTriggerText wording). */
const previewInlineText = (p) => `setup arms above ${fmtTriggerPrice(p.arms.price)}`
  + `${p.runaway ? `, then runaway above ${priceText(p.runaway)}` : ''}`;

/**
 * Multi-line explanation of the preview (tooltips, the card note). Sentences whose numbers an
 * older payload does not carry are dropped.
 * @returns {string[]} the sentences
 */
export const previewSentences = (p, nt) => {
  if (!p) return [];
  const { arms, runaway } = p;
  const am = arms.meta || {};
  const rm = runaway?.meta || {};
  const zoneLow = isNum(am.zoneLow) ? am.zoneLow : (isNum(rm.zoneLow) ? rm.zoneLow : null);
  const zoneHigh = isNum(am.zoneHigh) ? am.zoneHigh : (isNum(rm.zoneHigh) ? rm.zoneHigh : null);
  const touch = isNum(rm.touchLine) ? rm.touchLine : (runaway?.and ? runaway.and.price : zoneHigh);
  const label = nt ? nextBarLabel(nt) : 'next bar';
  const when = label === 'next bar' ? 'on the next bar' : `on ${label}`;
  const noArmed = /no armed setup/i.test(nt?.merged?.reason || '');
  const out = [noArmed ? `No armed setup yet: nothing can buy ${when}.` : `Nothing can buy ${when}.`];
  const how = zoneLow !== null && zoneHigh !== null && isNum(am.breakBuffer) && isNum(nt?.atr)
    ? ` (zone ${fmtTriggerPrice(zoneLow)}–${fmtTriggerPrice(zoneHigh)} high + ${fmtMult(am.breakBuffer)} × ATR ${fmtTriggerPrice(nt.atr)})`
    : '';
  out.push(`Breakout: a close above ${fmtTriggerPrice(arms.price)}${how} breaks the zone out. That bar itself does not buy.`);
  if (runaway) {
    const factor = isNum(rm.runawayAtr) ? ` (zone high + ${fmtMult(rm.runawayAtr)} × ATR)` : '';
    const noTouch = isNum(touch) ? ` without touching the zone (low > ${fmtTriggerPrice(touch)})` : '';
    out.push(`From the bar after the breakout: runaway BUY if close > ${priceText(runaway)}${factor}${noTouch}.`);
  }
  if (zoneHigh !== null) {
    const t = fmtTriggerPrice(isNum(touch) ? touch : zoneHigh);
    if (rm.confirmMode === 1) {
      out.push(`A retest (low ≤ ${t}) starts a confirmation: a later close above the touch bar's high buys.`);
    } else if (rm.confirmMode === 0) {
      out.push(`A retest (low ≤ ${t}) with a close above ${fmtTriggerPrice(zoneHigh)} buys too.`);
    } else {
      out.push(`A retest of the zone (low ≤ ${t}) after the breakout can also lead to a buy.`);
    }
  }
  if (rm.regimeGate === true) out.push('The regime gate also applies (not known for future bars).');
  if (runaway?.category === 'APPROX') out.push('≈: the ATR will have changed by then; the line is recomputed after the breakout.');
  return out;
};

/** previewSentences joined into one multi-line tooltip text. */
export const previewTitle = (p, nt) => previewSentences(p, nt).join('\n');

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
    const p = setupPreview(nt);
    if (p) body += `; ${previewInlineText(p)}`;
  }
  const partial = m.partial ? ` · ${partialText(m)}` : '';
  return `${head}: ${body}${partial}`;
};

/**
 * Watchlist column: { tone: 'buy'|'sell'|'none'|'info'|'muted', text, more, partial, title }.
 * tone 'buy' / 'sell' = the merged estimate has a line of that side; 'info' = a FLAT setup preview
 * (where the zone would break out - never a next-bar order).
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
  const preview = setupPreview(nt);
  if (preview) {
    return {
      tone: 'info',
      text: previewShortText(preview),
      more: 0,
      partial: m.partial,
      title: `${title}\n${previewTitle(preview, nt)}`,
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
  // FLAT, nothing actionable: the setup preview as a suffix (tone stays 'none' - not an order)
  const preview = strategyKey ? estimatePreview(nt, estimate) : setupPreview(nt);
  const previewPart = preview ? ` · ${previewShortText(preview, false)}` : '';
  const text = `next bar: ${body}${previewPart}${estimate.partial ? ' · partial' : ''}`;
  const title = `Next bar (${label}), position ${nt.position || '—'} at the ${fmtBarKey(nt, nt.basisBarDate)} close`
    + `${strategyKey ? ' (the merged position this strategy runs on)' : ''}:\n${body}${partial}`
    + `${preview ? `\n${previewTitle(preview, nt)}` : ''}`;
  return { tone, text, title };
};

/**
 * A bar key of this estimate for display: the day only on DAY / WEEK / MONTH (the next bar then has
 * an expected date; their keys carry a technical time such as 09:00), date and time intraday.
 */
const isDailyOrLonger = (nt) => Boolean(nt?.nextBar?.expectedDate)
  || /^(\d{4}-\d{2}(-\d{2})?$|week of)/.test(nt?.nextBar?.label || '');
export const fmtBarKey = (nt, v) => (isDailyOrLonger(nt) ? fmtTriggerDay(v) : fmtTriggerTs(v));
