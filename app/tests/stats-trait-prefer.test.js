// F 批：读数值的好感倍率、清高送礼、保护欲每天一次、互斥轴。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { settleTraitTags } from '../src/scene/stats/stat-trait-hooks.js';
import { AXIS_SKIPPED, TRAIT_DEFS, getTraitByName, setTraitAttrReader, traitCatalogOf, traitScale } from '../src/scene/stats/stat-traits.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';

const on = { on: true, src: 'manual' };
const catOf = (...names) => traitCatalogOf({ 林夏: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) }, true);
const world = (bars = {}) => {
    const c = createCharacter(1, { nsfw: true });
    const base = createStatsState();
    return { ...base, characters: { 林夏: { ...c, dims: { ...c.dims, 好感: 10 } } }, protagonist: { ...base.protagonist, bars: { stamina: 100, money: 0, stress: 0, ...bars } }, clock: { ...base.clock, day: 5 } };
};
const withAttrs = (attrs, fn) => { setTraitAttrReader(() => attrs); try { return fn(); } finally { setTraitAttrReader(null); } };
const up = (state, ...names) => traitScale(state, catOf(...names), '林夏', '好感', 'up');
const six = (patch) => ({ 力量: 13, 敏捷: 11, 体质: 11, 智力: 11, 感知: 11, 魅力: 11, ...patch });

const CASES = [
    ['外貌协会', '魅力', 1.5, 0.6], ['审美清奇', '魅力', 1, 1.5], ['慕强者', '力量', 1.3, 1], ['战斗狂', '敏捷', 1.3, 1],
    ['运动狂', '体质', 1.3, 0.8], ['智性恋', '智力', 1.5, 0.6], ['浪漫主义者', '感知', 1.3, 0.8],
];
for (const [name, key, hi, lo] of CASES) {
    test(`${name}：主角${key}高 ×${hi}、低 ×${lo}、读不到六维不生效`, () => {
        const w = world();
        assert.equal(withAttrs(six({ [key]: 15 }), () => up(w, name)), hi);
        assert.equal(withAttrs(six({ [key]: 8 }), () => up(w, name)), lo);
        assert.equal(withAttrs(six({ [key]: 11 }), () => up(w, name)), 1);
        assert.equal(up(w, name), 1);
    });
}

test('拜金：主角金钱巨额 ×1.5、不足普通档 ×0.6、中间不变', () => {
    assert.equal(up(world({ money: 3000 }), '拜金'), 1.5);
    assert.equal(up(world({ money: 50 }), '拜金'), 0.6);
    assert.equal(up(world({ money: 500 }), '拜金'), 1);
});

test('清高：主角智力或感知高 ×1.3，读不到不生效', () => {
    assert.equal(withAttrs(six({ 感知: 15 }), () => up(world(), '清高')), 1.3);
    assert.equal(withAttrs(six({ 智力: 15 }), () => up(world(), '清高')), 1.3);
    assert.equal(withAttrs(six(), () => up(world(), '清高')), 1);
    assert.equal(up(world(), '清高'), 1);
});

test('保护欲：主角体力低于 30 ×1.3', () => {
    assert.equal(up(world({ stamina: 20 }), '保护欲'), 1.3);
    assert.equal(up(world({ stamina: 60 }), '保护欲'), 1);
});

const tags = (state, directives, cat, ctx = {}) => settleTraitTags(state, directives, { traitCat: cat, nsfw: true, changes: [], events: [], present: ['林夏'], ...ctx });
const favor = (s) => s.characters.林夏.dims.好感;

test('清高：送昂贵礼物那一楼好感少 1，普通礼物不动', () => {
    const gift = { kind: 'gift', target: '林夏', value: '项链' };
    const costly = tags(world(), [gift, { kind: 'money', flow: '花费', value: '昂贵' }], catOf('清高'));
    assert.equal(favor(costly), 9);
    assert.equal(favor(tags(world(), [gift], catOf('清高'))), 10);
});

test('保护欲：主角当面战败那一楼好感 +1，同一天不再触发', () => {
    const events = [{ kind: 'battle', outcome: '败' }];
    const first = tags(world(), [], catOf('保护欲'), { events });
    assert.equal(favor(first), 11);
    assert.equal(favor(tags(first, [], catOf('保护欲'), { events: [{ kind: 'battle', outcome: '败' }] })), 11);
    assert.equal(favor(tags(world(), [], catOf('保护欲'), { events: [{ kind: 'battle', outcome: '胜' }] })), 10);
});

