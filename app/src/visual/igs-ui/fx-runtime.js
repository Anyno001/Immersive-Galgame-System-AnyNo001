import { worldSkinOf } from '../../scene/worldview.js';

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
import { ANCIENT_SYMBOL_PLACEMENT, ANCIENT_SYMBOL_SVG, MANGA_SYMBOL_SVG, pickFxAccent, speedLinesImage, warmSpeedLines } from './fx-symbols.js';
import { FALLBACK_HEAD, HEAD_ASPECT, measureStage, peekSpriteHead, probeSpriteHead, resolveSymbolPlacement, waitSpriteHead } from './fx-anchor.js';
import { planEatBeats } from './fx-eat-model.js';
import { normalizeDailyFxSettings } from './fx-daily-model.js';

export const FX_LIFETIME_MS = Object.freeze({
    symbol: 1000, speedLines: 700, heartbeat: 2400, flash: 800,
    favor: 2400, notify: 3300, eye: 1600, call: 2400, 'call-end': 1800, nickname: 2400, voicemail: 4200, contact: 3000, cutin: 1400, promise: 3200, 'promise-due': 3600,
});
export const TITLE_CARD_LIFETIME_MS = Object.freeze({ fast: 1800, medium: 2700, slow: 4200 });
const SEEN_LIMIT = 256;
const FAVOR_LIMIT = 256;
const MIN_FAVOR_DELTA = 1;
// 停留时间只拉长「出现—停留—消失」类演出；心跳、闪白、睁眼与来电跟音效节奏绑定，不随档位变化。
const HOLDABLE = new Set(['symbol', 'speedLines', 'favor', 'notify', 'call-end', 'nickname', 'voicemail', 'contact', 'cutin', 'promise', 'promise-due']);
// 脸部特写分格的高宽比（面板高 / 面板宽），与 .igs-fx-cutin-face 的 aspect-ratio 一致。
export const CUTIN_RATIO = 0.34;
// 头宽占分格宽度的比例的倒数系数：头约占分格 42%。
const CUTIN_HEAD_SPAN = 2.4;

// 纯函数：按头部标定（相对原图）算出 background-size（占分格宽度 %）与 background-position（%），
// 让头部落在分格中心。只做 CSS 换算，不读像素。aspect 为原图高宽比，缺失时按常见立绘 1.6。
export function resolveCutinCrop(head, aspect, ratio = CUTIN_RATIO) {
    const h = head && Number(head.w) > 0 ? head : FALLBACK_HEAD;
    const a = Number(aspect) > 0 ? Number(aspect) : 1.6;
    const k = 1 / (Math.max(0.02, Number(h.w)) * CUTIN_HEAD_SPAN);
    const imgH = k * a;
    const px = Math.abs(1 - k) < 1e-6 ? 50 : ((0.5 - Number(h.x) * k) / (1 - k)) * 100;
    const centerY = Number(h.top) * imgH + Number(h.w) * k * HEAD_ASPECT / 2;
    const py = Math.abs(ratio - imgH) < 1e-6 ? 50 : ((ratio / 2 - centerY) / (ratio - imgH)) * 100;
    const round = (n) => Math.round(n * 100) / 100;
    return { size: round(k * 100), x: round(px), y: round(py) };
}
const RANGE_ATTRS = Object.freeze(['data-igs-fx-era', 'data-igs-fx-flashback', 'data-igs-fx-dream', 'data-igs-fx-letterbox', 'data-igs-fx-whisper', 'data-igs-fx-movie', 'data-igs-fx-lightsoff', 'data-igs-fx-umbrella', 'data-igs-fx-call', 'data-igs-fx-call-remote', 'data-igs-fx-call-sprite', 'data-igs-fx-call-split', 'data-igs-fx-motion', 'data-igs-fx-busy', 'data-igs-fx-presentation', 'data-igs-fx-eat']);
// 进食分镜的立绘动作：挂在 #igs-stage-motion 上，时长与 fx-eat-style 的动画一致。
const EAT_MOTION_ATTR = 'data-igs-fx-eat';
const EAT_MOTION_MS = Object.freeze({ bite: 400, chew: 1100, hop: 520, shake: 480, dip: 760, sway: 1300 });
const CALL_PERSISTENT = '.igs-fx-call-badge, .igs-fx-eye-hold, .igs-fx-call-pip, .igs-fx-video, .igs-fx-call-split';
const VIDEO_CLOSE_MS = 520;
const PIP_OUT_MS = 320;
const SPLIT_OUT_MS = 420;
const CALL_LOG_LIMIT = 64;
// 来电屏停留时长按结局区分：拒接很快被按掉，未接要响满几轮才放弃。
const CALL_SCREEN_MS = Object.freeze({ answer: 2400, missed: 3400, reject: 1700 });
const CALL_END_SOUND = Object.freeze({ end: 'hangup', cut: 'hangup', missed: 'missed', reject: 'reject' });
// 挂断胶囊文案：未接与拒接按来电 / 拨出区分视角；正常挂断与对方挂断附带通话时长。
const CALL_END_TEXT = Object.freeze({
    end: { in: '通话结束', out: '通话结束' },
    cut: { in: '对方已挂断', out: '对方已挂断' },
    missed: { in: '未接来电', out: '无人接听' },
    reject: { in: '已拒接', out: '对方已拒接' },
});
const CALL_SCREEN_STATE = Object.freeze({
    'in:voice': '来电', 'in:video': '视频通话邀请', 'out:voice': '正在呼叫…', 'out:video': '正在发起视频通话…',
});
// 在对话框下方播放的全屏演出：播放期间给舞台挂 data-igs-fx-busy，样式暂停对话框毛玻璃，
// 否则 backdrop-filter 每帧都要对变化中的底图重新模糊。
const BUSY_EFFECTS = new Set(['speedLines', 'heartbeat', 'eye']);
const EMPTY_FX = Object.freeze({ instants: [], call: null, flashback: false, dream: false, letterbox: false, whisper: false });

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

