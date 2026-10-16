import test from 'node:test';
import assert from 'node:assert/strict';
import { narrationKeepsSprite } from '../src/scene/narration-sprite.js';

test('narration-sprite: 写到这个人离开就清掉，之后的旁白也不沿用', () => {
    const left = '李伯躬身应了一声，端着茶盘退向茶水间。';
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: [left] }), false);
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: [left, '你穿过走廊，推开自己房间的雕花木门。'] }), false);
});

test('narration-sprite: 离开的是别人、或名字离动作太远，不清', () => {
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: ['司徒言的脚步声在走廊转角处消失了。'] }), true);
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: ['李伯看了看你另一只手，又看了看窗外的花园和远处的山，司徒先生早已离开。'] }), true);
});

test('narration-sprite: 紧跟台词的 2 页沿用，再往后要旁白还写着这个人', () => {
    const plain = ['房间里飘着清淡的冷香。', '衣帽间、卫浴和落地窗一应俱全。', '窗外下起了小雨。'];
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: plain.slice(0, 2) }), true);
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: plain }), false);
    assert.equal(narrationKeepsSprite({ name: '李伯', pages: [...plain.slice(0, 2), '李伯还站在门口。'] }), true);
});

test('narration-sprite: 第二人称视角角色写作「你」也算写到；三字名认后两字', () => {
    const pages = ['房间里飘着清淡的冷香。', '衣帽间一应俱全。', '你在床沿坐下，拿出备用手机。'];
    assert.equal(narrationKeepsSprite({ name: '李哪吒', pov: true, pages }), true);
    assert.equal(narrationKeepsSprite({ name: '李哪吒', pov: false, pages }), false);
    assert.equal(narrationKeepsSprite({ name: '李哪吒', pages: [...pages.slice(0, 2), '哪吒盯着屏幕。'] }), true);
    // 视角角色「你离开」不清：镜头跟着走。
    assert.equal(narrationKeepsSprite({ name: '李哪吒', pov: true, pages: ['你离开了客厅。'] }), true);
});
