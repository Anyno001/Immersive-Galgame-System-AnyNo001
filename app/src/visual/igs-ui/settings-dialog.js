// 设置面板内的确认条与输入框，替代浏览器原生 confirm / prompt。
// 面板重绘会整体替换 innerHTML，挂起的对话记在控制器里，由 remount 在重绘后补回（含输入框里已打的字）。
export const SETTINGS_DIALOG_STYLE_TEXT = `
#igs-unified-settings .igs-settings-dialog{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4;box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:14px 16px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-panel);color:var(--igs-settings-ink);border:1px solid var(--igs-settings-line-strong);display:flex;flex-direction:column;gap:10px;pointer-events:auto}
#igs-unified-settings .igs-settings-dialog-msg{font-size:13px;line-height:1.6;white-space:pre-line;word-break:break-word}
#igs-unified-settings .igs-settings-dialog .igs-settings-field{margin:0}
#igs-unified-settings .igs-settings-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
#igs-unified-settings .igs-settings-dialog-actions [data-settings-dialog="ok"]{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
`;

function nativeFallback(globalObj) {
    return (kind, message, value) => {
        if (kind === 'confirm') return globalObj && typeof globalObj.confirm === 'function' ? Boolean(globalObj.confirm(message)) : true;
        if (!globalObj || typeof globalObj.prompt !== 'function') return null;
        const answer = globalObj.prompt(message, value);
        return answer == null ? null : String(answer);
    };
}

function findHost(container) {
    if (!container || typeof container.querySelector !== 'function') return null;
    return container.querySelector('#igs-unified-settings') || container;
}

export function createSettingsDialogs({ getContainer = () => null, global: globalObj = globalThis, fallback } = {}) {
    const askNative = fallback || nativeFallback(globalObj);
    let pending = null;

    function cancelValue(entry) {
        return entry.kind === 'confirm' ? false : null;
    }

    function detach(entry) {
        const el = entry && entry.el;
        if (el && el.parentNode) el.parentNode.removeChild(el);
        if (entry) entry.el = null;
    }

    function settle(entry, result) {
        if (!entry || pending !== entry) return;
        pending = null;
        detach(entry);
        entry.resolve(result);
    }

    function build(host, entry) {
        const doc = host.ownerDocument;
        if (!doc || typeof doc.createElement !== 'function') return null;
        const el = doc.createElement('div');
        el.className = 'igs-settings-dialog';
        el.setAttribute('role', entry.kind === 'confirm' ? 'alertdialog' : 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', entry.message);
        const msg = doc.createElement('div');
        msg.className = 'igs-settings-dialog-msg';
        msg.textContent = entry.message;
        el.appendChild(msg);
        let input = null;
        if (entry.kind === 'prompt') {
            const wrap = doc.createElement('label');
            wrap.className = 'igs-settings-field';
            input = doc.createElement('input');
            input.type = 'text';
            input.className = 'igs-settings-dialog-input';
            input.setAttribute('aria-label', entry.message);
            input.value = entry.value;
            input.addEventListener('input', () => { entry.value = input.value; });
            wrap.appendChild(input);
            el.appendChild(wrap);
        }
        const actions = doc.createElement('div');
        actions.className = 'igs-settings-dialog-actions';
        for (const [role, label] of [['cancel', entry.cancelLabel], ['ok', entry.okLabel]]) {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'igs-settings-action';
            btn.setAttribute('data-settings-dialog', role);
            btn.textContent = label;
            actions.appendChild(btn);
        }
        el.appendChild(actions);
        const accept = () => settle(entry, entry.kind === 'confirm' ? true : (input ? input.value : entry.value));
        el.addEventListener('click', (event) => {
            event.stopPropagation();
            const btn = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-settings-dialog]') : null;
            if (!btn) return;
            if (btn.getAttribute('data-settings-dialog') === 'ok') accept();
            else settle(entry, cancelValue(entry));
        });
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                settle(entry, cancelValue(entry));
            } else if (event.key === 'Enter' && !event.isComposing && (input ? event.target === input : true)) {
                event.preventDefault();
                event.stopPropagation();
                accept();
            }
        });
        entry.focusTarget = () => input || actions.lastChild;
        return el;
    }

    function mount(container) {
        const entry = pending;
        const host = findHost(container);
        if (!entry || !host) return null;
        if (entry.el && entry.el.parentNode === host) return entry.el;
        detach(entry);
        const el = build(host, entry);
        if (!el) return null;
        host.appendChild(el);
        entry.el = el;
        const target = entry.focusTarget();
        if (target && typeof target.focus === 'function') {
            try { target.focus({ preventScroll: true }); } catch (error) { target.focus(); }
            if (entry.kind === 'prompt' && typeof target.select === 'function') target.select();
        }
        return el;
    }

    function open(kind, message, value, labels = {}) {
        const container = getContainer();
        if (!findHost(container)) return Promise.resolve(askNative(kind, message, value));
        if (pending) settle(pending, cancelValue(pending));
        return new Promise((resolve) => {
            pending = {
                kind,
                message: String(message == null ? '' : message),
                value: String(value == null ? '' : value),
                okLabel: labels.okLabel || '确定',
                cancelLabel: labels.cancelLabel || '取消',
                resolve,
                el: null,
            };
            if (!mount(container)) {
                const entry = pending;
                pending = null;
                resolve(askNative(kind, entry.message, entry.value));
            }
        });
    }

    return {
        confirm: (message, labels) => open('confirm', message, '', labels),
        prompt: (message, value = '', labels) => open('prompt', message, value, labels),
        remount(container) {
            const el = mount(container || getContainer());
            if (!el && pending) settle(pending, cancelValue(pending));
            return el;
        },
        cancel() {
            if (pending) settle(pending, cancelValue(pending));
        },
        isOpen: () => Boolean(pending),
    };
}
