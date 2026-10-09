import { prefersReducedMotion } from './reduced-motion.js';
import { CG_INTERLUDE_STYLES, STAGE_DIRECTION_NORMALIZERS, pickCloseUp, pickSpriteAction } from './stage-direction-settings.js';
import { SPEAK_BOUNCE, SPRITE_ACTION_FRAMES, playSpriteSpec } from './sprite-actions.js';
import { cancelCameraImpact, planCameraImpact, playCameraImpact, playCameraImpactSfx } from './camera-impact.js';
import { normalizeFxSoundSettings } from './fx-settings.js';

export const BG_TRANSITION_MS = Object.freeze({ fast: 350, medium: 650, slow: 1100 });
export const BLACK_TRANSITION_MS = Object.freeze({ fast: 700, medium: 1000, slow: 1500 });
export const SPRITE_SWAP_MS = 220;
export const SPRITE_ENTER_MS = 460;
export const SPRITE_EXIT_MS = 380;
const DECODE_TIMEOUT_MS = 1500;
const DECODED_LIMIT = 64;
const BLIND_COUNT = 8;
const ROOT_ATTRS = Object.freeze(['data-igs-sd-breathe', 'data-igs-cast-breathe', 'data-igs-sd-kenburns', 'data-igs-sd-parallax', 'data-igs-sd-closeup', 'data-igs-sd-cam']);
const ROOT_VARS = Object.freeze(['--igs-sd-px', '--igs-sd-py', '--igs-sd-origin-x']);

// 叠加合成：动作与呼吸（CSS 动画）同时作用在 transform 上而不互相覆盖。
const ADD = 'add';

const states = new WeakMap();
const decoded = new Set();

function text(value) {
    return String(value == null ? '' : value).trim();
}

export function normalizeStageDirectionSettings(reader) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const out = {};
    for (const [key, normalize] of Object.entries(STAGE_DIRECTION_NORMALIZERS)) out[key] = normalize(src[key]);
    return out;
}

export function isStageDirectionActive(settings) {
    return Object.entries(settings).some(([key, item]) => key !== 'stageCast' && key !== 'cgEntrance' && item.enabled);
}

function getState(root) {
    let state = states.get(root);
    if (!state) {
        state = {
            initialized: false, bgUrl: '', bgCss: '', spriteUrl: '', spriteKey: '', spriteCss: '', spritePosX: 50, pageKey: '',
            timers: new Set(), bgGhosts: new Set(), spriteGhosts: new Set(), actionAnims: new Set(), parallax: null,
            schedule: (fn, delay) => setTimeout(fn, delay), clear: (timer) => clearTimeout(timer),
        };
        states.set(root, state);
    }
    return state;
}

function later(state, fn, delay) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, delay);
    state.timers.add(timer);
    return timer;
}

function removeNode(node) {
    if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function insertAfter(anchor, node) {
    const parent = anchor && anchor.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') return false;
    parent.insertBefore(node, anchor.nextSibling || null);
    return true;
}

function flushGhosts(set) {
    for (const ghost of set) removeNode(ghost);
    set.clear();
}

function sharpenCg(bg) {
    if (!bg || !bg.style || typeof bg.style.setProperty !== 'function') return;
    // 已经是 none 再写一次会把还挂着的 filter 过渡从头播，播 CG 时每次重绘都闪一下。
    const read = typeof bg.style.getPropertyValue === 'function' ? bg.style.getPropertyValue('filter') : '';
    const priority = typeof bg.style.getPropertyPriority === 'function' ? bg.style.getPropertyPriority('filter') : '';
    if (read === 'none' && priority === 'important') return;
    bg.style.setProperty('filter', 'none', 'important');
    bg.style.setProperty('-webkit-filter', 'none', 'important');
}

const CG_ENTRANCE_PROPS = ['clip-path', '-webkit-clip-path', 'translate', 'scale', 'rotate', 'box-shadow', 'opacity'];

function clearCgFilter(bg) {
    if (!bg || !bg.style || typeof bg.style.removeProperty !== 'function') return;
    bg.style.removeProperty('transition');
    bg.style.removeProperty('filter');
    bg.style.removeProperty('-webkit-filter');
    for (const prop of CG_ENTRANCE_PROPS) bg.style.removeProperty(prop);
}

// NSFW 模糊到清晰：[先停多久, 变清晰用时]。
const CG_FOCUS_TIMING = { fast: [200, 900], medium: [450, 2400], slow: [600, 4000] };

// 过场 CG 出场：从勾选的效果里随机抽一种，一张图一个效果。只动 opacity / transform / clip-path，
// 不做滤镜和大阴影动画；碎片效果的块数压在 12 以内，播完立刻移除。省电画质下只用淡入类的便宜效果。
const CG_CHEAP_STYLES = new Set(['cinema', 'ink', 'flash', 'photo']);

function animate(el, frames, options) {
    if (!el || typeof el.animate !== 'function') return null;
    try {
        return el.animate(frames, options);
    } catch {
        return null;
    }
}

function pickInterludeStyle(entrance, lowQuality, random = Math.random) {
    let pool = CG_INTERLUDE_STYLES.filter((id) => entrance.styles && entrance.styles[id]);
    if (lowQuality) pool = pool.filter((id) => CG_CHEAP_STYLES.has(id));
    return pool.length ? pool[Math.floor(random() * pool.length)] : '';
}

// 碎片带延迟入场，没有 fill 的话开播前会先整块露出来闪一下。
const cgAnimate = (el, frames, options) => animate(el, frames, { fill: 'both', ...options });

function cgLayer(doc, bg, extra = '') {
    if (!bg.parentNode || typeof doc.createElement !== 'function') return null;
    const layer = doc.createElement('div');
    layer.className = 'igs-sd-cg-entrance';
    layer.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden;${extra}`;
    bg.parentNode.insertBefore(layer, bg.nextSibling);
    return layer;
}

function cgPiece(doc, layer, url, [l, t, w, h], extra = '') {
    const piece = doc.createElement('div');
    piece.style.cssText = `position:absolute;left:${l}%;top:${t}%;width:${w}%;height:${h}%;overflow:hidden;${extra}`;
    const img = doc.createElement('div');
    img.style.cssText = `position:absolute;left:${-l / w * 100}%;top:${-t / h * 100}%;width:${10000 / w}%;height:${10000 / h}%;`
        + `background:center/cover no-repeat url("${String(url).replace(/"/g, '%22')}")`;
    piece.appendChild(img);
    layer.appendChild(piece);
    return piece;
}

