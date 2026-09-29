import { prefersReducedMotion } from './reduced-motion.js';
import { filterFxByKinds } from '../../scene/fx-directives.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { resolveStatusAvatar } from '../../data/shujuku/status-hud-model.js';
import {
    FX_FEATURE_KEYS,
    FX_HOLD_SCALE,
    enabledFxTagKinds,
    normalizeFxReaderSettings,
    pickFlash,
    pickHeartbeat,
    pickMangaSymbol,
    pickSpeedLines,
} from './fx-settings.js';
import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { playFxSfx } from './fx-sfx.js';
import { MANGA_SYMBOL_SVG, pickFxAccent, speedLinesImage, warmSpeedLines } from './fx-symbols.js';
import { measureStage, peekSpriteHead, probeSpriteHead, resolveSymbolPlacement, waitSpriteHead } from './fx-anchor.js';

export const FX_LIFETIME_MS = Object.freeze({
    symbol: 1000, speedLines: 700, heartbeat: 2400, flash: 800,
    favor: 2400, notify: 3300, sfx: 1000, eye: 1600, call: 2400, 'call-end': 1800,
});
export const TITLE_CARD_LIFETIME_MS = Object.freeze({ fast: 1800, medium: 2700, slow: 4200 });
const SEEN_LIMIT = 256;
const FAVOR_LIMIT = 256;
const MIN_FAVOR_DELTA = 1;
// 停留时间只拉长「出现—停留—消失」类演出；心跳、闪白、睁眼与来电跟音效节奏绑定，不随档位变化。
const HOLDABLE = new Set(['symbol', 'speedLines', 'favor', 'notify', 'sfx', 'call-end']);
const RANGE_ATTRS = Object.freeze(['data-igs-fx-flashback', 'data-igs-fx-dream', 'data-igs-fx-letterbox', 'data-igs-fx-call', 'data-igs-fx-motion', 'data-igs-fx-busy', 'data-igs-fx-presentation']);
// 在对话框下方播放的全屏演出：播放期间给舞台挂 data-igs-fx-busy，样式暂停对话框毛玻璃，
// 否则 backdrop-filter 每帧都要对变化中的底图重新模糊。
const BUSY_EFFECTS = new Set(['speedLines', 'heartbeat', 'eye']);
const EMPTY_FX = Object.freeze({ instants: [], call: null, flashback: false, dream: false, letterbox: false });

const states = new WeakMap();
const layeredRoots = new WeakSet();
const favorBaseline = new Map();

export function createFxMemory() {
    return { seen: new Set(), lastLocation: '', lastTime: '', visitKey: '', visitSeen: new Set() };
}

function markOnce(memory, key) {
    if (memory.seen.has(key)) return false;
    memory.seen.add(key);
    if (memory.seen.size > SEEN_LIMIT) memory.seen.delete(memory.seen.values().next().value);
    return true;
}

function enterPage(memory, pageKey) {
    if (memory.visitKey === pageKey) return;
    memory.visitKey = pageKey;
    memory.visitSeen = new Set();
}

// 同一次停留内的重绘永不重播；replay 开启时离开再翻回该页会重新播放。
function markPage(memory, key, replay) {
    const fresh = markOnce(memory, key);
    if (memory.visitSeen.has(key)) return false;
    memory.visitSeen.add(key);
    return replay || fresh;
}

function text(value) {
    return String(value == null ? '' : value).trim();
}

// 首次见到的指标只记基线；之后变化量绝对值达到阈值才提示。
export function diffFavorMetrics(baseline, character, metrics) {
    const changes = [];
    const name = text(character);
    if (!name || !Array.isArray(metrics)) return changes;
    for (const metric of metrics) {
        const label = text(metric && metric.label);
        const value = Number(metric && metric.percent);
        if (!label || !Number.isFinite(value)) continue;
        const key = `${name}::${label}`;
        const previous = baseline.get(key);
        baseline.delete(key);
        baseline.set(key, value);
        if (previous == null) continue;
        const delta = Math.round((value - previous) * 10) / 10;
        if (Math.abs(delta) >= MIN_FAVOR_DELTA) changes.push({ character: name, label, delta });
    }
    while (baseline.size > FAVOR_LIMIT) baseline.delete(baseline.keys().next().value);
    return changes;
}

export function resetFavorBaseline() {
    favorBaseline.clear();
}

