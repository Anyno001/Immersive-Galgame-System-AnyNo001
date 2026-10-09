import { LIVE_ICONS } from './danmaku-icons.js';
import { feedPlatformById } from '../../scene/feed-platforms.js';
import { spamAllowed, spamBrandColor, spamKindOf } from '../../scene/spam-sms.js';

// 手机通知中心：把阅读中出现过的手机消息（通知、未接来电、语音留言、风暴评论、@ 到你的帖子）攒起来，
// HUD 下小手机区多一个铃铛入口，点开从顶部滑下一个只读的通知栏，按 App 分组。
// 文字全部来自正文，前端只给来源 App 配图标与颜色；只存内存（按聊天），点遮罩关闭，点按不冒泡到阅读器。
export const NOTICE_MAX = 50;
const KEYS_MAX = 400;
const GROUP_SHOW = 3;
const STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu']);

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = Object.freeze({
    bell: svg('<path d="M6.2 16.8V11a5.8 5.8 0 0 1 11.6 0v5.8l1.5 1.7H4.7z"/><path d="M10 20.6a2.2 2.2 0 0 0 4 0"/>'),
    phone: svg('<path d="M6.6 3.8 9.4 4l1.2 3.6-1.8 1.5a11 11 0 0 0 6.1 6.1l1.5-1.8 3.6 1.2.2 2.8c0 1-.8 1.8-1.8 1.8C10.8 19.2 4.8 13.2 4.8 5.6c0-1 .8-1.8 1.8-1.8z"/>'),
    voicemail: svg('<circle cx="7" cy="12" r="3.2"/><circle cx="17" cy="12" r="3.2"/><path d="M7 15.2h10"/>'),
    chat: svg('<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.2a1.5 1.5 0 0 1-1.5 1.5h-7l-4.2 3v-3H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/>'),
    storm: svg('<path d="M12 21.4c3.5 0 5.9-2.3 5.9-5.7 0-2.6-1.5-4.5-2.9-6.1-.4 1.5-1.2 2.5-2.3 2.9.5-2.9-.6-6-3.1-8.3-.2 3.1-1.8 4.9-3.1 6.5-1.2 1.4-2.3 3-2.3 5 0 3.4 2.4 5.7 5.8 5.7z"/>'),
});
const FIXED_APPS = Object.freeze({
    notify: { name: '通知', accent: '#4c8bf5', icon: 'bell' },
    call: { name: '电话', accent: '#2fb36d', icon: 'phone' },
    voicemail: { name: '语音留言', accent: '#8a63d2', icon: 'voicemail' },
    storm: { name: '舆论风暴', accent: '#e5484d', icon: 'storm' },
});

// 设置 readerSettings.notifyCenter：enabled 默认开（但只有手机类演出有内容时才会出现入口）。
export function normalizeNotifyCenterSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { enabled: src.enabled !== false };
}

export function appMeta(app) {
    const fixed = FIXED_APPS[app];
    if (fixed) return fixed;
    const platform = feedPlatformById(app);
    if (platform) return { name: platform.name, accent: platform.accent, icon: 'chat' };
    return FIXED_APPS.notify;
}

function text(value) {
    return String(value == null ? '' : value).trim();
}

function mentionsUser(body, userName) {
    const t = String(body || '');
    return t.includes('@你') || (Boolean(userName) && t.includes(`@${userName}`));
}

// 纯函数：从本页快照里挑出该记的通知，不碰 DOM。
// 帖子与评论只收本页新出现的（fresh），免得同一条随翻页重复记。
export function collectNotices(snapshot, { userName = '', feedOn = false, stormOn = false } = {}) {
    const content = (snapshot && snapshot.content) || {};
    const fx = content.fx || {};
    const base = { messageId: snapshot ? snapshot.messageId : '', page: Number(content.currentIndex) || 0 };
    const out = [];
    const spamOn = spamAllowed(snapshot && snapshot.readerSettings);
    for (const item of Array.isArray(fx.instants) ? fx.instants : []) {
        if (!item) continue;
        if (item.kind === 'notify' && text(item.text)) {
            const spam = spamOn ? spamKindOf(item.sender, item.text) : null;
            out.push({ ...base, kind: 'notify', app: 'notify', from: text(item.sender), text: text(item.text), ...(spam ? { spam: spam.kind, spamColor: spamBrandColor(spam.brand) } : {}) });
        }
        else if (item.kind === 'voicemail' && text(item.text)) out.push({ ...base, kind: 'voicemail', app: 'voicemail', from: text(item.sender), text: text(item.text) });
        else if (item.kind === 'call-end' && item.reason === 'missed') out.push({ ...base, kind: 'missed', app: 'call', from: text(item.name), text: '' });
    }
    if (stormOn && fx.storm && Array.isArray(fx.storm.mentions)) {
        const app = feedPlatformById(fx.storm.platform) ? fx.storm.platform : 'storm';
        for (const m of fx.storm.mentions) {
            if (m && m.fresh !== false && text(m.text)) out.push({ ...base, kind: 'mention', app, from: text(m.author), text: text(m.text) });
        }
    }
    if (feedOn && fx.feed && Array.isArray(fx.feed.posts)) {
        for (const p of fx.feed.posts) {
            if (p && p.fresh === true && mentionsUser(p.text, userName)) out.push({ ...base, kind: 'post', app: fx.feed.platform, from: text(p.author), text: text(p.text) });
        }
    }
    return out;
}

