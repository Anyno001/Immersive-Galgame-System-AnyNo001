import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyStageDirection,
    cancelStageDirection,
    normalizeStageDirectionSettings,
    resolveCameraShot,
} from '../src/visual/igs-ui/stage-direction-runtime.js';
import {
    CAMERA_CLOSE_UP_DEFAULTS,
    SPRITE_ACTION_DEFAULTS,
    pickSpriteAction,
} from '../src/visual/igs-ui/stage-direction-settings.js';
import { FX_SETTINGS_NORMALIZERS, FX_WORD_LIST_PATHS } from '../src/visual/igs-ui/fx-settings.js';
import { measureClassicReveal, punctuationPauseAfter } from '../src/visual/igs-ui/typewriter-classic.js';

function makeStyle() {
    const vars = new Map();
    return {
        cssText: '',
        setProperty(name, value) { vars.set(name, String(value)); },
        removeProperty(name) { vars.delete(name); },
        getPropertyValue(name) { return vars.get(name) || ''; },
    };
}

function makeEl(doc, id = '') {
    const attrs = new Map();
    const el = {
        id, ownerDocument: doc, children: [], parentNode: null, className: '', style: makeStyle(), animations: [], listeners: new Map(),
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        hasAttribute(name) { return attrs.has(name); },
        removeAttribute(name) { attrs.delete(name); },
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        insertBefore(child, ref) {
            child.parentNode = el;
            const index = ref ? el.children.indexOf(ref) : -1;
            if (index < 0) el.children.push(child);
            else el.children.splice(index, 0, child);
            return child;
        },
        removeChild(child) { el.children.splice(el.children.indexOf(child), 1); child.parentNode = null; },
        get nextSibling() { const siblings = el.parentNode ? el.parentNode.children : []; return siblings[siblings.indexOf(el) + 1] || null; },
        querySelector(selector) {
            const want = selector.replace(/^#/, '');
            const walk = (node) => {
                for (const child of node.children) {
                    if (child.id === want) return child;
                    const found = walk(child);
                    if (found) return found;
                }
                return null;
            };
            return walk(el);
        },
        animate(frames, options) {
            const anim = { frames, options, cancelled: false, cancel() { anim.cancelled = true; } };
            el.animations.push(anim);
            return anim;
        },
        addEventListener(name, fn) { el.listeners.set(name, fn); },
        removeEventListener(name) { el.listeners.delete(name); },
        getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 }; },
    };
    return el;
}

