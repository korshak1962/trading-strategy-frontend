// Editor UX Stage A F1: the normalizers carry the new text keys, fall back to editorTexts.js on an
// old backend (the master meta pin, no new keys), and leave every existing field as it was.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_META, LEVEL_EVENTS, normalizeMeta, normalizeLevelsMeta, normalizeChannelMeta,
} from '../../api/constructedApi';
import { normalizeIndicator } from '../../api/indicatorCatalog';
import { METRICS, OPERATORS } from '../../api/screenerApi';
import {
  LEVEL_EVENT_TEXTS, LEVELS_PARAM_TEXTS, SIGNAL_TYPE_TEXTS, firstSentence, helpMap, helpOf, normalizeOperandHelp,
} from '../../api/editorTexts';
import { levelsFieldLabel } from '../../components/strategyConstructor/constructedFormat';
import { opSymbol, metricLabel } from '../../components/universeScreener/conditionFormat';
import { FIXTURE_DIR } from './baselines';

const master = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, '..', 'meta', name), 'utf8'));
const OLD = master('constructed_meta_master.json');

describe('old backend (master /meta, no Stage A keys)', () => {
  const m = normalizeMeta(OLD);

  it('events get plain labels; only BROKEN_DOWN is out of the menu', () => {
    expect(m.levels.events.length).toBe(OLD.levels.events.length);
    m.levels.events.forEach((e) => {
      expect(e.label).toBe(LEVEL_EVENT_TEXTS[e.name].label);
      expect(e.tooltip).toBe(LEVEL_EVENT_TEXTS[e.name].tooltip);
      expect(e.inMenu).toBe(e.name !== 'BROKEN_DOWN');
    });
  });

  it('existing hints are kept as the backend sent them', () => {
    OLD.levels.events.forEach((x) => expect(m.levels.events.find((e) => e.name === x.name).hint).toBe(x.hint));
    OLD.levels.params.forEach((x) => expect(m.levels.params.find((p) => p.name === x.name)?.hint ?? x.hint).toBe(x.hint));
    OLD.bricks.kinds.forEach((x) => expect(m.bricks.kinds.find((k) => k.name === x.name).hint).toBe(x.hint));
    expect(m.bricks.hint).toBe(OLD.bricks.hint);
    expect(m.position.hint).toBe(OLD.position.hint);
  });

  it('Levels params: plainLabel / group / choices from the fallbacks, code label unchanged', () => {
    m.levels.params.forEach((p) => {
      expect(p.plainLabel).toBe(LEVELS_PARAM_TEXTS[p.name].label);
      expect(p.group).toBe(LEVELS_PARAM_TEXTS[p.name].group);
      expect(p.plainLabel).not.toMatch(/\b[A-Z][a-z]+[A-Z]/);
    });
    expect(m.levels.params.find((p) => p.name === 'confirmMode').choices.map((c) => c.value)).toEqual([0, 1]);
    expect(levelsFieldLabel('stopBuffer')).toBe('StopBuffer');
    expect(m.levels.fixedParams.map((f) => [f.name, f.value])).toEqual([['warmupBars', 60], ['atrLength', 14]]);
    expect(m.levels.help.summary).toBeTruthy();
  });

  it('bricks / position / channel / operand / signal types / axes texts present', () => {
    m.bricks.kinds.forEach((k) => { expect(k.label).not.toBe(k.name); expect(k.tooltip).toBeTruthy(); });
    m.position.kinds.forEach((k) => { expect(k.label).not.toBe(k.name); expect(k.tooltip).toBeTruthy(); });
    m.channel.metrics.forEach((x) => expect(x.tooltip).toBeTruthy());
    expect(m.channel.help['level.1']).toBe('Parent (1)');
    expect(m.operandHelp.sources.PRICE_BAR.label).toBe('Price bar');
    expect(m.operandHelp.operators.GT.menuLabel).toBe('is above (>)');
    expect(m.signalTypeHelp.ShortClose.label).toBe('Cover short');
    expect(m.axisHelp.name).toBeTruthy();
    m.indicators.forEach((d) => expect(d.menuLabel).toBeTruthy());
    expect(m.indicators.find((d) => d.name === 'SMA').menuLabel).toBe('Moving average (SMA)');
    expect(m.indicators.find((d) => d.name === 'SMA').displayName).toBe('SMA');
  });
});

