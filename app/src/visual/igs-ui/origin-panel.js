// 随身系统入口与悬浮窗（Origin 系统 原作 vicliaaa，经授权移植）。
// 入口挂进前层入口坞（排在铃铛后），有新事件亮红点；点开悬浮窗，与通知栏、回看弹窗互斥（entry-dock 的 claimPanel）。
// 点按不冒泡到阅读器；窗口可拖动，四角拖尺寸，位置尺寸记在本机。核心逻辑全部在引擎里，这里只做界面。
import { LIVE_ICONS } from './danmaku-icons.js';
import { claimPanel, mountEntry, releasePanel, unmountEntry } from './entry-dock.js';
import { createIgsModal } from './igs-modal.js';
import { attachedOriginBinding } from './origin-attach.js';
import { normalizeOriginSettings, visibleOriginMenuPages, visibleOriginTabs } from './origin-settings.js';
import { runOriginAction } from './origin-panel-actions.js';
import { renderOriginBody, renderOriginEmpty, renderOriginFoot, renderOriginHead, renderOriginTabs } from './origin-panel-view.js';
import { clampRect, defaultRect, moveRect, readStoredRect, resizeRect, writeStoredRect } from './origin-panel-geometry.js';

const STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu']);
const CORNERS = Object.freeze(['nw', 'ne', 'sw', 'se']);
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// 头部与行尾图标：关闭、更多沿用 danmaku-icons 的 LIVE_ICONS（24 视框、1.6 线宽），暂停 / 播放 / 设置按同一规格补齐。
const ICONS = Object.freeze({
    pause: svg('<path d="M9 6v12M15 6v12"/>'),
    play: svg('<path d="M8 6l10 6-10 6z"/>'),
    gear: svg('<path d="M5 8h14M5 16h14"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/>'),
    close: LIVE_ICONS.close,
    more: LIVE_ICONS.more,
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    chevron: svg('<path d="M7 10l5 5 5-5"/>'),
});
// 入口图标：与其它入口同规格（32 视框、1.6 线宽），圆环加圆点，收在 5 到 27 的留白内。
export const ORIGIN_ENTRY_ICON = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="9.4"/><circle cx="16" cy="16" r="2.6"/></svg>';

const views = new WeakMap();

// ---- 接入点 ----
// 正式接线走 origin-attach.js 的 attachOriginEngine(engine, hooks)：阅读器每次渲染经 danmaku-runtime 调到这里读登记表。
// 测试或单独预览可以直接给 options.origin()：{ engine, settings, modal?, notice?(level, text), openSettings?(), saveSetting?(key, value) }，优先于登记表。
// engine 即 createOriginEngine(host) 的返回值；settings 是 bridge.origin。没接引擎、总开关关闭时返回 null，入口不出现。
export function resolveOriginBinding(options) {
    const provider = options && options.origin;
    let raw = null;
    try { raw = typeof provider === 'function' ? provider() : attachedOriginBinding(); } catch (error) { raw = null; }
    if (!raw || !raw.engine || typeof raw.engine.getState !== 'function' || typeof raw.engine.subscribe !== 'function') return null;
    const settings = normalizeOriginSettings(raw.settings);
    return settings.enabled ? { ...raw, settings } : null;
}

// host.notify({ kind, text }) → 阅读器内的细线提示（generation-strip），不弹 toastr。
// 细线的 info 级只在出图忙时显示，success 会清掉出图失败状态，所以统一走通用的 note 级。
export function createOriginNotify(getStrip) {
    return (event) => {
        const text = String(event && event.text != null ? event.text : '').trim();
        const strip = typeof getStrip === 'function' ? getStrip() : null;
        if (!text || !strip || typeof strip.notice !== 'function') return false;
        strip.notice('note', text);
        return true;
    };
}

function el(doc, tag, className) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
}

function swallow(node, onClick) {
    for (const name of STOP_EVENTS) {
        node.addEventListener(name, (event) => {
            event.stopPropagation();
            if (name === 'click' && onClick) onClick(event);
        });
    }
}

