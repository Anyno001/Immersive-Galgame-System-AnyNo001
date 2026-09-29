import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCENE_GRADE_STYLE_TEXT,
    applySceneGrade,
    cancelSceneGrade,
    resolveSceneGradePlan,
} from '../src/visual/igs-ui/scene-grade.js';
import { WEATHER_FLASH_EVENT } from '../src/visual/igs-ui/weather-fx-runtime.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';

const TINT = { enabled: true, strength: 'medium' };
const WEATHER = { enabled: true };

function makeStyle() {
    const vars = new Map();
    return {
        opacity: '', background: '',
        setProperty(name, value) { vars.set(name, String(value)); },
        removeProperty(name) { vars.delete(name); },
        getPropertyValue(name) { return vars.get(name) || ''; },
    };
}

function makeEl(doc, id = '', tag = 'div') {
    const attrs = new Map();
    const el = {
        id, tag, ownerDocument: doc, children: [], parentNode: null, className: '', style: makeStyle(),
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
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
        listeners: new Map(),
        addEventListener(name, fn) { el.listeners.set(name, fn); },
        removeEventListener(name) { el.listeners.delete(name); },
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
    };
    return el;
}

function makeReader() {
    const doc = { defaultView: null, createElement: () => makeEl(doc), createElementNS: (ns, tag) => makeEl(doc, '', tag) };
    const root = makeEl(doc, 'igs-overlay');
    const motion = root.appendChild(makeEl(doc, 'igs-stage-motion'));
    const bg = motion.appendChild(makeEl(doc, 'igs-bg'));
    const sprite = motion.appendChild(makeEl(doc, 'igs-sprite'));
    let clock = 0;
    const frames = [];
    const ctx = {
        reducedMotion: false,
        now: () => clock,
        requestFrame: (fn) => { frames.push(fn); return frames.length; },
        cancelFrame: () => { frames.length = 0; },
        finish() {
            clock += 5000;
            while (frames.length) frames.shift()();
        },
    };
    return { doc, root, motion, bg, sprite, ctx };
}

function layers(motion) {
    return motion.children.filter((child) => child.className === 'igs-grade-layer');
}

function deviation(value) {
    return Math.abs(value.c - 1) + Math.abs(value.s - 1) + Math.abs(value.b - 1);
}

test('gate: scene grade stays off unless time tint or weather fx is enabled', () => {
    assert.equal(resolveSceneGradePlan({ time: '夜晚', weather: '大雨' }), null);
    assert.equal(resolveSceneGradePlan({ settings: TINT, time: '下午' }), null);
    const timeOnly = resolveSceneGradePlan({ settings: TINT, time: '夜晚', weather: '大雨' });
    assert.equal(timeOnly.time, 'night');
    assert.equal(timeOnly.weather, '');
    const weatherOnly = resolveSceneGradePlan({ weatherSettings: WEATHER, time: '夜晚', weather: '大雨' });
    assert.equal(weatherOnly.time, '');
    assert.equal(weatherOnly.weather, 'rain');
    const both = resolveSceneGradePlan({ settings: TINT, weatherSettings: WEATHER, time: '夜晚', weather: '大雨' });
    assert.equal(both.time, 'night');
    assert.equal(both.weather, 'rain');
    assert.ok(both.bg.s < timeOnly.bg.s);
});

test('gate: flashback and dream take priority over the scene grade', () => {
    const options = { settings: TINT, weatherSettings: WEATHER, time: '黄昏', weather: '小雨' };
    assert.ok(resolveSceneGradePlan(options));
    assert.equal(resolveSceneGradePlan({ ...options, ranges: { flashback: true } }), null);
    assert.equal(resolveSceneGradePlan({ ...options, ranges: { dream: true } }), null);
    assert.ok(resolveSceneGradePlan({ ...options, ranges: { letterbox: true } }));
    assert.match(SCENE_GRADE_STYLE_TEXT, /data-igs-fx-flashback\],\[data-igs-fx-dream\]\) \.igs-grade-layer\{opacity:0!important/);
});

