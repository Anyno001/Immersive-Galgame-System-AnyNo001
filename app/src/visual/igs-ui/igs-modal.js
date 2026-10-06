// 页面内的提示、确认和输入。挂在阅读器或当前层上，不调用浏览器 alert / confirm / prompt。
// 浏览器那三个弹窗会退出全屏；这里的层在全屏元素里面，全屏保持不变。

const STYLE_ID = 'igs-page-modal-style';

export const IGS_MODAL_STYLE_TEXT = `
.igs-page-modal{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:24px;background:rgba(0,0,0,.45);color:#f2efe9;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;}
.igs-page-modal-card{width:min(440px,100%);display:flex;flex-direction:column;gap:14px;box-sizing:border-box;padding:18px 18px 14px;border-radius:14px;background:rgba(22,24,28,.96);border:1px solid rgba(255,255,255,.12);box-shadow:0 16px 48px rgba(0,0,0,.45);}
.igs-page-modal-msg{margin:0;font-size:14px;line-height:1.6;white-space:pre-line;word-break:break-word;}
.igs-page-modal-input{width:100%;box-sizing:border-box;margin:0;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:14px;}
.igs-page-modal-actions{display:flex;justify-content:flex-end;gap:8px;}
.igs-page-modal-actions button{min-height:36px;padding:0 14px;border:0;border-radius:8px;background:rgba(255,255,255,.12);color:inherit;font:inherit;font-size:13px;cursor:pointer;}
.igs-page-modal-actions [data-igs-modal="ok"]{background:#e8e4dc;color:#1a1c1f;}
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
    if (host && typeof host.appendChild === 'function') return host;
    const doc = globalObj && globalObj.document;
    return doc && (doc.body || doc.documentElement);
}

export function createIgsModal({ getHost = () => null, global: globalObj = globalThis } = {}) {
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
        entry.resolve(result);
    }

    function cancelValue(entry) {
        if (entry.kind === 'confirm') return false;
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
        el.setAttribute('role', entry.kind === 'prompt' ? 'dialog' : 'alertdialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', entry.message);
        const card = doc.createElement('div');
        card.className = 'igs-page-modal-card';
        const msg = doc.createElement('p');
        msg.className = 'igs-page-modal-msg';
        msg.textContent = entry.message;
        card.appendChild(msg);
        let input = null;
        if (entry.kind === 'prompt') {
            input = doc.createElement('input');
            input.className = 'igs-page-modal-input';
            input.type = 'text';
            input.value = entry.value;
            input.setAttribute('aria-label', entry.message);
            input.addEventListener('input', () => { entry.value = input.value; });
            card.appendChild(input);
        }
        const actions = doc.createElement('div');
        actions.className = 'igs-page-modal-actions';
        const buttons = entry.kind === 'alert' ? [['ok', entry.okLabel]] : [['cancel', entry.cancelLabel], ['ok', entry.okLabel]];
        for (const [role, label] of buttons) {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-igs-modal', role);
            btn.textContent = label;
            actions.appendChild(btn);
        }
        card.appendChild(actions);
        el.appendChild(card);
        const accept = () => settle(entry, entry.kind === 'prompt' ? (input ? input.value : entry.value) : true);
        el.addEventListener('click', (event) => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            const target = event && event.target;
            const btn = target && typeof target.closest === 'function' ? target.closest('[data-igs-modal]') : null;
            if (!btn || typeof btn.getAttribute !== 'function') return;
            const role = btn.getAttribute('data-igs-modal');
            if (role === 'ok') accept();
            else if (role === 'cancel') settle(entry, cancelValue(entry));
        });
        el.addEventListener('keydown', (event) => {
            if (!event) return;
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (event.key === 'Escape') {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                settle(entry, cancelValue(entry));
            } else if (event.key === 'Enter' && !event.isComposing && (entry.kind !== 'prompt' || event.target === input)) {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                accept();
            }
        });
        host.appendChild(el);
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
        };
        return new Promise((resolve) => {
            entry.resolve = resolve;
            pending = entry;
            if (!mount(entry)) {
                pending = null;
                resolve(cancelValue(entry));
            }
        });
    }

    return {
        alert: (message, labels) => open('alert', message, '', labels),
        confirm: (message, labels) => open('confirm', message, '', labels),
        prompt: (message, value = '', labels) => open('prompt', message, value, labels),
        cancel() {
            if (pending) settle(pending, cancelValue(pending));
        },
        isOpen: () => Boolean(pending),
    };
}
