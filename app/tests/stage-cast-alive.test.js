import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCastToDom, castBreathePhase, castLeanOf, CAST_LEAN_DEG, isCastLeanEnabled } from '../src/visual/igs-ui/stage-cast-render.js';
import { normalizeSpriteMotionSettings } from '../src/visual/igs-ui/stage-direction-settings.js';
import { SPRITE_ACTION_FRAMES } from '../src/visual/igs-ui/sprite-actions.js';

function fakeEl(tag, doc) {
    const attrs = new Map();
    const props = new Map();
    const el = {
        tagName: tag,
        children: [],
        parentNode: null,
        ownerDocument: doc,
        style: {
            setProperty(k, v) { props.set(k, String(v)); },
            removeProperty(k) { props.delete(k); },
            getPropertyValue(k) { return props.get(k) || ''; },
        },
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        hasAttribute(k) { return attrs.has(k); },
        removeAttribute(k) { attrs.delete(k); },
        appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
        removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
    };
    return el;
}

function fakeStage() {
    const doc = { defaultView: {} };
    doc.createElement = (tag) => fakeEl(tag, doc);
    const layer = fakeEl('div', doc);
    const root = { querySelector: (sel) => (sel === '#igs-cast' ? layer : null) };
    const byChar = (name) => layer.children.find((el) => el.getAttribute('data-igs-cast-char') === name);
    return { root, layer, byChar };
}

const member = (character, posX) => ({ character, url: `https://example.com/${character}.png`, posX, posY: 100, scale: 100 });

test('gate: cast lean faces speaker', () => {
    assert.equal(castLeanOf(18, 82), CAST_LEAN_DEG);
    assert.equal(castLeanOf(82, 18), -CAST_LEAN_DEG);
    assert.equal(castLeanOf(50, null), 0);
    assert.equal(castLeanOf(null, 50), 0);
    assert.equal(castLeanOf(50, 50), 0);
    assert.equal(castLeanOf('x', 50), 0);
});

test('gate: cast breathe phase is stable per character', () => {
    const a = castBreathePhase('Alice');
    assert.deepEqual(castBreathePhase('Alice'), a);
    assert.notDeepEqual(castBreathePhase('Bob'), a);
    for (const name of ['Alice', 'Bob', 'Cara', '爱丽丝', '', 'x'.repeat(40)]) {
        const p = castBreathePhase(name);
        assert.ok(p.period >= 4.8 && p.period <= 5.8, `period ${name}: ${p.period}`);
        assert.ok(p.delay >= 0 && p.delay <= 2, `delay ${name}: ${p.delay}`);
    }
});

test('gate: sprite motion cast switches default on but need spriteMotion.enabled', () => {
    const defaults = normalizeSpriteMotionSettings({});
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.castBreathing, true);
    assert.equal(defaults.castLean, true);
    const off = normalizeSpriteMotionSettings({ enabled: true, castBreathing: false, castLean: false });
    assert.equal(off.castBreathing, false);
    assert.equal(off.castLean, false);
    assert.equal(isCastLeanEnabled({ readerSettings: {} }), false);
    assert.equal(isCastLeanEnabled({ readerSettings: { spriteMotion: { enabled: true } } }), true);
    assert.equal(isCastLeanEnabled({ readerSettings: { spriteMotion: { enabled: true, castLean: false } } }), false);
});

test('gate: sprite actions include shake tremble retreat', () => {
    assert.equal(SPRITE_ACTION_FRAMES.shake.duration, 700);
    assert.equal(SPRITE_ACTION_FRAMES.tremble.duration, 520);
    assert.equal(SPRITE_ACTION_FRAMES.retreat.duration, 620);
    assert.equal(SPRITE_ACTION_FRAMES.retreat.easing, 'ease-out');
    assert.equal(SPRITE_ACTION_FRAMES.tremble.frames.filter((f) => f !== 'translate(0,0)').length, 6);
    for (const kind of ['hop', 'recoil', 'sink', 'sway', 'lunge', 'nod', 'shake', 'tremble', 'retreat']) {
        assert.ok(Array.isArray(SPRITE_ACTION_FRAMES[kind].frames) && SPRITE_ACTION_FRAMES[kind].frames.length >= 2, kind);
    }
});

test('gate: cast dom writes breathe phase and flips lean when speaker switches sides', () => {
    const { root, byChar } = fakeStage();
    const members = [member('Bob', 50)];
    applyCastToDom(root, members, { reduced: true, lean: { speakerX: 6, keep: false } });
    const bob = byChar('Bob');
    const phase = castBreathePhase('Bob');
    assert.equal(bob.style.getPropertyValue('--igs-cast-breathe'), `${phase.period}s`);
    assert.equal(bob.style.getPropertyValue('--igs-cast-delay'), `${phase.delay}s`);
    assert.equal(bob.style.getPropertyValue('--igs-cast-origin-x'), '50%');
    assert.equal(bob.style.getPropertyValue('rotate'), `${-CAST_LEAN_DEG}deg`);

    applyCastToDom(root, members, { reduced: true, lean: { speakerX: 94, keep: false } });
    assert.equal(bob.style.getPropertyValue('rotate'), `${CAST_LEAN_DEG}deg`);

    // 旁白页：没有说话人坐标，维持上一页朝向。
    applyCastToDom(root, members, { reduced: true, lean: { speakerX: null, keep: true } });
    assert.equal(bob.style.getPropertyValue('rotate'), `${CAST_LEAN_DEG}deg`);

    // 关闭 / 暧昧退场：调用方传 null，回正。
    applyCastToDom(root, members, { reduced: true, lean: null });
    assert.equal(bob.style.getPropertyValue('rotate'), '');
});