const excl = (a, b) => getTraitByName(a).exclusive.includes(getTraitByName(b).id);

test('互斥轴：两侧互斥、同侧可共存、新旧项都保留', () => {
    assert.ok(excl('冰山', '黏人') && excl('黏人', '冰山'));
    assert.ok(excl('拜金', '清高') && excl('保护欲', '慕强者'));
    assert.ok(excl('审美清奇', '外貌协会'));
    assert.ok(!excl('冰山', '无口'));
    assert.ok(excl('冰山', '高岭之花'));
    assert.ok(!excl('腹黑', '绿茶'));
    assert.ok(excl('犬系', '强势'));
});

test('互斥轴：配方组成项落在两侧时不加互斥', () => {
    // 大型犬配方：犬系、黏人、撒娇精；冰山×黏人等不在同一配方。取配方「高冷猫猫」：傲娇、冰山、猫系；「追妻火葬场」：强势、冷血。
    assert.ok(Array.isArray(AXIS_SKIPPED));
    for (const [a, b] of AXIS_SKIPPED) assert.ok(!excl(a, b), `${a}/${b} 应被豁免`);
    assert.ok(TRAIT_DEFS.length > 0);
});

test('拜金新楼按剧情货币与本聊天价格判断，未就绪不调整，旧楼保持钱包口径', () => {
    const table = { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 };
    const scale = (balance, { ready = true, rev = 3, money = 500 } = {}) => traitScale(world({ money }), catOf('拜金'), '林夏', '好感', 'up', { rev, currency: { ready, balance, table } });
    assert.equal(scale(300), 1.5);
    assert.equal(scale(299), 1);
    assert.equal(scale(30), 1);
    assert.equal(scale(29), 0.6);
    assert.equal(scale(0, { money: 3000 }), 0.6);
    assert.equal(scale(300, { ready: false, money: 0 }), 1);
    assert.equal(scale(0, { ready: false, money: 3000 }), 1);
    assert.equal(scale(0, { rev: 2, money: 3000 }), 1.5);
    assert.equal(scale(300, { rev: 2, money: 50 }), 0.6);
});

test('清高具体金额礼物采用本聊天昂贵档界线，不误用积分与默认价格', () => {
    const gift = { kind: 'gift', target: '林夏', value: '项链' };
    const currency = { ready: true, balance: 1000, table: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 } };
    const run = (amount, ctx = {}) => favor(tags(world({ money: 5000 }), [gift, { kind: 'money', flow: '花费', value: String(amount), amount }], catOf('清高'), { rev: 3, currency, ...ctx }));
    assert.equal(run(89), 10);
    assert.equal(run(90), 9);
    assert.equal(run(500, { currency: { ...currency, table: { 少量: 10, 普通: 100, 昂贵: 900, 巨额: 3000 } } }), 10);
    assert.equal(run(900, { currency: { ...currency, table: { 少量: 10, 普通: 100, 昂贵: 900, 巨额: 3000 } } }), 9);
});

test('完整结算的拜金倍率与流水标记共用剧情货币上下文', () => {
    const table = { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 };
    for (const [money, balance, ready] of [[0, 300, true], [3000, 100, true], [3000, 0, false], [3000, 29, true]]) {
        const state = world({ money });
        const currency = { ready, balance, table };
        const catalog = catOf('拜金');
        const opts = { strengthRev: 3, nsfw: true, favorTier: 'normal', random: () => 0.99, resolveCharacter: (name) => name === '林夏' ? name : null, traits: catalog.traits, currency };
        const result = settleFloorText(state, '[igs-stat:favor|林夏|感动]', opts);
        const row = result.changes.find((change) => change.target === '林夏' && change.key === '好感' && change.source === 'tag');
        assert.ok(row);
        const factor = traitScale(state, catalog, '林夏', '好感', 'up', { rev: 3, currency });
        assert.equal(Boolean(row.traitTags?.includes('拜金')), factor !== 1);
        assert.equal(result.state.protagonist.bars.money, money);
        if (factor === 1) {
            const control = settleFloorText(state, '[igs-stat:favor|林夏|感动]', { ...opts, traits: {} });
            assert.equal(result.state.characters.林夏.dims.好感, control.state.characters.林夏.dims.好感);
        }
    }
});
