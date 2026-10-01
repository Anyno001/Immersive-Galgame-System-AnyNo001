import { prefersReducedMotion } from './reduced-motion.js';
import { isStagePaused } from './stage-pause.js';
import { WEATHER_FLASH_EVENT, normalizeWeatherFxSettings, resolveWeatherFxPlan, resolveWeatherFxScene, resolveWeatherFxTime } from './weather-fx-runtime.js';
import { normalizeTimeTintSettings } from './stage-direction-settings.js';

export const GRADE_FADE_MS = 1400;
export const FLASH_FADE_MS = 380;
const FLASH_BOOST = 1.6;
// 立绘调色幅度只取背景的一部分，夜里人物仍要看得清。
export const SPRITE_GRADE_RATIO = 0.55;
// 画面是生成的 CG / 插图时，环境滤镜只留一点气氛，不盖过素材本身的色调。
export const ASSET_GRADE_RATIO = 0.35;
// 立绘少降对比与饱和、多压亮度：降对比会像半透明，压暗加色偏才像被环境光照着。
const SPRITE_CHANNEL_WEIGHT = Object.freeze({ c: 0.5, s: 0.8, b: 1.3 });
const STRENGTH_SCALE = Object.freeze({ light: 0.62, medium: 1, strong: 1.4 });
// 按细分程度缩放天气调色；只带旧三档 level 时取值不变。
const LEVEL_SCALE = Object.freeze({ drizzle: 0.42, light: 0.6, medium: 1, heavy: 1.35, storm: 1.6 });
// 室内有灯光，夜色减半；天气隔着窗户只剩一点。
const INDOOR_NIGHT_SCALE = 0.5;
const INDOOR_WEATHER_SCALE = 0.35;
const MAX_LAYER_AMOUNT = 0.95;
const LIMITS = Object.freeze({ c: [0.7, 1.15], s: [0.5, 1.25], b: [0.6, 1.12] });
const NEUTRAL = Object.freeze({ c: 1, s: 1, b: 1 });
const WHITE = Object.freeze([255, 255, 255]);

// layer 为背景之上的正片叠底渐变（上、下两色），amount 为中档浓度；c/s/b 为对比、饱和、亮度。
const TIME_GRADES = Object.freeze({
    dawn: Object.freeze({ top: [250, 196, 196], bottom: [255, 226, 200], amount: 0.7, c: 0.96, s: 0.94, b: 1.03, glow: 1 }),
    dusk: Object.freeze({ top: [255, 150, 92], bottom: [214, 116, 132], amount: 0.72, c: 1.05, s: 1.12, b: 0.95, glow: 1 }),
    night: Object.freeze({ top: [58, 72, 150], bottom: [84, 100, 178], amount: 0.74, c: 0.96, s: 0.72, b: 0.86, glow: 1 }),
    midnight: Object.freeze({ top: [30, 38, 96], bottom: [50, 60, 128], amount: 0.78, c: 0.94, s: 0.6, b: 0.76, glow: 0 }),
});
const WEATHER_GRADES = Object.freeze({
    rain: Object.freeze({ color: [190, 205, 230], amount: 0.35, c: 0.92, s: 0.78, b: 0.94 }),
    snow: Object.freeze({ color: [220, 230, 248], amount: 0.3, c: 0.9, s: 0.8, b: 1.06 }),
    fog: Object.freeze({ color: [228, 230, 234], amount: 0.3, c: 0.8, s: 0.82, b: 1.04 }),
    sand: Object.freeze({ color: [240, 205, 150], amount: 0.4, c: 0.9, s: 0.85, b: 0.98 }),
    cloud: Object.freeze({ color: [215, 220, 230], amount: 0.25, c: 0.95, s: 0.86, b: 0.97 }),
    wind: Object.freeze({ color: WHITE, amount: 0, c: 1, s: 0.97, b: 1 }),
    sun: Object.freeze({ color: [255, 240, 215], amount: 0.18, c: 1.05, s: 1.08, b: 1.02 }),
});
const SUNLIT_TIMES = Object.freeze(['', 'day', 'dawn']);
const NIGHT_TIMES = Object.freeze(['night', 'midnight']);

