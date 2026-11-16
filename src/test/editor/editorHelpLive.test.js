// Editor UX Stage A fix round (tester M1 / reviewer R1, M8):
// 1. the constructor registers the LIVE backend texts (not the fallbacks) for every operandHelp part
//    and signalTypeHelp, and the constructor and the screener register identical texts;
// 2. the fallback copies in editorTexts.js equal the backend texts (fixtures/meta/meta_help.txt, a
//    copy of the backend's src/test/resources/editor_texts/meta_help.txt), key for key.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConstructedMeta } from '../../api/constructedApi';
import { getScreenerMeta } from '../../api/screenerApi';
import * as T from '../../api/editorTexts';
import { FIXTURE_DIR } from './baselines';

const META_DIR = path.join(FIXTURE_DIR, '..', 'meta');
const readMeta = (name) => JSON.parse(fs.readFileSync(path.join(META_DIR, name), 'utf8'));

/** meta_help.txt: `== <section>` headers, each followed by one JSON object. */
export const loadMetaHelp = () => {
  const parts = fs.readFileSync(path.join(META_DIR, 'meta_help.txt'), 'utf8').split(/^== (.+)$/m);
  const out = {};
  for (let i = 1; i < parts.length; i += 2) out[parts[i].trim()] = JSON.parse(parts[i + 1]);
  return out;
};
const HELP = loadMetaHelp();

/** Every label / tooltip / menuLabel and help-map value prefixed with "LIVE ", so it differs from any fallback. */
const livify = (v, key = '') => {
  if (Array.isArray(v)) return v.map((x) => livify(x, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, livify(x, k)]));
  if (typeof v === 'string' && key !== 'name' && key !== 'group') return `LIVE ${v}`;
  return v;
};

const stubFetch = (body) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

afterEach(() => {
  vi.unstubAllGlobals();
  T.setEditorHelp({ operandHelp: {}, signalTypeHelp: [] }); // back to the fallbacks
});

const OPERAND_PARTS = ['sources', 'groups', 'barFields', 'operators', 'timeframes'];
const liveOperand = livify(HELP.constructed.operandHelp);
const liveSignal = livify(HELP.constructed.signalTypeHelp);

const expectLiveOperand = (op) => {
  OPERAND_PARTS.forEach((part) => {
    expect(liveOperand[part].length).toBeGreaterThan(0);
    liveOperand[part].forEach((x) => {
      const got = op[part][x.name];
      expect(got, `${part}.${x.name}`).toBeTruthy();
      expect(part === 'operators' ? got.menuLabel : got.label, `${part}.${x.name}.label`).toBe(x.label);
      expect(got.tooltip, `${part}.${x.name}.tooltip`).toBe(x.tooltip);
    });
  });
  Object.entries(liveOperand.help).forEach(([k, v]) => expect(op.help[k], `help.${k}`).toBe(v));
};

