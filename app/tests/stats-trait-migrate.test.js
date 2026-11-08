// C 批：特质表迁移（迁出、出身、别名合并、删除表、格位）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DELETED_TRAITS, TRAIT_DEFS, TRAIT_LIMITS, applyTraitChange, getTraitDef, hasTrait, listTraits, migrateTraitCatalog, sanitizeTraits, slotUsage } from '../src/scene/stats/stat-traits.js';
import { TRAIT_MIGRATION } from '../src/scene/stats/stat-status-defs.js';

const on = (src = 'manual', extra = {}) => ({ on: true, src, ...extra });

test('迁出 25 项：旧键仍读得到，但带归类标记、不进评定候选', () => {
    const names = Object.keys(TRAIT_MIGRATION);
    assert.equal(names.length, 27, '个人状态 11 + 关系 14 + 设置 1 + 备注 1');
    for (const n of names) {
        const def = TRAIT_DEFS.find((d) => d.name === n);
        assert.ok(def, n);
        assert.equal(def.moveTo, TRAIT_MIGRATION[n].to, n);
        assert.equal(def.candidate, false, n);
    }
    assert.equal(getTraitDef('forced').moveTo, 'setting');
    assert.equal(getTraitDef('伪装身份').moveTo, 'status');
    assert.equal(getTraitDef('共犯').moveTo, 'relation');
    assert.equal(getTraitDef('精神体').moveTo, 'note');
    assert.equal(getTraitDef('傲娇').moveTo, null);
    const cat = { traits: { 林夏: { 失忆: on(), 共犯: on(), forced: on() } } };
    assert.equal(hasTrait(null, cat, '林夏', '失忆'), true);
    assert.equal(hasTrait(null, cat, '林夏', '共犯'), true);
    assert.equal(hasTrait(null, cat, '林夏', 'forced'), true);
});

test('迁出项不占特质格，特质格满时仍可挂', () => {
    let cat = { traits: { 林夏: { 失忆: on(), 诅咒: on(), 共犯: on() } } };
    assert.equal(slotUsage(cat, '林夏').slots, 0);
    for (const n of ['坚韧', '黏人', '傲娇', '乐天派', '冰山']) cat = applyTraitChange(null, cat, '林夏', n, true, 'manual').catalog;
    assert.equal(slotUsage(cat, '林夏').slots, 5);
    assert.equal(applyTraitChange(null, cat, '林夏', '浪漫', true, 'manual').reason, 'full');
    assert.equal(applyTraitChange(null, cat, '林夏', '旧伤', true, 'manual').reason, undefined);
});

test('出身分组：上限 2、不占特质格；鬼魅系等改名，龙拆龙系与龙族', () => {
    assert.equal(TRAIT_LIMITS.total, 5);
    assert.equal(TRAIT_LIMITS.auto, 3);
    assert.equal(TRAIT_LIMITS.origin, 2);
    assert.equal(TRAIT_LIMITS.achieve, 2);
    for (const n of ['鬼', '魔族', '妖王', '龙族', '狐妖', '蛇妖', 'Alpha', '哨兵', '吸血鬼', '人鱼', '式神']) assert.equal(getTraitDef(n).group, '出身', n);
    assert.equal(getTraitDef('龙系').group, '动物系');
    assert.equal(getTraitDef('龙族').bundle.id, '逆鳞');
    assert.equal(getTraitDef('龙系').bundle, null);
    assert.equal(getTraitDef('鬼魅系'), null);
    let cat = { traits: {} };
    cat = applyTraitChange(null, cat, '林夏', '龙族', true, 'manual').catalog;
    cat = applyTraitChange(null, cat, '林夏', '狐妖', true, 'manual').catalog;
    assert.equal(slotUsage(cat, '林夏').origin, 2);
    assert.equal(slotUsage(cat, '林夏').slots, 0);
    assert.equal(applyTraitChange(null, cat, '林夏', '蛇妖', true, 'manual').reason, 'origin-full');
    assert.equal(listTraits(cat, '林夏').find((t) => t.id === '逆鳞').src, 'bound');
});

