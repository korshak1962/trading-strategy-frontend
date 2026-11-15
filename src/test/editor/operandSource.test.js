// Gate G4 (editor UX Stage A): the Source ↔ kind mapping is total and invertible, and every Source
// transition writes the operand master's two-select path writes (all kinds × sides × 5 run TFs).
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  setIndicatorCatalog, getIndicatorCatalog, FIELD_KINDS, CONST_KIND, LEVEL_KIND, BRICK_OPERAND_KINDS, POSITION_KINDS,
  defaultLengthOf, operandTfsOf, operandUnitOf, unitLabel, kindName, runTfNotSupportedText, isBrickOperand,
} from '../../api/indicatorCatalog';
import { SCREEN_TFS } from '../../api/screenerApi';
import { CONSTRUCTED_TFS, LEVELS_DEFAULTS } from '../../api/constructedApi';
import { unitsClash, RUN_TF } from '../../components/universeScreener/conditionFormat';
import {
  newLevelOperand, newPlainOperand, newBrickOperand, newPositionOperand,
} from '../../components/strategyConstructor/constructedFormat';
import {
  sourceOf, kindFor, transition, sourceGroups, PRICE_BAR, isStagedSource, STAGED_SOURCES,
} from '../../components/strategyConstructor/operandSource';
import { FIXTURE_DIR } from './baselines';

// ---- verbatim copies of master d63c613 (OperandPicker.changeKind / disabledReason, BrickOperandEditor.changeForm) ----

const legacyChangeKind = (value, kind, allowRun) => {
  const set = (patch) => ({ ...value, ...patch });
  const baseTfs = allowRun ? [RUN_TF, ...SCREEN_TFS] : SCREEN_TFS;
  if (kind === CONST_KIND) { return set({ kind }); }
  const okTfs = operandTfsOf(kind, baseTfs);
  return set({
    kind,
    n: defaultLengthOf(kind),
    tf: okTfs.includes(value.tf) ? value.tf : okTfs[0],
  });
};

const legacyDisabledReason = (kind, runTf, otherUnit) => {
  const notRun = runTfNotSupportedText(kind, runTf);
  if (notRun) return notRun;
  const u = operandUnitOf({ kind });
  if (unitsClash(u, otherUnit)) {
    return `${kindName(kind)} is a ${unitLabel(u)} value; the left side is a ${unitLabel(otherUnit)} value: `
      + (u === 'PRICE_RANGE' || otherUnit === 'PRICE_RANGE'
        ? 'ATR compares only with ATR or a number'
        : 'compare values of one unit (or a number)');
  }
  return null;
};

const isStagedOp = (o) => !!o && (o.kind === LEVEL_KIND || BRICK_OPERAND_KINDS.includes(o.kind) || POSITION_KINDS.includes(o.kind));
const legacyChangeForm = (value, f, levelsSpec, otherUnit) => {
  const form = isStagedOp(value) ? value.kind : 'VALUE';
  if (f === form) return value;
  if (f === 'VALUE') return newPlainOperand();
  if (f === LEVEL_KIND) return newLevelOperand(levelsSpec, otherUnit === 'ATR_MULTIPLE' ? 'DIST_SUPPORT_ATR' : 'SUPPORT_LINE');
  if (POSITION_KINDS.includes(f)) return newPositionOperand(f, value);
  return newBrickOperand(f, levelsSpec, isBrickOperand(value) ? value : null);
};

/** The legacy two-select path to `kind`: the form select, then (a plain kind) the kind select. */
const legacyPath = (o, kind, { allowRun, levelsSpec, otherUnit }) => {
  if (STAGED_SOURCES.includes(kind)) return legacyChangeForm(o, kind, levelsSpec, otherUnit);
  let v = o;
  if (isStagedOp(o)) v = legacyChangeForm(o, 'VALUE', levelsSpec, otherUnit);
  if (v.kind === kind) return v; // the select does not fire for the selected kind
  return legacyChangeKind(v, kind, allowRun);
};