function planTitle(content, settings, memory, effects) {
    const location = text(content.sceneLocation);
    const time = text(content.sceneTime);
    const locationChanged = Boolean(location) && location !== memory.lastLocation;
    const timeChanged = Boolean(time) && time !== memory.lastTime;
    if (location) memory.lastLocation = location;
    if (time) memory.lastTime = time;
    if (!settings.enabled) return;
    let card = null;
    if (settings.onLocation && locationChanged) card = { type: 'title', main: location, sub: time };
    else if (settings.onTime && timeChanged) card = { type: 'title', main: '', sub: `—— ${time}` };
    if (card && markOnce(memory, `title:${content.messageId}:${location}:${time}`)) effects.push(card);
}

// 纯规划：根据快照与记忆决定本次渲染要播放的瞬时演出和需要保持的区间状态。
export function planPageFx(snapshot, memory, baseline = favorBaseline, normalized = null) {
    const content = (snapshot && snapshot.content) || {};
    const settings = normalized || normalizeFxReaderSettings(snapshot && snapshot.readerSettings);
    const messageId = snapshot && snapshot.messageId;
    const pageKey = `${messageId}:${content.currentIndex}`;
    const special = content.chatPage === true || content.htmlCardPage === true;
    const effects = [];
    const emotion = content.sceneNsfw ? '' : text(content.statusEmotion);
    const emotionKey = `${pageKey}:${emotion}:${content.displayText || ''}`;
    const replay = settings.fxStyle.replay;
    enterPage(memory, pageKey);
    const once = (key) => markPage(memory, key, replay);

    if (emotion && !special) {
        const symbol = pickMangaSymbol(emotion, settings.mangaFx);
        if (symbol && once(`symbol:${emotionKey}`)) effects.push({ type: 'symbol', kind: symbol });
        if (pickSpeedLines(emotion, settings.mangaFx) && once(`speed:${emotionKey}`)) effects.push({ type: 'speedLines' });
        const tone = pickHeartbeat(emotion, settings.heartbeatFx);
        if (tone && once(`heart:${emotionKey}`)) effects.push({ type: 'heartbeat', tone });
        if (pickFlash(emotion, settings.flashFx) && once(`flash:${emotionKey}`)) effects.push({ type: 'flash' });
    }
    if (!special) planTitle({ ...content, messageId }, settings.titleCard, memory, effects);

    if (settings.favorToast.enabled && content.statusHud && content.statusHud.character) {
        for (const change of diffFavorMetrics(baseline, content.statusHud.character, content.statusHud.metrics)) {
            effects.push({ type: 'favor', ...change });
        }
    }

    const fx = filterFxByKinds(content.fx || EMPTY_FX, enabledFxTagKinds(settings.fxTags));
    let eyeHold = false;
    for (const item of fx.instants) {
        if (item.kind === 'eye' && item.mode === 'close') eyeHold = true;
        if (once(`fx:${pageKey}:${item.kind}:${JSON.stringify(item)}`)) effects.push({ ...item, type: item.kind });
    }
    return {
        pageKey,
        effects,
        ranges: { flashback: fx.flashback, dream: fx.dream, letterbox: fx.letterbox, call: fx.call },
        eyeHold,
        titleSpeed: settings.titleCard.speed,
        sound: settings.fxSound,
        style: settings.fxStyle,
    };
}

function hasReducedMotion(options) {
    return options.reducedMotion === true
        || (options.reducedMotion !== false
            && prefersReducedMotion());
}

function node(doc, className, content) {
    const el = doc.createElement('div');
    el.className = className;
    if (content != null) el.textContent = content;
    return el;
}

function persistent(layer, doc, className) {
    let el = layer.querySelector(`.${className}`);
    if (!el) {
        el = node(doc, className);
        layer.appendChild(el);
    }
    return el;
}

function setFlag(el, name, on, value = '1') {
    if (on) el.setAttribute(name, value);
    else el.removeAttribute(name);
}

function getState(root, options) {
    let state = states.get(root);
    if (!state) {
        state = { memory: createFxMemory(), timers: new Set(), sounds: [], pageKey: '', busy: 0, rangeBusy: false, busyOn: false, presentation: 0, presentationOn: false, motion: null, accent: null };
        states.set(root, state);
    }
    state.schedule = typeof options.schedule === 'function' ? options.schedule : (fn, ms) => setTimeout(fn, ms);
    state.clear = typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer);
    return state;
}

function track(state, fn, ms) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, ms);
    state.timers.add(timer);
    return timer;
}

