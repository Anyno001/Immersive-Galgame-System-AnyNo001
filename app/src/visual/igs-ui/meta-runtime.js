import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { FALLBACK_HEAD, HEAD_ASPECT, headToMarker, measureStage, peekSpriteHead, probeSpriteHead, resolveSymbolPlacement, spriteDrawRect } from './fx-anchor.js';
import { MANGA_SYMBOL_SVG } from './fx-symbols.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { isAncientEra } from '../../scene/fx-era.js';
import { recordMetaEvent } from './meta-digest.js';
import {
    META_BACK_DWELL_MS,
    META_IDLE_MS,
    META_POKE_PAGE_MAX,
    META_POKE_RESET_MS,
    isBackReading,
    isFurther,
    localDayKey,
    normalizeMetaFxSettings,
    pickMetaLine,
    pokeLevel,
    resolveGreeting,
    trackPageTurns,
} from './meta-settings.js';

// Meta 互动的 DOM 投影。热区与气泡挂在 #igs-fx-front（对话层之上）；热区只盖住头部，其余区域照常穿透给翻页点击层。
// 心形快捷动作按钮后插入、叠在热区之上，两者重叠时按钮优先。
const HOT_CLASS = 'igs-meta-hot';
const BUBBLE_CLASS = 'igs-meta-bubble';
const SYMBOL_CLASS = 'igs-meta-symbol';
const BUBBLE_LIFE_MS = 2400;
const SYMBOL_LIFE_MS = 1400;
const HOVER_DELAY_MS = 800;
const GREETING_DELAY_MS = 700;
const SQUASH_MS = 110;
const SQUASH_END_MS = 420;
const CLOCK_KEY = 'igs-meta-clock';
const CLOCK_LIMIT = 50;

const states = new WeakMap();

function freshSession() {
    return {
        lastPageKey: '',
        turnStamps: [],
        furthest: null,
        fired: { skip: false, back: false, idle: false },
        lastReactionAt: 0,
        clockChecked: false,
        greeting: null,
        backTimer: null,
        idleTimer: null,
        greetTimer: null,
    };
}

function getState(motion) {
    let state = states.get(motion);
    if (!state) {
        state = {
            session: freshSession(),
            hot: null,
            castHots: new Map(),
            bubble: null,
            bubbleTimer: null,
            symbols: new Set(),
            squashTimers: [],
            hoverTimer: null,
            hoveredPage: '',
            poke: { page: '', count: 0, total: 0, lastAt: 0 },
            castPokes: new Map(),
            castPokePage: '',
            probing: '',
            last: null,
            inputCleanup: null,
        };
        states.set(motion, state);
    }
    return state;
}

