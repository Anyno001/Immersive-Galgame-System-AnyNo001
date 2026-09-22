import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TYPEWRITER_SPEED_MS,
    applyTypewriterEffect,
    cancelTypewriter,
    normalizeTypewriterSettings,
} from '../src/visual/igs-ui/typewriter-runtime.js';

function text(value) {
    return { nodeType: 3, nodeValue: value, childNodes: [] };
}

function element(...children) {
    return { nodeType: 1, childNodes: children, dataset: {} };
}

function createScheduler() {
    const queue = [];
    const delays = [];
    return {
        queue,
        delays,
        schedule(fn, delay) {
            queue.push(fn);
            delays.push(delay);
            return fn;
        },
        clear(timer) {
            const index = queue.indexOf(timer);
            if (index >= 0) queue.splice(index, 1);
        },
        flush() {
            while (queue.length) queue.shift()();
        },
    };
}

test('typewriter settings default to disabled medium and reject invalid speed', () => {
    assert.deepEqual(normalizeTypewriterSettings(null), { enabled: false, speed: 'medium' });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: true, speed: 'fast' }), { enabled: true, speed: 'fast' });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: 'true', speed: 'instant' }), { enabled: false, speed: 'medium' });
});

test('typewriter reveals nested text without replacing element structure', () => {
    const first = text('你好');
    const emphasized = element(text('，世界'));
    const root = element(first, emphasized);
    const scheduler = createScheduler();
    const result = applyTypewriterEffect(root, {
        enabled: true,
        speed: 'fast',
        key: 'page-1',
        reducedMotion: false,
        schedule: scheduler.schedule,
        clear: scheduler.clear,
    });

    assert.equal(result.animated, true);
    assert.equal(root.dataset.igsTypewriter, 'running');
    assert.equal(first.nodeValue, '你');
    assert.equal(emphasized.childNodes[0].nodeValue, '');
    scheduler.flush();
    assert.equal(first.nodeValue + emphasized.childNodes[0].nodeValue, '你好，世界');
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.ok(scheduler.delays.every((delay) => delay === TYPEWRITER_SPEED_MS.fast));
});

test('rerendering the same active page does not restart its typewriter job', () => {
    const node = text('不会重启');
    const root = element(node);
    const scheduler = createScheduler();
    applyTypewriterEffect(root, {
        enabled: true,
        speed: 'medium',
        key: 'stable-page',
        reducedMotion: false,
        schedule: scheduler.schedule,
        clear: scheduler.clear,
    });
    assert.equal(node.nodeValue, '不');

    const repeated = applyTypewriterEffect(root, {
        enabled: true,
        speed: 'medium',
        key: 'stable-page',
        reducedMotion: false,
        schedule: scheduler.schedule,
        clear: scheduler.clear,
    });
    assert.equal(repeated.animated, true);
    assert.equal(node.nodeValue, '不');
    assert.equal(scheduler.queue.length, 1);
    scheduler.flush();
    assert.equal(node.nodeValue, '不会重启');
});

test('cancelling an active typewriter completes the current page', () => {
    const node = text('完整显示');
    const root = element(node);
    const scheduler = createScheduler();
    applyTypewriterEffect(root, {
        enabled: true,
        speed: 'slow',
        key: 'page-2',
        reducedMotion: false,
        schedule: scheduler.schedule,
        clear: scheduler.clear,
    });

    assert.equal(node.nodeValue, '完');
    assert.equal(cancelTypewriter(root), true);
    assert.equal(node.nodeValue, '完整显示');
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(scheduler.queue.length, 0);
});

test('reduced motion and repeated render keys do not replay animation', () => {
    const root = element(text('直接显示'));
    const reduced = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: true });
    assert.equal(reduced.animated, false);
    const scheduler = createScheduler();
    applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: false, schedule: scheduler.schedule, clear: scheduler.clear });
    scheduler.flush();
    const replay = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: false, schedule: scheduler.schedule, clear: scheduler.clear });
    assert.equal(replay.animated, false);
    assert.equal(root.childNodes[0].nodeValue, '直接显示');
});
