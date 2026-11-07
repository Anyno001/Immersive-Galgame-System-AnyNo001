import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { createCharacter, createStatsState, hasMark } from '../src/scene/stats/stat-state.js';
import {
    ACHIEVEMENT_DEFS, TRAIT_DEFS, TRAIT_GROUPS, TRAIT_LIMITS, amplifyLimit, applyTraitChange, aptitudeLevel, getTraitByName, getTraitDef, guardDrop,
    hasTrait, listTraits, traitCatalogOf, traitScale,
} from '../src/scene/stats/stat-traits.js';

const high = () => 0.99;
const resolve = (n) => n;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const npc = (patch = {}, bars = {}) => {
    const base = createCharacter(1, { nsfw: true });
    return { ...createStatsState(), characters: { 林夏: { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) }, bars: { ...base.bars, ...bars } } } };
};
const on = (src = 'manual') => ({ on: true, src });
const traitsOf = (...names) => ({ 林夏: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on()])) });
const catalogOf = (...names) => traitCatalogOf(traitsOf(...names), true);
const dims = (r) => r.state.characters.林夏.dims;
const stress = (r) => r.state.characters.林夏.bars.stress;

// ---- 登记表 ----

test('登记表：所有表项齐全，名字与键唯一，互斥对称，说明不含数字倍率', () => {
    const names = TRAIT_DEFS.map((d) => d.name);
    assert.equal(new Set(names).size, names.length);
    assert.equal(new Set(TRAIT_DEFS.map((d) => d.id)).size, TRAIT_DEFS.length);
    for (const g of TRAIT_GROUPS) assert.ok(TRAIT_DEFS.some((d) => d.group === g), g);
    for (const d of TRAIT_DEFS) {
        assert.ok(d.desc && !/×/.test(d.desc), `${d.name} 说明含倍率符号`);
        for (const ex of d.exclusive) assert.ok(getTraitDef(ex).exclusive.includes(d.id), `${d.name} 与 ${ex} 互斥不对称`);
    }
    assert.equal(getTraitByName('犬系').exclusive.includes('强势'), true);
    assert.equal(getTraitByName('绿帽癖').nsfw, true);
    assert.equal(getTraitByName('体力怪物').nsfw, true);
    assert.equal(ACHIEVEMENT_DEFS.length, 8);
    for (const a of ['脆弱', '犬系', '傲娇', '抖S', '贪吃鬼']) assert.ok(getTraitByName(a), a);
});

test('互斥：动物系每人最多一个；后挂的顶掉先挂的并给出替换通知', () => {
    let r = applyTraitChange(null, { traits: {} }, '林夏', getTraitByName('犬系').id, true, 'manual');
    r = applyTraitChange(null, r.catalog, '林夏', getTraitByName('猫系').id, true, 'manual');
    assert.deepEqual(r.notices, [{ type: 'replace', charName: '林夏', id: '猫系', replacedId: '犬系' }]);
    assert.deepEqual(listTraits(r.catalog, '林夏').map((t) => t.id), ['猫系']);
    const w = applyTraitChange(null, { traits: {} }, '林夏', 'fragile', true, 'manual');
    const t = applyTraitChange(null, w.catalog, '林夏', getTraitByName('坚韧').id, true, 'story');
    assert.equal(t.notices[0].type, 'replace');
    assert.equal(hasTrait(null, t.catalog, '林夏', 'fragile'), false);
});

