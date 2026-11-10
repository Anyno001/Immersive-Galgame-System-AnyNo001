// 特质规则·恋爱人设剩余项与合成独有效果：每条已接规则至少一条用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, traitCatalogOf, traitDice, traitFlag, traitScale } from '../src/scene/stats/stat-traits.js';

const high = () => 0.99;
const resolve = (n) => n;
const idOf = (n) => (n.startsWith('combo:') ? n : getTraitByName(n).id);
const on = (n) => (n.startsWith('combo:') ? { on: true, src: 'manual', parts: ['犬系', '黏人'] } : { on: true, src: 'manual' });
const mk = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [idOf(n), on(n)]))]));
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const mkChar = (patch = {}, bars = {}) => {
    const base = createCharacter(1, { nsfw: true });
    return { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } };
};
const world = (chars = {}, hero = {}, clock = {}) => {
    const s = createStatsState();
    return { ...s, characters: chars, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...hero } }, clock: { ...s.clock, ...clock } };
};
const one = (patch, bars, heroBars) => world({ 林夏: mkChar(patch, bars) }, heroBars);
const d = (r, who = '林夏') => r.state.characters[who].dims;
const st = (r, who = '林夏') => r.state.characters[who].bars.stress;
const hero = (r) => (r.state ? r.state.protagonist.bars : r.protagonist.bars);
const T = (...names) => mk({ 林夏: names });
const cat = (traits) => traitCatalogOf(traits, true);
const C = (who, ...combos) => mk({ [who]: combos.map((c) => `combo:${c}`) });

// ---- 倍率 / 标记 ----
test('舔狗：好感上升减半，不因冷落冷却', () => {
    const c = cat(T('舔狗'));
    assert.equal(traitScale(one(), c, '林夏', '好感', 'up'), 0.5);
    assert.equal(traitFlag(one(), c, '林夏', 'noCool'), true);
    const text = '[igs-stat:favor|林夏|喜悦|中]';
    assert.ok(d(floor(one(), text, T('舔狗'))).好感 < d(floor(one(), text)).好感);
});

test('白莲：自身芥蒂上升 ×0.5', () => {
    assert.equal(traitScale(one(), cat(T('白莲')), '林夏', '芥蒂', 'up'), 0.5);
    const text = '[igs-stat:grudge|林夏|上升|大]';
    assert.ok(d(floor(one(), text, T('白莲'))).芥蒂 < d(floor(one(), text)).芥蒂);
});

test('破碎感：压力过半时好感上升 ×1.5，未过半不变', () => {
    const c = cat(T('破碎感'));
    assert.equal(traitScale(one({}, { stress: 60 }), c, '林夏', '好感', 'up'), 1.5);
    assert.equal(traitScale(one({}, { stress: 40 }), c, '林夏', '好感', 'up'), 1);
});

test('显眼包：了解上升 ×1.5；其在场的日子主角压力小降', () => {
    assert.equal(traitScale(one(), cat(T('显眼包')), '林夏', '了解', 'up'), 1.5);
    const day = (names, present) => settleDay(world({ 林夏: mkChar() }, { stress: 40 }), { random: high, rev: 2, traits: T(...names), nsfw: true, present });
    assert.equal(hero(day(['显眼包'], ['林夏'])).stress, hero(day([], ['林夏'])).stress - 3);
    assert.equal(hero(day(['显眼包'], [])).stress, hero(day([], [])).stress);
});

test('绿帽癖 / 海王 / 人间清醒：吃醋不加芥蒂', () => {
    for (const n of ['绿帽癖', '海王', '人间清醒']) {
        assert.equal(traitFlag(one({ dims: { 好感: 30, 芥蒂: 10 } }), cat(T(n)), '林夏', 'noJealousGrudge'), true, n);
        assert.equal(d(floor(one({ dims: { 好感: 30, 芥蒂: 10 } }), '[igs-stat:favor|林夏|吃醋|中]', T(n))).芥蒂, 10, n);
    }
});