function removeNode(node) {
    if (node && typeof node.remove === 'function') node.remove();
    else if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function clear(timer) {
    if (timer != null) clearTimeout(timer);
}

function stop(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
}

function pageKindOf(content) {
    if (content.htmlCardPage === true) return 'card';
    return content.textType === 'chat' ? 'chat' : 'text';
}

function storageOf(doc) {
    try {
        const view = doc && doc.defaultView;
        return view && view.localStorage ? view.localStorage : null;
    } catch (error) {
        return null;
    }
}

function readClock(doc) {
    const storage = storageOf(doc);
    if (!storage) return {};
    try {
        const parsed = JSON.parse(storage.getItem(CLOCK_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeClock(doc, chatKey, patch) {
    const storage = storageOf(doc);
    if (!storage) return;
    const all = readClock(doc);
    const entry = { ...(all[chatKey] || {}), ...patch };
    delete all[chatKey];
    all[chatKey] = entry;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - CLOCK_LIMIT))) delete all[key];
    try { storage.setItem(CLOCK_KEY, JSON.stringify(all)); } catch (error) { /* */ }
}

// 立绘原图尺寸来自透明通道探测缓存；手动标定的头部自带原图高宽比，不必等探测。
function spriteGeometry(state, root, sprite, rerun) {
    const probed = peekSpriteHead(sprite.url);
    const aspect = sprite.head && Number(sprite.head.aspect) > 0 ? Number(sprite.head.aspect) : 0;
    if (!probed && !aspect && state.probing !== sprite.url && root.ownerDocument) {
        state.probing = sprite.url;
        probeSpriteHead(sprite.url, root.ownerDocument).then(() => {
            if (peekSpriteHead(sprite.url)) rerun();
        }, () => {});
    }
    const dims = probed ? { naturalW: probed.naturalW, naturalH: probed.naturalH } : aspect ? { naturalW: 1, naturalH: aspect } : null;
    if (!dims) return null;
    // 背对时头部坐标镜像（x → 1 - x），热区与气泡跟随翻转后的脸。
    const head = sprite.head || (probed && probed.head) || FALLBACK_HEAD;
    return { ...sprite, ...dims, head: sprite.flip === true ? { ...head, x: 1 - Number(head.x) } : head };
}

// 剧情头顶小字 [igs-fx:say] 的落点：不依赖 Meta 开关；头位还没探测到时返回 null，由调用方退回默认位置。
export function headTopAnchor(root, sprite) {
    const layers = ensureFxLayers(root);
    const geo = layers && layers.motion ? measureStage(layers.motion) : null;
    if (!geo || !sprite || !sprite.url) return null;
    const anchor = headAnchor(geo, spriteGeometry({}, root, sprite, () => {}));
    return anchor ? { x: Math.max(70, Math.min(geo.stageW - 70, anchor.cx)), y: Math.max(28, anchor.top - 6) } : null;
}

// 头部圆形热区（舞台像素）：{ cx, cy, d, top }。
function headAnchor(geo, sized) {
    if (!geo || !sized) return null;
    const rect = spriteDrawRect(geo.stageW, geo.stageH, sized);
    if (!rect) return null;
    const marker = headToMarker(sized.head, rect);
    if (!(marker.d > 0)) return null;
    return { ...marker, top: marker.cy - marker.d * HEAD_ASPECT / 2 };
}

function reduced(ctx) {
    return ctx.reducedMotion === true || (ctx.reducedMotion !== false && prefersReducedMotion());
}

function showBubble(state, layers, anchor, text, { angry = false } = {}) {
    if (!text || !layers.front) return;
    clear(state.bubbleTimer);
    removeNode(state.bubble);
    const bubble = layers.doc.createElement('div');
    bubble.className = `${BUBBLE_CLASS}${angry ? ' is-angry' : ''}`;
    bubble.textContent = text;
    const geo = state.last && state.last.geo;
    const stageW = geo ? geo.stageW : 0;
    const x = stageW > 0 ? Math.max(70, Math.min(stageW - 70, anchor.x)) : anchor.x;
    bubble.style.left = `${Math.round(x)}px`;
    bubble.style.top = `${Math.round(Math.max(28, anchor.y))}px`;
    layers.front.appendChild(bubble);
    state.bubble = bubble;
    state.bubbleTimer = setTimeout(() => {
        removeNode(bubble);
        if (state.bubble === bubble) state.bubble = null;
        state.bubbleTimer = null;
    }, BUBBLE_LIFE_MS);
}

function showSymbol(state, layers, kind, placement) {
    const svg = MANGA_SYMBOL_SVG[kind];
    if (!svg || !placement || !layers.front) return;
    const el = layers.doc.createElement('div');
    // 复用漫画符号的配色与弹出动画（fx-style 的 .igs-fx-symbol[data-kind]）。
    el.className = `igs-fx-symbol ${SYMBOL_CLASS}`;
    el.setAttribute('data-kind', kind);
    el.innerHTML = svg;
    el.style.left = `${placement.x}px`;
    el.style.top = `${placement.y}px`;
    el.style.setProperty('--igs-fx-size', `${placement.size}px`);
    el.style.setProperty('--igs-fx-life', `${SYMBOL_LIFE_MS}ms`);
    layers.front.appendChild(el);
    state.symbols.add(el);
    setTimeout(() => {
        removeNode(el);
        state.symbols.delete(el);
    }, SYMBOL_LIFE_MS);
}

// 气泡落在头顶上方；没有头部数据时退回漫画符号「惊讶」的落点。
function bubbleAnchor(last) {
    if (last.anchor) return { x: last.anchor.cx, y: last.anchor.top - 6 };
    const placement = last.geo ? resolveSymbolPlacement('surprise', last.geo) : null;
    return placement ? { x: placement.x, y: placement.y } : null;
}

function symbolPlacement(last, kind) {
    if (!last.geo) return null;
    return resolveSymbolPlacement(kind, last.sized ? { ...last.geo, sprite: last.sized } : last.geo);
}

// character 缺省为说话人；戳陪衬时记录被戳的陪衬，供回顾区分戳的是谁。
function noteEvent(last, type, character = last.character) {
    if (!last.settings.digest) return;
    recordMetaEvent({ type, character, hour: new Date().getHours() });
}

// 阅读行为与空闲吐槽：受冷却限制，每次打开阅读器每种最多一次；当前页没有立绘时不触发、也不消耗次数。
function remark(state, root, kind) {
    const last = state.last;
    const session = state.session;
    if (!last || !last.eligible || session.fired[kind]) return false;
    const now = Date.now();
    if (now - session.lastReactionAt < last.settings.cooldownSec * 1000) return false;
    const layers = ensureFxLayers(root);
    const anchor = bubbleAnchor(last);
    if (!layers || !anchor) return false;
    session.fired[kind] = true;
    session.lastReactionAt = now;
    showBubble(state, layers, anchor, pickMetaLine(last.settings, last.character, kind));
    if (kind === 'idle') showSymbol(state, layers, 'zzz', symbolPlacement(last, 'zzz'));
    noteEvent(last, kind);
    return true;
}

function squash(state, motion, ctx) {
    if (reduced(ctx) || !motion || !motion.style) return;
    for (const timer of state.squashTimers) clearTimeout(timer);
    // 两段过渡：in 快速压扁，out 带回弹曲线复原；只改 scale 的横纵比例，与特写 / 逼近的放大相乘。
    motion.setAttribute('data-igs-meta-poke', 'in');
    motion.style.setProperty('--igs-meta-sx', '1.06');
    motion.style.setProperty('--igs-meta-sy', '0.93');
    state.squashTimers = [
        setTimeout(() => {
            motion.setAttribute('data-igs-meta-poke', 'out');
            motion.style.setProperty('--igs-meta-sx', '1');
            motion.style.setProperty('--igs-meta-sy', '1');
        }, SQUASH_MS),
        setTimeout(() => {
            motion.removeAttribute('data-igs-meta-poke');
            motion.style.removeProperty('--igs-meta-sx');
            motion.style.removeProperty('--igs-meta-sy');
        }, SQUASH_END_MS),
    ];
}

// 陪衬压扁只作用于该陪衬元素：WAAPI 叠加 scale，不动整个舞台（舞台压扁只留给说话人）。
function squashCast(el, ctx) {
    if (!el || reduced(ctx) || typeof el.animate !== 'function') return;
    try {
        el.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,0.93)' }, { transform: 'scale(1,1)' }], {
            duration: SQUASH_END_MS, easing: 'cubic-bezier(.3,1.6,.5,1)', composite: 'add',
        });
    } catch { /* 不支持叠加合成时不压扁 */ }
}