export function enterPage(memory, pageKey) {
    if (memory.visitKey === pageKey) return;
    memory.visitKey = pageKey;
    memory.visitSeen = new Set();
}

// 同一次停留内的重绘永不重播；replay 开启时离开再翻回该页会重新播放。
export function markPage(memory, key, replay) {
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
export function planPageFx(snapshot, memory, baseline = favorBaseline, normalized = null, context = {}) {
    const content = (snapshot && snapshot.content) || {};
    const settings = normalized || normalizeFxReaderSettings(snapshot && snapshot.readerSettings);
    const hasSprite = context.hasSprite !== false;
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
        if (symbol && hasSprite && once(`symbol:${emotionKey}`)) effects.push({ type: 'symbol', kind: symbol });
        if (pickSpeedLines(emotion, settings.mangaFx) && once(`speed:${emotionKey}`)) effects.push({ type: 'speedLines' });
        const tone = pickHeartbeat(emotion, settings.heartbeatFx);
        if (tone && once(`heart:${emotionKey}`)) effects.push({ type: 'heartbeat', tone });
        if (pickFlash(emotion, settings.flashFx) && once(`flash:${emotionKey}`)) effects.push({ type: 'flash' });
    }
    if (!special) planTitle({ ...content, messageId }, settings.titleCard, memory, effects);
    // 进食分镜：日常演出里开了「吃东西」时，本页的 eat 标签在说话人头部逐拍播放（不受情绪符号开关影响）。
    const daily = normalizeDailyFxSettings(snapshot && snapshot.readerSettings && snapshot.readerSettings.dailyFx);
    if (daily.enabled && daily.eat && !special && !content.sceneNsfw && hasSprite) {
        const eat = (content.fx && Array.isArray(content.fx.daily) ? content.fx.daily : []).find((item) => item && item.type === 'eat' && item.food);
        if (eat && once(`eat:${pageKey}:${eat.food}`)) effects.push({ type: 'eat', food: eat.food, reaction: eat.reaction || '' });
    }

    if (settings.favorToast.enabled && content.statusHud && content.statusHud.character) {
        for (const change of diffFavorMetrics(baseline, content.statusHud.character, content.statusHud.metrics)) {
            effects.push({ type: 'favor', ...change });
        }
    }

    const tagKinds = enabledFxTagKinds(settings.fxTags);
    const fx = filterFxByKinds(content.fx || EMPTY_FX, tagKinds);
    // 悄悄话区间单独判定，不改 filterFxByKinds 的既有返回结构。
    const whisper = tagKinds.includes('whisper') && Boolean((content.fx || EMPTY_FX).whisper);
    // 区间氛围同样单独判定：看电影 / 关灯 / 撑伞。
    const rawFx = content.fx || EMPTY_FX;
    const atmos = {
        movie: tagKinds.includes('movie') && Boolean(rawFx.movie),
        lightsOff: tagKinds.includes('light') && Boolean(rawFx.lightsOff),
        umbrella: tagKinds.includes('umbrella') && Boolean(rawFx.umbrella),
    };
    // 约定到期提醒：每个楼层每条约定只提醒一次（键不含页号），首个渲染页播放。
    const due = tagKinds.includes('promise') && Array.isArray(rawFx.promiseDue) ? rawFx.promiseDue : [];
    for (const p of due) {
        if (p && p.time && once(`promise-due:${messageId}:${p.time}|${p.place || ''}`)) effects.push({ type: 'promise-due', time: p.time, place: p.place || '' });
    }
    let eyeHold = false;
    for (const item of fx.instants) {
        if (item.kind === 'eye' && item.mode === 'close') eyeHold = true;
        if (once(`fx:${pageKey}:${item.kind}:${JSON.stringify(item)}`)) effects.push({ ...item, type: item.kind });
    }
    return {
        pageKey,
        effects,
        ranges: { flashback: fx.flashback, dream: fx.dream, letterbox: fx.letterbox, call: fx.call },
        whisper,
        atmos,
        callEnd: fx.instants.find((item) => item.kind === 'call-end') || null,
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
        state = { memory: createFxMemory(), timers: new Set(), sounds: [], pageKey: '', busy: 0, rangeBusy: false, busyOn: false, presentation: 0, presentationOn: false, motion: null, accent: null, callStart: null, timerKey: '', pipSig: '', pipLast: null, split: null, video: null, ring: null, logKey: '', callLog: new Map() };
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
    if (layers.motion && typeof layers.motion.removeAttribute === 'function') layers.motion.removeAttribute(EAT_MOTION_ATTR);
    for (const layer of [layers.stage, layers.front]) {
        if (!layer) continue;
        for (const el of Array.from(layer.querySelectorAll('.igs-fx-transient'))) el.remove();
    }
}

// 定位要读舞台几何：推迟到下一帧，避免在本次渲染刚写完 DOM 时强制同步排版。
export function nextFrame(doc, fn) {
    const view = doc && doc.defaultView;
    if (view && typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(fn);
    else fn();
}

function sound(state, kind, settings, options, text) {
    const handle = playFxSfx(kind, settings, { audioScheduler: options.audioScheduler, text });
    if (!handle || typeof handle.stop !== 'function') return null;
    state.sounds.push(handle);
    if (state.sounds.length > 8) state.sounds.shift();
    return handle;
}

function stopRing(state) {
    if (!state.ring) return;
    try { state.ring.stop(); } catch { /* already stopped */ }
    state.ring = null;
}

export function resolveAvatar(name, snapshot, options) {
    const assets = (snapshot.readerSettings && snapshot.readerSettings._sceneAssets) || {};
    const key = resolveCharacterKey(assets.characters || {}, assets.characterAliases, name) || name;
    const url = resolveStatusAvatar(assets.statusAvatars, key);
    if (!url) return '';
    return typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(url) || '' : url;
}

function callFace(doc, name, avatar) {
    if (!avatar) return node(doc, 'igs-fx-call-avatar is-initial', Array.from(name)[0] || '?');
    const face = doc.createElement('img');
    face.className = 'igs-fx-call-avatar';
    face.src = avatar;
    face.alt = name;
    return face;
}

function callDir(call) {
    return call && call.dir === 'out' ? 'out' : 'in';
}

function callMode(call) {
    return call && call.mode === 'video' ? 'video' : 'voice';
}

// 同页就已未接 / 拒接时，来电屏不给接听按钮，改显示红色挂断键并在末尾亮出结局：
// 由主角这边按掉的（拒接来电、拨出没人接而放弃）挂断键会被按下，其余是铃声自然停下。
function callOutcome(plan) {
    const end = plan.effects.find((item) => item.type === 'call-end');
    return end && (end.reason === 'missed' || end.reason === 'reject') ? end.reason : 'answer';
}

function renderCallScreen(doc, call, avatar, outcome) {
    const dir = callDir(call);
    const mode = callMode(call);
    const screen = node(doc, 'igs-fx-call-screen');
    screen.setAttribute('data-dir', dir);
    screen.setAttribute('data-mode', mode);
    const ring = node(doc, 'igs-fx-call-ring');
    ring.appendChild(callFace(doc, call.name, avatar));
    screen.appendChild(ring);
    screen.appendChild(node(doc, 'igs-fx-call-name', call.name));
    screen.appendChild(node(doc, 'igs-fx-call-state', CALL_SCREEN_STATE[`${dir}:${mode}`]));
    if (outcome === 'answer') {
        screen.appendChild(node(doc, 'igs-fx-call-hint', dir === 'out' ? '点击跳过' : '点击接听'));
        return screen;
    }
    screen.setAttribute('data-outcome', outcome);
    screen.appendChild(node(doc, 'igs-fx-call-outcome', CALL_END_TEXT[outcome][dir]));
    const decline = node(doc, 'igs-fx-call-decline');
    decline.innerHTML = VIDEO_ICONS.end;
    screen.appendChild(decline);
    setFlag(screen, 'data-press', (dir === 'in') === (outcome === 'reject'));
    return screen;
}

function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function callEndText(effect, durationMs) {
    const reason = Object.hasOwn(CALL_END_TEXT, effect.reason) ? effect.reason : 'end';
    const base = CALL_END_TEXT[reason][callDir(effect)];
    const text = (reason === 'end' || reason === 'cut') && durationMs >= 1000 ? `${base} ${formatDuration(durationMs)}` : base;
    return effect.name ? `${effect.name} · ${text}` : text;
}

// 手动标定的头部优先于透明通道探测；原图尺寸优先取探测值，探测失败时用标定时记下的高宽比。
export function spriteGeometry(sprite, probed) {
    if (!sprite) return null;
    const manual = sprite.head || null;
    const naturalW = probed ? probed.naturalW : 1;
    const naturalH = probed ? probed.naturalH : manual && manual.aspect;
    if (!(naturalW > 0) || !(naturalH > 0)) return null;
    // 背对时整张立绘绕图中心水平镜像：头部只做坐标镜像（x → 1 - x），符号跟随翻转后的脸。
    const head = manual || (probed && probed.head) || null;
    return { posX: sprite.posX, posY: sprite.posY, scale: sprite.scale, naturalW, naturalH, head: sprite.flip === true && head ? { ...head, x: 1 - Number(head.x) } : head };
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
        const placeKind = (ctx.ancient && ANCIENT_SYMBOL_PLACEMENT[effect.kind]) || effect.kind;
        placeSymbol(el, placeKind, layers.motion, sprite, head);
        el.removeAttribute('data-pending');
    });
}

