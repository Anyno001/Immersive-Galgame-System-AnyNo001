// 立绘碰撞演出：冲刺 → 接触 → 反应 → 回位。只用 Web Animations（位移 composite:'add'，不覆盖撑伞靠拢等现有位移），
// 不画任何图形：残影、闪白、临时探出的一方都是立绘本身的复刻。参数见 scene/clash-actions.js 的 CLASH_TIERS。
import { CLASH_ACTIONS, CLASH_REACTS, CLASH_TIERS } from '../../scene/clash-actions.js';
import { peekSpriteHead, probeSpriteHead, spriteBackgroundSize, spriteDrawRect } from './fx-anchor.js';
import { speedLinesImage } from './fx-symbols.js';

const states = new WeakMap();
const GHOST_WAIT_MS = 160;
const SEQUENCE_GAP_MS = 140;
export const CLASH_GHOST_MS = Object.freeze({ peekIn: 160, sideIn: 140, out: 220, fade: 200 });
export const CLASH_HUG_MS = Object.freeze({ windup: 90, dash: 220, hold: 1200, back: 400 });
export const CLASH_HIGHFIVE_MS = Object.freeze({ dash: 150, freeze: 60, back: 220 });
export const CLASH_USER_MS = Object.freeze({ rush: 200, scale: 1.25, drop: 6 });
const PORTRAIT_SHAKE = 0.6;
const PORTRAIT_PUSH = 0.5;
const PORTRAIT_DASH = 0.5;
const PORTRAIT_DASH_SCALE = 1.15;
const GHOST_PORTRAIT_SCALE = 0.9;
const TRAIL_LAG_MS = 30;
const EASE = Object.freeze({
    windup: 'cubic-bezier(.3,0,.4,1)', dash: 'cubic-bezier(.6,0,.95,.55)', hold: 'linear', recoil: 'cubic-bezier(.2,.8,.4,1)',
    back: 'cubic-bezier(.25,.7,.3,1)', knock: 'cubic-bezier(.1,.85,.3,1)', soft: 'cubic-bezier(.3,.7,.3,1)',
});

const round = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// 纯函数：一次碰撞的时间轴与幅度。portrait 竖屏（震幅 ×0.6，定格、闪白、镜头不缩）；shake=false 时以镜头推近与加长定格代偿。
export function clashTimeline(action, tier, { portrait = false, shake = true, low = false, reduced = false } = {}) {
    const spec = CLASH_ACTIONS[action] || CLASH_ACTIONS.hit;
    const base = CLASH_TIERS[tier] || CLASH_TIERS[spec.tier] || CLASH_TIERS.mid;
    const windup = reduced ? 0 : base.windup;
    const dash = reduced ? 0 : base.dash;
    const freeze = shake ? base.freeze : Math.round(base.freeze * 1.25);
    const hit = windup + dash;
    const react = Math.max(140, base.total - hit - freeze);
    const camera = reduced ? 1 : shake ? base.camera : round3(Math.max(base.camera, 1.02) + (base.camera > 1 ? 0.02 : 0));
    return {
        ...base,
        tier: CLASH_TIERS[tier] ? tier : (spec.tier || 'mid'),
        windup, dash, hit, freeze, react, camera,
        trails: low || reduced ? 0 : base.trails,
        contrast: low || reduced ? 0 : base.contrast,
        sweep: base.sweep && !low && !reduced,
        shake: shake && !reduced ? { ...base.shake, amp: round(base.shake.amp * (portrait ? PORTRAIT_SHAKE : 1)) } : null,
        moveB: portrait ? PORTRAIT_PUSH : 1,
        turnB: portrait ? 1.25 : 1,
        react_: CLASH_REACTS[spec.react] || CLASH_REACTS.lean,
    };
}

// 纯函数：选演出分支。aOn / bOn 为双方此刻有没有立绘在画面上，aSprite / bSprite 为缺席一方取不取得到立绘。
export function planClashRoute({ action = 'hit', aOn = false, bOn = false, aUser = false, bUser = false, aNarrator = false, aSprite = false, bSprite = false, ghost = true, reduced = false } = {}) {
    const kind = (CLASH_ACTIONS[action] || CLASH_ACTIONS.hit).kind;
    if (reduced) return bOn ? 'reduced' : 'sound';
    if (aOn && bOn) return kind === 'hug' ? 'hug' : kind === 'highfive' ? 'highfive' : 'duo';
    if (aOn && bUser) return kind === 'strike' ? 'user' : 'lunge';
    if (aOn) return ghost && bSprite ? 'ghost-b' : 'lunge';
    if (bOn) {
        if (aUser || aNarrator || !aSprite || !ghost) return kind === 'strike' ? 'offscreen' : 'sound';
        return 'ghost-a';
    }
    return 'sound';
}

function stateOf(root, ctx = {}) {
    let state = states.get(root);
    if (!state) {
        state = { timers: new Set(), anims: new Set(), nodes: new Set(), classed: new Set() };
        states.set(root, state);
    }
    state.schedule = typeof ctx.schedule === 'function' ? ctx.schedule : (fn, ms) => setTimeout(fn, ms);
    state.clear = typeof ctx.clear === 'function' ? ctx.clear : (timer) => clearTimeout(timer);
    return state;
}

function later(state, fn, ms) {
    if (!(ms > 0)) { fn(); return; }
    const timer = state.schedule(() => { state.timers.delete(timer); fn(); }, ms);
    state.timers.add(timer);
}

function animate(state, el, frames, { duration, delay = 0, easing = 'linear', composite = 'add' }) {
    if (!el || typeof el.animate !== 'function' || !(duration > 0)) return null;
    try {
        const anim = el.animate(frames, { duration, delay, easing, composite, fill: 'none' });
        state.anims.add(anim);
        if (anim && 'onfinish' in anim) anim.onfinish = () => state.anims.delete(anim);
        return anim;
    } catch {
        return null;
    }
}

function addClass(state, el, name) {
    if (!el || !el.classList) return;
    el.classList.add(name);
    state.classed.add([el, name]);
}

function dropClass(el, name) {
    if (el && el.classList) el.classList.remove(name);
}

function spawn(state, parent, el, life) {
    if (!parent || !el) return null;
    parent.appendChild(el);
    state.nodes.add(el);
    later(state, () => { el.remove(); state.nodes.delete(el); }, life);
    return el;
}

function make(doc, className, text) {
    const el = doc.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    if (text) el.textContent = text;
    return el;
}

function setVar(el, name, value) {
    if (el && el.style && typeof el.style.setProperty === 'function') el.style.setProperty(name, value);
}

