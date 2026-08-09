// Shared fraction <-> whole-percentage conversion for display/edit boundaries.
//
// The wire format (RecursiveChannelParams.minWidthPct request field, Channel.widthPct response
// field) always stays a fraction (0.05 = 5%) - only the UI displays/edits it as a whole
// percentage (5). Convert here, at the boundary, rather than inline in each component.

// Fraction (0.05) -> display number (5), for populating an editable input.
export const fractionToDisplayPct = (fraction) => fraction * 100;

// Display number (5) -> fraction (0.05), for building a request payload.
export const displayPctToFraction = (pct) => pct / 100;

// Fraction (0.049) -> read-only percentage text ("4.9%"), for a plain label/readout.
export const formatPct = (fraction, decimals = 1) => `${(fraction * 100).toFixed(decimals)}%`;
