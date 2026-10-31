import { prefersReducedMotion } from './reduced-motion.js';
import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { enterPage, markPage, nextFrame, resolveAvatar, spriteGeometry } from './fx-runtime.js';
import { measureStage, peekSpriteHead, probeSpriteHead, spriteDrawRect, headToMarker } from './fx-anchor.js';
import { normalizeFxStyleSettings } from './fx-settings.js';
import {
    isDanmakuActive,
    normalizeDanmakuSettings,
    pickInnerMood,
} from './danmaku-settings.js';
import { AUDIENCE_AMBIENT_LINES, INNER_PHRASES, classifyAudienceMood, mixInnerPhrases, parentheticalThoughts, randomItem, thoughtFragments } from './danmaku-pools.js';
import { myPhoneOf, phoneWallUrl } from './my-phone.js';
import { fitLiveFace, fitLivePhone, fitLiveSwitch, likeLive, phoneGeometry, pushLiveMessages, setLiveNarration, stopLivePhone, syncLivePhone, syncLiveSwitch, triggerLiveWarning } from './danmaku-live.js';
import { fitLiveControls, liveActionMessage, recordLiveAction, stopLiveControls, syncLiveControls } from './danmaku-interact.js';
import { dockAudienceEntry, isAudienceEntryShown, stopAudience, syncAudience } from './danmaku-audience.js';
import { estimateTextWidth, occupyTrack, pickScrollTrack } from './danmaku-lanes.js';
import { resolveChatTheme } from './chat-themes.js';
import { fitFeedPhone, stopFeedPhone, syncFeedPhone } from './feed-phone.js';
import { fitStorm, stopStorm, syncStorm } from './storm-phone.js';
import { detectLiveWarning } from './live-warning.js';
import { detectLiveScale, fanNameFromText, liveTier, mergeLiveScale } from './live-chatter.js';
import { applyCaptionText, clearCaptionText } from './live-cc-text.js';
import { applyLiveCcGeometry, applyLiveFull, classifySubtitle, clearLiveFull, nextSubtitleTurn, refreshLiveFullOverflow } from './live-full.js';
import { enterFocus, exitFocus, focusOn, holdFocusText, isNewAppearance, phoneIdentity, setFocusHooks } from './phone-focus.js';
import { normalizeFeedFxSettings } from './feed-settings.js';
import { DOCK_GAP, DOCK_WIDTH, ENTRY_SELECTOR, placeEntryDock, setPhoneOn, syncEntryFold } from './entry-dock.js';
import { isOriginEntryShown, resolveOriginBinding, stopOrigin, syncOrigin } from './origin-panel.js';
import { FEED_VIEW_MAX } from '../../scene/feed-platforms.js';
import { isFeedEntryShown, stopFeedReview, syncFeedReview } from './feed-review.js';
import { phoneStatusFor } from './phone-sense.js';
import { collectNotices, isNotifyEntryShown, noticeStoreFor, normalizeNotifyCenterSettings, recordNotices, stopNotify, syncNotify } from './notify-center.js';
import { LIVE_HOST_ATTR, setStageCovered } from './stage-pause.js';
import { feedPageOf } from './feed-extras.js';
import { feedPingKind, feedStageIdle, playFeedPing, shouldFeedPing } from './feed-ping.js';