function originOf(el) {
    const view = el && el.ownerDocument && el.ownerDocument.defaultView;
    let raw = '';
    try { raw = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(el).transformOrigin : ''; } catch { raw = ''; }
    const parts = String(raw || '').split(/\s+/).map(parseFloat);
    if (parts.length >= 2 && parts.every(Number.isFinite)) return { x: parts[0], y: parts[1] };
    return { x: (el && el.clientWidth) / 2 || 0, y: (el && el.clientHeight) / 2 || 0 };
}

// 枢轴相对 transform-origin 的偏移：缩放 / 旋转绕立绘脚底或命中点进行，与元素自身的 transform-origin 无关。
function pivotOf(el, x, y) {
    const o = originOf(el);
    return { x: x - o.x, y: y - o.y };
}

// 背对的立绘整张水平镜像（rotate:y 180deg 或 scale:-1 1），横向位移、枢轴与角度都要取反才能落到画面上的正确方向。
function tf({ x = 0, y = 0, r = 0, sx = 1, sy = 1 } = {}, pv = { x: 0, y: 0 }, flip = false) {
    const f = flip ? -1 : 1;
    const px = round(pv.x * f);
    const py = round(pv.y);
    return `translate(${round(x * f)}px, ${round(y)}px) translate(${px}px, ${py}px) rotate(${round(r * f)}deg) scale(${round3(sx)}, ${round3(sy)}) translate(${-px}px, ${-py}px)`;
}

function keyFrames(keys, pv, flip) {
    const total = keys[keys.length - 1].t || 1;
    let last = 0;
    return keys.map((k) => {
        const offset = clamp(round3(k.t / total), last, 1);
        last = offset;
        return { offset, transform: tf(k.m, pv, flip), easing: k.ease || 'linear' };
    });
}

function flipped(el) {
    return Boolean(el && typeof el.hasAttribute === 'function' && (el.hasAttribute('data-igs-cast-flip') || el.hasAttribute('data-igs-sprite-flip')));
}

function castElOf(root, key) {
    const layer = root.querySelector('#igs-cast');
    return layer ? Array.from(layer.children || []).find((el) => el.getAttribute('data-igs-cast-char') === key && !el.hasAttribute('data-igs-cast-leaving')) || null : null;
}

function shown(el) {
    return Boolean(el && el.style && el.style.backgroundImage && el.style.display !== 'none');
}

function geometry(env, entry, extra = {}) {
    const probed = entry && entry.url ? peekSpriteHead(entry.url, env.doc) : null;
    const natural = extra.natural || (probed && probed.naturalW > 0 ? { w: probed.naturalW, h: probed.naturalH } : { w: 1, h: 2 });
    const rect = spriteDrawRect(env.w, env.h, { posX: entry.posX, posY: entry.posY, scale: entry.scale, naturalW: natural.w, naturalH: natural.h })
        || { left: env.w * 0.3, top: env.h * 0.1, w: env.w * 0.4, h: env.h * 0.9 };
    const head = (entry.head && Number(entry.head.w) > 0 ? entry.head : null) || (probed && probed.head) || null;
    const flip = extra.flip === true;
    const hx = head ? (flip ? 1 - Number(head.x) : Number(head.x)) : 0.5;
    const body = head ? clamp(Number(head.w) * rect.w * 2.3, rect.w * 0.3, rect.w * 0.85) : rect.w * 0.5;
    const feet = probed && Number(probed.feet) > 0 ? Number(probed.feet) : 1;
    return {
        cx: rect.left + rect.w * hx,
        top: rect.top,
        h: rect.h,
        w: rect.w,
        body,
        headY: rect.top + rect.h * (head ? Number(head.top) + Number(head.w) * (natural.w / natural.h) * 0.6 : 0.12),
        feetY: rect.top + rect.h * feet,
    };
}

function actorOf(env, key) {
    if (!key) return null;
    const { root, ctx } = env;
    if (key === ctx.speaker && ctx.sprite && ctx.sprite.url) {
        const el = root.querySelector('#igs-sprite');
        if (shown(el)) return { key, el, entry: ctx.sprite, flip: flipped(el), ...geometry(env, ctx.sprite, { flip: flipped(el) }) };
    }
    const entry = (Array.isArray(ctx.cast) ? ctx.cast : []).find((m) => m && m.character === key);
    const el = entry ? castElOf(root, key) : null;
    if (!entry || !shown(el)) return null;
    return { key, el, entry, flip: flipped(el), ...geometry(env, entry, { flip: flipped(el) }) };
}

function cssUrl(url) {
    return `url("${String(url).replace(/["\\]/g, (ch) => `\\${ch}`)}")`;
}

// 临时层：与 #igs-sprite 同级、紧跟其后，高度与贴底取画面上那一方的立绘，不进同屏名单。
function makeGhost(state, env, { key, url, natural, scale, posY, center, cls }) {
    const { doc, motion, root } = env;
    const el = make(doc, `igs-clash-ghost ${cls}`.trim());
    const h = env.h * scale / 100;
    const w = h * natural.w / natural.h;
    const posX = Math.abs(env.w - w) >= 1 ? (center - w / 2) / (env.w - w) * 100 : 50;
    el.style.backgroundImage = cssUrl(url);
    el.style.backgroundSize = spriteBackgroundSize(scale);
    el.style.backgroundPosition = `${round(center - w / 2)}px ${posY}%`;
    const sprite = root.querySelector('#igs-sprite');
    if (sprite && sprite.parentNode === motion) motion.insertBefore(el, sprite.nextSibling);
    else motion.appendChild(el);
    state.nodes.add(el);
    const entry = { url, posX: round(posX), posY, scale };
    return { key, el, entry, ghost: true, flip: false, ...geometry(env, entry, { natural }) };
}

function trailsOf(state, env, actor, count) {
    const out = [];
    if (!count || !actor.el || !actor.el.parentNode) return out;
    const view = env.doc.defaultView;
    let computed = null;
    try { computed = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(actor.el) : null; } catch { computed = null; }
    for (let i = 0; i < count; i++) {
        const el = make(env.doc, 'igs-clash-trail');
        el.style.backgroundImage = actor.el.style.backgroundImage;
        el.style.backgroundSize = actor.el.style.backgroundSize;
        el.style.backgroundPosition = actor.el.style.backgroundPosition;
        if (computed) {
            for (const prop of ['translate', 'rotate', 'scale', 'transform-origin']) {
                const value = computed.getPropertyValue(prop);
                if (value && value !== 'none') el.style.setProperty(prop, value);
            }
        }
        actor.el.parentNode.insertBefore(el, actor.el);
        state.nodes.add(el);
        out.push(el);
    }
    return out;
}