// ---- the catalog of the master backend (7 indicators) ----

beforeAll(() => {
  const meta = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, '..', 'meta', 'constructed_meta_master.json'), 'utf8'));
  setIndicatorCatalog({ indicators: meta.indicators });
});

const plainKinds = () => [...FIELD_KINDS, ...getIndicatorCatalog().indicators.map((d) => d.name), CONST_KIND];

const operandsOf = () => {
  const out = [];
  plainKinds().forEach((k) => ['RUN', 'DAY', 'WEEK'].forEach((tf) => {
    out.push(k === CONST_KIND ? { kind: k, value: 1.5, n: null, tf, offset: 0 } : { kind: k, n: defaultLengthOf(k), tf, offset: -1, value: '' });
  }));
  out.push({ kind: 'SMA', n: 120, tf: 'WEEK', offset: -2, value: '' });
  out.push({ kind: 'FOO', n: 7, tf: 'DAY', offset: 0, value: '' }); // a kind from a newer server
  out.push(newLevelOperand(LEVELS_DEFAULTS, 'SETUP_STOP'));
  BRICK_OPERAND_KINDS.forEach((k) => out.push(newBrickOperand(k, LEVELS_DEFAULTS, null)));
  POSITION_KINDS.forEach((k) => out.push(newPositionOperand(k, null)));
  out.push(newPositionOperand('MAX_SINCE_ENTRY', newPositionOperand('AT_ENTRY', { kind: 'AT_ENTRY', x: { kind: 'HIGH', tf: 'RUN', offset: 0 } })));
  return out;
};

describe('G4 source mapping', () => {
  it('sourceOf is total and kindFor(sourceOf(o)) === o.kind', () => {
    operandsOf().forEach((o) => {
      const s = sourceOf(o);
      expect(typeof s.source).toBe('string');
      expect(kindFor(s.source, s.field)).toBe(o.kind);
    });
    expect(sourceOf({ kind: 'HIGH' })).toEqual({ source: PRICE_BAR, field: 'HIGH' });
    expect(sourceOf({ kind: 'FOO' }).source).toBe('UNKNOWN:FOO');
    expect(sourceOf(null).source).toBe('UNKNOWN:');
  });

  it('transition == the legacy two-select path (every from-kind × to-source × side × 5 run TFs × allowRun)', () => {
    const targets = [...plainKinds(), ...STAGED_SOURCES];
    let n = 0;
    CONSTRUCTED_TFS.forEach((runTf) => ['left', 'right'].forEach((side) => [true, false].forEach((allowRun) => {
      operandsOf().forEach((o) => {
        targets.forEach((kind) => {
          if (side === 'left' && kind === CONST_KIND) return;
          const otherUnit = side === 'right' ? 'ATR_MULTIPLE' : null;
          const ctx = { allowRun, levelsSpec: LEVELS_DEFAULTS, otherUnit, runTf };
          const s = sourceOf({ kind });
          const actual = FIELD_KINDS.includes(kind)
            ? transition(o, PRICE_BAR, kind, ctx)
            : transition(o, s.source, null, ctx);
          expect(actual, `${runTf} ${side} ${allowRun} ${o.kind}→${kind}`).toEqual(legacyPath(o, kind, ctx));
          n += 1;
        });
      });
    })));
    expect(n).toBeGreaterThan(10000);
  });

  it('re-picking the current Source / Field is a no-op (same object)', () => {
    operandsOf().forEach((o) => {
      const s = sourceOf(o);
      expect(transition(o, s.source, s.field ?? null, { allowRun: true })).toBe(o);
    });
  });

  it('a Price bar pick without a field from a non-bar source = close', () => {
    expect(transition({ kind: 'SMA', n: 50, tf: 'DAY', offset: 0, value: '' }, PRICE_BAR, null, { allowRun: true }).kind).toBe('CLOSE');
    expect(transition(newLevelOperand(LEVELS_DEFAULTS), PRICE_BAR, null, { allowRun: true })).toEqual(newPlainOperand());
  });
});

