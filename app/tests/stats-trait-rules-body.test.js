// 特质规则（体质、生存、养成、成就）：直接驱动 settleTraitTags / dailyTraitPass 钩子，环境类用自带 ctx 注入天气与地点。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { dailyTraitPass, settleTraitTags } from '../src/scene/stats/stat-trait-hooks.js';
import { ACHIEVEMENT_DEFS, getTraitByName, traitCatalogOf, traitDice, traitScale } from '../src/scene/stats/stat-traits.js';
import { ACHIEVEMENT_RULES, checkAchievements, updateAchievementCounters } from '../src/scene/stats/stat-trait-rules-body.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { DEFAULT_MONEY_TABLE } from '../src/scene/stats/stat-bars.js';

const high = () => 0.99;
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const hero = (...names) => traitsFor('主角', ...names);
const base = (bars = {}, patch = {}) => {
    const s = createStatsState();
    return { ...s, ...patch, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...bars } } };
};
const withNpc = (state, bars = {}, dims = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...state, characters: { 林夏: { ...c, dims: { ...c.dims, ...dims }, bars: { ...c.bars, ...bars } } } };
};
// 先把「本楼已记的变动」放进 changes，再跑钩子；返回 { state, changes }。
function tags(state, traits, { directives = [], seed = [], ctx = {} } = {}) {
    const changes = [...seed];
    const full = { traits, nsfw: true, changes, flags: {}, moneyTable: DEFAULT_MONEY_TABLE, present: [], ...ctx };
    const next = settleTraitTags(state, directives, full);
    return { state: next, changes, flags: full.flags };
}
const stamina = (r, name = '主角') => (name === '主角' ? r.state.protagonist.bars : r.state.characters[name].bars).stamina;
const spend = (from, to, note, target = '主角') => ({ source: 'tag', target, key: 'stamina', from, to, note });
const mealClock = () => ({ ...createStatsState().clock, day: 5, mealDays: { 主角: 1 } });

// ---- 体质 ----

test('病秧子：体力消耗 ×1.5', () => {
    const r = tags(base({ stamina: 85 }), hero('病秧子'), { seed: [spend(100, 85, '中')] });
    assert.equal(stamina(r), 77);
});

test('强健：体力消耗 ×0.5', () => {
    const r = tags(base({ stamina: 70 }), hero('强健'), { seed: [spend(100, 70, '重')] });
    assert.equal(stamina(r), 85);
});

test('魅魔体质：亲密时回复体力而非消耗', () => {
    const r = tags(base({ stamina: 90 }), hero('魅魔体质'), { seed: [spend(100, 90, '亲密')] });
    assert.equal(stamina(r), 100);
});

test('不眠：熬夜无体力代价，熬夜标记清除，兜底入睡被剔除', () => {
    const state = { ...base({ stamina: 80 }), clock: { ...createStatsState().clock, stayedUp: true } };
    const directives = [{ kind: 'sleep', fallback: true }, { kind: 'sleep' }];
    const r = tags(state, hero('不眠'), { seed: [spend(100, 80, '熬夜')], directives });
    assert.equal(stamina(r), 100);
    assert.equal(r.state.clock.stayedUp, false);
    assert.equal(directives.length, 2, '不原地改 directives');
});

// ---- 生存 ----

test('耐饿：漏餐不扣体力；易饿：漏餐体力下降', () => {
    const run = (names) => dailyTraitPass({ ...base({ stamina: 100 }), clock: mealClock() }, { traits: hero(...names), nsfw: true }, []).protagonist.bars.stamina;
    assert.equal(run(['耐饿']), 100);
    assert.equal(run(['易饿']), 90);
    assert.equal(run([]), 100);
});

test('浅眠 / 瞌睡虫：入睡回复减半 / 加倍', () => {
    const run = (name) => settleDay(base({ stamina: 40 }), { random: high, rev: 2, traits: hero(name), nsfw: true }).protagonist.bars.stamina;
    assert.equal(run('浅眠'), 70);
    assert.equal(run('瞌睡虫'), 100);
});

test('耐痛：受伤那一楼压力上升撤销；怕痛：额外上升', () => {
    const seed = [{ source: 'tag', target: '主角', key: 'stress', from: 0, to: 10, note: '上升' }];
    const directives = [{ kind: 'hurt', value: '轻伤' }];
    assert.equal(tags(base({ stress: 10 }), hero('耐痛'), { seed, directives }).state.protagonist.bars.stress, 0);
    assert.equal(tags(base({ stress: 10 }), hero('怕痛'), { seed, directives }).state.protagonist.bars.stress, 15);
});

test('耐痛：重伤时体力扣减减半', () => {
    const r = tags(base({ stamina: 70 }), hero('耐痛'), { seed: [spend(100, 70, '战斗败')], directives: [{ kind: 'hurt', value: '重伤' }] });
    assert.equal(stamina(r), 85);
});

