import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STAGE_SHAKE_EMOTIONS,
    STAGE_SHAKE_INTENSITY_PARAMS,
    applyStageShakeEffect,
    cancelStageShakeEffect,
    isStageShakeEmotion,
    normalizeStageShakeSettings,
} from '../src/visual/igs-ui/stage-shake-runtime.js';

function makeStage() {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    return {
        dataset: {},
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        getAttribute(name) { return attrs.get(name) || null; },
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
        finishAnimation() { const listener = listeners.get('animationend'); if (listener) listener(); },
    };
}

function scheduler() {
    const queue = [];
    return { queue, schedule(fn) { queue.push(fn); return fn; }, clear(timer) { const i = queue.indexOf(timer); if (i >= 0) queue.splice(i, 1); } };
}

test('stage shake defaults to disabled medium with the Chinese trigger list', () => {
    const settings = normalizeStageShakeSettings(null);
    assert.equal(settings.enabled, false);
    assert.equal(settings.intensity, 'medium');
    assert.deepEqual(settings.emotions, STAGE_SHAKE_EMOTIONS);
});

test('stage shake preserves an explicit empty list and rejects English entries', () => {
    const settings = normalizeStageShakeSettings({ enabled: true, intensity: 'bad', emotions: ['  震撼 ', 'shake', '123', '震撼', ''] });
    assert.equal(settings.enabled, true);
    assert.equal(settings.intensity, 'medium');
    assert.deepEqual(settings.emotions, ['震撼']);
    assert.deepEqual(normalizeStageShakeSettings({ emotions: [] }).emotions, []);
    assert.equal(isStageShakeEmotion('震撼', settings), true);
    assert.equal(isStageShakeEmotion('震撼的台词', settings), false);
    assert.equal(isStageShakeEmotion('shake', settings), false);
});

test('stage shake uses one controlled animation per key and intensity parameters', () => {
    const stage = makeStage();
    const clock = scheduler();
    const settings = { enabled: true, intensity: 'strong', emotions: ['震惊'] };
    const first = applyStageShakeEffect(stage, { settings, emotion: '震惊', key: 'message:1:0', schedule: clock.schedule, clear: clock.clear, reducedMotion: false });
    assert.equal(first.played, true);
    assert.deepEqual(first.params, STAGE_SHAKE_INTENSITY_PARAMS.strong);
    assert.equal(stage.getAttribute('data-igs-stage-shake-intensity'), 'strong');
    assert.equal(stage.classList.contains('igs-stage-shake-active'), true);
    const repeated = applyStageShakeEffect(stage, { settings, emotion: '震惊', key: 'message:1:0', schedule: clock.schedule, clear: clock.clear, reducedMotion: false });
    assert.equal(repeated.played, false);
    const next = applyStageShakeEffect(stage, { settings, emotion: '震惊', key: 'message:1:1', schedule: clock.schedule, clear: clock.clear, reducedMotion: false });
    assert.equal(next.played, true);
    assert.equal(cancelStageShakeEffect(stage), true);
    assert.equal(stage.classList.contains('igs-stage-shake-active'), false);
    assert.equal(stage.getAttribute('data-igs-stage-shake'), null);
});

test('stage shake respects reduced motion and animation cleanup', () => {
    const stage = makeStage();
    const clock = scheduler();
    const settings = { enabled: true, intensity: 'weak', emotions: ['惊讶'] };
    const reduced = applyStageShakeEffect(stage, { settings, emotion: '惊讶', key: 'reduced', schedule: clock.schedule, clear: clock.clear, reducedMotion: true });
    assert.equal(reduced.played, false);
    const played = applyStageShakeEffect(stage, { settings, emotion: '惊讶', key: 'normal', schedule: clock.schedule, clear: clock.clear, reducedMotion: false });
    assert.equal(played.played, true);
    stage.finishAnimation();
    assert.equal(stage.classList.contains('igs-stage-shake-active'), false);
    assert.equal(cancelStageShakeEffect(stage), false);
});
