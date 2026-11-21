// src/components/strategyConstructor/previewFormat.js
//
// Texts of the constructor Preview laid out like the Backtest (designer_constructor_preview_v1.md
// §1.4-§1.5): the trade count of the summary line, the "No trades" info box and the warnings box
// (the preview's own ∪ the Backtest run's, de-duplicated). Pure logic for ConstructedPreview.
import { extractTradesFromSignals } from '../../utils/ChartDataUtils';

const ENTRY_TYPES = ['LongOpen', 'ShortOpen'];

/**
 * Trades of the Backtest result: closed trades of `chartDataDTO.signals` + the open positions.
 * @param {Object|null} backtest normalized PreviewDTO.backtest
 * @returns {number|null} null without a backtest
 */
export const previewTradeCount = (backtest) => {
  if (!backtest) return null;
  const closed = extractTradesFromSignals(backtest.chartDataDTO?.signals || []).length;
  return closed + (backtest.hasOpenPosition === true ? 1 : 0) + (backtest.hasOpenShortPosition === true ? 1 : 0);
};

/**
 * The "No trades" info box (only when the Backtest result has no trade at all).
 * @param {Array<{ruleId, signalType, fired}>} rules the preview's rules
 * @returns {string} the first matching line of the design
 */
export const noTradesMessage = (rules) => {
  const entries = (rules || []).filter((r) => ENTRY_TYPES.includes(r.signalType));
  if (entries.length === 0) {
    return 'No trades: this strategy has no LongOpen or ShortOpen rule, so alone it never opens a position. '
      + 'Its effect shows only together with an entry strategy (Backtest).';
  }
  if (entries.every((r) => !(r.fired > 0))) {
    return `No trades: ${entries.map((r) => `R${r.ruleId} ${r.signalType}`).join(', ')} never fired in this range.`;
  }
  return 'No trades in this range: the entry rules fired but no position was opened (see the strip and the Rules tab).';
};

/** The preview's warnings followed by the Backtest run's ones not already listed. */
export const mergedPreviewWarnings = (preview) => {
  const out = [...(preview?.warnings || [])];
  (preview?.backtest?.warnings || []).forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out;
};

/** Rules with at least one warning (the backend's, or the client's state / dead-entry ones). */
export const rulesWithWarnings = (rules, warningsOf) => (rules || []).filter((r) => (warningsOf(r) || []).length > 0).length;
