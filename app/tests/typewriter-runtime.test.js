import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTypewriterEffect,
    cancelTypewriter,
    normalizeTypewriterSettings,
} from '../src/visual/igs-ui/typewriter-runtime.js';

function text(value) {
    return { nodeType: 3, nodeValue: value, childNodes: [] };
}

function lockedText(value) {
    let current = value;
    return {
        nodeType: 3,
        get nodeValue() {
            return current;
        },
        set nodeValue(_nextValue) {
            throw new Error('pure visual typewriter must not write a text node during playback');
        },
        childNodes: [],
    };
}

function element(...children) {
    return { nodeType: 1, childNodes: children, dataset: {} };
}

function createAnimator() {
    const calls = [];
    return {
        calls,
        animate(target, keyframes, timing) {
            const animation = {
                cancelled: false,
                cancel() {
                    this.cancelled = true;
                    this.oncancel?.();
                },
                finish() {
                    this.onfinish?.();
                },
            };
            calls.push({ target, keyframes, timing, animation });
            return animation;
        },
    };
}

test('typewriter settings default to disabled medium and reject invalid speed', () => {
    assert.deepEqual(normalizeTypewriterSettings(null), { enabled: false, speed: 'medium' });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: true, speed: 'fast' }), { enabled: true, speed: 'fast' });
    assert.deepEqual(normalizeTypewriterSettings({ enabled: 'true', speed: 'instant' }), { enabled: false, speed: 'medium' });
});

test('typewriter uses one visual animation without mutating fully rendered nested text', () => {
    const first = lockedText('你好');
    const emphasized = element(lockedText('，世界'));
    const root = element(first, emphasized);
    const animator = createAnimator();
    const result = applyTypewriterEffect(root, {
        enabled: true,
        speed: 'fast',
        key: 'page-1',
        reducedMotion: false,
        animate: animator.animate,
        schedule() {
            throw new Error('pure visual typewriter must not schedule per-character work');
        },
    });

    assert.equal(result.animated, true);
    assert.equal(root.dataset.igsTypewriter, 'running');
    assert.equal(first.nodeValue + emphasized.childNodes[0].nodeValue, '你好，世界');
    assert.equal(animator.calls.length, 1);
    assert.deepEqual(animator.calls[0].keyframes[0], { opacity: 0, clipPath: 'inset(0 100% 0 0)' });
    assert.deepEqual(animator.calls[0].keyframes[1], { opacity: 1, clipPath: 'inset(0 0 0 0)' });
    assert.equal(animator.calls[0].timing.fill, 'both');
    assert.ok(animator.calls[0].timing.duration > 0);
    animator.calls[0].animation.finish();
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(first.nodeValue + emphasized.childNodes[0].nodeValue, '你好，世界');
});

test('typewriter safely falls back to already rendered text when visual animations are unavailable', () => {
    const node = lockedText('不支持动画也可读');
    const root = element(node);
    const result = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'no-waapi', reducedMotion: false });

    assert.equal(result.animated, false);
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(node.nodeValue, '不支持动画也可读');
});

test('typewriter maps fast and slow modes to one bounded visual reveal', () => {
    const content = '纯视觉揭示'.repeat(8);
    const fastRoot = element(text(content));
    const slowRoot = element(text(content));
    const fastAnimator = createAnimator();
    const slowAnimator = createAnimator();

    applyTypewriterEffect(fastRoot, { enabled: true, speed: 'fast', key: 'fast', reducedMotion: false, animate: fastAnimator.animate });
    applyTypewriterEffect(slowRoot, { enabled: true, speed: 'slow', key: 'slow', reducedMotion: false, animate: slowAnimator.animate });

    assert.equal(fastAnimator.calls.length, 1);
    assert.equal(slowAnimator.calls.length, 1);
    assert.ok(fastAnimator.calls[0].timing.duration < slowAnimator.calls[0].timing.duration);
    assert.ok(slowAnimator.calls[0].timing.duration <= 1200);
    assert.equal(fastRoot.childNodes[0].nodeValue, content);
    assert.equal(slowRoot.childNodes[0].nodeValue, content);
    fastAnimator.calls[0].animation.finish();
    slowAnimator.calls[0].animation.finish();
});

test('rerendering the same active page does not restart its visual animation', () => {
    const node = text('不会重启');
    const root = element(node);
    const animator = createAnimator();
    applyTypewriterEffect(root, {
        enabled: true,
        speed: 'medium',
        key: 'stable-page',
        reducedMotion: false,
        animate: animator.animate,
    });

    const repeated = applyTypewriterEffect(root, {
        enabled: true,
        speed: 'medium',
        key: 'stable-page',
        reducedMotion: false,
        animate: animator.animate,
    });
    assert.equal(repeated.animated, true);
    assert.equal(animator.calls.length, 1);
    assert.equal(node.nodeValue, '不会重启');
    animator.calls[0].animation.finish();
});

test('cancelling an active typewriter keeps the already rendered page visible', () => {
    const node = text('完整显示');
    const root = element(node);
    const animator = createAnimator();
    applyTypewriterEffect(root, {
        enabled: true,
        speed: 'slow',
        key: 'page-2',
        reducedMotion: false,
        animate: animator.animate,
    });

    assert.equal(node.nodeValue, '完整显示');
    assert.equal(cancelTypewriter(root), true);
    assert.equal(node.nodeValue, '完整显示');
    assert.equal(root.dataset.igsTypewriter, 'complete');
    assert.equal(animator.calls[0].animation.cancelled, true);
});

test('reduced motion and repeated render keys do not replay animation', () => {
    const root = element(text('直接显示'));
    const animator = createAnimator();
    const reduced = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: true, animate: animator.animate });
    assert.equal(reduced.animated, false);
    applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: false, animate: animator.animate });
    animator.calls[0].animation.finish();
    const replay = applyTypewriterEffect(root, { enabled: true, speed: 'medium', key: 'page-3', reducedMotion: false, animate: animator.animate });
    assert.equal(replay.animated, false);
    assert.equal(root.childNodes[0].nodeValue, '直接显示');
});