function syncBusy(state) {
    const on = state.busy > 0 || state.rangeBusy;
    if (on === state.busyOn || !state.motion) return;
    state.busyOn = on;
    setFlag(state.motion, 'data-igs-fx-busy', on);
}

function syncPresentation(state) {
    const on = state.presentation > 0;
    if (on === state.presentationOn || !state.motion) return;
    state.presentationOn = on;
    setFlag(state.motion, 'data-igs-fx-presentation', on);
}

function spawn(state, layer, el, lifeMs, busy = false, presentation = false) {
    el.classList.add('igs-fx-transient');
    if (el.style && typeof el.style.setProperty === 'function') el.style.setProperty('--igs-fx-life', `${lifeMs}ms`);
    layer.appendChild(el);
    if (busy) {
        state.busy += 1;
        syncBusy(state);
    }
    if (presentation) {
        state.presentation += 1;
        syncPresentation(state);
    }
    track(state, () => {
        el.remove();
        if (busy) {
            state.busy = Math.max(0, state.busy - 1);
            syncBusy(state);
        }
        if (presentation) {
            state.presentation = Math.max(0, state.presentation - 1);
            syncPresentation(state);
        }
    }, lifeMs);
    return el;
}

// 翻页时立即收掉上一页仍在播放的瞬时演出，避免快速翻页叠出多层全屏动画。
function clearTransients(state, layers) {
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    state.busy = 0;
    state.presentation = 0;
    syncPresentation(state);
    for (const layer of [layers.stage, layers.front]) {
        if (!layer) continue;
        for (const el of Array.from(layer.querySelectorAll('.igs-fx-transient'))) el.remove();
    }
}

