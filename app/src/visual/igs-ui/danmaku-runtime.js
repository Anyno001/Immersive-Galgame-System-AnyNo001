import { prefersReducedMotion } from './reduced-motion.js';
import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { enterPage, markPage, nextFrame, resolveAvatar, spriteGeometry } from './fx-runtime.js';
import { measureStage, peekSpriteHead, spriteDrawRect, headToMarker } from './fx-anchor.js';
import { normalizeFxStyleSettings } from './fx-settings.js';
import {
    isDanmakuActive,
    normalizeDanmakuSettings,
    pickInnerMood,
} from './danmaku-settings.js';
import { AUDIENCE_AMBIENT_LINES, INNER_PHRASES, classifyAudienceMood, randomItem, thoughtFragments } from './danmaku-pools.js';
import { fitLivePhone, pushLiveMessages, stopLivePhone, syncLivePhone } from './danmaku-live.js';
import { isAudienceEntryShown, placeAudienceEntry, stopAudience, syncAudience } from './danmaku-audience.js';

// 弹幕运行时：直播间（掏出手机看直播）、观众弹幕（HUD 下方小手机入口，点开看）、内心弹幕（立绘周围爆发）。
// 性能约束：全关零开销；运动只用 transform/opacity 的 CSS 动画，没有逐帧 JS；
// 每次渲染最多一次合并的几何读取且放在下一帧；同屏节点封顶，超出直接丢弃不排队。
const AUDIENCE_FILL = Object.freeze({ sparse: 1, medium: 3, dense: 6 });
const AUDIENCE_AMBIENT_CHANCE = Object.freeze({ sparse: 0, medium: 0.3, dense: 0.6 });
const ENTRY_GAP = 8;
const ENTRY_TOP = 14;
export const INNER_WORD_CAP = 16;
const INNER_LIFE = 3200;
const INNER_BURST_AT = 2600;

const states = new WeakMap();

export function createDanmakuMemory() {
    return { seen: new Set(), visitKey: '', visitSeen: new Set() };
}

function text(value) {
    return String(value == null ? '' : value).trim();
}

// 纯规划：决定本页要推的直播弹幕、观众弹幕和内心弹幕；不碰 DOM。
export function planDanmakuPage(snapshot, memory, settings, rng = Math.random) {
    const content = (snapshot && snapshot.content) || {};
    const pageKey = `${snapshot && snapshot.messageId}:${content.currentIndex}`;
    const replay = normalizeFxStyleSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.fxStyle).replay;
    enterPage(memory, pageKey);
    const once = (key) => markPage(memory, key, replay);
    const fx = content.fx || {};
    const special = content.chatPage === true || content.htmlCardPage === true;
    const nsfw = content.sceneNsfw === true;
    const plan = { pageKey, live: null, liveVisible: false, dms: [], audience: [], audienceVisible: false, inner: null };

    if (settings.live.enabled && !(settings.live.muteOnNsfw && nsfw) && fx.live) {
        plan.live = fx.live;
        // 回忆、梦境里收起手机，回到现实再拿出来。
        plan.liveVisible = !special && fx.flashback !== true && fx.dream !== true;
        (fx.dms || []).forEach((item, index) => {
            if (once(`dm:${pageKey}:${index}:${item.user}:${item.text}`)) plan.dms.push({ user: item.user, text: item.text, type: item.type, extra: item.extra });
        });
    }

    if (settings.audience.enabled && !(settings.audience.muteOnNsfw && nsfw) && !special) {
        const aud = settings.audience;
        plan.audienceVisible = !plan.liveVisible;
        const mood = classifyAudienceMood(content.statusEmotion);
        (fx.danmaku || []).forEach((item, index) => {
            if (once(`danmaku:${pageKey}:${index}:${item.lines.join('/')}`)) plan.audience.push({ lines: item.lines, style: item.style, ai: true });
        });
        if (aud.ambient) {
            const pool = AUDIENCE_AMBIENT_LINES[mood] || AUDIENCE_AMBIENT_LINES.generic;
            const fill = plan.audience.length ? AUDIENCE_FILL[aud.density] : 0;
            const spontaneous = !plan.audience.length && mood !== 'generic' && rng() < AUDIENCE_AMBIENT_CHANCE[aud.density]
                && once(`danmaku-ambient:${pageKey}:${content.statusEmotion}`);
            const count = fill || (spontaneous ? AUDIENCE_FILL[aud.density] : 0);
            const lines = [];
            for (let i = 0; i < count; i += 1) lines.push(randomItem(pool, rng));
            if (lines.length) plan.audience.push({ lines, style: 'scroll', ai: false });
        }
    }

    const speaking = content.textType === 'dialogue' || content.textType === 'thought';
    const innerMood = speaking && !special ? pickInnerMood(content.statusEmotion, settings.inner) : '';
    if (innerMood && once(`inner:${pageKey}:${content.statusEmotion}:${content.displayText || ''}`)) {
        const fromThought = settings.inner.useThought && content.textType === 'thought' ? thoughtFragments(content.text) : [];
        plan.inner = { mood: innerMood, phrases: fromThought.length ? fromThought : INNER_PHRASES[innerMood] };
    }
    return plan;
}

