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

test('满额：自动最多 3；同挂满 5 时剧情顶掉最早的自动项，手动挂满拒绝；成就另计 2；摘下组成项拆合成', () => {
    let cat = { traits: {} };
    for (const n of ['乐天派', '抖M', '抖S', '疑心病']) cat = applyTraitChange(null, cat, '林夏', getTraitByName(n).id, true, 'auto').catalog;
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
    const combo = { traits: { 林夏: { 犬系: on(), 黏人: on(), 撒娇精: on(), 'combo:大型犬': { on: true, src: 'story', parts: ['犬系', '黏人', '撒娇精'] } } } };
    assert.equal(hasTrait(null, combo, '林夏', '犬系'), true);
    const cleaned = sanitizeCatalog(combo);
    assert.deepEqual(cleaned.traits.林夏['combo:大型犬'].parts, ['犬系', '黏人', '撒娇精']);
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

// ---- 心性组钩子 ----

// ---- 恋爱人设组钩子 ----

// ---- 动物系钩子 ----

// ---- 提示词 ----

