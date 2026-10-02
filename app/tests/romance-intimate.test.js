import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PHASE_TEMPO,
    SWAY_AMPLITUDE,
    beatPush,
    heartPulse,
    nextBeat,
    resolveIntimateMaterial,
    resolveIntimatePhase,
    resolveIntimateTempo,
    swayAt,
} from '../src/visual/igs-ui/romance-intimate.js';
import { closeRomanceIntimate, resolveIntimatePlan, syncRomanceIntimate } from '../src/visual/igs-ui/romance-intimate-runtime.js';
import { INTIMATE_STYLE_TEXT } from '../src/visual/igs-ui/romance-intimate-style.js';
import { ROMANCE_STYLE_TEXT } from '../src/visual/igs-ui/romance-style.js';
import { normalizeRomanceFxSettings } from '../src/visual/igs-ui/romance-settings.js';
import { renderRomanceFxFields } from '../src/visual/igs-ui/romance-fields.js';
import { ASSET_GRADE_RATIO, resolveSceneGradePlan } from '../src/visual/igs-ui/scene-grade.js';
import { emotionProfile } from '../src/visual/igs-ui/speech-prosody.js';

const span = (index, length, { continued = false, endsInFloor = true } = {}) => ({ index, length, continued, endsInFloor });
const SOUND = { enabled: true, volume: 0.5 };

function seq(values) {
    let i = 0;
    return () => values[i++ % values.length];
}

function makeEl(doc, { id = '', className = '' } = {}) {
    const attrs = new Map();
    const vars = new Map();
    const el = {
        id, className, ownerDocument: doc, children: [], parentNode: null, offsetWidth: 0,
        style: {
            setProperty(name, value) { vars.set(name, String(value)); },
            removeProperty(name) { vars.delete(name); },
            getPropertyValue(name) { return vars.get(name) || ''; },
            vars,
        },
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
        remove() { if (el.parentNode) el.parentNode.removeChild(el); },
        querySelector(selector) {
            const match = selector.startsWith('.') ? (node) => node.className === selector.slice(1) : (node) => node.id === selector.slice(1);
            const walk = (node) => {
                for (const child of node.children) {
                    if (match(child)) return child;
                    const found = walk(child);
                    if (found) return found;
                }
                return null;
            };
            return walk(el);
        },
    };
    return el;
}

function makeStage() {
    const doc = { defaultView: {}, createElement: () => makeEl(doc) };
    const root = makeEl(doc, { id: 'igs-overlay' });
    const stage = root.appendChild(makeEl(doc, { id: 'igs-stage-motion' }));
    stage.appendChild(makeEl(doc, { id: 'igs-bg' }));
    stage.appendChild(makeEl(doc, { id: 'igs-sprite' }));
    const click = stage.appendChild(makeEl(doc, { id: 'igs-click-layer' }));
    stage.appendChild(makeEl(doc, { id: 'igs-dialog-layer' }));
    return { root, stage, click };
}

test('gate:romance-intimate:settings-defaults-keep-nsfw-sound-and-rhythm-opt-in', () => {
    const s = normalizeRomanceFxSettings({});
    assert.equal(s.softSound, true);
    assert.equal(s.edgeFx, true);
    assert.equal(s.nsfwSound, false);
    assert.equal(s.rhythm, false);
    assert.equal(s.sway, 'medium');
    assert.equal(normalizeRomanceFxSettings({ sway: 'crazy' }).sway, 'medium');
    assert.equal(normalizeRomanceFxSettings({ sway: 'off' }).sway, 'off');
    const html = renderRomanceFxFields({ romanceFx: { enabled: true, rhythm: true } });
    assert.match(html, /readerSettings\.romanceFx\.nsfwSound/);
    assert.match(html, /readerSettings\.romanceFx\.sway/);
    assert.doesNotMatch(renderRomanceFxFields({ romanceFx: { enabled: true } }), /romanceFx\.sway/);
});