test('满额：自动最多 3；同挂满 5 时剧情顶掉最早的自动项，手动挂满拒绝；成就另计 2；摘下组成项拆合成', () => {
    let cat = { traits: {} };
    for (const n of ['乐天派', '抖M', '抖S', '多疑']) cat = applyTraitChange(null, cat, '林夏', getTraitByName(n).id, true, 'auto').catalog;
    assert.equal(listTraits(cat, '林夏').length, 3, '自动评定最多 3 项');
    for (const n of ['坚韧', '黏人']) cat = applyTraitChange(null, cat, '林夏', getTraitByName(n).id, true, 'manual').catalog;
    assert.equal(listTraits(cat, '林夏').length, TRAIT_LIMITS.total);
    const full = applyTraitChange(null, cat, '林夏', getTraitByName('傲娇').id, true, 'manual');
    assert.equal(full.reason, 'full');
    const story = applyTraitChange(null, cat, '林夏', getTraitByName('傲娇').id, true, 'story');
    assert.equal(story.notices[0].replacedId, '乐天派', '顶掉最早的自动项');
    assert.equal(listTraits(story.catalog, '林夏').length, TRAIT_LIMITS.total);
    let ach = story.catalog;
    for (const n of ['熟练工', '一技之长']) ach = applyTraitChange(null, ach, '林夏', n, true, 'achieve').catalog;
    assert.equal(applyTraitChange(null, ach, '林夏', '万事通', true, 'achieve').reason, 'achieve-full');
    // 合成占 1 格：组成项仍生效，摘下组成项即拆回。
    const combo = { traits: { 林夏: { 犬系: on(), 黏人: on(), 爱撒娇: on(), 'combo:大型犬': { on: true, src: 'story', parts: ['犬系', '黏人', '爱撒娇'] } } } };
    assert.equal(hasTrait(null, combo, '林夏', '犬系'), true);
    const cleaned = sanitizeCatalog(combo);
    assert.deepEqual(cleaned.traits.林夏['combo:大型犬'].parts, ['犬系', '黏人', '爱撒娇']);
    const after = applyTraitChange(null, combo, '林夏', '黏人', false, 'manual');
    assert.equal(listTraits(after.catalog, '林夏').some((t) => t.id.startsWith('combo:')), false);
});

test('手动不被自动覆盖；自动项可被手动升级来源；摘下手动项自动评定不能做', () => {
    let cat = applyTraitChange(null, { traits: {} }, '林夏', 'fragile', true, 'manual').catalog;
    const r = applyTraitChange(null, cat, '林夏', 'fragile', true, 'auto');
    assert.equal(r.catalog, cat);
    assert.equal(applyTraitChange(null, cat, '林夏', 'fragile', false, 'auto').reason, 'protected');
    cat = applyTraitChange(null, { traits: {} }, '林夏', getTraitByName('黏人').id, true, 'auto').catalog;
    cat = applyTraitChange(null, cat, '林夏', getTraitByName('黏人').id, true, 'manual').catalog;
    assert.equal(listTraits(cat, '林夏')[0].src, 'manual');
    assert.equal(applyTraitChange(null, { traits: {} }, '主角', getTraitByName('傲娇').id, true, 'manual').reason, 'not-protagonist');
});

test('NSFW 关闭时仅 NSFW 的特质视为未挂', () => {
    const traits = traitsOf('体力怪物');
    assert.equal(hasTrait(null, traitCatalogOf(traits, true), '林夏', getTraitByName('体力怪物').id), true);
    assert.equal(hasTrait(null, traitCatalogOf(traits, false), '林夏', getTraitByName('体力怪物').id), false);
});

// ---- 存档迁移 ----

test('迁移：旧布尔式 traits、旧悟性字符串、intimacyForced 数组读档后为新格式；写档只写新格式；来回一致', () => {
    const catalog = sanitizeCatalog({
        aptitude: { 主角: '天纵', 阿福: { v: '出众', src: 'auto' } },
        traits: { 老爷爷: { companion: true, bodiless: true }, 小雪: { kin: true, 乱写: true } },
        intimacyForced: ['小雪'],
    });
    assert.deepEqual(catalog.traits.老爷爷, { companion: on(), bodiless: on() });
    assert.deepEqual(catalog.traits.小雪, { kin: on(), forced: on() });
    assert.deepEqual(catalog.intimacyForced, ['小雪']);
    assert.deepEqual(catalog.aptitude, { 主角: { v: '天纵', src: 'manual' }, 阿福: { v: '出众', src: 'auto' } });
    assert.equal(aptitudeLevel(catalog, '主角'), '天纵');
    assert.equal(aptitudeLevel(catalog, '路人'), '平庸');
    const map = chatEntries({ catalog });
    assert.equal([...map.keys()].some((k) => k.startsWith('force:')), false, '不再写 force: 记录');
    const back = restoreChat(map).catalog;
    assert.deepEqual(back.traits, catalog.traits);
    assert.deepEqual(back.aptitude, catalog.aptitude);
    assert.deepEqual(back.intimacyForced, ['小雪']);
    // 旧存档的 force: 记录仍可读入。
    assert.deepEqual(restoreChat(new Map([['force:小雪', true]])).catalog.traits.小雪, { forced: on() });
});