function getState(root, options) {
    let state = states.get(root);
    if (!state) {
        state = { memory: createDanmakuMemory(), timers: new Set(), pageKey: '' };
        states.set(root, state);
    }
    state.schedule = typeof options.schedule === 'function' ? options.schedule : (fn, ms) => setTimeout(fn, ms);
    state.clear = typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer);
    state.now = typeof options.now === 'function' ? options.now : Date.now;
    state.rng = typeof options.rng === 'function' ? options.rng : Math.random;
    return state;
}

function track(state, fn, ms) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, ms);
    state.timers.add(timer);
}

function node(doc, className, content) {
    const el = doc.createElement('div');
    el.className = className;
    if (content != null) el.textContent = content;
    return el;
}

// 舞台层（不可点）放直播间与内心弹幕；前层（对话层之上）放可点的观众弹幕入口与展开的手机。
function ensureHosts(layers) {
    let host = layers.stage.querySelector('.igs-dm-root');
    if (!host) {
        host = node(layers.doc, 'igs-dm-root');
        layers.stage.appendChild(host);
    }
    let front = layers.front.querySelector('.igs-dm-front');
    if (!front) {
        front = node(layers.doc, 'igs-dm-front');
        layers.front.appendChild(front);
    }
    return { host, front };
}

// HUD 在舞台外层，高度随折叠变化：可见时入口贴它下缘，否则回左上角。
// 舞台可能被外层 transform 缩放：矩形差值换回舞台自身的 CSS 像素（同 measureStage）。
function entryTop(root, motion, stageH) {
    const hud = root.querySelector('#igs-status-hud');
    if (!hud || hud.hasAttribute('hidden') || typeof hud.getBoundingClientRect !== 'function' || typeof motion.getBoundingClientRect !== 'function') return ENTRY_TOP;
    const rect = hud.getBoundingClientRect();
    const m = motion.getBoundingClientRect();
    if (!(rect.height > 0) || !(m.height > 0)) return ENTRY_TOP;
    return Math.max(ENTRY_TOP, (rect.bottom - m.top) * (stageH / m.height) + ENTRY_GAP);
}

