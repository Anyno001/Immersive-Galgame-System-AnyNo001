import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackRegistry, normalizePack, validatePacks } from '../src/scene/fx-packs.js';
import { DAILY_FX_KINDS, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { DAILY_FX_LABELS, enabledPackIds, normalizeDailyFxSettings, planDailyFx } from '../src/visual/igs-ui/fx-daily-model.js';
import { PACK } from '../src/visual/igs-ui/fx-pack-camera.js';
import { CAMERA_BUILDERS } from '../src/visual/igs-ui/fx-camera.js';
import { CAMERA_SFX_DEFS } from '../src/visual/igs-ui/fx-camera-sfx.js';
import { CAMERA_SETTINGS_DEFAULTS, CAMERA_KINDS, STEP_MATERIALS, cameraFxOf, inferStepMaterial, normalizeCameraSettings, parseCameraFx, resolveCameraAmbience } from '../src/visual/igs-ui/fx-camera-model.js';
import { buildStepPlan, panPath, planBodySounds, playSteps } from '../src/visual/igs-ui/camera-steps-audio.js';
import { playCameraExtras, resolveCameraMod, resolveCameraShot } from '../src/visual/igs-ui/camera-shots.js';
import { audioCuesOf, cutStyleOf, impliedCam } from '../src/visual/igs-ui/fx-camera-gate.js';
import { applyStageDirection } from '../src/visual/igs-ui/stage-direction-runtime.js';
import { AMBIENT_SOUND_DEFAULTS, AMBIENT_TRAIL_HOLD_MS, applySceneAudio, cancelSceneAudio, resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';
import { makeStage } from './helpers/fake-dom.js';


const SAMPLES = {
    fg: ['fg', 'leaf', 'right'], peek: ['peek', 'window', 'bl'], flare: ['flare', 'right'], streak: ['streak', 'right', ''], bob: ['bob'],
    backdrop: ['backdrop', 'flowers', ''], jcut: ['jcut', '森林'], lcut: ['lcut'], establish: ['establish', '王都'], cut: ['cut', 'iris'],
    montage: ['montage', '3'], timelapse: ['timelapse', 'dusk'], split: ['split', '山顶', ''], linger: ['linger', 'window'],
    step: ['step', 'wood', 'lr', '6', ''], walk: ['walk', 'forest'], chase: ['chase', 'escape'], sneak: ['sneak'], seeoff: ['seeoff', 'right'], enterroom: ['enterroom', '书房'],
};

function envOf(extra = {}) {
    const root = makeStage();
    return { root, doc: root.ownerDocument, layers: { front: root, stage: root }, reduced: true, hold: 1, ancient: false, speaker: '', sprite: null, camera: { sound: false, volume: 0.25, ground: () => ({}) }, ...extra };
}

function makeStyle() {
    const vars = new Map();
    return { cssText: '', setProperty(n, v) { vars.set(n, String(v)); }, removeProperty(n) { vars.delete(n); }, getPropertyValue(n) { return vars.get(n) || ''; } };
}

function makeEl(doc, id = '') {
    const attrs = new Map();
    const el = {
        id, ownerDocument: doc, children: [], parentNode: null, className: '', style: makeStyle(), animations: [],
        setAttribute(n, v) { attrs.set(n, String(v)); },
        getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
        hasAttribute(n) { return attrs.has(n); },
        removeAttribute(n) { attrs.delete(n); },
        appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
        insertBefore(c, ref) { c.parentNode = el; const i = ref ? el.children.indexOf(ref) : -1; if (i < 0) el.children.push(c); else el.children.splice(i, 0, c); return c; },
        removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; },
        get nextSibling() { const s = el.parentNode ? el.parentNode.children : []; return s[s.indexOf(el) + 1] || null; },
        querySelector(sel) {
            const want = sel.replace(/^#/, '');
            const walk = (node) => { for (const child of node.children) { if (child.id === want) return child; const f = walk(child); if (f) return f; } return null; };
            return walk(el);
        },
        animate(frames, options) { const a = { frames, options, cancelled: false, cancel() { a.cancelled = true; } }; el.animations.push(a); return a; },
        addEventListener() {}, removeEventListener() {},
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
    const clock = { schedule(fn, delay) { const t = { fn, delay }; timers.push(t); return t; }, clear(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }, flush() { while (timers.length) timers.shift().fn(); } };
    return { doc, root, motion, bg, sprite, timers, clock };
}

const snap = (readerSettings, content = {}, index = 0) => ({ messageId: 'm1', readerSettings, content: { currentIndex: index, textType: 'dialogue', ...content } });
const ON = Object.freeze({ dailyFx: { enabled: true, cut: true, establish: true, jcut: true, lcut: true, walk: true }, cameraPackFx: { enabled: true } });

test('gate:camera-shots-extend-existing-grammar', () => {
    assert.deepEqual(parseFxBody('cam|摇镜|右|手持').args, ['pan', 'right', 'hand']);
    assert.deepEqual(parseFxBody('cam|下沉||手持').args, ['sink', '', 'hand']);
    assert.deepEqual(parseFxBody('cam|变焦|近').args, ['vertigo', 'near']);
    assert.deepEqual(parseFxBody('cam|变焦').args, ['vertigo', 'far']);
    assert.deepEqual(parseFxBody('cam|焦点|前').args, ['focus', 'front']);
    assert.deepEqual(parseFxBody('cam|跟拍|左').args, ['track', 'left']);
    assert.deepEqual(parseFxBody('cam|甩镜').args, ['whip', 'right']);
    for (const word of ['升起', '仰望', '主观', '空镜', '慢']) assert.ok(parseFxBody(`cam|${word}`), word);
    assert.deepEqual(parseFxBody('cam|特写|爱丽丝'), { kind: 'cam', end: false, args: ['closeup', '爱丽丝'] });
    assert.deepEqual(parseFxBody('cam|倾斜'), { kind: 'cam', end: false, args: ['tilt', ''] });
    assert.equal(parseFxBody('cam|转圈'), null);
    const text = '甲[igs-fx:cam|下沉|手持]乙[igs-fx:cam|主观]丙';
    const list = extractFxDirectives(text);
    assert.deepEqual(resolveFxAtPage(list, text.indexOf('乙'), -1).cam, { shot: 'sink', target: '', mod: 'hand' });
    assert.deepEqual(resolveFxAtPage(list, text.indexOf('丙'), text.indexOf('乙')).cam, { shot: 'pov', target: '' });
});

test('gate:camera-resolve-gates', () => {
    const lit = { spriteUrl: 'a.png' };
    assert.equal(resolveCameraShot({ shot: 'track', target: 'left' }, lit), 'track-left');
    assert.equal(resolveCameraShot({ shot: 'track', target: 'left' }, { ...lit, reduced: true }), '');
    assert.equal(resolveCameraShot({ shot: 'whip', target: 'right' }, { ...lit, reduced: true }), '');
    assert.equal(resolveCameraShot({ shot: 'pan', target: 'right' }, { reduced: true }), '');
    assert.equal(resolveCameraShot({ shot: 'focus', target: 'front' }, lit), 'focus-front');
    assert.equal(resolveCameraShot({ shot: 'focus' }, { ...lit, lowQuality: true }), '');
    for (const shot of ['sink', 'rise', 'lookup', 'vertigo']) {
        assert.ok(resolveCameraShot({ shot, target: 'far' }, lit), shot);
        assert.equal(resolveCameraShot({ shot, target: 'far' }, { spriteUrl: '' }), '', `${shot} needs a sprite`);
    }
    assert.equal(resolveCameraShot({ shot: 'vertigo', target: 'near' }, lit), 'vertigo-near');
    for (const shot of ['pov', 'empty', 'slow']) assert.equal(resolveCameraShot({ shot }, { spriteUrl: '' }), shot);
    assert.equal(resolveCameraShot({ shot: 'reset' }, lit), '');
    assert.equal(resolveCameraMod({ mod: 'hand' }, {}), 'hand');
    assert.equal(resolveCameraMod({ mod: 'hand' }, { reduced: true }), '');
    assert.equal(resolveCameraMod({ mod: 'hand' }, { lowQuality: true }), '');
    assert.equal(resolveCameraMod({ mod: 'slow' }, { reduced: true, lowQuality: true }), 'slow');
});

test('gate:camera-shot-extras-play-and-cancel', () => {
    const r = makeReader();
    const state = {};
    const played = playCameraExtras(state, r.root, { key: 'a', shot: 'whip-left', mod: 'hand', lowQuality: false, newPage: true });
    assert.deepEqual(played.sort(), ['camera:hand-bg', 'camera:hand-sprite', 'camera:whip-bg', 'camera:whip-sprite']);
    const hand = r.bg.animations.find((a) => a.options.iterations === Infinity);
    assert.equal(hand.options.composite, 'add');
    const whip = r.bg.animations.find((a) => a.options.duration === 350);
    assert.deepEqual(playCameraExtras(state, r.root, { key: 'a', shot: 'whip-left', mod: 'hand', newPage: true }), [], 'same page does not replay');
    playCameraExtras(state, r.root, { key: 'b', shot: '', mod: '', newPage: true });
    assert.ok(hand.cancelled, 'next page cancels hand-held');
    const low = makeReader();
    playCameraExtras({}, low.root, { key: 'c', shot: 'whip-right', mod: '', lowQuality: true, newPage: true });
    assert.equal(low.bg.animations[0].frames[0].filter, 'none', 'low drops the blur and keeps the move');
});

test('gate:camera-pack-default-on', () => {
    const settings = normalizeDailyFxSettings({ enabled: true });
    // 镜头与空间是通用演出包（defaultOn）：总开关与各 kind 默认开，显式写 false 才关。
    for (const kind of CAMERA_KINDS) assert.equal(settings[kind], true, kind);
    assert.equal(PACK.packSwitch, 'cameraPackFx.enabled');
    assert.equal(PACK.defaultOn, true);
    assert.ok(enabledPackIds({ dailyFx: { enabled: true } }).includes('camera'));
    // 用户显式关掉总开关后整包拨掉。
    const OFF = { dailyFx: { enabled: true }, cameraPackFx: { enabled: false } };
    assert.equal(enabledPackIds(OFF).includes('camera'), false);
    // 只写 true 的极简旧设置（无 cameraPackFx 字段）按默认开处理。
    assert.ok(enabledPackIds(ON).includes('camera'));
    const fx = { daily: [{ type: 'walk', mode: 'forest' }] };
    const dailyOff = { dailyFx: { enabled: true, walk: true }, cameraPackFx: { enabled: false } };
    assert.equal(planDailyFx(fx, { settings: dailyOff.dailyFx, readerSettings: dailyOff }).length, 0, 'pack switch off strips the tag');
    assert.equal(planDailyFx(fx, { settings: ON.dailyFx, readerSettings: ON }).length, 1);
    assert.deepEqual(normalizeCameraSettings(undefined), { sound: false, volume: 0.25 });
    // 包总开关显式关掉时 cut / establish 被剥掉（camera 包 defaultOn 后必须显式 false 才算关）。
    assert.equal(cutStyleOf({ daily: [{ type: 'cut', style: 'iris' }] }, { dailyFx: { enabled: true, cut: true }, cameraPackFx: { enabled: false } }), '');
    assert.equal(impliedCam({ daily: [{ type: 'establish', place: 'x' }] }, { dailyFx: { enabled: true, establish: true }, cameraPackFx: { enabled: false } }), null);
});

test('gate:camera-pack-six-places', () => {
    assert.deepEqual(validatePacks([normalizePack(PACK)]), []);
    for (const kind of CAMERA_KINDS) {
        assert.ok(DAILY_FX_KINDS.includes(kind), `${kind} in DAILY_FX_KINDS`);
        assert.ok(DAILY_FX_LABELS[kind], `${kind} label`);
        assert.ok(PACK.triggers[kind].length >= 2 && PACK.triggers[kind].length <= 4, `${kind} triggers`);
        assert.ok(PACK.promptLines[kind].startsWith(`[igs-fx:${kind}`), `${kind} prompt`);
        assert.ok(PACK.grammarLines[kind].startsWith(kind), `${kind} grammar`);
        assert.equal(typeof CAMERA_BUILDERS[kind], 'function', kind);
        assert.ok(parseDailyFxBody(kind, SAMPLES[kind].slice(1)), `${kind} parses`);
        assert.ok(detectPromptTriggers({ userText: `她${PACK.triggers[kind][0]}了` }).has('packcamera'), `${kind} trigger word lights the block`);
    }
    for (const kind of CAMERA_KINDS) {
        const built = CAMERA_BUILDERS[kind](cameraFxOf(SAMPLES[kind]), envOf({ reduced: false }));
        if (!built) continue;
        assert.ok(['stage', 'front', 'under'].includes(built.layer), kind);
        assert.ok(built.node && built.life > 0, kind);
        for (const sound of built.sounds) assert.ok(CAMERA_SFX_DEFS[sound], `${kind} sound ${sound}`);
    }
    const registry = buildPackRegistry([PACK]);
    assert.deepEqual(registry.packs[0].kinds, [...CAMERA_KINDS]);
});

test('gate:camera-builders-have-picture-and-reduced-fallback', () => {
    for (const kind of ['peek', 'flare', 'streak', 'backdrop', 'establish', 'montage', 'timelapse', 'split', 'linger', 'walk', 'chase', 'sneak', 'seeoff', 'enterroom']) {
        const built = CAMERA_BUILDERS[kind](cameraFxOf(SAMPLES[kind]), envOf());
        assert.ok(built && built.node, kind);
        assert.ok(String(built.node.className).includes('is-reduced'), `${kind} reduced class`);
    }
    assert.equal(CAMERA_BUILDERS.fg(cameraFxOf(SAMPLES.fg), envOf()), null, 'fg is not drawn under reduced motion');
    assert.ok(CAMERA_BUILDERS.fg(cameraFxOf(SAMPLES.fg), envOf({ reduced: false })).node.innerHTML.includes('igs-cm-fg'));
    assert.equal(CAMERA_BUILDERS.jcut(), null);
    const base = CAMERA_BUILDERS.linger(cameraFxOf(SAMPLES.linger), envOf());
    const held = CAMERA_BUILDERS.linger(cameraFxOf(SAMPLES.linger), envOf({ hold: 1.6 }));
    assert.ok(held.life > base.life, 'life is multiplied by env.hold');
    assert.equal(CAMERA_BUILDERS.streak({ dir: 'right', color: '' }, envOf()).layer, 'under');
    assert.equal((CAMERA_BUILDERS.montage({ cells: 9 }, envOf()).node.className.match(/is-n(\d)/) || [])[1], '4');
    assert.match(CAMERA_BUILDERS.backdrop({ style: 'thunder' }, envOf()).node.innerHTML, /igs-cm-bolt/);
    assert.ok(CAMERA_BUILDERS.backdrop({ style: 'thunder' }, envOf()).sounds.includes('cm-thunder'));
    assert.ok(CAMERA_BUILDERS.chase({ result: 'caught' }, envOf()).node.innerHTML.includes('igs-cm-flash'));
    assert.ok(CAMERA_BUILDERS.chase({ result: 'saved' }, envOf()).node.innerHTML.includes('igs-cm-flare-sweep'));
});

test('gate:camera-low-static', () => {
    assert.equal(resolveCameraMod({ mod: 'hand' }, { lowQuality: true }), '');
    const low = envOf({ reduced: false });
    low.root.getAttribute = (name) => (name === 'data-igs-quality' ? 'low' : null);
    assert.equal(CAMERA_BUILDERS.bob({}, low), null, 'bob is off on low');
});

test('gate:step-material-inference', () => {
    assert.equal(inferStepMaterial({ tag: 'grass', weatherKind: 'snow' }), 'grass', 'tag first');
    assert.equal(inferStepMaterial({ weatherKind: 'snow' }), 'snow');
    assert.equal(inferStepMaterial({ ambientKinds: ['rain'] }), 'puddle');
    assert.equal(inferStepMaterial({ ambientKinds: ['stream'], indoor: false }), 'puddle');
    assert.equal(inferStepMaterial({ indoor: true }), 'wood');
    assert.equal(inferStepMaterial({ indoor: false }), 'stone');
    assert.equal(inferStepMaterial({ tag: 'lava', indoor: true }), 'wood', 'unknown falls back');
    assert.equal(parseCameraFx('step', ['沙滩'])[1], '', 'unknown material word is dropped');
    assert.equal(parseCameraFx('step', ['走廊回声'])[1], 'hall');
    assert.ok(Object.values(STEP_MATERIALS).every((m) => ['wood', 'stone', 'grass', 'snow', 'puddle', 'hall'].includes(m)));
});

test('gate:step-pan-automation', () => {
    const lr = panPath('lr', 6);
    assert.ok(lr.every((v, i) => v >= -1 && v <= 1 && (i === 0 || v > lr[i - 1])), 'left to right rises');
    const rl = panPath('rl', 6);
    assert.ok(rl.every((v, i) => i === 0 || v < rl[i - 1]));
    assert.ok(panPath('far', 5, 1).every((v, i, a) => v >= 0 && v <= 1 && (i === 0 || v >= a[i - 1])));
    const near = buildStepPlan({ material: 'wood', dir: 'near', count: 5 }).walkers[0].steps;
    assert.ok(near[4].gain > near[0].gain && near[4].cutoff > near[0].cutoff, 'closer is louder and brighter');
    const far = buildStepPlan({ material: 'wood', dir: 'far', count: 5 }).walkers[0].steps;
    assert.ok(far[4].gain < far[0].gain && far[4].cutoff < far[0].cutoff, 'farther is quieter and duller');
    const pair = buildStepPlan({ material: 'stone', dir: 'lr', count: 4, pair: true });
    assert.equal(pair.walkers.length, 2);
    assert.ok(pair.walkers[1].offset - pair.walkers[0].offset <= 0.03, 'pair phase gap under 30ms');
    assert.ok(pair.walkers[1].steps[0].pan > pair.walkers[0].steps[0].pan);
    const param = () => ({ value: 0, ramps: [], setValueAtTime() {}, linearRampToValueAtTime(v) { this.ramps.push(v); }, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), pan: param(), delayTime: { value: 0 } });
    const mk = (withPanner) => {
        const ctx = { currentTime: 0, sampleRate: 100, createGain: node, createBiquadFilter: node, createBufferSource: node, createOscillator: node, createDelay: node, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
        if (withPanner) ctx.createStereoPanner = node;
        return ctx;
    };
    const plan = buildStepPlan({ material: 'hall', dir: 'lr', count: 4 });
    const direct = playSteps(plan, { volume: 0.25, output: { context: mk(false), connect() {} } });
    assert.ok(direct, 'no StereoPanner connects directly');
    direct.stop();
    let panner = null;
    const ctx2 = mk(true);
    ctx2.createStereoPanner = () => { panner = node(); return panner; };
    const handle = playSteps(plan, { volume: 0.25, output: { context: ctx2 } });
    assert.ok(panner.pan.ramps.length >= 4 && panner.pan.ramps.every((v) => v >= -1 && v <= 1));
    handle.stop();
    const body = planBodySounds({ ms: 4000, bpmFrom: 80, bpmTo: 140 });
    assert.ok(body.beats.at(-1).bpm > body.beats[0].bpm, 'heartbeat speeds up');
    assert.ok(planBodySounds({ ms: 4000, stopAtMs: 1000 }).beats.every((b) => b.t * 1000 < 1000), 'caught stops the heartbeat');
});

test('gate:step-default-off-and-volume', () => {
    assert.equal(CAMERA_SETTINGS_DEFAULTS.sound, false);
    assert.ok(CAMERA_SETTINGS_DEFAULTS.volume < AMBIENT_SOUND_DEFAULTS.volume);
    assert.equal(normalizeCameraSettings({ sound: 'yes', volume: 9 }).sound, false);
    assert.equal(normalizeCameraSettings({ volume: 9 }).volume, 1);
    const env = envOf();
    assert.doesNotThrow(() => CAMERA_BUILDERS.step(cameraFxOf(SAMPLES.step), env), 'sound off builds silently');
});

function fakeAudio() {
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), pan: param() });
    return {
        currentTime: 0, sampleRate: 8000, destination: node(), state: 'running', resume: () => Promise.resolve(),
        createGain: node, createBiquadFilter: node, createBufferSource: node, createOscillator: node, createStereoPanner: node, createConvolver: node, createDynamicsCompressor: node,
        createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n), length: n }),
    };
}

