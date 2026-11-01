// 与 v0.39.0 原版的差分测试：src/combat/enemy-art.js 的逻辑导出（视觉格子换算见 combat-enemy-art.test.js）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/enemy-art.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/combat/enemy-art.js');

test('导出名集合与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(orig).sort());
    assert.deepStrictEqual(mine.ENEMY_ART_KEYS, orig.ENEMY_ART_KEYS);
    assert.strictEqual(mine.ENEMY_ART_BASE_COUNT, orig.ENEMY_ART_BASE_COUNT);
    assert.strictEqual(mine.enemyArtCatalogText(), orig.enemyArtCatalogText());
    assert.ok(Object.isFrozen(mine.ENEMY_ART_KEYS));
});

test('isEnemyArtKey', () => {
    for (const v of [...orig.ENEMY_ART_KEYS, 'x', '', null, undefined, 1, {}, 'beast ']) assert.strictEqual(mine.isEnemyArtKey(v), orig.isEnemyArtKey(v));
});

test('enemyArtKeyFor 名称/阶级覆盖', () => {
    const names = ['宝箱怪', '史莱姆', '哥布林', '石像鬼', '狼人', '蜥蜴人', '半兽人', '蛇怪', '飞龙', '红龙', '幽灵', '骷髅兵', '铜人', '巨人', '小恶魔', '山妖', '巨蟒', '毒蜂', '野猪', '黑狼', '精灵弓手', '精灵女王', '妖精', '矮人铁匠', '魔王', '女帝', '山贼头目', '强盗', '大法师', '女刺客', '禁军骑士', '路人甲', '村姑', '', '  ', null, undefined, '老大娘', '纯魔女'];
    for (const name of names) {
        for (const tier of ['normal', 'elite', 'boss', undefined, 'x']) {
            for (const art of [undefined, 'beast', 'bad', 'elf-f']) {
                assert.strictEqual(mine.enemyArtKeyFor({ art, name, tier }), orig.enemyArtKeyFor({ art, name, tier }), `${name}/${tier}/${art}`);
            }
        }
    }
    assert.strictEqual(mine.enemyArtKeyFor(), orig.enemyArtKeyFor());
    for (let i = 0; i < 300; i += 1) {
        const name = `敌${i}号${i % 3 ? '' : '娘'}`;
        for (const tier of ['normal', 'elite', 'boss']) assert.strictEqual(mine.enemyArtKeyFor({ name, tier }), orig.enemyArtKeyFor({ name, tier }));
    }
});