const states = new WeakMap();
let filterSeq = 0;

// 触屏设备一律用普通叠色：mix-blend-mode 会把整个 #igs-stage-motion 变成离屏合成面，
// 天气粒子、立绘呼吸每帧都要带着它全屏重合成，手机上明显掉帧。
export const SCENE_GRADE_STYLE_TEXT = `
#igs-overlay #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,);-webkit-filter:brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,);}
#igs-overlay #igs-bg-blur{filter:blur(40px) brightness(.55) saturate(1.3) var(--igs-grade-bg,);-webkit-filter:blur(40px) brightness(.55) saturate(1.3) var(--igs-grade-bg,);}
#igs-overlay #igs-sprite:not(.igs-sprite-editing),#igs-overlay .igs-sd-sprite-ghost{filter:var(--igs-sprite-dim,) var(--igs-grade-sprite,);-webkit-filter:var(--igs-sprite-dim,) var(--igs-grade-sprite,);}
#igs-overlay #igs-sprite.igs-sprite-narration{--igs-sprite-dim:brightness(.86) saturate(.86);}
#igs-overlay #igs-cast{filter:var(--igs-grade-sprite,);-webkit-filter:var(--igs-grade-sprite,);}
#igs-overlay .igs-grade-layer{position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:0;transition:opacity 1.4s ease;}
#igs-overlay .igs-grade-layer::after{content:"";position:absolute;inset:0;mix-blend-mode:screen;opacity:var(--igs-grade-glow,0);}
#igs-overlay .igs-grade-layer[data-igs-grade-idle],#igs-overlay .igs-grade-layer[data-igs-grade-idle]::after{mix-blend-mode:normal;}
#igs-overlay .igs-grade-layer[data-igs-grade-time="dawn"]::after{background:radial-gradient(ellipse at 18% 12%,rgba(255,196,160,.28),transparent 62%);}
#igs-overlay .igs-grade-layer[data-igs-grade-time="dusk"]::after{background:radial-gradient(ellipse at 82% 18%,rgba(255,158,72,.42),transparent 62%);}
#igs-overlay .igs-grade-layer[data-igs-grade-time="night"]::after{background:radial-gradient(ellipse at 70% 0%,rgba(140,166,255,.12),transparent 58%);}
#igs-overlay[data-igs-quality="low"] .igs-grade-layer{mix-blend-mode:normal;background:var(--igs-grade-flat,none)!important;}
#igs-overlay[data-igs-quality="low"] .igs-grade-layer::after{display:none;}
@media (pointer: coarse){
#igs-overlay .igs-grade-layer{mix-blend-mode:normal;background:var(--igs-grade-flat,none)!important;}
#igs-overlay .igs-grade-layer::after{mix-blend-mode:normal;opacity:calc(var(--igs-grade-glow,0) * .55);}
}
#igs-stage-motion:is([data-igs-fx-flashback],[data-igs-fx-dream]) .igs-grade-layer{opacity:0!important;}
#igs-overlay .igs-grade-defs{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;}
@media (prefers-reduced-motion: reduce){
#igs-overlay .igs-grade-layer{transition:none;}
}
`.trim();

function clamp(value, [min, max]) {
    return Math.min(max, Math.max(min, value));
}

function round(value, digits = 3) {
    return Number(value.toFixed(digits));
}

function mixColor(from, to, amount) {
    return from.map((channel, index) => channel + (to[index] - channel) * amount);
}

function multiplyColor(a, b) {
    return a.map((channel, index) => (channel * b[index]) / 255);
}

