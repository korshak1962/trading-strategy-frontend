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

// ---- incremental channels (screener TASK_incremental_channels rev 2) ----

// Channel.status: CONFIRMED ("drawn in pen") / PROVISIONAL ("pencil sketch": younger than 10
// bars or narrower than 5 ATR - redrawn every bar, never read by a strategy). An older backend
// sends no status: treated as confirmed, i.e. drawn exactly as before.
export const isProvisional = (ch) => ch?.status === 'PROVISIONAL';

export const STATUS_LABEL = Object.freeze({ CONFIRMED: 'confirmed', PROVISIONAL: 'draft' });
export const formatStatus = (ch) => (ch?.status ? (STATUS_LABEL[ch.status] || ch.status.toLowerCase()) : null);

// ageBars = t - start (bars since the channel's first bar, t = the last processed bar).
export const formatAge = (ageBars) =>
  (typeof ageBars === 'number' && Number.isFinite(ageBars) ? `${ageBars} bar${ageBars === 1 ? '' : 's'}` : null);

// ChannelExitDTO.side: UP = close above upper + 0.5 ATR, DOWN = close below lower - 0.5 ATR.
export const EXIT_SIDE_LABEL = Object.freeze({ UP: '↑ up', DOWN: '↓ down' });
export const formatExitSide = (side) => EXIT_SIDE_LABEL[side] || (side ? String(side).toLowerCase() : '?');

// "2026-10-23T00:00:00" -> "2026-10-23"; intraday keeps "HH:MM". Exchange wall clock, no conversion.
export const formatBarDate = (v) => {
  if (typeof v !== 'string' || v.length < 10) return '—';
  const day = v.substring(0, 10);
  const time = v.length >= 16 ? v.substring(11, 16) : null;
  return time && time !== '00:00' ? `${day} ${time}` : day;
};

// Identifies a channel across re-renders within the same detection run (no backend ID
// exists). Stable as long as the underlying detection result doesn't change — edits keyed
// on this are reset whenever `runId` changes (see ChannelExplorerChart's runId prop). Also the
// identity of the selection shared by the chart and the channel cards.
export const channelKey = (ch) =>
  `${ch.timeframe}|${ch.startDate}|${ch.endDate}|${ch.upper.anchorBarIndex}|${ch.lower.anchorBarIndex}|${ch.direction}`;