function playSymbol(effect, ctx, life, target) {
    const { state, doc, options, plan, root } = ctx;
    const el = node(doc, 'igs-fx-symbol');
    el.setAttribute('data-kind', effect.kind);
    const ancientSvg = ctx.ancient ? ANCIENT_SYMBOL_SVG[effect.kind] : '';
    if (ancientSvg) el.setAttribute('data-era', 'ancient');
    el.innerHTML = ancientSvg || MANGA_SYMBOL_SVG[effect.kind] || '';
    if (effect.onoma) el.appendChild(node(doc, 'igs-fx-onoma', effect.onoma));
    // 陪衬反应的符号带 castTarget（与 options.cast 条目同结构），落在该陪衬的头部；否则落在说话人。
    if (effect.castTarget && effect.castTarget.character) el.setAttribute('data-igs-fx-cast', effect.castTarget.character);
    const source = effect.castTarget || options.sprite;
    const sprite = source && source.url ? source : null;
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

// 进食分镜：按节拍逐个弹出漫画符号（带拟声字），立绘跟着做小动作；翻页时随本页计时器一起收掉。
function playEat(effect, ctx) {
    const { state, layers, reduced } = ctx;
    const motion = layers.motion;
    for (const beat of planEatBeats(effect, { reduced })) {
        track(state, () => {
            playSymbol({ type: 'symbol', kind: beat.kind, onoma: beat.onoma }, ctx, beat.life);
            if (!beat.motion || !motion || typeof motion.setAttribute !== 'function') return;
            motion.setAttribute(EAT_MOTION_ATTR, beat.motion);
            track(state, () => {
                if (motion.getAttribute(EAT_MOTION_ATTR) === beat.motion) motion.removeAttribute(EAT_MOTION_ATTR);
            }, EAT_MOTION_MS[beat.motion] || 600);
        }, beat.at);
    }
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

// 挂断记录由 syncCallLog 常驻在挂断所在页；首次播放时掐掉铃声、给记录加入场动画：
// 接着通话中徽章挂断的从绿色徽章变色收起，同页先来电的等来电屏播完再出现。
function playCallEnd(effect, ctx, life) {
    const { state, layers, plan, options, doc } = ctx;
    const log = layers.front.querySelector('.igs-fx-call-end');
    const ringing = plan.effects.some((item) => item.type === 'call');
    if (log && ringing) log.setAttribute('data-wait', '1');
    const show = () => {
        stopRing(state);
        if (log && log.parentNode) {
            log.removeAttribute('data-wait');
            if (log.style && typeof log.style.setProperty === 'function') log.style.setProperty('--igs-fx-life', `${life}ms`);
            log.setAttribute('data-fresh', ringing ? 'screen' : 'badge');
        }
        if (callMode(effect) === 'video') spawn(state, layers.stage, node(doc, 'igs-fx-video-close'), VIDEO_CLOSE_MS);
        sound(state, CALL_END_SOUND[effect.reason] || 'hangup', plan.sound, options);
    };
    if (ringing) track(state, show, CALL_SCREEN_MS[callOutcome(plan)]);
    else show();
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
    } else if (effect.type === 'eat') {
        playEat(effect, ctx);
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
        // 古代背景是一条宣纸竖幅：地点、时间竖排，末尾朱印；竖排里不要「——」引线。
        const el = node(doc, (ctx.ancient ? 'igs-fx-title-card is-ancient' : 'igs-fx-title-card') + (ctx.worldSkin || ''));
        const sub = ctx.ancient && effect.sub ? effect.sub.replace(/^——\s*/, '') : effect.sub;
        if (effect.main) el.appendChild(node(doc, 'igs-fx-title-main', effect.main));
        if (sub) el.appendChild(node(doc, 'igs-fx-title-sub', sub));
        spawn(state, layers.front, el, life, false, true);
    } else if (effect.type === 'favor') {
        const up = effect.delta > 0;
        const el = node(doc, 'igs-fx-favor', `${effect.character} ${effect.label} ${up ? '↑' : '↓'} ${up ? '+' : ''}${effect.delta}`);
        el.setAttribute('data-dir', up ? 'up' : 'down');
        const stack = persistent(layers.front, doc, 'igs-fx-favor-stack');
        spawn(state, stack, el, life);
    } else if (effect.type === 'notify') {
        // 古代背景是家仆通报：右侧滑入一张竖排纸条，朱印「禀」字打头，梆子两声。
        const el = node(doc, (ctx.ancient ? 'igs-fx-notify is-ancient' : 'igs-fx-notify') + (ctx.worldSkin || ''));
        if (ctx.ancient) el.appendChild(node(doc, 'igs-fx-notify-seal', '禀'));
        if (effect.sender) el.appendChild(node(doc, 'igs-fx-notify-sender', effect.sender));
        el.appendChild(node(doc, 'igs-fx-notify-text', effect.text));
        spawn(state, layers.front, el, life);
        sound(state, ctx.notifySound || (ctx.ancient ? 'notify-ancient' : 'notify'), plan.sound, options);
    } else if (effect.type === 'nickname') {
        // 称呼变化复用数值提示的堆叠栏，与好感变化同一视觉语言。
        const el = node(doc, 'igs-fx-favor igs-fx-nickname', `${effect.name}开始叫你『${effect.nick}』了`);
        el.setAttribute('data-dir', 'up');
        spawn(state, persistent(layers.front, doc, 'igs-fx-favor-stack'), el, life);
    } else if (effect.type === 'voicemail') {
        // 留言条：静态波形 + 内容整段写入，CSS 遮罩从左到右揭示，播放期不改写文本节点。
        const el = node(doc, 'igs-fx-voicemail');
        el.setAttribute('role', 'status');
        const head = node(doc, 'igs-fx-voicemail-head');
        head.appendChild(node(doc, 'igs-fx-voicemail-wave'));
        head.appendChild(node(doc, 'igs-fx-voicemail-sender', effect.sender ? `${effect.sender} 的语音留言` : '语音留言'));
        el.appendChild(head);
        el.appendChild(node(doc, 'igs-fx-voicemail-text', effect.text));
        spawn(state, layers.front, el, life);
        sound(state, 'notify', plan.sound, options);
    } else if (effect.type === 'contact') {
        // 「已添加好友」卡片：只播放演出，不写线上聊天联系人（那是用户持久化设置）。
        const el = node(doc, 'igs-fx-notify igs-fx-contact');
        el.setAttribute('role', 'status');
        el.appendChild(callFace(doc, effect.name, resolveAvatar(effect.name, snapshot, options)));
        el.appendChild(node(doc, 'igs-fx-notify-sender', effect.name));
        el.appendChild(node(doc, 'igs-fx-notify-text', '已添加为好友'));
        spawn(state, layers.front, el, life);
        sound(state, 'notify', plan.sound, options);
    } else if (effect.type === 'cutin') {
        // 本期只支持当前说话人：写了别的角色或没有立绘时不播放，不用占位图。
        const sprite = options.sprite && options.sprite.url ? options.sprite : null;
        const speaker = snapshot.content && snapshot.content.speaker;
        if (!sprite || (effect.name && !sameCharacter(snapshot, effect.name, speaker))) return;
        const probed = peekSpriteHead(sprite.url);
        const head = sprite.head || (probed && probed.head) || FALLBACK_HEAD;
        const aspect = probed && probed.naturalW > 0 ? probed.naturalH / probed.naturalW : (sprite.head && sprite.head.aspect);
        const crop = resolveCutinCrop(head, aspect);
        const el = node(doc, reduced ? 'igs-fx-cutin is-reduced' : 'igs-fx-cutin');
        const face = node(doc, 'igs-fx-cutin-face');
        if (face.style) {
            const safeUrl = String(sprite.url).replace(/["\\]/g, (ch) => `\\${ch}`);
            face.style.backgroundImage = `url("${safeUrl}")`;
            face.style.backgroundSize = `${crop.size}% auto`;
            face.style.backgroundPosition = `${crop.x}% ${crop.y}%`;
        }
        el.appendChild(face);
        spawn(state, layers.front, el, life);
    } else if (effect.type === 'sfx') {
        // 中文拟声大字观感生硬，只保留音效。
        sound(state, 'onomatopoeia', plan.sound, options, effect.text);
    } else if (effect.type === 'light') {
        // 关灯那一页的一次性提示；区间压暗仍由 data-igs-fx-lightsoff 驱动。
        // 古代背景为「吹灯」：烛火一晃熄灭、升起青烟，音效换成吹气风声；减少动态效果时只留压暗与音效。
        if (ctx.ancient && !reduced) {
            const candle = node(doc, 'igs-fx-candle');
            candle.setAttribute('aria-hidden', 'true');
            candle.appendChild(node(doc, 'igs-fx-candle-smoke'));
            candle.appendChild(node(doc, 'igs-fx-candle-flame'));
            candle.appendChild(node(doc, 'igs-fx-candle-body'));
            spawn(state, layers.stage, candle, life);
        }
        sound(state, 'onomatopoeia', plan.sound, options, ctx.ancient ? '呼' : '啪');
    } else if (effect.type === 'promise') {
        // 约定便笺：只播放卡片，不写存储；古代背景换宣纸竖排「立契」，印文「契」。
        const el = node(doc, (ctx.ancient ? 'igs-fx-promise is-ancient' : 'igs-fx-promise') + (ctx.worldSkin || ''));
        el.setAttribute('role', 'status');
        el.appendChild(node(doc, 'igs-fx-promise-title', ctx.ancient ? '立契' : ctx.worldview === 'magic' ? '魔法契约' : '约定'));
        el.appendChild(node(doc, 'igs-fx-promise-text', effect.place ? [effect.time, effect.place].join(' · ') : effect.time));
        el.appendChild(node(doc, 'igs-fx-promise-seal', ctx.ancient ? '契' : ctx.worldview === 'magic' ? '誓' : '约'));
        spawn(state, layers.front, el, life);
        sound(state, ctx.notifySound || (ctx.ancient ? 'notify-ancient' : 'notify'), plan.sound, options);
    } else if (effect.type === 'eye') {
        if (effect.mode === 'open' && !reduced) spawn(state, layers.stage, node(doc, 'igs-fx-eye is-open'), life, busy);
    } else if (effect.type === 'promise-due') {
        // 到期提醒复用约定便笺，标题换成当天提醒；古代背景为「契期」。
        const el = node(doc, (ctx.ancient ? 'igs-fx-promise is-due is-ancient' : 'igs-fx-promise is-due') + (ctx.worldSkin || ''));
        el.setAttribute('role', 'status');
        el.appendChild(node(doc, 'igs-fx-promise-title', ctx.ancient ? '契期已至' : ctx.worldview === 'magic' ? '誓约之日已至' : '今天是约定的日子'));
        el.appendChild(node(doc, 'igs-fx-promise-text', effect.place ? [effect.time, effect.place].join(' · ') : effect.time));
        el.appendChild(node(doc, 'igs-fx-promise-seal', ctx.ancient ? '契' : ctx.worldview === 'magic' ? '誓' : '约'));
        spawn(state, layers.front, el, life);
        sound(state, ctx.notifySound || (ctx.ancient ? 'notify-ancient' : 'notify'), plan.sound, options);
    } else if (effect.type === 'call') {
        const outcome = callOutcome(plan);
        const screen = spawn(state, layers.front, renderCallScreen(doc, effect, resolveAvatar(effect.name, snapshot, options), outcome), CALL_SCREEN_MS[outcome]);
        screen.addEventListener('click', (event) => {
            event.stopPropagation();
            screen.remove();
            if (outcome === 'answer') stopRing(state);
        }, { once: true });
        const out = callDir(effect) === 'out';
        const ring = outcome === 'answer' ? (out ? 'ringback' : 'ring') : (out ? 'ringback-long' : 'ring-long');
        stopRing(state);
        state.ring = sound(state, ring, plan.sound, options);
    } else if (effect.type === 'call-end') {
        playCallEnd(effect, ctx, life);
    }
}

function clearChildren(el) {
    for (const child of Array.from(el.children || [])) child.remove();
}

function sameCharacter(snapshot, a, b) {
    const x = text(a);
    const y = text(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const assets = (snapshot.readerSettings && snapshot.readerSettings._sceneAssets) || {};
    const characters = assets.characters || {};
    const key = (name) => resolveCharacterKey(characters, assets.characterAliases, name) || name;
    return key(x) === key(y);
}

// 计时由 CSS 计数器动画走表：只在徽章重新出现或换了一通电话时写一次起点，之后不再每秒改 DOM。
function syncCallBadge(state, front, doc, call, key, now) {
    const badge = persistent(front, doc, 'igs-fx-call-badge');
    const label = persistent(badge, doc, 'igs-fx-call-label');
    const timer = persistent(badge, doc, 'igs-fx-call-timer');
    const labelText = call ? `${callMode(call) === 'video' ? '视频通话' : '通话中'} · ${call.name}` : '';
    if (label.textContent !== labelText) label.textContent = labelText;
    if (call && (badge.hidden || state.timerKey !== key)) {
        if (timer.style && typeof timer.style.setProperty === 'function') {
            timer.style.setProperty('--igs-fx-call-delay', `${((state.callStart.start - now) / 1000).toFixed(2)}s`);
        }
        state.timerKey = key;
    }
    if (!call) state.timerKey = '';
    if (badge.hidden !== !call) badge.hidden = !call;
}

// 语音通话时对方不在场：右上角圆形头像小窗代替立绘，对方说话时头像外圈跟着声波跳动。
// 收起时常驻小窗立即隐藏，另放一个临时替身播缩小淡出，翻页清理瞬时演出时替身一并收走。
function syncCallPip(state, stage, doc, call, avatar, speaking, reduced) {
    const existing = stage.querySelector('.igs-fx-call-pip');
    if (!call && !existing) return;
    const pip = existing || persistent(stage, doc, 'igs-fx-call-pip');
    const sig = call ? `${call.name}\n${avatar}` : '';
    if (call && state.pipSig !== sig) {
        clearChildren(pip);
        pip.appendChild(callFace(doc, call.name, avatar));
        pip.appendChild(node(doc, 'igs-fx-call-pip-name', call.name));
    }
    state.pipSig = sig;
    if (call) state.pipLast = { name: call.name, avatar };
    else if (!pip.hidden && state.pipLast && !reduced) {
        const ghost = node(doc, 'igs-fx-call-pip-out');
        ghost.appendChild(callFace(doc, state.pipLast.name, state.pipLast.avatar));
        ghost.appendChild(node(doc, 'igs-fx-call-pip-name', state.pipLast.name));
        spawn(state, stage, ghost, PIP_OUT_MS);
    }
    setFlag(pip, 'data-speaking', Boolean(call) && speaking);
    if (pip.hidden !== !call) pip.hidden = !call;
}

// 分屏对方格：有立绘时显示对方最近一次说话时的立绘（带当前表情），还没开口时显示大头像。
function fillSplitRemote(doc, panel, name, avatar, feed) {
    clearChildren(panel);
    const pic = node(doc, 'igs-fx-call-split-feed');
    if (feed && pic.style) pic.style.backgroundImage = `url("${feed}")`;
    panel.appendChild(pic);
    if (!feed) {
        const face = node(doc, 'igs-fx-call-split-face');
        face.appendChild(callFace(doc, name, avatar));
        panel.appendChild(face);
    }
    panel.appendChild(node(doc, 'igs-fx-call-split-name', name));
    setFlag(panel, 'data-feed', Boolean(feed));
}

function buildSplit(stage, doc) {
    const split = persistent(stage, doc, 'igs-fx-call-split');
    split.appendChild(node(doc, 'igs-fx-call-split-shade'));
    split.appendChild(node(doc, 'igs-fx-call-split-remote'));
    split.appendChild(node(doc, 'igs-fx-call-split-edge'));
    return split;
}

// 语音通话分屏：对方格从右侧横向滑入，与现场之间斜切分割；说话的一方亮起、格子变大，另一方压暗收窄。
// 收起时常驻分屏立即隐藏，另放一个对方格替身向右滑出，翻页清理瞬时演出时替身一并收走。
function syncCallSplit(state, stage, doc, call, key, avatar, sprite, remote, reduced) {
    const existing = stage.querySelector('.igs-fx-call-split');
    if (!call) {
        if (existing && !existing.hidden) {
            existing.hidden = true;
            const last = state.split;
            if (last && !reduced) {
                const ghost = node(doc, 'igs-fx-call-split-out');
                ghost.setAttribute('data-active', last.active);
                const panel = node(doc, 'igs-fx-call-split-remote');
                fillSplitRemote(doc, panel, last.name, last.avatar, last.feed);
                ghost.appendChild(panel);
                spawn(state, stage, ghost, SPLIT_OUT_MS);
            }
        }
        state.split = null;
        return;
    }
    const split = existing || buildSplit(stage, doc);
    if (!state.split || state.split.key !== key) state.split = { key, name: call.name, avatar, feed: '', sig: '', active: '' };
    if (remote && sprite && sprite.url) state.split.feed = String(sprite.url).replace(/"/g, '%22');
    state.split.avatar = avatar;
    const sig = `${call.name}\n${avatar}\n${state.split.feed}`;
    if (state.split.sig !== sig) {
        state.split.sig = sig;
        fillSplitRemote(doc, split.querySelector('.igs-fx-call-split-remote'), call.name, avatar, state.split.feed);
    }
    state.split.active = remote ? 'remote' : 'local';
    if (split.getAttribute('data-active') !== state.split.active) split.setAttribute('data-active', state.split.active);
    if (split.hidden) split.hidden = false;
}

// 挂断记录：挂断所在页常驻一枚胶囊（对象 · 结局 · 时长），回翻该页仍在。
// 时长只在第一次见到这条挂断时结算，且只取本楼层刚结束的那通电话。
function syncCallLog(ctx) {
    const { state, layers, doc, snapshot, plan, now } = ctx;
    const end = plan.callEnd;
    const key = end ? `${plan.pageKey}:${JSON.stringify(end)}` : '';
    const existing = layers.front.querySelector('.igs-fx-call-end');
    if (key === state.logKey && (existing || !end)) return;
    if (existing) existing.remove();
    state.logKey = key;
    if (!end) return;
    if (!state.callLog.has(key)) {
        const started = state.callStart && state.callStart.messageId === snapshot.messageId ? state.callStart.start : null;
        state.callLog.set(key, started == null ? 0 : now - started);
        if (state.callLog.size > CALL_LOG_LIMIT) state.callLog.delete(state.callLog.keys().next().value);
        state.callStart = null;
    }
    const el = node(doc, 'igs-fx-call-end', callEndText(end, state.callLog.get(key)));
    el.setAttribute('data-reason', Object.hasOwn(CALL_END_TEXT, end.reason) ? end.reason : 'end');
    layers.front.appendChild(el);
}

const VIDEO_ICONS = Object.freeze({
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3.5v9L15 13"/></svg>',
    end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 14.2c5.3-5 13.7-5 19 0l-2.5 2.7-3.8-1.7v-2.5a11.5 11.5 0 0 0-6.4 0v2.5L5 16.9z"/></svg>',
});

function buildVideoWindow(stage, doc) {
    const win = persistent(stage, doc, 'igs-fx-video');
    win.appendChild(node(doc, 'igs-fx-video-feed'));
    win.appendChild(node(doc, 'igs-fx-video-face'));
    win.appendChild(node(doc, 'igs-fx-video-name'));
    win.appendChild(node(doc, 'igs-fx-video-self', '我'));
    const bar = node(doc, 'igs-fx-video-bar');
    for (const kind of Object.keys(VIDEO_ICONS)) {
        const btn = node(doc, `igs-fx-video-btn is-${kind}`);
        btn.innerHTML = VIDEO_ICONS[kind];
        bar.appendChild(btn);
    }
    win.appendChild(bar);
    return win;
}

// 视频通话：对方立绘装进手机视频框。画面取对方最近一次说话时的立绘（带当前表情），
// 还没说过话时显示头像；整通电话期间舞台立绘隐藏。
function syncVideoWindow(state, stage, doc, call, key, avatar, sprite) {
    const existing = stage.querySelector('.igs-fx-video');
    if (!call) {
        if (existing && !existing.hidden) existing.hidden = true;
        state.video = null;
        return;
    }
    const win = existing || buildVideoWindow(stage, doc);
    if (!state.video || state.video.key !== key) state.video = { key, feed: '', sig: '' };
    if (sprite && sprite.url) state.video.feed = String(sprite.url).replace(/"/g, '%22');
    const sig = `${call.name}\n${avatar}\n${state.video.feed}`;
    if (state.video.sig !== sig) {
        state.video.sig = sig;
        const feed = win.querySelector('.igs-fx-video-feed');
        const face = win.querySelector('.igs-fx-video-face');
        if (feed.style) feed.style.backgroundImage = state.video.feed ? `url("${state.video.feed}")` : '';
        clearChildren(face);
        face.appendChild(callFace(doc, call.name, avatar));
        win.querySelector('.igs-fx-video-name').textContent = call.name;
        setFlag(win, 'data-feed', Boolean(state.video.feed));
    }
    if (win.hidden) win.hidden = false;
}

// 通话区间：对方（来电 / 被拨打的角色）说话时标记 data-igs-fx-call-remote，
// 对话框显示听筒标记、打字机音效走听筒滤波；返回值即「对方正在说话」。
function syncCall(ctx, callSprite) {
    const { state, layers, doc, snapshot, options, plan, now, reduced } = ctx;
    const call = plan.ranges.call || null;
    const content = snapshot.content || {};
    const mode = callMode(call);
    const remote = Boolean(call) && sameCharacter(snapshot, content.speaker || content.spriteCharacter, call.name);
    // 先结算挂断记录：同页挂断后又来一通电话时，时长归属被挂断的那一通。
    syncCallLog(ctx);
    setFlag(layers.motion, 'data-igs-fx-call', Boolean(call), mode);
    setFlag(layers.motion, 'data-igs-fx-call-remote', remote);
    setFlag(layers.motion, 'data-igs-fx-call-sprite', Boolean(call), callSprite);
    let key = '';
    if (call) {
        key = `${snapshot.messageId}:${call.at == null ? call.name : call.at}`;
        if (!state.callStart || state.callStart.key !== key) {
            // 本页还在响铃：计时从来电屏播完、接通那一刻开始。
            const ringing = plan.effects.some((effect) => effect.type === 'call');
            state.callStart = { key, messageId: snapshot.messageId, start: now + (ringing ? CALL_SCREEN_MS.answer : 0) };
        }
    }
    syncCallBadge(state, layers.front, doc, call, key, now);
    const avatar = call ? resolveAvatar(call.name, snapshot, options) : '';
    syncCallPip(state, layers.stage, doc, call && mode === 'voice' && callSprite === 'avatar' ? call : null, avatar, remote, reduced);
    const split = call && mode === 'voice' && callSprite === 'split' ? call : null;
    setFlag(layers.motion, 'data-igs-fx-call-split', Boolean(split), remote ? 'remote' : 'local');
    syncCallSplit(state, layers.stage, doc, split, key, avatar, options.sprite, remote, reduced);
    syncVideoWindow(state, layers.stage, doc, call && mode === 'video' ? call : null, key, avatar, remote ? options.sprite : null);
    return remote;
}

export function applyFxToDom(root, snapshot, options = {}) {
    if (!root || !snapshot) return { played: [] };
    const settings = normalizeFxReaderSettings(snapshot.readerSettings);
    const castMarks = Array.isArray(options.castMarks) ? options.castMarks : [];
    if (!FX_FEATURE_KEYS.some((key) => settings[key].enabled) && !castMarks.length) {
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
    const plan = planPageFx(snapshot, state.memory, favorBaseline, settings, {
        hasSprite: Boolean(options.sprite && options.sprite.url),
    });
    const reduced = hasReducedMotion(options);
    const { motion, stage, doc } = layers;
    if (state.pageKey && state.pageKey !== plan.pageKey) clearTransients(state, layers);
    state.motion = motion;
    if (settings.mangaFx.enabled) warmSpeedLines(doc);
    if (settings.mangaFx.enabled && options.sprite && options.sprite.url) probeSpriteHead(options.sprite.url, doc).catch(() => null);
    // 漫画符号与来电屏颜色跟随对话主题：取主题里最鲜艳的颜色作强调色，由样式与各自固有色混合。
    const accent = settings.mangaFx.enabled || settings.fxTags.enabled ? pickFxAccent(options.theme) : '';
    if (accent !== state.accent && motion.style && typeof motion.style.setProperty === 'function') {
        if (accent) motion.style.setProperty('--igs-fx-accent', accent);
        else motion.style.removeProperty('--igs-fx-accent');
    }
    state.accent = accent;
    setFlag(motion, 'data-igs-fx-motion', plan.style.motion === 'snappy', 'snappy');
    const ancient = Boolean(snapshot.readerSettings && snapshot.readerSettings._ancientEra === true);
    setFlag(motion, 'data-igs-fx-era', ancient, 'ancient');
    // 世界观换音色：古代梆子沿用原值，西幻 / 科幻 / 末日用 fx-sfx 的 notify-<id>，现代与未知 id 退回 notify。
    const worldview = String((snapshot.readerSettings && snapshot.readerSettings._worldview) || '');
    const notifySound = ancient ? 'notify-ancient'
        : worldSkinOf(worldview) ? `notify-${worldview}` : 'notify';
    // 换皮类名：西幻 / 科幻 / 末日追加 is-<id>，古代与现代为空（古代沿用 is-ancient 分支）。
    const worldSkin = worldSkinOf(worldview) ? ` is-${worldview}` : '';
    setFlag(motion, 'data-igs-fx-flashback', plan.ranges.flashback);
    setFlag(motion, 'data-igs-fx-dream', plan.ranges.dream);
    setFlag(motion, 'data-igs-fx-letterbox', plan.ranges.letterbox);
    setFlag(motion, 'data-igs-fx-whisper', plan.whisper);
    setFlag(motion, 'data-igs-fx-movie', plan.atmos.movie);
    setFlag(motion, 'data-igs-fx-lightsoff', plan.atmos.lightsOff);
    setFlag(motion, 'data-igs-fx-umbrella', plan.atmos.umbrella);
    state.rangeBusy = Boolean(plan.ranges.flashback || plan.ranges.dream);
    syncBusy(state);
    // 常驻节点只在内容变化时写入，避免每次渲染都产生无意义的 DOM 变更（外部 MutationObserver 也会被惊动）。
    const now = typeof options.now === 'function' ? options.now() : Date.now();
    const ctx = { state, layers, doc, snapshot, options, reduced, plan, root, now, ancient, worldview, notifySound, worldSkin };
    const remote = syncCall(ctx, settings.fxTags.callSprite);
    const eyeHold = persistent(stage, doc, 'igs-fx-eye-hold');
    if (eyeHold.hidden !== !plan.eyeHold) eyeHold.hidden = !plan.eyeHold;
    state.pageKey = plan.pageKey;
    for (const effect of plan.effects) playEffect(effect, ctx);
    // 陪衬反应的漫画符号（stageCast.castReact）：每页只播一次；目标不在台上或没有图时丢弃。
    const castPlayed = [];
    if (castMarks.length && state.castMarkKey !== plan.pageKey) {
        const targets = new Map((Array.isArray(options.cast) ? options.cast : []).filter(Boolean).map((t) => [t.character, t]));
        for (const mark of castMarks) {
            const castTarget = mark && targets.get(mark.character);
            if (!castTarget || !castTarget.url) continue;
            playEffect({ type: 'symbol', kind: mark.kind, castTarget }, ctx);
            castPlayed.push(`castSymbol:${mark.character}:${mark.kind}`);
        }
    }
    state.castMarkKey = plan.pageKey;
    const { flashback, dream, letterbox } = plan.ranges;
    return { played: [...plan.effects.map((effect) => effect.type), ...castPlayed], phone: remote, whisper: plan.whisper === true, ranges: { flashback: Boolean(flashback), dream: Boolean(dream), letterbox: Boolean(letterbox) } };
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
        for (const el of Array.from(layer.querySelectorAll('.igs-fx-call-end'))) el.remove();
        for (const el of Array.from(layer.querySelectorAll(CALL_PERSISTENT))) el.hidden = true;
    }
    return Boolean(state);
}
