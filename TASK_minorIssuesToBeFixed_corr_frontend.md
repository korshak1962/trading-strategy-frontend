# Minor issues — CORR frontend (rev 1)

Source: Frontend Tester report `D:/projects/screener/logs/agents/frontend_tester.md` (CORR indicator, 2026-11-17). Non-blocking; deferred.

## m3 — unknown benchmark in a saved Indicators Chart set silently becomes SPY

- **Where:** `src/components/indicatorsChart/indicatorSet.js` → `sanitizeItems` / `choiceValueOf`.
- **What:** a stored item `{kind: 'CORR', params: {n: 60, benchmark: 'IWM'}}` (a benchmark the meta no longer / not yet lists) is restored as `Corr(60, SPY)` without a notice. If the set already holds `Corr(60, SPY)`, the chart shows two identical chips (one series request: same spec key).
- **Repro:** put `{"items":[{"id":"a","kind":"CORR","params":{"n":60,"benchmark":"IWM"},"color":"#f00"},{"id":"b","kind":"CORR","params":{"n":60,"benchmark":"SPY"},"color":"#0f0"}]}` into `localStorage['tsf.indicatorsChart.v1']`, open Indicators Chart.
- **Proposed fix:** on restore, an unknown choice value is reported in the existing "Removed from the saved indicator set" notice (or `… benchmark IWM → SPY`), and an item whose spec (`specKey`) duplicates an earlier one is dropped (or merged) with the same notice.