function playTrails(state, env, actor, keys, T, delay, pv = pivotOf(actor.el, actor.cx, actor.feetY)) {
    const trails = trailsOf(state, env, actor, T.trails);
    const total = keys[keys.length - 1].t;
    const frames = keyFrames(keys, pv, actor.flip);
    trails.forEach((el, i) => {
        const lag = TRAIL_LAG_MS * (i + 1);
        const alpha = round3(0.35 - (0.2 * i) / Math.max(1, T.trails - 1));
        animate(state, el, frames, { duration: total, delay: delay + lag });
        const at = (ms) => clamp(round3(ms / total), 0, 1);
        animate(state, el, [
            { offset: 0, opacity: 0 }, { offset: at(T.windup), opacity: 0 }, { offset: at(T.windup + 12), opacity: alpha },
            { offset: at(T.hit), opacity: alpha }, { offset: at(T.hit + T.freeze * 0.8), opacity: 0 }, { offset: 1, opacity: 0 },
        ], { duration: total, delay: delay + lag, composite: 'replace' });
    });
    later(state, () => { for (const el of trails) { el.remove(); state.nodes.delete(el); } }, delay + total + TRAIL_LAG_MS * (T.trails + 1));
}

// 出手方：蓄力后仰 → 冲刺（大档横向拉伸）→ 定格 → 轻微回弹 → 回原位。travel 为横向位移（像素），grow 为竖屏纵深的放大。
function attackerKeys(T, { s, travel, U, grow = 1, recoil = 1, end = T.hit + T.freeze + T.react }) {
    const lean = -s * T.lean / 100 * U;
    const crouch = T.crouch / 100 * U * 0.5;
    const wind = { x: lean, y: crouch, sx: 0.97, sy: T.crouch ? 0.955 : 0.97 };
    const mid = { x: travel * 0.6, sx: T.stretch * (1 + (grow - 1) * 0.6), sy: (1 + (grow - 1) * 0.6) / Math.sqrt(T.stretch) };
    const at = { x: travel, sx: grow, sy: grow };
    const keys = [{ t: 0, m: {}, ease: EASE.windup }];
    if (T.windup) keys.push({ t: T.windup, m: wind, ease: EASE.dash });
    if (T.dash) keys.push({ t: T.windup + T.dash * 0.55, m: mid, ease: EASE.dash });
    keys.push({ t: T.hit, m: at, ease: EASE.hold });
    keys.push({ t: T.hit + T.freeze, m: at, ease: EASE.recoil });
    keys.push({ t: T.hit + T.freeze + 70, m: { ...at, x: travel - s * 1.4 / 100 * U * recoil }, ease: EASE.back });
    keys.push({ t: Math.max(end, T.hit + T.freeze + 140), m: {} });
    return keys;
}

// 受方：定格里原地抖、闪白；随后顺受力方向位移加旋转并回弹；大档击退后从原位淡回。
function reactKeys(T, { s, U, fly = false, out = false }) {
    const R = T.react_;
    const j = T.jolt / 100 * U * T.moveB;
    const P = T.push / 100 * U * R.push * T.moveB;
    const turn = T.turn * R.turn * T.turnB;
    const keys = [{ t: 0, m: {} }];
    if (j) {
        keys.push({ t: T.freeze * 0.25, m: { x: s * j } }, { t: T.freeze * 0.5, m: { x: -s * j } }, { t: T.freeze * 0.75, m: { x: s * j * 0.5 } });
    }
    keys.push({ t: T.freeze, m: {}, ease: T.knock ? EASE.knock : EASE.recoil });
    const peak = { x: s * P, r: s * turn, sy: R.squash, sx: 1 / Math.sqrt(R.squash) };
    if (out) {
        keys.push({ t: T.freeze + 110, m: { x: s * P * 1.6, r: s * turn * 1.1 }, ease: 'ease-in' });
        keys.push({ t: T.freeze + 340, m: { x: s * U * 0.5, r: s * turn * 1.4 } });
        return keys;
    }
    if (T.knock) {
        const K = P * (fly ? 1.8 : 1);
        keys.push({ t: T.freeze + 110, m: { ...peak, x: s * K }, ease: 'ease-out' });
        keys.push({ t: T.freeze + T.knock, m: { ...peak, x: s * K * 1.06, r: s * turn * 1.1 }, ease: 'step-end' });
        keys.push({ t: T.freeze + T.knock + 1, m: {} });
        keys.push({ t: T.freeze + T.knock + 240, m: {} });
        return keys;
    }
    keys.push({ t: T.freeze + T.react * 0.32, m: peak, ease: EASE.back });
    keys.push({ t: T.freeze + T.react * 0.64, m: { x: -s * P * 0.16, r: -s * turn * 0.18 }, ease: EASE.soft });
    keys.push({ t: T.freeze + T.react, m: {} });
    return keys;
}

function playReact(state, env, B, T, { s, delay, fly = false, out = false }) {
    if (!B || !B.el) return 0;
    const keys = reactKeys(T, { s, U: env.U, fly, out });
    const total = keys[keys.length - 1].t;
    animate(state, B.el, keyFrames(keys, pivotOf(B.el, B.cx, B.feetY), B.flip), { duration: total, delay });
    const f = T.flash;
    const fd = T.freeze + 110;
    const flash = T.flashes > 1
        ? [{ offset: 0, filter: `brightness(${f})` }, { offset: 0.3, filter: 'brightness(1)' }, { offset: 0.45, filter: `brightness(${round3(f * 0.8)})` }, { offset: 1, filter: 'brightness(1)' }]
        : [{ offset: 0, filter: `brightness(${f})` }, { offset: round3(T.freeze * 0.5 / fd), filter: `brightness(${f})` }, { offset: 1, filter: 'brightness(1)' }];
    animate(state, B.el, flash, { duration: fd, delay, easing: 'ease-out' });
    if (out) {
        animate(state, B.el, [{ offset: 0, opacity: 1 }, { offset: round3((T.freeze + 150) / total), opacity: 1 }, { offset: 1, opacity: 0 }], { duration: total, delay, composite: 'replace' });
    } else if (T.knock) {
        const at = (ms) => round3(ms / total);
        animate(state, B.el, [
            { offset: 0, opacity: 1 }, { offset: at(T.freeze + T.knock - 80), opacity: 1 }, { offset: at(T.freeze + T.knock), opacity: 0 },
            { offset: at(T.freeze + T.knock + 20), opacity: 0 }, { offset: 1, opacity: 1 },
        ], { duration: total, delay, composite: 'replace' });
    }
    return total;
}