test('gate:romance-intimate:phase-follows-nsfw-span', () => {
    assert.equal(resolveIntimatePhase(null), 'steady');
    assert.equal(resolveIntimatePhase(span(0, 8)), 'rise');
    assert.equal(resolveIntimatePhase(span(1, 8)), 'rise');
    assert.equal(resolveIntimatePhase(span(0, 8, { continued: true })), 'steady');
    assert.equal(resolveIntimatePhase(span(4, 8)), 'steady');
    assert.equal(resolveIntimatePhase(span(5, 8)), 'climax');
    assert.equal(resolveIntimatePhase(span(6, 8)), 'after');
    assert.equal(resolveIntimatePhase(span(7, 8)), 'after');
    // 延续到楼层末尾的段不知道何时结束：不进顶点与余韵。
    assert.equal(resolveIntimatePhase(span(7, 8, { endsInFloor: false })), 'steady');
    // 短段不硬拆。
    assert.equal(resolveIntimatePhase(span(1, 2)), 'rise');
});

test('gate:romance-intimate:material-by-location', () => {
    assert.equal(resolveIntimateMaterial(''), 'wood');
    assert.equal(resolveIntimateMaterial('她的卧室'), 'wood');
    assert.equal(resolveIntimateMaterial('学校保健室'), 'metal');
    assert.equal(resolveIntimateMaterial('停车场的车内'), 'leather');
    assert.equal(resolveIntimateMaterial('客厅沙发'), 'sofa');
    assert.equal(resolveIntimateMaterial('温泉旅馆的和室'), 'futon');
});

test('gate:romance-intimate:tempo-speeds-up-later', () => {
    const rise = resolveIntimateTempo('rise', span(0, 8));
    const early = resolveIntimateTempo('steady', span(2, 8));
    const late = resolveIntimateTempo('steady', span(4, 8));
    assert.ok(rise.bpm < early.bpm && early.bpm < late.bpm, 'later pages are faster');
    assert.ok(resolveIntimateTempo('steady', span(2, 8), 20).bpm > early.bpm, 'lingering on a page speeds up');
    assert.ok(resolveIntimateTempo('steady', span(2, 8), 999).bpm <= early.bpm + 10);
    const climax = resolveIntimateTempo('climax', span(5, 8));
    const climaxLate = resolveIntimateTempo('climax', span(5, 8), 12);
    assert.equal(climax.bpm, PHASE_TEMPO.climax.bpm);
    assert.ok(climaxLate.bpm > climax.bpm && climaxLate.swell > 1);
    assert.equal(resolveIntimateTempo('climax', span(5, 8), 999).bpm, 112);
    assert.equal(resolveIntimateTempo('climax', span(5, 8), 999).swell, 1.3);
    assert.equal(resolveIntimateTempo('after', span(6, 8)), null);
});

test('gate:romance-intimate:beats-follow-tempo-smoothly', () => {
    const tempo = { ...PHASE_TEMPO.steady, jitter: 0, skip: 0, double: 0 };
    let beat = { t: 0, index: 0, bpm: 60 };
    const rng = seq([0.5]);
    for (let i = 0; i < 40; i++) beat = nextBeat(beat, tempo, rng);
    assert.ok(Math.abs(beat.bpm - tempo.bpm) < 1, 'converges to target bpm');
    assert.equal(beat.index, 40);
    const skipped = nextBeat({ t: 0, index: 0, bpm: 60 }, { ...tempo, bpm: 60, skip: 1 }, seq([0.5, 0]));
    assert.equal(skipped.t, 2);
});

test('gate:romance-intimate:sway-pushes-down-then-returns-and-alternates', () => {
    assert.equal(beatPush(0), 0);
    assert.equal(beatPush(0.28), 1);
    assert.ok(beatPush(1) < 0.001);
    const amp = SWAY_AMPLITUDE.medium;
    const a = swayAt({ t: 0, index: 1, velocity: 1, jx: 0, jy: 0 }, 1, 0.28, amp);
    const b = swayAt({ t: 0, index: 2, velocity: 1, jx: 0, jy: 0 }, 1, 0.28, amp);
    assert.equal(a.y, amp.y);
    assert.equal(Math.sign(a.x), -Math.sign(b.x));
    const swollen = swayAt({ t: 0, index: 1, velocity: 1, swell: 1.3, jx: 0, jy: 0 }, 1, 0.28, amp);
    assert.ok(swollen.y > a.y);
    assert.deepEqual(swayAt({ t: 0, index: 1, velocity: 1, jx: 0, jy: 0 }, 1, 0.28, amp, 0), { x: 0, y: 0, r: 0 });
    assert.equal(heartPulse(0, 72), 1);
    assert.ok(heartPulse(0.12, 72) < 0.2);
});

