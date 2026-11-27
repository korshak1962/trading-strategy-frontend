// src/utils/problemPath.js
//
// Constructor editor UX Stage B3 (screener logs/agents/architect.md §6.1 / §6.2): where a backend
// validation error points. The 400 body's `path` uses the permanent ids of the definition:
//   constructed strategy  `R1` · `R1.C2` · `R1.C1.left.tf` · `R2.C1.right.a.levels.maxDwellBars` · `R1.C2.channel.minBars`
//   screener filter       `conditions[0]` · `conditions[0].left.n`
// An unknown shape → null (nothing is outlined; the message still names the place in words).

const RULE_RE = /^R(\d+)(?:\.C(\d+))?(?:\.(.+))?$/;
const FILTER_RE = /^conditions\[(\d+)\](?:\.(.+))?$/;

/**
 * `{kind: 'rule', ruleId, condId, rest}` / `{kind: 'filter', condIndex, rest}` / null.
 * `condId` / `condIndex` null when the path names the whole rule; `rest` '' when nothing follows.
 */
export const parseProblemPath = (path) => {
  if (typeof path !== 'string' || !path) return null;
  const r = RULE_RE.exec(path);
  if (r) return { kind: 'rule', ruleId: Number(r[1]), condId: r[2] != null ? Number(r[2]) : null, rest: r[3] || '' };
  const f = FILTER_RE.exec(path);
  if (f) return { kind: 'filter', condIndex: Number(f[1]), rest: f[2] || '' };
  return null;
};

const idOf = (x) => (Number.isInteger(x?.id) && x.id > 0 ? x.id : null);
const maxId = (list) => list.reduce((m, x) => Math.max(m, idOf(x) ?? 0), 0);

/**
 * The ids the backend gives a draft's rules and conditions (ConstructedDefinitionValidator): a
 * given id is kept; a new rule takes the next rule id (max(previous nextRuleId, every given id + 1),
 * in order), a new condition the next condition id of its rule likewise. `saved` = the stored
 * version the draft was opened from (its `nextRuleId` / rules' `nextConditionId`), or null.
 * → `[{ruleId, condIds: number[]}]`, in draft order.
 */
export const effectiveIds = (rules, saved = null) => {
  const list = Array.isArray(rules) ? rules : [];
  let nextRule = Math.max(1, Number.isInteger(saved?.nextRuleId) ? saved.nextRuleId : 1, maxId(list) + 1);
  const savedRules = Array.isArray(saved?.rules) ? saved.rules : [];
  return list.map((r) => {
    const ruleId = idOf(r) ?? nextRule++;
    const conds = Array.isArray(r?.conditions) ? r.conditions : [];
    const prev = savedRules.find((x) => idOf(x) === ruleId);
    let nextCond = Math.max(1, Number.isInteger(prev?.nextConditionId) ? prev.nextConditionId : 1, maxId(conds) + 1);
    return { ruleId, condIds: conds.map((c) => idOf(c) ?? nextCond++) };
  });
};

/**
 * The editor place of a constructed strategy's problem path: `{ruleIndex, condIndex, rest}`
 * (`condIndex` null = the whole rule), or null when the path is no rule path or names a rule /
 * condition the draft no longer has.
 */
export const locateRuleProblem = (path, rules, saved = null) => {
  const p = parseProblemPath(path);
  if (!p || p.kind !== 'rule') return null;
  const ids = effectiveIds(rules, saved);
  const ruleIndex = ids.findIndex((x) => x.ruleId === p.ruleId);
  if (ruleIndex < 0) return null;
  if (p.condId == null) return { ruleIndex, condIndex: null, rest: p.rest };
  const condIndex = ids[ruleIndex].condIds.indexOf(p.condId);
  return condIndex < 0 ? null : { ruleIndex, condIndex, rest: p.rest };
};

/** The condition index of a screener filter's problem path, or null. */
export const filterProblemIndex = (path) => {
  const p = parseProblemPath(path);
  return p && p.kind === 'filter' ? p.condIndex : null;
};

/**
 * A ParamBlock's `errorOpen` from the rest of a condition path: the block under `prefix + block + '.'`
 * (`levels` / `channel`) → its field name (a string: open + outline it), the block itself → true,
 * else false. `left.a.levels.maxDwellBars` with prefix `left.a.` and block `levels` → 'maxDwellBars'.
 */
export const blockErrorOf = (rest, prefix, block) => {
  if (typeof rest !== 'string' || !rest) return false;
  const head = `${prefix || ''}${block}`;
  if (rest === head) return true;
  if (!rest.startsWith(`${head}.`)) return false;
  const field = rest.slice(head.length + 1).split('.')[0];
  return field || true;
};
