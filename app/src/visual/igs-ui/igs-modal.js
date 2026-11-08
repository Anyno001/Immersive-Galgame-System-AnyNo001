// 页面内的提示、确认和输入。挂在阅读器或当前层上，不调用浏览器 alert / confirm / prompt。
// 浏览器那三个弹窗会退出全屏；这里的层在全屏元素里面，全屏保持不变。

import { SETTINGS_THEME_BASE, SETTINGS_THEME_OPTIONS, getSettingsThemePalette, normalizeSettingsTheme } from './settings-theme.js';

const STYLE_ID = 'igs-page-modal-style';

// 提示类小浮层（确认 / 输入 / 续读弹窗）跟设置器同一套四色：实色面板、主题墨色、高亮色做主按钮。
// 没给配色时用地雷色（SETTINGS_THEME_BASE）。
const HINT_SCOPES = '.igs-page-modal';
const hintThemeVars = (theme) => {
    const { tokens } = getSettingsThemePalette(theme);
    return `--igs-hint-bg:${tokens.panel};--igs-hint-ink:${tokens.ink};--igs-hint-soft:${tokens['ink-2']};--igs-hint-field:${tokens.field};--igs-hint-fill:${tokens.highlight};`
        + `--igs-hint-accent:${tokens.accent};--igs-hint-on-accent:${tokens['on-accent']};--igs-hint-shadow:${tokens['shell-shadow']};`;
};
export const IGS_HINT_THEME_STYLE_TEXT = [
    `${HINT_SCOPES}{${hintThemeVars(SETTINGS_THEME_BASE)}}`,
    ...SETTINGS_THEME_OPTIONS.map(({ value }) => HINT_SCOPES.split(',').map((scope) => `${scope}[data-igs-hint-theme="${value}"]`).join(',') + `{${hintThemeVars(value)}}`),
].join('\n');

export const IGS_MODAL_STYLE_TEXT = `
${IGS_HINT_THEME_STYLE_TEXT}
.igs-page-modal{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:24px;background:rgba(0,0,0,.38);color:var(--igs-hint-ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;animation:igs-page-modal-fade .18s ease both;}
.igs-page-modal-card{width:min(400px,100%);display:flex;flex-direction:column;gap:18px;box-sizing:border-box;padding:24px 22px 16px;border-radius:14px;background:var(--igs-hint-bg);box-shadow:var(--igs-hint-shadow);animation:igs-page-modal-rise .22s cubic-bezier(.2,.8,.2,1) both;}
.igs-page-modal-msg{margin:0;font-size:15px;line-height:1.7;letter-spacing:.04em;white-space:pre-line;word-break:break-word;}
.igs-page-modal-card{max-height:100%;overflow:auto;}
.igs-page-modal-preview{display:block;max-width:100%;max-height:55vh;object-fit:contain;align-self:center;}
.igs-page-modal-card-comparison{width:min(1100px,100%);}
.igs-page-modal-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;}
.igs-page-modal-comparison figure{margin:0;min-width:0;display:flex;flex-direction:column;gap:10px;}
.igs-page-modal-comparison figcaption{font-size:13px;color:var(--igs-hint-soft);text-align:center;}
@media (max-width:640px){.igs-page-modal-comparison{grid-template-columns:1fr;}.igs-page-modal-comparison .igs-page-modal-preview{max-height:35vh;}}
@media (pointer:coarse){.igs-page-modal-actions button{min-height:44px;}}
.igs-page-modal-input{width:100%;box-sizing:border-box;margin:0;padding:9px 12px;border-radius:8px;border:0;outline:0;background:var(--igs-hint-field);color:inherit;font:inherit;font-size:14px;}
.igs-page-modal-input:focus{box-shadow:inset 0 0 0 1.5px var(--igs-hint-accent);}
.igs-page-modal-quantity{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--igs-hint-soft);}
.igs-page-modal-summary{margin:0;font-size:14px;line-height:1.6;overflow-wrap:anywhere;}
.igs-page-modal-actions button:disabled{opacity:.45;cursor:not-allowed;}
.igs-page-modal-actions{display:flex;justify-content:center;gap:8px;}
.igs-page-modal-actions button{min-height:40px;padding:0 16px;border:0;border-radius:8px;background:transparent;color:var(--igs-hint-soft);font:inherit;font-size:13px;letter-spacing:.08em;cursor:pointer;transition:background .15s,opacity .15s;}
.igs-page-modal-actions button:hover,.igs-page-modal-actions button:focus-visible{background:var(--igs-hint-fill);color:var(--igs-hint-ink);outline:none;}
.igs-page-modal-actions [data-igs-modal="pick"]{background:var(--igs-hint-field);color:var(--igs-hint-ink);font-weight:600;}
.igs-page-modal-actions [data-igs-modal="ok"]{background:var(--igs-hint-accent);color:var(--igs-hint-on-accent);font-weight:600;}
.igs-page-modal-actions [data-igs-modal="ok"]:hover,.igs-page-modal-actions [data-igs-modal="ok"]:focus-visible{background:var(--igs-hint-accent);color:var(--igs-hint-on-accent);opacity:.88;}
@keyframes igs-page-modal-fade{from{opacity:0;}to{opacity:1;}}
@keyframes igs-page-modal-rise{from{opacity:0;transform:translateY(6px) scale(.98);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){.igs-page-modal,.igs-page-modal-card{animation:none;}}
`;

