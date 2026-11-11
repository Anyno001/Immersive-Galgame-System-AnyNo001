import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARD_TEMPLATES } from '../src/combat/card-templates.js';
import { templateCandidates } from '../src/combat/acquire-candidates.js';
import { biasCategories, traitTemplateWeightOf } from '../src/combat/trait-template-bias.js';
import { growthEntity } from '../src/combat/generation.js';

describe('特质模板偏向', () => {
    const keys = Object.keys(CARD_TEMPLATES);
    const describeOf = (key) => CARD_TEMPLATES[key].label;
    it('无特质或无命中时权重函数为 null，结果与原来一致', () => {
        assert.equal(traitTemplateWeightOf(undefined), null);
        assert.equal(traitTemplateWeightOf(['不存在']), null);
        const base = templateCandidates(keys, describeOf, '', 's1');
        assert.deepEqual(templateCandidates(keys, describeOf, '', 's1', { weightOf: traitTemplateWeightOf([]) }), base);
    });
    it('按特质分组命中类别并加权', () => {
        assert.deepEqual([...biasCategories(['战斗狂', '赌徒'])].sort(), ['attack', 'random']);
        const w = traitTemplateWeightOf(['抖M']);
        assert.equal(w('bloodlet'), 2);
        assert.equal(w('strike'), 1);
        assert.equal(traitTemplateWeightOf(['毒舌'])('venom'), 2);
        assert.equal(traitTemplateWeightOf(['坚韧'])('guard'), 2);
    });
    it('偏向只改排序、不改候选数量', () => {
        const base = templateCandidates(keys, describeOf, '', 's2');
        const biased = templateCandidates(keys, describeOf, '', 's2', { weightOf: traitTemplateWeightOf(['战斗狂']) });
        assert.equal(biased.length, base.length);
    });
    it('growthEntity 不传 traits 与原结果一致', () => {
        const character = { id: 'c', name: '甲', kind: 'deck-character', owned: new Map(), catalog: new Map(), skills: [], classProfile: {} };
        const growth = { kind: 'learn', skill: '火球', description: '', rarity: 'rare', anchor: { messageId: 1 } };
        const a = growthEntity(growth, character, {});
        const b = growthEntity(growth, character, { traits: [] });
        assert.deepEqual(b.entity.input.templates, a.entity.input.templates);
    });
});
