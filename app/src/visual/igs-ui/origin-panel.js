// 随身系统整页（Origin 系统 原作 vicliaaa，经授权移植）。
// 入口在状态栏资料菜单（日记那一列），点开铺满舞台，外壳与日记、人物状态同一套（毛玻璃底、页头、四套配色）。
// 核心逻辑全部在引擎里，这里只做界面；页面打开时才订阅引擎，关着不占资源。
import { LIVE_ICONS } from './danmaku-icons.js';
import { createIgsModal } from './igs-modal.js';
import { attachedOriginBinding } from './origin-attach.js';
import { normalizeOriginSettings, visibleOriginMenuPages, visibleOriginTabs } from './origin-settings.js';
import { runOriginAction } from './origin-panel-actions.js';
import { originPageTitle, renderOriginBody, renderOriginEmpty, renderOriginFoot, renderOriginHead, renderOriginTabs } from './origin-panel-view.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { esc } from './reader-value-utils.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
import { setStagePauseReason } from './stage-pause.js';

export const ORIGIN_PAGE_ID = 'igs-origin-page';
const PAUSE_REASON = 'panel:origin';
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// 行尾与页头小图标：更多沿用 danmaku-icons 的 LIVE_ICONS（24 视框、1.6 线宽），设置 / 下拉按同一规格补齐。
const ICONS = Object.freeze({
    gear: svg('<path d="M5 8h14M5 16h14"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/>'),
    more: LIVE_ICONS.more,
    chevron: svg('<path d="M7 10l5 5 5-5"/>'),
});

// ---- 接入点 ----
// 正式接线走 origin-attach.js 的 attachOriginEngine(engine, hooks)，这里读登记表。
// 测试或单独预览可以直接给 options.origin()：{ engine, settings, modal?, notice?(level, text), openSettings?(), saveSetting?(key, value) }，优先于登记表。
// 没接引擎、总开关关闭时返回 null，资料菜单里不出入口。
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

