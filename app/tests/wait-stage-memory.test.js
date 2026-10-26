import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryDeck, memoryColumns, MEMORY_LEVEL_PAIRS } from '../src/visual/igs-ui/wait-stage-games.js';

const pics = (n) => Array.from({ length: n }, (_, i) => ({ url: `u${i}` }));

test('翻牌关卡按 2/4/8/16/32 张递增', () => {
    assert.deepEqual(MEMORY_LEVEL_PAIRS.map((pairs) => pairs * 2), [2, 4, 8, 16, 32]);
});

test('按对数建牌堆，每张图恰好成对', () => {
    const deck = buildMemoryDeck(pics(20), 8, () => 0.3);
    assert.equal(deck.length, 16);
    const counts = new Map();
    for (const card of deck) counts.set(card.url, (counts.get(card.url) || 0) + 1);
    assert.ok([...counts.values()].every((count) => count === 2));
    assert.equal(new Set(deck.map((card) => card.id)).size, 16);
});

test('图不够多时同一张图复用于多对，牌数仍然准确', () => {
    const deck = buildMemoryDeck([...pics(3), { url: 'u0' }, { url: '' }], 16, Math.random);
    assert.equal(deck.length, 32);
    assert.equal(new Set(deck.map((card) => card.id)).size, 32);
    assert.ok(new Set(deck.map((card) => card.url)).size <= 3);
    for (const url of new Set(deck.map((card) => card.url))) {
        assert.equal(deck.filter((card) => card.url === url).length % 2, 0);
    }
});

test('没有可用图时返回空牌堆', () => {
    assert.deepEqual(buildMemoryDeck([], 4), []);
    assert.deepEqual(buildMemoryDeck([{ url: '' }, null], 4), []);
});

test('列数随牌数自适应', () => {
    assert.deepEqual([2, 4, 8, 16, 32].map(memoryColumns), [2, 2, 4, 4, 8]);
});