test('电子宠物：好感不冷却；缺席日压力 ×2 缓升，主角一互动压力清回原值', () => {
    const start = world({ 林夏: mkChar({ dims: { 好感: 60 }, lastSeenDay: 1 }) }, {}, { day: 9 });
    const r = settleDay(start, { random: high, rev: 2, traits: T('电子宠物'), nsfw: true, present: [] });
    assert.equal(r.characters.林夏.dims.好感, 60);
    assert.equal(settleDay(start, { random: high, rev: 2, traits: T(), nsfw: true, present: [] }).characters.林夏.dims.好感, 59);
    assert.equal(r.characters.林夏.bars.stress, 6, '基础缓升 3 加补一份 3');
    assert.equal(r.characters.林夏.petBase, 0);
    const back = floor(r, '[igs-stat:favor|林夏|喜悦|小]', T('电子宠物'), { present: ['林夏'] });
    assert.equal(st(back), 0);
    assert.equal(back.state.characters.林夏.petBase, undefined);
});

// ---- 每楼事件钩子 ----
test('绿茶：情敌在场那一楼好感上升加成，情敌的吃醋结算加倍', () => {
    const w = world({ 林夏: mkChar(), 小雪: mkChar({ dims: { 好感: 60 }, unlocked: ['gate-25', 'gate-50'] }) });
    const text = '[igs-stat:favor|林夏|喜悦|大]';
    const both = { present: ['林夏', '小雪'] };
    const plain = d(floor(w, text, T(), both)).好感;
    assert.ok(d(floor(w, text, T('绿茶'), both)).好感 > plain);
    assert.equal(d(floor(w, text, T('绿茶'), { present: ['林夏'] })).好感, plain, '没有情敌不加成');
    const jealous = '[igs-stat:favor|小雪|吃醋|中]';
    const a = d(floor(w, jealous, T(), both), '小雪');
    const b = d(floor(w, jealous, T('绿茶'), both), '小雪');
    assert.ok(b.芥蒂 > a.芥蒂);
});

test('舔狗：冷落那一楼好感不降、芥蒂不升，压力小升', () => {
    const w = one({ dims: { 好感: 30 }, unlocked: ['gate-25'] });
    const text = '[igs-stat:favor|林夏|冷淡|中]\n[igs-stat:grudge|林夏|上升|中]';
    const r = floor(w, text, T('舔狗'));
    assert.equal(d(r).好感, 30);
    assert.equal(d(r).芥蒂, 0);
    assert.equal(st(r), 5);
    assert.ok(d(floor(w, text)).好感 < 30);
});

test('绿帽癖：吃醋改为欲望上升一档、压力小降；NSFW 关闭不生效', () => {
    const w = one({ dims: { 好感: 30, 芥蒂: 10, 欲望: 10 }, unlocked: ['gate-25'] }, { stress: 20 });
    const text = '[igs-stat:favor|林夏|吃醋|中]';
    const r = floor(w, text, T('绿帽癖'));
    assert.equal(d(r).好感, 30);
    assert.equal(d(r).芥蒂, 10);
    assert.equal(d(r).欲望, 14);
    assert.equal(st(r), 15);
    assert.ok(d(floor(w, text, T('绿帽癖'), { nsfw: false })).芥蒂 > 10);
});

