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

// ---- Stale notice (fix round 1): why the shown preview no longer matches the editor -------------

/** The preview settings a run is made with, normalized as the request sends them. */
export const previewSettingsOf = (form) => ({
  ticker: String(form?.ticker || '').trim().toUpperCase(),
  timeFrame: form?.timeFrame || null,
  startDay: form?.startDay || null,
  endDay: form?.endDay || null,
  longOnly: !!form?.longOnly,
});

/**
 * Why the shown preview is out of date.
 * @param {Object} p
 * @param {string|null} p.previewSig definition signature the preview ran with
 * @param {string|null} p.draftSig definition signature of the draft now
 * @param {Object|null} p.ranWith previewSettingsOf() of the run (null = unknown: settings not compared)
 * @param {Object} p.form the preview form now
 * @returns {'rules'|'settings'|'both'|null} null = up to date
 */
export const previewStaleReason = ({ previewSig, draftSig, ranWith, form }) => {
  const rules = previewSig !== draftSig;
  let settings = false;
  if (ranWith) {
    const now = previewSettingsOf(form);
    settings = Object.keys(now).some((k) => now[k] !== ranWith[k]);
  }
  if (rules && settings) return 'both';
  if (rules) return 'rules';
  return settings ? 'settings' : null;
};

const STALE_TEXT = {
  rules: 'The rules changed after this preview — run it again.',
  settings: 'The settings changed after this preview — run it again.',
  both: 'The rules and the settings changed after this preview — run it again.',
};

/** The stale notice text of a previewStaleReason() result (null when up to date). */
export const previewStaleText = (reason) => STALE_TEXT[reason] || null;

// ---- Unsaved draft name (fix round 1) -----------------------------------------------------------

/** The request key the backend gives an unsaved draft (ConstructedPreviewService.UNSAVED_KEY). */
export const UNSAVED_PREVIEW_KEY = 'Constructed:preview';

/** "<name> (unsaved)", or "Unsaved draft" when the draft has no name. */
export const unsavedDraftLabel = (name) => {
  const n = String(name || '').trim();
  return n ? `${n} (unsaved)` : 'Unsaved draft';
};

// Fields with bar data: never hold the key, skipped for speed.
const SKIP_KEYS = new Set(['prices', 'priceIndicators', 'indicators', 'channels', 'levelZones']);

const relabel = (v, label) => {
  if (typeof v === 'string') return v.includes(UNSAVED_PREVIEW_KEY) ? v.split(UNSAVED_PREVIEW_KEY).join(label) : v;
  if (Array.isArray(v)) return v.map((x) => relabel(x, label));
  if (!v || typeof v !== 'object') return v;
  const out = {};
  Object.entries(v).forEach(([k, x]) => { out[k] = SKIP_KEYS.has(k) ? x : relabel(x, label); });
  // a per-strategy estimate of the draft: no "(ConstructedStrategy)" after its name
  if (v.key === UNSAVED_PREVIEW_KEY && 'strategyClass' in v) delete out.strategyClass;
  return out;
};

/**
 * A draft's preview (with its `backtest`) with the backend's unsaved key `Constructed:preview`
 * replaced by the draft's display label everywhere it is shown (next-bar card, warnings, …).
 * A saved strategy's preview (no such key) comes back unchanged (the same object).
 * @param {Object|null} preview normalizePreview() result
 * @param {string} label unsavedDraftLabel()
 */
export const relabelUnsavedDraft = (preview, label) => {
  if (!preview || !JSON.stringify(preview, (k, x) => (SKIP_KEYS.has(k) ? undefined : x)).includes(UNSAVED_PREVIEW_KEY)) {
    return preview;
  }
  return relabel(preview, label);
};