describe('registry: live texts win over the fallbacks (R1)', () => {
  it('constructor meta: all 5 operandHelp lists, the help map and signalTypeHelp are live', async () => {
    stubFetch({ ...readMeta('constructed_meta_master.json'), operandHelp: liveOperand, signalTypeHelp: liveSignal });
    const meta = await getConstructedMeta();
    const reg = T.getEditorHelp();
    expectLiveOperand(reg.operand);
    liveSignal.forEach((x) => {
      expect(reg.signalTypes[x.name].label).toBe(x.label);
      expect(reg.signalTypes[x.name].tooltip).toBe(x.tooltip);
    });
    // the normalized meta carries the same texts as the registry
    expect(meta.operandHelp).toEqual(reg.operand);
    expect(meta.signalTypeHelp).toEqual(reg.signalTypes);
  });

  it('screener meta: the same live operand texts', async () => {
    stubFetch({ ...readMeta('screener_meta_master.json'), operandHelp: liveOperand });
    await getScreenerMeta();
    expectLiveOperand(T.getEditorHelp().operand);
  });

  it('constructor and screener register identical texts, in either order', async () => {
    const cons = { ...readMeta('constructed_meta_master.json'), operandHelp: liveOperand, signalTypeHelp: liveSignal };
    const scr = { ...readMeta('screener_meta_master.json'), operandHelp: livify(HELP.screener.operandHelp) };
    stubFetch(cons);
    await getConstructedMeta();
    const afterConstructor = T.getEditorHelp().operand;
    stubFetch(scr);
    await getScreenerMeta();
    const afterScreener = T.getEditorHelp().operand;
    expect(afterScreener).toEqual(afterConstructor);
    stubFetch(cons);
    await getConstructedMeta();
    expect(T.getEditorHelp().operand).toEqual(afterScreener);
  });

  it('setEditorHelp is idempotent: an already-normalized object is registered as is', () => {
    const once = T.normalizeOperandHelp(liveOperand);
    T.setEditorHelp({ operandHelp: once, signalTypeHelp: T.normalizeSignalTypeHelp(liveSignal) });
    expectLiveOperand(T.getEditorHelp().operand);
    expect(T.getEditorHelp().signalTypes.LongOpen.label).toBe(liveSignal.find((x) => x.name === 'LongOpen').label);
  });

  it('an old backend (no operandHelp) still gets the fallbacks', async () => {
    stubFetch(readMeta('constructed_meta_master.json'));
    await getConstructedMeta();
    expect(T.getEditorHelp().operand.sources.PRICE_BAR.label).toBe(T.SOURCE_TEXTS.PRICE_BAR.label);
    expect(T.getEditorHelp().signalTypes.ShortClose.label).toBe(T.SIGNAL_TYPE_TEXTS.ShortClose.label);
  });
});

// ---- M8: fallbacks == backend texts ----

/**
 * Keys that exist on one side only, on purpose:
 * - LEVELS_HELP.rearmLabel: the caption of the "Re-arm" checkbox; the backend serves it as the
 *   `rearm` param's `label` (levels.params[rearm]), which LEVELS_PARAM_TEXTS does not carry because
 *   the checkbox is not a ParamBlock number field. Compared with that label below.
 * - CHANNEL_HELP.source: the ⓘ of the Channel row heading / its "Source" label (ChannelConditionRow,
 *   screener ConditionRows); the backend has no meta field for it.
 * - POSITION_REFUSED_REASON (not a meta key): the one "From my open long" disabled reason, see
 *   positionRefusedText in editorTexts.js.
 */
const FRONTEND_ONLY = ['LEVELS_HELP.rearmLabel', 'CHANNEL_HELP.source'];

const byName = (list) => Object.fromEntries((list || []).map((x) => [x.name, x]));