describe('new backend keys win over the fallbacks', () => {
  it('label / tooltip / inMenu / help / choices / fixedParams from meta', () => {
    const lv = normalizeLevelsMeta({
      ...OLD.levels,
      events: [{ name: 'CONFIRMED_ANY', hint: 'h', needsStrength: false, label: 'L', tooltip: 'T', inMenu: false }],
      params: [{ ...OLD.levels.params[0], label: 'Plain', tooltip: 'TT', group: 'BREAKOUT', choices: [{ value: 2, label: 'two' }] }],
      fixedParams: [{ name: 'warmupBars', value: 60, label: 'WU', tooltip: 'wt' }],
      help: { summary: 'S' },
    });
    expect(lv.events[0]).toMatchObject({ name: 'CONFIRMED_ANY', hint: 'h', label: 'L', tooltip: 'T', inMenu: false });
    expect(lv.params.find((p) => p.name === OLD.levels.params[0].name)).toMatchObject({
      plainLabel: 'Plain', tooltip: 'TT', group: 'BREAKOUT', choices: [{ value: 2, label: 'two' }],
    });
    expect(lv.fixedParams[0]).toMatchObject({ label: 'WU', tooltip: 'wt' });
    expect(lv.help.summary).toBe('S');
    expect(lv.help.applyToAll).toBeTruthy();
    const ch = normalizeChannelMeta({ metrics: [{ name: 'POSITION', unit: 'RATIO', hint: 'h', label: 'Pos', tooltip: 'pt' }] });
    expect(ch.metrics[0]).toMatchObject({ label: 'Pos', tooltip: 'pt', hint: 'h' });
    const op = normalizeOperandHelp({ operators: [{ name: 'GT', label: 'greater (>)', tooltip: 'x' }], help: { offset: 'o' } });
    expect(op.operators.GT.menuLabel).toBe('greater (>)');
    expect(op.operators.LT.menuLabel).toBe('is below (<)');
    expect(op.help.offset).toBe('o');
    const ind = normalizeIndicator({ name: 'RSI', displayName: 'RSI', description: 'd', menuLabel: 'R', tooltip: 't' });
    expect(ind).toMatchObject({ menuLabel: 'R', tooltip: 't', displayName: 'RSI', description: 'd' });
    expect(normalizeIndicator({ name: 'NEW', displayName: 'New', description: 'dd' })).toMatchObject({ menuLabel: 'New', tooltip: 'dd' });
  });
});

describe('fallbacks and caption keys', () => {
  it('missing meta → DEFAULT_META has every text', () => {
    expect(LEVEL_EVENTS.find((e) => e.name === 'BROKEN_DOWN').inMenu).toBe(false);
    expect(DEFAULT_META.levels.events.filter((e) => e.inMenu).length).toBe(8);
    expect(normalizeMeta(null).signalTypeHelp.LongOpen.label).toBe(SIGNAL_TYPE_TEXTS.LongOpen.label);
  });

  it('caption symbols and metric labels are unchanged (they feed screener captions)', () => {
    expect(OPERATORS.map((o) => o.label)).toEqual(['>', '≥', '<', '≤']);
    expect(opSymbol('GTE')).toBe('≥');
    expect(METRICS.map((x) => x.label)).toEqual(['Width %', 'Slope %/year', 'Position', 'Age (bars)', 'Touches upper', 'Touches lower']);
    expect(metricLabel('POSITION')).toBe('Position');
    expect(METRICS.find((x) => x.value === 'POSITION').menuLabel).toBe('Position in channel');
  });

  it('helpers', () => {
    expect(helpOf({ name: 'X' })).toEqual({ label: 'X', tooltip: '' });
    expect(helpOf({ name: 'X', hint: 'h' }, { label: 'F' })).toEqual({ label: 'F', tooltip: 'h' });
    expect(helpMap({ a: '', b: 'B' }, { a: 'A' })).toEqual({ a: 'A', b: 'B' });
    expect(firstSentence('One. Two.')).toBe('One.');
    expect(firstSentence('Max 0.5 ATR above. Next.')).toBe('Max 0.5 ATR above.');
  });
});
