// src/components/charts/workspace/panes.js
//
// Pane groups of the price workspace (architect design D6): which pane an indicator is drawn in
// follows from its registry descriptor alone, so a new registry indicator lands in the right pane
// without a list of kinds in the frontend.
//   unit PRICE                     -> 'price' (on the candles, pane 0)
//   both lo and hi set (bounded)   -> '<unit>:<lo>:<hi>' (IBS and ER share RATIO:0:1, RSI PERCENT:0:100)
//   otherwise (unbounded)          -> 'kind:<name>' (one pane per kind: SMA_TILT, ATR, ATR_PCT)

export const PRICE_PANE_KEY = 'price';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** The pane group key of a descriptor. */
export const paneKeyOf = (d) => {
  if (!d) return PRICE_PANE_KEY;
  if (d.unit === 'PRICE') return PRICE_PANE_KEY;
  if (isNum(d.lo) && isNum(d.hi)) return `${d.unit}:${d.lo}:${d.hi}`;
  return `kind:${d.name}`;
};

/** The fixed value range of a bounded pane ({minValue, maxValue}), else null (auto-fit). */
export const paneRangeOf = (d) => (d && d.unit !== 'PRICE' && isNum(d.lo) && isNum(d.hi)
  ? { minValue: d.lo, maxValue: d.hi } : null);
