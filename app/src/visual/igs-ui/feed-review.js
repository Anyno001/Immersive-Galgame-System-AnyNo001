import { LIVE_ICONS } from './danmaku-icons.js';
import { feedPlatformById } from '../../scene/feed-platforms.js';
import { fitFeedPhone, stopFeedPhone, syncFeedPhone } from './feed-phone.js';

// 社区回看入口：社区手机收起后，在观众弹幕小手机入口旁（弹幕关着时在同一位置）出现一个社区图标，
// 点开在前层（可点层）弹出同一个 App 页面，内容就是刚刚刷到的那次区间的帖子（最多 9 条），不生成任何新内容。
// 点遮罩 / 右上角关闭；点按不冒泡到阅读器；换聊天或 cancelDanmaku 时整个清掉。
const STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu']);
const ENTRY_ICON = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="5.5" y="5" width="21" height="22" rx="5.5" fill="rgba(14,16,22,.5)" stroke="currentColor" stroke-width="1.5"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10.5 12h11" stroke-opacity=".9"/><path d="M10.5 16.2h7.5" stroke-opacity=".7"/><path d="M10.5 20.4h9.5" stroke-opacity=".5"/></g></svg>';

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

function closeOverlay(state) {
    if (!state.overlay) return;
    stopFeedPhone(state.host);
    state.overlay.remove();
    state.overlay = null;
    state.host = null;
}

function openOverlay(state) {
    if (state.overlay || !state.info || !state.info.feed) return;
    const { doc } = state;
    const overlay = el(doc, 'div', 'igs-feed-review');
    const host = el(doc, 'div', 'igs-feed-review-host');
    const close = el(doc, 'button', 'igs-feed-review-close');
    close.type = 'button';
    close.innerHTML = LIVE_ICONS.close;
    close.setAttribute('aria-label', '关闭');
    close.title = '关闭';
    overlay.append(host, close);
    // 点遮罩（事件目标就是最外层）关闭；点手机本身只被拦下，不冒泡到阅读器。
    swallow(overlay, (event) => {
        if (event.target === overlay) closeOverlay(state);
    });
    swallow(close, () => closeOverlay(state));
    state.overlay = overlay;
    state.host = host;
    state.front.appendChild(overlay);
    const ctx = state.ctx;
    syncFeedPhone(host, state.info.feed, { ...ctx, review: true, reduced: true });
    const stage = typeof ctx.getStage === 'function' ? ctx.getStage() : null;
    if (stage) fitFeedPhone(host, stage);
}

function buildEntry(state) {
    const { doc } = state;
    const entry = el(doc, 'button', 'igs-feed-entry');
    entry.type = 'button';
    entry.setAttribute('aria-label', '社区');
    entry.title = '社区';
    entry.innerHTML = ENTRY_ICON;
    const dot = el(doc, 'i', 'igs-feed-entry-dot');
    entry.appendChild(dot);
    swallow(entry, () => (state.overlay ? closeOverlay(state) : openOverlay(state)));
    entry.hidden = true;
    return { entry, dot };
}

// 每次渲染调用：info = { feed（刚刷到的那次区间，无则 null）, visible, beside, size }。
export function syncFeedReview(front, info, ctx) {
    let state = reviews.get(front);
    const show = Boolean(info && info.visible && info.feed && feedPlatformById(info.feed.platform));
    if (!state) {
        if (!show) return null;
        state = { front, doc: ctx.doc, overlay: null, host: null, info: null, ctx: null };
        state.els = buildEntry(state);
        front.appendChild(state.els.entry);
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
    const platform = feedPlatformById(info.feed.platform);
    if (state.accent !== platform.accent) {
        state.accent = platform.accent;
        dot.style.setProperty('background', platform.accent);
    }
    const beside = info.beside ? '1' : '0';
    if (entry.getAttribute('data-beside') !== beside) entry.setAttribute('data-beside', beside);
    const size = info.size || 'medium';
    if (entry.getAttribute('data-size') !== size) entry.setAttribute('data-size', size);
    return state;
}

// 入口贴在 HUD 下缘，位置变化才写（与观众弹幕入口同一个 top）。
export function placeFeedEntry(front, top) {
    const state = reviews.get(front);
    if (!state) return;
    const value = `${Math.round(top)}px`;
    if (state.top === value) return;
    state.top = value;
    state.els.entry.style.setProperty('--igs-feed-top', value);
}

export function isFeedEntryShown(front) {
    const state = reviews.get(front);
    return Boolean(state && !state.els.entry.hidden);
}

export function stopFeedReview(front) {
    const state = front && reviews.get(front);
    if (!state) return false;
    closeOverlay(state);
    state.els.entry.remove();
    reviews.delete(front);
    return true;
}