function shakeFrames(T, s) {
    const { count, amp, sink } = T.shake;
    const n = count * 2;
    const frames = [{ offset: 0, transform: 'translate(0px, 0px)' }];
    for (let i = 0; i < n; i++) {
        const a = amp * (1 - i / n) * (i % 2 ? -1 : 1) * s;
        const y = sink && i === 0 ? amp * 0.6 : sink && i === 1 ? amp * 0.25 : 0;
        frames.push({ offset: round3((i + 1) / (n + 1)), transform: `translate(${round(a)}px, ${round(y)}px)` });
    }
    frames.push({ offset: 1, transform: 'translate(0px, 0px)' });
    return frames;
}

function playCamera(state, env, T, { x, y, delay }) {
    if (!(T.camera > 1)) return;
    const pv = pivotOf(env.motion, x, y);
    const c = T.camera;
    const lead = Math.round(T.dash * 0.5);
    const keys = T.tier === 'big'
        ? [{ t: 0, m: {}, ease: EASE.dash }, { t: lead, m: { sx: c, sy: c } }, { t: lead + T.freeze, m: { sx: c, sy: c }, ease: EASE.recoil }, { t: lead + T.freeze + 110, m: { sx: 0.992, sy: 0.992 }, ease: EASE.soft }, { t: lead + T.freeze + 280, m: {} }]
        : [{ t: 0, m: {}, ease: EASE.dash }, { t: lead, m: { sx: c, sy: c } }, { t: lead + T.freeze, m: { sx: c, sy: c }, ease: EASE.back }, { t: lead + T.freeze + 300, m: {} }];
    animate(state, env.motion, keyFrames(keys, pv, false), { duration: keys[keys.length - 1].t, delay: Math.max(0, delay - lead) });
}

function playContrast(state, env, T, delay, extra = []) {
    if (!T.contrast) return;
    const { root } = env;
    const d = T.freeze + 60;
    const frames = [{ offset: 0, filter: `contrast(${T.contrast})` }, { offset: round3(T.freeze / d), filter: `contrast(${T.contrast})` }, { offset: 1, filter: 'contrast(1)' }];
    for (const el of [root.querySelector('#igs-bg'), root.querySelector('#igs-sprite'), root.querySelector('#igs-cast'), ...extra]) {
        if (el) animate(state, el, frames, { duration: d, delay });
    }
}

function playComic(state, env, spec, x, y, s, delay) {
    if (!env.ctx.comic || !spec.onoma || !env.layers) return;
    later(state, () => {
        const word = make(env.doc, 'igs-clash-onoma', spec.onoma);
        setVar(word, '--igs-clash-x', `${round(x)}px`);
        setVar(word, '--igs-clash-y', `${round(y)}px`);
        word.setAttribute('data-dir', s > 0 ? 'r' : 'l');
        spawn(state, env.layers.front, word, 560);
        const lines = make(env.doc, 'igs-fx-speedlines igs-clash-lines');
        const baked = speedLinesImage(env.doc);
        if (baked && lines.style) { lines.style.backgroundImage = `url("${baked}")`; lines.setAttribute('data-baked', '1'); }
        setVar(lines, '--igs-clash-x', `${round(x)}px`);
        setVar(lines, '--igs-clash-y', `${round(y)}px`);
        spawn(state, env.layers.stage, lines, 360);
    }, delay);
}

// 命中那一帧：音效、震屏、镜头、对比度、背景扫动、拟声字；受方的语气音与头顶符号稍后接上。
// 背景沿打击方向扫一下：同时放大一点，平移时不露出背景边缘。
function sweepStage(state, env, s, delay) {
    const bg = env.root.querySelector('#igs-bg');
    animate(state, bg, [
        { offset: 0, transform: 'translateX(0%) scale(1)' }, { offset: 0.35, transform: `translateX(${round(s * -2.4)}%) scale(1.06)` },
        { offset: 0.75, transform: `translateX(${round(s * 0.6)}%) scale(1.03)` }, { offset: 1, transform: 'translateX(0%) scale(1)' },
    ], { duration: 520, delay, easing: 'cubic-bezier(.6,0,.3,1)' });
}

function playImpact(state, env, T, spec, { s, x, y, delay, target, ghosts = [], quiet = false }) {
    const { ctx } = env;
    later(state, () => {
        ctx.onSound(spec.sound, T.sfx.gain);
        if (T.sfx.low) ctx.onSound('clash-low', 0.9);
        if (T.sfx.boom) ctx.onSound('clash-boom', 1);
        if (T.sfx.tail) ctx.onSound('clash-tail', 1);
    }, delay);
    if (quiet) return;
    if (T.shake) animate(state, env.motion, shakeFrames(T, s), { duration: T.shake.ms, delay });
    playCamera(state, env, T, { x, y, delay });
    playContrast(state, env, T, delay, ghosts);
    if (T.sweep) sweepStage(state, env, s, delay + Math.round(T.freeze * 0.5));
    playComic(state, env, spec, x, y, s, delay);
    if (target && target.key) {
        later(state, () => ctx.onBark(target.key), delay + Math.round(T.freeze * 0.5));
        if (!target.ghost) later(state, () => ctx.onSymbol(target.key, T.symbol, T.tier, T.hold ? T.hold + 300 : 900), delay + T.freeze + Math.round(T.react * 0.45));
    }
}

// 竖屏纵深放大绕身体中段进行，头不会被推出画面顶边。
function bodyPivot(A, grow) {
    return pivotOf(A.el, A.cx, grow > 1 ? (A.headY + A.feetY) / 2 : A.feetY);
}

function front(state, A, from, to) {
    later(state, () => addClass(state, A.el, 'is-clash-front'), from);
    later(state, () => dropClass(A.el, 'is-clash-front'), to);
}

function contactGap(A, B, k = 0.62) {
    return (A.body + B.body) / 2 * k;
}

function playDuo(state, env, A, B, T, spec, delay = 0, out = false) {
    const s = B.cx >= A.cx ? 1 : -1;
    const full = (B.cx - s * contactGap(A, B)) - A.cx;
    const travel = env.portrait ? full * PORTRAIT_DASH : full;
    const grow = env.portrait ? PORTRAIT_DASH_SCALE : 1;
    const keys = attackerKeys(T, { s, travel, U: env.U, grow, recoil: spec.react === 'mutual' ? 2.2 : 1 });
    const total = keys[keys.length - 1].t;
    animate(state, A.el, keyFrames(keys, bodyPivot(A, grow), A.flip), { duration: total, delay });
    if (T.trails) playTrails(state, env, A, keys, T, delay, bodyPivot(A, grow));
    front(state, A, delay + T.windup, delay + total);
    const rt = playReact(state, env, B, T, { s, delay: delay + T.hit, fly: spec.fly === true, out });
    const x = A.cx + travel + s * A.body * 0.3;
    playImpact(state, env, T, spec, { s, x, y: B.headY, delay: delay + T.hit, target: B });
    return Math.max(total, T.hit + rt);
}

