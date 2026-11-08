// E3 特质改名：旧键读档换新名；淡泊并入佛系；拼命三郎并入卷王；规则按新名生效。
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_RENAME, getTraitDef, hasTrait, sanitizeTraits, traitCatalogOf } from '../src/scene/stats/stat-traits.js';
import { TRAIT_RECIPES } from '../src/scene/stats/stat-trait-recipes.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';

const on = { on: true, src: 'manual' };
const high = () => 0.99;
const PAIRS = {
    多疑: '疑心病', 外向: 'e人', 内向: 'i人', 敏感: '玻璃心', 迟钝: '木头人', 专一: '纯爱战士', 务实: '现实派', 浪漫: '浪漫主义者', 害羞: '害羞鬼', 慕强: '慕强者', 薄情: '冷血',
    勤奋: '努力家', 不讨喜: '万人嫌', 人见人爱: '团宠', 千杯不醉: '酒仙', 贵人相助: '福星', 生财有道: '财迷', 不善营生: '穷光蛋', 精打细算: '持家能手', 爱撒娇: '撒娇精',
    占有欲强: '占有狂', 忘恩负义: '白眼狼', 购物解压: '购物狂', 运动解压: '运动狂', 睡一觉就好: '睡神', 存款即安全感: '存钱党', 化悲愤为食欲: '暴食党', 怕痛: '怕疼鬼',
    恐高: '恐高症', 幽闭: '幽闭恐惧症', 心大: '不拘小节', 嘴笨: '不善言辞', 越累越清醒: '铁人', 压力变动力: '抗压王', 不愿亏欠: '恩怨分明', 无欲无求: '性冷淡',
};

test('旧名旧档读出新名，不带 label，旧名不再是登记项', () => {
    for (const [old, now] of Object.entries(PAIRS)) {
        const out = sanitizeTraits({ 甲: { [old]: { on: true, src: 'manual' } } });
        assert.ok(out.甲[now], `${old}→${now}`);
        assert.equal(out.甲[now].label, undefined, now);
        assert.equal(getTraitDef(old), null, `${old} 已改名`);
        assert.ok(getTraitDef(now), now);
    }
});

test('淡泊读作佛系；拼命三郎读作工作狂；好胜保留并与佛系互斥', () => {
    assert.ok(sanitizeTraits({ 甲: { 淡泊: on } }).甲.佛系);
    assert.ok(sanitizeTraits({ 甲: { 拼命三郎: on } }).甲.工作狂);
    assert.equal(LEGACY_RENAME.淡泊, '佛系');
    assert.equal(getTraitDef('淡泊'), null);
    assert.equal(getTraitDef('拼命三郎'), null);
    assert.ok(getTraitDef('好胜'));
    assert.ok(getTraitDef('佛系').exclusive.includes(getTraitByName('好胜').id));
});

test('卷王带可透支体力：旧档拼命三郎→工作狂，合成卷王后体力扣到 0 不力竭', () => {
    const recipe = TRAIT_RECIPES.find((r) => r.name === '卷王');
    assert.ok(recipe.effect.text.includes('可透支体力'));
    const t = { 主角: { 'combo:卷王': { on: true, src: 'manual', parts: ['工作狂', '好胜', '完美主义者'] } } };
    const base = { ...createStatsState(), characters: {} };
    base.protagonist = { ...base.protagonist, bars: { ...base.protagonist.bars, stamina: 10 } };
    const r = settleFloorText(base, '[igs-stat:stamina|重]', { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits: t });
    assert.equal(r.meta.flags.forcedRest, undefined);
    assert.equal(r.state.clock.overdrawDay, r.state.clock.day);
    assert.equal(settleDay(r.state, { random: high, rev: 2, traits: t, nsfw: true }).protagonist.bars.stamina, 70);
    const alone = { 主角: { 工作狂: on } };
    assert.equal(settleFloorText(base, '[igs-stat:stamina|重]', { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits: alone }).meta.flags.forcedRest, true);
});

test('规则按新名生效：玻璃心加快下降、佛系撤销挑战压力、性冷淡欲望不升', () => {
    const npc = () => { const b = createCharacter(1, { nsfw: true }); return { ...createStatsState(), characters: { 林夏: { ...b, dims: { ...b.dims, 好感: 30, 信任: 30 } } } }; };
    const run = (name) => settleFloorText(npc(), '[igs-stat:favor|林夏|失望|中]', { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits: { 林夏: { [getTraitByName(name).id]: on } } }).state.characters.林夏.dims.好感;
    assert.ok(run('玻璃心') < run('木头人'));
    const cold = settleFloorText(npc(), '[igs-stat:desire|林夏|上升|中]', { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits: { 林夏: { [getTraitByName('性冷淡').id]: on } } });
    assert.equal(cold.state.characters.林夏.dims.欲望, npc().characters.林夏.dims.欲望);
    const cat = traitCatalogOf({ 主角: { 佛系: on } }, true);
    assert.equal(hasTrait(null, cat, '主角', '佛系'), true);
});

test('性冷淡与禁欲并存，说明各写明区别', () => {
    assert.match(getTraitDef('性冷淡').desc, /禁欲/);
    assert.match(getTraitDef('禁欲').desc, /性冷淡/);
});