function playInterludeEntrance(state, { doc, bg, style, key, url }) {
    const set = (prop, value) => bg.style.setProperty(prop, value, 'important');
    const moving = [];
    let holdFor = 0;
    const done = (layer, after) => later(state, () => layer && layer.remove(), after);
    const hideBg = (ms) => { set('opacity', '0'); later(state, () => bg.style.removeProperty('opacity'), ms); holdFor = Math.max(holdFor, ms); };
    set('transition', 'none');
    {
        if (style === 'cinema') { set('clip-path', 'inset(47% 0 47% 0)'); set('-webkit-clip-path', 'inset(47% 0 47% 0)'); moving.push('clip-path 1.1s cubic-bezier(.7,0,.2,1)', '-webkit-clip-path 1.1s cubic-bezier(.7,0,.2,1)'); }
        if (style === 'ink') { set('clip-path', 'circle(0% at 50% 50%)'); set('-webkit-clip-path', 'circle(0% at 50% 50%)'); moving.push('clip-path 1.6s cubic-bezier(.3,0,.2,1)', '-webkit-clip-path 1.6s cubic-bezier(.3,0,.2,1)'); }
        if (style === 'ripple') {
            const at = `${20 + Math.round(Math.random() * 60)}% ${25 + Math.round(Math.random() * 50)}%`;
            set('clip-path', `circle(0% at ${at})`); set('-webkit-clip-path', `circle(0% at ${at})`);
            moving.push('clip-path 1.3s ease-out', '-webkit-clip-path 1.3s ease-out');
            const layer = cgLayer(doc, bg);
            for (let n = 0; layer && n < 3; n += 1) {
                const ring = doc.createElement('div');
                ring.style.cssText = `position:absolute;left:${at.split(' ')[0]};top:${at.split(' ')[1]};width:20px;height:20px;margin:-10px;border-radius:50%;border:2px solid rgba(255,255,255,.7)`;
                layer.appendChild(ring);
                cgAnimate(ring, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(90)', opacity: 0 }], { duration: 1400, delay: n * 220, easing: 'ease-out' });
            }
            done(layer, 2000);
        }
        if (style === 'photo') {
            set('translate', '0 -38%'); set('scale', '.52'); set('rotate', '-5deg'); set('box-shadow', '0 0 0 14px #fff, 0 18px 40px rgba(0,0,0,.45)');
            moving.push('translate .7s cubic-bezier(.2,.8,.3,1.1)', 'rotate .7s ease-out', 'scale .9s cubic-bezier(.6,0,.3,1) .9s');
        }
        if (style === 'focus') {
            set('scale', '2.8'); set('translate', `${Math.round(Math.random() * 40 - 20)}% ${Math.round(Math.random() * 30 - 15)}%`);
            moving.push('scale 1.6s cubic-bezier(.5,0,.2,1) .2s', 'translate 1.6s cubic-bezier(.5,0,.2,1) .2s');
        }
        if (style === 'film') {
            const layer = cgLayer(doc, bg, 'background:'
                + 'repeating-linear-gradient(90deg,transparent 0 18px,rgba(255,255,255,.85) 18px 30px,transparent 30px 48px) top/100% 14px no-repeat,'
                + 'repeating-linear-gradient(90deg,transparent 0 18px,rgba(255,255,255,.85) 18px 30px,transparent 30px 48px) bottom/100% 14px no-repeat,'
                + 'linear-gradient(#111,#111) top/100% 28px no-repeat,linear-gradient(#111,#111) bottom/100% 28px no-repeat,'
                + 'repeating-linear-gradient(90deg,transparent 0 37%,rgba(255,255,255,.18) 37% 37.2%,transparent 37.2% 71%,rgba(0,0,0,.25) 71% 71.15%,transparent 71.15%),'
                + 'repeating-radial-gradient(circle at 30% 40%,rgba(0,0,0,.08) 0 1px,transparent 1px 3px);mix-blend-mode:normal');
            cgAnimate(layer, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1800 });
            done(layer, 1900);
            set('translate', '0 2%');
            moving.push('translate .3s steps(3) .7s');
        }
        if (style === 'flash') {
            const layer = cgLayer(doc, bg, 'background:#fff');
            cgAnimate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 550, delay: 60, easing: 'ease-out' });
            done(layer, 700);
        }
        if (style === 'panels' && url) {
            const layer = cgLayer(doc, bg, 'background:#fff');
            const cells = [[2, 3, 46, 55], [50, 3, 48, 55], [2, 60, 96, 37]];
            cells.forEach((cell, n) => {
                const piece = cgPiece(doc, layer, url, cell, 'box-shadow:0 0 0 3px #111');
                cgAnimate(piece, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.04)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, delay: n * 300, easing: 'ease-out' });
            });
            cgAnimate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 1300 });
            hideBg(1300); done(layer, 1800);
        }
        if (style === 'blinds' && url) {
            const layer = cgLayer(doc, bg);
            for (let n = 0; layer && n < 8; n += 1) {
                const piece = cgPiece(doc, layer, url, [0, n * 12.5, 100, 12.5]);
                cgAnimate(piece, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 420, delay: n * 80, easing: 'cubic-bezier(.4,0,.2,1)' });
            }
            hideBg(1100); done(layer, 1200);
        }
        if (style === 'puzzle' && url) {
            const layer = cgLayer(doc, bg);
            for (let n = 0; layer && n < 12; n += 1) {
                const piece = cgPiece(doc, layer, url, [(n % 4) * 25, Math.floor(n / 4) * (100 / 3), 25, 100 / 3]);
                const dx = Math.round(Math.random() * 160 - 80); const dy = Math.round(Math.random() * 160 - 80); const rot = Math.round(Math.random() * 90 - 45);
                cgAnimate(piece, [{ transform: `translate(${dx}vw,${dy}vh) rotate(${rot}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: Math.random() * 450, easing: 'cubic-bezier(.2,.8,.3,1)' });
            }
            hideBg(1250); done(layer, 1350);
        }
        if (style === 'tear') {
            const layer = cgLayer(doc, bg);
            const edge = Array.from({ length: 13 }, (_, n) => `${48 + (n % 2 ? 3 : -2) + Math.round(Math.random() * 2)}% ${n * (100 / 12)}%`);
            const halves = [
                `polygon(0 0,${edge.join(',')},0 100%)`,
                `polygon(100% 0,${edge.join(',')},100% 100%)`,
            ];
            halves.forEach((shape, n) => {
                const half = doc.createElement('div');
                half.style.cssText = `position:absolute;inset:0;background:#f3ead8 radial-gradient(rgba(0,0,0,.06) 1px,transparent 1px) 0 0/6px 6px;clip-path:${shape};-webkit-clip-path:${shape};box-shadow:inset 0 0 12px rgba(0,0,0,.25)`;
                layer && layer.appendChild(half);
                cgAnimate(half, [{ transform: 'none' }, { transform: 'none', offset: 0.25 }, { transform: `translateX(${n ? 70 : -70}%) rotate(${n ? 8 : -8}deg)` }], { duration: 1200, easing: 'cubic-bezier(.5,0,.2,1)' });
            });
            done(layer, 1300);
        }
    }
    if (!moving.length) {
        later(state, () => { if (state.cgFocusUrl === key) state.cgFocusing = false; }, holdFor);
        return;
    }
    later(state, () => {
        if (state.cgFocusUrl !== key) return;
        set('transition', moving.join(', '));
        for (const prop of CG_ENTRANCE_PROPS) bg.style.removeProperty(prop);
        if (style === 'film') sharpenCg(bg);
        later(state, () => {
            if (state.cgFocusUrl !== key) return;
            state.cgFocusing = false;
            bg.style.removeProperty('transition');
        }, 2200);
    }, 120);
}