// 回忆与梦境的叙事色调优先，期间环境滤镜完全让位。
export function resolveSceneGradePlan(options = {}) {
    const ranges = options.ranges || {};
    if (ranges.flashback || ranges.dream) return null;
    const tint = normalizeTimeTintSettings(options.settings);
    const weatherSettings = normalizeWeatherFxSettings(options.weatherSettings);
    if (!tint.enabled && !weatherSettings.enabled) return null;
    const time = resolveWeatherFxTime(options.time);
    const indoor = resolveWeatherFxScene(options.location, weatherSettings) === 'indoor';
    const strength = STRENGTH_SCALE[tint.strength] * (options.asset === true ? ASSET_GRADE_RATIO : 1);
    // 背景命中素材自带的时段变体（夜景图等）时，画面已有该时段光照，不再叠时段调色；天气调色照常。
    // 关掉「夜间调色」时夜晚与深夜不压暗，清晨、黄昏照常调色。
    const nightOff = !tint.night && NIGHT_TIMES.includes(time);
    const timeGrade = tint.enabled && options.timedAsset !== true && !nightOff ? TIME_GRADES[time] || null : null;
    const weatherPlan = weatherSettings.enabled
        ? resolveWeatherFxPlan({ weather: options.weather, location: options.location, time: options.time, settings: weatherSettings })
        : null;
    let weatherKind = weatherPlan ? weatherPlan.kind : '';
    if (weatherKind === 'sun' && !SUNLIT_TIMES.includes(time)) weatherKind = '';
    const weatherGrade = weatherKind ? WEATHER_GRADES[weatherKind] : null;
    if (!timeGrade && !weatherGrade) return null;

    const timeScale = timeGrade ? strength * (indoor && NIGHT_TIMES.includes(time) ? INDOOR_NIGHT_SCALE : 1) : 0;
    const weatherScale = weatherGrade ? strength * (LEVEL_SCALE[weatherPlan.grade] || LEVEL_SCALE[weatherPlan.level]) * (indoor ? INDOOR_WEATHER_SCALE : 1) : 0;
    const bg = {};
    for (const key of ['c', 's', 'b']) {
        const deviation = (timeGrade ? (timeGrade[key] - 1) * timeScale : 0) + (weatherGrade ? (weatherGrade[key] - 1) * weatherScale : 0);
        bg[key] = round(clamp(1 + deviation, LIMITS[key]));
    }
    const timeAmount = timeGrade ? Math.min(MAX_LAYER_AMOUNT, timeGrade.amount * timeScale) : 0;
    const weatherAmount = weatherGrade ? Math.min(MAX_LAYER_AMOUNT, weatherGrade.amount * weatherScale) : 0;
    const weatherColor = weatherGrade ? mixColor(WHITE, weatherGrade.color, weatherAmount) : WHITE;
    const layerOf = (edge) => multiplyColor(timeGrade ? mixColor(WHITE, timeGrade[edge], timeAmount) : WHITE, weatherColor).map((v) => Math.round(v));
    const top = layerOf('top');
    const bottom = layerOf('bottom');
    const ratio = Number.isFinite(options.spriteRatio) ? options.spriteRatio : SPRITE_GRADE_RATIO;
    const sprite = {};
    for (const key of ['c', 's', 'b']) sprite[key] = round(1 + (bg[key] - 1) * ratio * SPRITE_CHANNEL_WEIGHT[key]);
    sprite.tint = top.map((channel, index) => round(1 - (1 - (channel + bottom[index]) / 510) * ratio));
    const glow = timeGrade ? round(Math.min(1, timeGrade.glow * timeScale)) : 0;
    return {
        key: [time || '-', weatherKind || '-', weatherPlan ? weatherPlan.level : '-', indoor ? 'in' : 'out', tint.enabled ? tint.strength : 'weather', ...(options.asset === true ? ['asset'] : [])].join('|'),
        time: timeGrade ? time : '',
        weather: weatherKind,
        indoor,
        layer: { top, bottom, glow },
        bg,
        sprite,
    };
}

function neutralTarget() {
    return { bg: { ...NEUTRAL }, sprite: { ...NEUTRAL, tint: [1, 1, 1] } };
}

