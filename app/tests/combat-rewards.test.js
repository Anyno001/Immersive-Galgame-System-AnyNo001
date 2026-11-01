// 与 v0.39.0 原版的差分测试：rewards 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/rewards.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const old = globalThis.__igsRequire('src/combat/rewards.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = prng(44);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

test('rewards 导出名一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
});

test('rewards 随机差分', () => {
    for (let n = 0; n < 4000; n++) {
        const args = pick([undefined, {}, {
            combatId: pick(['c' + n, undefined, '']),
            tier: pick(['normal', 'elite', 'boss', 'weird', undefined]),
            enemyTiers: pick([undefined, [], ['normal'], ['elite', 'boss', 'normal'], Array.from({ length: int(0, 8) }, () => pick(['normal', 'elite', 'boss']))]),
            character: pick([null, undefined, { id: 'h', kind: 'deck-character' }, { id: 'n', kind: 'npc' }]),
            links: pick([undefined, null, { reveal: 2, reflip: true, fortune: true }, { reveal: 1 }, { reflip: true }, { fortune: true }, { reveal: 3, reflip: 1 }]),
            difficulty: pick([undefined, 'easy', 'normal', 'hard', 'brutal', 'nightmare', 'zzz']),
        }]);
        assert.deepStrictEqual(mine.planRewardSlots(args), old.planRewardSlots(args));
    }
    assert.deepStrictEqual(mine.planRewardSlots(), old.planRewardSlots());
    for (const tiers of [undefined, [], ['normal'], ['boss', 'boss', 'boss', 'boss', 'boss', 'boss', 'boss', 'boss', 'boss', 'boss', 'boss', 'boss']]) {
        assert.deepStrictEqual(mine.victoryExpFor(tiers), old.victoryExpFor(tiers));
    }
});