test('gate: scene grade scales with strength, eases indoors and keeps sprites gentler than the background', () => {
    const at = (strength, extra = {}) => resolveSceneGradePlan({ settings: { enabled: true, strength }, weatherSettings: WEATHER, time: '深夜', weather: '暴雨', location: '公园', ...extra });
    const light = at('light');
    const medium = at('medium');
    const strong = at('strong');
    assert.ok(deviation(light.bg) < deviation(medium.bg));
    assert.ok(deviation(medium.bg) < deviation(strong.bg));
    assert.ok(deviation(at('strong', { location: '卧室' }).bg) < deviation(strong.bg));
    for (const plan of [light, medium, strong]) {
        assert.ok(deviation(plan.sprite) < deviation(plan.bg));
        for (const key of ['c', 's', 'b']) assert.ok(Math.abs(plan.sprite[key] - 1) <= Math.abs(plan.bg[key] - 1));
        assert.ok(Math.abs(plan.sprite.c - 1) < Math.abs(plan.sprite.b - 1) || plan.sprite.b === 1);
    }
});

test('gate: every time and weather combination stays inside safe grading limits', () => {
    const times = ['清晨', '中午', '黄昏', '夜晚', '深夜'];
    const weathers = ['', '晴', '多云', '小雨', '雷暴雨', '大雪', '浓雾', '沙尘暴', '大风'];
    for (const strength of ['light', 'medium', 'strong']) {
        for (const time of times) {
            for (const weather of weathers) {
                for (const location of ['公园', '卧室']) {
                    const plan = resolveSceneGradePlan({ settings: { enabled: true, strength }, weatherSettings: WEATHER, time, weather, location });
                    if (!plan) continue;
                    assert.ok(plan.bg.b >= 0.6 && plan.bg.s >= 0.5 && plan.bg.c >= 0.7, `${time}/${weather}/${strength}`);
                    for (const value of [...plan.layer.top, ...plan.layer.bottom]) assert.ok(Number.isInteger(value) && value >= 0 && value <= 255);
                    for (const value of plan.sprite.tint) assert.ok(value > 0.5 && value <= 1);
                }
            }
        }
    }
    assert.equal(resolveSceneGradePlan({ weatherSettings: WEATHER, time: '夜晚', weather: '晴' }), null);
    assert.equal(resolveSceneGradePlan({ weatherSettings: WEATHER, time: '中午', weather: '晴' }).weather, 'sun');
});