// 情形 A：画面上只有受方，出手方从受方身后侧边探出半身（压暗、虚化、在后），出手时转到前面恢复亮度，打完退回身后淡出。
function playGhostA(state, env, A, B, T, spec, delay = 0) {
    const side = B.cx > env.w / 2 ? -1 : 1;
    const s = -side;
    const avg = (A.body + B.body) / 2;
    const peek = Math.min(avg * 0.55, env.w * (env.portrait ? 0.24 : 0.16));
    const contact = peek * 0.82;
    const lean = T.lean / 100 * env.U;
    const grow = env.portrait ? 1.08 : 1.04;
    const inMs = CLASH_GHOST_MS.peekIn;
    const t = (ms) => inMs + ms;
    const backAt = t(T.hit + T.freeze + T.react);
    const keys = [
        { t: 0, m: {}, ease: EASE.soft },
        { t: inMs, m: { x: side * peek }, ease: EASE.windup },
        { t: t(T.windup), m: { x: side * (peek + lean), sx: 0.97, sy: T.crouch ? 0.955 : 0.97 }, ease: EASE.dash },
        { t: t(T.hit), m: { x: side * contact, sx: grow * T.stretch, sy: grow }, ease: EASE.hold },
        { t: t(T.hit + T.freeze), m: { x: side * contact, sx: grow, sy: grow }, ease: EASE.recoil },
        { t: t(T.hit + T.freeze + 70), m: { x: side * (contact + 1.4 / 100 * env.U), sx: grow, sy: grow }, ease: EASE.back },
        { t: backAt, m: { x: side * peek }, ease: EASE.soft },
        { t: backAt + CLASH_GHOST_MS.out, m: { x: side * peek * 0.55 } },
    ];
    const total = keys[keys.length - 1].t;
    animate(state, A.el, keyFrames(keys, bodyPivot(A, grow), false), { duration: total, delay });
    animate(state, A.el, [
        { offset: 0, opacity: 0 }, { offset: round3(inMs * 0.7 / total), opacity: 1 }, { offset: round3(backAt / total), opacity: 1 }, { offset: 1, opacity: 0 },
    ], { duration: total, delay, composite: 'replace' });
    if (T.trails) playTrails(state, env, A, keys, { ...T, windup: t(T.windup), hit: t(T.hit) }, delay, bodyPivot(A, grow));
    later(state, () => dropClass(A.el, 'is-behind'), delay + t(T.windup));
    later(state, () => addClass(state, A.el, 'is-behind'), delay + backAt);
    const rt = playReact(state, env, B, T, { s, delay: delay + t(T.hit), fly: spec.fly === true });
    playImpact(state, env, T, spec, { s, x: B.cx + side * avg * 0.35, y: B.headY, delay: delay + t(T.hit), target: B, ghosts: [A.el] });
    return Math.max(total, t(T.hit) + rt);
}

// 临时层平时透明，只在这段淡入、停留、淡出的动画里可见，动画结束自然消失，不留残影。
function ghostPresence(state, el, delay, inMs, holdUntil, outMs) {
    const total = holdUntil + Math.max(1, outMs);
    animate(state, el, [
        { offset: 0, opacity: 0 }, { offset: round3(inMs / total), opacity: 1 }, { offset: round3(holdUntil / total), opacity: 1 }, { offset: 1, opacity: outMs ? 0 : 1 },
    ], { duration: total, delay, composite: 'replace' });
}

// 情形 B：画面上只有出手方，受方在出手方向一侧的画面内侧边滑入（正常亮度、在后），挨打后弹回淡出；大档直接打出画面。
function playGhostB(state, env, A, B, T, spec, delay = 0) {
    const s = B.cx >= A.cx ? 1 : -1;
    const inMs = CLASH_GHOST_MS.sideIn;
    const slide = s * 0.22 * env.U * (env.portrait ? 0.6 : 1);
    animate(state, B.el, keyFrames([{ t: 0, m: { x: slide }, ease: EASE.back }, { t: inMs, m: {} }], pivotOf(B.el, B.cx, B.feetY), false), { duration: inMs, delay });
    const out = T.tier === 'big';
    const reactEnd = inMs + T.hit + (out ? T.freeze + 340 : T.freeze + T.react);
    if (!out) ghostPresence(state, B.el, delay, inMs, reactEnd, CLASH_GHOST_MS.fade);
    else ghostPresence(state, B.el, delay, inMs, inMs + T.hit, 0);
    const span = playDuo(state, env, A, B, T, { ...spec, fly: false }, delay + inMs, out);
    return Math.max(inMs + span, reactEnd + CLASH_GHOST_MS.fade);
}

// 画外一击：出手方是主角、旁白或没有立绘，屏幕本身就是出手方；受方偏头后仰，舞台朝命中方向推一下。
function playOffscreen(state, env, B, T, spec, delay = 0) {
    const s = B.cx >= env.w / 2 ? 1 : -1;
    const lead = 60;
    const rt = playReact(state, env, B, T, { s, delay: delay + lead });
    const push = s * 1.4 / 100 * env.U * (env.portrait ? PORTRAIT_SHAKE : 1);
    animate(state, env.motion, [
        { offset: 0, transform: 'translate(0px, 0px)' }, { offset: 0.28, transform: `translate(${round(push)}px, 0px)`, easing: EASE.back }, { offset: 1, transform: 'translate(0px, 0px)' },
    ], { duration: T.freeze + 260, delay: delay + lead, easing: EASE.recoil });
    playImpact(state, env, { ...T, dash: 120 }, spec, { s, x: B.cx - s * B.body * 0.3, y: B.headY, delay: delay + lead, target: B });
    return lead + rt;
}

// 打主角：出手方冲向镜头（放大并下移），定格后舞台往后一震，四周压一圈暗角再收掉。
function playUser(state, env, A, T, spec, delay = 0) {
    const rush = CLASH_USER_MS.rush;
    const g = CLASH_USER_MS.scale;
    const drop = CLASH_USER_MS.drop / 100 * env.h;
    const hit = T.windup + rush;
    const keys = [
        { t: 0, m: {}, ease: EASE.windup },
        { t: T.windup, m: { y: -drop * 0.15, sx: 0.97, sy: 0.97 }, ease: EASE.dash },
        { t: hit, m: { y: drop, sx: g, sy: g }, ease: EASE.hold },
        { t: hit + T.freeze, m: { y: drop, sx: g, sy: g }, ease: EASE.back },
        { t: hit + T.freeze + T.react, m: {} },
    ];
    const total = keys[keys.length - 1].t;
    animate(state, A.el, keyFrames(keys, pivotOf(A.el, A.cx, A.headY), A.flip), { duration: total, delay });
    front(state, A, delay + T.windup, delay + total);
    animate(state, env.motion, [
        { offset: 0, transform: 'translate(0px, 0px) scale(1)' },
        { offset: 0.3, transform: `translate(0px, ${round(-0.012 * env.h)}px) scale(0.975)`, easing: EASE.back },
        { offset: 1, transform: 'translate(0px, 0px) scale(1)' },
    ], { duration: 300, delay: delay + hit + Math.round(T.freeze * 0.3) });
    if (env.layers) later(state, () => spawn(state, env.layers.stage, make(env.doc, 'igs-feed-vignette igs-clash-vignette'), 420), delay + hit);
    playImpact(state, env, { ...T, hit, camera: 1 }, spec, { s: 1, x: A.cx, y: A.headY, delay: delay + hit, target: null });
    return total;
}