function storageOf(view) {
    try { return view.doc.defaultView.localStorage; } catch (error) { return null; }
}

function stageOf(view) {
    const s = view.ctx && typeof view.ctx.getStage === 'function' ? view.ctx.getStage() : null;
    const w = (s && s.stageW) || view.front.clientWidth || 0;
    const h = (s && s.stageH) || view.front.clientHeight || 0;
    return { w: w > 0 ? w : 800, h: h > 0 ? h : 600 };
}

// 舞台可能被外层 transform 缩放：指针位移换回舞台自己的 CSS 像素。
function scaleOf(view, stage) {
    const rect = typeof view.front.getBoundingClientRect === 'function' ? view.front.getBoundingClientRect() : null;
    return rect && rect.width > 0 ? stage.w / rect.width : 1;
}

function applyRect(view) {
    if (!view.win) return;
    const stage = stageOf(view);
    const mode = stage.w <= 640 ? 'phone' : 'pc';
    if (!view.rect || view.rectMode !== mode) {
        const dock = view.front.querySelector ? view.front.querySelector(':scope > .igs-entry-dock') : null;
        const dockBox = dock ? { right: (dock.offsetLeft || 0) + (dock.offsetWidth || 0), top: dock.offsetTop || 0 } : null;
        view.rect = readStoredRect(storageOf(view), mode, stage) || defaultRect(stage, dockBox);
        view.rectMode = mode;
    }
    view.rect = clampRect(view.rect, stage);
    writeVars(view);
}

function writeVars(view) {
    const style = view.win.style;
    style.setProperty('--igs-or-x', `${view.rect.left}px`);
    style.setProperty('--igs-or-y', `${view.rect.top}px`);
    style.setProperty('--igs-or-w', `${view.rect.width}px`);
    style.setProperty('--igs-or-h', `${view.rect.height}px`);
}

function syncDot(view) {
    const { entry, dot } = view.els;
    const mark = view.unread ? '1' : '0';
    if (entry.getAttribute('data-unread') !== mark) entry.setAttribute('data-unread', mark);
    if (dot.hidden === view.unread) dot.hidden = !view.unread;
}

function getModal(view) {
    if (view.binding.modal) return view.binding.modal;
    if (!view.modal) view.modal = createIgsModal({ getHost: () => view.front, global: view.doc.defaultView || globalThis });
    return view.modal;
}

function setBox(view, key, box, html) {
    if (view.cache[key] === html) return false;
    view.cache[key] = html;
    box.innerHTML = html;
    return true;
}

function renderWin(view) {
    const win = view.win;
    if (!win) return;
    const { engine, binding } = view;
    const settings = binding.settings;
    const state = engine.getState();
    const boxes = view.boxes;
    if (!state) {
        setBox(view, 'top', boxes.top, renderOriginEmpty(settings, ICONS));
        setBox(view, 'tabs', boxes.tabs, '');
        setBox(view, 'body', boxes.body, '');
        setBox(view, 'foot', boxes.foot, '');
        return;
    }
    if (!visibleOriginTabs(settings).some((t) => t.id === view.tab)) view.tab = 'task';
    if (view.page && !visibleOriginMenuPages(settings).some((p) => p.id === view.page)) view.page = '';
    const shown = view.page || view.tab;
    let lastFloor = null;
    try { lastFloor = typeof engine.lastFloorStatus === 'function' ? engine.lastFloorStatus() : null; } catch (error) { lastFloor = null; }
    // 检测到原插件的旧存档时，顶部给一行导入提示（导入不覆盖原数据）。
    let legacy = false;
    try { legacy = typeof engine.legacyDetected === 'function' && typeof engine.importLegacy === 'function' ? Boolean(engine.legacyDetected()) : false; } catch (error) { legacy = false; }
    const ui = { icons: ICONS, openRows: view.openRows, taskFilter: view.taskFilter, gachaFilter: view.gachaFilter, ddOpen: view.ddOpen, page: view.page, menuOpen: view.menuOpen, canOpenSettings: typeof binding.openSettings === 'function', lastFloor, legacy, turn: state.turn };
    setBox(view, 'top', boxes.top, renderOriginHead(state, settings, ui));
    setBox(view, 'tabs', boxes.tabs, renderOriginTabs(settings, view.tab, view.page));
    // 底栏（主按钮 + 小字链接 / 对话输入框）：二级页没有；内容不变不重写，输入中的文字不会丢。
    setBox(view, 'foot', boxes.foot, view.page ? '' : renderOriginFoot(view.tab, settings));
    if (boxes.foot.hidden !== !boxes.foot.innerHTML) boxes.foot.hidden = !boxes.foot.innerHTML;
    const body = boxes.body;
    const html = `<div class="igs-or-pane">${renderOriginBody(shown, state, settings, ui)}</div>`;
    if (view.cache.body === html && view.renderedTab === shown) return;
    // 重绘前记下滚动位置，重绘后还原；对话页贴底时跟到最新一条。
    const scroll = body.scrollTop;
    const nearBottom = body.scrollHeight - body.clientHeight - scroll < 40;
    const tabChanged = view.renderedTab !== shown;
    view.cache.body = html;
    body.innerHTML = html;
    view.renderedTab = shown;
    body.scrollTop = shown === 'chat' && (tabChanged || nearBottom) ? body.scrollHeight : (tabChanged ? 0 : scroll);
}