// 内心弹幕的落点：有头部标定时围着头，否则围着立绘上半身；没有立绘就在舞台中上部。
function innerAnchor(geo, sprite) {
    const floor = Math.min(geo.dialogTop, geo.stageH) - 24;
    const probed = sprite ? peekSpriteHead(sprite.url) : null;
    const shape = spriteGeometry(sprite, probed);
    const rect = shape ? spriteDrawRect(geo.stageW, geo.stageH, shape) : null;
    if (rect && shape.head) {
        const head = headToMarker(shape.head, rect);
        return { ...geo, cx: head.cx, cy: head.cy + head.d * 0.4, rx: Math.max(head.d * 1.6, geo.stageW * 0.16), ry: Math.max(head.d * 1.1, geo.stageH * 0.14), floor };
    }
    if (rect) return { ...geo, cx: rect.left + rect.w / 2, cy: rect.top + rect.h * 0.28, rx: Math.max(rect.w * 0.7, geo.stageW * 0.16), ry: rect.h * 0.2, floor };
    return { ...geo, cx: geo.stageW / 2, cy: geo.stageH * 0.34, rx: geo.stageW * 0.28, ry: geo.stageH * 0.16, floor };
}

// 三段式：稀疏冒出 → 越来越多、越来越大 → 在同一刻一起碎掉。
export function layoutInnerWords(anchor, phrases, count, rng = Math.random) {
    const words = [];
    const minSide = Math.min(anchor.stageW, anchor.stageH);
    for (let i = 0; i < count; i += 1) {
        const t = count > 1 ? i / (count - 1) : 0;
        const angle = (i * 2.399963) + rng() * 0.6;
        const reach = 0.72 + rng() * 0.38;
        const x = Math.max(minSide * 0.06, Math.min(anchor.stageW - minSide * 0.06, anchor.cx + Math.cos(angle) * anchor.rx * reach));
        const y = Math.max(anchor.stageH * 0.05, Math.min(anchor.floor, anchor.cy + Math.sin(angle) * anchor.ry * reach));
        const delay = i < 3 ? i * 260 : Math.round(800 + (t * t) * 1500);
        words.push({ text: phrases[i % phrases.length], x: Math.round(x), y: Math.round(y), delay, scale: +(0.85 + t * 0.75).toFixed(2), tilt: Math.round((rng() - 0.5) * 16) });
    }
    return words;
}

function playInner(ctx, inner, stage) {
    const { state, doc, reduced, options } = ctx;
    const sprite = options.sprite && options.sprite.url ? options.sprite : null;
    const anchor = innerAnchor(stage, sprite);
    const size = Math.round(Math.max(15, Math.min(26, Math.min(anchor.stageW, anchor.stageH) * 0.036)));
    const group = node(doc, 'igs-dm-inner');
    group.setAttribute('data-mood', inner.mood);
    group.style.setProperty('--igs-dm-inner-size', `${size}px`);
    group.style.setProperty('--igs-dm-burst', `${INNER_BURST_AT}ms`);
    const words = layoutInnerWords(anchor, inner.phrases, reduced ? 5 : INNER_WORD_CAP, state.rng);
    for (const word of words) {
        const el = node(doc, 'igs-dm-word', word.text);
        el.style.left = `${word.x}px`;
        el.style.top = `${word.y}px`;
        el.style.setProperty('--igs-dm-d', `${reduced ? 0 : word.delay}ms`);
        el.style.setProperty('--igs-dm-s', String(word.scale));
        el.style.setProperty('--igs-dm-r', `${word.tilt}deg`);
        group.appendChild(el);
    }
    ctx.host.appendChild(group);
    track(state, () => group.remove(), INNER_LIFE);
}

function liveContext(ctx, live) {
    const { snapshot, options, state, doc, reduced } = ctx;
    const content = snapshot.content || {};
    const resolve = (url) => (url && typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(url) || '' : url || '');
    const speaker = text(content.spriteCharacter || content.speaker);
    const portraitUrl = options.sprite && options.sprite.url && speaker === live.name ? options.sprite.url : '';
    return {
        doc, reduced, schedule: state.schedule, clear: state.clear, now: state.now, rng: state.rng,
        visible: ctx.plan.liveVisible,
        coverUrl: resolve(content.backgroundImage),
        portraitUrl,
        avatarUrl: resolveAvatar(live.name, snapshot, options),
    };
}

