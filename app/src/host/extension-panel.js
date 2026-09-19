// 扩展菜单注册入口：在 SillyTavern 扩展设置面板挂一个 inline-drawer 抽屉。
// 抽屉内含：启用魔法棒入口 + 打开设置 / 打开阅读器 快捷按钮。
// 依据：扩展设置面板锚点 #extensions_settings2 等，inline-drawer 结构。
const PANEL_ID = 'igs-extension-panel';
const MOUNT_SELECTORS = Object.freeze([
    '#extensions_settings2',
    '#extensions_settings',
    '#third_party_extension_settings',
    '.extensions_settings',
    '#rm_extensions_block .inline-drawer-content',
]);

export function createExtensionPanel(options = {}) {
    const globalObject = options.global || globalThis.window || globalThis;
    const label = options.label || '沉浸式Galgame系统';
    const openSettings = typeof options.openSettings === 'function' ? options.openSettings : null;
    const openReader = typeof options.openReader === 'function' ? options.openReader : null;
    const getEntryConfig = typeof options.getEntryConfig === 'function' ? options.getEntryConfig : () => ({ magic: true });
    const setEntryConfig = typeof options.setEntryConfig === 'function' ? options.setEntryConfig : () => {};

    let retryTimer = null;
    let attached = false;

    return { attach, destroy, refresh, getState };

    function attach() {
        attached = true;
        ensurePanel();
        return { ok: true };
    }

    function refresh() {
        if (!attached) return { ok: false, reason: 'not-attached' };
        const panel = getDoc() && getDoc().getElementById(PANEL_ID);
        if (panel) renderPanel(panel);
        return { ok: true };
    }

    function destroy() {
        attached = false;
        if (retryTimer) { clearHostTimeout(retryTimer); retryTimer = null; }
        const doc = getDoc();
        const panel = doc && doc.getElementById(PANEL_ID);
        if (panel && typeof panel.remove === 'function') panel.remove();
        return { ok: true, reason: 'destroyed' };
    }

    function ensurePanel() {
        const doc = getDoc();
        const mount = findMount(doc);
        if (!mount) {
            if (retryTimer) clearHostTimeout(retryTimer);
            retryTimer = setHostTimeout(ensurePanel, 1800);
            return;
        }
        let panel = doc.getElementById(PANEL_ID);
        if (!panel) {
            panel = doc.createElement('div');
            panel.id = PANEL_ID;
            mount.appendChild(panel);
        }
        renderPanel(panel);
    }

    function renderPanel(panel) {
        const cfg = safeEntryConfig();
        panel.innerHTML = `
            <div class="inline-drawer">
              <div class="inline-drawer-toggle inline-drawer-header">
                <b>${escapeHtml(label)}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
              </div>
              <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" data-igs-entry="magic"${cfg.magic ? ' checked' : ''}> 启用魔法棒入口</label>
                <div class="igs-ext-actions" style="display:flex;gap:8px;margin-top:8px">
                  <button type="button" class="menu_button" data-igs-ext-act="open-settings" style="flex:1;white-space:nowrap">打开设置</button>
                  <button type="button" class="menu_button" data-igs-ext-act="open-reader" style="flex:1;white-space:nowrap">打开阅读器</button>
                </div>
              </div>
            </div>
        `;
        bindPanel(panel);
    }

    function bindPanel(panel) {
        const checks = panel.querySelectorAll('[data-igs-entry]');
        Array.prototype.forEach.call(checks, (input) => {
            input.addEventListener('change', () => {
                const cfg = safeEntryConfig();
                cfg[input.getAttribute('data-igs-entry')] = !!input.checked;
                setEntryConfig({ magic: !!cfg.magic });
            });
        });
        const buttons = panel.querySelectorAll('[data-igs-ext-act]');
        Array.prototype.forEach.call(buttons, (button) => {
            button.addEventListener('click', (event) => {
                if (event) event.preventDefault();
                const act = button.getAttribute('data-igs-ext-act');
                if (act === 'open-settings' && openSettings) openSettings();
                else if (act === 'open-reader' && openReader) openReader();
            });
        });
    }

    function safeEntryConfig() {
        try {
            const cfg = getEntryConfig() || {};
            return { magic: cfg.magic !== false };
        } catch (error) {
            return { magic: true };
        }
    }

    function getState() {
        return { attached, panelId: PANEL_ID };
    }

    function getDoc() {
        try { return globalObject.document || (typeof document !== 'undefined' ? document : null); }
        catch (error) { return null; }
    }

    function findMount(doc) {
        if (!doc || typeof doc.querySelector !== 'function') return null;
        for (const selector of MOUNT_SELECTORS) {
            try {
                const node = doc.querySelector(selector);
                if (node) return node;
            } catch (error) { /* ignore */ }
        }
        return null;
    }

    function setHostTimeout(fn, ms) {
        const setter = globalObject && typeof globalObject.setTimeout === 'function' ? globalObject.setTimeout.bind(globalObject) : setTimeout;
        return setter(fn, ms);
    }

    function clearHostTimeout(timer) {
        const clearer = globalObject && typeof globalObject.clearTimeout === 'function' ? globalObject.clearTimeout.bind(globalObject) : clearTimeout;
        clearer(timer);
    }
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
}