// options：{ origin?()（同 resolveOriginBinding）, getTheme?(), setTheme?(theme) }。
export function createOriginPageController(doc, options = {}) {
    let view = null;
    // 关掉再开回到上次的页签。
    let lastTab = 'task';
    const readTheme = () => { try { return normalizeSettingsTheme(options.getTheme?.() || ''); } catch (error) { return normalizeSettingsTheme(''); } };

    function el(tag, className) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function getModal() {
        if (view.binding.modal) return view.binding.modal;
        if (!view.modal) view.modal = createIgsModal({ getHost: () => view.root, global: doc.defaultView || globalThis });
        return view.modal;
    }

    function setBox(key, box, html) {
        if (view.cache[key] === html) return false;
        view.cache[key] = html;
        box.innerHTML = html;
        return true;
    }

    function themeSwitchHtml() {
        if (typeof options.setTheme !== 'function') return '';
        return `<div class="igs-rp-theme-switch" role="radiogroup" aria-label="界面配色">${renderSettingsThemeSwitch(view.theme, {
            optionClass: 'igs-rp-theme-option', attrs: (value) => `data-oa="theme" data-id="${value}"` })}</div>`;
    }

    function render() {
        if (!view) return;
        const { engine, binding, boxes } = view;
        const settings = binding.settings;
        const state = engine.getState();
        const page = state && view.page && visibleOriginMenuPages(settings).some((p) => p.id === view.page) ? view.page : '';
        view.page = page;
        setBox('head', boxes.head, recordPageHeadHtml(esc(originPageTitle(settings, page)), {
            closeAttr: 'data-oa', backAriaLabel: page ? '返回' : '关闭', trailing: themeSwitchHtml(),
        }));
        if (!state) {
            setBox('top', boxes.top, '');
            setBox('tabs', boxes.tabs, '');
            setBox('body', boxes.body, renderOriginEmpty());
            setBox('foot', boxes.foot, '');
            boxes.foot.hidden = true;
            return;
        }
        if (!visibleOriginTabs(settings).some((t) => t.id === view.tab)) view.tab = 'task';
        const shown = page || view.tab;
        let lastFloor = null;
        try { lastFloor = typeof engine.lastFloorStatus === 'function' ? engine.lastFloorStatus() : null; } catch (error) { lastFloor = null; }
        // 检测到原插件的旧存档时，顶部给一行导入提示（导入不覆盖原数据）。
        let legacy = false;
        try { legacy = typeof engine.legacyDetected === 'function' && typeof engine.importLegacy === 'function' ? Boolean(engine.legacyDetected()) : false; } catch (error) { legacy = false; }
        const ui = { icons: ICONS, openRows: view.openRows, taskFilter: view.taskFilter, gachaFilter: view.gachaFilter, ddOpen: view.ddOpen, page, menuOpen: view.menuOpen, canOpenSettings: typeof binding.openSettings === 'function', lastFloor, legacy, turn: state.turn };
        setBox('top', boxes.top, renderOriginHead(state, settings, ui));
        setBox('tabs', boxes.tabs, renderOriginTabs(settings, view.tab, page));
        // 底栏（主按钮 + 小字链接 / 对话输入框）：二级页没有；内容不变不重写，输入中的文字不会丢。
        setBox('foot', boxes.foot, page ? '' : renderOriginFoot(view.tab, settings));
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

    // 点开的块超出可视区时滚进视野（平滑、就近）。
    function revealOpen(key) {
        const body = view && view.boxes.body;
        if (!body || !body.querySelectorAll) return;
        const node = Array.from(body.querySelectorAll('[data-or-open-key]')).find((n) => n.getAttribute('data-or-open-key') === key);
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function notify(level, text) {
        if (view && typeof view.binding.notice === 'function') view.binding.notice(level, text);
    }

    function back() {
        view.openRows.clear();
        view.page = '';
        render();
    }

    function makeActionCtx() {
        const v = view;
        return {
            engine: v.engine,
            get settings() { return v.binding.settings; },
            get modal() { return getModal(); },
            notice: (level, text) => notify(level, text),
            setTab: (id) => { if (v.tab !== id || v.page) v.openRows.clear(); v.tab = id; v.page = ''; v.menuOpen = false; v.ddOpen = ''; render(); },
            openPage: (id) => { v.openRows.clear(); v.page = id; v.menuOpen = false; render(); },
            back,
            toggleMenu: () => { v.menuOpen = !v.menuOpen; v.ddOpen = ''; render(); },
            closeMenu: () => { if (v.menuOpen) { v.menuOpen = false; render(); } },
            // 下拉在滚动区里：打开后把菜单滚进视野，靠近底部时不会被裁掉。
            toggleDropdown: (kind) => {
                v.ddOpen = v.ddOpen === kind ? '' : kind;
                v.menuOpen = false;
                render();
                const menu = v.ddOpen && v.boxes.body.querySelector ? v.boxes.body.querySelector('.igs-or-ghd .igs-or-menu') : null;
                if (menu && typeof menu.scrollIntoView === 'function') menu.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            },
            pickFilter: (kind, id) => {
                if (kind === 'task') v.taskFilter = id || 'all';
                else if (kind === 'gacha') v.gachaFilter = id || 'all';
                v.ddOpen = '';
                v.openRows.clear();
                render();
            },
            // 同时只开一行：点开新的一行时收起其余。
            toggleRow: (key) => {
                const was = v.openRows.has(key);
                v.openRows.clear();
                if (!was) v.openRows.add(key);
                render();
                if (!was) revealOpen(key);
            },
            // 页头返回键：二级页先退回主页，主页再关闭。
            close: () => { if (v.page) back(); else close(); },
            openSettings: () => { if (typeof v.binding.openSettings === 'function') { close(); v.binding.openSettings(); } },
            saveSetting: (key, value) => { if (typeof v.binding.saveSetting === 'function') v.binding.saveSetting(key, value); },
            readChatInput: () => { const input = v.root.querySelector('[data-or-chat]'); return input ? input.value : ''; },
            clearChatInput: () => { const input = v.root.querySelector('[data-or-chat]'); if (input) input.value = ''; },
        };
    }

    function runAction(name, target) {
        if (name === 'theme') {
            view.theme = normalizeSettingsTheme(target.getAttribute('data-id'));
            view.root.setAttribute('data-rp-theme', view.theme);
            try { options.setTheme?.(view.theme); } catch (error) { /* 保存失败只影响下次打开 */ }
            render();
            return Promise.resolve();
        }
        const current = view;
        return runOriginAction(name, target, makeActionCtx())
            .then(() => { if (view === current) render(); })
            .catch((error) => { notify('warn', `操作没有完成：${error && error.message ? error.message : error}`); });
    }

    function onClick(event) {
        event.stopPropagation();
        const target = event.target && event.target.closest ? event.target.closest('[data-oa]') : null;
        const name = target && view.root.contains(target) ? target.getAttribute('data-oa') : '';
        // 菜单或下拉开着时，点它们以外的地方先收起（点的若是按钮，按钮照常生效）。
        const inPopup = Boolean(target && target.closest('.igs-or-menu'));
        if (view.menuOpen && name !== 'menu' && !inPopup) { view.menuOpen = false; render(); }
        if (view.ddOpen && name !== 'dd-toggle' && !inPopup) { view.ddOpen = ''; render(); }
        if (name) runAction(name, target);
    }

    function onKeydown(event) {
        // 可点开的行头是 role=button 的 div：回车 / 空格与点击等价。
        if ((event.key === 'Enter' || event.key === ' ') && event.target && event.target.getAttribute && event.target.getAttribute('data-oa') === 'row') {
            event.preventDefault();
            runAction('row', event.target);
            return;
        }
        if (event.key === 'Enter' && !event.isComposing && event.target && event.target.hasAttribute && event.target.hasAttribute('data-or-chat')) {
            event.preventDefault();
            const send = view.root.querySelector('[data-oa="chat-send"],[data-oa="chat-call"]');
            if (send) send.click();
        }
    }

    function onEngineChange(state, change) {
        if (!view) return;
        // 切聊天（引擎重新加载）：分类回到「全部」、收起展开的行。
        if (change && change.type === 'load') {
            view.taskFilter = 'all';
            view.gachaFilter = 'all';
            view.openRows.clear();
            view.ddOpen = '';
        }
        render();
    }

    function open(overlay) {
        if (view) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc || !doc.createElement) return { ok: false, reason: 'missing-origin-container' };
        const binding = resolveOriginBinding(options);
        if (!binding) return { ok: false, reason: 'origin-disabled' };
        const root = el('div');
        root.id = ORIGIN_PAGE_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', binding.settings.sysName || '随身系统');
        const theme = readTheme();
        root.setAttribute('data-rp-theme', theme);
        const pageEl = el('div', 'igs-rp-page');
        const head = el('div', 'igs-or-headbox');
        const rpBody = el('div', 'igs-rp-body');
        const col = el('div', 'igs-or-col');
        const top = el('div', 'igs-or-top');
        const tabs = el('div', 'igs-or-tabbox');
        const body = el('div', 'igs-or-body');
        const foot = el('div', 'igs-or-foot');
        col.append(top, tabs, body, foot);
        rpBody.appendChild(col);
        pageEl.append(head, rpBody);
        root.appendChild(pageEl);
        view = {
            root, overlay, binding, engine: binding.engine, theme, previousFocus: doc.activeElement || null,
            boxes: { head, top, tabs, body, foot }, cache: {}, renderedTab: '', tab: lastTab, page: '', menuOpen: false, ddOpen: '',
            taskFilter: 'all', gachaFilter: 'all', openRows: new Set(), modal: null, unsub: null, unwatch: null,
        };
        root.addEventListener('click', onClick);
        root.addEventListener('keydown', onKeydown);
        overlay.appendChild(root);
        view.unwatch = watchRecordPageLayout(root, doc);
        overlay.classList?.toggle('igs-record-screen-open', true);
        setStagePauseReason(overlay, PAUSE_REASON, true);
        const off = binding.engine.subscribe(onEngineChange);
        view.unsub = typeof off === 'function' ? off : null;
        render();
        root.querySelector('[data-oa="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        if (!view) return { ok: true, reason: 'not-open' };
        const v = view;
        view = null;
        lastTab = v.tab;
        try { if (v.modal) v.modal.cancel(); } catch (error) { /* 已关闭 */ }
        try { if (v.unsub) v.unsub(); } catch (error) { /* 引擎已卸载 */ }
        try { v.unwatch?.(); } catch (error) { /* 已断开 */ }
        v.root.removeEventListener('click', onClick);
        v.root.removeEventListener('keydown', onKeydown);
        v.root.remove();
        v.overlay.classList?.remove('igs-record-screen-open');
        setStagePauseReason(v.overlay, PAUSE_REASON, false);
        v.previousFocus?.focus?.();
        return { ok: true };
    }

    // Esc 逐级退：弹窗归弹窗自己处理；再收菜单 / 下拉，再退二级页，最后关闭整页。返回 false 表示这次 Esc 不归本页。
    function escape() {
        if (!view) return false;
        if (view.root.querySelector('.igs-page-modal')) return false;
        if (view.menuOpen || view.ddOpen) { view.menuOpen = false; view.ddOpen = ''; render(); } else if (view.page) back(); else close();
        return true;
    }

    return { open, close, dispose: close, escape, isOpen: () => Boolean(view), reload: () => { if (view) render(); } };
}
