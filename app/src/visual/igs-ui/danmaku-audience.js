import { DANMAKU_PERSONA_LABELS, DANMAKU_SPEED_SECONDS } from './danmaku-settings.js';
import { randomItem } from './danmaku-pools.js';

// 观众弹幕（正文外的小剧场）：平时只是 HUD 下方一台半透明小手机，来新弹幕时亮角标、抖一下；
// 用户点开才「掏出手机」进 B 站视频页——上方小视频窗滚弹幕，下方是本楼到当前页为止的弹幕列表。
// 关着时零动画；滚动只发生在视频窗里，节点封顶，超出丢弃。
export const AUDIENCE_LOG_LIMIT = 150;
const LOG_FLOORS = 4;
export const AUDIENCE_VIDEO_CAP = Object.freeze({ sparse: 10, medium: 14, dense: 18 });
const FLOOD_COPIES = Object.freeze({ sparse: 5, medium: 8, dense: 12 });
const COLOR_PALETTE = Object.freeze(['#fe0302', '#ff7204', '#ffaa02', '#ffd302', '#00cd00', '#00a2ff', '#cc0273']);
const TOP_LIFE = 4000;
const TRACK_GAP = 16;
const SECONDS_PER_PAGE = 8;
const LEAVE_MS = 380;

const PHONE_ICON = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="8" y="3" width="16" height="26" rx="3.5" fill="rgba(12,14,20,.55)" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5h8M11 15h10M13 19.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="25.5" r="1" fill="currentColor"/></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

const audiences = new WeakMap();

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function swallow(node, events, fn) {
    for (const name of events) {
        node.addEventListener(name, (event) => {
            event.stopPropagation();
            if (name === 'click' && fn) fn(event);
        });
    }
}

// 按字形估算宽度，免去逐条测量：CJK 记 1em，半角记 0.55em。
export function estimateTextWidth(value, fontSize) {
    let units = 0;
    for (const ch of String(value || '')) units += ch.charCodeAt(0) > 0xff ? 1 : 0.55;
    return Math.ceil(units * fontSize) + 8;
}

// B 站式防追尾：轨道空出（前一条尾巴离开右缘）且新弹幕在前一条完全出屏之前追不上它时才可用。
export function pickScrollTrack(tracks, count, now, width, stageW, durationMs) {
    const speed = (stageW + width) / durationMs;
    const reachLeft = now + stageW / speed;
    for (let i = 0; i < count; i += 1) {
        const lane = tracks[i];
        if (!lane || (now >= lane.freeAt && reachLeft >= lane.exitAt)) return i;
    }
    return -1;
}

