// 与 v0.39.0 原版的差分测试：card-templates 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/card-templates.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const old = globalThis.__igsRequire('src/combat/card-templates.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = prng(99);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'mythic', 'personal', 'signature', 'basic', 'zzz', undefined];

// 把含函数的模板表拍平成可比较的纯数据。
function plain(table, sample) {
    return Object.fromEntries(Object.entries(table).map(([key, tpl]) => [key, sample(tpl)]));
}

test('card-templates 导出名一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
    assert.deepStrictEqual(mine.TEMPLATE_COSTS, old.TEMPLATE_COSTS);
    assert.deepStrictEqual(mine.COMPOSITE_SKILL_KEYS, old.COMPOSITE_SKILL_KEYS);
    assert.deepStrictEqual(mine.TRAIT_SKILL_TEMPLATE_KEYS, old.TRAIT_SKILL_TEMPLATE_KEYS);
    for (const name of ['CARD_TEMPLATES', 'PASSIVE_TEMPLATES', 'FLAIR_PASSIVE_TEMPLATES', 'GEAR_PASSIVE_TEMPLATES', 'SKILL_TEMPLATES', 'ITEM_TEMPLATES', 'TEMPLATE_COSTS', 'COMPOSITE_SKILL_KEYS', 'TRAIT_SKILL_TEMPLATE_KEYS']) {
        assert.ok(Object.isFrozen(mine[name]), `${name} 应冻结`);
    }
});

test('card-templates 模板表逐项一致（含键顺序）', () => {
    for (const name of ['CARD_TEMPLATES', 'PASSIVE_TEMPLATES', 'FLAIR_PASSIVE_TEMPLATES', 'GEAR_PASSIVE_TEMPLATES', 'SKILL_TEMPLATES', 'ITEM_TEMPLATES']) {
        assert.deepStrictEqual(Object.keys(mine[name]), Object.keys(old[name]), name);
    }
    const oldCards = plain(old.CARD_TEMPLATES, (tpl) => ({ tpl }));
    for (const [key, tpl] of Object.entries(mine.CARD_TEMPLATES)) {
        const other = oldCards[key].tpl;
        const { build: b1, ...r1 } = tpl;
        const { build: b2, ...r2 } = other;
        assert.deepStrictEqual(r1, r2, key);
        for (let i = 0; i < 8; i++) {
            const values = tpl.vars.map(([lo, hi]) => int(lo, hi));
            assert.deepStrictEqual(b1(values), b2(values), key);
        }
        assert.deepStrictEqual(b1(tpl.vars.map(() => 0)), b2(tpl.vars.map(() => 0)), key);
    }
    for (const name of ['PASSIVE_TEMPLATES', 'FLAIR_PASSIVE_TEMPLATES', 'GEAR_PASSIVE_TEMPLATES', 'ITEM_TEMPLATES']) {
        assert.deepStrictEqual(plain(mine[name], (t) => ({ trigger: t.trigger, label: t.label, effects: t.effects() })), plain(old[name], (t) => ({ trigger: t.trigger, label: t.label, effects: t.effects() })), name);
    }
    for (const [key, tpl] of Object.entries(mine.SKILL_TEMPLATES)) {
        const other = old.SKILL_TEMPLATES[key];
        assert.deepStrictEqual([tpl.intent, tpl.label, tpl.weight, tpl.cooldown], [other.intent, other.label, other.weight, other.cooldown], key);
        for (const power of [0, 1, 7, 20, 55, 300]) assert.deepStrictEqual(tpl.build(power), other.build(power), key);
    }
});

test('card-templates 返回对象互不共享（新对象）', () => {
    const a = mine.passiveFromTemplate('opening-guard');
    a.effects[0].amount = 999;
    assert.strictEqual(mine.passiveFromTemplate('opening-guard').effects[0].amount, 8);
    const solved = mine.solveCardTemplate('strike', 1, 'common');
    solved.effects[0].amount = 999;
    assert.notStrictEqual(mine.solveCardTemplate('strike', 1, 'common').effects[0].amount, 999);
});

test('card-templates solve / cardFromValues / 费用 全组合差分', () => {
    const keys = [...Object.keys(old.CARD_TEMPLATES), 'nope', '__proto__', undefined];
    for (const key of keys) {
        assert.deepStrictEqual(mine.templateCosts(key), old.templateCosts(key), key);
        for (const cost of [0, 1, 2, 3, 'X', 4, undefined]) {
            for (const rarity of RARITIES) {
                assert.deepStrictEqual(mine.solveCardTemplate(key, cost, rarity), old.solveCardTemplate(key, cost, rarity), `${key}|${cost}|${rarity}`);
            }
        }
        for (const wanted of [0, 1, 2, 3, 'X', 5, undefined, -1]) {
            assert.deepStrictEqual(mine.fixedTemplateCost(key, wanted), old.fixedTemplateCost(key, wanted));
            for (const rarity of ['common', 'rare', 'mythic']) {
                assert.deepStrictEqual(mine.nearestTemplateCost(key, wanted, rarity), old.nearestTemplateCost(key, wanted, rarity));
                const fn = (cost) => (cost === 'X' || cost >= 2 ? 'epic' : rarity);
                assert.deepStrictEqual(mine.nearestTemplateCost(key, wanted, fn), old.nearestTemplateCost(key, wanted, fn));
            }
        }
    }
});

