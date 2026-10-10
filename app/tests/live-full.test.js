import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyLiveFull,
    classifySubtitle,
    clearLiveFull,
    exceedsSubtitleLines,
    isLiveFullActive,
    refreshLiveFullOverflow,
    resolveLiveFullMode,
} from '../src/visual/igs-ui/live-full.js';
import { normalizeLiveFxSettings } from '../src/visual/igs-ui/danmaku-settings.js';

function fakeNode(height = 0) {
    const attrs = new Map();
    return {
        attrs,
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        removeAttribute: (k) => attrs.delete(k),
        getBoundingClientRect: () => ({ height }),
        ownerDocument: { defaultView: { getComputedStyle: () => ({ fontSize: '20px', lineHeight: '30px' }) } },
    };
}

test('gate:live-full:active-only-for-visible-full-layout', () => {
    assert.equal(isLiveFullActive({ layout: 'full', visible: true }), true);
    assert.equal(isLiveFullActive({ layout: 'full', visible: false }), false);
    assert.equal(isLiveFullActive({ layout: 'phone', visible: true }), false);
});

test('gate:live-full:subtitle-kinds-host-other-narration', () => {
    const base = { hostName: '爱丽丝', userName: '小明' };
    assert.equal(classifySubtitle({ ...base, speaker: '爱丽丝', textType: 'dialogue' }), 'host');
    assert.equal(classifySubtitle({ ...base, speaker: '鲍勃', textType: 'dialogue' }), 'other');
    assert.equal(classifySubtitle({ ...base, speaker: '', textType: 'narration' }), 'narration');
    assert.equal(classifySubtitle({ ...base, speaker: '鲍勃', textType: 'narration' }), 'narration');
    assert.equal(classifySubtitle({ ...base, speaker: '小明', textType: 'thought' }), 'narration');
    assert.equal(classifySubtitle({ ...base, speaker: '小明', textType: 'dialogue' }), 'other');
    assert.equal(classifySubtitle({ ...base, speaker: '爱丽丝', textType: 'thought' }), 'host');
});

test('gate:live-full:long-text-never-falls-back-to-dialog', () => {
    assert.equal(exceedsSubtitleLines(150, 30), false);
    assert.equal(exceedsSubtitleLines(180, 30), true);
    assert.equal(exceedsSubtitleLines(0, 30), false);
    assert.equal(exceedsSubtitleLines(100, NaN), false);
    // 只有设置里明确选了对话框、或旁白位置选了对话框才出对话框；长文本永远是字幕。
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'above', kind: 'host', overflow: true }), 'subtitle');
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'above', kind: 'other' }), 'subtitle');
    assert.equal(resolveLiveFullMode({ fullText: 'dialog', narrationPos: 'above', kind: 'host' }), 'dialog');
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'dialog', kind: 'narration' }), 'minimal');
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'dialog', kind: 'other' }), 'subtitle');
});

// 高度随字号缩放的假文字节点：lines 是每级缩放后的行数，验证逐级缩小与最终滚动。
function scalingText(root, lines) {
    const node = fakeNode();
    node.getBoundingClientRect = () => ({ height: lines[Number(root.getAttribute('data-igs-live-fit') || 0)] * 30 });
    return node;
}

test('gate:live-full:subtitle-shrinks-then-scrolls-and-resets-per-page', () => {
    const root = fakeNode();
    applyLiveFull(root, { fullText: 'subtitle', narrationPos: 'above', kind: 'other', speaker: '李哪吒', textEl: fakeNode(60) });
    assert.equal(refreshLiveFullOverflow(root, scalingText(root, [4, 4, 4, 4])), false);
    assert.equal(root.getAttribute('data-igs-live-fit'), null);
    assert.equal(refreshLiveFullOverflow(root, scalingText(root, [6, 5, 5, 5])), true);
    assert.equal(root.getAttribute('data-igs-live-fit'), '1');
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    // 一直放不下：缩到下限后内部滚动，仍是字幕。
    assert.equal(refreshLiveFullOverflow(root, scalingText(root, [9, 8, 7, 7])), true);
    assert.equal(root.getAttribute('data-igs-live-fit'), '3');
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    // 翻页重新挂标记后从原始字号重量。
    applyLiveFull(root, { fullText: 'subtitle', narrationPos: 'above', kind: 'host', speaker: '爱丽丝', textEl: fakeNode(60) });
    assert.equal(refreshLiveFullOverflow(root, scalingText(root, [2, 2, 2, 2])), false);
    assert.equal(root.getAttribute('data-igs-live-fit'), null);
    // 对话框形态不量。
    applyLiveFull(root, { fullText: 'dialog', narrationPos: 'above', kind: 'host', textEl: fakeNode(60) });
    assert.equal(refreshLiveFullOverflow(root, scalingText(root, [9, 9, 9, 9])), false);
    clearLiveFull(root, fakeNode());
    assert.equal(root.getAttribute('data-igs-live-fit'), null);
    assert.equal(root.getAttribute('data-igs-live-full'), null);
});

test('gate:live-full:marks-and-clear', () => {
    const root = fakeNode();
    const text = fakeNode(130);
    applyLiveFull(root, { fullText: 'subtitle', narrationPos: 'name', kind: 'other', speaker: '鲍勃', textEl: text });
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    assert.equal(root.getAttribute('data-igs-live-sub'), 'other');
    assert.equal(root.getAttribute('data-igs-live-npos'), 'name');
    assert.equal(text.getAttribute('data-igs-sub-name'), '鲍勃');
    // 130 / 30 约 4 行，不超 5 行，保持字幕。
    assert.equal(refreshLiveFullOverflow(root, text), false);
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    clearLiveFull(root, text);
    assert.equal(root.getAttribute('data-igs-live-full'), null);
    assert.equal(root.getAttribute('data-igs-live-sub'), null);
    assert.equal(text.getAttribute('data-igs-sub-name'), null);
});

test('gate:live-full:settings-normalize-defaults-and-bad-values', () => {
    const d = normalizeLiveFxSettings({});
    assert.equal(d.fullText, 'subtitle');
    assert.equal(d.narrationPos, 'above');
    const ok = normalizeLiveFxSettings({ fullText: 'dialog', narrationPos: 'name' });
    assert.equal(ok.fullText, 'dialog');
    assert.equal(ok.narrationPos, 'name');
    const bad = normalizeLiveFxSettings({ fullText: 'x', narrationPos: 7 });
    assert.equal(bad.fullText, 'subtitle');
    assert.equal(bad.narrationPos, 'above');
});
