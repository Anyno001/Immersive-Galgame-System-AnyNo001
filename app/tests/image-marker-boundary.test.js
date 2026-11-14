import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMarkerBoundary, insertImageMarkerOnLine } from '../src/scene/image-marker-layout.js';

const after = (text, needle) => text.indexOf(needle) + needle.length;

test('正文漏写闭合括号只影响本行，后面段落仍可插 CG', () => {
    const text = '<content>\n他说【等等。\n第二段。\n</content>';
    assert.equal(insertImageMarkerOnLine(text, after(text, '等等。'), '[igs-img:1]'),
        '<content>\n他说【等等。\n[igs-img:1]\n第二段。\n</content>');
    assert.ok(imageMarkerBoundary(text, after(text, '第二段。')) > 0);
});

test('中文名尖括号不算未闭合 HTML', () => {
    const text = '<content>\n她低声念出<杨振宇>的名字。\n第二段。\n</content>';
    assert.ok(imageMarkerBoundary(text, after(text, '第二段。')) > 0);
});

test('同一行内的括号仍不拆开', () => {
    const text = '<content>\n[igs-char:不知火舞|动情|你来了]\n</content>';
    assert.equal(imageMarkerBoundary(text, text.indexOf('你来了')), after(text, '你来了]'));
});

test('未闭合的英文 HTML 标签照旧不插', () => {
    const text = '<content>\n<div class="a">\n第二段。\n</content>';
    assert.equal(imageMarkerBoundary(text, after(text, '第二段。')), -1);
});
