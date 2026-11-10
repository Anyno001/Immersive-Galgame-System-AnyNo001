// 题材设定 / 存在 / 剧情 分组特质规则：每条已接规则至少一条用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, traitCatalogOf, traitDaily, traitFlag, traitScale } from '../src/scene/stats/stat-traits.js';

const high = () => 0.99;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const mk = (patch = {}, bars = {}) => {
    const base = createCharacter(1, { nsfw: true });
    return { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } };
};
const world = (npcs, hero = {}) => {
    const s = createStatsState();
    return { ...s, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...hero } }, characters: npcs };
};
const on = { on: true, src: 'manual' };
const tr = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [getTraitByName(n).id, on]))]));
const cat = (map) => traitCatalogOf(tr(map), true);
const hero = (r) => r.state.protagonist.bars;
const npc = (r, name = '林夏') => r.state.characters[name];

test('静态倍率：精神结合信任、信息素契合欲望、命定之人好感、认出蛋糕按好感门槛', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 30 } }) });
    assert.equal(traitScale(s, cat({ 林夏: ['精神结合'] }), '林夏', '信任', 'up'), 2);
    assert.equal(traitScale(s, cat({ 林夏: ['信息素契合'] }), '林夏', '欲望', 'up'), 1.5);
    assert.equal(traitScale(s, cat({ 林夏: ['命定之人'] }), '林夏', '好感', 'up'), 1.5);
    assert.equal(traitScale(s, cat({ 林夏: ['认出蛋糕'] }), '林夏', '信任', 'up'), 2);
    const low = world({ 林夏: mk({ dims: { 好感: 10 } }) });
    assert.equal(traitScale(low, cat({ 林夏: ['认出蛋糕'] }), '林夏', '信任', 'up'), 1, '好感未到喜欢不守护');
});

test('不冷却：已标记、精神结合、伴侣印记、血契；命定之人好感未到喜欢时不冷却', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 10 } }) });
    for (const n of ['已标记', '精神结合', '伴侣印记', '血契', '命定之人']) assert.equal(traitFlag(s, cat({ 林夏: [n] }), '林夏', 'noCool'), true, n);
    const liked = world({ 林夏: mk({ dims: { 好感: 30 } }) });
    assert.equal(traitFlag(liked, cat({ 林夏: ['命定之人'] }), '林夏', 'noCool'), false);
    assert.equal(traitFlag(liked, cat({ 林夏: ['血契'] }), '林夏', 'noCool'), true);
});

test('诅咒：每天压力 +5，日结算后主角压力 +5 再减自然回落', () => {
    const s = world({}, { stress: 30 });
    const t = { 主角: { [getTraitByName('诅咒').id]: on } };
    assert.equal(traitDaily(s, traitCatalogOf(t, true), '主角', '压力'), 5);
    const r = settleDay(s, { random: high, rev: 2, traits: t, nsfw: true });
    assert.equal(r.protagonist.bars.stress, 30, '30×15%=5 回落再加 5');
});

test('已标记：主角与他人亲近，已标记者压力上升一大档；无特质不变', () => {
    const s = world({ 林夏: mk({}, { stress: 10 }), 苏晴: mk() });
    const text = '[igs-stat:favor|苏晴|喜悦|中]';
    assert.equal(npc(floor(s, text, tr({ 林夏: ['已标记'] }))).bars.stress, 30);
    assert.equal(npc(floor(s, text)).bars.stress, 10);
});

test('伴侣印记：主角与他人亲近，对方芥蒂上升一大档', () => {
    const s = world({ 林夏: mk(), 苏晴: mk() });
    const r = floor(s, '[igs-stat:intimate|苏晴|轻]', tr({ 林夏: ['伴侣印记'] }));
    assert.equal(npc(r).dims.芥蒂, 10);
});

test('体力消耗：兽人 x0.75、哨兵 x0.5', () => {
    const s = world({ 林夏: mk() });
    const text = '[igs-stat:stamina|林夏|重]';
    assert.equal(npc(floor(s, text)).bars.stamina, 70);
    assert.equal(npc(floor(s, text, tr({ 林夏: ['兽人'] }))).bars.stamina, 78);
    assert.equal(npc(floor(s, text, tr({ 林夏: ['哨兵'] }))).bars.stamina, 85);
});