test('耐寒 / 耐热：天气带寒冷、炎热字样时体力扣减减半；读不到天气则不生效', () => {
    const seed = [spend(100, 80, '中')];
    assert.equal(stamina(tags(base({ stamina: 80 }), hero('耐寒'), { seed, ctx: { weather: '大雪' } })), 90);
    assert.equal(stamina(tags(base({ stamina: 80 }), hero('耐寒'), { seed })), 80);
    assert.equal(stamina(tags(base({ stamina: 80 }), hero('耐热'), { seed, ctx: { weather: '炎热' } })), 90);
    assert.equal(stamina(tags(base({ stamina: 80 }), hero('耐热'), { seed, ctx: { weather: '大雪' } })), 80);
});

test('恐高 / 怕黑 / 幽闭：对应地点压力缓升，每天只记一次；读不到地点不生效', () => {
    for (const [name, place] of [['恐高', '楼顶天台'], ['怕黑', '漆黑的地下室'], ['幽闭', '狭窄的电梯']]) {
        const r = tags(base(), hero(name), { ctx: { place } });
        assert.equal(r.state.protagonist.bars.stress, 3, name);
        assert.equal(tags(r.state, hero(name), { ctx: { place } }).state.protagonist.bars.stress, 3, `${name} 同日不重复`);
        assert.equal(tags(base(), hero(name)).state.protagonist.bars.stress, 0, `${name} 无地点`);
    }
});

test('野外生存：野外漏餐不扣体力（读不到地点则照扣）', () => {
    const run = (place) => dailyTraitPass({ ...base({ stamina: 100 }), clock: mealClock() }, { traits: hero('易饿', '野外生存'), nsfw: true, place }, []).protagonist.bars.stamina;
    assert.equal(run('野外森林'), 100);
    assert.equal(run(undefined), 90);
});

test('旧伤：阴雨天与剧烈运动体力额外下降；晴天无事', () => {
    assert.equal(stamina(tags(base({ stamina: 90 }), hero('旧伤'), { ctx: { weather: '阴雨' } })), 85);
    assert.equal(stamina(tags(base({ stamina: 90 }), hero('旧伤'), { ctx: { weather: '晴' } })), 90);
    assert.equal(stamina(tags(base({ stamina: 90 }), hero('旧伤'), { directives: [{ kind: 'stamina', value: '重' }] })), 85);
});

// ---- 养成 ----

test('精打细算：花钱 ×0.75（退回四分之一）；败家子：花钱 ×1.5', () => {
    const seed = [{ source: 'tag', target: '主角', key: 'money', from: 1000, to: 900, note: '普通' }];
    assert.equal(tags(base({ money: 900 }), hero('精打细算'), { seed }).state.protagonist.bars.money, 925);
    assert.equal(tags(base({ money: 900 }), hero('败家子'), { seed }).state.protagonist.bars.money, 850);
});

test('败家子：每天金钱自动小减，没钱不再减', () => {
    assert.equal(dailyTraitPass(base({ money: 100 }), { traits: hero('败家子'), nsfw: true }, []).protagonist.bars.money, 95);
    assert.equal(dailyTraitPass(base({ money: 0 }), { traits: hero('败家子'), nsfw: true }, []).protagonist.bars.money, 0);
});

test('生财有道 / 不善营生：打工收入高一档 / 低一档', () => {
    const flags = { work: { income: '普通' } };
    const run = (name) => tags(base({ money: 100 }), hero(name), { ctx: { flags } }).state.protagonist.bars.money;
    assert.equal(run('生财有道'), 500);
    assert.equal(run('不善营生'), 20);
});

test('话痨 / 嘴笨：社交类检定多一个奖励骰 / 惩罚骰', () => {
    const state = base();
    assert.equal(traitDice(state, traitCatalogOf(hero('话痨')), '主角', '社交'), 1);
    assert.equal(traitDice(state, traitCatalogOf(hero('嘴笨')), '主角', '社交'), -1);
    assert.equal(traitDice(state, traitCatalogOf(hero('话痨')), '主角', '战斗'), 0);
});

test('人见人爱 / 不讨喜：主角挂，角色好感上升 ×1.2 / ×0.8', () => {
    const seed = [{ source: 'tag', target: '林夏', key: '好感', from: 10, to: 20, note: '开心' }];
    const mk = () => withNpc(base(), {}, { 好感: 20 });
    assert.equal(tags(mk(), hero('人见人爱'), { seed }).state.characters.林夏.dims.好感, 22);
    assert.equal(tags(mk(), hero('不讨喜'), { seed }).state.characters.林夏.dims.好感, 18);
});

test('社恐：对方好感无感以下时，好感与信任上升减半', () => {
    const seed = [
        { source: 'tag', target: '林夏', key: '好感', from: 0, to: 4, note: '开心' },
        { source: 'tag', target: '林夏', key: '信任', from: 0, to: 6, note: '开心' },
    ];
    const r = tags(withNpc(base(), {}, { 好感: 4, 信任: 6 }), hero('社恐'), { seed });
    assert.equal(r.state.characters.林夏.dims.好感, 2);
    assert.equal(r.state.characters.林夏.dims.信任, 3);
});