// 只有出手方在场且缺席一方取不到立绘：朝画面里侧扑一下，照常出声和震屏。
function playLunge(state, env, A, T, spec, delay = 0) {
    const s = A.cx <= env.w / 2 ? 1 : -1;
    const travel = s * 0.12 * env.U * (env.portrait ? PORTRAIT_DASH : 1);
    const keys = attackerKeys(T, { s, travel, U: env.U });
    animate(state, A.el, keyFrames(keys, pivotOf(A.el, A.cx, A.feetY), A.flip), { duration: keys[keys.length - 1].t, delay });
    playImpact(state, env, T, spec, { s, x: A.cx + travel + s * A.body * 0.4, y: A.headY, delay: delay + T.hit, target: null });
    return keys[keys.length - 1].t;
}

// 扑抱：冲到接触点贴住、出手方在前，停 1.2 秒后缓慢分开；不震屏、不闪白、不出符号。
function playHug(state, env, A, B, spec, delay = 0, ghostA = false) {
    const M = CLASH_HUG_MS;
    const s = ghostA ? (B.cx > env.w / 2 ? 1 : -1) : (B.cx >= A.cx ? 1 : -1);
    const reach = ghostA ? -s * contactGap(A, B, 0.3) : (B.cx - s * contactGap(A, B, 0.36)) - A.cx;
    const travel = env.portrait && !ghostA ? reach * 0.6 : reach;
    const start = ghostA ? -s * contactGap(A, B, 0.75) : 0;
    const contact = M.windup + M.dash;
    const keys = [
        { t: 0, m: { x: start }, ease: EASE.windup },
        { t: M.windup, m: { x: start - s * 0.01 * env.U, sx: 0.98, sy: 0.98 }, ease: EASE.soft },
        { t: contact, m: { x: travel, sx: 1.02, sy: 1.02 }, ease: EASE.soft },
        { t: contact + M.hold, m: { x: travel, sx: 1.02, sy: 1.02 }, ease: EASE.soft },
        { t: contact + M.hold + M.back, m: { x: start } },
    ];
    const total = keys[keys.length - 1].t;
    animate(state, A.el, keyFrames(keys, pivotOf(A.el, A.cx, A.feetY), A.flip), { duration: total, delay });
    if (ghostA) {
        animate(state, A.el, [{ offset: 0, opacity: 0 }, { offset: round3(M.windup / total), opacity: 1 }, { offset: round3((contact + M.hold) / total), opacity: 1 }, { offset: 1, opacity: 0 }], { duration: total, delay, composite: 'replace' });
        later(state, () => dropClass(A.el, 'is-behind'), delay + M.windup);
    } else {
        front(state, A, delay + M.windup, delay + total);
    }
    const lean = { x: -s * 0.006 * env.U, r: -s * 1.6 };
    animate(state, B.el, keyFrames([
        { t: 0, m: {}, ease: EASE.soft }, { t: 160, m: lean, ease: EASE.soft }, { t: M.hold, m: lean, ease: EASE.soft }, { t: M.hold + M.back, m: {} },
    ], pivotOf(B.el, B.cx, B.feetY), B.flip), { duration: M.hold + M.back, delay: delay + contact });
    later(state, () => env.ctx.onSound(spec.sound, 1), delay + contact - 40);
    return total;
}

// 击掌：两人各走一半在中间相碰，清亮一声后分开。
function playHighfive(state, env, A, B, spec, delay = 0) {
    const M = CLASH_HIGHFIVE_MS;
    const s = B.cx >= A.cx ? 1 : -1;
    const meet = (A.cx + B.cx) / 2;
    const gap = contactGap(A, B, 0.7) / 2;
    const k = env.portrait ? 0.6 : 1;
    for (const [actor, dir] of [[A, s], [B, -s]]) {
        const travel = (meet - dir * gap - actor.cx) * k;
        const keys = [
            { t: 0, m: {}, ease: EASE.dash }, { t: M.dash, m: { x: travel, r: dir * 2 }, ease: EASE.hold },
            { t: M.dash + M.freeze, m: { x: travel, r: dir * 2 }, ease: EASE.back }, { t: M.dash + M.freeze + M.back, m: {} },
        ];
        animate(state, actor.el, keyFrames(keys, pivotOf(actor.el, actor.cx, actor.feetY), actor.flip), { duration: keys[keys.length - 1].t, delay });
    }
    later(state, () => env.ctx.onSound(spec.sound, 1), delay + M.dash);
    playComic(state, env, spec, meet, Math.min(A.headY, B.headY) + 0.12 * env.h, s, delay + M.dash);
    return M.dash + M.freeze + M.back;
}

function playReduced(state, env, B, T, spec, delay = 0) {
    const s = B.cx >= env.w / 2 ? 1 : -1;
    const calm = { ...T, push: T.push * 0.3, jolt: 0, knock: 0 };
    const rt = playReact(state, env, B, calm, { s, delay });
    later(state, () => env.ctx.onSound(spec.sound, T.sfx.gain), delay);
    return rt;
}

function playSoundOnly(state, env, T, spec, delay = 0) {
    later(state, () => {
        env.ctx.onSound(spec.sound, T ? T.sfx.gain : 1);
        if (T && T.sfx.low) env.ctx.onSound('clash-low', 0.9);
    }, delay);
    return 200;
}

function isUserName(ctx, name) {
    return typeof ctx.isUser === 'function' && ctx.isUser(name);
}

function isNarrator(name) {
    return !name || /^(?:旁白|narrator|系统|画外)$/i.test(String(name).trim());
}