export function createNoticeStore(chatId = '') {
    return { chatId, items: [], keys: new Set(), unread: 0, version: 0 };
}

// 记入通知：同楼同页同类同文去重（清除后不会因重渲染又冒出来），最多 NOTICE_MAX 条，返回新增条数。
export function recordNotices(store, notices) {
    let added = 0;
    for (const n of notices) {
        const key = `${n.messageId}|${n.page}|${n.kind}|${n.from}|${n.text}`;
        if (store.keys.has(key)) continue;
        store.keys.add(key);
        if (store.keys.size > KEYS_MAX) store.keys.delete(store.keys.values().next().value);
        store.items.push(n);
        added += 1;
    }
    if (store.items.length > NOTICE_MAX) store.items.splice(0, store.items.length - NOTICE_MAX);
    if (added) {
        store.unread = Math.min(store.items.length, store.unread + added);
        store.version += 1;
    }
    return added;
}

export function clearNotices(store) {
    store.items.length = 0;
    store.unread = 0;
    store.version += 1;
}

// 按 App 分组：组按最近一条排序，组内新的在前。
export function groupNotices(items) {
    const groups = new Map();
    for (let i = items.length - 1; i >= 0; i -= 1) {
        const n = items[i];
        if (!groups.has(n.app)) groups.set(n.app, []);
        groups.get(n.app).push(n);
    }
    return Array.from(groups, ([app, list]) => ({ app, list }));
}

const stores = new WeakMap();

// 按舞台根记仓库；换聊天（chatId 变了）清空。cancelDanmaku 不丢仓库。
export function noticeStoreFor(root, chatId) {
    const id = String(chatId == null ? '' : chatId);
    let store = stores.get(root);
    if (!store || store.chatId !== id) {
        store = createNoticeStore(id);
        stores.set(root, store);
    }
    return store;
}

const views = new WeakMap();

function el(doc, tag, className, content) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
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

export function groupNode(doc, group) {
    const meta = appMeta(group.app);
    const box = el(doc, 'div', 'igs-nc-group');
    box.setAttribute('data-app', group.app);
    const head = el(doc, 'div', 'igs-nc-head');
    const ico = el(doc, 'span', 'igs-nc-ico');
    ico.innerHTML = ICONS[meta.icon] || '';
    const dot = el(doc, 'i', 'igs-nc-dot');
    dot.style.setProperty('background', meta.accent);
    head.append(ico, dot, el(doc, 'span', 'igs-nc-app', meta.name), el(doc, 'span', 'igs-nc-count', String(group.list.length)));
    box.appendChild(head);
    for (const n of group.list.slice(0, GROUP_SHOW)) {
        const row = el(doc, 'div', 'igs-nc-item');
        row.setAttribute('data-kind', n.kind);
        const top = el(doc, 'div', 'igs-nc-top');
        if (n.spam) {
            row.setAttribute('data-spam', n.spam);
            const sdot = el(doc, 'i', 'igs-nc-spamdot');
            sdot.style.setProperty('background', n.spamColor || '#ff5000');
            top.appendChild(sdot);
        }
        if (n.from) top.appendChild(el(doc, 'span', 'igs-nc-from', n.from));
        if (n.spam) top.appendChild(el(doc, 'span', 'igs-nc-ad', '广告'));
        top.appendChild(el(doc, 'span', 'igs-nc-floor', `第 ${n.messageId} 楼`));
        row.append(top, el(doc, 'div', 'igs-nc-text', n.text || (n.kind === 'missed' ? '未接来电' : '')));
        box.appendChild(row);
    }
    if (group.list.length > GROUP_SHOW) box.appendChild(el(doc, 'div', 'igs-nc-more', `还有 ${group.list.length - GROUP_SHOW} 条`));
    return box;
}

