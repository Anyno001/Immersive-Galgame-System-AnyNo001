// 目录面板（工具栏 turn-index）：进度条 + 续读 / 第 0 层 / 最远未读 / 最新 + 输入楼号跳转；
// 「楼层」页按章节（读过时记下的地点）分组，已读 / 读了一半 / 未读三态，只渲染可见的行；
// 「存档」页：快速存档 / 快速读档 + 至多 10 个存档位（缩略图、名字、改名、覆盖、删除）。
// 跳转只换阅读源（由 onJump 交给阅读器），不调用宿主跳楼。
import { setStagePauseReason } from './stage-pause.js';
import { READING_SLOT_LIMIT } from './reading-progress.js';

const ROW_HEIGHT = 48;
const OVERSCAN = 8;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STATE_LABEL = { read: '已读', partial: '读了一半', unread: '未读' };

function findAction(target) {
    let node = target;
    for (let depth = 0; node && depth < 6; depth += 1) {
        const act = typeof node.getAttribute === 'function' ? node.getAttribute('data-ti-act') : null;
        if (act) return { act, value: node.getAttribute('data-ti-value') || '' };
        node = node.parentNode;
    }
    return null;
}

function formatTime(at) {
    if (!at) return '';
    const d = new Date(at);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function positionLabel(pos) {
    return pos ? `${pos.id} 楼 · 第 ${pos.page + 1} 页` : '';
}

// options: progress, listTurns() → Promise<turn[]>, snippetOf(turn), currentId(), onJump({ id, page, pos }), onUnread(),
//          onSaveSlot(key?) → slot|null, onQuickSave(), confirm(message), prompt(message, value), tab
export function createTurnIndexPanel(doc, options = {}) {
    const progress = options.progress;
    let root = null;
    let host = null;
    let turns = [];
    let ids = [];
    let rows = [];
    let tab = options.tab === 'slots' ? 'slots' : 'floors';
    let collapsed = new Set();
    let previousFocus = null;
    let notice = '';
    let acting = Promise.resolve();
    const snippets = new Map();

    const query = (selector) => (root && typeof root.querySelector === 'function' ? root.querySelector(selector) : null);
    const latestId = () => (ids.length ? ids[ids.length - 1] : null);
    // 最远读到的那楼起往后第一处没读完的楼。
    const nextUnreadId = () => {
        const far = progress.getFarthest();
        return ids.find((id) => id >= (far ? far.id : -1) && progress.floorState(id) !== 'read') ?? null;
    };

    function snippet(turn) {
        const id = Number(turn.id);
        if (!snippets.has(id)) {
            let text = '';
            try { text = String(options.snippetOf?.(turn) || ''); } catch (_) { text = ''; }
            snippets.set(id, text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 40));
        }
        return snippets.get(id);
    }

    function buildRows() {
        rows = [];
        let chapter = null;
        let chapterKey = '';
        for (const turn of turns) {
            const id = Number(turn.id);
            const name = progress.chapterAt(id);
            if (name && name !== chapter) {
                chapter = name;
                chapterKey = `${id}`;
                rows.push({ kind: 'chapter', name, key: chapterKey });
            }
            if (chapterKey && collapsed.has(chapterKey)) continue;
            rows.push({ kind: 'floor', id, turn });
        }
    }

    function headHtml() {
        const last = progress.getLast();
        const far = progress.getFarthest();
        const latest = latestId();
        const parts = [
            last ? `上次 ${escapeHtml(positionLabel(last))}` : '还没有阅读记录',
            far ? `最远 ${far.id} 楼` : '',
            latest != null ? `最新 ${latest} 楼` : '',
        ].filter(Boolean);
        const unread = nextUnreadId();
        return `<header class="igs-ti-head"><h2>目录</h2><button type="button" data-ti-act="close" aria-label="关闭目录">×</button></header>`
            + `<p class="igs-ti-summary">${parts.join(' ／ ')}</p>`
            + `<div class="igs-ti-quick" role="group" aria-label="快速跳转">`
            + `<button type="button" data-ti-act="resume" ${last ? '' : 'disabled'}>续读</button>`
            + `<button type="button" data-ti-act="first" ${ids.length ? '' : 'disabled'}>第 0 层</button>`
            + `<button type="button" data-ti-act="unread" ${unread != null ? '' : 'disabled'}>最远未读</button>`
            + `<button type="button" data-ti-act="latest" ${ids.length ? '' : 'disabled'}>最新</button>`
            + `<form class="igs-ti-goto" data-ti-goto><input type="number" inputmode="numeric" min="0" placeholder="楼号" aria-label="输入楼号"><button type="submit">跳转</button></form>`
            + `</div>`
            + `<div class="igs-ti-tabs" role="tablist"><button type="button" role="tab" data-ti-act="tab" data-ti-value="floors" aria-selected="${tab === 'floors'}">楼层</button><button type="button" role="tab" data-ti-act="tab" data-ti-value="slots" aria-selected="${tab === 'slots'}">存档</button></div>`
            + `<p class="igs-ti-notice" role="status" data-ti-notice${notice ? '' : ' hidden'}>${escapeHtml(notice)}</p>`;
    }

    function rowHtml(row, index) {
        const top = index * ROW_HEIGHT;
        if (row.kind === 'chapter') {
            const closed = collapsed.has(row.key);
            return `<button type="button" class="igs-ti-row igs-ti-chapter" style="top:${top}px" data-ti-act="chapter" data-ti-value="${escapeHtml(row.key)}" aria-expanded="${!closed}">${closed ? '▸' : '▾'} ${escapeHtml(row.name)}</button>`;
        }
        const stateName = progress.floorState(row.id);
        const last = progress.getLast();
        const current = Number(options.currentId?.()) === row.id;
        const marks = (current ? '<span class="igs-ti-mark">当前</span>' : '') + (last && last.id === row.id ? `<span class="igs-ti-mark">书签 · 第 ${last.page + 1} 页</span>` : '');
        return `<button type="button" class="igs-ti-row igs-ti-floor is-${stateName}${current ? ' is-current' : ''}" style="top:${top}px" data-ti-act="floor" data-ti-value="${row.id}">`
            + `<span class="igs-ti-no">${row.id}</span><span class="igs-ti-text">${escapeHtml(snippet(row.turn)) || '（空）'}</span>`
            + `<span class="igs-ti-state">${marks}<span>${STATE_LABEL[stateName]}</span></span></button>`;
    }

    function paintRows() {
        const list = query('[data-ti-list]');
        const inner = query('[data-ti-inner]');
        if (!list || !inner) return;
        const height = list.clientHeight || 480;
        const from = Math.max(0, Math.floor((list.scrollTop || 0) / ROW_HEIGHT) - OVERSCAN);
        const to = Math.min(rows.length, Math.ceil(((list.scrollTop || 0) + height) / ROW_HEIGHT) + OVERSCAN);
        let html = '';
        for (let i = from; i < to; i += 1) html += rowHtml(rows[i], i);
        inner.innerHTML = html;
    }

    function slotsHtml() {
        const slots = progress.listSlots();
        const quick = progress.getQuick();
        const card = (slot, actions) => `<li class="igs-ti-slot">`
            + (slot.thumb ? `<img src="${escapeHtml(slot.thumb)}" alt="" decoding="async" loading="lazy">` : '<span class="igs-ti-slot-blank" aria-hidden="true"></span>')
            + `<span class="igs-ti-slot-info"><strong>${escapeHtml(slot.name || positionLabel(slot))}</strong><span>${escapeHtml(positionLabel(slot))}${slot.place ? ` · ${escapeHtml(slot.place)}` : ''} · ${formatTime(slot.at)}</span><span class="igs-ti-slot-head">${escapeHtml(slot.head)}</span></span>`
            + `<span class="igs-ti-slot-actions">${actions}</span></li>`;
        const btn = (act, key, label, danger) => `<button type="button"${danger ? ' class="is-danger"' : ''} data-ti-act="${act}" data-ti-value="${escapeHtml(key)}">${label}</button>`;
        return `<div class="igs-ti-slot-bar"><button type="button" data-ti-act="quick-save">快速存档</button><button type="button" data-ti-act="quick-load" ${quick ? '' : 'disabled'}>快速读档</button><button type="button" data-ti-act="slot-new" ${slots.length >= READING_SLOT_LIMIT ? 'disabled' : ''}>存到新档位（${slots.length}/${READING_SLOT_LIMIT}）</button></div>`
            + `<ul class="igs-ti-slots">`
            + (quick ? card({ ...quick, name: quick.name || '快速存档' }, btn('quick-load', 'quick', '读取')) : '')
            + slots.map((slot) => card(slot, btn('slot-load', slot.key, '读取') + btn('slot-rename', slot.key, '改名') + btn('slot-over', slot.key, '覆盖') + btn('slot-delete', slot.key, '删除', true))).join('')
            + `</ul>`
            + (!quick && !slots.length ? '<p class="igs-ti-empty">还没有存档</p>' : '');
    }

    function render() {
        if (!root) return;
        buildRows();
        const body = tab === 'slots'
            ? `<div class="igs-ti-body">${slotsHtml()}</div>`
            : `<div class="igs-ti-list" data-ti-list><div class="igs-ti-inner" data-ti-inner style="height:${rows.length * ROW_HEIGHT}px"></div></div>`;
        root.innerHTML = headHtml() + body + (tab === 'floors' && !rows.length ? '<p class="igs-ti-empty">没有可读的楼层</p>' : '');
        const list = query('[data-ti-list]');
        if (list) {
            list.addEventListener('scroll', paintRows, { passive: true });
            paintRows();
        }
    }

    function setNotice(text) {
        notice = String(text || '');
        const el = query('[data-ti-notice]');
        if (!el) return;
        el.textContent = notice;
        if (notice) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
    }

    function scrollToId(id) {
        const list = query('[data-ti-list]');
        const index = rows.findIndex((row) => row.kind === 'floor' && row.id === id);
        if (!list || index < 0) return;
        list.scrollTop = Math.max(0, index * ROW_HEIGHT - (list.clientHeight || 480) / 2);
        paintRows();
    }

    function jump(target) {
        close();
        return options.onJump?.(target);
    }

    async function handle(act, value) {
        if (act === 'close') return close();
        if (act === 'tab') { tab = value === 'slots' ? 'slots' : 'floors'; notice = ''; render(); if (tab === 'floors') scrollToId(Number(options.currentId?.())); return null; }
        if (act === 'chapter') { if (collapsed.has(value)) collapsed.delete(value); else collapsed.add(value); render(); return null; }
        if (act === 'resume') { const last = progress.getLast(); return last ? jump({ pos: last }) : null; }
        if (act === 'first') return ids.length ? jump({ id: ids[0], page: 0 }) : null;
        if (act === 'latest') return ids.length ? jump({ id: latestId(), page: 0 }) : null;
        if (act === 'unread') {
            if (nextUnreadId() == null) return null;
            close();
            return options.onUnread?.();
        }
        if (act === 'floor') return jump({ id: Number(value), page: 0 });
        if (act === 'quick-save') { const slot = await options.onQuickSave?.(); setNotice(slot ? `已快速存档：${positionLabel(slot)}` : '存档失败'); if (slot) render(); return slot; }
        if (act === 'quick-load') { const quick = progress.getQuick(); return quick ? jump({ pos: quick }) : null; }
        if (act === 'slot-new' || act === 'slot-over') {
            if (act === 'slot-over' && options.confirm && !(await options.confirm('用当前位置覆盖这个存档？'))) return null;
            const result = await options.onSaveSlot?.(act === 'slot-over' ? value : undefined);
            notice = result && result.ok ? `已存档：${positionLabel(result.slot)}` : (result && result.reason === 'slots-full' ? `档位已满（${READING_SLOT_LIMIT} 个），请先删一个或覆盖` : '存档失败');
            render();
            return result;
        }
        if (act === 'slot-load') { const slot = progress.listSlots().find((item) => item.key === value); return slot ? jump({ pos: slot }) : null; }
        if (act === 'slot-rename') {
            const slot = progress.listSlots().find((item) => item.key === value);
            if (!slot || !options.prompt) return null;
            const name = await options.prompt('存档名字', slot.name || positionLabel(slot));
            if (name == null || name === false) return null;
            progress.renameSlot(value, name);
            render();
            return null;
        }
        if (act === 'slot-delete') {
            if (options.confirm && !(await options.confirm('删除这个存档？'))) return null;
            progress.removeSlot(value);
            render();
            return null;
        }
        return null;
    }

    function onClick(event) {
        const hit = findAction(event && event.target);
        if (!hit) return;
        event.stopPropagation?.();
        acting = acting.then(() => handle(hit.act, hit.value)).catch(() => setNotice('操作失败'));
    }

    function onSubmit(event) {
        event.preventDefault?.();
        event.stopPropagation?.();
        const input = query('[data-ti-goto] input');
        const id = Number(input && input.value);
        if (!Number.isInteger(id)) return;
        if (!ids.includes(id)) {
            const next = ids.find((n) => n >= id);
            if (next != null) { tab = 'floors'; render(); scrollToId(next); }
            setNotice(next != null ? `第 ${id} 楼不是 AI 楼层，已定位到第 ${next} 楼` : `没有第 ${id} 楼`);
            return;
        }
        jump({ id, page: 0 });
    }

    // 焦点在面板内时，空格 / 回车 / 方向键不冒泡到阅读器的全局翻页处理器。
    function onKeydown(event) {
        const key = event && event.key;
        if (key === 'Escape') close();
        if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'].includes(key)) event.stopPropagation?.();
    }

    async function open(container) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!container || typeof container.appendChild !== 'function') return { ok: false, reason: 'no-container' };
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-turn-index';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '目录');
        root.addEventListener('click', onClick);
        root.addEventListener('submit', onSubmit);
        root.addEventListener('keydown', onKeydown);
        container.appendChild(root);
        host = container;
        setStagePauseReason(host, 'panel:turn-index', true);
        root.innerHTML = '<p class="igs-ti-empty">正在读取楼层…</p>';
        try { turns = (await options.listTurns?.()) || []; } catch (_) { turns = []; }
        if (!root) return { ok: false, reason: 'closed' };
        ids = turns.map((turn) => Number(turn && turn.id)).filter(Number.isInteger);
        render();
        if (tab === 'floors') scrollToId(Number(options.currentId?.()));
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('keydown', onKeydown);
        root.remove();
        root = null;
        setStagePauseReason(host, 'panel:turn-index', false);
        host = null;
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    return {
        open,
        close,
        isOpen: () => Boolean(root),
        whenIdle: () => acting,
        getState: () => ({ tab, rows: rows.length, ids: ids.slice(), notice }),
        act: (act, value) => (acting = acting.then(() => handle(act, value))),
    };
}