// CG 出场：先模糊，再在同一张图上变清晰。同一张翻页不重放。
// 认快照里的原地址，不认解码后的缓存地址。缓存地址会变（blob 换成新的、被挤掉再读回来），
// 用它当「换了一张图」会把正在变清晰的滤镜立刻拨回最糊，看起来就是眨一下；变几次就眨几次。
function playCgFocus(state, bg, url, reduced, identity, entrance = {}) {
    const key = String(identity || url || '');
    if (!bg || !key || !url) return;
    const timing = entrance.nsfw === true ? CG_FOCUS_TIMING[entrance.speed] : null;
    if (entrance.nsfw !== true && !reduced && state.cgFocusUrl !== key) {
        state.cgFocusUrl = key;
        sharpenCg(bg);
        const style = pickInterludeStyle(entrance, entrance.lowQuality === true);
        state.cgFocusing = Boolean(style);
        if (style) playInterludeEntrance(state, { ...entrance, bg, style, key, url });
        return;
    }
    if (reduced || (entrance.nsfw === true && !timing)) {
        state.cgFocusUrl = key;
        state.cgFocusing = false;
        sharpenCg(bg);
        return;
    }
    if (state.cgFocusUrl === key) {
        if (!state.cgFocusing) sharpenCg(bg);
        return;
    }
    const [hold, sharpen] = timing || CG_FOCUS_TIMING.medium;
    state.cgFocusUrl = key;
    state.cgFocusing = true;
    bg.style.setProperty('transition', 'none', 'important');
    bg.style.setProperty('filter', 'blur(28px)', 'important');
    bg.style.setProperty('-webkit-filter', 'blur(28px)', 'important');
    later(state, () => {
        if (state.cgFocusUrl !== key) return;
        bg.style.setProperty('transition', `filter ${sharpen}ms ease-in-out, -webkit-filter ${sharpen}ms ease-in-out`, 'important');
        sharpenCg(bg);
        later(state, () => {
            if (state.cgFocusUrl !== key) return;
            state.cgFocusing = false;
            const transition = bg.style && typeof bg.style.getPropertyValue === 'function'
                ? bg.style.getPropertyValue('transition') : '';
            if (bg.style && typeof bg.style.removeProperty === 'function' && String(transition || '').includes('filter')) {
                bg.style.removeProperty('transition');
            }
        }, sharpen + 100);
    }, hold);
}