function makeActionCtx(view) {
    return {
        engine: view.engine,
        get settings() { return view.binding.settings; },
        get modal() { return getModal(view); },
        notice: (level, text) => notify(view, level, text),
        setTab: (id) => { if (view.tab !== id || view.page) view.openRows.clear(); view.tab = id; view.page = ''; view.menuOpen = false; view.ddOpen = ''; renderWin(view); },
        openPage: (id) => { view.openRows.clear(); view.page = id; view.menuOpen = false; renderWin(view); },
        back: () => { view.openRows.clear(); view.page = ''; renderWin(view); },
        toggleMenu: () => { view.menuOpen = !view.menuOpen; view.ddOpen = ''; renderWin(view); },
        closeMenu: () => { if (view.menuOpen) { view.menuOpen = false; renderWin(view); } },
        // 下拉在滚动区里：打开后把菜单滚进视野，靠近底部时不会被裁掉。
        toggleDropdown: (kind) => {
            view.ddOpen = view.ddOpen === kind ? '' : kind;
            view.menuOpen = false;
            renderWin(view);
            const menu = view.ddOpen && view.boxes && view.boxes.body.querySelector ? view.boxes.body.querySelector('.igs-or-ghd .igs-or-menu') : null;
            if (menu && typeof menu.scrollIntoView === 'function') menu.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },
        pickFilter: (kind, id) => {
            if (kind === 'task') view.taskFilter = id || 'all';
            else if (kind === 'gacha') view.gachaFilter = id || 'all';
            view.ddOpen = '';
            view.openRows.clear();
            renderWin(view);
        },
        // 同时只开一行：点开新的一行时收起其余。
        toggleRow: (key) => {
            const was = view.openRows.has(key);
            view.openRows.clear();
            if (!was) view.openRows.add(key);
            renderWin(view);
            if (!was) revealOpen(view, key);
        },
        close: () => closeWin(view),
        openSettings: () => { if (typeof view.binding.openSettings === 'function') view.binding.openSettings(); },
        saveSetting: (key, value) => { if (typeof view.binding.saveSetting === 'function') view.binding.saveSetting(key, value); },
        readChatInput: () => { const input = view.win && view.win.querySelector('[data-or-chat]'); return input ? input.value : ''; },
        clearChatInput: () => { const input = view.win && view.win.querySelector('[data-or-chat]'); if (input) input.value = ''; },
    };
}