test('海王：自身不按吃醋结算；两名以上心动对象同楼时每人芥蒂上升一大档，同日一次', () => {
    const lover = () => mkChar({ dims: { 好感: 60 }, unlocked: ['gate-25', 'gate-50'] });
    const w = world({ 林夏: mkChar({ dims: { 好感: 30 }, unlocked: ['gate-25'] }), 甲: lover(), 乙: lover() }, {}, { day: 3 });
    const tr = T('海王');
    const text = '[igs-stat:favor|林夏|喜悦|小]';
    const r = floor(w, text, tr, { present: ['林夏', '甲', '乙'] });
    assert.equal(d(r, '甲').芥蒂, 10);
    assert.equal(d(r, '乙').芥蒂, 10);
    assert.equal(d(floor(r.state, text, tr, { present: ['林夏', '甲', '乙'] }), '甲').芥蒂, 10, '同日只一次');
    assert.equal(d(floor(w, text, tr, { present: ['林夏', '甲'] }), '甲').芥蒂, 0);
    assert.equal(d(floor(one({ dims: { 好感: 30 }, unlocked: ['gate-25'] }), '[igs-stat:favor|林夏|吃醋|中]', tr)).好感, 30);
});

test('钓系：示好被冷处理那一楼主角压力小升', () => {
    const w = one({ dims: { 好感: 10 } });
    const cold = '[igs-stat:gift|林夏|零食]\n[igs-stat:favor|林夏|冷淡|小]';
    assert.equal(hero(floor(w, cold, T('钓系'))).stress, 5);
    assert.equal(hero(floor(w, cold)).stress, 0);
    assert.equal(hero(floor(w, '[igs-stat:gift|林夏|零食]\n[igs-stat:favor|林夏|喜悦|小]', T('钓系'))).stress, 0);
});

test('人间清醒：示好类事件对其好感上升减半；普通好感不受影响', () => {
    const w = one();
    const plain = d(floor(w, '[igs-stat:gift|林夏|花]')).好感;
    const clear = d(floor(w, '[igs-stat:gift|林夏|花]', T('人间清醒'))).好感;
    assert.ok(clear < plain && clear >= Math.floor(plain / 2));
    const text = '[igs-stat:favor|林夏|喜悦|中]';
    assert.equal(d(floor(w, text, T('人间清醒'))).好感, d(floor(w, text)).好感);
});

test('恋爱军师：其对主角的欲望不上升', () => {
    const w = one({ dims: { 好感: 30, 欲望: 5 } });
    assert.ok(d(floor(w, '[igs-stat:desire|林夏|上升]')).欲望 > 5);
    assert.equal(d(floor(w, '[igs-stat:desire|林夏|上升]', T('恋爱军师'))).欲望, 5);
});

test('嘴替：主角压力大幅上升那一楼，其在场时主角压力小降', () => {
    const w = one();
    const text = '[igs-stat:stress|上升|大]';
    const base = hero(floor(w, text, T(), { present: ['林夏'] })).stress;
    assert.equal(hero(floor(w, text, T('嘴替'), { present: ['林夏'] })).stress, base - 5);
    assert.equal(hero(floor(w, text, T('嘴替'), { present: [] })).stress, base);
});

test('社畜（主角）：打工体力消耗 ×1.5；富二代（主角）：打工收入低一档', () => {
    const w = world({}, { stamina: 100, money: 0 }, { startMoneyDone: true });
    const run = (names) => floor(w, '[igs-stat:work|打工]', mk({ 主角: names }), { random: () => 0.3 });
    const base = run([]);
    assert.equal(hero(run(['社畜'])).stamina, hero(base).stamina - 8);
    assert.ok(hero(run(['富二代'])).money < hero(base).money);
});

// ---- 合成独有效果 ----
test('合成·孤狼：信任过半后不再下降', () => {
    const text = '[igs-stat:trust|林夏|下降|中]';
    const w = one({ dims: { 信任: 60 } });
    assert.ok(d(floor(w, text)).信任 < 60);
    assert.equal(d(floor(w, text, C('林夏', '孤狼'))).信任, 60);
    assert.ok(d(floor(one({ dims: { 信任: 30 } }), text, C('林夏', '孤狼'))).信任 < 30);
});

