import test from 'node:test';
import assert from 'node:assert/strict';
import { columnLooksTextual, formatNumberCell, readAttributeCell, scaleValue, suspectRange, writeAttributeCell } from '../src/scene/stats/stat-cell-format.js';

test('数字列按原格式写回，负数保留负号（易错点 F12）', () => {
    assert.equal(formatNumberCell('45/100', 34), '34/100');
    assert.equal(formatNumberCell('45%', 34), '34%');
    assert.equal(formatNumberCell('20%', -20), '-20%');
    assert.equal(formatNumberCell('-5%', 12), '12%');
    assert.equal(formatNumberCell('', 34, { percent: true }), '34%');
    assert.equal(formatNumberCell('', 34), '34');
});

test('多属性格只替换目标属性，其余逐字保留，缺的追加（易错点 F3）', () => {
    const cell = '健康:60；力量:45；敏捷:55；理智:50；观察:62；魅力:58；';
    assert.equal(writeAttributeCell(cell, { 力量: 47 }), '健康:60；力量:47；敏捷:55；理智:50；观察:62；魅力:58；');
    assert.equal(writeAttributeCell('烹饪:20；', { 烹饪: 30, 学习: 40 }), '烹饪:30；学习:40；');
    assert.deepEqual(readAttributeCell(cell).观察, 62);
    assert.equal(writeAttributeCell('', {}), '');
});

test('文字列与范围异常识别（易错点 F10/F11）', () => {
    assert.equal(columnLooksTextual(['略有好感', '朋友', '45']), true);
    assert.equal(columnLooksTextual(['45%', '20%', '']), false);
    assert.deepEqual(suspectRange(['12', '15', '9']), { min: 9, max: 15 });
    assert.equal(suspectRange(['45', '70']), null);
    assert.equal(scaleValue(50, { from: [10, 90], to: [3, 18] }), 11);
    assert.equal(scaleValue(49.6), 50);
});