// 缺席一方的立绘：只用已解码过的图；没解码的先探测，最多等 GHOST_WAIT_MS，等不到就降级到画外一击，演出不卡。
function ghostSource(state, env, key, done) {
    const url = typeof env.ctx.resolveSprite === 'function' ? env.ctx.resolveSprite(key) : '';
    if (!url) { done(null); return; }
    const cached = peekSpriteHead(url, env.doc);
    if (cached && cached.naturalW > 0) { done({ url, natural: { w: cached.naturalW, h: cached.naturalH } }); return; }
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; done(value); } };
    later(state, () => finish(null), GHOST_WAIT_MS);
    probeSpriteHead(url, env.doc).then((info) => {
        finish(info && info.naturalW > 0 ? { url, natural: { w: info.naturalW, h: info.naturalH } } : null);
    }, () => finish(null));
}

function playOne(state, env, clash, delay, report) {
    const { ctx } = env;
    const action = Object.hasOwn(CLASH_ACTIONS, clash.action) ? clash.action : 'hit';
    const spec = CLASH_ACTIONS[action];
    const T = clashTimeline(action, clash.tier, { portrait: env.portrait, shake: ctx.shake !== false, low: env.low, reduced: env.reduced });
    const keyOf = typeof ctx.keyOf === 'function' ? ctx.keyOf : (n) => n;
    const aUser = isUserName(ctx, clash.attacker);
    const bUser = isUserName(ctx, clash.target);
    const aKey = aUser || isNarrator(clash.attacker) ? '' : keyOf(clash.attacker);
    const bKey = bUser ? '' : keyOf(clash.target);
    const A = aKey ? actorOf(env, aKey) : (aUser && ctx.userKey ? actorOf(env, ctx.userKey) : null);
    const B = bKey ? actorOf(env, bKey) : (bUser && ctx.userKey ? actorOf(env, ctx.userKey) : null);
    const base = { action, aOn: Boolean(A), bOn: Boolean(B), aUser: aUser && !A, bUser: bUser && !B, aNarrator: !aUser && isNarrator(clash.attacker), ghost: ctx.ghost !== false, reduced: env.reduced };
    const run = (route, extra = {}) => {
        report.push(route);
        if (route === 'duo') return playDuo(state, env, A, B, T, spec, delay);
        if (route === 'hug') return playHug(state, env, extra.A || A, B, spec, delay, Boolean(extra.A));
        if (route === 'highfive') return playHighfive(state, env, A, B, spec, delay);
        if (route === 'user') return playUser(state, env, A, T, spec, delay);
        if (route === 'lunge') return spec.kind === 'strike' ? playLunge(state, env, A, T, spec, delay) : playSoundOnly(state, env, null, spec, delay);
        if (route === 'offscreen') return playOffscreen(state, env, B, T, spec, delay);
        if (route === 'reduced') return playReduced(state, env, B, T, spec, delay);
        if (route === 'ghost-a') return playGhostA(state, env, extra.A, B, T, spec, delay);
        if (route === 'ghost-b') return playGhostB(state, env, A, extra.B, T, spec, delay);
        return playSoundOnly(state, env, spec.kind === 'strike' ? T : null, spec, delay);
    };
    const preliminary = planClashRoute({ ...base, aSprite: true, bSprite: true });
    if (preliminary !== 'ghost-a' && preliminary !== 'ghost-b') return { span: run(preliminary), wait: 0 };
    const missing = preliminary === 'ghost-a' ? aKey : bKey;
    const anchor = preliminary === 'ghost-a' ? B : A;
    const span = (spec.kind === 'hug' ? CLASH_HUG_MS.windup + CLASH_HUG_MS.dash + CLASH_HUG_MS.hold + CLASH_HUG_MS.back : T.total) + CLASH_GHOST_MS.peekIn + CLASH_GHOST_MS.out;
    ghostSource(state, env, missing, (src) => {
        if (!states.has(env.root) || states.get(env.root) !== state) return;
        const route = planClashRoute({ ...base, aSprite: preliminary === 'ghost-a' && Boolean(src), bSprite: preliminary === 'ghost-b' && Boolean(src) });
        if (route !== preliminary) { run(route); return; }
        const scale = Number(anchor.entry.scale) * (env.portrait ? GHOST_PORTRAIT_SCALE : 1);
        if (route === 'ghost-a') {
            const ghostA = makeGhost(state, env, { key: missing, url: src.url, natural: src.natural, scale, posY: anchor.entry.posY, center: anchor.cx, cls: 'is-behind' });
            if (spec.kind === 'hug') run('hug', { A: ghostA });
            else if (spec.kind === 'strike') run('ghost-a', { A: ghostA });
            else run('sound');
            return;
        }
        if (spec.kind !== 'strike' && spec.kind !== 'hug') { run('sound'); return; }
        const s = anchor.cx <= env.w / 2 ? 1 : -1;
        const avg = anchor.body;
        const dist = env.portrait ? 0.44 * env.w : Math.max(avg * 1.15, 0.24 * env.w);
        const center = clamp(anchor.cx + s * dist, 0.08 * env.w, 0.92 * env.w);
        const ghostB = makeGhost(state, env, { key: missing, url: src.url, natural: src.natural, scale, posY: anchor.entry.posY, center, cls: 'is-back' });
        if (spec.kind === 'hug') {
            const hugSpan = playHug(state, env, A, ghostB, spec, delay + CLASH_GHOST_MS.sideIn);
            ghostPresence(state, ghostB.el, delay, CLASH_GHOST_MS.sideIn, CLASH_GHOST_MS.sideIn + hugSpan, CLASH_GHOST_MS.fade);
            report.push('hug');
            return;
        }
        run('ghost-b', { B: ghostB });
    });
    return { span, wait: GHOST_WAIT_MS };
}

// ctx：speaker（说话人主名）、sprite（说话人立绘条目）、cast（同屏条目）、keyOf、isUser、userKey、resolveSprite(主名)→图址、
// ghost、shake、comic、reduced、onSound(kind, gain)、onBark(主名)、onSymbol(主名, 符号, 档位, 停留)；layers 为演出层。
export function applyClashToDom(root, clashes, ctx = {}) {
    const list = (Array.isArray(clashes) ? clashes : []).filter((c) => c && c.target);
    const extra = Array.isArray(ctx.extra) ? ctx.extra : [];
    if (!root || typeof root.querySelector !== 'function' || (!list.length && !extra.length)) return { played: [] };
    cancelClashFx(root);
    const motion = root.querySelector('#igs-stage-motion');
    if (!motion) return { played: [] };
    const state = stateOf(root, ctx);
    const w = motion.clientWidth || 1280;
    const h = motion.clientHeight || 720;
    const portrait = Boolean(root.classList && root.classList.contains('igs-portrait')) || w < h;
    const noop = () => {};
    const env = {
        root, motion, doc: root.ownerDocument, layers: ctx.layers || null, w, h, U: Math.max(w, h), portrait,
        low: typeof root.getAttribute === 'function' && root.getAttribute('data-igs-quality') === 'low',
        reduced: ctx.reduced === true,
        ctx: { ...ctx, onSound: ctx.onSound || noop, onBark: ctx.onBark || noop, onSymbol: ctx.onSymbol || noop },
    };
    const played = [];
    let at = 0;
    for (const clash of list) {
        const { span, wait } = playOne(state, env, clash, at, played);
        at += span + wait + SEQUENCE_GAP_MS;
    }
    for (const action of extra) {
        const spec = CLASH_ACTIONS[action] || CLASH_ACTIONS.hit;
        later(state, () => env.ctx.onSound(spec.sound, 0.8), at);
        at += 260;
        played.push('sound');
    }
    later(state, () => cleanupNodes(state), at + 400);
    return { played, duration: at };
}

