// src/utils/objectives.js
//
// Optimization objectives (backend enum OptimizationObjective, sent as
// StrategiesConfigDTO.objectiveFunction; scored by GenericOptimizator.calcFunctional).
// Shared by the Optimize-mode selector (App.jsx), OptimizationProgress and SavedCasesPanel.
// All objectives score the long leg only; higher is better.

export const DEFAULT_OBJECTIVE = 'LONG_PNL';

// Display order of the selector.
export const OBJECTIVES = [
  {
    value: 'LONG_PNL',
    label: 'Long PnL',
    description: 'Total profit of the long trades, in price points. Ignores how deep the drawdowns were.',
  },
  {
    value: 'CALMAR',
    label: 'Calmar',
    description: 'Long PnL divided by the maximum drawdown: profit per unit of pain. '
      + 'The drawdown is floored at 1 % of the first entry price; 0 when there are no trades.',
  },
  {
    value: 'ANNUAL_RETURN',
    label: 'Annual return',
    description: 'Long PnL as a % of the first entry price, annualised over the calendar period (not compounded).',
  },
  {
    value: 'COMPLEX_YIELD',
    label: 'Complex yield',
    description: 'Annual return plus a treasury yield for the time spent out of the market.',
  },
  {
    value: 'SHARPE',
    label: 'Sharpe',
    description: 'Mean / standard deviation of the per-trade % returns, annualised by trades per year. '
      + 'Rewards steady trades; needs at least 2 trades.',
  },
];

export const OBJECTIVE_LABELS = Object.fromEntries(OBJECTIVES.map((o) => [o.value, o.label]));

const KNOWN = new Set(OBJECTIVES.map((o) => o.value));

/** A known objective value, else DEFAULT_OBJECTIVE (null / unknown / older data). */
export const normalizeObjective = (objective) => (KNOWN.has(objective) ? objective : DEFAULT_OBJECTIVE);

/** Label for an objective; an unknown enum value is title-cased, a missing one gives `fallback`. */
export const objectiveLabel = (objective, fallback = 'Objective') =>
  OBJECTIVE_LABELS[objective]
  || (objective
    ? String(objective).toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : fallback);
