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
import { AUDIENCE_AMBIENT_LINES, INNER_PHRASES, classifyAudienceMood, mixInnerPhrases, parentheticalThoughts, randomItem, thoughtFragments } from './danmaku-pools.js';
import { myPhoneOf, phoneWallUrl } from './my-phone.js';
import { fitLivePhone, fitLiveSwitch, likeLive, phoneGeometry, pushLiveMessages, stopLivePhone, syncLivePhone, syncLiveSwitch } from './danmaku-live.js';
import { fitLiveControls, liveActionMessage, recordLiveAction, stopLiveControls, syncLiveControls } from './danmaku-interact.js';
import { isAudienceEntryShown, placeAudienceEntry, stopAudience, syncAudience } from './danmaku-audience.js';
import { estimateTextWidth, occupyTrack, pickScrollTrack } from './danmaku-lanes.js';
import { resolveChatTheme } from './chat-themes.js';
import { fitFeedPhone, stopFeedPhone, syncFeedPhone } from './feed-phone.js';
import { fitStorm, stopStorm, syncStorm } from './storm-phone.js';
import { enterFocus, exitFocus, focusOn, holdFocusText, isNewAppearance, phoneIdentity, setFocusHooks } from './phone-focus.js';
import { normalizeFeedFxSettings } from './feed-settings.js';
import { isFeedEntryShown, placeFeedEntry, stopFeedReview, syncFeedReview } from './feed-review.js';
import { phoneStatusFor } from './phone-sense.js';
import { collectNotices, isNotifyEntryShown, noticeStoreFor, normalizeNotifyCenterSettings, placeNotifyEntry, recordNotices, stopNotify, syncNotify } from './notify-center.js';
import { LIVE_HOST_ATTR, setStageCovered } from './stage-pause.js';

// 弹幕运行时：直播间（掏出手机看直播）、观众弹幕（HUD 下方小手机入口，点开看）、内心弹幕（立绘周围爆发）。
// 性能约束：全关零开销；运动只用 transform/opacity 的 CSS 动画，没有逐帧 JS；
// 每次渲染最多一次合并的几何读取且放在下一帧；同屏节点封顶，超出直接丢弃不排队。
const AUDIENCE_FILL = Object.freeze({ sparse: 1, medium: 3, dense: 6 });
const AUDIENCE_AMBIENT_CHANCE = Object.freeze({ sparse: 0, medium: 0.3, dense: 0.6 });
const ENTRY_GAP = 8;
const ENTRY_TOP = 14;
// 与 .igs-aud-entry 的 left / 边长一致。
const ENTRY_LEFT = 14;
const ENTRY_SIZE = 38;
export const INNER_WORD_CAP = 16;
const INNER_LIFE = 3200;
const INNER_BURST_AT = 2600;
// 横飞样式：每条穿过舞台的时长与整组发射窗口；轨道防追尾沿用观众弹幕的 B 站式判定。
const INNER_FLY_MS = 5200;
const INNER_FLY_SPAN = 2400;

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
    const plan = { pageKey, live: null, liveVisible: false, dms: [], audience: [], audienceVisible: false, inner: null, hostSay: '' };

    if (settings.live.enabled && !(settings.live.muteOnNsfw && nsfw) && fx.live) {
        plan.live = fx.live;
        // 回忆、梦境里收起手机，回到现实再拿出来。
        plan.liveVisible = !special && fx.flashback !== true && fx.dream !== true;
        (fx.dms || []).forEach((item, index) => {
            if (once(`dm:${pageKey}:${index}:${item.user}:${item.text}`)) plan.dms.push({ user: item.user, text: item.text, type: item.type, extra: item.extra });
        });
        // 主播本人的台词上屏：以「主播」标识进弹幕区，观众弹幕随后接着刷。
        const say = text(content.displayText);
        const who = text(content.speaker || content.spriteCharacter);
        if (content.textType === 'dialogue' && say && who === text(fx.live.name) && once(`host-say:${pageKey}:${say}`)) plan.hostSay = Array.from(say).slice(0, 60).join('');
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
        let real = [];
        if (settings.inner.useThought) {
            real = content.textType === 'thought' ? thoughtFragments(content.text) : parentheticalThoughts(content.text);
        }
        const mixed = mixInnerPhrases(real, INNER_PHRASES[innerMood], INNER_WORD_CAP, rng);
        plan.inner = { mood: innerMood, phrases: mixed.phrases, real: mixed.real };
    }
    return plan;
}

