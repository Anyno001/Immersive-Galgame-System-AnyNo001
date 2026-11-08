import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTraitChange, getTraitByName, getTraitDef, hasTrait, listTraits, sanitizeTraits, traitReqStatus } from '../src/scene/stats/stat-traits.js';
import { gateAttributes } from '../src/scene/stats/stat-engine.js';

const attrs = (patch = {}) => ({ 力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 10, 魅力: 10, ...patch });
const cat = (a, traits = {}) => ({ traits, nsfw: true, attrsOf: () => a });

test('自动与手动挂上：不合格被拦，原因 attr-low', () => {
    const c = cat(attrs({ 体质: 12 }));
    for (const src of ['auto', 'manual']) {
        const r = applyTraitChange(null, c, '林夏', '强健', true, src);
        assert.equal(r.reason, 'attr-low');
        assert.deepEqual(listTraits(r.catalog, '林夏'), []);
    }
    assert.equal(applyTraitChange(null, cat(attrs({ 体质: 13 })), '林夏', '强健', true, 'manual').reason, undefined);
});

test('剧情授予放行，不查门槛', () => {
    const r = applyTraitChange(null, cat(attrs({ 体质: 5 })), '林夏', '强健', true, 'story');
    assert.equal(r.reason, undefined);
    assert.equal(listTraits(r.catalog, '林夏').length, 1);
});

test('推测六维（读不到真实值）不拦', () => {
    const c = { traits: {}, nsfw: true, attrsOf: () => null };
    assert.equal(applyTraitChange(null, c, '林夏', '强健', true, 'auto').reason, undefined);
    assert.equal(traitReqStatus(getTraitDef('强健'), null).ok, true);
});

test('多项门槛任一不达标即不合格，lacks 主属性在前', () => {
    const def = getTraitDef('耐痛');
    assert.equal(traitReqStatus(def, attrs({ 体质: 13, 感知: 11 })).ok, true);
    const s = traitReqStatus(def, attrs({ 体质: 14, 感知: 10 }));
    assert.equal(s.ok, false);
    assert.deepEqual(s.lacks, [{ 属性: '感知', 现值: 10, 需: 11 }]);
    assert.equal(applyTraitChange(null, cat(attrs({ 体质: 12, 感知: 12 })), '林夏', '耐痛', true, 'manual').reason, 'attr-low');
});

test('休眠与恢复：已挂不合格时 hasTrait 为假且不摘下，回升后恢复', () => {
    const traits = { 林夏: { 强健: { on: true, src: 'manual' } } };
    assert.equal(hasTrait(null, cat(attrs({ 体质: 12 }), traits), '林夏', '强健'), false);
    assert.equal(listTraits(cat(attrs({ 体质: 12 }), traits), '林夏').length, 1);
    assert.equal(hasTrait(null, cat(attrs({ 体质: 14 }), traits), '林夏', '强健'), true);
    assert.equal(hasTrait(null, { traits, nsfw: true, attrsOf: () => null }, '林夏', '强健'), true);
});

test('旧档「魅魔体质」键仍生效，新旧名都能查到', () => {
    const traits = { 林夏: { 魅魔体质: { on: true, src: 'auto' } } };
    assert.equal(getTraitByName('天生媚骨').id, '魅魔体质');
    assert.equal(getTraitByName('魅魔体质').name, '天生媚骨');
    assert.deepEqual(Object.keys(sanitizeTraits(traits).林夏), ['魅魔体质']);
    assert.equal(hasTrait(null, cat(attrs({ 体质: 14 }), traits), '林夏', '魅魔体质'), true);
    assert.equal(hasTrait(null, cat(attrs({ 体质: 13 }), traits), '林夏', '魅魔体质'), false);
});

test('生效六维按分数取值：战斗侧未初始化的推导值与无档 NPC 返回 null，建卡分数与加成折算', () => {
    const engine = (extra) => ({ sheets: {}, userName: '', readAbilities: null, readBonus: null, ...extra });
    assert.equal(gateAttributes(engine({}), null, '林夏'), null);
    assert.equal(gateAttributes(engine({ readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, initialized: false }) }), null, '林夏'), null);
    const sheet = { scale: 'score', attributes: { 力量: 10, 敏捷: 10, 体质: 14, 智力: 10, 感知: 10, 魅力: 10 } };
    assert.equal(gateAttributes(engine({ sheets: { 林夏: sheet } }), null, '林夏').体质, 14);
    const hero = gateAttributes(engine({ readAbilities: () => ({ scores: { str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 10 }, initialized: true }), readBonus: () => [{ name: '体质', val: 10 }] }), null, '主角');
    assert.equal(hero.体质, 14);
});