function cleanupNodes(state) {
    for (const el of state.nodes) el.remove();
    state.nodes.clear();
    for (const [el, name] of state.classed) dropClass(el, name);
    state.classed.clear();
}

export function cancelClashFx(root) {
    const state = root && states.get(root);
    if (!state) return false;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    for (const anim of state.anims) { try { anim.cancel(); } catch { /* 已结束 */ } }
    state.anims.clear();
    cleanupNodes(state);
    states.delete(root);
    return true;
}

// 战斗「出手冲刺」：出手者与目标都在场时，出手者冲到目标身边再回位；受击反应仍由战斗演出自己播。返回冲到目标的时刻（毫秒），没冲返回 0。
export function playClashDash(root, { attacker, target, speaker = '', sprite = null, cast = [], reduced = false, schedule, clear } = {}) {
    if (reduced || !root || !attacker || !target || attacker === target) return 0;
    const motion = root.querySelector('#igs-stage-motion');
    if (!motion) return 0;
    const state = stateOf(root, { schedule, clear });
    const w = motion.clientWidth || 1280;
    const h = motion.clientHeight || 720;
    const env = { root, motion, doc: root.ownerDocument, w, h, U: Math.max(w, h), portrait: Boolean(root.classList && root.classList.contains('igs-portrait')) || w < h, ctx: { speaker, sprite, cast } };
    const A = actorOf(env, attacker);
    const B = actorOf(env, target);
    if (!A || !B) return 0;
    const T = { ...clashTimeline('hit', 'mid', { portrait: env.portrait }), windup: 70, dash: 110, freeze: 60, react: 260 };
    T.hit = T.windup + T.dash;
    const s = B.cx >= A.cx ? 1 : -1;
    const full = (B.cx - s * contactGap(A, B)) - A.cx;
    const keys = attackerKeys(T, { s, travel: env.portrait ? full * PORTRAIT_DASH : full, U: env.U, grow: env.portrait ? PORTRAIT_DASH_SCALE : 1 });
    const total = keys[keys.length - 1].t;
    animate(state, A.el, keyFrames(keys, pivotOf(A.el, A.cx, A.feetY), A.flip), { duration: total });
    front(state, A, T.windup, total);
    return T.hit;
}

export const CLASH_STYLE_TEXT = `
#igs-overlay{--igs-clash-ghost-lit:brightness(1) blur(0px);--igs-clash-ghost-dim:brightness(.72) blur(1px);--igs-clash-trail-filter:saturate(.7) brightness(1.08);--igs-clash-dim-ms:120ms;}
.igs-clash-ghost{position:absolute;inset:0;z-index:2;opacity:0;background-repeat:no-repeat;pointer-events:none;transform-origin:50% 100%;filter:var(--igs-grade-sprite,) var(--igs-clash-ghost-lit);-webkit-filter:var(--igs-grade-sprite,) var(--igs-clash-ghost-lit);transition:filter var(--igs-clash-dim-ms) ease;}
.igs-clash-ghost.is-behind{z-index:1;filter:var(--igs-grade-sprite,) var(--igs-clash-ghost-dim);-webkit-filter:var(--igs-grade-sprite,) var(--igs-clash-ghost-dim);}
.igs-clash-ghost.is-back{z-index:1;}
.igs-clash-trail{position:absolute;inset:0;background-repeat:no-repeat;pointer-events:none;opacity:0;filter:var(--igs-grade-sprite,) var(--igs-clash-trail-filter);-webkit-filter:var(--igs-grade-sprite,) var(--igs-clash-trail-filter);}
#igs-cast:has(.is-clash-front){z-index:3;}
#igs-cast .igs-cast-sprite.is-clash-front{z-index:1;}
#igs-overlay[data-igs-comic="mono"] .igs-clash-ghost,#igs-overlay[data-igs-comic="mono"] .igs-clash-trail{filter:var(--igs-grade-sprite,) grayscale(1) contrast(1.12);-webkit-filter:var(--igs-grade-sprite,) grayscale(1) contrast(1.12);}
.igs-fx-symbol[data-igs-clash="small"]{scale:.72;}
.igs-clash-onoma{position:absolute;left:var(--igs-clash-x,50%);top:var(--igs-clash-y,40%);translate:-50% -50%;white-space:nowrap;font:900 clamp(30px,7vmin,64px)/1 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--igs-fx-accent,#fff);-webkit-text-stroke:max(3px,.09em) var(--igs-fx-ink,#141414);paint-order:stroke fill;rotate:-8deg;pointer-events:none;animation:igs-clash-onoma .56s cubic-bezier(.2,1.5,.4,1) both;}
.igs-clash-onoma[data-dir="l"]{rotate:8deg;}
.igs-clash-lines{-webkit-mask-image:radial-gradient(circle at var(--igs-clash-x,50%) var(--igs-clash-y,45%),transparent 9%,#000 15%,#000 34%,transparent 52%);mask-image:radial-gradient(circle at var(--igs-clash-x,50%) var(--igs-clash-y,45%),transparent 9%,#000 15%,#000 34%,transparent 52%);background-size:cover;animation:igs-clash-lines .36s ease-out both;}
.igs-clash-vignette{animation:igs-clash-vignette .42s ease-out both;}
@keyframes igs-clash-onoma{0%{opacity:0;scale:1.6;}18%{opacity:1;scale:.92;}30%{scale:1;}78%{opacity:1;}100%{opacity:0;scale:1.04;}}
@keyframes igs-clash-lines{0%{opacity:0;}20%{opacity:1;}100%{opacity:0;}}
@keyframes igs-clash-vignette{0%{opacity:0;}25%{opacity:1;}100%{opacity:0;}}
@media (prefers-reduced-motion: reduce){.igs-clash-onoma,.igs-clash-lines{animation:none!important;display:none!important;}}
`.trim();
