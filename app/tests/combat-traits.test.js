// 与 v0.39.0 原版的差分测试：traits 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/traits.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const old = globalThis.__igsRequire('src/combat/traits.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = prng(5);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const randomTrait = () => ({
    traitId: pick(['t1', 't2', 't3', 'h', 'p']),
    kind: pick(['active', 'passive']),
    link: pick([undefined, 'reveal', 'reflip', 'fortune', 'x']),
    rarity: pick(['common', 'rare', 'mythic']),
    passive: pick([undefined, null, { trigger: 'turn-start' }]),
});
const randomProfile = () => pick([undefined, {}, { heroSkill: { id: 'h' }, personalPassive: { id: 'p' } }, { personalPassive: { id: 'p' } }, { heroSkill: { id: 'h' } }]);
const randomCharacter = () => pick([undefined, null, {}, {
    id: pick(['c1', undefined]),
    profile: randomProfile(),
    slotUnlocks: pick([undefined, 0, 1, 2, 3, 9, -1, 1.5]),
    traits: pick([undefined, 'x', Array.from({ length: int(0, 5) }, randomTrait)]),
    innateDropped: pick([undefined, [], ['active'], ['passive'], ['active', 'passive']]),
}]);

test('traits 导出名与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
    for (const key of Object.keys(old)) if (typeof old[key] !== 'function') assert.deepStrictEqual(mine[key], old[key], key);
});

test('traits 随机差分', () => {
    for (let n = 0; n < 4000; n++) {
        const character = randomCharacter();
        const profile = randomProfile();
        assert.deepStrictEqual(mine.innateTraitIds(profile, undefined), old.innateTraitIds(profile, undefined));
        assert.deepStrictEqual(mine.innateTraitIds(profile, 'zz'), old.innateTraitIds(profile, 'zz'));
        assert.deepStrictEqual(mine.nextTraitSlot(character), old.nextTraitSlot(character));
        assert.deepStrictEqual(mine.keptInnateKinds(character), old.keptInnateKinds(character));
        assert.deepStrictEqual(mine.traitSlots(character), old.traitSlots(character));
        assert.deepStrictEqual(mine.traitCount(character), old.traitCount(character));
        assert.deepStrictEqual(mine.activeTraitCount(character), old.activeTraitCount(character));
        const kind = pick(['active', 'passive', undefined]);
        assert.deepStrictEqual(mine.traitFits(character, kind), old.traitFits(character, kind));
        const newTrait = randomTrait();
        const target = pick(['t1', 't2', 't3', 'h', 'p', 'nope', 'c1-h0']);
        assert.deepStrictEqual(mine.traitSwap(character, newTrait, target), old.traitSwap(character, newTrait, target));
        assert.deepStrictEqual(mine.traitPassives(character), old.traitPassives(character));
        const idx = pick([0, 1, 2, 1.5, undefined, 'x']);
        assert.deepStrictEqual(mine.traitSeed('id' + n, idx), old.traitSeed('id' + n, idx));
        const seed = pick(['s' + n, '', undefined]);
        assert.deepStrictEqual(mine.planTrait(seed), old.planTrait(seed));
        const traits = pick([undefined, null, 'x', Array.from({ length: int(0, 5) }, randomTrait)]);
        assert.deepStrictEqual(mine.traitLinks(traits), old.traitLinks(traits));
    }
    assert.deepStrictEqual(mine.planTrait(), old.planTrait());
    // 稀有度分布：各档都能抽到。
    const seen = new Set();
    for (let i = 0; i < 3000; i++) seen.add(mine.planTrait('d' + i).rarity);
    assert.ok(seen.size >= 4);
});