test('gate:romance-intimate:plan-gates-sound-and-motion', () => {
    const defaults = normalizeRomanceFxSettings({ enabled: true });
    assert.equal(resolveIntimatePlan({ level: 0, settings: defaults, sound: SOUND }), null);
    const mild = resolveIntimatePlan({ level: 1, settings: defaults, sound: SOUND });
    assert.equal(mild.duck, 0.75);
    assert.equal(mild.gobo, true);
    assert.equal(mild.heartBpm, 0);
    const close = resolveIntimatePlan({ level: 2, settings: defaults, sound: SOUND });
    assert.ok(close.heartAudio && close.breath > 0 && close.whisper);
    // 情事场景默认只有画面边缘效果，声音与节律要单独开启。
    const nsfw = resolveIntimatePlan({ level: 3, phase: 'steady', settings: defaults, sound: SOUND });
    assert.equal(nsfw.heartAudio, false);
    assert.equal(nsfw.tempo, null);
    assert.equal(nsfw.vignette, true);
    const full = normalizeRomanceFxSettings({ enabled: true, nsfwSound: true, rhythm: true, sway: 'strong' });
    const climax = resolveIntimatePlan({ level: 3, phase: 'climax', settings: full, sound: SOUND, location: '车内' });
    assert.ok(climax.tinnitus && climax.creak && climax.knock && climax.fringe);
    assert.equal(climax.material, 'leather');
    assert.equal(climax.sway, SWAY_AMPLITUDE.strong);
    const after = resolveIntimatePlan({ level: 3, phase: 'after', settings: full, sound: SOUND });
    assert.equal(after.tempo, null);
    assert.equal(after.ticks, true);
    // 演出音效关闭：没有声音，晃动照常；减少动态效果：不晃。
    const muted = resolveIntimatePlan({ level: 3, phase: 'steady', settings: full, sound: { enabled: false, volume: 0.5 } });
    assert.equal(muted.creak, false);
    assert.ok(muted.sway && muted.tempo);
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'steady', settings: full, sound: SOUND, reduced: true }).sway, null);
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'steady', settings: { ...full, sway: 'off' }, sound: SOUND }).sway, null);
    // 触屏 / 低画质不做热浪。
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'climax', settings: full, sound: SOUND, coarse: true }).haze, 0);
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'climax', settings: full, sound: SOUND, low: true }).haze, 0);
});

test('gate:romance-intimate:front-layer-sits-below-dialog-and-peak-flashes', () => {
    const { root, stage, click } = makeStage();
    const settings = normalizeRomanceFxSettings({ enabled: true, rhythm: true });
    const info = (index, level = 3) => ({ level, span: level === 3 ? span(index - 1, 8) : null, settings, fxSound: SOUND, messageId: 7, index, coarse: false });
    syncRomanceIntimate(root, info(0, 0));
    assert.equal(stage.querySelector('.igs-rm-front'), null);
    syncRomanceIntimate(root, info(0, 2));
    const front = stage.querySelector('.igs-rm-front');
    assert.ok(front);
    assert.equal(stage.children.indexOf(front), stage.children.indexOf(click) - 1, 'front layer is inserted before the click layer, under the dialog');
    assert.equal(front.getAttribute('data-igs-rm-gobo'), '1');
    // 从亲密档进入情事段开头：暗转。
    syncRomanceIntimate(root, info(1));
    assert.equal(stage.querySelector('.igs-rm-veil').getAttribute('data-igs-rm-veil'), 'dark');
    assert.equal(stage.getAttribute('data-igs-rm-sway'), '1');
    syncRomanceIntimate(root, info(6));
    assert.equal(front.getAttribute('data-igs-rm-fringe'), '1');
    // 顶点页翻到余韵页：白场。
    syncRomanceIntimate(root, info(7));
    assert.equal(stage.querySelector('.igs-rm-veil').getAttribute('data-igs-rm-veil'), 'flash');
    assert.equal(front.getAttribute('data-igs-rm-fringe'), null);
    // 翻回去再翻过来不是「向前一页」时不重播：回到顶点页后跳两页。
    syncRomanceIntimate(root, info(6));
    stage.querySelector('.igs-rm-veil').removeAttribute('data-igs-rm-veil');
    syncRomanceIntimate(root, info(8));
    assert.equal(stage.querySelector('.igs-rm-veil').getAttribute('data-igs-rm-veil'), null);
    closeRomanceIntimate(root);
    assert.equal(stage.querySelector('.igs-rm-front'), null);
    assert.equal(stage.getAttribute('data-igs-rm-sway'), null);
});

