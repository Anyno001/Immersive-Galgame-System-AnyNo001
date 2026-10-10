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

test('gate:live-full:more-than-three-lines-falls-back', () => {
    assert.equal(exceedsSubtitleLines(90, 30), false);
    assert.equal(exceedsSubtitleLines(120, 30), true);
    assert.equal(exceedsSubtitleLines(0, 30), false);
    assert.equal(exceedsSubtitleLines(100, NaN), false);
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'above', kind: 'host', overflow: true }), 'minimal');
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'above', kind: 'host', overflow: false }), 'subtitle');
    assert.equal(resolveLiveFullMode({ fullText: 'dialog', narrationPos: 'above', kind: 'host', overflow: true }), 'dialog');
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'dialog', kind: 'narration', overflow: false }), 'minimal');
    assert.equal(resolveLiveFullMode({ fullText: 'subtitle', narrationPos: 'dialog', kind: 'other', overflow: false }), 'subtitle');
});

test('gate:live-full:marks-and-overflow-and-clear', () => {
    const root = fakeNode();
    const text = fakeNode(130);
    applyLiveFull(root, { fullText: 'subtitle', narrationPos: 'name', kind: 'other', speaker: '鲍勃', textEl: text });
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    assert.equal(root.getAttribute('data-igs-live-sub'), 'other');
    assert.equal(root.getAttribute('data-igs-live-npos'), 'name');
    assert.equal(text.getAttribute('data-igs-sub-name'), '鲍勃');
    assert.equal(refreshLiveFullOverflow(root, text), true);
    assert.equal(root.getAttribute('data-igs-live-full'), 'minimal');
    // 翻页重新挂标记，恢复字幕；不超行则保持。
    applyLiveFull(root, { fullText: 'subtitle', narrationPos: 'above', kind: 'host', speaker: '爱丽丝', textEl: fakeNode(60) });
    assert.equal(root.getAttribute('data-igs-live-full'), 'subtitle');
    assert.equal(refreshLiveFullOverflow(root, fakeNode(60)), false);
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
