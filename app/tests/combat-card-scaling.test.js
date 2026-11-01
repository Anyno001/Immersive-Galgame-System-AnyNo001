// 与 v0.39.0 原版的差分测试：card-scaling 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/card-scaling.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const old = globalThis.__igsRequire('src/combat/card-scaling.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = prng(11);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function randomEffect(depth = 0) {
    const op = pick(['damage', 'block', 'heal', 'status', 'draw', 'double', 'next-turn', 'each-turn', 'buff', 'conditional', 'exhaust-self', 'nope', null]);
    if (op === null) return pick([null, undefined, 5]);
    const effect = { op, amount: int(0, 120), stacks: int(0, 14), target: 'enemy' };
    if (['each-turn', 'buff', 'conditional'].includes(op)) effect.then = depth < 2 ? Array.from({ length: int(0, 2) }, () => randomEffect(depth + 1)) : pick([undefined, []]);
    return effect;
}
const randomEffects = () => pick([undefined, null, 'x']) ?? Array.from({ length: int(0, 4) }, () => randomEffect());
const randomCharacter = () => pick([undefined, null, {}, { scores: { str: int(1, 30), dex: int(1, 30), con: int(1, 30), int: int(1, 30), wis: int(1, 30), cha: int(1, 30) }, proficiency: pick([0, 2, 4, '3', undefined]) }, { scores: {} }]);
const randomCard = () => pick([undefined, null, { rarity: 'basic', effects: randomEffects() }, { rarity: pick(['common', 'uncommon', 'rare', 'epic', 'mythic', 'personal', 'signature', 'weird']), effects: randomEffects(), ...(rnd() < 0.5 ? { upgraded: { effects: randomEffects() } } : {}) }]);

test('card-scaling 导出名与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
    for (const key of Object.keys(old)) if (typeof old[key] !== 'function') assert.deepStrictEqual(mine[key], old[key], key);
});

test('card-scaling 随机差分', () => {
    for (let n = 0; n < 4000; n++) {
        const effects = randomEffects();
        const character = randomCharacter();
        const card = randomCard();
        assert.deepStrictEqual(mine.requiredAbility(effects, character), old.requiredAbility(effects, character));
        assert.deepStrictEqual(mine.effectNumbers(effects), old.effectNumbers(effects));
        assert.deepStrictEqual(mine.isFixedCard(card), old.isFixedCard(card));
        assert.deepStrictEqual(mine.scaleCard(card, character), old.scaleCard(card, character));
        const multiplier = pick([1, 0.7, 1.3, 0.85, 1.17, 0.33]);
        assert.deepStrictEqual(mine.scaleEffects(effects, multiplier), old.scaleEffects(effects, multiplier));
        const ability = pick(['str', 'dex', 'con', 'int', 'wis', 'cha', 'zzz', null]);
        const required = pick([10, 14, 18, NaN, undefined, Infinity]);
        assert.deepStrictEqual(mine.scalingMultiplier(character, ability, required), old.scalingMultiplier(character, ability, required));
        const skills = pick([undefined, 'x', Array.from({ length: int(0, 3) }, () => pick([null, { effects: randomEffects() }]))]);
        assert.deepStrictEqual(mine.scaleSkills(skills, character), old.scaleSkills(skills, character));
        const base = pick([undefined, [], effects && Array.isArray(effects) ? mine.effectNumbers(effects).map((v) => v + int(-2, 2)) : []]);
        assert.deepStrictEqual(mine.scalingMarks(effects, base), old.scalingMarks(effects, base));
    }
});

test('card-scaling 目录缩放（Map 与对象）', () => {
    const character = { scores: { str: 18, dex: 8, con: 12, int: 12, wis: 12, cha: 12 }, proficiency: 2 };
    const catalog = { a: { rarity: 'rare', effects: [{ op: 'damage', amount: 10 }] }, b: { rarity: 'basic', effects: [] }, c: null };
    assert.deepStrictEqual(mine.scaleCatalog(catalog, character), old.scaleCatalog(catalog, character));
    assert.deepStrictEqual(mine.scaleCatalog(new Map(Object.entries(catalog)), character), old.scaleCatalog(new Map(Object.entries(catalog)), character));
    assert.deepStrictEqual(mine.scaleCatalog(undefined, character), old.scaleCatalog(undefined, character));
});