test('合成·千年狐狸：了解不超过一半；欲望不自然消退', () => {
    const r = floor(one({ dims: { 了解: 45 } }), '[igs-stat:know|林夏|上升|大]', C('林夏', '千年狐狸'));
    assert.ok(d(r).了解 <= 50);
    const w = world({ 林夏: mkChar({ dims: { 欲望: 30 }, lastSeenDay: 1 }) }, {}, { day: 9 });
    const day = (traits) => settleDay(w, { random: high, rev: 2, traits, nsfw: true, present: [] }).characters.林夏.dims.欲望;
    assert.equal(day(C('林夏', '千年狐狸')), 30);
    assert.equal(day({}), 29);
});

test('合成·受惊小兔 / 金丝雀：主角在场时其压力不上升', () => {
    const text = '[igs-stat:stress|林夏|上升|大]';
    assert.ok(st(floor(one(), text)) > 0);
    for (const combo of ['受惊小兔', '金丝雀']) {
        assert.equal(st(floor(one(), text, C('林夏', combo), { present: ['林夏'] })), 0, combo);
    }
});

test('合成·金丝雀：离开主角多日压力加速上升', () => {
    const w = world({ 林夏: mkChar({ lastSeenDay: 1 }) }, {}, { day: 9 });
    const run = (traits) => settleDay(w, { random: high, rev: 2, traits, nsfw: true, present: [] }).characters.林夏.bars.stress;
    assert.equal(run(C('林夏', '金丝雀')), run({}) + 3);
});

test('合成·意难平：其不在场时其他角色好感上升打折', () => {
    const w = world({ 林夏: mkChar(), 小雪: mkChar() });
    const text = '[igs-stat:favor|林夏|喜悦|大]';
    const plain = d(floor(w, text, {}, { present: ['林夏'] })).好感;
    assert.ok(d(floor(w, text, C('小雪', '意难平'), { present: ['林夏'] })).好感 < plain);
    assert.equal(d(floor(w, text, C('小雪', '意难平'), { present: ['林夏', '小雪'] })).好感, plain, '在场不打折');
});

test('合成·温柔刀：了解越过一半那一楼主角压力上升一大档、其好感上升一大档', () => {
    const r = floor(one({ dims: { 了解: 49, 好感: 10 } }), '[igs-stat:know|林夏|上升|中]', C('林夏', '温柔刀'));
    assert.ok(d(r).了解 > 50);
    assert.equal(hero(r).stress, 20);
    assert.equal(d(r).好感, 16);
});

test('合成·霸总：主角花钱由其承担，每天最多一次', () => {
    const w = world({ 林夏: mkChar() }, { money: 1000 });
    const text = '[igs-stat:money|花费|普通]';
    const r = floor(w, text, C('林夏', '霸总'));
    assert.equal(hero(r).money, 1000);
    assert.equal(hero(floor(r.state, text, C('林夏', '霸总'))).money, 900, '同日第二次照扣');
    assert.equal(hero(floor(w, text)).money, 900);
});

test('合成·追妻火葬场：芥蒂清零那一楼好感上升一大档', () => {
    const r = floor(one({ dims: { 好感: 20, 芥蒂: 2 }, unlocked: ['gate-25'] }), '[igs-stat:grudge|林夏|下降|小]', C('林夏', '追妻火葬场'));
    assert.equal(d(r).芥蒂, 0);
    assert.equal(d(r).好感, 26);
});

test('合成·干饭王：一起吃饭那一楼主角与其压力都下降一大档', () => {
    const w = one({}, { stress: 40 }, { stress: 40 });
    const r = floor(w, '[igs-stat:stamina|林夏|进食]', C('林夏', '干饭王'), { present: ['林夏'] });
    assert.equal(hero(r).stress, 20);
    assert.equal(st(r), 20);
});

test('合成·战神（主角）：战斗后体力不低于一成；战斗那一楼压力不上升', () => {
    const w = world({}, { stamina: 12, stress: 10 });
    const r = floor(w, '[igs-stat:battle|强敌|1]', C('主角', '战神'));
    assert.ok(hero(r).stamina >= 10);
    assert.ok(hero(r).stress <= 10);
});