test('card-templates cardFromValues 随机差分', () => {
    for (let n = 0; n < 3000; n++) {
        const key = pick(Object.keys(old.CARD_TEMPLATES));
        const tpl = old.CARD_TEMPLATES[key];
        const cost = pick([0, 1, 2, 3, 'X']);
        const rarity = pick(RARITIES);
        const values = pick([
            tpl.vars.map(([lo, hi]) => int(lo, hi)),
            tpl.vars.map(([lo, hi]) => int(lo, Math.min(hi, lo + 3))),
            tpl.vars.map(([, hi]) => hi + 1),
            tpl.vars.map(() => 1.5),
            [],
            undefined,
        ]);
        assert.deepStrictEqual(mine.cardFromValues(key, cost, rarity, values), old.cardFromValues(key, cost, rarity, values), `${key}|${cost}|${rarity}|${values}`);
    }
});

test('card-templates 被动/道具/技能/英雄技能差分', () => {
    const passiveKeys = [...Object.keys(old.GEAR_PASSIVE_TEMPLATES), 'nope', undefined];
    for (const key of passiveKeys) {
        assert.deepStrictEqual(mine.passiveFromTemplate(key), old.passiveFromTemplate(key), key);
        for (const rarity of RARITIES) assert.deepStrictEqual(mine.passiveAtRarity(key, rarity), old.passiveAtRarity(key, rarity), `${key}|${rarity}`);
        for (const slot of ['treasure', 'weapon', undefined]) assert.deepStrictEqual(mine.gearPassiveFromTemplate(key, slot), old.gearPassiveFromTemplate(key, slot));
        for (const tier of [undefined, 0, 1, 2, 3, 1.5, '2']) {
            const base = old.passiveFromTemplate(key);
            assert.deepStrictEqual(mine.passiveAtTier(base, tier), old.passiveAtTier(base, tier));
        }
    }
    for (const key of [...Object.keys(old.ITEM_TEMPLATES), 'nope', undefined]) {
        assert.deepStrictEqual(mine.itemFromTemplate(key), old.itemFromTemplate(key), key);
        for (const rarity of RARITIES) assert.deepStrictEqual(mine.itemAtRarity(key, rarity), old.itemAtRarity(key, rarity), `${key}|${rarity}`);
        const effects = old.itemFromTemplate(key)?.effects;
        assert.deepStrictEqual(mine.itemEffectsForBattle(effects), old.itemEffectsForBattle(effects));
    }
    const conditional = [{ op: 'conditional', when: {}, then: [{ op: 'heal', amount: 1 }, { op: 'block', amount: 2, target: 'enemy' }] }, { op: 'cleanse' }, null];
    assert.deepStrictEqual(mine.itemEffectsForBattle(conditional), old.itemEffectsForBattle(conditional));
    assert.deepStrictEqual(mine.itemEffectsForBattle(undefined), old.itemEffectsForBattle(undefined));
    for (const key of [...Object.keys(old.SKILL_TEMPLATES), 'nope', undefined]) {
        for (const power of [0, 1, 10, 33, 80]) assert.deepStrictEqual(mine.skillFromTemplate(key, power), old.skillFromTemplate(key, power), key);
    }
    for (const key of [...Object.keys(old.CARD_TEMPLATES), 'nope']) {
        assert.deepStrictEqual(mine.heroSkillFromTemplate(key, { id: 'a', name: 'b' }), old.heroSkillFromTemplate(key, { id: 'a', name: 'b' }), key);
        assert.deepStrictEqual(mine.heroSkillFromTemplate(key), old.heroSkillFromTemplate(key), key);
    }
    for (const power of [1, 10, 50]) {
        assert.deepStrictEqual(mine.ultimateSkill(power, { id: 'u' }), old.ultimateSkill(power, { id: 'u' }));
        assert.deepStrictEqual(mine.ultimateSkill(power, { id: 'u', name: 'N', cooldown: 5 }), old.ultimateSkill(power, { id: 'u', name: 'N', cooldown: 5 }));
        assert.deepStrictEqual(mine.ultimateSkill(power), old.ultimateSkill(power));
    }
    for (const arch of ['warrior', 'guardian', 'ranger', 'assassin', 'mage', 'priest', 'summoner', 'bard', 'zzz', undefined]) {
        assert.deepStrictEqual(mine.defaultHeroSkill(arch, 'x1'), old.defaultHeroSkill(arch, 'x1'), arch);
    }
    assert.strictEqual(mine.templateCatalogText(), old.templateCatalogText());
});