function makeReader() {
    const doc = { defaultView: null, createElement: () => makeEl(doc) };
    const root = makeEl(doc, 'igs-overlay');
    const motion = root.appendChild(makeEl(doc, 'igs-stage-motion'));
    const bg = motion.appendChild(makeEl(doc, 'igs-bg'));
    const sprite = motion.appendChild(makeEl(doc, 'igs-sprite'));
    motion.appendChild(makeEl(doc, 'igs-click-layer'));
    const timers = [];
    const clock = {
        schedule(fn, delay) { const t = { fn, delay }; timers.push(t); return t; },
        clear(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
        flush() { while (timers.length) timers.shift().fn(); },
    };
    return { doc, root, motion, bg, sprite, timers, clock };
}

function snapshot(readerSettings, content = {}, index = 0) {
    return { messageId: 'm1', readerSettings, content: { currentIndex: index, textType: 'dialogue', ...content } };
}

function ghosts(motion) {
    return motion.children.filter((child) => String(child.className).includes('igs-sd-ghost'));
}

test('gate: stage direction settings default off and register in reader normalizers and word list paths', () => {
    const s = normalizeStageDirectionSettings(null);
    for (const value of Object.values(s)) assert.equal(value.enabled, false);
    assert.equal(s.sceneTransition.style, 'fade');
    assert.deepEqual(s.spriteActions.hop, SPRITE_ACTION_DEFAULTS.hop);
    assert.deepEqual(s.camera.closeUpEmotions, CAMERA_CLOSE_UP_DEFAULTS);
    assert.deepEqual(normalizeStageDirectionSettings({ spriteActions: { hop: [] } }).spriteActions.hop, []);
    for (const key of ['sceneTransition', 'timeTint', 'spriteMotion', 'spriteActions', 'camera', 'bgm', 'ambientSound', 'textFx', 'clickWaitMark']) {
        assert.equal(typeof FX_SETTINGS_NORMALIZERS[key], 'function', key);
    }
    assert.ok(FX_WORD_LIST_PATHS.includes('spriteActions.sway'));
    assert.ok(FX_WORD_LIST_PATHS.includes('camera.closeUpEmotions'));
    assert.equal(pickSpriteAction(' 开心 ', { enabled: true, ...SPRITE_ACTION_DEFAULTS }), 'hop');
    assert.equal(pickSpriteAction('开心', { enabled: false, ...SPRITE_ACTION_DEFAULTS }), '');
});

test('gate: background change cross-fades through a ghost layer only after the first render', () => {
    const r = makeReader();
    const settings = { sceneTransition: { enabled: true, style: 'wipe' } };
    r.bg.style.backgroundImage = 'url("a.png")';
    let result = applyStageDirection(r.root, snapshot(settings, { sceneLocation: '教室' }), { bgUrl: 'a.png', reducedMotion: false, ...r.clock });
    assert.deepEqual(result.played, []);
    r.bg.style.backgroundImage = 'url("b.png")';
    result = applyStageDirection(r.root, snapshot(settings, { sceneLocation: '走廊' }, 1), { bgUrl: 'b.png', reducedMotion: false, ...r.clock });
    assert.deepEqual(result.played, ['bg:wipe']);
    const [ghost] = ghosts(r.motion);
    assert.equal(ghost.style.backgroundImage, 'url("a.png")');
    assert.equal(r.motion.children[r.motion.children.indexOf(r.bg) + 1], ghost);
    return Promise.resolve().then(() => {
        assert.match(ghost.animations[0].frames[1].clipPath, /inset\(0 0 0 100%\)/);
        r.clock.flush();
        assert.equal(ghosts(r.motion).length, 0);
    });
});

test('gate: same-location background change always fades and re-render does not replay', () => {
    const r = makeReader();
    const settings = { sceneTransition: { enabled: true, style: 'iris' } };
    r.bg.style.backgroundImage = 'url("day.png")';
    applyStageDirection(r.root, snapshot(settings, { sceneLocation: '教室' }), { bgUrl: 'day.png', reducedMotion: false, ...r.clock });
    r.bg.style.backgroundImage = 'url("night.png")';
    const first = applyStageDirection(r.root, snapshot(settings, { sceneLocation: '教室' }, 1), { bgUrl: 'night.png', reducedMotion: false, ...r.clock });
    assert.deepEqual(first.played, ['bg:fade']);
    const again = applyStageDirection(r.root, snapshot(settings, { sceneLocation: '教室' }, 1), { bgUrl: 'night.png', reducedMotion: false, ...r.clock });
    assert.deepEqual(again.played, []);
});

test('gate: black transition drops a curtain above the stage and removes it after the fade', async () => {
    const r = makeReader();
    const settings = { sceneTransition: { enabled: true, style: 'black', speed: 'fast' } };
    r.bg.style.backgroundImage = 'url("a.png")';
    applyStageDirection(r.root, snapshot(settings, { sceneLocation: '家' }), { bgUrl: 'a.png', reducedMotion: false, ...r.clock });
    r.bg.style.backgroundImage = 'url("b.png")';
    const result = applyStageDirection(r.root, snapshot(settings, { sceneLocation: '学校' }, 1), { bgUrl: 'b.png', reducedMotion: false, ...r.clock });
    assert.deepEqual(result.played, ['bg:black']);
    assert.ok(r.motion.children.some((child) => child.className === 'igs-sd-curtain'));
    r.clock.flush();
    await Promise.resolve();
    r.clock.flush();
    assert.ok(!r.motion.children.some((child) => child.className === 'igs-sd-curtain'));
});

test('gate: sprite enters, cuts a same-character mood change, and exits', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true, emotionFade: true } };
    const ctx = { reducedMotion: false, ...r.clock };
    r.sprite.style.cssText = 'background-image: url("alice-smile.png");';
    let result = applyStageDirection(r.root, snapshot(settings), { ...ctx, spriteUrl: 'alice-smile.png', spriteKey: '爱丽丝', spritePosX: 70 });
    assert.deepEqual(result.played, ['sprite:enter']);
    assert.equal(r.sprite.animations[1].frames[0].transform, 'translate(3%,0)');
    assert.equal(r.sprite.animations[1].options.composite, 'add');
    result = applyStageDirection(r.root, snapshot(settings, {}, 1), { ...ctx, spriteUrl: 'alice-sad.png', spriteKey: '爱丽丝', spritePosX: 70 });
    assert.deepEqual(result.played, ['bounce']);
    assert.equal(ghosts(r.motion).length, 0);
    r.clock.flush();
    result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration' }, 2), { ...ctx, spriteUrl: '', spriteKey: '' });
    assert.deepEqual(result.played, []);
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
});