function setAttr(el, name, on, value = '1') {
    if (!el || typeof el.setAttribute !== 'function') return;
    if (on) {
        if (el.getAttribute && el.getAttribute(name) === value) return;
        el.setAttribute(name, value);
    } else if (!el.hasAttribute || el.hasAttribute(name)) {
        el.removeAttribute(name);
    }
}

function setVar(el, name, value) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
}

// 需要等待时返回 Promise（超时也会 resolve）；已解码或环境没有 Image 时返回 null，调用方可以同步写图。
export function decodeSpriteImage(doc, url, { schedule = (fn, delay) => setTimeout(fn, delay), clear = (timer) => clearTimeout(timer) } = {}) {
    const Image = doc && doc.defaultView && doc.defaultView.Image;
    if (!url || decoded.has(url) || typeof Image !== 'function') return null;
    return new Promise((resolve) => {
        let done = false;
        let timer = null;
        const finish = () => {
            if (done) return;
            done = true;
            if (timer != null) clear(timer);
            decoded.add(url);
            if (decoded.size > DECODED_LIMIT) decoded.delete(decoded.values().next().value);
            resolve();
        };
        timer = schedule(finish, DECODE_TIMEOUT_MS);
        try {
            const img = new Image();
            img.src = url;
            if (typeof img.decode === 'function') img.decode().then(finish, finish);
            else img.onload = img.onerror = finish;
        } catch {
            finish();
        }
    });
}

function whenDecoded(doc, url, state) {
    return decodeSpriteImage(doc, url, { schedule: (fn, delay) => later(state, fn, delay), clear: () => {} }) || Promise.resolve();
}

function copyBackgroundGeometry(doc, source, target) {
    const view = doc.defaultView;
    const computed = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(source) : null;
    for (const prop of ['backgroundSize', 'backgroundPosition', 'filter']) {
        const value = (source.style && source.style[prop]) || (computed && computed[prop]) || '';
        if (value) target.style[prop] = value;
    }
}

function makeBgGhost(doc, bg, css, blinds) {
    const ghost = doc.createElement('div');
    ghost.className = 'igs-sd-ghost igs-sd-bg-ghost';
    if (!blinds) {
        ghost.style.backgroundImage = css;
        copyBackgroundGeometry(doc, bg, ghost);
        return { ghost, parts: [ghost] };
    }
    const parts = [];
    for (let index = 0; index < BLIND_COUNT; index += 1) {
        const stripe = doc.createElement('div');
        stripe.className = 'igs-sd-ghost-stripe';
        stripe.style.backgroundImage = css;
        copyBackgroundGeometry(doc, bg, stripe);
        const top = (index * 100) / BLIND_COUNT;
        const bottom = 100 - ((index + 1) * 100) / BLIND_COUNT;
        stripe.style.clipPath = `inset(${top}% 0 ${bottom}% 0)`;
        ghost.appendChild(stripe);
        parts.push(stripe);
    }
    return { ghost, parts };
}

