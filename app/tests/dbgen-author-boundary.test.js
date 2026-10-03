import test from 'node:test';
import assert from 'node:assert/strict';
import { nsfwClothingBoostLine } from '../src/generated-images/dbgen-prompt.js';

test('衣柜增强保留作者原有提示词，不重新加入越界文案', () => {
    const character = nsfwClothingBoostLine('character');
    const clothes = nsfwClothingBoostLine();
    assert.ok(character.startsWith('这套是色情服装。'));
    assert.ok(clothes.startsWith('这是色情服装。'));
    assert.ok(!character.includes('角色是成年人。'));
    assert.ok(!clothes.includes('这是成年人穿的色情服装。'));
});