test('gate:jcut-lcut-layer-keep', () => {
    const on = { enabled: true };
    const plain = resolveAmbientPlan({ location: '教室', time: '白天' }, on);
    const lead = resolveAmbientPlan({ location: '教室', time: '白天', leadLocation: '森林' }, on);
    const next = resolveAmbientPlan({ location: '森林', time: '白天' }, on);
    assert.ok(lead.length > plain.length, 'lead adds one layer');
    const added = lead.find((l) => l.lead === true);
    assert.ok(added && next.some((l) => l.kind === added.kind && l.level === added.level), 'lead layer exists in the next plan with the same kind and level');
    assert.ok(lead.filter((l) => l.kind !== 'thunder' && l.kind !== 'vinyl').length <= plain.filter((l) => l.kind !== 'thunder' && l.kind !== 'vinyl').length + 1, 'at most one extra layer');
    assert.equal(resolveAmbientPlan({ location: '教室', leadLocation: '教室' }, on).some((l) => l.lead), false);

    const queue = [];
    const ctx = fakeAudio();
    const mkRoot = () => ({ ownerDocument: { addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {} });
    const opts = { ambient: { enabled: true }, contextFactory: () => ctx, schedule: (fn, ms) => { const t = { fn, ms }; queue.push(t); return t; }, clear: (t) => { const i = queue.indexOf(t); if (i >= 0) queue.splice(i, 1); } };
    const root = mkRoot();
    applySceneAudio(root, { ...opts, context: { location: '森林', time: '白天' } });
    applySceneAudio(root, { ...opts, context: { location: '教室', time: '白天', lcut: true } });
    assert.ok(queue.some((t) => t.ms === AMBIENT_TRAIL_HOLD_MS), 'l-cut postpones fadeOut');
    assert.ok(!queue.some((t) => t.ms === 1300), 'no immediate dispose is queued for the held layer');
    cancelSceneAudio(root);
    const root2 = mkRoot();
    queue.length = 0;
    applySceneAudio(root2, { ...opts, context: { location: '森林', time: '白天' } });
    applySceneAudio(root2, { ...opts, context: { location: '教室', time: '白天' } });
    assert.ok(queue.some((t) => t.ms === 1300), 'without l-cut the old layer fades at once');
    cancelSceneAudio(root2);
    assert.deepEqual(audioCuesOf({ daily: [{ type: 'jcut', place: '森林' }, { type: 'lcut' }] }, ON), { leadLocation: '森林', lcut: true });
    // 包总开关显式关掉时 jcut 被剥掉（camera 包 defaultOn 后必须显式 false 才算关）。
    assert.deepEqual(audioCuesOf({ daily: [{ type: 'jcut', place: '森林' }] }, { dailyFx: { enabled: true, jcut: true }, cameraPackFx: { enabled: false } }), { leadLocation: '', lcut: false });
});

test('gate:bg-transition-tag-override', () => {
    assert.equal(cutStyleOf({ daily: [{ type: 'cut', style: 'iris' }] }, ON), 'fade', 'retired iris falls back to fade');
    const r = makeReader();
    const settings = { ...ON, sceneTransition: { enabled: true, style: 'wipe' } };
    r.bg.style.backgroundImage = 'url("a.png")';
    const run = (bgUrl, content, index) => applyStageDirection(r.root, snap(settings, content, index), { bgUrl, reducedMotion: false, ...r.clock });
    run('a.png', { sceneLocation: '教室' }, 0);
    r.bg.style.backgroundImage = 'url("b.png")';
    assert.deepEqual(run('b.png', { sceneLocation: '走廊', fx: { daily: [{ type: 'cut', style: 'iris' }] } }, 1).played, ['bg:fade']);
    r.clock.flush();
    r.bg.style.backgroundImage = 'url("c.png")';
    assert.deepEqual(run('c.png', { sceneLocation: '操场' }, 2).played, ['bg:wipe'], 'next page returns to the global style');
    const reduced = applyStageDirection(r.root, snap(settings, { sceneLocation: '屋顶', fx: { daily: [{ type: 'cut', style: 'blinds' }] } }, 3), { bgUrl: 'd.png', reducedMotion: true, ...r.clock });
    assert.ok(!reduced.played.includes('bg:black'));
});

test('gate:camera-implied-cam-and-attrs', () => {
    const r = makeReader();
    const settings = { ...ON, camera: { enabled: true } };
    const ctx = { reducedMotion: false, ...r.clock, bgUrl: 'bg.png', spriteUrl: 'a.png', spriteKey: 'A' };
    const result = applyStageDirection(r.root, snap(settings, { fx: { cam: { shot: 'sink', target: '', mod: 'hand' } } }), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), 'sink');
    assert.equal(r.root.getAttribute('data-igs-sd-cam-mod'), 'hand');
    assert.ok(result.played.includes('camera:hand-bg'));
    assert.equal(r.sprite.style.backgroundImage, undefined, 'sink never edits the sprite image or pose');
    applyStageDirection(r.root, snap(settings, { fx: { daily: [{ type: 'establish', place: '王都' }] } }, 1), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), 'empty');
    assert.equal(r.root.getAttribute('data-igs-sd-cam-mod'), null);
    assert.deepEqual(impliedCam({ daily: [{ type: 'walk', mode: 'forest' }] }, ON), { shot: 'track', target: 'right', mod: 'hand' });
    assert.deepEqual(impliedCam({ daily: [{ type: 'seeoff', dir: 'left' }] }, { ...ON, dailyFx: { ...ON.dailyFx, seeoff: true } }), { shot: 'vertigo', target: 'far' });
    applyStageDirection(r.root, snap(settings, {}, 2), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), null);
    applyStageDirection(r.root, snap(settings, { cgActive: true, fx: { cam: { shot: 'pov' } } }, 3), ctx);
    assert.equal(r.root.getAttribute('data-igs-sd-cam'), null, 'cg pages never run the camera');
});

test('gate:camera-era-split', () => {
    assert.equal(PACK.era, null);
    assert.equal(PACK.eraKinds, undefined);
    const registry = buildPackRegistry([PACK]);
    assert.deepEqual(registry.eraTables.modern, []);
    assert.deepEqual(registry.eraTables.ancient, []);
    assert.deepEqual(registry.worldviewOff, {});
    assert.ok(resolveCameraAmbience('皇宫大殿') === null || resolveCameraAmbience('皇宫大殿').kind === 'cmroom');
});

test('gate:camera-prompt-descriptive', () => {
    for (const kind of CAMERA_KINDS) {
        const line = PACK.promptLines[kind];
        assert.ok(line.includes('：'), kind);
        assert.ok(line.length <= 150, `${kind} one or two sentences`);
        assert.ok((line.match(/\//g) || []).length <= 12, `${kind} not a keyword table`);
    }
    assert.equal(Object.keys(PACK.triggers).length, CAMERA_KINDS.length);
    for (const words of Object.values(PACK.triggers)) assert.ok(words.every((w) => w.length >= 2));
});