function renderList(view) {
    const { doc, list, store } = view;
    for (const child of Array.from(list.children)) child.remove();
    for (const group of groupNotices(store.items)) list.appendChild(groupNode(doc, group));
    view.rendered = store.version;
}

function syncBadge(view) {
    const { badge, entry } = view.els;
    const unread = view.store.unread;
    const label = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread <= 0;
    if (badge.textContent !== label) badge.textContent = label;
    entry.setAttribute('data-unread', unread > 0 ? '1' : '0');
}

function closePanel(view) {
    if (!view.overlay) return;
    view.overlay.remove();
    view.overlay = null;
    view.list = null;
}

function openPanel(view) {
    if (view.overlay || !view.store.items.length) return;
    const { doc } = view;
    const overlay = el(doc, 'div', 'igs-nc');
    const panel = el(doc, 'div', 'igs-nc-panel');
    const bar = el(doc, 'div', 'igs-nc-bar');
    const clear = el(doc, 'button', 'igs-nc-clear', '全部清除');
    clear.type = 'button';
    const close = el(doc, 'button', 'igs-nc-close');
    close.type = 'button';
    close.innerHTML = LIVE_ICONS.close;
    close.setAttribute('aria-label', '关闭');
    close.title = '关闭';
    bar.append(el(doc, 'span', 'igs-nc-title', '通知'), clear, close);
    const list = el(doc, 'div', 'igs-nc-list');
    panel.append(bar, list);
    overlay.appendChild(panel);
    swallow(overlay, (event) => {
        if (event.target === overlay) closePanel(view);
    });
    swallow(panel);
    swallow(close, () => closePanel(view));
    swallow(clear, () => {
        clearNotices(view.store);
        closePanel(view);
        syncBadge(view);
        view.els.entry.hidden = true;
    });
    view.overlay = overlay;
    view.list = list;
    view.front.appendChild(overlay);
    renderList(view);
    // 打开即视为已读。
    view.store.unread = 0;
    syncBadge(view);
}

function buildEntry(view) {
    const { doc } = view;
    const entry = el(doc, 'button', 'igs-nc-entry');
    entry.type = 'button';
    entry.setAttribute('aria-label', '通知');
    entry.title = '通知';
    entry.innerHTML = ICONS.bell;
    const badge = el(doc, 'span', 'igs-nc-badge', '');
    badge.hidden = true;
    entry.appendChild(badge);
    swallow(entry, () => (view.overlay ? closePanel(view) : openPanel(view)));
    entry.hidden = true;
    return { entry, badge };
}

// 每次渲染调用：info = { store, size }；仓库为空时入口收起，面板开着则跟着刷新。
export function syncNotify(front, info, ctx) {
    let view = views.get(front);
    const store = info && info.store;
    const show = Boolean(store && store.items.length);
    if (!view) {
        if (!show) return null;
        view = { front, doc: ctx.doc, store, overlay: null, list: null, rendered: -1 };
        view.els = buildEntry(view);
        front.appendChild(view.els.entry);
        views.set(front, view);
    }
    view.store = store || view.store;
    const { entry } = view.els;
    if (entry.hidden !== !show) entry.hidden = !show;
    if (!show) {
        closePanel(view);
        return view;
    }
    if (view.overlay) {
        // 面板开着时来了新消息：直接并入并保持已读。
        if (view.rendered !== store.version) renderList(view);
        store.unread = 0;
    }
    syncBadge(view);
    const size = (info && info.size) || 'medium';
    if (entry.getAttribute('data-size') !== size) entry.setAttribute('data-size', size);
    return view;
}

// 入口贴在 HUD 下缘，排在观众弹幕入口、回看入口之后（slot = 前面已有几个入口）；变化才写。
export function placeNotifyEntry(front, top, slot) {
    const view = views.get(front);
    if (!view) return;
    const value = `${Math.round(top)}px`;
    if (view.top !== value) {
        view.top = value;
        view.els.entry.style.setProperty('--igs-nc-top', value);
    }
    if (view.slot !== slot) {
        view.slot = slot;
        view.els.entry.style.setProperty('--igs-nc-slot', String(slot));
    }
}

export function isNotifyEntryShown(front) {
    const view = views.get(front);
    return Boolean(view && !view.els.entry.hidden);
}

export function stopNotify(front) {
    const view = front && views.get(front);
    if (!view) return false;
    closePanel(view);
    view.els.entry.remove();
    views.delete(front);
    return true;
}