function getState(root, options) {
    let state = states.get(root);
    if (!state) {
        // feedSeen：社区帖子首见楼层（数字跨楼增长用）；feedRecall：刚刚刷到的那次区间，供回看入口；都只存内存。
        state = { memory: createDanmakuMemory(), timers: new Set(), pageKey: '', liveViews: new Map(), liveStage: null, stageWatch: null, feedSeen: new Map(), feedRecall: null };
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

// 玩家点「主播 / 观众」切换视角：同一场直播（主播 + 标题）记住所选视角，跨页保持；换一台手机重新抬起。
function liveViewKey(live) {
    return `${live.name}|${live.title}`;
}

function pickLiveView(ctx, auto, view) {
    const { state, host, front } = ctx;
    if (states.get(ctx.root) !== state || !auto) return;
    state.liveViews.set(liveViewKey(auto), view);
    const phone = syncLive(ctx, auto, { ...auto, view });
    if (phone && state.liveStage) fitLiveControls(front, fitLivePhone(host, state.liveStage));
}

// 玩家的直播互动：手机里立刻出效果，同时记进待送出事件。
function onLiveAction(ctx, live, action) {
    if (states.get(ctx.root) !== ctx.state || !live) return;
    const msg = liveActionMessage(action, live, text(ctx.options.userName));
    if (msg) pushLiveMessages(ctx.host, [msg]);
    else likeLive(ctx.host);
    recordLiveAction(action, live);
}

// 手机（舞台层）、视角切换与互动壳（前层）一起同步；回忆、梦境里手机收起时，前层的按钮也一并移除。
function syncLive(ctx, auto, live) {
    const { state, host, front, settings } = ctx;
    const phone = syncLivePhone(host, live, live ? { ...liveContext(ctx, live), onPickView: (view) => pickLiveView(ctx, auto, view) } : { schedule: state.schedule, reduced: ctx.reduced });
    const shown = phone && phone.visible && ctx.plan.liveVisible ? live : null;
    syncLiveSwitch(front, shown, { doc: ctx.doc, layout: settings.live.layout, onPick: (view) => pickLiveView(ctx, auto, view) });
    syncLiveControls(front, shown && settings.live.interact ? shown : null, {
        doc: ctx.doc, layout: settings.live.layout, onAction: (action) => onLiveAction(ctx, shown, action),
    });
    return phone;
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

// HUD 在舞台外层，高度随折叠变化：可见且压住入口原位（左上角）时入口贴它下缘，否则回左上角。
// 状态栏可以挪位置，挪走后入口不再跟着它跑到别处。
// 舞台可能被外层 transform 缩放：矩形差值换回舞台自身的 CSS 像素（同 measureStage）。
function entryTop(root, motion, stageH) {
    const hud = root.querySelector('#igs-status-hud');
    if (!hud || hud.hasAttribute('hidden') || typeof hud.getBoundingClientRect !== 'function' || typeof motion.getBoundingClientRect !== 'function') return ENTRY_TOP;
    const rect = hud.getBoundingClientRect();
    const m = motion.getBoundingClientRect();
    if (!(rect.height > 0) || !(m.height > 0)) return ENTRY_TOP;
    const k = stageH / m.height;
    if ((rect.left - m.left) * k >= ENTRY_LEFT + ENTRY_SIZE || (rect.top - m.top) * k >= ENTRY_TOP + ENTRY_SIZE) return ENTRY_TOP;
    return Math.max(ENTRY_TOP, (rect.bottom - m.top) * k + ENTRY_GAP);
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

// 横飞：轨道集中在头部到上半身一带、不越过对话框顶边；从右缘外进场，满轨的直接丢弃。
export function layoutInnerFlight(anchor, phrases, count, fontSize, rng = Math.random) {
    const lineH = Math.round(fontSize * 1.5);
    const top = Math.max(anchor.stageH * 0.05, anchor.cy - anchor.ry * 1.6);
    const bottom = Math.max(top + lineH, Math.min(anchor.floor, anchor.cy + anchor.ry * 1.6) - lineH);
    const lanes = Math.max(2, Math.floor((bottom - top) / lineH) + 1);
    const tracks = [];
    const words = [];
    for (let i = 0; i < count; i += 1) {
        const text = phrases[i % phrases.length];
        const t = count > 1 ? i / (count - 1) : 0;
        const delay = Math.round(t * INNER_FLY_SPAN + rng() * 120);
        const width = estimateTextWidth(text, fontSize);
        const lane = pickScrollTrack(tracks, lanes, delay, width, anchor.stageW, INNER_FLY_MS);
        if (lane < 0) continue;
        occupyTrack(tracks, lane, delay, width, anchor.stageW, INNER_FLY_MS);
        words.push({ text, y: Math.round(top + lane * lineH), delay, duration: INNER_FLY_MS, run: -(anchor.stageW + width) });
    }
    return words;
}

function playInner(ctx, inner, stage) {
    const { state, doc, reduced, options } = ctx;
    const sprite = options.sprite && options.sprite.url ? options.sprite : null;
    const anchor = innerAnchor(stage, sprite);
    const size = Math.round(Math.max(15, Math.min(26, Math.min(anchor.stageW, anchor.stageH) * 0.036)));
    // 减少动态效果时横飞退回静态落位的爆发样式。
    const fly = ctx.settings.inner.style === 'fly' && !reduced;
    const group = node(doc, 'igs-dm-inner');
    group.setAttribute('data-mood', inner.mood);
    group.setAttribute('data-style', fly ? 'fly' : 'burst');
    group.style.setProperty('--igs-dm-inner-size', `${size}px`);
    group.style.setProperty('--igs-dm-burst', `${INNER_BURST_AT}ms`);
    const realSet = new Set(inner.real || []);
    let life = INNER_LIFE;
    if (fly) {
        for (const word of layoutInnerFlight(anchor, inner.phrases, INNER_WORD_CAP, size, state.rng)) {
            const el = node(doc, 'igs-dm-word', word.text);
            if (realSet.has(word.text)) el.setAttribute('data-real', '1');
            el.style.left = `${anchor.stageW}px`;
            el.style.top = `${word.y}px`;
            el.style.setProperty('--igs-dm-d', `${word.delay}ms`);
            el.style.setProperty('--igs-dm-run', `${word.run}px`);
            el.style.setProperty('--igs-dm-dur', `${word.duration}ms`);
            group.appendChild(el);
            life = Math.max(life, word.delay + word.duration + 120);
        }
    } else {
        const words = layoutInnerWords(anchor, inner.phrases, reduced ? 5 : INNER_WORD_CAP, state.rng);
        for (const word of words) {
            const el = node(doc, 'igs-dm-word', word.text);
            if (realSet.has(word.text)) el.setAttribute('data-real', '1');
            el.style.left = `${word.x}px`;
            el.style.top = `${word.y}px`;
            el.style.setProperty('--igs-dm-d', `${reduced ? 0 : word.delay}ms`);
            el.style.setProperty('--igs-dm-s', String(word.scale));
            el.style.setProperty('--igs-dm-r', `${word.tilt}deg`);
            group.appendChild(el);
        }
    }
    ctx.host.appendChild(group);
    track(state, () => group.remove(), life);
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
        onDismiss: () => applyDanmakuToDom(ctx.root, snapshot, options),
        layout: ctx.settings.live.layout,
        look: ctx.look,
        interact: ctx.settings.live.interact,
        portrait: ctx.settings.live.portrait,
        onPortraitMove: typeof options.onLivePortraitMove === 'function'
            ? (frame) => options.onLivePortraitMove({ ...((snapshot.readerSettings && snapshot.readerSettings.liveFx) || {}), portrait: frame })
            : null,
        chat: ctx.settings.live.chat,
        theme: ctx.settings.live.followTheme ? resolveChatTheme(snapshot.readerSettings && snapshot.readerSettings.dialogSkin) : null,
        coverUrl: resolve(content.backgroundImage),
        status: ctx.status,
        // 本页背景就是 CG（插图 / 事件 CG）时，手机里改按 CG 展示。
        cg: content.cgActive === true,
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
    const feedFx = normalizeFeedFxSettings(snapshot.readerSettings && snapshot.readerSettings.feedFx);
    // 通知中心：本页有可记的消息或仓库里已有通知才继续，否则零开销。
    let notices = null;
    if (options.suspended !== true && normalizeNotifyCenterSettings(snapshot.readerSettings && snapshot.readerSettings.notifyCenter).enabled) {
        const store = noticeStoreFor(root, options.chatId);
        recordNotices(store, collectNotices(snapshot, {
            userName: text(options.userName), feedOn: feedFx.enabled, stormOn: feedFx.enabled && feedFx.storm && feedFx.storm.enabled !== false,
        }));
        if (store.items.length) notices = store;
    }
    if (!(isDanmakuActive(settings) || feedFx.enabled || notices) || options.suspended === true) {
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
        state, layers, doc: layers.doc, root, host, front, snapshot, options, reduced, plan, pageKey: plan.pageKey,
        settings,
        look: myPhoneOf(snapshot.readerSettings),
        status: phoneStatusFor(snapshot, state.now),
    };
    // 社区手机：开关开、本页在区间内、非 NSFW 静音、非回忆 / 梦境 / 聊天页才亮出；亮出时直播手机与观众入口让位。
    const content = snapshot.content || {};
    const fx = content.fx || {};
    const feedAllowed = feedFx.enabled && !(feedFx.muteOnNsfw && content.sceneNsfw === true)
        && content.chatPage !== true && content.htmlCardPage !== true && fx.flashback !== true && fx.dream !== true;
    // 舆论风暴优先：风暴期间社区与直播手机都让位。
    const storm = feedAllowed && feedFx.storm && feedFx.storm.enabled !== false && fx.storm ? fx.storm : null;
    const feed = feedAllowed && !storm && fx.feed ? fx.feed : null;
    const coverUrl = content.backgroundImage && typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(content.backgroundImage) || '' : content.backgroundImage || '';
    // 手机里的人认得卡内角色：能拿到头像就算熟人。
    const feedCtx = {
        doc: ctx.doc, reduced, schedule: state.schedule, now: state.now,
        look: ctx.look,
        coverUrl,
        // 锁屏壁纸：合照在渲染侧拿不到地址（存相册是异步的）；默认用当前场景背景，可在「我的手机」换。
        wallpaperUrl: phoneWallUrl(ctx.look, coverUrl),
        status: ctx.status,
        messageId: snapshot.messageId,
        userName: text(options.userName),
        firstSeen: state.feedSeen,
        avatarOf: (name) => resolveAvatar(name, snapshot, options),
        getStage: () => state.liveStage,
        onDismiss: () => applyDanmakuToDom(root, snapshot, options),
    };
    const feedPhone = syncFeedPhone(host, feed, feedCtx);
    if (feedPhone) {
        // 回看攒下同一平台这次刷到的全部帖子（解析每页只给最近 3 条），最多 9 条。
        const prev = state.feedRecall && state.feedRecall.platform === feed.platform && state.feedRecall.owner === (feed.owner || '') ? state.feedRecall.posts : [];
        const keyOf = (p) => `${p.author}|${p.text}|${p.extra}`;
        const merged = [...prev.filter((p) => !(feed.posts || []).some((q) => q && keyOf(q) === keyOf(p))), ...(feed.posts || []).filter(Boolean)];
        state.feedRecall = { platform: feed.platform, owner: feed.owner || '', posts: merged.slice(-9) };
    }
    const stormPhone = syncStorm(host, storm, {
        doc: ctx.doc, schedule: state.schedule, clear: state.clear, now: state.now, rng: state.rng, reduced,
        worldview: (snapshot.readerSettings && snapshot.readerSettings._worldview) || 'modern',
        look: ctx.look, coverUrl: phoneWallUrl(ctx.look, coverUrl),
        onDismiss: () => applyDanmakuToDom(root, snapshot, options),
    });
    if (feedPhone || stormPhone) {
        plan.liveVisible = false;
        plan.audienceVisible = false;
    }
    // 主播名就是用户角色名时自动切主播视角，不依赖 AI 写视角栏。
    const userName = text(options.userName);
    const auto = plan.live && userName && text(plan.live.name) === userName ? { ...plan.live, view: 'host' } : plan.live;
    const live = auto ? { ...auto, view: state.liveViews.get(liveViewKey(auto)) || auto.view } : null;
    const phone = syncLive(ctx, auto, live);
    // 手机焦点：量一次舞台后三种手机各自重排（对话框淡出 / 淡回时几何随之变）。
    const refit = () => {
        const next = measureStage(layers.motion);
        if (!next) return;
        state.liveStage = next;
        if (phone) fitLiveControls(front, fitLivePhone(host, next));
        fitLiveSwitch(front, next);
        if (feedPhone) fitFeedPhone(host, next);
        if (stormPhone) fitStorm(host, next, phoneGeometry(next, ctx.look.model, ctx.look.size));
    };
    const liveShown = Boolean(phone && phone.visible && plan.liveVisible && settings.live.layout !== 'full');
    const identity = phoneIdentity({
        storm: stormPhone ? storm : null,
        feed: feedPhone && feedPhone.els.phone ? feed : null,
        live,
        liveShown,
    });
    setFocusHooks(state, root, {
        host,
        textEl: () => root.querySelector('#igs-text'),
        refit,
        autoPlay: options.autoPlay === true,
        schedule: state.schedule,
        clear: state.clear,
        editing: () => Boolean(phone && phone.editing),
    });
    // 切页 / 切楼：焦点不跨页。手机离场也强制退出，对话框绝不留在隐藏状态。
    if (focusOn(state) && (state.focus.pageKey !== plan.pageKey || !identity)) exitFocus(state, root);
    // 首次亮相：一台手机从不在场变成在场（换平台 / 换风暴 / 换一场直播都算），自动进焦点；连续几页同一台不算。
    if (isNewAppearance(state.phoneKey, identity) && options.skipping !== true) enterFocus(state, root, { auto: true });
    state.phoneKey = identity;
    // 手机形态的直播亮着时，舞台上的立绘收起：手机里已经有主播画面，后面再露一个人会和手机粘在一起。
    setLivePhoneFlag(root, liveShown, live && live.name);
    if (phone && plan.dms.length) pushLiveMessages(host, plan.dms);
    if (phone && plan.hostSay) pushLiveMessages(host, [{ user: live.name, text: plan.hostSay, type: 'host', extra: '' }]);
    if (settings.audience.enabled) {
        syncAudience(front, audienceInfo(ctx), {
            doc: ctx.doc, schedule: state.schedule, clear: state.clear, now: state.now, rng: state.rng,
            frame: (fn) => nextFrame(ctx.doc, fn),
        });
    } else {
        stopAudience(front);
    }
    // 回看入口：社区手机收起后留在观众入口旁（弹幕关着时在原位），点开是同一个 App 页面。
    const entryShown = isAudienceEntryShown(front);
    if (feedFx.enabled) {
        syncFeedReview(front, {
            feed: state.feedRecall, visible: feedAllowed && !feedPhone && !stormPhone, beside: entryShown, size: settings.audience.entrySize,
        }, feedCtx);
    } else {
        state.feedRecall = null;
        stopFeedReview(front);
    }
    const reviewShown = isFeedEntryShown(front);
    if (notices) syncNotify(front, { store: notices, size: settings.audience.entrySize }, { doc: ctx.doc });
    else stopNotify(front);
    const notifyShown = isNotifyEntryShown(front);
    if (!(phone || feedPhone || stormPhone)) unwatchPhoneStage(state);
    if (plan.inner || entryShown || reviewShown || notifyShown || feedPhone || stormPhone || (phone && plan.liveVisible)) {
        // 本次渲染唯一一次几何读取：推迟到下一帧，全部读完才写。
        nextFrame(ctx.doc, () => {
            if (states.get(root) !== state || state.pageKey !== plan.pageKey) return;
            holdFocusText(state);
            const stage = measureStage(layers.motion);
            if (!stage) return;
            const top = entryShown || reviewShown || notifyShown ? entryTop(root, layers.motion, stage.stageH) : 0;
            state.liveStage = stage;
            if (phone) fitLiveControls(front, fitLivePhone(host, stage));
            fitLiveSwitch(front, stage);
            if (feedPhone) fitFeedPhone(host, stage);
            if (stormPhone) fitStorm(host, stage, phoneGeometry(stage, ctx.look.model, ctx.look.size));
            watchPhoneStage(state, ctx, layers.motion, refit, Boolean(phone || feedPhone || stormPhone));
            if (entryShown) placeAudienceEntry(front, top);
            if (reviewShown) placeFeedEntry(front, top);
            if (notifyShown) placeNotifyEntry(front, top, (entryShown ? 1 : 0) + (reviewShown ? 1 : 0));
            if (plan.inner) playInner(ctx, plan.inner, stage);
        });
    }
    return { live: Boolean(phone), audience: plan.audience.length, inner: Boolean(plan.inner) };
}

// 手机形态的直播亮着：舞台立绘收起；同时记下主播名，头顶小字和漫画泡据此不再压在手机画面上。
function setLivePhoneFlag(root, on, hostName = '') {
    setStageCovered(root, on);
    if (!root) return;
    if (on && hostName && typeof root.setAttribute === 'function') root.setAttribute(LIVE_HOST_ATTR, String(hostName));
    else if (typeof root.removeAttribute === 'function') root.removeAttribute(LIVE_HOST_ATTR);
}

// 手机在场时观察舞台和对话框（对话框高度自适应、显隐都会让可见区变化），变化合并到下一帧重算一次；手机离场即断开。
function unwatchPhoneStage(state) {
    const watch = state && state.stageWatch;
    if (!watch) return;
    state.stageWatch = null;
    try { watch.observer.disconnect(); } catch (error) { /* best-effort */ }
}

function watchPhoneStage(state, ctx, motion, refit, active) {
    if (!active) { unwatchPhoneStage(state); return; }
    const view = ctx.doc && ctx.doc.defaultView;
    if (!view || typeof view.ResizeObserver !== 'function') return;
    const dialog = motion.querySelector('#igs-dialog-layer .igs-dialog');
    const prev = state.stageWatch;
    if (prev && prev.motion === motion && prev.dialog === dialog) { prev.refit = refit; return; }
    unwatchPhoneStage(state);
    const watch = { motion, dialog, refit, pending: false, observer: null };
    watch.observer = new view.ResizeObserver(() => {
        if (watch.pending || state.stageWatch !== watch) return;
        watch.pending = true;
        nextFrame(ctx.doc, () => {
            watch.pending = false;
            if (state.stageWatch === watch) watch.refit();
        });
    });
    watch.observer.observe(motion);
    if (dialog) watch.observer.observe(dialog);
    state.stageWatch = watch;
}

export function cancelDanmaku(root) {
    setLivePhoneFlag(root, false);
    const state = root && states.get(root);
    unwatchPhoneStage(state);
    if (state) exitFocus(state, root);
    const layers = root ? findFxLayers(root) : null;
    const host = layers && layers.stage ? layers.stage.querySelector('.igs-dm-root') : null;
    const front = layers && layers.front ? layers.front.querySelector('.igs-dm-front') : null;
    if (state) {
        clearPage(state, host);
        states.delete(root);
    }
    if (host) {
        stopLivePhone(host);
        stopFeedPhone(host);
        stopStorm(host);
        host.remove();
    }
    if (front) {
        stopLiveControls(front);
        stopAudience(front);
        stopFeedReview(front);
        stopNotify(front);
        front.remove();
    }
    return Boolean(state);
}