test('gate: scene grade layers sit between background and sprite and cross-fade on change', () => {
    const r = makeReader();
    const options = { ...r.ctx, settings: TINT, weatherSettings: WEATHER, location: '河边' };
    const dusk = applySceneGrade(r.root, { ...options, time: '黄昏' });
    assert.equal(dusk.time, 'dusk');
    const [a, b] = layers(r.motion);
    assert.ok(a && b);
    const order = r.motion.children.map((child) => child.id || child.className);
    assert.deepEqual(order, ['igs-bg', 'igs-grade-layer', 'igs-grade-layer', 'igs-sprite']);
    assert.equal(a.style.opacity, '1');
    assert.equal(a.getAttribute('data-igs-grade-time'), 'dusk');
    r.ctx.finish();
    assert.match(r.bg.style.getPropertyValue('--igs-grade-bg'), /^contrast\([\d.]+\) saturate\([\d.]+\) brightness\([\d.]+\)$/);
    assert.match(r.sprite.style.getPropertyValue('--igs-grade-sprite'), /^url\(#igs-grade-tint-\d+\) contrast/);
    const defs = r.root.children.find((child) => child.tag === 'svg');
    assert.ok(defs);

    applySceneGrade(r.root, { ...options, time: '黄昏' });
    assert.equal(layers(r.motion).length, 2);
    assert.equal(a.style.opacity, '1');

    applySceneGrade(r.root, { ...options, time: '深夜' });
    assert.equal(a.style.opacity, '0');
    assert.equal(b.style.opacity, '1');
    assert.equal(b.getAttribute('data-igs-grade-time'), 'midnight');

    applySceneGrade(r.root, { ...options, time: '深夜', ranges: { dream: true } });
    assert.equal(b.style.opacity, '0');
    r.ctx.finish();
    assert.equal(r.bg.style.getPropertyValue('--igs-grade-bg'), '');
    assert.equal(r.sprite.style.getPropertyValue('--igs-grade-sprite'), '');

    assert.equal(cancelSceneGrade(r.root), true);
    assert.equal(layers(r.motion).length, 0);
    assert.ok(!r.root.children.includes(defs));
    assert.equal(cancelSceneGrade(r.root), false);
});

test('gate: scene grade jumps straight to the target under reduced motion and does nothing when off', () => {
    const r = makeReader();
    assert.equal(applySceneGrade(r.root, { ...r.ctx, time: '夜晚' }), null);
    assert.equal(layers(r.motion).length, 0);
    applySceneGrade(r.root, { ...r.ctx, reducedMotion: true, settings: TINT, time: '夜晚' });
    assert.notEqual(r.bg.style.getPropertyValue('--igs-grade-bg'), '');
});

test('gate: lightning brightens the graded stage and settles back, but not in dreams', () => {
    const r = makeReader();
    const options = { ...r.ctx, weatherSettings: WEATHER, time: '夜晚', weather: '雷阵雨', location: '街道' };
    applySceneGrade(r.root, options);
    r.ctx.finish();
    const settled = r.bg.style.getPropertyValue('--igs-grade-bg');
    const flash = r.root.listeners.get(WEATHER_FLASH_EVENT);
    assert.equal(typeof flash, 'function');
    flash();
    const lit = Number(r.bg.style.getPropertyValue('--igs-grade-bg').match(/brightness\(([\d.]+)\)/)[1]);
    assert.ok(lit > Number(settled.match(/brightness\(([\d.]+)\)/)[1]) * 1.4);
    r.ctx.finish();
    assert.equal(r.bg.style.getPropertyValue('--igs-grade-bg'), settled);
    applySceneGrade(r.root, { ...options, ranges: { dream: true } });
    r.ctx.finish();
    flash();
    assert.equal(r.bg.style.getPropertyValue('--igs-grade-bg'), '');
    cancelSceneGrade(r.root);
    assert.ok(!r.root.listeners.has(WEATHER_FLASH_EVENT));
});

test('gate: reader styles compose bg and sprite filters through variables', () => {
    const css = getOriginalReaderStyleText();
    assert.ok(css.includes('#igs-overlay #igs-bg{filter:brightness(var(--igs-bg-brightness,.88)) var(--igs-grade-bg,)'));
    assert.ok(css.includes('#igs-overlay #igs-sprite.igs-sprite-narration{--igs-sprite-dim:brightness(.86) saturate(.86);}'));
    assert.ok(!css.includes('igs-sd-tint'));
});

test('gate:perf:scene-grade-writes-vars-on-consumers-not-overlay-root', () => {
    const r = makeReader();
    const options = { ...r.ctx, settings: TINT, weatherSettings: WEATHER, time: '黄昏', location: '河边' };
    applySceneGrade(r.root, options);
    r.ctx.finish();
    const bgVar = r.bg.style.getPropertyValue('--igs-grade-bg');
    assert.notEqual(bgVar, '');
    assert.match(r.sprite.style.getPropertyValue('--igs-grade-sprite'), /^url\(#igs-grade-tint-/);
    assert.equal(r.root.style.getPropertyValue('--igs-grade-bg'), '');
    assert.equal(r.root.style.getPropertyValue('--igs-grade-sprite'), '');
    assert.equal(r.motion.style.getPropertyValue('--igs-grade-bg'), '');
    const cast = r.motion.appendChild(makeEl(r.doc, 'igs-cast'));
    applySceneGrade(r.root, options);
    assert.equal(cast.style.getPropertyValue('--igs-grade-sprite'), r.sprite.style.getPropertyValue('--igs-grade-sprite'));
    assert.equal(cast.style.getPropertyValue('--igs-grade-bg'), '');
    cancelSceneGrade(r.root);
    assert.equal(r.bg.style.getPropertyValue('--igs-grade-bg'), '');
    assert.equal(cast.style.getPropertyValue('--igs-grade-sprite'), '');
});

test('gate: scene grade layer carries a flat tint for the low quality tier', async () => {
    const { flatGradeTint } = await import('../src/visual/igs-ui/scene-grade.js');
    assert.equal(flatGradeTint([128, 128, 128]), 'rgba(0,0,0,0.5)', 'grey multiply equals a black veil');
    assert.equal(flatGradeTint([255, 255, 255]), 'rgba(0,0,0,0)');
    const { root, motion, ctx } = makeReader();
    applySceneGrade(root, { ...ctx, settings: TINT, time: '夜晚', instant: true });
    const active = layers(motion).find((layer) => layer.style.opacity === '1');
    assert.match(active.style.getPropertyValue('--igs-grade-flat'), /^linear-gradient\(180deg,rgba\(\d+,\d+,\d+,[\d.]+\),rgba\(\d+,\d+,\d+,[\d.]+\)\)$/);
    assert.match(SCENE_GRADE_STYLE_TEXT, /#igs-overlay\[data-igs-quality="low"\] \.igs-grade-layer\{mix-blend-mode:normal;background:var\(--igs-grade-flat,none\)!important;\}/);
    assert.match(SCENE_GRADE_STYLE_TEXT, /#igs-overlay\[data-igs-quality="low"\] \.igs-grade-layer::after\{display:none;\}/);
});
