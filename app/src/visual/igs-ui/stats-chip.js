// 数值系统的阅读器提示条（v2 §6.4、§9.5）：对话框上沿堆叠提示条，支持主角与 NPC 建档询问/进度并发显示。样式见 original-reader-source.js。
const PRIORITY = Object.freeze({ roll: 0, recovery: 1, sheets: 1, busy: 1, onboarding: 2, info: 3 });
const INFO_MS = 5000;
const MAX_VISIBLE = 4;

export function pickStatsNotices(notices, seen = new Set(), limit = MAX_VISIBLE) {
    const list = (Array.isArray(notices) ? notices : []).filter((n) => n && (n.kind !== 'info' || !seen.has(`${n.id}:${n.text}`)));
    list.sort((a, b) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9) || (a.order ?? 9) - (b.order ?? 9));
    return list.slice(0, Math.max(1, limit));
}

export function pickStatsNotice(notices, seen = new Set()) {
    return pickStatsNotices(notices, seen, 1)[0] || null;
}

export function createStatsChip(options = {}) {
    const timers = options.timers || globalThis;
    const seen = new Set();
    const infoTimers = new Map();
    let shown = '';
    let shownEl = null;

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
                const item = button.closest ? button.closest('.igs-stats-chip-item[data-id]') : null;
                const id = (item && item.getAttribute('data-id')) || el.getAttribute('data-id') || '';
                const act = button.getAttribute('data-stats-act') || '';
                if (typeof options.onAction === 'function') Promise.resolve(options.onAction(id, act)).finally(() => sync());
            });
            dialog.appendChild(el);
        }
        return el;
    }

    function render(el, list) {
        const doc = el.ownerDocument;
        el.textContent = '';
        for (const notice of list) {
            const row = doc.createElement('div');
            row.className = 'igs-stats-chip-item';
            row.setAttribute('data-id', notice.id);
            row.setAttribute('data-kind', notice.kind || 'info');
            const text = doc.createElement('span');
            text.className = 'igs-stats-chip-text';
            text.textContent = notice.text || '';
            row.appendChild(text);
            // 动作第三项为布尔时是单选按钮，用 aria-pressed 表示选中。
            for (const [act, label, pressed] of notice.actions || []) {
                const b = doc.createElement('button');
                b.type = 'button';
                b.className = 'igs-stats-chip-btn';
                b.setAttribute('data-stats-act', act);
                if (typeof pressed === 'boolean') b.setAttribute('aria-pressed', String(pressed));
                b.textContent = label;
                row.appendChild(b);
            }
            el.appendChild(row);
        }
        el.setAttribute('data-id', list[0].id);
        el.setAttribute('data-kind', list[0].kind || 'info');
    }

    function sync() {
        const notices = typeof options.getNotices === 'function' ? options.getNotices() : [];
        const active = pickStatsNotices(notices, seen);
        const el = element(active.length > 0);
        if (!el) return active.length > 0;
        if (!active.length) {
            el.setAttribute('hidden', '');
            shown = '';
            shownEl = null;
            for (const id of infoTimers.values()) timers.clearTimeout(id);
            infoTimers.clear();
            return false;
        }
        const key = active.map((notice) => `${notice.id}:${notice.kind || 'info'}:${notice.text}:${(notice.actions || []).map((a) => `${a[0]}${a[2] === true ? '*' : ''}`).join(',')}`).join('\n');
        if (key !== shown || el !== shownEl || !el.childNodes || !el.childNodes.length) {
            render(el, active);
            shown = key;
            shownEl = el;
        }
        el.removeAttribute('hidden');
        const activeInfoKeys = new Set();
        for (const notice of active) {
            if (notice.kind !== 'info') continue;
            const infoKey = `${notice.id}:${notice.text}`;
            activeInfoKeys.add(infoKey);
            if (!infoTimers.has(infoKey)) {
                infoTimers.set(infoKey, timers.setTimeout(() => {
                    infoTimers.delete(infoKey);
                    seen.add(infoKey);
                    sync();
                }, INFO_MS));
            }
        }
        for (const [infoKey, timerId] of infoTimers) {
            if (!activeInfoKeys.has(infoKey)) {
                timers.clearTimeout(timerId);
                infoTimers.delete(infoKey);
            }
        }
        return true;
    }

    return { sync };
}