function castElementOf(root, character) {
    const layer = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-cast') : null;
    const list = layer ? Array.from(layer.children || []) : [];
    return list.find((el) => el && el.getAttribute && el.getAttribute('data-igs-cast-char') === character
        && !(el.hasAttribute && el.hasAttribute('data-igs-cast-leaving'))) || null;
}

// 每页每个角色各自计次（说话人沿用 state.poke），上限 META_POKE_PAGE_MAX；翻页清零。
function pokeRecord(state, pageKey, castKey) {
    if (!castKey) {
        const poke = state.poke;
        if (poke.page !== pageKey) Object.assign(poke, { page: pageKey, count: 0, total: 0, lastAt: 0 });
        return poke;
    }
    if (state.castPokePage !== pageKey) {
        state.castPokePage = pageKey;
        state.castPokes.clear();
    }
    let rec = state.castPokes.get(castKey);
    if (!rec) {
        rec = { count: 0, total: 0, lastAt: 0 };
        state.castPokes.set(castKey, rec);
    }
    return rec;
}

// castKey 缺省为戳说话人；传入陪衬角色名时台词、气泡锚点、怒气符号与压扁都作用在该陪衬上。
function onPoke(state, root, castKey = '') {
    const last = state.last;
    if (!last || !last.eligible || !last.settings.poke) return;
    const target = castKey ? (last.cast || []).find((t) => t.character === castKey) : null;
    if (castKey && !target) return;
    const poke = pokeRecord(state, last.pageKey, castKey);
    const now = Date.now();
    if (poke.total >= META_POKE_PAGE_MAX) return;
    poke.count = now - poke.lastAt > META_POKE_RESET_MS ? 1 : poke.count + 1;
    poke.total += 1;
    poke.lastAt = now;
    const layers = ensureFxLayers(root);
    if (!layers) return;
    const level = pokeLevel(poke.count);
    const character = target ? target.character : last.character;
    if (target) squashCast(castElementOf(root, castKey), last.ctx);
    else squash(state, layers.motion, last.ctx);
    const anchor = target ? { x: target.anchor.cx, y: target.anchor.top - 6 } : bubbleAnchor(last);
    if (anchor) showBubble(state, layers, anchor, pickMetaLine(last.settings, character, `poke${level}`), { angry: level === 3 });
    if (level === 3) {
        const placement = target ? (last.geo ? resolveSymbolPlacement('anger', { ...last.geo, sprite: target.sized }) : null) : symbolPlacement(last, 'anger');
        showSymbol(state, layers, 'anger', placement);
    }
    noteEvent(last, 'poke', character);
    // 戳满一页上限后该角色的热区失效，直到翻页。
    const hot = target ? state.castHots.get(castKey) : state.hot;
    if (poke.total >= META_POKE_PAGE_MAX && hot) hot.classList.add('is-spent');
}