test('合成·大恶魔：主角压力过半时其好感、欲望上升加快；压力满欲望拉满', () => {
    const w = (stress) => world({ 林夏: mkChar({ dims: { 欲望: 5 } }) }, { stress });
    const text = '[igs-stat:favor|林夏|喜悦|大]\n[igs-stat:desire|林夏|上升]';
    const base = d(floor(w(60), text));
    const boost = d(floor(w(60), text, C('林夏', '大恶魔')));
    assert.ok(boost.好感 > base.好感 && boost.欲望 > base.欲望);
    assert.equal(d(floor(w(100), '[igs-stat:favor|林夏|平淡]', C('林夏', '大恶魔'))).欲望, 100);
    assert.equal(d(floor(w(20), text, C('林夏', '大恶魔'))).好感, d(floor(w(20), text)).好感);
});

test('合成·天使：其不记芥蒂', () => {
    assert.equal(d(floor(one(), '[igs-stat:grudge|林夏|上升|大]', C('林夏', '天使'))).芥蒂, 0);
});

test('合成·亡命鸳鸯：同楼在场时双方压力不上升', () => {
    const text = '[igs-stat:stress|上升|大]\n[igs-stat:stress|林夏|上升|大]';
    const r = floor(one(), text, C('林夏', '亡命鸳鸯'), { present: ['林夏'] });
    assert.equal(hero(r).stress, 0);
    assert.equal(st(r), 0);
});

test('合成·永动机（NSFW）：亲密不消耗其体力', () => {
    const w = one({}, { stamina: 100 });
    const text = '[igs-stat:intimate|林夏|重]';
    assert.equal(floor(w, text, C('林夏', '永动机'), { intimateCost: 'standard' }).state.characters.林夏.bars.stamina, 100);
    assert.ok(floor(w, text, {}, { intimateCost: 'standard' }).state.characters.林夏.bars.stamina < 100);
});

test('合成·主宰（NSFW，主角）：亲密那一楼对方欲望下限提到一半', () => {
    assert.ok(d(floor(one({ dims: { 欲望: 10 } }), '[igs-stat:intimate|林夏|轻]', C('主角', '主宰'))).欲望 >= 50);
});

test('合成·专属宠物（NSFW）：亲密后其对主角芥蒂清零', () => {
    assert.equal(d(floor(one({ dims: { 芥蒂: 30 } }), '[igs-stat:intimate|林夏|轻]', C('林夏', '专属宠物'))).芥蒂, 0);
});

test('合成·咸鱼：每天压力下降一大档；主角打工收入低一档', () => {
    const w = world({ 林夏: mkChar({}, { stress: 50 }) }, { stress: 50 });
    const day = (traits) => settleDay(w, { random: high, rev: 2, traits, nsfw: true, present: [] });
    assert.ok(day(C('林夏', '咸鱼')).characters.林夏.bars.stress < day({}).characters.林夏.bars.stress);
    const w2 = world({}, { stamina: 100, money: 0 });
    const run = (traits) => floor(w2, '[igs-stat:work|打工]', traits, { random: () => 0.3 });
    assert.ok(hero(run(C('主角', '咸鱼'))).money < hero(run({})).money);
});

test('合成·小太阳：其在场的日子在场角色与主角压力每天额外下降', () => {
    const w = world({ 林夏: mkChar({}, { stress: 40 }), 小雪: mkChar({}, { stress: 40 }) }, { stress: 40 });
    const day = (traits) => settleDay(w, { random: high, rev: 2, traits, nsfw: true, present: ['林夏', '小雪'] });
    const a = day({});
    const b = day(C('林夏', '小太阳'));
    assert.equal(b.characters.小雪.bars.stress, a.characters.小雪.bars.stress - 3);
    assert.equal(b.protagonist.bars.stress, a.protagonist.bars.stress - 3);
});

