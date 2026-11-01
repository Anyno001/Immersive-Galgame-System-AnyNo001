// 与 v0.39.0 原版的差分测试：trait-pool 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/trait-pool.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const old = globalThis.__igsRequire('src/combat/trait-pool.js');

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'mythic'];

test('trait-pool 导出名与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
    assert.deepStrictEqual(mine.TRAIT_FIELD_COUNTS, old.TRAIT_FIELD_COUNTS);
    assert.strictEqual(mine.PASSIVE_BUDGET, old.PASSIVE_BUDGET);
    assert.deepStrictEqual(mine.TRAIT_CONDITIONS, old.TRAIT_CONDITIONS);
    assert.deepStrictEqual(mine.TRAIT_TRIGGERS, old.TRAIT_TRIGGERS);
    assert.deepStrictEqual(mine.TRAIT_FIELDS.map((f) => [f.key, f.max]), old.TRAIT_FIELDS.map((f) => [f.key, f.max]));
    for (const [i, f] of mine.TRAIT_FIELDS.entries()) {
        for (const n of [1, 2, 5, 30]) {
            assert.deepStrictEqual(f.build(n), old.TRAIT_FIELDS[i].build(n), f.key);
            assert.strictEqual(f.label(n), old.TRAIT_FIELDS[i].label(n), f.key);
        }
    }
    for (const name of ['TRAIT_FIELD_COUNTS', 'TRAIT_TRIGGERS', 'TRAIT_FIELDS', 'TRAIT_CONDITIONS']) assert.ok(Object.isFrozen(mine[name]), name);
});

test('trait-pool 各稀有度的池一致', () => {
    for (const rarity of RARITIES) {
        assert.deepStrictEqual(mine.traitPool(rarity), old.traitPool(rarity), rarity);
        assert.ok(Object.isFrozen(mine.traitPool(rarity)));
        assert.strictEqual(mine.traitPool(rarity), mine.traitPool(rarity));
    }
    assert.deepStrictEqual(mine.traitPool('zzz'), old.traitPool('zzz'));
});

test('trait-pool planTraitShape 随机差分', () => {
    for (let n = 0; n < 2500; n++) {
        const seed = n % 7 === 0 ? `s${n}|${n}` : `seed-${n}`;
        const rarity = RARITIES[n % RARITIES.length];
        assert.deepStrictEqual(mine.planTraitShape(seed, rarity), old.planTraitShape(seed, rarity), `${seed}|${rarity}`);
    }
});
