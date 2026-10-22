import test from 'node:test';
import assert from 'node:assert/strict';
import { narrationKeepsSprite } from '../src/scene/narration-sprite.js';

test('narration-sprite: 写到这个人离开就清掉，之后的旁白也不沿用', () => {
    const left = '李伯躬身应了一声，端着茶盘退向茶水间。';
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: [left] }), false);
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: [left, '你穿过走廊，推开自己房间的雕花木门。'] }), false);
});

import { narrationCastLeft, otherNamesOf } from '../src/scene/narration-sprite.js';

const OTHERS = ['司徒言', '李伯'];
const keeps = (pages, extra = {}) => narrationKeepsSprite({ name: '苏念', others: OTHERS, pages, ...extra });

test('narration-sprite: 回来 / 走进 之后立绘恢复，再离开又清', () => {
    assert.equal(keeps(['苏念走出了房间。', '她推门进来，手里端着茶。']), true);
    assert.equal(keeps(['苏念走出了房间。', '雨声。', '雨声。', '苏念推门而入。']), true);
    assert.equal(keeps(['苏念走出了房间。', '苏念又走进来。', '她再次转身离开。']), false);
    assert.equal(keeps(['苏念走出了房间。', '司徒言走进来。']), false);
});