function clearPage(state, host) {
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    if (!host) return;
    for (const el of Array.from(host.querySelectorAll('.igs-dm-inner'))) el.remove();
}

function audienceInfo(ctx) {
    const { snapshot, options, plan } = ctx;
    const content = snapshot.content || {};
    const resolve = (url) => (url && typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(url) || '' : url || '');
    const total = Array.isArray(content.segments) ? content.segments.length : 0;
    const page = Number(content.currentIndex) || 0;
    return {
        visible: plan.audienceVisible,
        messageId: snapshot.messageId,
        page,
        progress: total > 1 ? page / (total - 1) : 1,
        title: text(content.sceneLocation),
        groups: plan.audience,
        frame: { bg: resolve(content.backgroundImage), sprite: options.sprite && options.sprite.url ? options.sprite.url : '' },
        settings: ctx.settings.audience,
        reduced: ctx.reduced,
    };
}

export function applyDanmakuToDom(root, snapshot, options = {}) {
    if (!root || !snapshot) return { live: false, audience: 0, inner: false };
    const settings = normalizeDanmakuSettings(snapshot.readerSettings);
    if (!isDanmakuActive(settings) || options.suspended === true) {
        if (states.has(root)) cancelDanmaku(root);
        return { live: false, audience: 0, inner: false };
    }
    const layers = ensureFxLayers(root);
    if (!layers) return { live: false, audience: 0, inner: false };
    const state = getState(root, options);
    const plan = planDanmakuPage(snapshot, state.memory, settings, state.rng);
    const { host, front } = ensureHosts(layers);
    if (state.pageKey && state.pageKey !== plan.pageKey) clearPage(state, host);
    state.pageKey = plan.pageKey;
    const reduced = options.reducedMotion === true || (options.reducedMotion !== false && prefersReducedMotion());
    const ctx = {
        state, layers, doc: layers.doc, root, host, snapshot, options, reduced, plan, pageKey: plan.pageKey,
        settings,
    };
    const phone = syncLivePhone(host, plan.live, plan.live ? liveContext(ctx, plan.live) : { schedule: state.schedule, reduced });
    if (phone && plan.dms.length) pushLiveMessages(host, plan.dms);
    if (settings.audience.enabled) {
        syncAudience(front, audienceInfo(ctx), {
            doc: ctx.doc, schedule: state.schedule, clear: state.clear, now: state.now, rng: state.rng,
            frame: (fn) => nextFrame(ctx.doc, fn),
        });
    } else {
        stopAudience(front);
    }
    const entryShown = isAudienceEntryShown(front);
    if (plan.inner || entryShown || (phone && plan.liveVisible)) {
        // 本次渲染唯一一次几何读取：推迟到下一帧，全部读完才写。
        nextFrame(ctx.doc, () => {
            if (states.get(root) !== state || state.pageKey !== plan.pageKey) return;
            const stage = measureStage(layers.motion);
            if (!stage) return;
            const top = entryShown ? entryTop(root, layers.motion, stage.stageH) : 0;
            if (phone) fitLivePhone(host, stage);
            if (entryShown) placeAudienceEntry(front, top);
            if (plan.inner) playInner(ctx, plan.inner, stage);
        });
    }
    return { live: Boolean(phone), audience: plan.audience.length, inner: Boolean(plan.inner) };
}

export function cancelDanmaku(root) {
    const state = root && states.get(root);
    const layers = root ? findFxLayers(root) : null;
    const host = layers && layers.stage ? layers.stage.querySelector('.igs-dm-root') : null;
    const front = layers && layers.front ? layers.front.querySelector('.igs-dm-front') : null;
    if (state) {
        clearPage(state, host);
        states.delete(root);
    }
    if (host) {
        stopLivePhone(host);
        host.remove();
    }
    if (front) {
        stopAudience(front);
        front.remove();
    }
    return Boolean(state);
}