function targetOf(plan) {
    if (!plan) return neutralTarget();
    return { bg: { ...plan.bg }, sprite: { c: plan.sprite.c, s: plan.sprite.s, b: plan.sprite.b, tint: plan.sprite.tint.slice() } };
}

function lerpTarget(from, to, t) {
    const lerp = (a, b) => a + (b - a) * t;
    return {
        bg: { c: lerp(from.bg.c, to.bg.c), s: lerp(from.bg.s, to.bg.s), b: lerp(from.bg.b, to.bg.b) },
        sprite: {
            c: lerp(from.sprite.c, to.sprite.c), s: lerp(from.sprite.s, to.sprite.s), b: lerp(from.sprite.b, to.sprite.b),
            tint: from.sprite.tint.map((value, index) => lerp(value, to.sprite.tint[index])),
        },
    };
}

function isNeutral(value) {
    const near = (v) => Math.abs(v - 1) < 0.0005;
    return ['c', 's', 'b'].every((key) => near(value.bg[key]) && near(value.sprite[key])) && value.sprite.tint.every(near);
}

function setVar(el, name, value) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
}

function cssFunctions(value) {
    return `contrast(${round(value.c)}) saturate(${round(value.s)}) brightness(${round(value.b)})`;
}

function matrixValues(tint) {
    const [r, g, b] = tint.map((v) => round(v));
    return `${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0`;
}

function removeNode(node) {
    if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function ensureDefs(state, root, doc) {
    if (state.matrix && state.defs && state.defs.parentNode) return state.matrix;
    if (typeof doc.createElementNS !== 'function' || typeof root.appendChild !== 'function') return null;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'igs-grade-defs');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const filter = doc.createElementNS(ns, 'filter');
    filterSeq += 1;
    state.filterId = `igs-grade-tint-${filterSeq}`;
    filter.setAttribute('id', state.filterId);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const matrix = doc.createElementNS(ns, 'feColorMatrix');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', matrixValues([1, 1, 1]));
    filter.appendChild(matrix);
    svg.appendChild(filter);
    root.appendChild(svg);
    state.defs = svg;
    state.matrix = matrix;
    return matrix;
}

// 变量只写到读取它们的元素上：写在 overlay 根上会让整棵子树（含对话框、面板）在渐变的每一帧重算样式。
const GRADE_TARGETS = Object.freeze([['#igs-bg', 'bg'], ['#igs-bg-blur', 'bg'], ['#igs-sprite', 'sprite'], ['#igs-cast', 'sprite']]);

function writeGradeVars(root, vars) {
    const targets = GRADE_TARGETS.map(([selector, kind]) => [root.querySelector(selector), kind]);
    if (typeof root.querySelectorAll === 'function') {
        for (const ghost of root.querySelectorAll('.igs-sd-sprite-ghost')) targets.push([ghost, 'sprite']);
    }
    for (const [el, kind] of targets) {
        if (!el || !el.style) continue;
        const name = kind === 'bg' ? '--igs-grade-bg' : '--igs-grade-sprite';
        const value = vars ? vars[kind] : null;
        const current = typeof el.style.getPropertyValue === 'function' ? el.style.getPropertyValue(name) : undefined;
        if (current === (value == null ? '' : value)) continue;
        setVar(el, name, value);
    }
}

function writeFrame(state, root, value) {
    if (isNeutral(value)) {
        state.vars = null;
        writeGradeVars(root, null);
        if (state.matrix) state.matrix.setAttribute('values', matrixValues([1, 1, 1]));
        return;
    }
    const tintUrl = state.matrix && state.filterId ? `url(#${state.filterId}) ` : '';
    state.vars = { bg: cssFunctions(value.bg), sprite: `${tintUrl}${cssFunctions(value.sprite)}` };
    writeGradeVars(root, state.vars);
    if (state.matrix) state.matrix.setAttribute('values', matrixValues(value.sprite.tint));
}

function stopTween(state) {
    if (state.frame != null) state.cancelFrame(state.frame);
    state.frame = null;
}