function ensureStyle(doc) {
    if (!doc || typeof doc.createElement !== 'function') return;
    if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    if (style.setAttribute) style.setAttribute('id', STYLE_ID);
    else style.id = STYLE_ID;
    style.textContent = IGS_MODAL_STYLE_TEXT;
    const parent = doc.head || doc.body || doc.documentElement;
    if (parent && typeof parent.appendChild === 'function') parent.appendChild(style);
}

function hostOf(getHost, globalObj) {
    const host = typeof getHost === 'function' ? getHost() : null;
    const doc = (host && host.ownerDocument) || (globalObj && globalObj.document) || null;
    // 浮窗阅读器带 translateX(-50%)，再挂 position:fixed 会相对浮窗而不是屏幕。
    // 全屏元素优先，否则挂文档根，遮罩才能盖住整块可见区域并居中。
    const fullscreen = doc && (doc.fullscreenElement || doc.webkitFullscreenElement);
    if (fullscreen && typeof fullscreen.appendChild === 'function') return fullscreen;
    if (doc && doc.documentElement && typeof doc.documentElement.appendChild === 'function') return doc.documentElement;
    if (host && typeof host.appendChild === 'function') return host;
    return doc && (doc.body || doc.documentElement);
}

function pinToVisibleScreen(el, doc) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    const win = doc && doc.defaultView;
    const viewport = win && win.visualViewport;
    const left = viewport && Number.isFinite(viewport.offsetLeft) ? viewport.offsetLeft : 0;
    const top = viewport && Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0;
    const width = viewport && Number(viewport.width) > 0 ? Number(viewport.width) : Number(win && win.innerWidth);
    const height = viewport && Number(viewport.height) > 0 ? Number(viewport.height) : Number(win && win.innerHeight);
    if (!(width > 0) || !(height > 0)) return;
    el.style.setProperty('left', `${Math.round(left)}px`);
    el.style.setProperty('top', `${Math.round(top)}px`);
    el.style.setProperty('width', `${Math.round(width)}px`);
    el.style.setProperty('height', `${Math.round(height)}px`);
    el.style.setProperty('right', 'auto');
    el.style.setProperty('bottom', 'auto');
}

