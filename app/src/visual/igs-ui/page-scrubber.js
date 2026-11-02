// 页码进度条：窄屏阅读模式 / 漫画演出模式下贴在画面底边，拖到本楼某一页、松手即跳过去。
// 只管 DOM 与拖动；何时显示、跳页由 reader-host 决定（syncPageScrubber 传 null 即隐藏）。
const STYLE_ID = 'igs-page-scrubber-style';

const STYLE_TEXT = `
#igs-page-scrubber{position:absolute;left:14px;right:14px;bottom:env(safe-area-inset-bottom,0px);height:22px;z-index:6;pointer-events:auto;cursor:pointer;touch-action:none;color:var(--igs-log-ink,#f5f5f7);}
#igs-page-scrubber[hidden]{display:none!important;}
#igs-page-scrubber .igs-ps-track{position:absolute;left:0;right:0;bottom:6px;height:2px;border-radius:2px;background:currentColor;opacity:.28;}
#igs-page-scrubber .igs-ps-fill{position:absolute;left:0;bottom:6px;height:2px;border-radius:2px;background:currentColor;opacity:.85;}
#igs-page-scrubber .igs-ps-knob{position:absolute;bottom:3px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:currentColor;opacity:0;transition:opacity .2s;}
#igs-page-scrubber.is-dragging .igs-ps-knob,#igs-page-scrubber:hover .igs-ps-knob{opacity:1;}
#igs-page-scrubber .igs-ps-tip{position:absolute;bottom:18px;transform:translateX(-50%);padding:3px 9px;border-radius:999px;background:#1c1c1e;color:#f5f5f7;font-size:12px;line-height:1.2;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;}
#igs-page-scrubber.is-dragging .igs-ps-tip{opacity:1;}
`;

function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    (doc.head || doc.documentElement).appendChild(style);
}

function paint(el, index, total) {
    const ratio = total > 1 ? index / (total - 1) : 0;
    const pct = `${(ratio * 100).toFixed(2)}%`;
    el.querySelector('.igs-ps-fill').style.width = pct;
    el.querySelector('.igs-ps-knob').style.left = pct;
    const tip = el.querySelector('.igs-ps-tip');
    tip.style.left = pct;
    tip.textContent = `${index + 1} / ${total}`;
}

function mount(overlay) {
    const doc = overlay.ownerDocument;
    ensureStyle(doc);
    const el = doc.createElement('div');
    el.id = 'igs-page-scrubber';
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', '页码进度');
    el.innerHTML = '<div class="igs-ps-track"></div><div class="igs-ps-fill"></div><div class="igs-ps-knob"></div><div class="igs-ps-tip"></div>';
    const drag = { on: false, page: -1 };
    const pageAt = (clientX) => {
        const rect = el.getBoundingClientRect();
        const total = el._igsTotal || 1;
        const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
        return Math.round(ratio * (total - 1));
    };
    // 拖动中只移动手柄与页码气泡，不渲染；松手才跳页，免得划过的每一页都整页重渲染、触发演出。
    const move = (event) => {
        drag.page = pageAt(event.clientX);
        paint(el, drag.page, el._igsTotal || 1);
    };
    // 点在进度条上不当作点空白翻页。
    const swallow = (event) => event.stopPropagation();
    el.addEventListener('pointerdown', (event) => {
        swallow(event);
        drag.on = true;
        el.classList.add('is-dragging');
        try { el.setPointerCapture(event.pointerId); } catch (_) { /* 不支持就靠冒泡 */ }
        move(event);
    });
    el.addEventListener('pointermove', (event) => { if (drag.on) move(event); });
    const end = (event) => {
        if (!drag.on) return;
        swallow(event);
        drag.on = false;
        el.classList.remove('is-dragging');
        if (event.type === 'pointercancel') { paint(el, el._igsIndex || 0, el._igsTotal || 1); return; }
        if (drag.page >= 0 && drag.page !== el._igsIndex && typeof el._igsSeek === 'function') el._igsSeek(drag.page);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', swallow);
    el.addEventListener('dblclick', swallow);
    el._igsDrag = drag;
    overlay.appendChild(el);
    return el;
}

// view = { index, total, onSeek(page) } 或 null（隐藏）。拖动中不回写位置，免得跳页重渲染把手柄拉回去。
export function syncPageScrubber(overlay, view) {
    if (!overlay || !overlay.ownerDocument) return;
    let el = overlay.querySelector('#igs-page-scrubber');
    const total = view ? Math.max(0, Number(view.total) || 0) : 0;
    if (total < 2) {
        if (el) el.hidden = true;
        return;
    }
    if (!el) el = mount(overlay);
    el.hidden = false;
    const index = Math.max(0, Math.min(total - 1, Number(view.index) || 0));
    el._igsTotal = total;
    el._igsIndex = index;
    el._igsSeek = view.onSeek;
    el.setAttribute('aria-valuemin', '1');
    el.setAttribute('aria-valuemax', String(total));
    el.setAttribute('aria-valuenow', String(index + 1));
    if (!el._igsDrag.on) paint(el, index, total);
}