// 弹幕运行时：直播间（掏出手机看直播）、观众弹幕（HUD 下方小手机入口，点开看）、内心弹幕（立绘周围爆发）。
// 性能约束：全关零开销；运动只用 transform/opacity 的 CSS 动画，没有逐帧 JS；
// 每次渲染最多一次合并的几何读取且放在下一帧；同屏节点封顶，超出直接丢弃不排队。
const AUDIENCE_FILL = Object.freeze({ sparse: 1, medium: 3, dense: 6 });
const AUDIENCE_AMBIENT_CHANCE = Object.freeze({ sparse: 0, medium: 0.3, dense: 0.6 });
const faceProbed = new Set();
// 入口之间的竖向间距，与入口坞的 gap 一致（entry-dock.js）。
const ENTRY_GAP = DOCK_GAP;
const ENTRY_TOP = 14;
// 与入口坞的 left / 宽度一致：坞宽 38px，与状态栏折叠按钮同宽。
const ENTRY_LEFT = 14;
const ENTRY_SIZE = DOCK_WIDTH;
// 坞内单个入口图标的边长（中档电脑 28px），量不到入口时的估值；实际边长随档位与视口由 entrySizeOf 量出。
const ENTRY_ICON_PX = 28;
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
    const plan = { pageKey, live: null, liveVisible: false, warning: null, dms: [], audience: [], audienceVisible: false, inner: null, hostSay: '' };

    if (settings.live.enabled && !(settings.live.muteOnNsfw && nsfw) && fx.live) {
        plan.live = fx.live;
        // 回忆、梦境里收起手机，回到现实再拿出来。
        plan.liveVisible = !special && fx.flashback !== true && fx.dream !== true;
        (fx.dms || []).forEach((item, index) => {
            if (once(`dm:${pageKey}:${index}:${item.user}:${item.text}`)) plan.dms.push({ user: item.user, text: item.text, type: item.type, extra: item.extra });
        });
        // 超管警告：正文关键词或 dm 里的房管 / 系统消息；每页只触发一次，同一场直播的 60 秒冷却在直播手机里判。
        if (settings.live.adminWarn) {
            const warning = detectLiveWarning(text(content.displayText), plan);
            if (warning && once(`warn:${pageKey}`)) plan.warning = warning;
        }
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
        state = { memory: createDanmakuMemory(), timers: new Set(), pageKey: '', liveViews: new Map(), liveStage: null, stageWatch: null, scaleSig: '', liveScales: new Map(), liveFans: new Map(), feedSeen: new Map(), feedRecall: null };
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
    if (phone && state.liveStage) applyLiveFit(ctx.root, front, fitLivePhone(host, state.liveStage));
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
    syncLiveSwitch(front, shown, { doc: ctx.doc, layout: settings.live.layout, sub: settings.live.fullText === 'subtitle', onPick: (view) => pickLiveView(ctx, auto, view) });
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

// 入口坞左边距：状态栏压住左上原位时，让 38px 坞的中线对准状态栏的中线（嵌入模式状态栏左边距是 12 而不是 14）；
// 状态栏不在左上、隐藏或量不到时回默认 ENTRY_LEFT。
function entryLeft(root, motion, stageH) {
    const hud = root.querySelector('#igs-status-hud');
    if (!hud || hud.hasAttribute('hidden') || !hud.classList || !hud.classList.contains('igs-hud-collapsed') || typeof hud.getBoundingClientRect !== 'function' || typeof motion.getBoundingClientRect !== 'function') return ENTRY_LEFT;
    const rect = hud.getBoundingClientRect();
    const m = motion.getBoundingClientRect();
    if (!(rect.width > 0) || !(m.height > 0)) return ENTRY_LEFT;
    const k = stageH / m.height;
    if ((rect.left - m.left) * k >= ENTRY_LEFT + ENTRY_SIZE || (rect.top - m.top) * k >= ENTRY_TOP + ENTRY_SIZE) return ENTRY_LEFT;
    return Math.max(0, Math.round((rect.left - m.left) * k + (rect.width * k - ENTRY_SIZE) / 2));
}

// 内心弹幕的落点：有头部标定时围着头，否则围着立绘上半身；没有立绘就在舞台中上部。
function innerAnchor(geo, sprite, doc) {
    const floor = Math.min(geo.dialogTop, geo.stageH) - 24;
    const probed = sprite ? peekSpriteHead(sprite.url, doc) : null;
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
    const anchor = innerAnchor(stage, sprite, doc);
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

// 世界观到路人弹幕语气：魔法 / 西幻 -> fantasy，古风 / 修仙 -> ancient，星际 / 科幻 -> scifi，其余 modern。
const LIVE_TONE_OF_WORLDVIEW = Object.freeze({ magic: 'fantasy', fantasy: 'fantasy', ancient: 'ancient', xianxia: 'ancient', scifi: 'scifi', starship: 'scifi', cyberpunk: 'scifi' });
const LIVE_ENDING_RE = /下播|关播|直播结束|今天的直播就到这|直播就到这里|下次直播再见/;
export function liveToneOf(worldview) {
    return LIVE_TONE_OF_WORLDVIEW[worldview] || 'modern';
}

function capMap(map, limit = 24) {
    while (map.size > limit) map.delete(map.keys().next().value);
}

// 本页的路人弹幕上下文：规模（粉丝 / 在线人数）与粉丝牌名跨楼记在内存里；每页只检测一次。
function chatterContext(ctx, live) {
    const { snapshot, options, state, plan, settings } = ctx;
    const content = snapshot.content || {};
    const pageText = text(content.displayText);
    const sig = `${ctx.pageKey}|${live.name}`;
    if (state.scaleSig !== sig) {
        state.scaleSig = sig;
        state.liveScales.set(live.name, mergeLiveScale(state.liveScales.get(live.name), detectLiveScale(pageText, live.name)));
        capMap(state.liveScales);
        const fan = fanNameFromText(pageText, live.name);
        if (fan) state.liveFans.set(live.name, fan);
        capMap(state.liveFans);
    }
    const scale = state.liveScales.get(live.name);
    const hour = Number.parseInt(String((ctx.status && ctx.status.time) || ''), 10);
    return {
        sig: `${ctx.pageKey}|${pageText.length}|${settings.live.blockHostile}`,
        pageKey: ctx.pageKey,
        title: text(live.title),
        text: pageText,
        aiLines: (plan.dms || []).filter((dm) => dm && dm.type !== 'admin' && dm.text).map((dm) => String(dm.text)),
        hostSaid: plan.hostSay || '',
        userName: text(options.userName),
        hostName: live.name,
        hostGender: null,
        tone: liveToneOf(snapshot.readerSettings && snapshot.readerSettings._worldview),
        mood: classifyAudienceMood(content.statusEmotion),
        hour: Number.isFinite(hour) ? hour : undefined,
        ending: LIVE_ENDING_RE.test(pageText),
        emoji: settings.live.emoji,
        blockHostile: settings.live.blockHostile,
        custom: settings.live.customLines,
        customMap: settings.live.fanMedals,
        tier: scale ? liveTier(scale) : null,
        fan: state.liveFans.get(live.name) || '',
    };
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
        chatter: chatterContext(ctx, live),
        // 打字机所在的文字框：路人对本页的反应等它打完再发。
        typingEl: ctx.root && typeof ctx.root.querySelector === 'function' ? ctx.root.querySelector('#igs-text') : null,
        onDismiss: () => applyDanmakuToDom(ctx.root, snapshot, options),
        layout: ctx.settings.live.layout,
        faceGuard: ctx.settings.live.faceGuard,
        fullText: ctx.settings.live.fullText,
        look: ctx.look,
        interact: ctx.settings.live.interact,
        portrait: ctx.settings.live.portrait,
        onPortraitMove: typeof options.onLivePortraitMove === 'function'
            ? (frame) => options.onLivePortraitMove({ ...((snapshot.readerSettings && snapshot.readerSettings.liveFx) || {}), portrait: frame })
            : null,
        chat: ctx.settings.live.chat,
        fontSize: ctx.settings.live.fontSize,
        density: ctx.settings.live.density,
        speed: ctx.settings.audience && ctx.settings.audience.speed,
        theme: ctx.settings.live.followTheme ? resolveChatTheme(snapshot.readerSettings && snapshot.readerSettings.dialogSkin) : null,
        coverUrl: resolve(content.backgroundImage),
        status: ctx.status,
        // 本页背景就是 CG（插图 / 事件 CG）时，手机里改按 CG 展示。
        cg: content.cgActive === true,
        portraitUrl,
        avatarUrl: resolveAvatar(live.name, snapshot, options),
    };
}

const RECALL_SEGMENTS = 3;
const recallKeyOf = (p) => `${p.author}|${p.text}|${p.extra}`;

// 纯函数：把这次刷到的区间并进回看段列表（旧到新）。同平台同主人接着上一段，否则另起一段；不改传入的帖子对象。
export function recallFeeds(prev, feed, picRef) {
    const segs = Array.isArray(prev) ? prev : [];
    const owner = feed.owner || '';
    const last = segs[segs.length - 1];
    const same = Boolean(last && last.platform === feed.platform && last.owner === owner);
    const old = same ? last.posts : [];
    const oldRef = new Map(old.map((p) => [recallKeyOf(p), p.picRef]));
    const fresh = (feed.posts || []).filter(Boolean).map((p) => ({ ...p, picRef: oldRef.has(recallKeyOf(p)) ? oldRef.get(recallKeyOf(p)) : picRef }));
    const keys = new Set(fresh.map(recallKeyOf));
    const posts = [...old.filter((p) => !keys.has(recallKeyOf(p))), ...fresh].slice(-FEED_VIEW_MAX);
    const seg = { platform: feed.platform, owner, posts };
    return same ? [...segs.slice(0, -1), seg] : [...segs, seg].slice(-RECALL_SEGMENTS);
}

// 社区手机提示音：手机首次亮出或换页后本页有新帖时响一声（按平台分音色）；偷看别人手机、纸面皮肤、收起后不响。
function pingFeed(state, root, feed, feedPhone, pageKey, options, sound) {
    const kind = feedPhone && feedPhone.els.phone && !feedPhone.owner && feed ? feedPingKind(feed.platform) : '';
    if (!kind) {
        state.feedPing = null;
        return;
    }
    const prev = state.feedPing;
    const key = `${feed.platform}|${feedPhone.owner}`;
    const appeared = !prev || prev.key !== key;
    const newPage = !prev || prev.pageKey !== pageKey;
    const fresh = (feed.posts || []).some((p) => p && p.fresh === true);
    const now = state.now();
    const ring = shouldFeedPing({
        kind, appeared, fresh, newPage, skipping: options.skipping === true, idle: feedStageIdle(root), last: prev && prev.at, now,
    });
    if (ring) playFeedPing(kind, sound);
    state.feedPing = { key, pageKey, at: ring ? now : (prev && prev.key === key ? prev.at : undefined) };
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
    // 随身系统：宿主给出引擎且总开关开着才有入口（接入点见 origin-panel.js 的 resolveOriginBinding）。
    const originBinding = options.suspended === true ? null : resolveOriginBinding(options);
    if (!(isDanmakuActive(settings) || feedFx.enabled || notices || originBinding) || options.suspended === true) {
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
    // 舆论风暴优先：风暴期间社区与直播手机都让位。
    const { allowed: feedAllowed, storm, feed } = feedPageOf(content, feedFx);
    const coverUrl = content.backgroundImage && typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(content.backgroundImage) || '' : content.backgroundImage || '';
    const feedPicBlocked = content.sceneNsfw === true || content.cgNsfw === true;
    // 锁屏壁纸的相册图：开着社区就让宿主按需刷新（宿主自己节流），只取已缓存的地址；NSFW 场景与 CG 不用。
    const albumWall = feedFx.enabled && !feedPicBlocked && typeof options.albumWallUrl === 'function' ? text(options.albumWallUrl()) : '';
    // 手机里的人认得卡内角色：能拿到头像就算熟人。
    const feedCtx = {
        doc: ctx.doc, reduced, schedule: state.schedule, now: state.now,
        look: ctx.look,
        // 朋友圈封面：NSFW 页不用当前画面。
        coverUrl: feedPicBlocked ? '' : coverUrl,
        pageKey: plan.pageKey,
        // 帖子配图：content.backgroundImage 本页有 CG（插图 / 事件 CG）时就是 CG 地址，否则是场景背景，一份地址两种情况都覆盖；NSFW 场景与 CG 不上帖子。
        picUrl: feedPicBlocked ? '' : coverUrl,
        resolvePic: (ref) => (ref && typeof options.resolveAssetUrl === 'function' ? options.resolveAssetUrl(ref) || '' : ref || ''),
        // 锁屏壁纸：「我的手机」自选 > 相册里最近一张合照 / CG（宿主传入）> 当前场景背景。
        // NSFW 页（含 NSFW CG）锁屏不回落到当前画面，只用「我的手机」自选或纯色。
        wallpaperUrl: phoneWallUrl(ctx.look, feedPicBlocked ? '' : coverUrl, albumWall),
        status: ctx.status,
        messageId: snapshot.messageId,
        userName: text(options.userName),
        firstSeen: state.feedSeen,
        avatarOf: (name) => resolveAvatar(name, snapshot, options),
        getStage: () => state.liveStage,
        onDismiss: () => applyDanmakuToDom(root, snapshot, options),
    };
    const feedPhone = syncFeedPhone(host, feed, feedCtx);
    pingFeed(state, root, feed, feedPhone, plan.pageKey, options, snapshot.readerSettings && snapshot.readerSettings.fxSound);
    if (feedPhone) {
        // 回看攒最近 3 段（不同平台或不同主人算不同段），每段最多 FEED_VIEW_MAX 条；帖子盖上当时的背景引用，回看时配图不串到别的场景。
        state.feedRecall = recallFeeds(state.feedRecall, feed, feedPicBlocked ? '' : text(content.backgroundImage));
    }
    const stormPhone = syncStorm(host, storm, {
        doc: ctx.doc, schedule: state.schedule, clear: state.clear, now: state.now, rng: state.rng, reduced,
        worldview: (snapshot.readerSettings && snapshot.readerSettings._worldview) || 'modern',
        look: ctx.look, coverUrl: phoneWallUrl(ctx.look, feedPicBlocked ? '' : coverUrl),
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
        refreshLiveFullOverflow(root, root.querySelector('#igs-text'));
        const next = measureStage(layers.motion);
        if (!next) return;
        state.liveStage = next;
        placeLiveFullName(root, next);
        if (phone) applyLiveFit(root, front, fitLivePhone(host, next));
        if (phone) fitFaceFor(host, next, options.sprite, ctx.doc, refit);
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
    // 直播全屏：对话框换成直播字幕的样子，状态栏隐藏；收起 / 下播 / 切到手机形态时标记清掉。
    const liveFullOn = Boolean(phone && phone.visible && plan.liveVisible && settings.live.layout === 'full');
    if (liveFullOn) {
        const kind = classifySubtitle({ speaker: content.speaker, textType: content.textType, hostName: live.name, userName });
        // 横飞模式没有评论区，「旁白进评论区」退回字幕位置。
        const narrationPos = settings.live.narrationPos === 'chat' && settings.live.chat === 'fly' ? 'above' : settings.live.narrationPos;
        state.subTurn = nextSubtitleTurn(state.subTurn, { pageKey: plan.pageKey, speaker: kind === 'narration' ? '' : content.speaker });
        applyLiveFull(root, {
            fullText: settings.live.fullText,
            narrationPos,
            kind,
            speaker: content.speaker,
            textEl: root.querySelector('#igs-text'),
            turn: state.subTurn.turn,
        });
        const narrated = settings.live.fullText === 'subtitle' && kind === 'narration' && narrationPos === 'chat';
        setLiveNarration(host, narrated ? { pageKey: plan.pageKey, text: text(content.displayText) } : {});
        // 台词改成语音识别的样子（去标点、可选错字）；旁白不是说出来的话，保留原文。
        applyCaptionText(root.querySelector('#igs-text'), {
            on: settings.live.fullText === 'subtitle' && kind !== 'narration',
            typos: settings.live.ccTypos,
            seed: plan.pageKey,
            schedule: state.schedule,
            clear: state.clear,
        });
    } else {
        clearCaptionText(root.querySelector('#igs-text'));
        clearLiveFull(root, root.querySelector('#igs-text'));
        state.subTurn = null;
        if (phone) setLiveNarration(host, {});
    }
    if (phone && plan.warning && phone.visible && plan.liveVisible) {
        const warning = triggerLiveWarning(host, plan.warning);
        if (warning === 'ban') recordLiveAction({ kind: 'ban' }, live);
    }
    if (phone && plan.dms.length) pushLiveMessages(host, plan.dms);
    // 全屏直播里主播的话已经是字幕，不再重复推进评论。
    if (phone && plan.hostSay && settings.live.layout !== 'full') pushLiveMessages(host, [{ user: live.name, text: plan.hostSay, type: 'host', extra: '' }]);
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
            segments: state.feedRecall, visible: feedAllowed && !feedPhone && !stormPhone, beside: entryShown, size: settings.audience.entrySize,
        }, feedCtx);
    } else {
        state.feedRecall = null;
        stopFeedReview(front);
    }
    // 直播手机在场：观众入口收进手机顶栏；全屏或没有直播时留在前层。
    dockAudienceEntry(front, phone && phone.visible && plan.liveVisible && settings.live.layout !== 'full' ? phone.els.tools : null, phone ? phone.els.viewBtn : null);
    const reviewShown = isFeedEntryShown(front);
    if (notices) syncNotify(front, { store: notices, size: settings.audience.entrySize }, { doc: ctx.doc });
    else stopNotify(front);
    const notifyShown = isNotifyEntryShown(front);
    // 随身系统入口排在铃铛后；窗口位置尺寸按舞台量出的像素夹住。
    if (originBinding) syncOrigin(front, originBinding, { doc: ctx.doc, size: settings.audience.entrySize, getStage: () => state.liveStage });
    else stopOrigin(front);
    const originShown = isOriginEntryShown(front);
    // 社区 / 风暴手机在场时通知入口让位（CSS 按这个标记隐藏），收起后恢复；通知照常记录。
    setPhoneOn(front, Boolean(feedPhone || stormPhone));
    // 入口增减后先按当前状态收拢一次（手机上 3 个及以上收成一个按钮）；几何读完后下一帧再校一次全屏标记。
    syncEntryFold(front);
    if (!(phone || feedPhone || stormPhone)) unwatchPhoneStage(state);
    if (plan.inner || entryShown || reviewShown || notifyShown || originShown || feedPhone || stormPhone || (phone && plan.liveVisible)) {
        // 本次渲染唯一一次几何读取：推迟到下一帧，全部读完才写。
        nextFrame(ctx.doc, () => {
            if (states.get(root) !== state || state.pageKey !== plan.pageKey) return;
            holdFocusText(state);
            refreshLiveFullOverflow(root, root.querySelector('#igs-text'));
            const stage = measureStage(layers.motion);
            if (!stage) return;
            const anyEntry = entryShown || reviewShown || notifyShown || originShown;
            let top = anyEntry ? entryTop(root, layers.motion, stage.stageH) : 0;
            const left = anyEntry ? entryLeft(root, layers.motion, stage.stageH) : ENTRY_LEFT;
            state.liveStage = stage;
            placeLiveFullName(root, stage);
            const liveFit = phone ? fitLivePhone(host, stage) : null;
            if (phone) applyLiveFit(root, front, liveFit);
            if (phone) fitFaceFor(host, stage, options.sprite, ctx.doc, refit);
            // 入口浮钮避开直播手机：手机左侧放得下就留在外面，放不下就收进手机内、标题行下方。
            const place = entryPlacement(stage, liveFit, top, liveFit && liveFit.layout === 'full' ? liveCardRect(host, layers.motion, stage) : null, liveFit && liveFit.layout === 'full' ? entrySizeOf(front, layers.motion, stage) : 0, left);
            front.style.setProperty('--igs-entry-left', `${place.left}px`);
            if (place.full) front.setAttribute('data-entry-full', '1');
            else front.removeAttribute('data-entry-full');
            top = place.top;
            const step = place.full ? place.step : 0;
            fitLiveSwitch(front, stage);
            if (feedPhone) fitFeedPhone(host, stage);
            if (stormPhone) fitStorm(host, stage, phoneGeometry(stage, ctx.look.model, ctx.look.size));
            watchPhoneStage(state, ctx, layers.motion, refit, Boolean(phone || feedPhone || stormPhone));
            // 四个入口共用一个纵向排列的坞；全屏直播时坞向上多留出 (个数 - 1) 格，让最后一个仍落在名次卡上方。
            const count = (entryShown ? 1 : 0) + (reviewShown ? 1 : 0) + (notifyShown ? 1 : 0) + (originShown ? 1 : 0);
            if (count) placeEntryDock(front, top - Math.max(0, count - 1) * step);
            // 全屏直播标记（data-entry-full）刚写好：全屏时入口不收拢，这里按最新标记再校一次。
            syncEntryFold(front);
            if (plan.inner) playInner(ctx, plan.inner, stage);
        });
    }
    return { live: Boolean(phone), audience: plan.audience.length, inner: Boolean(plan.inner) };
}

// 全屏直播的防挡脸：脸取舞台上立绘的头部（读不到就走默认位置）；手机形态由直播手机自己按手机里的立绘算。
function fitFaceFor(host, stage, sprite, doc, refit) {
    if (!stage) return;
    let info = { w: stage.stageW, h: stage.stageH };
    if (sprite && sprite.url) {
        const probed = peekSpriteHead(sprite.url, doc);
        const shape = spriteGeometry(sprite, probed);
        const rect = shape ? spriteDrawRect(stage.stageW, stage.stageH, shape) : null;
        if (!probed && !faceProbed.has(sprite.url)) {
            faceProbed.add(sprite.url);
            probeSpriteHead(sprite.url, doc).then(() => refit());
        }
        if (rect && shape.head) info = { ...info, rect, head: shape.head };
    }
    fitLiveFace(host, info);
}

// 观众 / 社区 / 通知入口的落点：手机形态直播的手机在场时避开它的 rect。
// 全屏直播：入口挪到右侧人气榜名次卡正上方，右边缘与名次卡对齐、间距 ENTRY_GAP；多个入口往上叠（step 为每格高度）。
// card = 名次卡在舞台里的 { right, top }，size = 入口边长；量不到名次卡时按右内边距 16 与默认卡高估算。
export function entryPlacement(stage, fit, top, card, size, left = ENTRY_LEFT) {
    const base = { left, top };
    if (stage && fit && fit.layout === 'full') {
        const box = size > 0 ? size : ENTRY_ICON_PX;
        const stageW = Number(stage.stageW) || 0;
        const stageH = Number(stage.stageH) || 0;
        const right = card && Number.isFinite(card.right) ? card.right : stageW - 16;
        const cardTop = card && Number.isFinite(card.top) ? card.top : stageH - (Number(fit.floor) || 0) - 52 - 96;
        return { left: Math.round(right - box), top: Math.round(cardTop - ENTRY_GAP - box), step: Math.round(box + ENTRY_GAP), full: true };
    }
    // 手机形态：入口已收进手机顶栏，不再在手机外出现；这里只管没有手机时的原位。
    return base;
}

// 右侧人气榜名次卡（全屏）在舞台里的右边缘与上沿。
function liveCardRect(host, motion, stage) {
    const node = host && host.querySelector ? host.querySelector('.igs-live-rankcard') : null;
    if (!node || typeof node.getBoundingClientRect !== 'function' || typeof motion.getBoundingClientRect !== 'function') return null;
    const r = node.getBoundingClientRect();
    const m = motion.getBoundingClientRect();
    if (!(r.width > 0) || !(m.height > 0)) return null;
    const k = stage.stageH / m.height;
    return { right: (r.right - m.left) * k, top: (r.top - m.top) * k };
}

// 当前显示着的入口浮钮边长（小 / 中 / 大三档，再乘 HUD 缩放）。
function entrySizeOf(front, motion, stage) {
    const node = front && front.querySelector ? front.querySelector(ENTRY_SELECTOR.split(',').map((sel) => `${sel}:not([hidden])`).join(',')) : null;
    if (!node || typeof node.getBoundingClientRect !== 'function' || typeof motion.getBoundingClientRect !== 'function') return ENTRY_ICON_PX;
    const w = node.getBoundingClientRect().width;
    const m = motion.getBoundingClientRect();
    return w > 0 && m.height > 0 ? w * (stage.stageH / m.height) : ENTRY_ICON_PX;
}

// 全屏字幕「名牌下方」的旁白位置：工具栏下沿 + 8px 再让出名牌的高度。
// 直播手机重排结果写到互动壳；全屏字幕模式顺带把字幕位置写到舞台根节点（对话框在根节点下）。
function applyLiveFit(root, front, fit) {
    fitLiveControls(front, fit);
    if (fit && fit.cc) applyLiveCcGeometry(root, fit.cc);
}

function placeLiveFullName(root, stage) {
    if (!root || !root.style || !stage) return;
    root.style.setProperty('--igs-lf-name-top', `${Math.round((Number(stage.topInset) || 0) + 8 + 52)}px`);
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
    if (root && root.querySelector) clearCaptionText(root.querySelector('#igs-text'));
    if (root) clearLiveFull(root, root.querySelector && root.querySelector('#igs-text'));
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
        stopOrigin(front);
        front.remove();
    }
    return Boolean(state);
}