test('gate: another speaker or narration between the same character cuts without a fade', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true, emotionFade: true, enterExit: true }, sceneTransition: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock };
    const show = (url, key, index, extra = {}) => applyStageDirection(r.root, snapshot(settings, { sceneLocation: '教室', ...extra }, index), { ...ctx, spriteUrl: url, spriteKey: key, spritePosX: 50 });
    show('a.png', '爱丽丝', 0);
    r.clock.flush();
    let result = show('b.png', '鲍勃', 1);
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
    result = show('a.png', '爱丽丝', 2);
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
    result = show('', '', 3, { textType: 'narration' });
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
    result = show('a.png', '爱丽丝', 4);
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
    assert.ok(!result.played.some((kind) => String(kind).startsWith('sprite:')));
});

test('gate: mood change on the same character switches directly by default', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true }, sceneTransition: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock };
    r.sprite.style.cssText = 'background-image: url("alice-smile.png");';
    applyStageDirection(r.root, snapshot(settings), { ...ctx, spriteUrl: 'alice-smile.png', spriteKey: '爱丽丝', spritePosX: 70 });
    r.clock.flush();
    const before = r.sprite.animations.length;
    const result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration' }, 1), { ...ctx, spriteUrl: 'alice-sad.png', spriteKey: '爱丽丝', spritePosX: 70 });
    assert.deepEqual(result.played, []);
    assert.equal(ghosts(r.motion).length, 0);
    assert.equal(r.sprite.animations.length, before);
    assert.equal(normalizeStageDirectionSettings({}).spriteMotion.emotionFade, false);
    const speaker = applyStageDirection(r.root, snapshot(settings, { textType: 'narration' }, 2), { ...ctx, spriteUrl: 'bob.png', spriteKey: '鲍勃', spritePosX: 30 });
    assert.deepEqual(speaker.played, []);
    assert.equal(ghosts(r.motion).length, 0);
    assert.equal(r.sprite.animations.length, before);
});

