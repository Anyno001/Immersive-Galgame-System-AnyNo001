import { LIVE_ICONS, PHONE_ENTRY_ICON } from './danmaku-icons.js';
import { claimPanel, mountEntry, releasePanel, unmountEntry } from './entry-dock.js';
import { feedPlatformById } from '../../scene/feed-platforms.js';
import { fitFeedPhone, stopFeedPhone, syncFeedPhone } from './feed-phone.js';

// 社区回看入口：社区手机收起后，在观众弹幕小手机入口旁（弹幕关着时在同一位置）出现一个社区图标，
// 点开在前层（可点层）弹出同一个 App 页面，内容是最近刷到的至多 3 段区间（不同平台或不同主人算不同段）的帖子，不生成任何新内容。
// 多于一段时顶部一行平台小标签（色点 + 平台名）切换，默认最新一段。
// 点遮罩 / 右上角关闭；点按不冒泡到阅读器；换聊天或 cancelDanmaku 时整个清掉；与通知栏互斥（entry-dock 的独占面板）。
const STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu']);

const reviews = new WeakMap();

function el(doc, tag, className) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
}

function swallow(node, fn) {
    for (const name of STOP_EVENTS) {
        node.addEventListener(name, (event) => {
            event.stopPropagation();
            if (name === 'click' && fn) fn(event);
        });
    }
}

const TAB_BELOW = 28;
const TOP_FALLBACK = 14;
// 关闭钮 38px、距右 14px（与 feed-style 一致）；手机宽到压住它时整机下移到钮下方留 8px。
const CLOSE_SIZE = 38;
const CLOSE_RIGHT = 14;
const CLOSE_GAP = 8;

function closeOverlay(state) {
    if (!state.overlay) return;
    stopFeedPhone(state.host);
    state.overlay.remove();
    state.overlay = null;
    state.host = null;
    state.tabBtns = null;
    state.segs = null;
    releasePanel(state.front, state.closer);
}

function segmentsOf(info) {
    const list = info && Array.isArray(info.segments) ? info.segments : [];
    return list.filter((s) => s && Array.isArray(s.posts) && s.posts.length && feedPlatformById(s.platform));
}

// 标签文字：平台名；同一平台出现多段时带上主人名区分。
function tabLabel(seg, list) {
    const name = feedPlatformById(seg.platform).name;
    const dup = list.some((o) => o !== seg && o.platform === seg.platform);
    return dup && seg.owner ? `${name}（${seg.owner}）` : name;
}

// 手机贴在顶置工具栏下沿 + 8px（与直播手机同一算法）；有标签行时再往下让出关闭钮与标签的高度。
function topOf(stage) {
    return stage && stage.topInset > 0 ? Math.round(stage.topInset + 8) : TOP_FALLBACK;
}

function showSeg(state, index) {
    const seg = state.segs && state.segs[index];
    if (!seg) return;
    stopFeedPhone(state.host);
    const ctx = state.ctx;
    syncFeedPhone(state.host, seg, { ...ctx, review: true, reduced: true });
    state.tabBtns.forEach((btn, i) => btn.setAttribute('aria-selected', i === index ? 'true' : 'false'));
    const stage = typeof ctx.getStage === 'function' ? ctx.getStage() : null;
    if (!stage) return;
    const fit = fitFeedPhone(state.host, state.segs.length > 1 ? { ...stage, topInset: topOf(stage) + TAB_BELOW } : stage);
    // 竖屏手机几乎占满宽度，右上角会压在关闭钮下：整机下移到钮下方（手机顶边 = 钮顶 + 钮高 + 8，phoneGeometry 里顶边 = topInset + 8）。
    if (fit && fit.layout === 'phone' && (stage.stageW - fit.width) / 2 < CLOSE_RIGHT + CLOSE_SIZE + CLOSE_GAP) {
        fitFeedPhone(state.host, { ...stage, topInset: topOf(stage) + CLOSE_SIZE });
    }
}

