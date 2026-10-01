import { prefersReducedMotion } from './reduced-motion.js';
import { STAGE_DIRECTION_NORMALIZERS, pickCloseUp, pickSpriteAction } from './stage-direction-settings.js';
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
const ROOT_ATTRS = Object.freeze(['data-igs-sd-breathe', 'data-igs-cast-breathe', 'data-igs-sd-kenburns', 'data-igs-sd-parallax', 'data-igs-sd-closeup']);
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
    return Object.entries(settings).some(([key, item]) => key !== 'stageCast' && item.enabled);
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

function animate(el, frames, options) {
    if (!el || typeof el.animate !== 'function') return null;
    try {
        return el.animate(frames, options);
    } catch {
        return null;
    }
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
    bg.style.setProperty('filter', 'none', 'important');
    bg.style.setProperty('-webkit-filter', 'none', 'important');
}

function clearCgFilter(bg) {
    if (!bg || !bg.style || typeof bg.style.removeProperty !== 'function') return;
    bg.style.removeProperty('transition');
    bg.style.removeProperty('filter');
    bg.style.removeProperty('-webkit-filter');
}

// CG 出场：先模糊，再在同一张图上变清晰。同一张翻页不重放。
function playCgFocus(state, bg, url, reduced) {
    if (!bg || !url) return;
    if (reduced) {
        state.cgFocusUrl = url;
        state.cgFocusing = false;
        sharpenCg(bg);
        return;
    }
    if (state.cgFocusUrl === url) {
        if (!state.cgFocusing) sharpenCg(bg);
        return;
    }
    state.cgFocusUrl = url;
    state.cgFocusing = true;
    bg.style.setProperty('transition', 'none', 'important');
    bg.style.setProperty('filter', 'blur(28px)', 'important');
    bg.style.setProperty('-webkit-filter', 'blur(28px)', 'important');
    later(state, () => {
        if (state.cgFocusUrl !== url) return;
        bg.style.setProperty('transition', 'filter 2.4s ease-in-out, -webkit-filter 2.4s ease-in-out', 'important');
        sharpenCg(bg);
        later(state, () => {
            if (state.cgFocusUrl === url) state.cgFocusing = false;
        }, 2500);
    }, 450);
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
        playCgFocus(state, bg, bgUrl, reduced);
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
    setAttr(root, 'data-igs-sd-closeup', !cg && !reduced && eligible && Boolean(spriteUrl) && pickCloseUp(content.statusEmotion, s.camera));
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
        const lowQuality = typeof root.getAttribute === 'function' && root.getAttribute('data-igs-quality') === 'low';
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
