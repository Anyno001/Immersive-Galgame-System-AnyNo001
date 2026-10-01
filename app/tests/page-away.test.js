import test from 'node:test';
import assert from 'node:assert/strict';
import { isPageAway, watchPageAway } from '../src/visual/igs-ui/audio-bus.js';
import { applySceneAudio, cancelSceneAudio } from '../src/visual/igs-ui/scene-audio.js';

function target() {
    const listeners = [];
    return {
        listeners,
        addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
        removeEventListener(type, fn) { const i = listeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
        fire(type) { for (const l of [...listeners]) if (l.type === type) l.fn(); },
    };
}

function page() {
    const win = target();
    const doc = target();
    Object.assign(doc, { hidden: false, focused: true, defaultView: win });
    doc.hasFocus = () => doc.focused;
    Object.assign(win, { document: doc, top: win });
    return { win, doc };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('gate: page away covers window blur, hidden tab and focus inside child iframes', async () => {
    assert.equal(isPageAway(null), false);
    assert.equal(watchPageAway(null, () => {}), null);
    const { win, doc } = page();
    const seen = [];
    const watch = watchPageAway(doc, (away) => seen.push(away));
    // 焦点进入页面内的子 iframe：顶层 blur 但 hasFocus 仍为 true。
    win.fire('blur');
    await tick();
    assert.deepEqual(seen, []);
    // 切到别的程序：页面仍可见，但窗口失焦。
    doc.focused = false;
    win.fire('blur');
    await tick();
    assert.deepEqual(seen, [true]);
    assert.equal(watch.away(), true);
    // 从别的程序直接点回子 iframe：顶层收不到 focus，靠 pointerdown 补查。
    doc.focused = true;
    doc.fire('pointerdown');
    assert.deepEqual(seen, [true, false]);
    // 标签页隐藏当场回调。
    doc.hidden = true;
    doc.fire('visibilitychange');
    assert.deepEqual(seen, [true, false, true]);
    watch.stop();
    assert.equal(doc.listeners.length + win.listeners.length, 0);
});

test('gate: cross-origin top falls back to the own window', () => {
    const { win, doc } = page();
    Object.defineProperty(win, 'top', { get() { throw new Error('cross-origin'); } });
    const watch = watchPageAway(doc, () => {});
    assert.ok(win.listeners.some((l) => l.type === 'blur'));
    watch.stop();
    assert.equal(win.listeners.length, 0);
});

test('gate: bgm pauses when the browser window loses focus and resumes on return', async () => {
    const { win, doc } = page();
    const audio = { plays: 0, pauses: 0, volume: 1, loop: false, src: '', play() { this.plays += 1; return Promise.resolve(); }, pause() { this.pauses += 1; } };
    const root = { ownerDocument: doc };
    applySceneAudio(root, {
        bgm: { enabled: true, volume: 0.5, tracks: [{ url: 'https://example.com/a.mp3', keywords: [] }] },
        audioFactory: () => audio, schedule: () => ({}), clear: () => {}, context: { location: '教室' },
    });
    assert.equal(audio.plays, 1);
    doc.focused = false;
    win.fire('blur');
    await tick();
    assert.equal(audio.pauses, 1, 'switching to another app pauses bgm');
    doc.focused = true;
    win.fire('focus');
    assert.equal(audio.plays, 2, 'returning resumes bgm');
    assert.equal(cancelSceneAudio(root), true);
    assert.equal(doc.listeners.length + win.listeners.length, 0, 'closing the reader unhooks focus listeners');
});