test('式神：主人（契约者）在场时体力消耗减半；不在场不变', () => {
    const s = world({ 林夏: mk(), 阿雪: mk() });
    const t = tr({ 林夏: ['式神'], 阿雪: ['契约者'] });
    const text = '[igs-stat:stamina|林夏|重][igs-stat:favor|阿雪|平淡]';
    assert.equal(npc(floor(s, text, t, { present: ['林夏', '阿雪'] })).bars.stamina, 85);
    assert.equal(npc(floor(s, '[igs-stat:stamina|林夏|重]', t, { present: ['林夏'] })).bars.stamina, 70);
});

test('使魔：主人压力上升大时压力同步小升，小档不触发', () => {
    const s = world({ 林夏: mk({}, { stress: 0 }), 阿雪: mk() });
    const t = tr({ 林夏: ['使魔'], 阿雪: ['契约者'] });
    assert.equal(npc(floor(s, '[igs-stat:stress|阿雪|上升|大]', t)).bars.stress, 5);
    assert.equal(npc(floor(s, '[igs-stat:stress|阿雪|上升|小]', t)).bars.stress, 0);
});

test('哨兵与结合向导：向导在场时压力不上升，且再下降一大档', () => {
    const s = world({ 林夏: mk({}, { stress: 40 }), 向晚: mk() });
    const t = tr({ 林夏: ['哨兵', '精神结合'], 向晚: ['向导', '精神结合'] });
    const r = floor(s, '[igs-stat:stress|林夏|上升|中]', t, { present: ['林夏', '向晚'] });
    assert.equal(npc(r).bars.stress, 20);
});

test('哨兵：战斗场景压力上升 x1.5', () => {
    const s = world({ 林夏: mk({}, { stress: 0 }) });
    const r = floor(s, '[igs-stat:stress|林夏|上升|中][igs-stat:battle|杂兵|1]', tr({ 林夏: ['哨兵'] }));
    assert.equal(npc(r).bars.stress, 15);
});

test('精神结合：一方压力上升大，另一方压力小升（双向）', () => {
    const s = world({ 林夏: mk({}, { stress: 0 }) }, { stress: 0 });
    const t = tr({ 林夏: ['精神结合'] });
    assert.equal(npc(floor(s, '[igs-stat:stress|上升|大]', t)).bars.stress, 5);
    assert.equal(hero(floor(s, '[igs-stat:stress|林夏|上升|大]', t)).stress, 5);
    assert.equal(npc(floor(s, '[igs-stat:stress|上升|中]', t)).bars.stress, 0);
});

test('蛋糕叉：叉子进食体力回复减半', () => {
    const s = world({ 林夏: mk({}, { stamina: 50 }) });
    const r = floor(s, '[igs-stat:stamina|林夏|进食]', tr({ 林夏: ['叉子'] }));
    assert.equal(npc(r).bars.stamina, 55);
});

test('蛋糕叉：主角为蛋糕、叉子在场时叉子欲望上升加倍', () => {
    const s = world({ 林夏: mk({ dims: { 欲望: 10 } }) });
    const t = { ...tr({ 林夏: ['叉子'] }), 主角: { [getTraitByName('蛋糕').id]: on } };
    const text = '[igs-stat:desire|林夏|上升]';
    const base = npc(floor(s, text)).dims.欲望 - 10;
    const here = floor(s, text, t, { present: ['林夏'] });
    assert.ok(base > 0);
    assert.equal(npc(here).dims.欲望 - 10, base * 2);
});

test('蛋糕叉：叉子与蛋糕亲密，体力回复一大档、压力下降一小档', () => {
    const s = world({ 林夏: mk({}, { stamina: 50, stress: 20 }) });
    const t = { ...tr({ 林夏: ['叉子'] }), 主角: { [getTraitByName('蛋糕').id]: on } };
    const r = floor(s, '[igs-stat:intimate|林夏|轻]', t);
    assert.ok(npc(r).bars.stamina > 60, '亲密先扣再回一大档');
    assert.equal(npc(r).bars.stress, 15);
});

