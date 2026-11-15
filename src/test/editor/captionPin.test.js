// Gate G3 (editor UX Stage A): the editor's code captions stay byte-identical to master.
import { describe, expect, it } from 'vitest';
import { fromConstructedDTO, CONSTRUCTED_TFS } from '../../api/constructedApi';
import {
  levelsCaptionOpts, levelsLegendLines, levelsSpecLabel, levelsSpecsOf, linkNotes, ruleCaption, ruleConditionCaption,
} from '../../components/strategyConstructor/constructedFormat';
import { conditionCaption } from '../../components/universeScreener/conditionFormat';
import { fromFilterDTO } from '../../api/screenerApi';
import { baseline, fixture } from './baselines';

const fx = fixture();

const actualCaptions = () => {
  const constructed = {};
  fx.constructed.forEach((e) => {
    const d = fromConstructedDTO(e.dto);
    const opts = levelsCaptionOpts(d.rules, d.axes);
    const byTf = {};
    CONSTRUCTED_TFS.forEach((tf) => {
      byTf[tf] = {
        rules: d.rules.map((r) => ruleCaption(r, tf, d.axes, opts)),
        conditions: d.rules.flatMap((r) => r.conditions.map((c) => ruleConditionCaption(c, tf, d.axes, opts))),
      };
    });
    constructed[e.id] = {
      byTf,
      linkNotes: d.rules.flatMap((r) => r.conditions.map((c) => linkNotes(c.links, d.axes))),
      levelsSpecs: levelsSpecsOf(d.rules, d.axes).map((x) => levelsSpecLabel(x.spec)),
      levelsLegend: levelsLegendLines(d.rules, d.axes),
    };
  });
  const filters = {};
  fx.filters.forEach((e) => {
    const f = fromFilterDTO(e.dto, {});
    filters[e.id] = Object.fromEntries(['DAY', 'WEEK'].map((tf) => [tf, f.conditions.map((c) => conditionCaption(c, tf))]));
  });
  return { constructed, filters };
};

describe('G3 caption pin', () => {
  it('captions == master', () => {
    const actual = actualCaptions();
    const expected = baseline('captions_expected.json', actual);
    for (const id of Object.keys(expected.constructed)) expect(actual.constructed[id], id).toEqual(expected.constructed[id]);
    for (const id of Object.keys(expected.filters)) expect(actual.filters[id], id).toEqual(expected.filters[id]);
  });
});