// 定位要读舞台几何：推迟到下一帧，避免在本次渲染刚写完 DOM 时强制同步排版。
function nextFrame(doc, fn) {
    const view = doc && doc.defaultView;
    if (view && typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(fn);
    else fn();
}

function sound(state, kind, settings, options) {
    const handle = playFxSfx(kind, settings, { audioScheduler: options.audioScheduler });
    if (!handle || typeof handle.stop !== 'function') return;
    state.sounds.push(handle);
    if (state.sounds.length > 8) state.sounds.shift();
}

function resolveAvatar(name, snapshot, options) {
    const assets = (snapshot.readerSettings && snapshot.readerSettings._sceneAssets) || {};
    const key = resolveCharacterKey(assets.characters || {}, assets.characterAliases, name) || name;
    const url = resolveStatusAvatar(assets.statusAvatars, key);
    if (!url) return '';
    return typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(url) || '' : url;
}

function renderCallScreen(doc, name, avatar) {
    const screen = node(doc, 'igs-fx-call-screen');
    const face = avatar ? doc.createElement('img') : node(doc, 'igs-fx-call-avatar is-initial', Array.from(name)[0] || '?');
    if (avatar) {
        face.className = 'igs-fx-call-avatar';
        face.src = avatar;
        face.alt = name;
    }
    const ring = node(doc, 'igs-fx-call-ring');
    ring.appendChild(face);
    screen.appendChild(ring);
    screen.appendChild(node(doc, 'igs-fx-call-name', name));
    screen.appendChild(node(doc, 'igs-fx-call-state', '来电'));
    screen.appendChild(node(doc, 'igs-fx-call-hint', '点击接听'));
    return screen;
}

// 手动标定的头部优先于透明通道探测；原图尺寸优先取探测值，探测失败时用标定时记下的高宽比。
export function spriteGeometry(sprite, probed) {
    if (!sprite) return null;
    const manual = sprite.head || null;
    const naturalW = probed ? probed.naturalW : 1;
    const naturalH = probed ? probed.naturalH : manual && manual.aspect;
    if (!(naturalW > 0) || !(naturalH > 0)) return null;
    return { posX: sprite.posX, posY: sprite.posY, scale: sprite.scale, naturalW, naturalH, head: manual || (probed && probed.head) || null };
}

function placeSymbol(el, kind, motion, sprite, probed) {
    const geo = measureStage(motion);
    if (!geo) return;
    const placement = resolveSymbolPlacement(kind, { ...geo, sprite: spriteGeometry(sprite, probed) });
    if (!placement) return;
    el.style.left = `${placement.x}px`;
    el.style.top = `${placement.y}px`;
    el.style.setProperty('--igs-fx-size', `${placement.size}px`);
    if (placement.flip) el.setAttribute('data-flip', '1');
}

function showSymbol(el, effect, ctx, life, sprite, head) {
    const { state, layers, doc } = ctx;
    el.setAttribute('data-pending', '1');
    spawn(state, layers.stage, el, life);
    nextFrame(doc, () => {
        if (!el.parentNode) return;
        placeSymbol(el, effect.kind, layers.motion, sprite, head);
        el.removeAttribute('data-pending');
    });
}

function playSymbol(effect, ctx, life) {
    const { state, doc, options, plan, root } = ctx;
    const el = node(doc, 'igs-fx-symbol');
    el.setAttribute('data-kind', effect.kind);
    el.innerHTML = MANGA_SYMBOL_SVG[effect.kind] || '';
    const sprite = options.sprite && options.sprite.url ? options.sprite : null;
    const cached = sprite ? peekSpriteHead(sprite.url) : null;
    if (!sprite || cached || (sprite.head && sprite.head.aspect)) {
        showSymbol(el, effect, ctx, life, sprite, cached);
        return;
    }
    waitSpriteHead(sprite.url, doc, (fn, ms) => track(state, fn, ms)).then((head) => {
        if (states.get(root) !== state || state.pageKey !== plan.pageKey) return;
        showSymbol(el, effect, ctx, life, sprite, head);
    });
}

function speedLines(doc) {
    const el = node(doc, 'igs-fx-speedlines');
    const url = speedLinesImage(doc);
    if (url && el.style) {
        el.style.backgroundImage = `url("${url}")`;
        el.setAttribute('data-baked', '1');
    }
    return el;
}

function playEffect(effect, ctx) {
    const { state, layers, doc, snapshot, options, reduced, plan } = ctx;
    const base = effect.type === 'title'
        ? (TITLE_CARD_LIFETIME_MS[plan.titleSpeed] || TITLE_CARD_LIFETIME_MS.medium)
        : (FX_LIFETIME_MS[effect.type] || 1000);
    const life = HOLDABLE.has(effect.type) ? Math.round(base * (FX_HOLD_SCALE[plan.style.hold] || 1)) : base;
    const busy = BUSY_EFFECTS.has(effect.type);
    if (effect.type === 'symbol') {
        playSymbol(effect, ctx, life);
    } else if (effect.type === 'speedLines') {
        spawn(state, layers.stage, speedLines(doc), life, busy);
    } else if (effect.type === 'heartbeat') {
        const el = node(doc, 'igs-fx-heartbeat');
        el.setAttribute('data-tone', effect.tone);
        spawn(state, layers.stage, el, life, busy);
        sound(state, 'heartbeat', plan.sound, options);
    } else if (effect.type === 'flash') {
        if (!reduced) spawn(state, layers.front, node(doc, 'igs-fx-flash'), life);
        sound(state, 'tinnitus', plan.sound, options);
    } else if (effect.type === 'title') {
        const el = node(doc, 'igs-fx-title-card');
        if (effect.main) el.appendChild(node(doc, 'igs-fx-title-main', effect.main));
        if (effect.sub) el.appendChild(node(doc, 'igs-fx-title-sub', effect.sub));
        spawn(state, layers.front, el, life, false, true);
    } else if (effect.type === 'favor') {
        const up = effect.delta > 0;
        const el = node(doc, 'igs-fx-favor', `${effect.character} ${effect.label} ${up ? '↑' : '↓'} ${up ? '+' : ''}${effect.delta}`);
        el.setAttribute('data-dir', up ? 'up' : 'down');
        const stack = persistent(layers.front, doc, 'igs-fx-favor-stack');
        spawn(state, stack, el, life);
    } else if (effect.type === 'notify') {
        const el = node(doc, 'igs-fx-notify');
        if (effect.sender) el.appendChild(node(doc, 'igs-fx-notify-sender', effect.sender));
        el.appendChild(node(doc, 'igs-fx-notify-text', effect.text));
        spawn(state, layers.front, el, life);
        sound(state, 'notify', plan.sound, options);
    } else if (effect.type === 'sfx') {
        spawn(state, layers.front, node(doc, 'igs-fx-sfx', effect.text), life);
    } else if (effect.type === 'eye') {
        if (effect.mode === 'open' && !reduced) spawn(state, layers.stage, node(doc, 'igs-fx-eye is-open'), life, busy);
    } else if (effect.type === 'call') {
        const screen = spawn(state, layers.front, renderCallScreen(doc, effect.name, resolveAvatar(effect.name, snapshot, options)), life);
        screen.addEventListener('click', (event) => {
            event.stopPropagation();
            screen.remove();
        }, { once: true });
        sound(state, 'ring', plan.sound, options);
    } else if (effect.type === 'call-end') {
        spawn(state, layers.front, node(doc, 'igs-fx-call-end', '通话结束'), life);
        sound(state, 'hangup', plan.sound, options);
    }
}

export function applyFxToDom(root, snapshot, options = {}) {
    if (!root || !snapshot) return { played: [] };
    const settings = normalizeFxReaderSettings(snapshot.readerSettings);
    if (!FX_FEATURE_KEYS.some((key) => settings[key].enabled)) {
        // 全关时只在曾经挂过演出层的舞台上清理一次，避免每次渲染都查 DOM。
        if (states.has(root) || layeredRoots.has(root)) {
            cancelFxEffects(root);
            layeredRoots.delete(root);
        }
        return { played: [] };
    }
    const layers = ensureFxLayers(root);
    if (!layers) return { played: [] };
    layeredRoots.add(root);
    const state = getState(root, options);
    const plan = planPageFx(snapshot, state.memory, favorBaseline, settings);
    const reduced = hasReducedMotion(options);
    const { motion, stage, front, doc } = layers;
    if (state.pageKey && state.pageKey !== plan.pageKey) clearTransients(state, layers);
    state.motion = motion;
    if (settings.mangaFx.enabled) warmSpeedLines(doc);
    if (settings.mangaFx.enabled && options.sprite && options.sprite.url) probeSpriteHead(options.sprite.url, doc).catch(() => null);
    // 漫画符号颜色跟随对话主题：取主题里最鲜艳的颜色作强调色，由样式与各符号固有色混合。
    const accent = settings.mangaFx.enabled ? pickFxAccent(options.theme) : '';
    if (accent !== state.accent && motion.style && typeof motion.style.setProperty === 'function') {
        if (accent) motion.style.setProperty('--igs-fx-accent', accent);
        else motion.style.removeProperty('--igs-fx-accent');
    }
    state.accent = accent;
    setFlag(motion, 'data-igs-fx-motion', plan.style.motion === 'snappy', 'snappy');
    setFlag(motion, 'data-igs-fx-flashback', plan.ranges.flashback);
    setFlag(motion, 'data-igs-fx-dream', plan.ranges.dream);
    setFlag(motion, 'data-igs-fx-letterbox', plan.ranges.letterbox);
    setFlag(motion, 'data-igs-fx-call', Boolean(plan.ranges.call));
    state.rangeBusy = Boolean(plan.ranges.flashback || plan.ranges.dream);
    syncBusy(state);
    // 常驻节点只在内容变化时写入，避免每次渲染都产生无意义的 DOM 变更（外部 MutationObserver 也会被惊动）。
    const badgeText = plan.ranges.call ? `通话中 · ${plan.ranges.call.name}` : '';
    const badge = persistent(front, doc, 'igs-fx-call-badge');
    if (badge.textContent !== badgeText) badge.textContent = badgeText;
    if (badge.hidden !== !plan.ranges.call) badge.hidden = !plan.ranges.call;
    const eyeHold = persistent(stage, doc, 'igs-fx-eye-hold');
    if (eyeHold.hidden !== !plan.eyeHold) eyeHold.hidden = !plan.eyeHold;
    state.pageKey = plan.pageKey;
    const ctx = { state, layers, doc, snapshot, options, reduced, plan, root };
    for (const effect of plan.effects) playEffect(effect, ctx);
    return { played: plan.effects.map((effect) => effect.type), phone: Boolean(plan.ranges.call) };
}

export function cancelFxEffects(root) {
    const state = root && states.get(root);
    if (state) {
        for (const timer of state.timers) state.clear(timer);
        for (const handle of state.sounds) {
            try { handle.stop(); } catch { /* already stopped */ }
        }
        states.delete(root);
    }
    const layers = root ? findFxLayers(root) : null;
    if (!layers) return Boolean(state);
    for (const name of RANGE_ATTRS) layers.motion.removeAttribute(name);
    for (const layer of [layers.stage, layers.front]) {
        if (!layer) continue;
        for (const el of Array.from(layer.querySelectorAll('.igs-fx-transient'))) el.remove();
        for (const el of Array.from(layer.querySelectorAll('.igs-fx-call-badge, .igs-fx-eye-hold'))) el.hidden = true;
    }
    return Boolean(state);
}