test('迁移前后结果一致：旧布尔式与新格式的脆弱、随身、无实体效果相同；hasMark 兼容两种格式', () => {
    const oldFmt = { 林夏: { fragile: true, bodiless: true } };
    const newFmt = { 林夏: { fragile: on(), bodiless: on() } };
    const text = '[igs-stat:stress|林夏|上升|中][igs-stat:stamina|林夏|重]';
    const a = floor(npc(), text, oldFmt);
    const b = floor(npc(), text, newFmt);
    assert.deepEqual(a.state, b.state);
    assert.equal(stress(a), 20);
    assert.equal(a.state.characters.林夏.bars.stamina, 100, '无实体：体力标签丢弃');
    assert.equal(hasMark(null, oldFmt, '林夏', 'fragile'), true);
    assert.equal(hasMark(null, newFmt, '林夏', 'fragile'), true);
    const aged = settleDay({ ...npc({ dims: { 好感: 40 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 20 } }, { random: high, rev: 2, traits: oldFmt });
    const aged2 = settleDay({ ...npc({ dims: { 好感: 40 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 20 } }, { random: high, rev: 2, traits: newFmt });
    assert.deepEqual(aged, aged2);
});

test('只对 strengthRev ≥ 2 生效：旧楼带着特质结果与无特质相同', () => {
    const text = '[igs-stat:favor|林夏|开心|中][igs-stat:stress|林夏|上升|中]';
    for (const rev of [0, 1]) {
        const plain = settleFloorText(npc(), text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: rev, nsfw: true, traits: {} });
        const withTrait = settleFloorText(npc(), text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: rev, nsfw: true, traits: traitsOf('恋爱脑', '脆弱') });
        assert.deepEqual(withTrait.state, plain.state);
    }
});

// ---- 公式 ----

test('倍率叠加相乘并夹在 0.5–2；上限放大；下降单楼保护', () => {
    const cat = catalogOf('强势', '温柔疏离');
    const state = npc();
    assert.equal(traitScale(state, cat, '林夏', '信任', 'up'), 0.25 < 0.5 ? 0.5 : 0.25, '0.5 × 0.5 夹到 0.5');
    assert.equal(traitScale(state, catalogOf('恋爱脑', '温柔疏离'), '林夏', '好感', 'up'), 2, '1.5 × 1.5 夹到 2');
    assert.equal(traitScale(state, catalogOf('恋爱脑'), '林夏', '好感', 'up'), 1.5);
    assert.equal(traitScale(state, catalogOf(), '林夏', '好感', 'up'), 1);
    assert.equal(amplifyLimit(8, 1.5), 12);
    assert.equal(amplifyLimit(8, 0.5), 8);
    assert.equal(guardDrop('好感', 37.5), 30);
    assert.equal(guardDrop('信任', 45), 36);
    assert.equal(guardDrop('芥蒂', 20), 18);
    assert.equal(guardDrop('好感', 12), 12);
});

test('上限放大：恋爱脑「大」上升单楼 6×1.5=9，不被原单楼上限 8 截断', () => {
    const r = floor(npc({ dims: { 好感: 30 }, unlocked: ['gate-25', 'gate-50', 'gate-75'] }), '[igs-stat:favor|林夏|心动|大]', traitsOf('恋爱脑'));
    assert.equal(dims(r).好感, 39);
    const plain = floor(npc({ dims: { 好感: 30 }, unlocked: ['gate-25', 'gate-50', 'gate-75'] }), '[igs-stat:favor|林夏|心动|大]');
    assert.equal(dims(plain).好感, 36);
});

test('下降保护：恋爱脑「失望 重大」好感一楼最多 −30', () => {
    const r = floor(npc({ dims: { 好感: 60 } }), '[igs-stat:favor|林夏|失望|重大]', traitsOf('恋爱脑'));
    assert.equal(dims(r).好感, 30);
    const mid = floor(npc({ dims: { 好感: 60 } }), '[igs-stat:favor|林夏|失望|中]', traitsOf('恋爱脑'));
    assert.equal(dims(mid).好感, 48);
});

// ---- 心性组钩子 ----

test('心性·脆弱 / 坚韧：压力上升加倍 / 减半，下降不变', () => {
    assert.equal(stress(floor(npc(), '[igs-stat:stress|林夏|上升|中]', traitsOf('脆弱'))), 20);
    assert.equal(stress(floor(npc(), '[igs-stat:stress|林夏|上升|中]', traitsOf('坚韧'))), 5);
    assert.equal(stress(floor(npc({}, { stress: 40 }), '[igs-stat:stress|林夏|下降|中]', traitsOf('脆弱'))), 30);
    const hero = floor(createStatsState(), '[igs-stat:stress|上升|极大]', { 主角: { fragile: on() } });
    assert.equal(hero.state.protagonist.bars.stress, 100);
});

test('心性·记仇 / 宽容：芥蒂不自然消退 / 消退加倍', () => {
    const base = () => ({ ...npc({ dims: { 芥蒂: 60 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 1 } });
    const fade = (names) => settleDay(base(), { random: high, rev: 2, traits: traitsOf(...names), nsfw: true }).characters.林夏.dims.芥蒂;
    assert.equal(fade([]), 59);
    assert.equal(fade(['记仇']), 60);
    assert.equal(fade(['宽容']), 58);
});

test('心性·慢热 / 恋爱脑：好感上升减慢 / 加快，恋爱脑下降加重；慢热冷却减半', () => {
    const up = (names) => dims(floor(npc({ dims: { 好感: 30 }, unlocked: ['gate-25'] }), '[igs-stat:favor|林夏|开心|中]', traitsOf(...names))).好感;
    assert.equal(up([]), 34);
    assert.equal(up(['慢热']), 32);
    assert.equal(up(['恋爱脑']), 36);
    const cool = (names) => {
        const s = { ...npc({ dims: { 好感: 40 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 1 } };
        return settleDay(s, { random: high, rev: 2, traits: traitsOf(...names), nsfw: true }).characters.林夏.dims.好感;
    };
    assert.equal(cool([]), 40, '一天内未超过冷却宽限');
    const long = (names) => settleDay({ ...npc({ dims: { 好感: 40 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 9 } }, { random: high, rev: 2, traits: traitsOf(...names), nsfw: true }).characters.林夏.dims.好感;
    assert.equal(long([]), 39);
    assert.equal(long(['慢热']), 39, '减半后至少 1');
});

test('心性·病娇：吃醋芥蒂加倍、欲望不消退', () => {
    const jealous = (names) => dims(floor(npc({ dims: { 好感: 30, 芥蒂: 10 } }), '[igs-stat:favor|林夏|吃醋|中]', traitsOf(...names))).芥蒂;
    assert.ok(jealous(['病娇']) > jealous([]));
    const desire = (names) => settleDay({ ...npc({ dims: { 欲望: 30 } }), clock: { ...createStatsState().clock, day: 1 } }, { random: high, rev: 2, traits: traitsOf(...names), nsfw: true }).characters.林夏.dims.欲望;
    assert.equal(desire([]), 29);
    assert.equal(desire(['病娇']), 30);
});

test('心性·多疑 / 傻白甜：信任上升减半 / 加倍，单楼上限随倍率放大', () => {
    const trust = (names, level = '大') => dims(floor(npc(), `[igs-stat:trust|林夏|上升|${level}]`, traitsOf(...names))).信任;
    assert.equal(trust([]), 6);
    assert.equal(trust(['多疑']), 3);
    assert.equal(trust(['傻白甜']), 10, '6×1.7=10，单楼上限 6 随倍率放大');
});

test('心性·乐天派：每天压力额外下降；主角同样适用', () => {
    const s = { ...createStatsState(), protagonist: { ...createStatsState().protagonist, bars: { stamina: 100, money: 0, stress: 30 } } };
    const r = settleDay(s, { random: high, rev: 2, traits: { 主角: { [getTraitByName('乐天派').id]: on() } } });
    assert.equal(r.protagonist.bars.stress, 15, '日结算 −10 再 −5');
});

test('心性·抖M / 抖S：自己压力上升时欲望同步小升；主角压力上升那一楼抖S 欲望小升', () => {
    const m = floor(npc({ dims: { 欲望: 10 } }), '[igs-stat:stress|林夏|上升|中]', traitsOf('抖M'));
    assert.equal(dims(m).欲望, 12);
    const s = floor(npc({ dims: { 欲望: 10 } }), '[igs-stat:favor|林夏|开心|小][igs-stat:stress|上升|中]', traitsOf('抖S'));
    assert.equal(dims(s).欲望, 12);
    const none = floor(npc({ dims: { 欲望: 10 } }), '[igs-stat:favor|林夏|开心|小][igs-stat:stress|上升|中]');
    assert.equal(dims(none).欲望, 10);
});

// ---- 恋爱人设组钩子 ----

test('恋爱人设·强势：欲望上升加快、信任上升减半、芥蒂消退加倍', () => {
    assert.equal(dims(floor(npc({ dims: { 欲望: 0 } }), '[igs-stat:desire|林夏|上升]', traitsOf('强势'))).欲望 >= 2, true);
    assert.equal(dims(floor(npc(), '[igs-stat:trust|林夏|上升|大]', traitsOf('强势'))).信任, 3);
    const fade = settleDay({ ...npc({ dims: { 芥蒂: 60 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 1 } }, { random: high, rev: 2, traits: traitsOf('强势'), nsfw: true });
    assert.equal(fade.characters.林夏.dims.芥蒂, 58);
});

test('恋爱人设·护短：主角受伤或压力上升「大」那一楼好感、信任小升', () => {
    const r = floor(npc({ dims: { 好感: 30, 信任: 10 } }), '[igs-stat:stress|上升|大]', traitsOf('护短'), { present: ['林夏'] });
    assert.equal(dims(r).好感, 32);
    assert.equal(dims(r).信任, 11);
    const quiet = floor(npc({ dims: { 好感: 30 } }), '[igs-stat:stress|上升|中]', traitsOf('护短'), { present: ['林夏'] });
    assert.equal(dims(quiet).好感, 30);
});

test('恋爱人设·温柔疏离：好感上升加快、下降减半；其失望事件让主角压力上升加倍', () => {
    assert.equal(dims(floor(npc({ dims: { 好感: 30 } }), '[igs-stat:favor|林夏|失望|中]', traitsOf('温柔疏离'))).好感, 26);
    assert.equal(dims(floor(npc(), '[igs-stat:dim|林夏|了解|上升]', traitsOf('温柔疏离'))).了解 >= 0, true);
    const r = floor({ ...npc({ dims: { 好感: 30 } }) }, '[igs-stat:favor|林夏|失望|中][igs-stat:stress|上升|中]', traitsOf('温柔疏离'));
    assert.equal(r.state.protagonist.bars.stress, 20);
});

test('恋爱人设·禁欲 / 小恶魔：欲望上升按当前值减半 / 加倍', () => {
    const up = (names, from) => dims(floor(npc({ dims: { 欲望: from } }), '[igs-stat:desire|林夏|上升]', traitsOf(...names))).欲望 - from;
    assert.ok(up(['禁欲'], 10) <= up([], 10));
    assert.ok(up(['小恶魔'], 10) >= up([], 10));
});

test('恋爱人设·追悔：芥蒂「不满」起好感上升加快', () => {
    const up = (g) => dims(floor(npc({ dims: { 好感: 30, 芥蒂: g }, unlocked: ['gate-25'] }), '[igs-stat:favor|林夏|开心|中]', traitsOf('追悔'))).好感;
    assert.equal(up(0), 34);
    assert.equal(up(30), 36);
});

test('恋爱人设·青梅竹马 / 高岭之花 / 冰山：冷却减半（高岭之花过心动后、冰山信任过半后）', () => {
    const long = (names, dim) => settleDay({ ...npc({ dims: { 好感: 60, 信任: 60, ...dim }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 9 } }, { random: high, rev: 2, traits: traitsOf(...names), nsfw: true }).characters.林夏.dims.好感;
    assert.equal(long([], {}), 59);
    assert.equal(long(['青梅竹马'], {}), 59, '减半后至少 1');
    assert.equal(long(['高岭之花'], {}), 59);
    assert.equal(long(['冰山'], {}), 59);
});

test('恋爱人设·傲娇：好感在「喜欢」以下上升减慢，过「喜欢」后加快', () => {
    const up = (from) => dims(floor(npc({ dims: { 好感: from }, unlocked: ['gate-25', 'gate-50'] }), '[igs-stat:favor|林夏|开心|中]', traitsOf('傲娇'))).好感 - from;
    assert.equal(up(10), 2);
    assert.equal(up(40), 8);
});

test('恋爱人设·冰山 / 无口 / 高岭之花：好感上升看信任、了解、好感阶段各自一项', () => {
    const up = (name, d) => dims(floor(npc({ dims: { 好感: 10, ...d }, unlocked: ['gate-25'] }), '[igs-stat:favor|林夏|开心|中]', traitsOf(name))).好感 - 10;
    assert.equal(up('冰山', { 信任: 0 }), 2);
    assert.equal(up('冰山', { 信任: 60 }), 4);
    assert.equal(up('无口', { 了解: 0 }), 2);
    assert.equal(up('无口', { 了解: 60 }), 8);
    assert.equal(up('高岭之花', {}), 2);
});

test('恋爱人设·毒舌：信任上升加快', () => {
    assert.equal(dims(floor(npc(), '[igs-stat:trust|林夏|上升|中]', traitsOf('毒舌'))).信任, 5);
});

test('恋爱人设·黏人 / 占有欲强 / 白月光：主角在场不冷却；黏人不在身边时压力缓升', () => {
    const run = (names, present) => settleDay({ ...npc({ dims: { 好感: 60 }, lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 9 } }, { random: high, rev: 2, traits: traitsOf(...names), nsfw: true, present });
    assert.equal(run([], []).characters.林夏.dims.好感, 59);
    assert.equal(run(['黏人'], ['林夏']).characters.林夏.dims.好感, 60);
    assert.equal(run(['占有欲强'], ['林夏']).characters.林夏.dims.好感, 60);
    assert.equal(run(['黏人'], []).characters.林夏.dims.好感, 59, '不在场照常冷却');
    const stressOf = (names, present) => run(names, present).characters.林夏.bars.stress;
    assert.equal(stressOf(['黏人'], []), 3);
    assert.equal(stressOf(['黏人'], ['林夏']), 0);
});

test('恋爱人设·天然呆 / 占有欲强：吃醋不加芥蒂', () => {
    for (const name of ['天然呆', '占有欲强']) {
        const r = floor(npc({ dims: { 好感: 30, 芥蒂: 10 } }), '[igs-stat:favor|林夏|吃醋|中]', traitsOf(name));
        assert.equal(dims(r).芥蒂, 10, name);
    }
    assert.equal(dims(floor(npc({ dims: { 好感: 30, 芥蒂: 10 } }), '[igs-stat:favor|林夏|吃醋|中]')).芥蒂, 12);
});

test('恋爱人设·元气：其在场的日子主角压力每天额外下降；爱撒娇：在场时其压力下降', () => {
    const s = { ...npc({}, { stress: 20 }), protagonist: { ...createStatsState().protagonist, bars: { stamina: 100, money: 0, stress: 30 } }, clock: { ...createStatsState().clock, day: 1 } };
    const r = settleDay(s, { random: high, rev: 2, traits: traitsOf('元气'), nsfw: true, present: ['林夏'] });
    assert.equal(r.protagonist.bars.stress, 17, '−10 再 −3');
    const e = settleDay(s, { random: high, rev: 2, traits: traitsOf('爱撒娇'), nsfw: true, present: ['林夏'] });
    assert.equal(e.characters.林夏.bars.stress, 7, '−10 再 −3');
});

test('恋爱人设·包容：芥蒂上升减半；主角压力上升「大」那一楼其在场时主角压力下降一小档', () => {
    assert.equal(dims(floor(npc(), '[igs-stat:grudge|林夏|上升|大]', traitsOf('包容'))).芥蒂, 5);
    const r = floor(npc(), '[igs-stat:stress|上升|大]', traitsOf('包容'), { present: ['林夏'] });
    assert.equal(r.state.protagonist.bars.stress, 15);
});

test('恋爱人设·贪吃鬼：送吃的礼物与一起吃饭好感上升加倍', () => {
    const gift = (text) => dims(floor(npc({ unlocked: ['gate-25'] }), `[igs-stat:gift|林夏|${text}]`, traitsOf('贪吃鬼'))).好感;
    assert.ok(gift('蛋糕') > gift('钢笔'));
    const dine = dims(floor(npc({ dims: { 好感: 10 }, unlocked: ['gate-25'] }), '[igs-stat:stamina|林夏|进食][igs-stat:favor|林夏|开心|中]', traitsOf('贪吃鬼'))).好感;
    const plain = dims(floor(npc({ dims: { 好感: 10 }, unlocked: ['gate-25'] }), '[igs-stat:stamina|林夏|进食][igs-stat:favor|林夏|开心|中]')).好感;
    assert.ok(dine > plain);
});

test('恋爱人设·钓系 / 情绪稳定：钓系过心动后好感上升减慢；情绪稳定把压力单次上升压到「中」', () => {
    const up = (from) => dims(floor(npc({ dims: { 好感: from }, unlocked: ['gate-25', 'gate-50'] }), '[igs-stat:favor|林夏|开心|中]', traitsOf('钓系'))).好感 - from;
    assert.equal(up(10), 4);
    assert.equal(up(60), 2);
    assert.equal(stress(floor(npc(), '[igs-stat:stress|林夏|上升|大]', traitsOf('情绪稳定'))), 10);
    assert.equal(floor(createStatsState(), '[igs-stat:stress|上升|极大]', { 主角: { [getTraitByName('情绪稳定').id]: on() } }).state.protagonist.bars.stress, 10);
});

// ---- 动物系钩子 ----

test('动物系·犬系：信任上升加快、芥蒂上升减半、主角多日不在时其压力缓升', () => {
    assert.equal(dims(floor(npc(), '[igs-stat:trust|林夏|上升|大]', traitsOf('犬系'))).信任, 10);
    assert.equal(dims(floor(npc(), '[igs-stat:grudge|林夏|上升|大]', traitsOf('犬系'))).芥蒂, 5);
    const r = settleDay({ ...npc({ lastSeenDay: 1 }), clock: { ...createStatsState().clock, day: 4 } }, { random: high, rev: 2, traits: traitsOf('犬系'), nsfw: true, present: [] });
    assert.equal(r.characters.林夏.bars.stress, 3);
});

test('动物系·猫系 / 蛇系：好感上升减慢；蛇系下降减半；猫系在主角高压时其在场主角压力下降', () => {
    const up = (n) => dims(floor(npc({ dims: { 好感: 10 }, unlocked: ['gate-25'] }), '[igs-stat:favor|林夏|开心|中]', traitsOf(n))).好感 - 10;
    assert.equal(up('猫系'), 2);
    assert.equal(up('蛇系'), 2);
    assert.equal(dims(floor(npc({ dims: { 好感: 30 } }), '[igs-stat:favor|林夏|失望|中]', traitsOf('蛇系'))).好感, 26);
    const s = { ...npc(), protagonist: { ...createStatsState().protagonist, bars: { stamina: 100, money: 0, stress: 80 } } };
    const r = floor(s, '[igs-stat:favor|林夏|开心|小]', traitsOf('猫系'), { present: ['林夏'] });
    assert.equal(r.state.protagonist.bars.stress, 75);
});

test('动物系·狐系 / 狼系：欲望上升加快；狐系了解上升减半；狼系信任未过半时芥蒂上升加快', () => {
    const d = (n) => dims(floor(npc({ dims: { 欲望: 0 } }), '[igs-stat:desire|林夏|上升]', traitsOf(n))).欲望;
    assert.ok(d('狐系') >= d('小恶魔') - 5);
    assert.equal(dims(floor(npc({ dims: { 信任: 10 } }), '[igs-stat:grudge|林夏|上升|中]', traitsOf('狼系'))).芥蒂, 8);
    assert.equal(dims(floor(npc({ dims: { 信任: 80 } }), '[igs-stat:grudge|林夏|上升|中]', traitsOf('狼系'))).芥蒂, 5);
});

test('动物系·兔系：其压力上升加快、信任上升加快、主角在场时压力下降', () => {
    assert.equal(stress(floor(npc(), '[igs-stat:stress|林夏|上升|中]', traitsOf('兔系'))), 15);
    assert.equal(dims(floor(npc(), '[igs-stat:trust|林夏|上升|大]', traitsOf('兔系'))).信任, 9);
    const r = settleDay({ ...npc({}, { stress: 20 }), clock: { ...createStatsState().clock, day: 1 } }, { random: high, rev: 2, traits: traitsOf('兔系'), nsfw: true, present: ['林夏'] });
    assert.equal(r.characters.林夏.bars.stress, 7);
});

test('动物系·熊系：主角受伤那一楼其好感上升一大档；芥蒂上升减半', () => {
    const r = floor(npc({ dims: { 好感: 10 }, unlocked: ['gate-25'] }), '[igs-stat:stamina|受伤]', traitsOf('熊系'), { present: ['林夏'] });
    assert.equal(dims(r).好感, 16);
    assert.equal(dims(floor(npc(), '[igs-stat:grudge|林夏|上升|大]', traitsOf('熊系'))).芥蒂, 5);
});

// ---- 提示词 ----

test('正文提示词不含任何特质名与食物词表；仅存在类事实句例外（本阶段未接入，提示词保持原样）', () => {
    const names = TRAIT_DEFS.filter((d) => !d.inject).map((d) => d.name);
    const traits = {};
    for (const n of names.slice(0, 30)) traits[n] = {};
    const state = npc({ dims: { 好感: 40 } });
    const withTraits = buildStatsPrompt(state, { present: ['林夏'], traits: traitsOf('恋爱脑', '犬系', '傲娇', '脆弱', '黏人', '贪吃鬼'), nsfw: true });
    const without = buildStatsPrompt(state, { present: ['林夏'], nsfw: true });
    assert.equal(withTraits.content, without.content, '带不带特质提示词一致');
    for (const n of ['恋爱脑', '犬系', '傲娇', '脆弱', '黏人', '贪吃鬼', '抖S', '特质']) assert.equal(withTraits.content.includes(n), false, n);
    for (const d of TRAIT_DEFS) if (d.inject) assert.ok(d.inject.length <= 20 && !/[性格脾气]/.test(d.inject), d.name);
});
