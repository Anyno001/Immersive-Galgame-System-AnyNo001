// 数值系统的阅读器提示条（v2 §6.4、§9.5）：对话框上沿一条小提示，带按钮（快速开始、生成数值、掷骰）。
// 同时只显示一条，优先级：掷骰 > 新角色 > 开局引导 > 其余说明（说明类显示几秒后自动收起）。样式见 original-reader-source.js。
const PRIORITY = Object.freeze({ roll: 0, sheets: 1, busy: 1, onboarding: 2, info: 3 });
const INFO_MS = 5000;

export function pickStatsNotice(notices, seen = new Set()) {
    const list = (Array.isArray(notices) ? notices : []).filter((n) => n && (n.kind !== 'info' || !seen.has(`${n.id}:${n.text}`)));
    list.sort((a, b) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9));
    return list[0] || null;
}

export function createStatsChip(options = {}) {
    const timers = options.timers || globalThis;
    const seen = new Set();
    let timer = null;
    let shown = '';

    function element(create) {
        const dialog = typeof options.getDialog === 'function' ? options.getDialog() : null;
        if (!dialog || typeof dialog.querySelector !== 'function') return null;
        let el = dialog.querySelector('#igs-stats-chip');
        if (!el && create && dialog.ownerDocument) {
            el = dialog.ownerDocument.createElement('div');
            el.id = 'igs-stats-chip';
            el.setAttribute('role', 'status');
            el.addEventListener('click', (event) => {
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                const button = event.target && event.target.closest ? event.target.closest('[data-stats-act]') : null;
                if (!button) return;
                const id = el.getAttribute('data-id') || '';
                const act = button.getAttribute('data-stats-act') || '';
                if (typeof options.onAction === 'function') Promise.resolve(options.onAction(id, act)).finally(() => sync());
            });
            dialog.appendChild(el);
        }
        return el;
    }

    function render(el, notice) {
        const doc = el.ownerDocument;
        el.textContent = '';
        const text = doc.createElement('span');
        text.className = 'igs-stats-chip-text';
        text.textContent = notice.text || '';
        el.appendChild(text);
        for (const [act, label] of notice.actions || []) {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = 'igs-stats-chip-btn';
            b.setAttribute('data-stats-act', act);
            b.textContent = label;
            el.appendChild(b);
        }
        el.setAttribute('data-id', notice.id);
        el.setAttribute('data-kind', notice.kind || 'info');
    }

    function sync() {
        const notices = typeof options.getNotices === 'function' ? options.getNotices() : [];
        const notice = pickStatsNotice(notices, seen);
        const el = element(Boolean(notice));
        if (!el) return Boolean(notice);
        if (!notice) { el.setAttribute('hidden', ''); shown = ''; return false; }
        const key = `${notice.id}:${notice.text}:${(notice.actions || []).length}`;
        if (key !== shown) { render(el, notice); shown = key; }
        el.removeAttribute('hidden');
        if (notice.kind === 'info') {
            if (timer) timers.clearTimeout(timer);
            timer = timers.setTimeout(() => { timer = null; seen.add(`${notice.id}:${notice.text}`); sync(); }, INFO_MS);
        }
        return true;
    }

    return { sync };
}