/** [path, fallback, live] for every text the backend serves. */
const pairs = () => {
  const c = HELP.constructed;
  const out = [];
  const items = (name, fb, list, fields = ['label', 'tooltip'], map = {}) => {
    const live = byName(list);
    const keys = new Set([...Object.keys(fb), ...Object.keys(live)]);
    keys.forEach((k) => fields.forEach((f) => {
      const lf = map[f] || f;
      out.push([`${name}.${k}.${f}`, fb[k]?.[f], live[k]?.[lf]]);
    }));
  };
  const helpKeys = (name, fb, live) => {
    const keys = new Set([...Object.keys(fb), ...Object.keys(live || {})]);
    keys.forEach((k) => { if (!FRONTEND_ONLY.includes(`${name}.${k}`)) out.push([`${name}.${k}`, fb[k], live?.[k]]); });
  };
  const groupsFb = Object.fromEntries(T.SOURCE_GROUPS.map((g) => [g.name, g]));
  items('SOURCE_GROUPS', groupsFb, c.operandHelp.groups);
  items('SOURCE_TEXTS', T.SOURCE_TEXTS, c.operandHelp.sources);
  items('BAR_FIELD_TEXTS', T.BAR_FIELD_TEXTS, c.operandHelp.barFields);
  items('OPERATOR_TEXTS', T.OPERATOR_TEXTS, c.operandHelp.operators, ['menuLabel', 'tooltip'], { menuLabel: 'label' });
  items('TIMEFRAME_TEXTS', T.TIMEFRAME_TEXTS, c.operandHelp.timeframes);
  helpKeys('OPERAND_HELP', T.OPERAND_HELP, c.operandHelp.help);
  items('INDICATOR_TEXTS', T.INDICATOR_TEXTS, c.indicators, ['menuLabel', 'tooltip']);
  items('LEVEL_EVENT_TEXTS', T.LEVEL_EVENT_TEXTS, c.levels.events);
  items('LEVEL_OUTPUT_TEXTS', T.LEVEL_OUTPUT_TEXTS, c.levels.outputs);
  const paramsLive = c.levels.params.filter((p) => p.name !== 'rearm');
  items('LEVELS_PARAM_TEXTS', T.LEVELS_PARAM_TEXTS, paramsLive, ['label', 'tooltip', 'group']);
  paramsLive.filter((p) => p.choices).forEach((p) => out.push([`LEVELS_PARAM_TEXTS.${p.name}.choices`,
    JSON.stringify(T.LEVELS_PARAM_TEXTS[p.name]?.choices), JSON.stringify(p.choices.map(({ value, label }) => ({ value, label })))]));
  items('LEVELS_FIXED_TEXTS', T.LEVELS_FIXED_TEXTS, c.levels.fixedParams);
  helpKeys('LEVELS_HELP', T.LEVELS_HELP, c.levels.help);
  const rearm = c.levels.params.find((p) => p.name === 'rearm');
  out.push(['LEVELS_HELP.rearmLabel (= levels.params[rearm].label)', T.LEVELS_HELP.rearmLabel, rearm?.label]);
  items('BRICK_TEXTS', T.BRICK_TEXTS, c.bricks.kinds);
  helpKeys('BRICKS_HELP', T.BRICKS_HELP, c.bricks.help);
  items('POSITION_TEXTS', T.POSITION_TEXTS, c.position.kinds);
  helpKeys('POSITION_HELP', T.POSITION_HELP, c.position.help);
  items('CHANNEL_METRIC_TEXTS', T.CHANNEL_METRIC_TEXTS, c.channel.metrics);
  helpKeys('CHANNEL_HELP', T.CHANNEL_HELP, c.channel.help);
  items('SCREENER_METRIC_TEXTS', T.SCREENER_METRIC_TEXTS, HELP.screener.metricHelp);
  items('SIGNAL_TYPE_TEXTS', T.SIGNAL_TYPE_TEXTS, c.signalTypeHelp);
  helpKeys('AXIS_HELP', T.AXIS_HELP, c.axisHelp);
  return out;
};

describe('one "From my open long" refused text (R4 / M6)', () => {
  it('is the same sentence whatever the live meta says, and is not a "<label>: <text>" join', () => {
    expect(T.positionRefusedText()).toBe(T.POSITION_REFUSED_REASON);
    expect(HELP.constructed.position.help.refused).toBeTruthy(); // served, deliberately not used here
    expect(T.POSITION_REFUSED_REASON).not.toMatch(/^Cover short:/);
  });
});

describe('fallbacks equal the backend texts (M8, meta_help.txt copy)', () => {
  it('every key on both sides, every text equal', () => {
    const diffs = pairs().filter(([, fb, live]) => (fb ?? null) !== (live ?? null))
      .map(([p, fb, live]) => `${p}\n   fallback: ${JSON.stringify(fb)}\n   backend:  ${JSON.stringify(live)}`);
    expect(diffs, diffs.join('\n')).toEqual([]);
  });

  it('screener and constructor serve the same operand texts and indicator texts', () => {
    expect(HELP.screener.operandHelp).toEqual(HELP.constructed.operandHelp);
    expect(HELP.screener.indicators).toEqual(HELP.constructed.indicators);
    expect(HELP.indicators.indicators).toEqual(HELP.constructed.indicators);
  });

  it('the frontend-only keys still exist (documented above)', () => {
    expect(T.LEVELS_HELP.rearmLabel).toBeTruthy();
    expect(T.CHANNEL_HELP.source).toBeTruthy();
    expect(HELP.constructed.channel.help.source).toBeUndefined();
    expect(HELP.constructed.levels.help.rearmLabel).toBeUndefined();
  });
});
