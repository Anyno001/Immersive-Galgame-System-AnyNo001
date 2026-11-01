// 与 v0.39.0 原版的差分测试：acquire-candidates 的全部导出。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/acquire-candidates.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/combat/acquire-candidates.js');

// 固定种子 PRNG。
function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test('导出名集合与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(orig).sort());
    for (const k of ['CANDIDATE_MIN', 'CANDIDATE_MAX', 'GEAR_PASSIVE_CHANCE']) assert.deepStrictEqual(mine[k], orig[k]);
    assert.ok(Object.isFrozen(mine.GEAR_PASSIVE_CHANCE));
});

test('gearHasPassive 多组输入', () => {
    const rnd = prng(7);
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'mythic', 'basic', undefined, null, 'x']) {
        for (let i = 0; i < 60; i += 1) {
            const key = i % 7 === 0 ? undefined : `gear-${Math.floor(rnd() * 1e6)}`;
            assert.strictEqual(mine.gearHasPassive(key, rarity), orig.gearHasPassive(key, rarity));
        }
    }
});

test('templateCandidates 多组输入', () => {
    const rnd = prng(11);
    const pool = '火焰斩击冰霜护盾治愈之光雷霆万钧毒牙暗影突袭守护者的誓言'.split('');
    const word = () => pool.slice(Math.floor(rnd() * 8), Math.floor(rnd() * 8) + 2 + Math.floor(rnd() * 4)).join('');
    for (let i = 0; i < 200; i += 1) {
        const keys = Array.from({ length: Math.floor(rnd() * 9) }, () => `k${Math.floor(rnd() * 6)}`);
        const names = Object.fromEntries(Array.from({ length: 8 }, (_, n) => [`k${n}`, word()]));
        const text = [word(), '第3层 火焰!', '', null, undefined, '１２ 冰霜，的了'][Math.floor(rnd() * 6)];
        const opts = [undefined, { min: 1, max: 2 }, { min: 0 }, { max: 9 }, {}][Math.floor(rnd() * 5)];
        const seed = `s${Math.floor(rnd() * 5)}`;
        const describe = (k) => names[k];
        assert.deepStrictEqual(mine.templateCandidates(keys, describe, text, seed, opts), orig.templateCandidates(keys, describe, text, seed, opts));
    }
    assert.deepStrictEqual(mine.templateCandidates([], () => '', '', 's'), orig.templateCandidates([], () => '', '', 's'));
});