export function formatDanmakuTime(page) {
    const total = Math.max(0, Math.floor(Number(page) || 0)) * SECONDS_PER_PAGE;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// 本楼弹幕记录：按楼层保留最近几层，每层封顶，最旧的先丢。
export function appendAudienceLog(log, messageId, page, groups) {
    const key = String(messageId);
    const rows = log.get(key) || [];
    log.delete(key);
    log.set(key, rows);
    const added = [];
    for (const group of groups) {
        for (const line of group.lines) {
            const row = { page, text: line, ai: group.ai, style: group.style };
            rows.push(row);
            added.push(row);
        }
    }
    if (rows.length > AUDIENCE_LOG_LIMIT) rows.splice(0, rows.length - AUDIENCE_LOG_LIMIT);
    while (log.size > LOG_FLOORS) log.delete(log.keys().next().value);
    return added;
}

function later(state, bucket, fn, ms) {
    const timer = state.schedule(() => {
        bucket.delete(timer);
        fn();
    }, ms);
    bucket.add(timer);
}

function clearBucket(state, bucket) {
    for (const timer of bucket) state.clear(timer);
    bucket.clear();
}

function buildEntry(state) {
    const entry = el(state.doc, 'button', 'igs-aud-entry');
    entry.type = 'button';
    entry.setAttribute('aria-label', '观众弹幕');
    entry.setAttribute('title', '观众弹幕');
    entry.innerHTML = PHONE_ICON;
    const badge = el(state.doc, 'span', 'igs-aud-badge', '');
    badge.hidden = true;
    entry.appendChild(badge);
    swallow(entry, ['click', 'pointerdown', 'mousedown', 'touchstart'], () => openViewer(state));
    entry.hidden = true;
    return { entry, badge };
}

function rowNode(doc, row) {
    const node = el(doc, 'div', 'igs-aud-row');
    if (row.ai) node.setAttribute('data-ai', '1');
    node.append(el(doc, 'span', 'igs-aud-time', formatDanmakuTime(row.page)), el(doc, 'span', 'igs-aud-text', row.text));
    return node;
}

function setBackground(node, url) {
    node.style.backgroundImage = url ? `url("${String(url).replace(/"/g, '%22')}")` : '';
}

function buildViewer(state) {
    const { doc } = state;
    const stage = el(doc, 'div', 'igs-aud-stage');
    const dim = el(doc, 'div', 'igs-aud-dim');
    const phone = el(doc, 'div', 'igs-aud-phone');
    const video = el(doc, 'div', 'igs-aud-video');
    const frame = el(doc, 'div', 'igs-aud-frame');
    const sprite = el(doc, 'img', 'igs-aud-sprite');
    sprite.alt = '';
    sprite.hidden = true;
    const lanes = el(doc, 'div', 'igs-aud-lanes');
    const back = el(doc, 'span', 'igs-aud-back');
    back.innerHTML = BACK_ICON;
    const progress = el(doc, 'div', 'igs-aud-progress');
    const fill = el(doc, 'i', '');
    progress.appendChild(fill);
    video.append(frame, sprite, lanes, back, progress);
    const info = el(doc, 'div', 'igs-aud-info');
    const title = el(doc, 'div', 'igs-aud-title', '');
    const sub = el(doc, 'div', 'igs-aud-sub', '');
    info.append(title, sub);
    const tabs = el(doc, 'div', 'igs-aud-tabs');
    tabs.appendChild(el(doc, 'span', '', '简介'));
    const tab = el(doc, 'span', 'is-active', '弹幕 ');
    const count = el(doc, 'b', '', '0');
    tab.appendChild(count);
    tabs.appendChild(tab);
    const list = el(doc, 'div', 'igs-aud-list');
    const bar = el(doc, 'div', 'igs-aud-bar');
    bar.append(el(doc, 'span', 'igs-aud-dm-toggle', '弹'), el(doc, 'span', 'igs-aud-input', '发个友善的弹幕见证当下'));
    phone.append(video, info, tabs, list, bar);
    stage.append(dim, phone);
    swallow(stage, ['click', 'pointerdown', 'mousedown', 'touchstart', 'wheel', 'dblclick'], null);
    swallow(dim, ['click'], () => closeViewer(state, true));
    swallow(back, ['click'], () => closeViewer(state, true));
    return { stage, frame, sprite, lanes, fill, title, sub, count, list, tracks: [], tops: [], active: 0, geo: null, timers: new Set() };
}

function refreshViewer(state) {
    const view = state.view;
    const info = state.info;
    if (!view || !info) return;
    const rows = state.log.get(String(info.messageId)) || [];
    if (view.frameUrl !== info.frame.bg) {
        view.frameUrl = info.frame.bg;
        setBackground(view.frame, info.frame.bg);
    }
    if (view.spriteUrl !== info.frame.sprite) {
        view.spriteUrl = info.frame.sprite;
        if (info.frame.sprite) view.sprite.src = info.frame.sprite;
        view.sprite.hidden = !info.frame.sprite;
    }
    view.fill.style.width = `${Math.round(Math.max(0, Math.min(1, info.progress)) * 100)}%`;
    const titleText = info.title || '本话';
    if (view.title.textContent !== titleText) view.title.textContent = titleText;
    const subText = `${DANMAKU_PERSONA_LABELS[info.settings.persona] || '观众'}正在围观 · ${rows.length} 条弹幕`;
    if (view.sub.textContent !== subText) view.sub.textContent = subText;
    view.count.textContent = String(rows.length);
}

function videoGeometry(view) {
    const w = Number(view.lanes.clientWidth);
    const h = Number(view.lanes.clientHeight);
    if (!(w > 0) || !(h > 0)) return null;
    const fontSize = Math.round(Math.max(12, Math.min(16, h * 0.08)));
    const lineH = Math.round(fontSize * 1.35);
    return { w, fontSize, lineH, lanes: Math.max(2, Math.floor((h * 0.86) / lineH)) };
}

function spawnVideoLine(state, row) {
    const view = state.view;
    const geo = view && view.geo;
    if (!geo) return;
    const aud = state.info.settings;
    if (view.active >= AUDIENCE_VIDEO_CAP[aud.density] + (row.ai ? 4 : 0)) return;
    const node = el(state.doc, 'div', 'igs-aud-item', row.text);
    if (row.ai) node.setAttribute('data-ai', '1');
    if (row.style === 'color') node.style.color = randomItem(COLOR_PALETTE, state.rng);
    const now = state.now();
    let life;
    if (row.style === 'top' || state.info.reduced) {
        const lanes = Math.min(3, geo.lanes);
        let lane = view.tops.findIndex((until) => !(until > now));
        if (lane < 0) lane = view.tops.length < lanes ? view.tops.length : (row.ai ? 0 : -1);
        if (lane < 0) return;
        view.tops[lane] = now + TOP_LIFE;
        node.classList.add('is-top');
        node.style.top = `${lane * geo.lineH}px`;
        life = TOP_LIFE;
    } else {
        const duration = DANMAKU_SPEED_SECONDS[aud.speed] * 1000;
        const width = estimateTextWidth(row.text, geo.fontSize);
        let lane = pickScrollTrack(view.tracks, geo.lanes, now, width, geo.w, duration);
        if (lane < 0) {
            if (!row.ai) return;
            lane = Math.floor(state.rng() * geo.lanes);
        }
        view.tracks[lane] = { freeAt: now + (width + TRACK_GAP) / ((geo.w + width) / duration), exitAt: now + duration };
        node.style.top = `${lane * geo.lineH}px`;
        node.style.setProperty('--igs-dm-run', `${-(geo.w + width)}px`);
        node.style.setProperty('--igs-dm-dur', `${duration}ms`);
        life = duration;
    }
    view.lanes.appendChild(node);
    view.active += 1;
    later(state, view.timers, () => {
        node.remove();
        view.active = Math.max(0, view.active - 1);
    }, life + 60);
}

function playRows(state, rows) {
    const view = state.view;
    if (!view || !rows.length) return;
    const density = state.info.settings.density;
    let delay = 0;
    for (const row of rows) {
        const copies = row.style === 'flood' ? FLOOD_COPIES[density] : 1;
        for (let i = 0; i < copies; i += 1) {
            later(state, view.timers, () => spawnVideoLine(state, row), delay + Math.round(state.rng() * 140));
            delay += row.style === 'flood' ? 130 : row.ai ? 380 : 480;
        }
    }
}

function appendRows(state, rows) {
    const { list } = state.view;
    for (const row of rows) list.appendChild(rowNode(state.doc, row));
    while (list.children.length > AUDIENCE_LOG_LIMIT) list.children[0].remove();
    const view = state.view;
    // 滚到底要读 scrollHeight，放到下一帧，避免在渲染路径里强制排版。
    state.frame(() => {
        if (state.view === view) list.scrollTop = list.scrollHeight;
    });
}

function openViewer(state) {
    if (state.view || !state.info) return;
    state.view = buildViewer(state);
    state.unread = 0;
    syncBadge(state);
    const rows = state.log.get(String(state.info.messageId)) || [];
    for (const row of rows) state.view.list.appendChild(rowNode(state.doc, row));
    refreshViewer(state);
    state.front.appendChild(state.view.stage);
    const view = state.view;
    // 用户主动打开时读一次视频窗尺寸，之后翻页复用；读完才滚本页弹幕。
    state.frame(() => {
        if (state.view !== view) return;
        view.list.scrollTop = view.list.scrollHeight;
        view.geo = videoGeometry(view);
        if (view.geo) view.lanes.style.setProperty('--igs-aud-font', `${view.geo.fontSize}px`);
        playRows(state, rows.filter((row) => row.page === state.info.page));
    });
}

function closeViewer(state, animate) {
    const view = state.view;
    if (!view) return;
    state.view = null;
    clearBucket(state, view.timers);
    if (!animate || state.info.reduced) {
        view.stage.remove();
        return;
    }
    view.stage.setAttribute('data-leaving', '1');
    later(state, state.timers, () => view.stage.remove(), LEAVE_MS);
}

function syncBadge(state) {
    const { badge, entry } = state.els;
    const text = state.unread > 99 ? '99+' : String(state.unread);
    badge.hidden = state.unread <= 0;
    if (badge.textContent !== text) badge.textContent = text;
    entry.setAttribute('data-unread', state.unread > 0 ? '1' : '0');
}

// 每次渲染调用：记录本页新弹幕、刷新入口角标；手机打开时直接进列表并在视频窗里滚。
export function syncAudience(front, info, ctx) {
    let state = audiences.get(front);
    if (!state) {
        state = { front, doc: ctx.doc, log: new Map(), unread: 0, view: null, info: null, timers: new Set(), pulse: 0 };
        state.els = buildEntry(state);
        front.appendChild(state.els.entry);
        audiences.set(front, state);
    }
    Object.assign(state, { schedule: ctx.schedule, clear: ctx.clear, now: ctx.now, rng: ctx.rng, frame: ctx.frame });
    const floorChanged = state.info && String(state.info.messageId) !== String(info.messageId);
    state.info = info;
    if (floorChanged) {
        state.unread = 0;
        if (state.view) closeViewer(state, false);
    }
    const added = info.groups.length ? appendAudienceLog(state.log, info.messageId, info.page, info.groups) : [];
    const hasRows = (state.log.get(String(info.messageId)) || []).length > 0;
    const show = info.visible && hasRows;
    if (state.els.entry.hidden !== !show) state.els.entry.hidden = !show;
    if (!info.visible && state.view) closeViewer(state, false);
    if (state.view) {
        refreshViewer(state);
        if (added.length) {
            appendRows(state, added);
            playRows(state, added);
        }
    } else if (added.length) {
        state.unread += added.length;
        state.pulse = state.pulse === 1 ? 2 : 1;
        state.els.entry.setAttribute('data-pulse', String(state.pulse));
    }
    syncBadge(state);
    return state;
}

// 入口贴在 HUD 下缘（HUD 隐藏时回到左上角），只在位置变化时写。
export function placeAudienceEntry(front, top) {
    const state = audiences.get(front);
    if (!state) return;
    const value = `${Math.round(top)}px`;
    if (state.top === value) return;
    state.top = value;
    state.els.entry.style.setProperty('--igs-aud-top', value);
}

export function isAudienceEntryShown(front) {
    const state = audiences.get(front);
    return Boolean(state && !state.els.entry.hidden);
}

export function stopAudience(front) {
    const state = front && audiences.get(front);
    if (!state) return false;
    if (state.view) closeViewer(state, false);
    clearBucket(state, state.timers);
    state.els.entry.remove();
    audiences.delete(front);
    return true;
}