describe('G4 menu: disabled reasons are the legacy ones (5 run TFs)', () => {
  it('market items and Price bar', () => {
    CONSTRUCTED_TFS.forEach((runTf) => ['left', 'right'].forEach((side) => [null, 'PRICE', 'PRICE_RANGE', 'PERCENT', 'VOLUME'].forEach((otherUnit) => {
      const groups = sourceGroups({ side, runTf, otherUnit, current: null });
      const market = groups.find((g) => g.name === 'MARKET');
      getIndicatorCatalog().indicators.forEach((d) => {
        const it = market.items.find((x) => x.source === d.name);
        expect(it.disabledReason, `${runTf} ${side} ${otherUnit} ${d.name}`).toBe(legacyDisabledReason(d.name, runTf, side === 'right' ? otherUnit : null));
      });
      const reasons = FIELD_KINDS.map((k) => legacyDisabledReason(k, runTf, side === 'right' ? otherUnit : null));
      const pb = market.items.find((x) => x.source === PRICE_BAR);
      expect(!!pb.disabledReason).toBe(reasons.every(Boolean));
      expect(groups.some((g) => g.name === 'NUMBER')).toBe(side === 'right');
    })));
  });

  it('MIN5 disables the indicators that do not run there', () => {
    const groups = sourceGroups({ side: 'left', runTf: 'MIN5', current: null });
    const off = groups[0].items.filter((x) => x.disabledReason).map((x) => x.source);
    const expected = getIndicatorCatalog().indicators.filter((d) => !d.runTimeframes.includes('MIN5')).map((d) => d.name);
    expect(off.sort()).toEqual(expected.sort());
  });

  it('screener menu = Market data + Number only; constructor adds Levels / functions / position', () => {
    expect(sourceGroups({ side: 'right', current: null }).map((g) => g.name)).toEqual(['MARKET', 'NUMBER']);
    const all = sourceGroups({
      side: 'right', current: null, levels: true, bricks: [{ name: 'AT_LAST' }], positions: [{ name: 'AT_ENTRY' }],
    });
    expect(all.map((g) => g.name)).toEqual(['MARKET', 'NUMBER', 'LEVELS', 'EVENT_FUNCTIONS', 'POSITION_FUNCTIONS']);
  });

  it('Cover short: "From my open long" disabled with a reason; the current one stays selectable', () => {
    const ctx = { side: 'right', levels: true, positions: POSITION_KINDS.map((name) => ({ name })), signalType: 'ShortClose' };
    const pos = sourceGroups({ ...ctx, current: null }).find((g) => g.name === 'POSITION_FUNCTIONS');
    pos.items.forEach((it) => expect(it.disabledReason).toBeTruthy());
    const cur = sourceGroups({ ...ctx, current: 'AT_ENTRY' }).find((g) => g.name === 'POSITION_FUNCTIONS');
    expect(cur.items.find((x) => x.source === 'AT_ENTRY').disabledReason).toBeNull();
    const long = sourceGroups({ ...ctx, signalType: 'LongClose', current: null }).find((g) => g.name === 'POSITION_FUNCTIONS');
    long.items.forEach((it) => expect(it.disabledReason).toBeNull());
  });

  it('an unknown / not-allowed current source is listed as is', () => {
    const g = sourceGroups({ side: 'left', current: 'UNKNOWN:FOO' });
    expect(g.at(-1).items[0].label).toBe('FOO (not in this version)');
    const s = sourceGroups({ side: 'left', current: 'AT_LAST' });
    expect(s.at(-1).items[0].label).toBe('AT_LAST (not allowed here)');
    expect(isStagedSource('AT_LAST')).toBe(true);
  });
});