function onHover(state, root) {
    const last = state.last;
    if (!last || !last.eligible || !last.settings.hover || state.hoveredPage === last.pageKey) return;
    clear(state.hoverTimer);
    state.hoverTimer = setTimeout(() => {
        state.hoverTimer = null;
        const now = state.last;
        if (!now || now.pageKey !== last.pageKey) return;
        const layers = ensureFxLayers(root);
        if (!layers) return;
        state.hoveredPage = last.pageKey;
        showSymbol(state, layers, 'note', symbolPlacement(now, 'note'));
    }, HOVER_DELAY_MS);
}

function canHover(doc) {
    const view = doc && doc.defaultView;
    if (!view || typeof view.matchMedia !== 'function') return false;
    try { return view.matchMedia('(hover: hover)').matches === true; } catch (error) { return false; }
}

function ensureHot(state, layers, root) {
    if (state.hot && state.hot.parentNode === layers.front) return state.hot;
    const hot = layers.doc.createElement('div');
    hot.className = HOT_CLASS;
    hot.setAttribute('aria-hidden', 'true');
    hot.addEventListener('pointerdown', (event) => event.stopPropagation());
    hot.addEventListener('click', (event) => {
        stop(event);
        onPoke(state, root);
    });
    if (canHover(layers.doc)) {
        hot.addEventListener('pointerenter', () => onHover(state, root));
        hot.addEventListener('pointerleave', () => {
            clear(state.hoverTimer);
            state.hoverTimer = null;
        });
    }
    layers.front.insertBefore(hot, layers.front.firstChild);
    state.hot = hot;
    return hot;
}

function removeHot(state) {
    clear(state.hoverTimer);
    state.hoverTimer = null;
    removeNode(state.hot);
    state.hot = null;
}

// 陪衬热区：每个在台陪衬一个，点击只戳该陪衬、不触发翻页；不参与悬停。
function ensureCastHot(state, layers, root, character) {
    const existing = state.castHots.get(character);
    if (existing && existing.parentNode === layers.front) return existing;
    const hot = layers.doc.createElement('div');
    hot.className = `${HOT_CLASS} is-cast`;
    hot.setAttribute('aria-hidden', 'true');
    hot.setAttribute('data-igs-meta-cast', character);
    hot.addEventListener('pointerdown', (event) => event.stopPropagation());
    hot.addEventListener('click', (event) => {
        stop(event);
        onPoke(state, root, character);
    });
    layers.front.insertBefore(hot, layers.front.firstChild);
    state.castHots.set(character, hot);
    return hot;
}

function removeCastHots(state, keep = null) {
    for (const [character, hot] of Array.from(state.castHots)) {
        if (keep && keep.has(character)) continue;
        removeNode(hot);
        state.castHots.delete(character);
    }
}