export function createIgsModal({ getHost = () => null, getTheme = () => '', global: globalObj = globalThis } = {}) {
    let pending = null;

    function detach(entry) {
        const el = entry && entry.el;
        if (el && el.parentNode && typeof el.parentNode.removeChild === 'function') el.parentNode.removeChild(el);
        if (entry) entry.el = null;
    }

    function settle(entry, result) {
        if (!entry || pending !== entry) return;
        pending = null;
        detach(entry);
        if (entry.kind === 'progress' && result === false) entry.onCancel?.();
        entry.resolve(result);
    }

    function cancelValue(entry) {
        if (entry.kind === 'confirm' || entry.kind === 'progress') return false;
        if (entry.kind === 'alert') return true;
        return null;
    }

    function mount(entry) {
        const host = hostOf(getHost, globalObj);
        const doc = (host && host.ownerDocument) || (globalObj && globalObj.document);
        if (!host || !doc || typeof doc.createElement !== 'function') return null;
        ensureStyle(doc);
        detach(entry);
        const el = doc.createElement('div');
        el.className = 'igs-page-modal';
        let theme = '';
        try { theme = getTheme() ? normalizeSettingsTheme(getTheme()) : ''; } catch (_) { theme = ''; }
        if (theme) el.setAttribute('data-igs-hint-theme', theme);
        el.setAttribute('role', entry.kind === 'prompt' || entry.kind === 'quantity' ? 'dialog' : 'alertdialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', entry.message);
        const card = doc.createElement('div');
        card.className = 'igs-page-modal-card';
        const msg = doc.createElement('p');
        msg.className = 'igs-page-modal-msg';
        msg.textContent = entry.message;
        card.appendChild(msg);
        entry.messageEl = msg;
        if (entry.imageUrl) {
            const preview = (src, alt) => {
                const image = doc.createElement('img');
                image.className = 'igs-page-modal-preview';
                image.src = src;
                image.setAttribute('alt', alt);
                return image;
            };
            if (entry.originalImageUrl) {
                card.className += ' igs-page-modal-card-comparison';
                const comparison = doc.createElement('div');
                comparison.className = 'igs-page-modal-comparison';
                for (const [src, label] of [[entry.originalImageUrl, '本次原图'], [entry.imageUrl, '重绘候选（尚未保存）']]) {
                    const figure = doc.createElement('figure');
                    const caption = doc.createElement('figcaption');
                    caption.textContent = label;
                    figure.appendChild(caption);
                    figure.appendChild(preview(src, label));
                    comparison.appendChild(figure);
                }
                card.appendChild(comparison);
            } else card.appendChild(preview(entry.imageUrl, '尚未保存的一致性重绘候选'));
        }
        let input = null;
        let summary = null;
        if (entry.kind === 'prompt' || entry.kind === 'quantity') {
            input = doc.createElement('input');
            input.className = 'igs-page-modal-input';
            input.type = entry.kind === 'quantity' ? 'number' : 'text';
            input.value = entry.value;
            input.setAttribute('aria-label', entry.inputLabel || entry.message);
            input.addEventListener('input', () => { entry.value = input.value; });
            if (entry.kind === 'quantity') {
                input.min = String(entry.min);
                input.max = String(entry.max);
                input.step = '1';
                input.setAttribute('inputmode', 'numeric');
                const label = doc.createElement('label');
                label.className = 'igs-page-modal-quantity';
                label.appendChild(doc.createTextNode(entry.inputLabel || '数量'));
                label.appendChild(input);
                card.appendChild(label);
                summary = doc.createElement('p');
                summary.className = 'igs-page-modal-summary';
                summary.setAttribute('aria-live', 'polite');
                card.appendChild(summary);
            } else card.appendChild(input);
        }
        const actions = doc.createElement('div');
        actions.className = 'igs-page-modal-actions';
        const buttons = entry.kind === 'progress' ? [['cancel', entry.cancelLabel]]
            : entry.kind === 'alert' ? [['ok', entry.okLabel]]
                : entry.kind === 'pick' ? [['cancel', entry.cancelLabel], ...entry.choices.map(([value, label]) => ['pick', label, value])]
                    : [['cancel', entry.cancelLabel], ['ok', entry.okLabel]];
        for (const [role, label, value] of buttons) {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-igs-modal', role);
            if (role === 'pick') btn.setAttribute('data-igs-modal-value', value);
            btn.textContent = label;
            actions.appendChild(btn);
        }
        card.appendChild(actions);
        el.appendChild(card);
        const quantityValue = () => {
            const value = Number(input ? input.value : entry.value);
            return Number.isSafeInteger(value) && value >= entry.min && value <= entry.max ? value : null;
        };
        if (entry.kind === 'quantity') {
            const updateQuantity = () => {
                const value = quantityValue();
                const valid = value !== null;
                input.setAttribute('aria-invalid', String(!valid));
                actions.lastChild.disabled = !valid;
                summary.textContent = valid
                    ? (typeof entry.formatQuantity === 'function' ? entry.formatQuantity(value) : `${value} 件`)
                    : `请输入 ${entry.min}–${entry.max} 之间的整数`;
            };
            input.addEventListener('input', updateQuantity);
            updateQuantity();
        }
        const accept = () => {
            if (entry.kind === 'quantity') {
                const value = quantityValue();
                if (value !== null) settle(entry, value);
            } else if (entry.kind !== 'progress') settle(entry, entry.kind === 'prompt' ? (input ? input.value : entry.value) : true);
        };
        el.addEventListener('click', (event) => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            const target = event && event.target;
            const btn = target && typeof target.closest === 'function' ? target.closest('[data-igs-modal]') : null;
            if (!btn || typeof btn.getAttribute !== 'function') return;
            const role = btn.getAttribute('data-igs-modal');
            if (role === 'ok') accept();
            else if (role === 'pick') settle(entry, btn.getAttribute('data-igs-modal-value'));
            else if (role === 'cancel') settle(entry, cancelValue(entry));
        });
        el.addEventListener('keydown', (event) => {
            if (!event) return;
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (event.key === 'Escape') {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                settle(entry, cancelValue(entry));
            } else if (event.key === 'Enter' && !event.isComposing && entry.kind !== 'pick' && (entry.kind !== 'prompt' || event.target === input)) {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                accept();
            }
        });
        host.appendChild(el);
        pinToVisibleScreen(el, doc);
        entry.el = el;
        const focusTarget = input || actions.lastChild;
        if (focusTarget && typeof focusTarget.focus === 'function') {
            try { focusTarget.focus({ preventScroll: true }); } catch (error) { try { focusTarget.focus(); } catch (again) { /* 测试文档可能没有 focus */ } }
            if (entry.kind === 'prompt' && typeof focusTarget.select === 'function') focusTarget.select();
        }
        return el;
    }

    function open(kind, message, value, labels = {}) {
        if (pending) settle(pending, cancelValue(pending));
        const entry = {
            kind,
            message: String(message == null ? '' : message),
            value: String(value == null ? '' : value),
            okLabel: labels.okLabel || '确定',
            cancelLabel: labels.cancelLabel || '取消',
            resolve: null,
            el: null,
            imageUrl: labels.imageUrl || '',
            originalImageUrl: labels.originalImageUrl || '',
            onCancel: labels.onCancel,
            choices: Array.isArray(labels.choices) ? labels.choices : [],
            min: labels.min ?? 1,
            max: labels.max ?? Number.MAX_SAFE_INTEGER,
            inputLabel: labels.inputLabel || '',
            formatQuantity: labels.formatQuantity,
        };
        const result = new Promise((resolve) => {
            entry.resolve = resolve;
            pending = entry;
            if (!mount(entry)) {
                pending = null;
                resolve(cancelValue(entry));
            }
        });
        // 取消只结算本次弹窗，迟到任务不能关闭后来打开的弹窗。
        result.cancel = () => settle(entry, cancelValue(entry));
        return result;
    }

    return {
        alert: (message, labels) => open('alert', message, '', labels),
        confirm: (message, labels) => open('confirm', message, '', labels),
        prompt: (message, value = '', labels) => open('prompt', message, value, labels),
        quantity: (message, value = 1, labels) => open('quantity', message, value, labels),
        confirmImage: (imageUrl, message, labels = {}) => open('confirm', message, '', { ...labels, imageUrl }),
        // 几个并列选项各一个按钮（choices: [[value, label]]），点哪个返回哪个 value；取消、Esc 返回 null。
        pick: (message, choices, labels = {}) => open('pick', message, '', { ...labels, choices }),
        progress(message, onCancel) {
            void open('progress', message, '', { cancelLabel: '停止', onCancel });
            const entry = pending;
            return {
                update(text) {
                    if (entry && pending === entry && entry.messageEl) entry.messageEl.textContent = String(text);
                },
                close() { if (entry && pending === entry) settle(entry, true); },
            };
        },
        cancel() {
            if (pending) settle(pending, cancelValue(pending));
        },
        isOpen: () => Boolean(pending),
    };
}