test('主从契约：信任不下降；从者芥蒂上升减半', () => {
    const s = world({ 林夏: mk({ dims: { 信任: 30 } }) });
    const t = tr({ 林夏: ['主从契约', '式神'] });
    assert.equal(npc(floor(s, '[igs-stat:trust|林夏|下降|大]', t)).dims.信任, 30);
    assert.ok(npc(floor(s, '[igs-stat:trust|林夏|下降|大]')).dims.信任 < 30);
    const g = floor(s, '[igs-stat:grudge|林夏|上升|大]', t);
    const plain = floor(s, '[igs-stat:grudge|林夏|上升|大]');
    assert.ok(npc(g).dims.芥蒂 < npc(plain).dims.芥蒂);
});

test('失忆：获得时了解暂存清零好感保留；失去时恢复为较高值', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40, 了解: 30 } }) });
    const t = tr({ 林夏: ['失忆'] });
    const a = floor(s, '[igs-stat:favor|林夏|平淡]', t);
    assert.equal(npc(a).dims.了解, 0);
    assert.equal(npc(a).dims.好感, 40);
    assert.deepEqual(npc(a).relStates.失忆, { stash: 30 });
    assert.equal(s.characters.林夏.relStates, undefined, '不原地改');
    const b = floor(a.state, '[igs-stat:favor|林夏|平淡]', {});
    assert.equal(npc(b).dims.了解, 30);
    assert.equal(npc(b).relStates, undefined);
    const c = { ...a.state, characters: { 林夏: { ...npc(a), dims: { ...npc(a).dims, 了解: 45 } } } };
    assert.equal(npc(floor(c, '[igs-stat:favor|林夏|平淡]', {})).dims.了解, 45);
});

test('伪装身份：了解上限 50，失去后解除', () => {
    const s = world({ 林夏: mk({ dims: { 了解: 49 } }) });
    const t = tr({ 林夏: ['伪装身份'] });
    const text = '[igs-stat:know|林夏|上升|大][igs-stat:know|林夏|上升|大][igs-stat:know|林夏|上升|大]';
    const free = floor(s, text);
    const r = floor(s, text, t);
    assert.ok(npc(free).dims.了解 > 50);
    assert.equal(npc(r).dims.了解, 50);
});

test('已故：日结算冻结好感冷却与芥蒂消退', () => {
    const s = world({ 林夏: mk({ dims: { 好感: 40, 芥蒂: 40 }, lastSeenDay: 1 }) });
    const at = { ...s, clock: { ...s.clock, day: 10 } };
    const live = settleDay(at, { random: high, rev: 2, traits: {}, nsfw: true });
    assert.ok(live.characters.林夏.dims.好感 < 40, '无已故：冷却');
    const dead = settleDay(at, { random: high, rev: 2, traits: tr({ 林夏: ['已故'] }), nsfw: true });
    assert.equal(dead.characters.林夏.dims.好感, 40);
    assert.equal(dead.characters.林夏.dims.芥蒂, 40);
});

test('认出蛋糕：叉子在场且好感未到喜欢，每天蛋糕压力缓升；到喜欢后不再', () => {
    const t = tr({ 林夏: ['认出蛋糕'] });
    const low = world({ 林夏: mk({ dims: { 好感: 10 }, lastSeenDay: 1 }) }, { stress: 0 });
    assert.equal(settleDay(low, { random: high, rev: 2, traits: t, nsfw: true, present: ['林夏'] }).protagonist.bars.stress, 3);
    const liked = world({ 林夏: mk({ dims: { 好感: 30 }, lastSeenDay: 1 }) }, { stress: 0 });
    assert.equal(settleDay(liked, { random: high, rev: 2, traits: t, nsfw: true, present: ['林夏'] }).protagonist.bars.stress, 0);
});

test('血仆：主人（吸血鬼）在场时每天压力下降', () => {
    const t = tr({ 林夏: ['血仆'], 夜宵: ['吸血鬼'] });
    const s = world({ 林夏: mk({}, { stress: 60 }), 夜宵: mk() });
    const here = settleDay(s, { random: high, rev: 2, traits: t, nsfw: true, present: ['林夏', '夜宵'] });
    const away = settleDay(s, { random: high, rev: 2, traits: t, nsfw: true, present: ['林夏'] });
    assert.equal(here.characters.林夏.bars.stress, away.characters.林夏.bars.stress - 3);
});