function resetIdle(state, root) {
    const session = state.session;
    clear(session.idleTimer);
    session.idleTimer = null;
    const last = state.last;
    if (!last || !last.settings.reading || session.fired.idle) return;
    session.idleTimer = setTimeout(function fire() {
        const doc = root.ownerDocument;
        // 标签页在后台时不算「玩家发呆」，回到前台后重新计时。
        if (doc && doc.visibilityState === 'hidden') {
            session.idleTimer = setTimeout(fire, META_IDLE_MS);
            return;
        }
        session.idleTimer = null;
        remark(state, root, 'idle');
    }, META_IDLE_MS);
}

function attachInputWatch(state, root) {
    if (state.inputCleanup) return;
    const doc = root.ownerDocument;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const handler = () => resetIdle(state, root);
    const types = ['pointerdown', 'keydown', 'wheel'];
    for (const type of types) doc.addEventListener(type, handler, { passive: true, capture: true });
    state.inputCleanup = () => {
        for (const type of types) doc.removeEventListener(type, handler, { capture: true });
    };
}

function trackPage(state, root, last) {
    const session = state.session;
    if (session.lastPageKey === last.pageKey) return;
    const turned = Boolean(session.lastPageKey);
    session.lastPageKey = last.pageKey;
    clear(session.backTimer);
    session.backTimer = null;
    if (!last.settings.reading) return;
    const position = { messageId: last.messageId, index: last.index };
    if (isFurther(session.furthest, position)) session.furthest = position;
    if (!turned) return;
    const tracked = trackPageTurns(session.turnStamps, Date.now());
    session.turnStamps = tracked.stamps;
    if (tracked.skipping && remark(state, root, 'skip')) return;
    if (!session.fired.back && isBackReading(session.furthest, position)) {
        session.backTimer = setTimeout(() => {
            session.backTimer = null;
            if (state.last && state.last.pageKey === last.pageKey) remark(state, root, 'back');
        }, META_BACK_DWELL_MS);
    }
}

// 每日首次问候：本次打开阅读器第一次渲染时读出上次打开时间并立刻写回；问候等到第一个有立绘的页面才弹。
function trackClock(state, root, last, chatKey) {
    const session = state.session;
    if (!last.settings.clock) return;
    const doc = root.ownerDocument;
    if (!session.clockChecked) {
        session.clockChecked = true;
        const now = new Date();
        const entry = readClock(doc)[chatKey] || {};
        writeClock(doc, chatKey, { last: now.getTime() });
        if (entry.greeted !== localDayKey(now)) {
            session.greeting = resolveGreeting(last.settings, { now, lastSeen: entry.last, ancient: last.ancient });
        }
    }
    if (!session.greeting || !last.eligible || session.greetTimer != null) return;
    const greeting = session.greeting;
    session.greetTimer = setTimeout(() => {
        session.greetTimer = null;
        const current = state.last;
        const layers = ensureFxLayers(root);
        const anchor = current && current.eligible ? bubbleAnchor(current) : null;
        if (!layers || !anchor || session.greeting !== greeting) return;
        session.greeting = null;
        session.lastReactionAt = Date.now();
        writeClock(doc, chatKey, { greeted: localDayKey(new Date()) });
        showBubble(state, layers, anchor, pickMetaLine(current.settings, current.character, greeting.kind, Math.random, greeting.vars || {}));
        if (greeting.kind === 'greetBirthday' || greeting.kind === 'greetFestival') showSymbol(state, layers, 'heart', symbolPlacement(current, 'heart'));
    }, GREETING_DELAY_MS);
}