function playBgTransition(state, ctx) {
    const { doc, bg, style, speed, root, nextUrl } = ctx;
    flushGhosts(state.bgGhosts);
    if (!state.bgCss) return '';
    const effective = style === 'black' ? 'black' : style;
    if (effective === 'black') {
        const curtain = doc.createElement('div');
        curtain.className = 'igs-sd-curtain';
        const clickLayer = root.querySelector('#igs-click-layer');
        const { ghost } = makeBgGhost(doc, bg, state.bgCss, false);
        if (!insertAfter(bg, ghost)) return '';
        state.bgGhosts.add(ghost);
        if (clickLayer && clickLayer.parentNode) clickLayer.parentNode.insertBefore(curtain, clickLayer);
        else insertAfter(ghost, curtain);
        state.bgGhosts.add(curtain);
        const total = BLACK_TRANSITION_MS[speed];
        const peak = Math.round(total * 0.45);
        curtain.style.opacity = '0';
        const fadeIn = animate(curtain, [{ opacity: 0 }, { opacity: 1 }], { duration: peak, easing: 'ease-in', fill: 'forwards' });
        if (!fadeIn) curtain.style.opacity = '1';
        later(state, () => {
            removeNode(ghost);
            state.bgGhosts.delete(ghost);
            for (const sprite of state.spriteGhosts) removeNode(sprite);
            state.spriteGhosts.clear();
            whenDecoded(doc, nextUrl, state).then(() => {
                if (!curtain.parentNode) return;
                const fadeOut = animate(curtain, [{ opacity: 1 }, { opacity: 0 }], { duration: total - peak, easing: 'ease-out', fill: 'forwards' });
                later(state, () => {
                    removeNode(curtain);
                    state.bgGhosts.delete(curtain);
                }, fadeOut ? total - peak + 40 : 0);
            });
        }, peak);
        return 'black';
    }
    const blinds = effective === 'blinds';
    const { ghost, parts } = makeBgGhost(doc, bg, state.bgCss, blinds);
    if (!insertAfter(bg, ghost)) return '';
    state.bgGhosts.add(ghost);
    const duration = BG_TRANSITION_MS[speed];
    whenDecoded(doc, nextUrl, state).then(() => {
        if (!ghost.parentNode) return;
        let played = false;
        if (effective === 'wipe') {
            played = Boolean(animate(ghost, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }], { duration, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }));
        } else if (effective === 'iris') {
            played = Boolean(animate(ghost, [{ clipPath: 'circle(75% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }], { duration, easing: 'cubic-bezier(.55,0,.45,1)', fill: 'forwards' }));
        } else if (blinds) {
            const each = Math.round(duration * 0.6);
            const stagger = (duration - each) / Math.max(1, BLIND_COUNT - 1);
            parts.forEach((stripe, index) => {
                const top = (index * 100) / BLIND_COUNT;
                const bottom = 100 - ((index + 1) * 100) / BLIND_COUNT;
                const a = animate(stripe, [{ clipPath: `inset(${top}% 0 ${bottom}% 0)` }, { clipPath: `inset(${100 - bottom}% 0 ${bottom}% 0)` }], {
                    duration: each, delay: Math.round(index * stagger), easing: 'ease-in', fill: 'forwards',
                });
                played = played || Boolean(a);
            });
        } else {
            played = Boolean(animate(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in-out', fill: 'forwards' }));
        }
        later(state, () => {
            removeNode(ghost);
            state.bgGhosts.delete(ghost);
        }, played ? duration + 60 : 0);
    });
    return effective;
}

function makeSpriteGhost(doc, sprite, css) {
    const ghost = doc.createElement('div');
    ghost.className = 'igs-sd-ghost igs-sd-sprite-ghost';
    ghost.style.cssText = css;
    ghost.style.display = 'block';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '2';
    ghost.style.backgroundRepeat = 'no-repeat';
    if (!insertAfter(sprite, ghost)) return null;
    return ghost;
}

function sideOf(posX) {
    if (posX > 55) return 1;
    if (posX < 45) return -1;
    return 0;
}

function enterFrames(side) {
    return side ? [`translate(${side * 3}%,0)`, 'translate(0,0)'] : ['translate(0,1.6%)', 'translate(0,0)'];
}

function playSpriteChange(state, ctx) {
    const { doc, sprite, nextUrl, nextPosX, s, reduced, black } = ctx;
    const hadSprite = Boolean(state.spriteUrl);
    flushGhosts(state.spriteGhosts);
    // 前后都有立绘就直接换图，不看是不是判定成同一个人。
    if (hadSprite && nextUrl) {
        state.speakerGap = false;
        return 'direct';
    }
    const enterExit = s.spriteMotion.enabled && s.spriteMotion.enterExit && !reduced;
    const fadeOn = s.sceneTransition.enabled || s.spriteMotion.enabled;
    const direct = !black;
    // 同一场景内立绘暂时空缺（旁白、系统角色、只配头像的说话人）：旧立绘直接隐藏，之后直接出现，不算登场 / 退场。
    // 登场 / 退场只留给换地点与首次出场；返回 'direct' 让同屏上台动画也跳过。
    if (direct && hadSprite && !nextUrl && (ctx.sameScene === true || ctx.noSpriteSpeaker === true)) {
        state.speakerGap = true;
        return 'direct';
    }
    if (direct && !hadSprite && Boolean(nextUrl) && state.speakerGap && ctx.sameScene === true) {
        state.speakerGap = false;
        return 'direct';
    }
    state.speakerGap = false;
    if (direct && hadSprite && Boolean(nextUrl)) return 'direct';
    let ghost = null;
    if (hadSprite && state.spriteCss && (fadeOn || enterExit)) {
        ghost = makeSpriteGhost(doc, sprite, state.spriteCss);
        if (ghost) state.spriteGhosts.add(ghost);
    }
    const dropGhost = (delay) => later(state, () => {
        removeNode(ghost);
        state.spriteGhosts.delete(ghost);
    }, delay);
    // 黑场转场时旧立绘随幕布落下时移除，新立绘等幕布升起再登场。
    const enterDelay = black ? Math.round(BLACK_TRANSITION_MS[ctx.speed] * 0.5) : 0;
    let kind = '';
    if (ghost && black) {
        kind = 'black';
    } else if (ghost) {
        kind = 'exit';
        const side = sideOf(state.spritePosX);
        const frames = enterExit
            ? [{ opacity: 1, transform: 'translate(0,0)' }, { opacity: 0, transform: `translate(${side * 2.5}%,${side ? 0 : 1.2}%)` }]
            : [{ opacity: 1 }, { opacity: 0 }];
        const duration = enterExit ? SPRITE_EXIT_MS : SPRITE_SWAP_MS + 80;
        const a = animate(ghost, frames, { duration, easing: 'ease-in', fill: 'forwards' });
        dropGhost(a ? duration + 40 : 0);
    }
    if (!nextUrl) return kind;
    if (enterExit) {
        const side = sideOf(nextPosX);
        animate(sprite, [{ opacity: 0 }, { opacity: 1 }], { duration: SPRITE_ENTER_MS, delay: enterDelay, easing: 'ease-out', fill: 'backwards' });
        animate(sprite, enterFrames(side).map((transform) => ({ transform })), {
            duration: SPRITE_ENTER_MS, delay: enterDelay, easing: 'cubic-bezier(.2,.7,.2,1)', composite: ADD, fill: 'backwards',
        });
        return kind ? `${kind}+enter` : 'enter';
    }
    if (fadeOn && hadSprite) {
        animate(sprite, [{ opacity: 0 }, { opacity: 1 }], { duration: SPRITE_SWAP_MS + 80, delay: enterDelay, easing: 'ease-out', fill: 'backwards' });
    }
    return kind;
}

function cancelActions(state) {
    for (const anim of state.actionAnims) {
        try { anim.cancel(); } catch { /* 已结束 */ }
    }
    state.actionAnims.clear();
}

function playSpriteBeat(state, sprite, spec) {
    const anim = playSpriteSpec(sprite, spec);
    if (anim) state.actionAnims.add(anim);
    return Boolean(anim);
}

// 视差变量只写到用它的三层上，不写 overlay 根，避免每次指针移动整棵子树重算样式。
const PARALLAX_TARGETS = Object.freeze(['#igs-bg', '#igs-sprite', '#igs-cast']);

function writeParallaxVars(root, point) {
    for (const selector of PARALLAX_TARGETS) {
        const el = root.querySelector(selector);
        if (!el) continue;
        const x = point ? point.x.toFixed(3) : null;
        const y = point ? point.y.toFixed(3) : null;
        if (el.style && typeof el.style.getPropertyValue === 'function'
            && el.style.getPropertyValue('--igs-sd-px') === (x || '') && el.style.getPropertyValue('--igs-sd-py') === (y || '')) continue;
        setVar(el, '--igs-sd-px', x);
        setVar(el, '--igs-sd-py', y);
    }
}

function syncParallax(state, root, on) {
    if (!on) {
        if (state.parallax) {
            state.parallax.detach();
            state.parallax = null;
        }
        return;
    }
    if (state.parallax) {
        writeParallaxVars(root, state.parallax.point);
        return;
    }
    if (typeof root.addEventListener !== 'function') return;
    const view = root.ownerDocument && root.ownerDocument.defaultView;
    const raf = view && typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame.bind(view) : (fn) => setTimeout(fn, 16);
    let pending = null;
    let frame = false;
    let rect = null;
    const parallax = { point: null };
    const invalidate = () => { rect = null; };
    const flush = () => {
        frame = false;
        if (!pending) return;
        parallax.point = pending;
        writeParallaxVars(root, pending);
    };
    const onMove = (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        if (!rect) rect = typeof root.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : null;
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
            rect = null;
            return;
        }
        const clamp = (v) => Math.max(-1, Math.min(1, v));
        pending = { x: clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2), y: clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2) };
        if (!frame) {
            frame = true;
            raf(flush);
        }
    };
    const onLeave = () => {
        pending = { x: 0, y: 0 };
        if (!frame) {
            frame = true;
            raf(flush);
        }
    };
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    // 嵌入模式下阅读器随聊天区滚动，滚动与尺寸变化都让缓存的 rect 失效。
    const resizeObserver = view && typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(invalidate) : null;
    if (resizeObserver) resizeObserver.observe(root);
    if (view && typeof view.addEventListener === 'function') {
        view.addEventListener('resize', invalidate);
        view.addEventListener('scroll', invalidate, { capture: true, passive: true });
    }
    parallax.detach = () => {
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerleave', onLeave);
        if (resizeObserver) resizeObserver.disconnect();
        if (view && typeof view.removeEventListener === 'function') {
            view.removeEventListener('resize', invalidate);
            view.removeEventListener('scroll', invalidate, { capture: true });
        }
        writeParallaxVars(root, null);
    };
    state.parallax = parallax;
}

export function cancelStageDirection(root) {
    const state = root && states.get(root);
    if (!state) return false;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    cancelActions(state);
    flushGhosts(state.bgGhosts);
    flushGhosts(state.spriteGhosts);
    syncParallax(state, root, false);
    cancelCameraImpact(typeof root.querySelector === 'function' ? root.querySelector('#igs-stage-motion') : null);
    for (const name of ROOT_ATTRS) setAttr(root, name, false);
    for (const name of ROOT_VARS) setVar(root, name, null);
    states.delete(root);
    return true;
}

// AI 镜头指令 [igs-fx:cam|…] 落到本页的镜头；返回值写进 data-igs-sd-cam。
// 特写写了别的角色、特写 / 拉远 / 虚化时本页没有立绘都不推；摇镜在减少动态效果时不播，虚化在低画质档不做。
export function resolveCameraShot(cam, { speakers = [], spriteUrl = '', reduced = false, lowQuality = false } = {}) {
    const shot = cam && typeof cam === 'object' ? text(cam.shot) : '';
    if (!shot || shot === 'reset') return '';
    if (shot === 'pan') return reduced ? '' : `pan-${cam.target === 'left' ? 'left' : 'right'}`;
    if (shot === 'tilt') return 'tilt';
    if (!spriteUrl) return '';
    if (shot === 'focus') return lowQuality ? '' : 'focus';
    if (shot === 'closeup' && text(cam.target) && !speakers.map(text).includes(text(cam.target))) return '';
    return shot === 'closeup' || shot === 'wide' ? shot : '';
}

// ctx.bgUrl / ctx.spriteUrl 为渲染层已解析、实际写入 DOM 的地址（隐藏立绘时为空）。
export function applyStageDirection(root, snapshot, ctx = {}) {
    if (!root || !snapshot || typeof root.querySelector !== 'function') return { played: [] };
    const s = normalizeStageDirectionSettings(snapshot.readerSettings);
    if (!isStageDirectionActive(s)) {
        if (states.has(root)) cancelStageDirection(root);
        return { played: [] };
    }
    const doc = root.ownerDocument;
    const bg = root.querySelector('#igs-bg');
    const sprite = root.querySelector('#igs-sprite');
    if (!doc || typeof doc.createElement !== 'function') return { played: [] };
    const state = getState(root);
    if (typeof ctx.schedule === 'function') state.schedule = ctx.schedule;
    if (typeof ctx.clear === 'function') state.clear = ctx.clear;
    const reduced = ctx.reducedMotion === true || (ctx.reducedMotion !== false && prefersReducedMotion());
    const content = snapshot.content || {};
    const played = [];
    let directSprite = false;
    const bgUrl = text(ctx.bgUrl);
    const spriteUrl = ctx.spriteEditMode ? state.spriteUrl : text(ctx.spriteUrl);
    const spriteKey = text(ctx.spriteKey);
    const castKeys = Array.isArray(ctx.castKeys) ? ctx.castKeys.map(text).filter(Boolean) : [];
    const posX = Number.isFinite(Number(ctx.spritePosX)) ? Number(ctx.spritePosX) : 50;
    const pageKey = `${snapshot.messageId}:${content.currentIndex}`;
    const newPage = pageKey !== state.pageKey;
    const eligible = content.sceneNsfw !== true && content.textType !== 'chat' && content.htmlCardPage !== true;
    const cg = content.cgActive === true || content.illustrationActive === true;
    const speed = s.sceneTransition.speed;

    let black = false;
    if (!cg && state.initialized && bg && bgUrl !== state.bgUrl && s.sceneTransition.enabled) {
        // 同一地点只是换时段的底图时总用淡入，换地点才用所选转场。
        const sameLocation = text(content.sceneLocation) && text(content.sceneLocation) === state.location;
        const style = reduced || sameLocation ? 'fade' : s.sceneTransition.style;
        const kind = bgUrl ? playBgTransition(state, { doc, bg, root, style, speed, nextUrl: bgUrl }) : '';
        if (kind) played.push(`bg:${kind}`);
        black = kind === 'black';
    }
    if (cg) {
        flushGhosts(state.bgGhosts);
        flushGhosts(state.spriteGhosts);
        playCgFocus(state, bg, bgUrl, reduced, text(ctx.bgKey), {
            nsfw: content.sceneNsfw === true || content.cgNsfw === true, speed: s.cgEntrance.nsfw,
            styles: s.cgEntrance.styles, doc, root,
            lowQuality: typeof root.getAttribute === 'function' && root.getAttribute('data-igs-quality') === 'low' });
    } else {
        state.cgFocusUrl = '';
        state.cgFocusing = false;
        clearCgFilter(bg);
    }
    if (!cg && sprite && !ctx.spriteEditMode && (spriteUrl !== state.spriteUrl || (!state.initialized && spriteUrl))) {
        const castSwap = Boolean(spriteKey) && spriteKey !== state.spriteKey
            && (castKeys.includes(state.spriteKey) || (state.castKeys || []).includes(spriteKey));
        const sameScene = state.initialized && text(content.sceneLocation) === state.location;
        const kind = playSpriteChange(state, { doc, sprite, nextUrl: spriteUrl, nextKey: spriteKey, nextPosX: posX, s, reduced, black, speed, castSwap, sameScene, noSpriteSpeaker: ctx.noSpriteSpeaker === true });
        if (kind === 'direct') directSprite = true;
        else if (kind) played.push(`sprite:${kind}`);
        if (kind.includes('enter')) state.entered = pageKey;
    }

    const motionOn = !reduced && !ctx.spriteEditMode;
    setAttr(root, 'data-igs-sd-breathe', motionOn && s.spriteMotion.enabled && s.spriteMotion.breathing && Boolean(spriteUrl));
    setAttr(root, 'data-igs-cast-breathe', motionOn && s.spriteMotion.enabled && s.spriteMotion.castBreathing);
    setVar(root, '--igs-sd-origin-x', `${posX}%`);
    if (newPage) cancelActions(state);
    if (newPage && motionOn && spriteUrl && sprite && eligible) {
        const action = pickSpriteAction(content.statusEmotion, s.spriteActions);
        if (action && playSpriteBeat(state, sprite, SPRITE_ACTION_FRAMES[action])) {
            played.push(`action:${action}`);
        } else if (s.spriteMotion.enabled && s.spriteMotion.speakBounce && content.textType === 'dialogue' && state.entered !== pageKey
            && playSpriteBeat(state, sprite, SPEAK_BOUNCE)) {
            played.push('bounce');
        }
    }

    setAttr(root, 'data-igs-cg', cg);
    setAttr(root, 'data-igs-sd-kenburns', !cg && !reduced && s.camera.enabled && s.camera.kenBurns && Boolean(bgUrl));
    const lowQuality = typeof root.getAttribute === 'function' && root.getAttribute('data-igs-quality') === 'low';
    const camShot = !cg && eligible && !ctx.spriteEditMode && s.camera.enabled && s.camera.aiShots
        ? resolveCameraShot(content.fx && content.fx.cam, { speakers: [content.speaker, content.spriteCharacter], spriteUrl, reduced, lowQuality })
        : '';
    setAttr(root, 'data-igs-sd-cam', Boolean(camShot), camShot);
    if (camShot && newPage) played.push(`camera:${camShot}`);
    // AI 指定了镜头的页不再按情绪自动特写。
    setAttr(root, 'data-igs-sd-closeup', !camShot && !cg && !reduced && eligible && Boolean(spriteUrl) && pickCloseUp(content.statusEmotion, s.camera));
    syncParallax(state, root, !cg && !reduced && s.camera.enabled && s.camera.parallax);
    // 冲击推近：只在翻到新页时按原始情绪精确匹配播一次，音效与镜头同时起播；本页震动在播时让位。CG 页不推。
    const stageMotion = root.querySelector('#igs-stage-motion');
    const impactPlan = !cg && stageMotion
        ? planCameraImpact({ newPage, motionOn, eligible, emotion: content.statusEmotion, camera: s.camera, stageShakeActive: ctx.stageShakeActive === true })
        : '';
    if (impactPlan === 'yield') played.push('camera:impact-yield');
    if (impactPlan === 'play') {
        const playSfx = typeof ctx.playSfx === 'function'
            ? ctx.playSfx
            : () => playCameraImpactSfx(normalizeFxSoundSettings(snapshot.readerSettings && snapshot.readerSettings.fxSound));
        const impact = playCameraImpact(stageMotion, { key: pageKey, reducedMotion: false, lowQuality, playSfx });
        if (impact.played) played.push('camera:impact');
    }

    state.initialized = true;
    state.bgUrl = bgUrl;
    state.bgCss = bg && bg.style ? bg.style.backgroundImage || '' : '';
    state.location = text(content.sceneLocation);
    if (!ctx.spriteEditMode) {
        state.spriteUrl = spriteUrl;
        state.spriteKey = spriteKey;
        state.spriteCss = sprite && sprite.style ? sprite.style.cssText || '' : '';
        state.spritePosX = posX;
        state.castKeys = castKeys;
    }
    state.pageKey = pageKey;
    return { played, directSprite };
}