function openOverlay(state) {
    const segs = segmentsOf(state.info);
    if (state.overlay || !segs.length) return;
    // 通知栏开着就先关掉，两个面板不同时盖在舞台上。
    claimPanel(state.front, state.closer);
    const { doc } = state;
    const overlay = el(doc, 'div', 'igs-feed-review');
    const host = el(doc, 'div', 'igs-feed-review-host');
    const close = el(doc, 'button', 'igs-feed-review-close');
    close.type = 'button';
    close.innerHTML = LIVE_ICONS.close;
    close.setAttribute('aria-label', '关闭');
    close.title = '关闭';
    // 标签行：多于一段才显示；点击切换，当前段 aria-selected。
    const tabs = el(doc, 'div', 'igs-feed-review-tabs');
    tabs.hidden = segs.length < 2;
    const btns = segs.map((seg, index) => {
        const btn = el(doc, 'button', 'igs-feed-review-tab');
        btn.type = 'button';
        const dot = el(doc, 'i', 'igs-feed-review-tab-dot');
        dot.style.setProperty('background', feedPlatformById(seg.platform).accent);
        btn.append(dot, doc.createTextNode(tabLabel(seg, segs)));
        swallow(btn, () => showSeg(state, index));
        tabs.appendChild(btn);
        return btn;
    });
    overlay.append(host, tabs, close);
    // 点遮罩（事件目标就是最外层）关闭；点手机本身只被拦下，不冒泡到阅读器。
    swallow(overlay, (event) => {
        if (event.target === overlay) closeOverlay(state);
    });
    swallow(tabs);
    swallow(close, () => closeOverlay(state));
    state.overlay = overlay;
    state.host = host;
    state.segs = segs;
    state.tabBtns = btns;
    // 顶置工具栏会盖住右上角：关闭钮与标签行的顶边取舞台量出的 topInset + 8，与直播手机顶边同一算法。
    const ctx = state.ctx;
    const stage = typeof ctx.getStage === 'function' ? ctx.getStage() : null;
    overlay.style.setProperty('--igs-review-top', `${topOf(stage)}px`);
    state.front.appendChild(overlay);
    showSeg(state, segs.length - 1);
}

function buildEntry(state) {
    const { doc } = state;
    const entry = el(doc, 'button', 'igs-feed-entry');
    entry.type = 'button';
    entry.setAttribute('aria-label', '社区');
    entry.title = '社区';
    entry.innerHTML = PHONE_ENTRY_ICON;
    const dot = el(doc, 'i', 'igs-feed-entry-dot');
    entry.appendChild(dot);
    swallow(entry, () => (state.overlay ? closeOverlay(state) : openOverlay(state)));
    entry.hidden = true;
    return { entry, dot };
}

// 每次渲染调用：info = { segments（最近至多 3 段刷到的区间，旧到新；无则空）, visible, beside, size }。
export function syncFeedReview(front, info, ctx) {
    let state = reviews.get(front);
    const segs = segmentsOf(info);
    const show = Boolean(info && info.visible && segs.length);
    if (!state) {
        if (!show) return null;
        state = { front, doc: ctx.doc, overlay: null, host: null, info: null, ctx: null, segs: null, tabBtns: null };
        state.closer = () => closeOverlay(state);
        state.els = buildEntry(state);
        mountEntry(front, state.els.entry);
        reviews.set(front, state);
    }
    state.info = info;
    state.ctx = ctx;
    const { entry, dot } = state.els;
    if (entry.hidden !== !show) entry.hidden = !show;
    if (!show) {
        closeOverlay(state);
        return state;
    }
    const platform = feedPlatformById(segs[segs.length - 1].platform);
    if (state.accent !== platform.accent) {
        state.accent = platform.accent;
        dot.style.setProperty('background', platform.accent);
    }
    const size = info.size || 'medium';
    if (entry.getAttribute('data-size') !== size) entry.setAttribute('data-size', size);
    return state;
}

export function isFeedEntryShown(front) {
    const state = reviews.get(front);
    return Boolean(state && !state.els.entry.hidden);
}

export function stopFeedReview(front) {
    const state = front && reviews.get(front);
    if (!state) return false;
    closeOverlay(state);
    unmountEntry(front, state.els.entry);
    reviews.delete(front);
    return true;
}