test('大胃王：进食回复加倍；漏餐额外下降', () => {
    const r = tags(base({ stamina: 60 }), hero('大胃王'), { seed: [spend(50, 60, '进食')] });
    assert.equal(stamina(r), 70);
    assert.equal(dailyTraitPass({ ...base({ stamina: 100 }), clock: mealClock() }, { traits: hero('大胃王'), nsfw: true }, []).protagonist.bars.stamina, 95);
});

test('早起鸟 / 夜猫子：熬夜消耗加倍 / 减半；早起鸟入睡略多', () => {
    const seed = [spend(100, 80, '熬夜')];
    assert.equal(stamina(tags(base({ stamina: 80 }), hero('早起鸟'), { seed })), 60);
    assert.equal(stamina(tags(base({ stamina: 80 }), hero('夜猫子'), { seed })), 90);
    assert.equal(settleDay(base({ stamina: 40 }), { random: high, rev: 2, traits: hero('早起鸟'), nsfw: true }).protagonist.bars.stamina, 100);
});

test('学霸：学习类技能成长涨幅加一；懒虫：两天内第二次成长作废', () => {
    const skills = { 学习: { value: 50, marked: true }, 运动: { value: 50, marked: true } };
    const mk = (clock = {}) => ({ ...createStatsState(), protagonist: { ...createStatsState().protagonist, skills }, clock: { ...createStatsState().clock, ...clock } });
    const low = () => 0.01;
    const plain = settleDay(mk(), { random: low, rev: 2, traits: {}, nsfw: true }).protagonist.skills;
    const smart = settleDay(mk(), { random: low, rev: 2, traits: hero('学霸'), nsfw: true }).protagonist.skills;
    assert.equal(smart.学习.value, plain.学习.value + 1);
    assert.equal(smart.运动.value, plain.运动.value);
    const lazy = settleDay(mk({ growDay: 1 }), { random: low, rev: 2, traits: hero('懒虫'), nsfw: true }).protagonist.skills;
    assert.equal(lazy.学习.value, 50);
});

// ---- 成就 ----

test('成就规则与登记表一致', () => {
    assert.deepEqual(ACHIEVEMENT_RULES.map((r) => [r.id, r.counter, r.need]), ACHIEVEMENT_DEFS.map((d) => [d.id, d.counter, d.need]));
});

test('checkAchievements：按计数授予，已拥有的不重复', () => {
    assert.deepEqual(checkAchievements({ workWins: 10, battleWins: 9, skillMax: 80 }, []), ['熟练工', '一技之长']);
    assert.deepEqual(checkAchievements({ workWins: 12, romances: 3 }, ['熟练工']), ['情场老手']);
    assert.deepEqual(checkAchievements({}, new Set()), []);
});

test('updateAchievementCounters：打工、战斗、技能、恋爱、连续天数累计', () => {
    const s = base();
    const state = { ...s, protagonist: { ...s.protagonist, skills: { a: { value: 85 }, b: { value: 60 }, c: { value: 20 } } }, clock: { ...s.clock, sturdyStreak: 4 }, characters: { 林夏: { ...createCharacter(1), romance: true } } };
    const c = updateAchievementCounters({ workWins: 9 }, state, { flags: { work: { tier: '普通成功' }, battle: { outcome: '胜' } } });
    assert.deepEqual(c, { workWins: 10, battleWins: 1, skillMax: 85, skill60: 2, romances: 1, sturdyDays: 4 });
});

test('铁打的身体：连续体力未低于一半的天数累计，低于一半则清零；效果等同强健', () => {
    const nextDay = (s) => dailyTraitPass({ ...s, clock: { ...s.clock, day: s.clock.day + 1 } }, { traits: {}, nsfw: true }, []);
    let s = base({ stamina: 100 });
    for (let i = 0; i < 3; i += 1) s = nextDay(s);
    assert.equal(s.clock.sturdyStreak, 3);
    s = nextDay({ ...s, clock: { ...s.clock, lowStaminaDay: s.clock.day } });
    assert.equal(s.clock.sturdyStreak, 0);
    const r = tags(base({ stamina: 70 }), hero('铁打的身体'), { seed: [spend(100, 70, '重')] });
    assert.equal(stamina(r), 85);
});

test('熟练工：打工收入高一档；小有积蓄：每天利息；劫后余生：压力上升 ×0.5', () => {
    assert.equal(tags(base({ money: 100 }), hero('熟练工'), { ctx: { flags: { work: { income: '普通' } } } }).state.protagonist.bars.money, 500);
    assert.equal(dailyTraitPass(base({ money: 100 }), { traits: hero('小有积蓄'), nsfw: true }, []).protagonist.bars.money, 105);
    assert.equal(traitScale(base(), traitCatalogOf(hero('劫后余生')), '主角', '压力', 'up'), 0.5);
});

test('一技之长：技能值 ≥ 80 的检定多一个奖励骰；情场老手：约会类检定多一个奖励骰', () => {
    const cat = traitCatalogOf(hero('一技之长', '情场老手'));
    assert.equal(traitDice(base(), cat, '主角', '社交', { skillValue: 85 }), 1);
    assert.equal(traitDice(base(), cat, '主角', '社交', { skillValue: 60 }), 0);
    assert.equal(traitDice(base(), cat, '主角', '约会'), 1);
});