test('动物系解耦：动物系占 1 格，捆绑项不占格', () => {
    const r = applyTraitChange(null, { traits: {} }, '林夏', '猫系', true, 'manual');
    assert.deepEqual(listTraits(r.catalog, '林夏').map((t) => t.id + ':' + t.src), ['猫系:manual', '傲娇:bound']);
    assert.equal(slotUsage(r.catalog, '林夏').slots, 1);
});

test('合成不额外占格；隐藏特质占格并保留 hidden', () => {
    const traits = { 林夏: { 犬系: on(), 黏人: on(), 爱撒娇: on(), 'combo:大型犬': on('story', { parts: ['犬系', '黏人', '爱撒娇'] }) } };
    assert.equal(slotUsage({ traits }, '林夏').slots, 3);
    const hid = sanitizeTraits({ 林夏: { 傲娇: on('story', { hidden: true }) } });
    assert.equal(hid.林夏.傲娇.hidden, true);
    assert.equal(slotUsage({ traits: hid }, '林夏').slots, 1);
    assert.equal(listTraits({ traits: hid }, '林夏')[0].hidden, true);
});

test('旧键改名：鬼魅系→鬼，魔族系→魔族，妖王系→妖王，不带 label', () => {
    const out = sanitizeTraits({ 林夏: { 鬼魅系: on(), 魔族系: true, 妖王系: on() } });
    assert.deepEqual(Object.keys(out.林夏).sort(), ['妖王', '鬼', '魔族'].sort());
    assert.equal(out.林夏.鬼.label, undefined);
});

test('别名合并：并入主特质并记原叫法；正名已有时不被覆盖', () => {
    const out = sanitizeTraits({ 林夏: { 学者: on(), 女仆: on(), 地雷系: on() }, 苏晴: { 学霸: on('story'), 书生: on() } });
    assert.equal(out.林夏.学霸.label, '学者');
    assert.equal(out.林夏.贤惠.label, '女仆');
    assert.equal(out.林夏.病娇.label, '地雷系');
    assert.equal(out.苏晴.学霸.src, 'story');
    assert.equal(out.苏晴.学霸.label, undefined);
    assert.equal(hasTrait(null, { traits: out }, '林夏', '学霸'), true);
    assert.equal(listTraits({ traits: out }, '林夏').find((t) => t.id === '学霸').label, '学者');
    for (const pair of [['运动系', '运动解压'], ['嘴硬心软', '傲娇'], ['乖宝宝', '傻白甜'], ['王子病', '自恋'], ['宅', '内向'], ['不良', '混混'], ['道心坚定', '坚韧'], ['侠客', '讲义气'], ['世家子弟', '富二代'], ['猎人', '野外生存']]) {
        assert.ok(sanitizeTraits({ 甲: { [pair[0]]: on() } }).甲[pair[1]], pair.join('→'));
    }
});

test('删除表：旧档里的键静默忽略', () => {
    const marks = Object.fromEntries(DELETED_TRAITS.map((n) => [n, on()]));
    assert.equal(DELETED_TRAITS.length, 17);
    assert.deepEqual(sanitizeTraits({ 林夏: { ...marks, 傲娇: on() } }), { 林夏: { 傲娇: { on: true, src: 'manual' } } });
    assert.deepEqual(sanitizeTraits({ 林夏: marks }), {});
});

test('migrateTraitCatalog 幂等，intimacyForced 由 forced 推出，迁出项条目保留', () => {
    const raw = { traits: { 林夏: { 鬼魅系: on(), 学者: on(), 失忆: on(), forced: on(), 商人: on() } }, intimacyForced: ['苏晴'], other: 1 };
    const once = migrateTraitCatalog(raw);
    assert.deepEqual(Object.keys(once.traits.林夏).sort(), ['forced', '学霸', '失忆', '鬼'].sort());
    assert.deepEqual([...once.intimacyForced].sort(), ['林夏'].sort());
    assert.equal(once.other, 1);
    assert.deepEqual(migrateTraitCatalog(once), once);
    assert.deepEqual(migrateTraitCatalog(null).traits, {});
});