test('gate:romance-intimate:styles-never-filter-assets-and-keep-dialog-still', () => {
    assert.doesNotMatch(INTIMATE_STYLE_TEXT, /#igs-(bg|sprite|cast)[^{]*\{[^}]*filter:/);
    assert.doesNotMatch(INTIMATE_STYLE_TEXT, /igs-dialog/);
    assert.match(INTIMATE_STYLE_TEXT, /#igs-sprite:not\(\.igs-sprite-editing\)\{translate:calc\(var\(--igs-sd-tx,0px\) \+ var\(--igs-rm-dx,0%\) \+ var\(--igs-rm-sx,0px\)\)/);
    assert.match(INTIMATE_STYLE_TEXT, /\[data-igs-rm-asset\] \.igs-rm-back\{[^}]*mask-image/);
    // 亲密演出的背景柔焦叠在环境滤镜之上，不再整条替换。
    assert.match(ROMANCE_STYLE_TEXT, /saturate\(1\.06\) var\(--igs-grade-bg,\)!important/);
});

test('gate:romance-intimate:scene-grade-softens-on-generated-art', () => {
    const settings = { enabled: true, strength: 'medium' };
    const plain = resolveSceneGradePlan({ settings, time: '夜晚' });
    const art = resolveSceneGradePlan({ settings, time: '夜晚', asset: true });
    assert.ok(Math.abs(art.bg.b - 1) < Math.abs(plain.bg.b - 1));
    assert.ok(Math.abs((art.bg.b - 1) - (plain.bg.b - 1) * ASSET_GRADE_RATIO) < 0.01);
    assert.notEqual(art.key, plain.key);
    assert.equal(plain.key.endsWith('asset'), false);
});

test('gate:romance-intimate:synchronous-raf-host-does-not-recurse', async () => {
    const { root, stage } = makeStage();
    let calls = 0;
    stage.ownerDocument.defaultView.requestAnimationFrame = (fn) => { calls += 1; fn(Date.now()); return calls; };
    const settings = normalizeRomanceFxSettings({ enabled: true });
    syncRomanceIntimate(root, { level: 2, settings, fxSound: SOUND, messageId: 1, index: 0, coarse: false });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(calls, 1, 'falls back to timer frames after one inline callback');
    closeRomanceIntimate(root);
});

test('gate:romance-intimate:whisper-voice-profile', () => {
    assert.equal(emotionProfile('耳语').id, 'whisper');
    assert.ok(emotionProfile('耳语').gain < 1);
});

test('gate:romance-intimate:rhythm-sound-can-be-off-while-sway-keeps-clock', () => {
    const settings = normalizeRomanceFxSettings({ enabled: true, rhythm: true, rhythmSound: false, sway: 'medium' });
    assert.equal(normalizeRomanceFxSettings({ rhythm: true }).rhythmSound, true);
    const plan = resolveIntimatePlan({ level: 3, phase: 'climax', settings, sound: SOUND });
    assert.equal(plan.creak, false);
    assert.equal(plan.knock, false);
    assert.equal(plan.settle, false);
    assert.ok(plan.sway);
    assert.ok(plan.tempo);
    assert.match(renderRomanceFxFields({ romanceFx: settings }), /romanceFx.rhythmSound/);
});
