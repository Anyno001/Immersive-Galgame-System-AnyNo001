// 与 v0.39.0 原版的差分测试：enemy-loadout 的全部导出。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/enemy-loadout.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/combat/enemy-loadout.js');

const DIFFICULTIES = ['easy', 'normal', 'hard', 'brutal', 'nightmare', undefined, 'bogus'];
const TIERS = ['normal', 'elite', 'boss', 'bad', undefined];

function enemies() {
    const list = [];
    for (let i = 0; i < 25; i += 1) {
        for (const tier of TIERS) {
            list.push({ id: `e${i}`, tier, generated: i % 3 === 0 ? false : undefined, skills: Array.from({ length: i % 5 }, (_, n) => ({ name: ['斩击', '重劈', '自创', '连击'][n % 4] })) });
        }
    }
    list.push(null, undefined, {}, { id: 'x' }, { id: 'x', tier: 'boss', skills: 'no' }, { tier: 'elite', skills: [] });
    return list;
}

test('导出名集合与词缀表一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(orig).sort());
    assert.deepStrictEqual(mine.ENEMY_AFFIXES, orig.ENEMY_AFFIXES);
    assert.ok(Object.isFrozen(mine.ENEMY_AFFIXES) && Object.isFrozen(mine.ENEMY_AFFIXES.rite.effects));
});

test('enemyAffixes / enemyFillSkills / enemyLoadout 差分', () => {
    for (const enemy of enemies()) {
        for (const diff of DIFFICULTIES) {
            assert.deepStrictEqual(mine.enemyAffixes(enemy, diff), orig.enemyAffixes(enemy, diff));
            for (const level of [undefined, 1, 5, 12, 20]) {
                assert.deepStrictEqual(mine.enemyFillSkills(enemy, level, diff), orig.enemyFillSkills(enemy, level, diff));
                assert.deepStrictEqual(mine.enemyLoadout(enemy, level, diff), orig.enemyLoadout(enemy, level, diff));
            }
        }
    }
    assert.deepStrictEqual(mine.enemyAffixes(), orig.enemyAffixes());
});

test('词缀 effects 是拷贝，不会改动共享常量', () => {
    const before = JSON.stringify(mine.ENEMY_AFFIXES);
    const out = mine.enemyAffixes({ id: 'boss1', tier: 'boss' }, 'nightmare');
    for (const a of out) a.effects.push({ op: 'x' });
    assert.strictEqual(JSON.stringify(mine.ENEMY_AFFIXES), before);
});
