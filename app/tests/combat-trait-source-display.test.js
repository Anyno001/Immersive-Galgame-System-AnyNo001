import test from 'node:test';
import assert from 'node:assert/strict';
import { flipView, traitSourcesOf } from '../src/combat/flip.js';
import { emptyPick } from '../src/combat/flip.js';

test('特质来源只在实际生效时列出', () => {
    assert.deepEqual(traitSourcesOf({}), []);
    assert.deepEqual(traitSourcesOf({ traitFlip: { trait: '幸运儿', effect: 'choices' } }), [{ trait: '幸运儿', kind: 'choices' }]);
    assert.deepEqual(traitSourcesOf({ traitFlip: { trait: '赌徒', effect: 'reroll' } }), []);
    assert.deepEqual(traitSourcesOf({ traitFlip: { trait: '赌徒', effect: 'reroll' } }, { free: true }), [{ trait: '赌徒', kind: 'reroll' }]);
    assert.deepEqual(traitSourcesOf({ traitBias: { trait: '战斗狂', category: 'attack' } }), [{ trait: '战斗狂', kind: 'bias', category: 'attack' }]);
});

test('翻牌视图带 traitSources', () => {
    const reward = { slots: [{ index: 0, kind: 'card', rarity: 'common', cost: 1 }], reserve: [], links: { reveal: 0, fortune: 0, reflip: 0 }, traitFlip: { trait: '灵觉', effect: 'reveal' } };
    const v = flipView(reward, emptyPick(), {});
    assert.equal(v.traitSources?.[0]?.trait, '灵觉');
});
