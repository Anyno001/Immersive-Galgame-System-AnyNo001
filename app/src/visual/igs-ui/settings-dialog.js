// 设置面板内的确认条与输入框，替代浏览器原生 confirm / prompt。
// 面板重绘会整体替换 innerHTML，挂起的对话记在控制器里，由 remount 在重绘后补回（含输入框里已打的字）。
export const SETTINGS_DIALOG_STYLE_TEXT = `
#igs-unified-settings .igs-settings-dialog{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:6;box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:14px 16px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-panel);color:var(--igs-settings-ink);border:1px solid var(--igs-settings-line-strong);display:flex;flex-direction:column;gap:10px;pointer-events:auto}
#igs-unified-settings .igs-settings-dialog.is-view,#igs-unified-settings .igs-settings-dialog.is-edit{width:min(640px,calc(100% - 32px))}
#igs-unified-settings .igs-settings-dialog-text{width:100%;min-height:220px;max-height:min(46vh,320px);box-sizing:border-box;resize:vertical;padding:8px 10px;border:0;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);color:var(--igs-settings-ink);font:inherit;font-size:12px;line-height:1.5}
#igs-unified-settings .igs-settings-dialog-msg{font-size:13px;line-height:1.6;white-space:pre-line;word-break:break-word}
#igs-unified-settings .igs-settings-dialog-msg.is-scroll{max-height:min(50vh,360px);overflow:auto;white-space:pre-wrap}
#igs-unified-settings .igs-settings-dialog .igs-settings-field{margin:0}
#igs-unified-settings .igs-settings-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
#igs-unified-settings .igs-settings-dialog-actions [data-settings-dialog="ok"]{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
#igs-unified-settings .igs-settings-dialog.is-choose .igs-settings-dialog-msg{font-size:14px;font-weight:600}
#igs-unified-settings .igs-settings-dialog-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}
#igs-unified-settings .igs-settings-dialog-choice{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:58px;padding:8px 4px;border:1px solid var(--igs-settings-line);border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-raised);color:var(--igs-settings-ink);font:inherit;cursor:pointer}
#igs-unified-settings .igs-settings-dialog-choice b{font-size:20px;line-height:1.1;font-weight:600;font-variant-numeric:tabular-nums}
#igs-unified-settings .igs-settings-dialog-choice span{font-size:12px;line-height:1.3;opacity:.72}
#igs-unified-settings .igs-settings-dialog-choice.is-current{border-color:var(--igs-settings-accent)}
#igs-unified-settings .igs-settings-dialog-choice.is-current b{color:var(--igs-settings-accent)}
#igs-unified-settings .igs-settings-dialog-choice:focus-visible{outline:2px solid var(--igs-settings-accent);outline-offset:2px}
`;