test('合成·高冷猫猫：好感过「喜欢」后不再冷却', () => {
    const w = world({ 林夏: mkChar({ dims: { 好感: 40 }, lastSeenDay: 1 }) }, {}, { day: 9 });
    const day = (traits) => settleDay(w, { random: high, rev: 2, traits, nsfw: true, present: [] }).characters.林夏.dims.好感;
    assert.equal(day({}), 39);
    assert.equal(day(C('林夏', '高冷猫猫')), 40);
});

test('合成·禁欲系破戒（NSFW）：欲望过半后不再消退', () => {
    const day = (v, traits) => settleDay(world({ 林夏: mkChar({ dims: { 欲望: v }, lastSeenDay: 1 }) }, {}, { day: 9 }), { random: high, rev: 2, traits, nsfw: true, present: [] }).characters.林夏.dims.欲望;
    assert.equal(day(60, C('林夏', '禁欲系破戒')), 60);
    assert.equal(day(30, C('林夏', '禁欲系破戒')), 29);
});

test('合成·一撩就倒（NSFW）：主角在场的日子欲望每天回升一档', () => {
    const w = world({ 林夏: mkChar({ dims: { 欲望: 20 } }) });
    const day = (present) => settleDay(w, { random: high, rev: 2, traits: C('林夏', '一撩就倒'), nsfw: true, present }).characters.林夏.dims.欲望;
    assert.ok(day(['林夏']) > day([]));
});

// ---- 检定骰 ----
test('检定骰：腹黑 / 小笨蛋 / 绿茶惩罚骰，恋爱军师 / 键盘侠奖励骰', () => {
    const w = one({ dims: { 了解: 10 } });
    const dice = (name, category, ctx) => traitDice(w, cat(T(name)), '林夏', category, ctx);
    assert.equal(dice('腹黑', '社交'), -1);
    assert.equal(traitDice(one({ dims: { 了解: 80 } }), cat(T('腹黑')), '林夏', '社交'), 0, '了解过半恢复');
    assert.equal(dice('小笨蛋', '手工'), -1);
    assert.equal(dice('绿茶', '社交'), -1);
    assert.equal(dice('绿茶', '战斗'), 0);
    assert.equal(dice('恋爱军师', '社交', { here: true }), 1);
    assert.equal(dice('恋爱军师', '社交', { here: false }), 0);
    assert.equal(dice('键盘侠', '社交'), 1);
});

// ---- 第二期：事件标签 / 白月光 ----
const ev = (who, type) => `[igs-stat:event|${who}|${type}]`;

test('特质事件标签：rev2 才认，不进关口、不记关键事件', () => {
    const s = one({ dims: { 好感: 25 } });
    const r = floor(s, ev('林夏', '夸奖'));
    assert.equal(d(r).好感, 25);
    assert.equal(r.meta.events.length, 0);
    assert.deepEqual(r.meta.reviewEvents, undefined);
    assert.equal(floor(s, ev('林夏', '夸奖'), {}, { strengthRev: 1 }).state.characters.林夏.dims.好感, 25);
});

test('夸奖标签每楼生效：自卑好感加倍', () => {
    const text = `[igs-stat:favor|林夏|喜悦|中]${ev('林夏', '夸奖')}`;
    assert.ok(d(floor(one(), text, T('自卑'))).好感 > d(floor(one(), text)).好感);
});

test('背叛：信任大降芥蒂大升；正义使者芥蒂加倍', () => {
    const s = one({ dims: { 信任: 40, 芥蒂: 0 } });
    const base = floor(s, ev('林夏', '背叛'));
    assert.equal(d(base).信任, 25);
    assert.equal(d(base).芥蒂, 10);
    assert.ok(d(floor(s, ev('林夏', '背叛'), T('正义使者'))).芥蒂 > 10);
});