// ctx.sprite 为 reader-dom-render 算好的 fxSprite（编辑立绘时为 null）；ctx.chatId 用于按聊天记录上次打开时间。
export function applyMetaFx(root, snapshot, ctx = {}) {
    const content = (snapshot && snapshot.content) || {};
    const reader = (snapshot && snapshot.readerSettings) || {};
    const settings = normalizeMetaFxSettings(reader.metaFx);
    if (!settings.enabled) {
        closeMetaFx(root);
        return { enabled: false };
    }
    const layers = ensureFxLayers(root);
    if (!layers || !layers.motion) return { enabled: true, hot: false };
    const state = getState(layers.motion);
    const sprite = ctx.sprite && ctx.sprite.url ? ctx.sprite : null;
    const eligibleBase = Boolean(sprite) && pageKindOf(content) === 'text' && content.sceneNsfw !== true;
    const geo = measureStage(layers.motion);
    const rerun = () => {
        if (states.get(layers.motion) === state && state.last && state.last.snapshot === snapshot) applyMetaFx(root, snapshot, ctx);
    };
    const sized = eligibleBase && geo ? spriteGeometry(state, root, sprite, rerun) : null;
    const anchor = headAnchor(geo, sized);
    const last = {
        snapshot,
        ctx,
        settings,
        geo,
        sized,
        anchor,
        eligible: eligibleBase && Boolean(geo),
        character: String(content.spriteCharacter || content.speaker || '').trim(),
        pageKey: `${snapshot && snapshot.messageId}:${content.currentIndex}`,
        messageId: snapshot && snapshot.messageId,
        index: Number(content.currentIndex) || 0,
        ancient: isAncientEra(reader._sceneAssets),
    };
    state.last = last;
    attachInputWatch(state, root);
    trackPage(state, root, last);
    resetIdle(state, root);
    trackClock(state, root, last, String(ctx.chatId || '_'));

    const showHot = last.eligible && Boolean(anchor) && (settings.poke || settings.hover);
    if (!showHot) {
        removeHot(state);
        removeCastHots(state);
        return { enabled: true, hot: false };
    }
    const hot = ensureHot(state, layers, root);
    hot.style.left = `${Math.round(anchor.cx - anchor.d / 2)}px`;
    hot.style.top = `${Math.round(anchor.top)}px`;
    hot.style.width = `${Math.round(anchor.d)}px`;
    hot.style.height = `${Math.round(anchor.d * HEAD_ASPECT)}px`;
    const spent = state.poke.page === last.pageKey && state.poke.total >= META_POKE_PAGE_MAX;
    hot.classList.toggle('is-spent', spent || !settings.poke);
    // 戳陪衬（stageCast.castReact 子开关）：每个在台陪衬按自己的头部几何放热区。
    const castCfg = reader.stageCast && typeof reader.stageCast === 'object' ? reader.stageCast : {};
    const castPoke = settings.poke && castCfg.enabled === true && castCfg.castReact === true && Array.isArray(ctx.cast);
    const castTargets = [];
    if (castPoke && geo) {
        for (const m of ctx.cast) {
            if (!m || !m.url || !m.character) continue;
            const castSized = spriteGeometry(state, root, m, rerun);
            const castAnchor = headAnchor(geo, castSized);
            if (castAnchor) castTargets.push({ character: String(m.character), sized: castSized, anchor: castAnchor });
        }
    }
    last.cast = castTargets;
    removeCastHots(state, new Set(castTargets.map((t) => t.character)));
    for (const t of castTargets) {
        const el = ensureCastHot(state, layers, root, t.character);
        el.style.left = `${Math.round(t.anchor.cx - t.anchor.d / 2)}px`;
        el.style.top = `${Math.round(t.anchor.top)}px`;
        el.style.width = `${Math.round(t.anchor.d)}px`;
        el.style.height = `${Math.round(t.anchor.d * HEAD_ASPECT)}px`;
        const rec = state.castPokePage === last.pageKey ? state.castPokes.get(t.character) : null;
        el.classList.toggle('is-spent', Boolean(rec && rec.total >= META_POKE_PAGE_MAX));
    }
    return { enabled: true, hot: true, anchor, castHots: castTargets.length };
}

// 关闭阅读器或关掉总开关：清热区、气泡、计时器与本次会话的计数。
export function closeMetaFx(root) {
    const layers = findFxLayers(root);
    const state = layers && layers.motion ? states.get(layers.motion) : null;
    if (!state) return;
    const session = state.session;
    for (const timer of [session.backTimer, session.idleTimer, session.greetTimer, state.bubbleTimer, ...state.squashTimers]) clear(timer);
    removeHot(state);
    removeCastHots(state);
    removeNode(state.bubble);
    for (const el of state.symbols) removeNode(el);
    if (state.inputCleanup) state.inputCleanup();
    const motion = layers.motion;
    if (motion && typeof motion.removeAttribute === 'function') motion.removeAttribute('data-igs-meta-poke');
    if (motion && motion.style && typeof motion.style.removeProperty === 'function') {
        motion.style.removeProperty('--igs-meta-sx');
        motion.style.removeProperty('--igs-meta-sy');
    }
    states.delete(motion);
}