test('gate: speaker without a sprite hides the previous sprite directly and it returns without enter', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true }, sceneTransition: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock };
    r.sprite.style.cssText = 'background-image: url("alice.png");';
    applyStageDirection(r.root, snapshot(settings, { textType: 'narration' }), { ...ctx, spriteUrl: 'alice.png', spriteKey: '爱丽丝', spritePosX: 70 });
    r.clock.flush();
    const before = r.sprite.animations.length;
    let result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration' }, 1), { ...ctx, spriteUrl: '', spriteKey: '', noSpriteSpeaker: true });
    assert.deepEqual(result.played, []);
    assert.equal(ghosts(r.motion).length, 0);
    result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration' }, 2), { ...ctx, spriteUrl: 'alice.png', spriteKey: '爱丽丝', spritePosX: 70 });
    assert.deepEqual(result.played, []);
    assert.equal(ghosts(r.motion).length, 0);
    assert.equal(r.sprite.animations.length, before);
    result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration', sceneLocation: '学校' }, 3), { ...ctx, spriteUrl: '', spriteKey: '' });
    assert.deepEqual(result.played, ['sprite:exit']);
});

test('gate: narration or system page in the same scene hides and restores the sprite without exit or enter', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true }, sceneTransition: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock };
    r.sprite.style.cssText = 'background-image: url("alice.png");';
    applyStageDirection(r.root, snapshot(settings, { textType: 'dialogue', sceneLocation: '教室' }), { ...ctx, spriteUrl: 'alice.png', spriteKey: '爱丽丝', spritePosX: 50 });
    r.clock.flush();
    const before = r.sprite.animations.length;
    let result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration', sceneLocation: '教室' }, 1), { ...ctx, spriteUrl: '', spriteKey: '' });
    assert.deepEqual(result.played, []);
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
    result = applyStageDirection(r.root, snapshot(settings, { textType: 'narration', sceneLocation: '教室' }, 2), { ...ctx, spriteUrl: 'alice.png', spriteKey: '爱丽丝', spritePosX: 50 });
    assert.deepEqual(result.played, []);
    assert.equal(result.directSprite, true);
    assert.equal(ghosts(r.motion).length, 0);
    assert.equal(r.sprite.animations.length, before);
});

test('gate: stage cast speaker change swaps without exit or enter', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true, emotionFade: true } };
    const ctx = { reducedMotion: false, ...r.clock };
    r.sprite.style.cssText = 'background-image: url("alice.png");';
    applyStageDirection(r.root, snapshot(settings), { ...ctx, spriteUrl: 'alice.png', spriteKey: '爱丽丝', spritePosX: 18, castKeys: ['爱丽丝', '鲍勃'] });
    r.clock.flush();
    const result = applyStageDirection(r.root, snapshot(settings, {}, 1), { ...ctx, spriteUrl: 'bob.png', spriteKey: '鲍勃', spritePosX: 82, castKeys: ['鲍勃', '爱丽丝'] });
    assert.equal(result.directSprite, true);
    assert.ok(!result.played.some((kind) => String(kind).startsWith('sprite:')));
    assert.equal(ghosts(r.motion).length, 0);
});

test('gate: stage cast alone does not activate stage direction', () => {
    const r = makeReader();
    const result = applyStageDirection(r.root, snapshot({ stageCast: { enabled: true } }), { bgUrl: 'a.png', spriteUrl: 'b.png', spriteKey: '爱丽丝' });
    assert.deepEqual(result.played, []);
});

test('gate: emotion action plays once per page, beats the speak bounce and skips nsfw pages', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true, enterExit: false }, spriteActions: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock, spriteUrl: 'a.png', spriteKey: 'A' };
    applyStageDirection(r.root, snapshot(settings, { statusEmotion: '平静' }), ctx);
    let result = applyStageDirection(r.root, snapshot(settings, { statusEmotion: '开心' }, 1), ctx);
    assert.deepEqual(result.played, ['action:hop']);
    result = applyStageDirection(r.root, snapshot(settings, { statusEmotion: '开心' }, 1), ctx);
    assert.deepEqual(result.played, []);
    result = applyStageDirection(r.root, snapshot(settings, { statusEmotion: '平静' }, 2), ctx);
    assert.deepEqual(result.played, ['bounce']);
    result = applyStageDirection(r.root, snapshot(settings, { statusEmotion: '开心', sceneNsfw: true }, 3), ctx);
    assert.deepEqual(result.played, []);
    assert.equal(r.root.getAttribute('data-igs-sd-breathe'), '1');
});

