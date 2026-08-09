# TASK: Merge `analyzer-frontend` into `trading-strategy-frontend` as new tabs

## Context

Depends on `TASK_merge_channel_recursive_into_screener.md` landing first - channel detection is
now served from `screener`'s single consolidated port (not a separate `channel-recursive` port),
which this task's API wiring depends on. Confirm that's actually done (hit `/api/channels/detect`
on `screener`'s port directly, confirm it responds) before starting.

Goal: fold `analyzer-frontend`'s whole channel-exploration UI (ticker/date-range/timeframe picker,
params panel, the interactive chart with channel selection/width display, the "show only last
actual channels" checkbox) into `trading-strategy-frontend` as one or more new tabs, alongside the
existing strategy-backtest flow - one consolidated app instead of two.

**Investigate `trading-strategy-frontend`'s actual current navigation/routing structure before
deciding how to add this** - this task doc hasn't done that (no source in this project has been
read as part of writing it, only observed via screenshots showing `StrategySelector`,
`StrategyConfig`, `ReporterStyleChart`, etc.). Don't assume a specific routing library, tab
component, or layout pattern - find what's actually there and follow its existing conventions for
how the current "Configure Strategies" -> "Results" flow is structured, rather than introducing a
new, inconsistent navigation pattern for just this one addition.

## PART A - Relocate the components

Move `analyzer-frontend`'s relevant components (the params panel, the channel chart with its
selection/drag/width-display interactions, the ticker/date-range/timeframe controls) into
`trading-strategy-frontend`'s component tree. Check for naming collisions with existing components
first (`trading-strategy-frontend` already has its own chart components - `PriceChart.jsx`,
`ReporterStyleChart.jsx`, etc. - make sure the relocated channel-explorer chart component gets a
name that doesn't collide or get confused with those, since they serve different purposes: one
draws a strategy's signals on a price chart, the other is the standalone recursive-detection
explorer).

## PART B - Update the API client

1. `analyzer-frontend`'s `channelApi.js` currently has two base URLs - `windowed` (screener's old
   port, 8080) and `recursive` (channel-recursive's own port, 8081). The `windowed` entry is now
   entirely moot (that algorithm option is deleted server-side, per
   `TASK_delete_windowed_detector_standardize_channel_dto.md`) - remove it, and remove whatever
   "Windowed" toggle/button existed in the UI for selecting it. Only "Recursive" detection exists
   now, so consider whether an algorithm-selector UI element still makes sense at all, or whether
   it should just be removed entirely as a no-longer-meaningful choice - use judgment based on
   what reads cleanly, this doesn't need to preserve a now-single-option toggle just for
   familiarity.
2. The `recursive` base URL, previously `channel-recursive`'s own port, now needs to point at
   `screener`'s consolidated port and the same `/api/channels/detect` path (unchanged, per Part C
   of the merge task). Check whether `trading-strategy-frontend` already has an existing shared
   API base URL constant/config for talking to `screener` (it must, since `strategyApi.js` already
   calls `/api/strategy/*` on it) - reuse that existing configuration rather than introducing a
   second, separately-maintained base URL pointing at the same backend.

## PART C - Add the new tab(s)

Following whatever navigation pattern the investigation in this task's Context turns up, add the
channel-explorer UI as a new, clearly-labeled tab or section - e.g. "Channel Explorer" alongside
the existing strategy-configuration flow. The two flows are functionally independent (one explores
raw detected channel structure for any ticker/params; the other configures and backtests a
strategy) - they shouldn't need to share state or interact with each other, just live in the same
app under different tabs.

## PART D - Verify

1. The channel-explorer tab works end to end: search a ticker, adjust params (channel coverage, min/
   max annual yield, min bars, min width), toggle "show only last actual channels," select a
   channel and see its width - the full feature set `analyzer-frontend` had, now inside
   `trading-strategy-frontend`.
2. The existing strategy-backtest flow (`StrategySelector` -> `StrategyConfig` -> "Run Backtest" ->
   results tabs) still works exactly as before - this is a purely additive change from that flow's
   perspective, confirm nothing in the existing pages regressed.
3. Confirm no leftover references to `channel-recursive`'s old standalone port (8081) anywhere in
   the merged codebase.

## Out of scope

Any further UI redesign beyond relocating the existing functionality into the new app - this is a
consolidation, not a redesign. If something looks like it could be improved once both flows are
side by side, note it rather than doing it as part of this task.