function tweenTo(state, root, target, instant, duration = GRADE_FADE_MS) {
    stopTween(state);
    if (instant) {
        state.current = target;
        writeFrame(state, root, target);
        return;
    }
    const from = state.current;
    const start = state.now();
    const step = () => {
        const t = Math.min(1, (state.now() - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        state.current = lerpTarget(from, target, eased);
        writeFrame(state, root, state.current);
        state.frame = t < 1 ? state.requestFrame(step) : null;
    };
    state.frame = state.requestFrame(step);
}

function makeLayer(doc) {
    const layer = doc.createElement('div');
    layer.className = 'igs-grade-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-igs-grade-idle', '');
    return layer;
}

// 低画质档的普通叠色：假设背景亮度均匀分布，对 B×C 做最小二乘逼近 B×(1-α)+T×α；三通道共用一个 α，所以按通道截断后逐档搜索。
export function flatGradeTint(rgb) {
    const c = rgb.map((v) => v / 255);
    let best = null;
    for (let step = 0; step <= 100; step += 1) {
        const alpha = step / 100;
        let error = 0;
        const offsets = c.map((value) => {
            const slope = 1 - alpha - value;
            const offset = Math.min(alpha, Math.max(0, -slope / 2));
            error += (slope * slope) / 3 + slope * offset + offset * offset;
            return offset;
        });
        if (!best || error < best.error - 1e-9) best = { alpha, offsets, error };
    }
    if (best.alpha === 0) return 'rgba(0,0,0,0)';
    return `rgba(${best.offsets.map((offset) => Math.round((offset / best.alpha) * 255)).join(',')},${best.alpha})`;
}

// A/B 两层交替：换色时新层淡入、旧层淡出，渐变不硬切。
// 残影层紧贴 #igs-bg 之后插入，调色层放在立绘之前，才能压住残影又不染立绘。
function attachLayers(state, root, doc) {
    const bg = root.querySelector('#igs-bg');
    const parent = bg && bg.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') return false;
    if (state.layers.length !== 2) state.layers = [makeLayer(doc), makeLayer(doc)];
    const sprite = root.querySelector('#igs-sprite');
    const anchor = sprite && sprite.parentNode === parent ? sprite : bg.nextSibling || null;
    for (const layer of state.layers) {
        if (layer.parentNode !== parent) parent.insertBefore(layer, anchor);
    }
    return true;
}

// 淡出结束后把闲置层的混合模式退回 normal：opacity 为 0 的 multiply 层照样会让整个舞台离屏合成。
function retireLayer(state, layer) {
    layer.style.opacity = '0';
    clearTimeout(state.idleTimers.get(layer));
    state.idleTimers.set(layer, setTimeout(() => {
        state.idleTimers.delete(layer);
        if (layer.style.opacity === '0') layer.setAttribute('data-igs-grade-idle', '');
    }, GRADE_FADE_MS + 100));
}

function paintLayers(state, plan) {
    const layerKey = plan ? JSON.stringify([plan.layer, plan.time]) : '';
    if (layerKey === state.layerKey) return;
    state.layerKey = layerKey;
    if (state.active >= 0) retireLayer(state, state.layers[state.active]);
    if (!plan) {
        state.active = -1;
        return;
    }
    state.active = state.active === 0 ? 1 : 0;
    const layer = state.layers[state.active];
    clearTimeout(state.idleTimers.get(layer));
    state.idleTimers.delete(layer);
    layer.removeAttribute('data-igs-grade-idle');
    layer.style.background = `linear-gradient(180deg,rgb(${plan.layer.top.join(',')}),rgb(${plan.layer.bottom.join(',')}))`;
    setVar(layer, '--igs-grade-flat', `linear-gradient(180deg,${flatGradeTint(plan.layer.top)},${flatGradeTint(plan.layer.bottom)})`);
    setVar(layer, '--igs-grade-glow', String(plan.layer.glow));
    if (plan.time) layer.setAttribute('data-igs-grade-time', plan.time);
    else layer.removeAttribute('data-igs-grade-time');
    layer.style.opacity = '1';
}

// 闪电时背景与立绘一起被照亮，再回落到当前调色；回忆、梦境与减弱动效时不闪。
function onFlash(state, root) {
    // 设置、记录等面板盖住舞台时不闪：闪屏本身已暂停，照亮渐变只会让面板毛玻璃跟着每帧重算。
    if (!state.flashOn || isStagePaused(root)) return;
    const target = state.target || neutralTarget();
    const lit = (value) => ({ ...value, b: value.b * FLASH_BOOST });
    state.current = { bg: lit(target.bg), sprite: { ...lit(target.sprite), tint: target.sprite.tint.slice() } };
    writeFrame(state, root, state.current);
    tweenTo(state, root, target, false, FLASH_FADE_MS);
}

function syncFlash(state, root, on) {
    state.flashOn = on;
    if (!on || state.flashListener || typeof root.addEventListener !== 'function') return;
    state.flashListener = () => onFlash(state, root);
    root.addEventListener(WEATHER_FLASH_EVENT, state.flashListener);
}

function getState(root, ctx) {
    let state = states.get(root);
    if (!state) {
        const view = root.ownerDocument && root.ownerDocument.defaultView;
        const raf = view && typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame.bind(view) : null;
        const caf = view && typeof view.cancelAnimationFrame === 'function' ? view.cancelAnimationFrame.bind(view) : null;
        state = {
            planKey: '', layers: [], active: -1, layerKey: '', defs: null, matrix: null, filterId: '', target: null, flashOn: false, flashListener: null,
            current: neutralTarget(), frame: null, vars: null, idleTimers: new Map(),
            requestFrame: raf || ((fn) => setTimeout(fn, 16)),
            cancelFrame: caf || ((id) => clearTimeout(id)),
            now: () => (view && view.performance && typeof view.performance.now === 'function' ? view.performance.now() : Date.now()),
        };
        states.set(root, state);
    }
    if (typeof ctx.requestFrame === 'function') state.requestFrame = ctx.requestFrame;
    if (typeof ctx.cancelFrame === 'function') state.cancelFrame = ctx.cancelFrame;
    if (typeof ctx.now === 'function') state.now = ctx.now;
    return state;
}

export function applySceneGrade(root, options = {}) {
    if (!root || typeof root.querySelector !== 'function') return null;
    const doc = root.ownerDocument;
    const plan = resolveSceneGradePlan(options);
    if (!plan && !states.has(root)) return null;
    if (!doc || typeof doc.createElement !== 'function') return plan;
    const state = getState(root, options);
    const reduced = options.reducedMotion === true || (options.reducedMotion !== false && prefersReducedMotion());
    const ranges = options.ranges || {};
    ensureDefs(state, root, doc);
    syncFlash(state, root, !reduced && normalizeWeatherFxSettings(options.weatherSettings).enabled && !ranges.flashback && !ranges.dream);
    if (attachLayers(state, root, doc)) paintLayers(state, plan);
    const key = plan ? JSON.stringify([plan.bg, plan.sprite]) : '';
    if (key === state.planKey) {
        // 渐变结束后才出现的立绘、多人立绘层也要拿到当前调色。
        if (state.frame == null) writeGradeVars(root, state.vars);
        return plan;
    }
    state.planKey = key;
    state.target = targetOf(plan);
    tweenTo(state, root, state.target, reduced || options.instant === true);
    return plan;
}

export function cancelSceneGrade(root) {
    const state = root && states.get(root);
    if (!state) return false;
    stopTween(state);
    for (const timer of state.idleTimers.values()) clearTimeout(timer);
    state.idleTimers.clear();
    if (state.flashListener && typeof root.removeEventListener === 'function') root.removeEventListener(WEATHER_FLASH_EVENT, state.flashListener);
    for (const layer of state.layers) removeNode(layer);
    removeNode(state.defs);
    writeGradeVars(root, null);
    states.delete(root);
    return true;
}