test('gate: camera close-up, ken burns and parallax attach and cancel cleanly', () => {
    const r = makeReader();
    const settings = { camera: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock, bgUrl: 'bg.png', spriteUrl: 'a.png', spriteKey: 'A' };
    applyStageDirection(r.root, snapshot(settings, { statusEmotion: '震惊', sceneTime: '黄昏', sceneLocation: '河边' }), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-closeup'), '1');
    assert.equal(r.root.getAttribute('data-igs-sd-kenburns'), '1');
    assert.ok(r.root.listeners.has('pointermove'));
    applyStageDirection(r.root, snapshot(settings, { statusEmotion: '平静' }, 1), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-closeup'), null);
    assert.equal(cancelStageDirection(r.root), true);
    assert.equal(r.root.getAttribute('data-igs-sd-kenburns'), null);
    assert.ok(!r.root.listeners.has('pointermove'));
    assert.equal(cancelStageDirection(r.root), false);
});

test('gate: reduced motion keeps fades but drops breathing, actions and camera moves', () => {
    const r = makeReader();
    const settings = { spriteMotion: { enabled: true }, spriteActions: { enabled: true }, camera: { enabled: true } };
    const ctx = { reducedMotion: true, ...r.clock, bgUrl: 'bg.png', spriteUrl: 'a.png', spriteKey: 'A' };
    const result = applyStageDirection(r.root, snapshot(settings, { statusEmotion: '开心' }), ctx);
    assert.deepEqual(result.played, []);
    for (const name of ['data-igs-sd-breathe', 'data-igs-sd-kenburns', 'data-igs-sd-closeup']) assert.equal(r.root.getAttribute(name), null);
});

test('gate: all stage direction off leaves the DOM untouched', () => {
    const r = makeReader();
    const result = applyStageDirection(r.root, snapshot({}), { bgUrl: 'a.png', spriteUrl: 'b.png' });
    assert.deepEqual(result.played, []);
    assert.equal(r.motion.children.length, 3);
});

test('gate: classic typewriter punctuation pause stretches timing after commas and sentence ends only', () => {
    assert.equal(punctuationPauseAfter('，', 10), 30);
    assert.equal(punctuationPauseAfter('。', 10), 70);
    assert.equal(punctuationPauseAfter('…', 10), 40);
    assert.equal(punctuationPauseAfter('字', 10), 0);
    const node = { nodeType: 3, nodeValue: '好，走。' };
    const target = {
        childNodes: [node],
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }),
        ownerDocument: {
            createRange: () => {
                let start = 0;
                return {
                    setStart(_, index) { start = index; },
                    setEnd() {},
                    getClientRects: () => [{ left: start * 10, right: start * 10 + 10, top: 0, bottom: 20, width: 10, height: 20 }],
                };
            },
        },
    };
    const plain = measureClassicReveal(target, 10);
    const paused = measureClassicReveal(target, 10, { punctuationPause: true });
    assert.deepEqual(plain.events.map((e) => e.timeMs), [10, 20, 30, 40]);
    assert.deepEqual(paused.events.map((e) => e.timeMs), [10, 20, 60, 70]);
    assert.equal(paused.duration, 70);
});

