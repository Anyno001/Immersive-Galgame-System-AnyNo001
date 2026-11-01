// 与 v0.39.0 原版的差分测试：flip 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/flip.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const old = globalThis.__igsRequire('src/combat/flip.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = prng(33);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function randomReward() {
    const size = pick([0, 1, 3, 3, 4]);
    const slots = Array.from({ length: size }, (_, i) => ({ index: i, kind: pick(['item', 'gear', 'keepsake']), rarity: pick(['common', 'rare']) }));
    const reserve = pick([undefined, null, 'x', slots.map((s) => ({ ...s, rarity: 'epic' })), slots.slice(1)]);
    return { combatId: pick(['c1', 'c2', undefined]), slots, reserve, reveal: pick([undefined, 0, 1, 2, 3, '2']) };
}
function randomPick(size) {
    const flipped = pick([undefined, 'x', Array.from({ length: int(0, 3) }, () => pick([int(0, size), 1.5, -1, 'a']))]);
    return pick([undefined, null, [], 'x', { set: pick(['main', 'reserve', 'zzz']), flipped, choice: pick([undefined, null, 0, 1, 2, 5]) }]);
}

test('flip 导出名一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
    assert.deepStrictEqual(mine.FLIP_SETS, old.FLIP_SETS);
    assert.deepStrictEqual(mine.emptyPick(), old.emptyPick());
});

test('flip 随机差分', () => {
    for (let n = 0; n < 4000; n++) {
        const reward = randomReward();
        const size = reward.slots.length;
        const set = pick(['main', 'reserve']);
        assert.deepStrictEqual(mine.flipCountOf(reward), old.flipCountOf(reward));
        assert.deepStrictEqual(mine.flipOrder(reward, set), old.flipOrder(reward, set));
        assert.deepStrictEqual(mine.revealedOf(reward, set), old.revealedOf(reward, set));
        const raw = randomPick(size);
        assert.deepStrictEqual(mine.normalizePick(raw, reward), old.normalizePick(raw, reward));
        const a = randomPick(size);
        const b = randomPick(size);
        // laterPick 只用规范化后的状态（原版同样如此），另测空值。
        const na = old.normalizePick(a, reward);
        const nb = old.normalizePick(b, reward);
        assert.deepStrictEqual(mine.laterPick(na, nb), old.laterPick(na, nb));
        // 状态机：用合法状态走 flip / choose / reroll / loot / view。
        const state = old.normalizePick(raw, reward) || pick([mine.emptyPick(), { set: 'main', flipped: [0], choice: null }, { set: 'main', flipped: [0, 1], choice: null }, { set: 'main', flipped: [0, 1], choice: 1 }]);
        const position = pick([0, 1, 2, 3, -1, 1.5, 'a', undefined]);
        assert.deepStrictEqual(mine.flipCard(reward, state, position), old.flipCard(reward, state, position));
        assert.deepStrictEqual(mine.chooseCard(reward, state, position), old.chooseCard(reward, state, position));
        const opts = pick([undefined, {}, { points: 100, payer: true }, { points: 10, payer: true }, { points: 100, payer: false }, { points: 100, payer: true, locked: true }]);
        assert.deepStrictEqual(mine.rerollState(reward, state, opts), old.rerollState(reward, state, opts));
        assert.deepStrictEqual(mine.rerollPick(reward, state, opts), old.rerollPick(reward, state, opts));
        assert.deepStrictEqual(mine.lootOf(reward, state), old.lootOf(reward, state));
        assert.deepStrictEqual(mine.flipView(reward, state, opts), old.flipView(reward, state, opts));
    }
    const nullCases = [[null, null], [{ set: 'main', flipped: [0], choice: 0 }, null], [null, { set: 'reserve', flipped: [], choice: null }]];
    for (const [a, b] of nullCases) assert.deepStrictEqual(mine.laterPick(a, b), old.laterPick(a, b));
});
