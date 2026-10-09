import test from 'node:test';
import assert from 'node:assert/strict';
import { floorHasEventCg, normalizeEventCgs, resolveEventCgForPage } from '../src/scene/event-cg.js';

const lib = { 初遇: { url: 'https://x.test/a.png', keywords: '樱花树下，初次见面' }, 空: { url: '', keywords: ['空着'] } };

test('gate:event-cg keywords trigger and hold, tag triggers the page after it, empty url never shows', () => {
    assert.deepEqual(normalizeEventCgs(lib).初遇.keywords, ['樱花树下', '初次见面']);
    const segments = ['走进校园。', '在樱花树下遇见了她。', '她笑了。', '我们聊了很久。', '天黑了。', '回家。'];
    assert.equal(resolveEventCgForPage({ segments, index: 0, holdPages: 3, eventCgs: lib }), null);
    assert.equal(resolveEventCgForPage({ segments, index: 3, holdPages: 3, eventCgs: lib }).name, '初遇');
    assert.equal(resolveEventCgForPage({ segments, index: 4, holdPages: 3, eventCgs: lib }), null);
    const source = '天黑了。[igs-cg:初遇]\n回家。';
    assert.equal(resolveEventCgForPage({ source, segments: ['天黑了。', '回家。'], index: 1, eventCgs: lib }).name, '初遇');
    assert.equal(resolveEventCgForPage({ segments: ['空着的房间'], index: 0, eventCgs: lib }), null);
    assert.equal(floorHasEventCg('在樱花树下', lib), true);
    assert.equal(floorHasEventCg('空着', lib), false);
});