function nativeFallback(globalObj) {
    return (kind, message, value) => {
        if (kind === 'confirm') return globalObj && typeof globalObj.confirm === 'function' ? Boolean(globalObj.confirm(message)) : true;
        if (kind === 'view') {
            if (globalObj && typeof globalObj.alert === 'function') globalObj.alert(message);
            return true;
        }
        if (kind === 'choose') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return value;
            const answer = globalObj.prompt(message, value);
            return answer == null ? null : String(answer).trim();
        }
        if (kind === 'edit') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return null;
            const edited = globalObj.prompt(message, value);
            return edited == null ? null : String(edited);
        }
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
        el.className = entry.kind === 'view' || entry.kind === 'edit' || entry.kind === 'choose'
            ? `igs-settings-dialog is-${entry.kind}`
            : 'igs-settings-dialog';
        el.setAttribute('role', entry.kind === 'confirm' ? 'alertdialog' : 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', entry.kind === 'view' || entry.kind === 'edit' ? '生图提示词' : entry.message);
        const msg = doc.createElement('div');
        msg.className = entry.kind === 'view' ? 'igs-settings-dialog-msg is-scroll' : 'igs-settings-dialog-msg';
        msg.textContent = entry.message;
        el.appendChild(msg);
        let input = null;
        if (entry.kind === 'prompt' || entry.kind === 'edit') {
            const wrap = doc.createElement('label');
            wrap.className = 'igs-settings-field';
            input = doc.createElement(entry.kind === 'edit' ? 'textarea' : 'input');
            if (entry.kind === 'prompt') input.type = 'text';
            input.className = entry.kind === 'edit' ? 'igs-settings-dialog-text' : 'igs-settings-dialog-input';
            input.setAttribute('aria-label', entry.message);
            input.value = entry.value;
            input.addEventListener('input', () => { entry.value = input.value; });
            wrap.appendChild(input);
            el.appendChild(wrap);
        }
        let current = null;
        if (entry.kind === 'choose') {
            const list = doc.createElement('div');
            list.className = 'igs-settings-dialog-choices';
            for (const choice of entry.choices) {
                const btn = doc.createElement('button');
                btn.type = 'button';
                btn.className = choice.value === entry.value ? 'igs-settings-dialog-choice is-current' : 'igs-settings-dialog-choice';
                btn.setAttribute('data-settings-dialog', 'choice');
                btn.setAttribute('data-settings-choice', choice.value);
                if (choice.value === entry.value) { btn.setAttribute('aria-current', 'true'); current = btn; }
                const big = doc.createElement('b');
                big.textContent = choice.label;
                btn.appendChild(big);
                if (choice.note) {
                    const small = doc.createElement('span');
                    small.textContent = choice.note;
                    btn.appendChild(small);
                }
                list.appendChild(btn);
            }
            el.appendChild(list);
        }
        const actions = doc.createElement('div');
        actions.className = 'igs-settings-dialog-actions';
        const buttons = entry.kind === 'view' ? [['ok', entry.okLabel]]
            : entry.kind === 'choose' ? [['cancel', entry.cancelLabel]]
                : [['cancel', entry.cancelLabel], ['ok', entry.okLabel]];
        for (const [role, label] of buttons) {
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
            const role = btn.getAttribute('data-settings-dialog');
            if (role === 'choice') settle(entry, btn.getAttribute('data-settings-choice'));
            else if (role === 'ok') accept();
            else settle(entry, cancelValue(entry));
        });
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                settle(entry, cancelValue(entry));
            } else if (event.key === 'Enter' && entry.kind !== 'choose' && !entry.multiline && !event.isComposing && (input ? event.target === input : true)) {
                event.preventDefault();
                event.stopPropagation();
                accept();
            }
        });
        entry.focusTarget = () => input || current || actions.lastChild;
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

    function open(kind, message, value, labels = {}, choices = []) {
        const container = getContainer();
        if (!findHost(container)) return Promise.resolve(askNative(kind, message, value));
        if (pending) settle(pending, cancelValue(pending));
        return new Promise((resolve) => {
            pending = {
                kind,
                message: String(message == null ? '' : message),
                value: String(value == null ? '' : value),
                okLabel: labels.okLabel || (kind === 'edit' ? '保存' : '确定'),
                cancelLabel: labels.cancelLabel || '取消',
                multiline: kind === 'edit',
                choices,
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
        view: (message, labels) => open('view', message, '', { okLabel: '关闭', ...labels }),
        edit: (message, value = '', labels) => open('edit', message, value, { okLabel: '保存', ...labels }),
        // 几个固定选项直接点选，不用手打；choices 为 [{ value, label, note }]，value 等于当前值的高亮。原生兜底退回输入框。
        choose: (message, choices = [], value = '', labels) => open('choose', message, value, labels || {}, (Array.isArray(choices) ? choices : [])
            .map((item) => ({ value: String(item && item.value != null ? item.value : ''), label: String(item && item.label != null ? item.label : item && item.value), note: String((item && item.note) || '') }))
            .filter((item) => item.value)),
        remount(container) {
            const el = mount(container || getContainer());
            if (!el && pending) settle(pending, cancelValue(pending));
            return el;
        },
        cancel() {
            if (pending) settle(pending, cancelValue(pending));
        },
        isOpen: () => Boolean(pending),
        hasTextInput: () => Boolean(pending && (pending.kind === 'prompt' || pending.kind === 'edit')),
    };
}