export const TURN_INDEX_STYLE_TEXT = `
#igs-turn-index{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;gap:8px;padding:16px;box-sizing:border-box;background:rgba(14,14,18,.94);color:#fff;}
#igs-turn-index .igs-ti-head{display:flex;align-items:center;justify-content:space-between;}
#igs-turn-index .igs-ti-head h2{margin:0;font-size:16px;}
#igs-turn-index button{min-height:40px;min-width:40px;border:none;border-radius:8px;background:rgba(255,255,255,.1);color:inherit;cursor:pointer;padding:0 12px;font:inherit;}
#igs-turn-index button:disabled{opacity:.35;cursor:default;}
#igs-turn-index button:focus-visible{outline:2px solid #fff;outline-offset:2px;}
#igs-turn-index button[aria-selected="true"]{background:rgba(255,255,255,.26);}
#igs-turn-index .is-danger{background:rgba(220,60,60,.3);}
#igs-turn-index .igs-ti-summary{margin:0;font-size:13px;opacity:.85;}
#igs-turn-index .igs-ti-quick,#igs-turn-index .igs-ti-tabs,#igs-turn-index .igs-ti-slot-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
#igs-turn-index .igs-ti-goto{display:flex;gap:4px;margin:0;}
#igs-turn-index .igs-ti-goto input{width:84px;min-height:40px;box-sizing:border-box;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(0,0,0,.3);color:inherit;padding:0 8px;font:inherit;}
#igs-turn-index .igs-ti-notice{margin:0;font-size:12px;opacity:.85;}
#igs-turn-index .igs-ti-empty{margin:12px 0;opacity:.7;font-size:13px;}
#igs-turn-index .igs-ti-list{flex:1;min-height:0;overflow:auto;position:relative;}
#igs-turn-index .igs-ti-inner{position:relative;}
#igs-turn-index .igs-ti-row{position:absolute;left:0;right:0;height:44px;display:flex;align-items:center;gap:10px;text-align:left;}
#igs-turn-index .igs-ti-chapter{background:transparent;font-weight:600;opacity:.9;}
#igs-turn-index .igs-ti-floor.is-current{background:rgba(255,255,255,.22);}
#igs-turn-index .igs-ti-floor.is-unread .igs-ti-text{font-weight:600;}
#igs-turn-index .igs-ti-floor.is-read{opacity:.7;}
#igs-turn-index .igs-ti-no{flex:none;width:44px;font-variant-numeric:tabular-nums;opacity:.8;}
#igs-turn-index .igs-ti-text{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;}
#igs-turn-index .igs-ti-state{flex:none;display:flex;gap:6px;font-size:11px;opacity:.85;}
#igs-turn-index .igs-ti-mark{padding:1px 6px;border-radius:6px;background:rgba(255,214,120,.25);}
#igs-turn-index .igs-ti-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;}
#igs-turn-index .igs-ti-slots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
#igs-turn-index .igs-ti-slot{display:flex;gap:10px;align-items:center;padding:6px;border-radius:8px;background:rgba(255,255,255,.06);}
#igs-turn-index .igs-ti-slot img,#igs-turn-index .igs-ti-slot-blank{flex:none;width:96px;height:60px;border-radius:6px;object-fit:cover;background:rgba(255,255,255,.08);}
#igs-turn-index .igs-ti-slot-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:12px;}
#igs-turn-index .igs-ti-slot-info strong{font-size:14px;}
#igs-turn-index .igs-ti-slot-head{opacity:.7;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
#igs-turn-index .igs-ti-slot-actions{flex:none;display:flex;flex-wrap:wrap;gap:4px;max-width:45%;justify-content:flex-end;}
#igs-turn-index .igs-ti-slot-actions button{font-size:12px;min-height:34px;padding:0 8px;}
#igs-resume-bar{position:absolute;top:calc(var(--igs-toolbar-h,50px) + 8px);left:50%;transform:translateX(-50%);z-index:25;display:flex;align-items:center;gap:6px;max-width:calc(100% - 24px);padding:4px 6px 4px 12px;border-radius:999px;background:rgba(14,14,18,.82);color:#fff;font-size:13px;box-sizing:border-box;}
#igs-resume-bar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#igs-resume-bar button{min-height:32px;min-width:32px;border:none;border-radius:999px;background:rgba(255,255,255,.14);color:inherit;cursor:pointer;padding:0 10px;font:inherit;}
@media (max-width:420px){#igs-turn-index .igs-ti-slot-actions{max-width:none;}#igs-turn-index .igs-ti-slot{flex-wrap:wrap;}}
`;