test('gate:perf:parallax-caches-rect-and-writes-vars-on-layers-only', () => {
    const r = makeReader();
    const viewListeners = new Map();
    r.doc.defaultView = {
        requestAnimationFrame(fn) { fn(); return 1; },
        addEventListener(name, fn) { viewListeners.set(name, fn); },
        removeEventListener(name) { viewListeners.delete(name); },
    };
    let rectCalls = 0;
    r.root.getBoundingClientRect = () => { rectCalls += 1; return { left: 0, top: 0, width: 200, height: 100 }; };
    const settings = { camera: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock, bgUrl: 'bg.png', spriteUrl: 'a.png', spriteKey: 'A' };
    applyStageDirection(r.root, snapshot(settings, { statusEmotion: '平静' }), ctx);
    const move = r.root.listeners.get('pointermove');
    move({ pointerType: 'mouse', clientX: 200, clientY: 50 });
    move({ pointerType: 'mouse', clientX: 0, clientY: 0 });
    assert.equal(rectCalls, 1);
    assert.equal(r.bg.style.getPropertyValue('--igs-sd-px'), '-1.000');
    assert.equal(r.sprite.style.getPropertyValue('--igs-sd-py'), '-1.000');
    assert.equal(r.root.style.getPropertyValue('--igs-sd-px'), '');
    viewListeners.get('resize')();
    move({ pointerType: 'mouse', clientX: 100, clientY: 50 });
    assert.equal(rectCalls, 2);
    const cast = r.motion.appendChild(makeEl(r.doc, 'igs-cast'));
    applyStageDirection(r.root, snapshot(settings, { statusEmotion: '平静' }), ctx);
    assert.equal(cast.style.getPropertyValue('--igs-sd-px'), '0.000');
    cancelStageDirection(r.root);
    assert.equal(r.bg.style.getPropertyValue('--igs-sd-px'), '');
    assert.equal(cast.style.getPropertyValue('--igs-sd-px'), '');
    assert.ok(!viewListeners.has('resize') && !viewListeners.has('scroll'));
});

test('gate: ai camera shots resolve per page and override emotion close-up', () => {
    assert.equal(resolveCameraShot(null), '');
    assert.equal(resolveCameraShot({ shot: 'reset' }, { spriteUrl: 'a.png' }), '');
    assert.equal(resolveCameraShot({ shot: 'closeup', target: '' }, { spriteUrl: 'a.png' }), 'closeup');
    assert.equal(resolveCameraShot({ shot: 'closeup', target: '爱丽丝' }, { spriteUrl: 'a.png', speakers: ['鲍勃', ''] }), '', 'close-up on someone not on stage');
    assert.equal(resolveCameraShot({ shot: 'closeup', target: '爱丽丝' }, { spriteUrl: 'a.png', speakers: ['爱丽丝'] }), 'closeup');
    assert.equal(resolveCameraShot({ shot: 'wide' }, { spriteUrl: '' }), '', 'nothing to pull back from');
    assert.equal(resolveCameraShot({ shot: 'focus' }, { spriteUrl: 'a.png', lowQuality: true }), '');
    assert.equal(resolveCameraShot({ shot: 'pan', target: 'left' }), 'pan-left');
    assert.equal(resolveCameraShot({ shot: 'pan', target: 'right' }, { reduced: true }), '');
    assert.equal(resolveCameraShot({ shot: 'tilt' }), 'tilt');
    assert.equal(normalizeStageDirectionSettings({ camera: {} }).camera.aiShots, true);

    const r = makeReader();
    const settings = { camera: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock, bgUrl: 'bg.png', spriteUrl: 'a.png', spriteKey: 'A' };
    let result = applyStageDirection(r.root, snapshot(settings, { statusEmotion: '震惊', fx: { cam: { shot: 'wide', target: '' } } }), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), 'wide');
    assert.equal(r.root.getAttribute('data-igs-sd-closeup'), null, 'ai shot wins over emotion close-up');
    assert.ok(result.played.includes('camera:wide'));
    applyStageDirection(r.root, snapshot(settings, { statusEmotion: '平静', fx: { cam: null } }, 1), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), null, 'shot lasts one page');
    applyStageDirection(r.root, snapshot({ camera: { enabled: true, aiShots: false } }, { fx: { cam: { shot: 'tilt' } } }, 2), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), null);
    applyStageDirection(r.root, snapshot(settings, { fx: { cam: { shot: 'pan', target: 'left' } } }, 3), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), 'pan-left');
    cancelStageDirection(r.root);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), null);
});
