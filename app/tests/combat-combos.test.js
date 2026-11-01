// 与 v0.39.0 原版的差分测试：combos 的全部导出。运行需加 --test-force-exit（原包留有句柄）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/combos.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const oldRequire = globalThis.__igsRequire;
const old = oldRequire('src/combat/combos.js');
const oldTemplates = oldRequire('src/combat/card-templates.js').CARD_TEMPLATES;

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = prng(21);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const OPS = ['copy', 'create', 'repeat-last', 'grow', 'discard-hand', 'buff', 'draw', 'energy', 'damage', 'block', 'conditional', null];
function randomEffect(depth = 0) {
    const op = pick(OPS);
    if (op === null) return pick([null, undefined]);
    return {
        op,
        from: pick(['self', 'choose']),
        redraw: rnd() < 0.5,
        trigger: pick(['card-played', 'discard', 'turn-start', undefined]),
        then: depth < 2 ? Array.from({ length: int(0, 2) }, () => randomEffect(depth + 1)) : undefined,
    };
}
const randomList = () => pick([undefined, 'x', Array.from({ length: int(0, 3) }, () => randomEffect())]);
const randomCard = () => pick([undefined, null, { cost: pick([0, 1, 2, 'X']), effects: randomList(), onDiscard: randomList(), trigger: pick([undefined, 'card-played', 'discard']) }]);

test('combos 导出名一致，禁用组合表 id/label 一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(old).sort());
    assert.deepStrictEqual(mine.FORBIDDEN_COMBOS.map((c) => [c.id, c.label]), old.FORBIDDEN_COMBOS.map((c) => [c.id, c.label]));
    assert.ok(Object.isFrozen(mine.FORBIDDEN_COMBOS));
});

test('combos 随机差分（含牌库级特征）', () => {
    for (let n = 0; n < 4000; n++) {
        const card = randomCard();
        assert.deepStrictEqual(mine.forbiddenCombos(card), old.forbiddenCombos(card));
        assert.deepStrictEqual(mine.forbiddenCombos(card, { withDeck: true }), old.forbiddenCombos(card, { withDeck: true }));
    }
    assert.deepStrictEqual(mine.forbiddenCombos(), old.forbiddenCombos());
});

test('combos 每个模板在多组数值下一致', () => {
    for (const [key, tpl] of Object.entries(oldTemplates)) {
        for (let i = 0; i < 5; i++) {
            const values = tpl.vars.map(([lo, hi]) => int(lo, hi));
            const built = tpl.build(values);
            const card = Array.isArray(built) ? { cost: pick([0, 1, 2]), effects: built, onDiscard: tpl.onDiscard } : { cost: pick([0, 1]), ...built };
            assert.deepStrictEqual(mine.forbiddenCombos(card, { withDeck: true }), old.forbiddenCombos(card, { withDeck: true }), key);
        }
    }
});
