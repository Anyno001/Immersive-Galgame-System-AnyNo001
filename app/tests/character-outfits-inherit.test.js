import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLatestOutfits, resolveOutfitAt } from '../src/scene/character-outfits.js';

const resolveKey = (name) => (name === '小林' ? '小林海斗' : name);
const directives = [
    { type: 'char', character: '小林海斗', outfit: '校服', offset: 0 },
    { type: 'char', character: '雪乃', outfit: '和服', offset: 10 },
    { type: 'char', character: '小林海斗', outfit: '', offset: 20 },
    { type: 'thought', character: '小林', outfit: '泳装', offset: 40 },
    { type: 'char', character: '小林海斗', outfit: '默认', offset: 80 },
];

test('gate:outfits:resolve-outfit-follows-latest-before-offset-and-aliases', () => {
    assert.equal(resolveOutfitAt(directives, '小林海斗', 5, {}, resolveKey), '校服');
    assert.equal(resolveOutfitAt(directives, '小林海斗', 30, {}, resolveKey), '校服');
    assert.equal(resolveOutfitAt(directives, '小林', 60, {}, resolveKey), '泳装');
    assert.equal(resolveOutfitAt(directives, '小林海斗', 90, { 小林海斗: '睡衣' }, resolveKey), '');
    assert.equal(resolveOutfitAt(directives, '雪乃', 5, { 雪乃: '浴衣' }, resolveKey), '浴衣');
    assert.equal(resolveOutfitAt(directives, '雪乃', 15, { 雪乃: '浴衣' }, resolveKey), '和服');
    assert.equal(resolveOutfitAt([], '路人', 0, {}, resolveKey), '');
    assert.equal(resolveOutfitAt([], '小林', 0, { 小林海斗: '默认' }, resolveKey), '');
});

test('gate:outfits:collect-latest-outfits-for-cross-floor-inheritance', () => {
    assert.deepEqual(collectLatestOutfits(directives, resolveKey), { 小林海斗: '默认', 雪乃: '和服' });
    assert.deepEqual(collectLatestOutfits(directives.slice(0, 4), resolveKey), { 小林海斗: '泳装', 雪乃: '和服' });
    assert.deepEqual(collectLatestOutfits(null), {});
});