// 点开的块超出可视区时滚进视野（平滑、就近）。
function revealOpen(view, key) {
    const body = view.boxes && view.boxes.body;
    if (!body || !body.querySelectorAll) return;
    const node = Array.from(body.querySelectorAll('[data-or-open-key]')).find((n) => n.getAttribute('data-or-open-key') === key);
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function notify(view, level, text) {
    if (typeof view.binding.notice === 'function') view.binding.notice(level, text);
}

function runAction(view, name, target) {
    return runOriginAction(name, target, makeActionCtx(view))
        .then(() => { if (view.win) renderWin(view); })
        .catch((error) => { notify(view, 'warn', `操作没有完成：${error && error.message ? error.message : error}`); });
}

function startPointer(view, event, corner) {
    if (event.button !== undefined && event.button !== 0) return;
    const doc = view.doc;
    const stage = stageOf(view);
    const k = scaleOf(view, stage);
    const start = { ...view.rect };
    const sx = event.clientX;
    const sy = event.clientY;
    if (event.cancelable) event.preventDefault();
    view.win.setAttribute('data-dragging', '1');
    const move = (e) => {
        const dx = (e.clientX - sx) * k;
        const dy = (e.clientY - sy) * k;
        view.rect = corner ? resizeRect(start, corner, dx, dy, stage) : moveRect(start, dx, dy, stage);
        writeVars(view);
    };
    const finish = () => {
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', finish);
        doc.removeEventListener('pointercancel', finish);
        view.dragCleanup = null;
        if (view.win) view.win.removeAttribute('data-dragging');
        writeStoredRect(storageOf(view), view.rectMode, view.rect);
    };
    view.dragCleanup = finish;
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', finish);
    doc.addEventListener('pointercancel', finish);
}

function buildWin(view) {
    const { doc } = view;
    const win = el(doc, 'div', 'igs-or-win');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', '随身系统');
    const top = el(doc, 'div', 'igs-or-top');
    const tabs = el(doc, 'div', 'igs-or-tabbox');
    const body = el(doc, 'div', 'igs-or-body');
    const foot = el(doc, 'div', 'igs-or-foot');
    win.append(top, tabs, body, foot);
    for (const corner of CORNERS) {
        const handle = el(doc, 'div', 'igs-resize-handle');
        handle.setAttribute('data-igs-corner', corner);
        handle.addEventListener('pointerdown', (event) => { event.stopPropagation(); startPointer(view, event, corner); });
        win.appendChild(handle);
    }
    win.addEventListener('pointerdown', (event) => {
        const head = event.target && event.target.closest ? event.target.closest('[data-or-drag]') : null;
        if (head && !event.target.closest('button')) startPointer(view, event, null);
    });
    win.addEventListener('keydown', (event) => {
        // Esc 逐级退：先收菜单，再退二级页，最后关窗。
        if (event.key === 'Escape') {
            event.preventDefault();
            if (view.menuOpen || view.ddOpen) { view.menuOpen = false; view.ddOpen = ''; renderWin(view); } else if (view.page) { view.page = ''; view.openRows.clear(); renderWin(view); } else closeWin(view);
            return;
        }
        // 可点开的行头是 role=button 的 div：回车 / 空格与点击等价。
        if ((event.key === 'Enter' || event.key === ' ') && event.target && event.target.getAttribute && event.target.getAttribute('data-oa') === 'row') {
            event.preventDefault();
            runAction(view, 'row', event.target);
            return;
        }
        if (event.key === 'Enter' && !event.isComposing && event.target && event.target.hasAttribute && event.target.hasAttribute('data-or-chat')) {
            event.preventDefault();
            const send = win.querySelector('[data-oa="chat-send"],[data-oa="chat-call"]');
            if (send) send.click();
        }
    });
    swallow(win, (event) => {
        const target = event.target && event.target.closest ? event.target.closest('[data-oa]') : null;
        const name = target && win.contains(target) ? target.getAttribute('data-oa') : '';
        // 菜单或下拉开着时，点它们以外的地方先收起（点的若是按钮，按钮照常生效）。
        const inPopup = Boolean(target && target.closest('.igs-or-menu'));
        if (view.menuOpen && name !== 'menu' && !inPopup) { view.menuOpen = false; renderWin(view); }
        if (view.ddOpen && name !== 'dd-toggle' && !inPopup) { view.ddOpen = ''; renderWin(view); }
        if (name) runAction(view, name, target);
    });
    view.boxes = { top, tabs, body, foot };
    return win;
}

function openWin(view) {
    if (view.win) return;
    claimPanel(view.front, view.closer);
    view.cache = {};
    view.renderedTab = '';
    view.menuOpen = false;
    view.ddOpen = '';
    view.win = buildWin(view);
    view.front.appendChild(view.win);
    applyRect(view);
    view.unread = false;
    syncDot(view);
    renderWin(view);
}

function closeWin(view) {
    if (!view.win) return;
    if (view.dragCleanup) view.dragCleanup();
    view.win.remove();
    view.win = null;
    view.boxes = null;
    view.cache = {};
    releasePanel(view.front, view.closer);
}

function buildEntry(view) {
    const entry = el(view.doc, 'button', 'igs-or-entry');
    entry.type = 'button';
    entry.setAttribute('aria-label', '随身系统');
    entry.title = '随身系统';
    entry.innerHTML = ORIGIN_ENTRY_ICON;
    const dot = el(view.doc, 'i', 'igs-or-entry-dot');
    dot.hidden = true;
    entry.appendChild(dot);
    swallow(entry, () => (view.win ? closeWin(view) : openWin(view)));
    return { entry, dot };
}

function onEngineChange(view, change) {
    // 切聊天（引擎重新加载）：分类回到「全部」、收起展开的行。筛选只在本聊天、本窗口生命周期内记住，关窗再开保持。
    if (change && change.type === 'load') {
        view.taskFilter = 'all';
        view.gachaFilter = 'all';
        view.openRows.clear();
        view.ddOpen = '';
    }
    if (view.win) {
        renderWin(view);
        return;
    }
    // 窗口收起时引擎有新事件：入口亮红点，打开即视为已读。
    if (!view.unread) {
        view.unread = true;
        syncDot(view);
    }
}

// 每次渲染调用：binding 为 resolveOriginBinding 的结果，null 表示不显示。ctx = { doc, size, getStage }。
export function syncOrigin(front, binding, ctx) {
    let view = views.get(front);
    if (!binding) {
        if (view) stopOrigin(front);
        return null;
    }
    if (view && view.engine !== binding.engine) {
        stopOrigin(front);
        view = null;
    }
    if (!view) {
        view = { front, doc: ctx.doc, engine: binding.engine, binding, ctx, win: null, boxes: null, cache: {}, tab: 'task', page: '', menuOpen: false, ddOpen: '', taskFilter: 'all', gachaFilter: 'all', openRows: new Set(), unread: false, rect: null, rectMode: '', renderedTab: '', dragCleanup: null, modal: null };
        view.closer = () => closeWin(view);
        view.els = buildEntry(view);
        syncDot(view);
        mountEntry(front, view.els.entry);
        const off = binding.engine.subscribe((state, change) => onEngineChange(view, change));
        view.unsub = typeof off === 'function' ? off : null;
        views.set(front, view);
    }
    view.binding = binding;
    view.ctx = ctx;
    const size = (ctx && ctx.size) || 'medium';
    if (view.els.entry.getAttribute('data-size') !== size) view.els.entry.setAttribute('data-size', size);
    if (view.win) {
        applyRect(view);
        renderWin(view);
    }
    return view;
}

export function isOriginEntryShown(front) {
    const view = front && views.get(front);
    return Boolean(view && !view.els.entry.hidden);
}

export function isOriginOpen(front) {
    const view = front && views.get(front);
    return Boolean(view && view.win);
}

export function stopOrigin(front) {
    const view = front && views.get(front);
    if (!view) return false;
    closeWin(view);
    if (view.modal) view.modal.cancel();
    if (view.unsub) view.unsub();
    unmountEntry(front, view.els.entry);
    views.delete(front);
    return true;
}