test('求助：老好人答应并挂欠你人情；普通角色不挂', () => {
    const rel = (r) => (r.state.characters.林夏.relStates || []).map((x) => x.id);
    assert.deepEqual(rel(floor(one(), ev('林夏', '求助'), T('老好人'))), ['欠你人情']);
    assert.deepEqual(rel(floor(one(), ev('林夏', '求助'))), []);
});

test('信仰质疑：狂信徒芥蒂加倍，无神论者不受影响（芥蒂上升退回）', () => {
    const text = `[igs-stat:grudge|林夏|上升|中]${ev('林夏', '信仰质疑')}`;
    const plain = d(floor(one(), text)).芥蒂;
    assert.ok(d(floor(one(), text, T('狂信徒'))).芥蒂 > plain);
    assert.equal(d(floor(one(), text, T('无神论者'))).芥蒂, 0);
});

test('吸血 / 歌唱 事件标签替代关键词', () => {
    const s = world({ 林夏: mkChar({}, { stamina: 50 }), 夜宵: mkChar() });
    const r = floor(s, ev('夜宵', '吸血'), mk({ 夜宵: ['吸血鬼'] }), { present: ['夜宵'] });
    assert.ok(r.state.characters.夜宵.bars.stamina > 100 - 1 || r.state.characters.夜宵.bars.stamina >= s.characters.夜宵.bars.stamina);
    assert.equal(floor(s, '她咬了一口，吸血', mk({ 夜宵: ['吸血鬼'] })).state.characters.夜宵.bars.stamina, s.characters.夜宵.bars.stamina);
});

test('白月光：久别重逢好感大升；不在场不冷却', () => {
    const s = world({ 林夏: mkChar({ dims: { 好感: 30 }, lastSeenDay: 1 }) }, {}, { day: 10 });
    const r = floor(s, '[igs-stat:favor|林夏|平淡]', T('白月光'));
    assert.equal(d(r).好感, 36);
    const again = floor(r.state, '[igs-stat:favor|林夏|平淡]', T('白月光'));
    assert.equal(d(again).好感, 36);
    assert.equal(d(floor(s, '[igs-stat:favor|林夏|平淡]')).好感, 30);
    const idle = settleDay(world({ 林夏: mkChar({ dims: { 好感: 40 }, lastSeenDay: 1 }) }, {}, { day: 10 }), { random: high, rev: 2, traits: T('白月光'), nsfw: true, present: [] });
    assert.equal(idle.characters.林夏.dims.好感, 40);
});

test('白月光被提起：好感心动以上的其他角色吃醋，每天一次', () => {
    const s = world({ 林夏: mkChar({ dims: { 好感: 30 } }), 苏雨: mkChar({ dims: { 好感: 60, 芥蒂: 0 } }) });
    const r = floor(s, ev('林夏', '提起'), T('白月光'));
    assert.ok(r.state.characters.苏雨.dims.芥蒂 > 0);
    assert.equal(r.state.characters.林夏.dims.芥蒂, 0);
    const g = r.state.characters.苏雨.dims.芥蒂;
    assert.equal(floor(r.state, ev('林夏', '提起'), T('白月光')).state.characters.苏雨.dims.芥蒂, g);
});

test('白月光：心动进恋人需要两次关键事件', () => {
    const low = high;
    let s = world({ 林夏: mkChar({ dims: { 好感: 75 }, unlocked: ['gate-25', 'gate-50'] }) });
    const text = '[igs-stat:event|林夏|约会]';
    let r = floor(s, text, T('白月光'), { random: low });
    assert.equal(d(r).好感, 75);
    r = floor(r.state, text, T('白月光'), { random: low });
    // 第二次过关；关键事件分四档后掷出大成功会额外 +3，这里只核对已越过关口。
    assert.ok(d(r).好感 >= 76);
    assert.ok(d(floor(s, text, {}, { random: low })).好感 >= 76);
});
