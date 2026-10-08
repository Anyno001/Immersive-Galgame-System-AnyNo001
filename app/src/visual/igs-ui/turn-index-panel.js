// 目录面板（工具栏 turn-index）：照日记页排版——页头（返回 + 居中标题 + 配色）、左栏列表、右栏阅读面板。
// 「楼层」页：左栏快捷跳转 + 楼号输入 + 按章节（读过时记下的地点）分组的楼层列表（只渲染可见的行），
// 右栏是选中那楼的开头与「从这里读」；「存档」页：左栏快速存档 + 至多 10 个存档位，右栏是选中存档的缩略图与操作。
// 跳转只换阅读源（由 onJump 交给阅读器），不调用宿主跳楼。配色与日记、背包、设置器共用。
import { setStagePauseReason } from './stage-pause.js';
import { READING_SLOT_LIMIT } from './reading-progress.js';
import { RECORD_ICONS } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { RECORD_PAGE_SHELL_STYLE_TEXT } from './record-page-shell-style.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
import { IGS_HINT_THEME_STYLE_TEXT } from './igs-modal.js';

const ROW_HEIGHT = 40;
const OVERSCAN = 8;
const ROW_SNIPPET = 40;
const DETAIL_SNIPPET = 360;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STATE_LABEL = { read: '已读', partial: '读了一半', unread: '未读' };
const OPEN_CLASS = 'igs-turn-index-open';
const BOOKMARK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17L12 16.5l-5.5 4Z"/></svg>';

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
//          onSaveSlot(key?) → slot|null, onQuickSave(), confirm(message), prompt(message, value), tab, getTheme(), setTheme(theme)
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
    let selectedId = null;
    let selectedSlot = '';
    let theme = '';
    let unwatchLayout = () => { };
    let acting = Promise.resolve();
    const snippets = new Map();

    const query = (selector) => (root && typeof root.querySelector === 'function' ? root.querySelector(selector) : null);
    const latestId = () => (ids.length ? ids[ids.length - 1] : null);
    // 最远读到的那楼起往后第一处没读完的楼。
    const nextUnreadId = () => {
        const far = progress.getFarthest();
        return ids.find((id) => id >= (far ? far.id : -1) && progress.floorState(id) !== 'read') ?? null;
    };

    function fullSnippet(turn) {
        const id = Number(turn && turn.id);
        if (!snippets.has(id)) {
            let text = '';
            try { text = String(options.snippetOf?.(turn) || ''); } catch (_) { text = ''; }
            snippets.set(id, text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, DETAIL_SNIPPET));
        }
        return snippets.get(id);
    }
    const snippet = (turn) => fullSnippet(turn).slice(0, ROW_SNIPPET);

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
        const themeSwitch = `<div class="igs-rp-theme-switch" role="radiogroup" aria-label="界面配色">${renderSettingsThemeSwitch(theme, {
            optionClass: 'igs-rp-theme-option', attrs: (value) => `data-ti-act="theme" data-ti-value="${value}"` })}</div>`;
        return recordPageHeadHtml('目录', { closeAttr: 'data-ti-act', backAriaLabel: '关闭目录', trailing: options.setTheme ? themeSwitch : '' })
            + `<div class="igs-ti-tabs"><div class="igs-rp-segment" role="tablist" aria-label="目录分页">`
            + `<button type="button" role="tab" data-ti-act="tab" data-ti-value="floors" aria-pressed="${tab === 'floors'}" aria-selected="${tab === 'floors'}">${RECORD_ICONS.book}<span>楼层</span></button>`
            + `<button type="button" role="tab" data-ti-act="tab" data-ti-value="slots" aria-pressed="${tab === 'slots'}" aria-selected="${tab === 'slots'}">${BOOKMARK_ICON}<span>存档</span></button>`
            + `</div></div>`;
    }

    function summaryText() {
        const last = progress.getLast();
        const far = progress.getFarthest();
        const latest = latestId();
        return [
            last ? `上次 ${positionLabel(last)}` : '还没有阅读记录',
            far ? `最远 ${far.id} 楼` : '',
            latest != null ? `最新 ${latest} 楼` : '',
        ].filter(Boolean).join(' · ');
    }

    function noticeHtml() {
        return `<p class="igs-rp-notice igs-ti-notice" role="status" data-ti-notice${notice ? '' : ' hidden'}>${escapeHtml(notice)}</p>`;
    }

    function rowHtml(row, index) {
        const top = index * ROW_HEIGHT;
        if (row.kind === 'chapter') {
            const closed = collapsed.has(row.key);
            return `<button type="button" class="igs-ti-row igs-ti-chapter" style="top:${top}px" data-ti-act="chapter" data-ti-value="${escapeHtml(row.key)}" aria-expanded="${!closed}">${escapeHtml(row.name)}<span aria-hidden="true">${closed ? '▸' : '▾'}</span></button>`;
        }
        const stateName = progress.floorState(row.id);
        const current = Number(options.currentId?.()) === row.id;
        const last = progress.getLast();
        const dot = stateName === 'read' ? '' : `<i class="igs-rp-dot is-${stateName}" aria-label="${STATE_LABEL[stateName]}"></i>`;
        const mark = current ? '<small class="igs-ti-mark">当前</small>' : last && last.id === row.id ? '<small class="igs-ti-mark">书签</small>' : '';
        return `<button type="button" class="igs-ti-row igs-ti-floor is-${stateName}" style="top:${top}px" data-ti-act="select" data-ti-value="${row.id}"${selectedId === row.id ? ' aria-current="true"' : ''}>`
            + `<span class="igs-ti-no">${row.id}</span><span class="igs-ti-text">${escapeHtml(snippet(row.turn)) || '（空）'}</span>${mark}${dot}</button>`;
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

    function floorDetailHtml() {
        const index = selectedId == null ? -1 : ids.indexOf(selectedId);
        if (index < 0) {
            const read = ids.filter((id) => progress.floorState(id) === 'read').length;
            const ratio = ids.length ? Math.round((read / ids.length) * 100) : 0;
            return `<div class="igs-ti-detail igs-ti-overview"><p class="igs-ti-meta">阅读进度</p><h3>${read} / ${ids.length} 楼</h3>`
                + `<div class="igs-ti-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ratio}"><span style="width:${ratio}%"></span></div>`
                + `<p class="igs-ti-summary">${escapeHtml(summaryText())}</p>`
                + `<p class="igs-ti-hint">在左边选一楼，看开头再决定从哪读</p></div>`;
        }
        const turn = turns[index];
        const stateName = progress.floorState(selectedId);
        const last = progress.getLast();
        const place = progress.chapterAt(selectedId);
        const meta = [`第 ${selectedId} 楼`, place, STATE_LABEL[stateName]].filter(Boolean).map(escapeHtml).join('<i aria-hidden="true">·</i>');
        const text = fullSnippet(turn);
        const resumeHere = last && last.id === selectedId && last.page > 0
            ? `<button type="button" class="igs-rp-chip" data-ti-act="resume">续读第 ${last.page + 1} 页</button>` : '';
        return `<article class="igs-ti-detail"><p class="igs-ti-meta">${meta}</p>`
            + `<p class="igs-ti-body">${escapeHtml(text) || '（这楼没有可读的文字）'}${text.length >= DETAIL_SNIPPET ? '…' : ''}</p>`
            + `<div class="igs-ti-detail-actions"><button type="button" class="igs-rp-btn" data-ti-act="floor" data-ti-value="${selectedId}">从这里读</button>${resumeHere}</div>`
            + `<footer class="igs-ti-nav"><button type="button" data-ti-act="select-step" data-ti-value="-1" ${index <= 0 ? 'disabled' : ''}>← 上一楼</button>`
            + `<span>${String(index + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}</span>`
            + `<button type="button" data-ti-act="select-step" data-ti-value="1" ${index >= ids.length - 1 ? 'disabled' : ''}>下一楼 →</button></footer></article>`;
    }

    function floorsHtml() {
        const last = progress.getLast();
        const unread = nextUnreadId();
        const quick = `<div class="igs-ti-quick" role="group" aria-label="快速跳转">`
            + `<button type="button" class="igs-rp-chip" data-ti-act="resume" ${last ? '' : 'disabled'}>续读</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="first" ${ids.length ? '' : 'disabled'}>第 0 层</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="unread" ${unread != null ? '' : 'disabled'}>最远未读</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="latest" ${ids.length ? '' : 'disabled'}>最新</button></div>`;
        const goto = `<form class="igs-rp-search igs-ti-goto" data-ti-goto>${RECORD_ICONS.search}<input type="number" inputmode="numeric" min="0" placeholder="输入楼号，回车跳转" aria-label="输入楼号跳转"></form>`;
        const list = rows.length
            ? `<div class="igs-ti-list" data-ti-list><div class="igs-ti-inner" data-ti-inner style="height:${rows.length * ROW_HEIGHT}px"></div></div>`
            : '<p class="igs-ti-empty">没有可读的楼层</p>';
        return `<div class="igs-ti-layout"><aside class="igs-ti-side"><p class="igs-ti-summary">${escapeHtml(summaryText())}</p>${quick}${goto}${noticeHtml()}${list}</aside>${floorDetailHtml()}</div>`;
    }

    function slotThumb(slot, cls) {
        return slot.thumb
            ? `<img class="${cls}" src="${escapeHtml(slot.thumb)}" alt="" decoding="async" loading="lazy">`
            : `<span class="${cls} is-blank" aria-hidden="true">${RECORD_ICONS.book}</span>`;
    }

    function slotsHtml() {
        const slots = progress.listSlots();
        const quick = progress.getQuick();
        const entries = [...(quick ? [{ ...quick, key: 'quick', name: quick.name || '快速存档', isQuick: true }] : []), ...slots];
        if (selectedSlot && !entries.some((slot) => slot.key === selectedSlot)) selectedSlot = '';
        const tools = `<div class="igs-ti-quick" role="group" aria-label="存档">`
            + `<button type="button" class="igs-rp-chip" data-ti-act="quick-save">快速存档</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="slot-new" ${slots.length >= READING_SLOT_LIMIT ? 'disabled' : ''}>存到新档位<small>${slots.length}/${READING_SLOT_LIMIT}</small></button></div>`;
        const list = entries.length
            ? `<ol class="igs-ti-slots" aria-label="存档列表">${entries.map((slot) => `<li><button type="button" data-ti-act="slot-select" data-ti-value="${escapeHtml(slot.key)}"${slot.key === selectedSlot ? ' aria-current="true"' : ''}>`
                + `${slotThumb(slot, 'igs-ti-slot-thumb')}<span class="igs-ti-slot-copy"><strong>${escapeHtml(slot.name || positionLabel(slot))}</strong><small>${escapeHtml(positionLabel(slot))} · ${formatTime(slot.at)}</small></span></button></li>`).join('')}</ol>`
            : '<p class="igs-ti-empty">还没有存档</p>';
        const chosen = entries.find((slot) => slot.key === selectedSlot);
        let detail;
        if (!chosen) {
            detail = `<div class="igs-ti-detail igs-ti-empty-pane"><span aria-hidden="true">${RECORD_ICONS.book}</span><p>${entries.length ? '选择一个存档查看' : '读到想留的地方，点「快速存档」或「存到新档位」'}</p></div>`;
        } else {
            const meta = [positionLabel(chosen), chosen.place, formatTime(chosen.at)].filter(Boolean).map(escapeHtml).join('<i aria-hidden="true">·</i>');
            const manage = chosen.isQuick ? '' : `<button type="button" class="igs-rp-chip" data-ti-act="slot-rename" data-ti-value="${escapeHtml(chosen.key)}">改名</button>`
                + `<button type="button" class="igs-rp-chip" data-ti-act="slot-over" data-ti-value="${escapeHtml(chosen.key)}">用当前位置覆盖</button>`
                + `<button type="button" class="igs-rp-chip is-danger" data-ti-act="slot-delete" data-ti-value="${escapeHtml(chosen.key)}">删除</button>`;
            detail = `<article class="igs-ti-detail">${chosen.thumb ? slotThumb(chosen, 'igs-ti-detail-thumb') : ''}<p class="igs-ti-meta">${meta}</p><h3>${escapeHtml(chosen.name || positionLabel(chosen))}</h3>`
                + (chosen.head ? `<p class="igs-ti-body">${escapeHtml(chosen.head)}</p>` : '')
                + `<div class="igs-ti-detail-actions"><button type="button" class="igs-rp-btn" data-ti-act="${chosen.isQuick ? 'quick-load' : 'slot-load'}" data-ti-value="${escapeHtml(chosen.key)}">读取</button>${manage}</div></article>`;
        }
        return `<div class="igs-ti-layout"><aside class="igs-ti-side">${tools}${noticeHtml()}${list}</aside>${detail}</div>`;
    }

    function render() {
        if (!root) return;
        buildRows();
        root.innerHTML = `<div class="igs-rp-page">${headHtml()}<div class="igs-rp-body"><div class="igs-ti-scroll">${tab === 'slots' ? slotsHtml() : floorsHtml()}</div></div></div>`;
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

    // 只重画右栏和列表可见行，列表滚动位置不动。
    function selectFloor(id) {
        selectedId = ids.includes(id) ? id : null;
        const list = query('[data-ti-list]');
        const top = list ? list.scrollTop : 0;
        render();
        const next = query('[data-ti-list]');
        if (next) { next.scrollTop = top; paintRows(); }
    }

    function jump(target) {
        close();
        return options.onJump?.(target);
    }

    async function handle(act, value) {
        if (act === 'close') return close();
        if (act === 'theme') {
            theme = normalizeSettingsTheme(value);
            root?.setAttribute('data-rp-theme', theme);
            render();
            if (tab === 'floors') scrollToId(selectedId ?? Number(options.currentId?.()));
            try { options.setTheme?.(theme); } catch (_) { /* 保存失败只影响下次打开 */ }
            return null;
        }
        if (act === 'tab') { tab = value === 'slots' ? 'slots' : 'floors'; notice = ''; render(); if (tab === 'floors') scrollToId(selectedId ?? Number(options.currentId?.())); return null; }
        if (act === 'chapter') { if (collapsed.has(value)) collapsed.delete(value); else collapsed.add(value); selectFloor(selectedId); return null; }
        if (act === 'select') { selectFloor(Number(value)); return null; }
        if (act === 'select-step') {
            const index = ids.indexOf(selectedId) + Number(value);
            if (index >= 0 && index < ids.length) { selectedId = ids[index]; render(); scrollToId(selectedId); }
            return null;
        }
        if (act === 'slot-select') { selectedSlot = value; render(); return null; }
        if (act === 'resume') { const last = progress.getLast(); return last ? jump({ pos: last }) : null; }
        if (act === 'first') return ids.length ? jump({ id: ids[0], page: 0 }) : null;
        if (act === 'latest') return ids.length ? jump({ id: latestId(), page: 0 }) : null;
        if (act === 'unread') {
            if (nextUnreadId() == null) return null;
            close();
            return options.onUnread?.();
        }
        if (act === 'floor') return jump({ id: Number(value), page: 0 });
        if (act === 'quick-save') {
            const slot = await options.onQuickSave?.();
            notice = slot ? `已快速存档：${positionLabel(slot)}` : '存档失败';
            if (slot) selectedSlot = 'quick';
            render();
            return slot;
        }
        if (act === 'quick-load') { const quick = progress.getQuick(); return quick ? jump({ pos: quick }) : null; }
        if (act === 'slot-new' || act === 'slot-over') {
            if (act === 'slot-over' && options.confirm && !(await options.confirm('用当前位置覆盖这个存档？'))) return null;
            const result = await options.onSaveSlot?.(act === 'slot-over' ? value : undefined);
            notice = result && result.ok ? `已存档：${positionLabel(result.slot)}` : (result && result.reason === 'slots-full' ? `档位已满（${READING_SLOT_LIMIT} 个），请先删一个或覆盖` : '存档失败');
            if (result && result.ok && result.slot && result.slot.key) selectedSlot = result.slot.key;
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
            selectedSlot = '';
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
            if (next != null) { tab = 'floors'; selectedId = next; render(); scrollToId(next); }
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
        try { theme = normalizeSettingsTheme(options.getTheme?.() || ''); } catch (_) { theme = normalizeSettingsTheme(''); }
        root = doc.createElement('div');
        root.id = 'igs-turn-index';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '目录');
        root.setAttribute('data-rp-theme', theme);
        root.addEventListener('click', onClick);
        root.addEventListener('submit', onSubmit);
        root.addEventListener('keydown', onKeydown);
        container.appendChild(root);
        host = container;
        host.classList?.toggle(OPEN_CLASS, true);
        setStagePauseReason(host, 'panel:turn-index', true);
        unwatchLayout = watchRecordPageLayout(root, doc);
        root.innerHTML = '<p class="igs-ti-empty igs-ti-loading">正在读取楼层…</p>';
        try { turns = (await options.listTurns?.()) || []; } catch (_) { turns = []; }
        if (!root) return { ok: false, reason: 'closed' };
        ids = turns.map((turn) => Number(turn && turn.id)).filter(Number.isInteger);
        const currentId = Number(options.currentId?.());
        selectedId = ids.includes(currentId) ? currentId : null;
        render();
        if (tab === 'floors') scrollToId(currentId);
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('keydown', onKeydown);
        unwatchLayout();
        unwatchLayout = () => { };
        root.remove();
        root = null;
        host?.classList?.toggle(OPEN_CLASS, false);
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
        getState: () => ({ tab, rows: rows.length, ids: ids.slice(), notice, selectedId, selectedSlot, theme }),
        act: (act, value) => (acting = acting.then(() => handle(act, value))),
    };
}

// 外壳（毛玻璃底、水纹、四套配色、页头、chip / 分段 / 主按钮）直接复用资料页的，只换选择器；地图页那半不要。
const SHELL_STYLE_TEXT = RECORD_PAGE_SHELL_STYLE_TEXT
    .replace(/#igs-map-panel[^,{]*,?/g, '')
    .replace(/,\s*{/g, '{')
    .replaceAll('#igs-record-panel', '#igs-turn-index')
    .replaceAll('.igs-record-screen-open', `.${OPEN_CLASS}`);
const T = '#igs-turn-index';

// 续读提示条与提示弹窗都走设置器配色（IGS_HINT_THEME_STYLE_TEXT）。
export const TURN_INDEX_STYLE_TEXT = `
${SHELL_STYLE_TEXT}
${IGS_HINT_THEME_STYLE_TEXT}
#igs-overlay.${OPEN_CLASS} #igs-click-layer,#igs-overlay.${OPEN_CLASS} #igs-sprite,#igs-overlay.${OPEN_CLASS} #igs-dialog-layer,#igs-overlay.${OPEN_CLASS} #igs-toolbar-layer,#igs-overlay.${OPEN_CLASS} #igs-option-layer,#igs-overlay.${OPEN_CLASS} #igs-status-hud,#igs-overlay.${OPEN_CLASS} #igs-sprite-edit-bar,#igs-overlay.${OPEN_CLASS} #igs-resume-bar{display:none!important;pointer-events:none!important;}
${T}{position:absolute;inset:0;z-index:30;pointer-events:auto;color:var(--igs-rp-text,#eceae6);}
${T} button{color:inherit;cursor:pointer;font-family:inherit;}
${T} svg{width:18px;height:18px;flex:none;}
${T} .igs-ti-loading{position:absolute;inset:0;display:grid;place-items:center;margin:0;background:var(--igs-rp-backdrop-solid,rgba(14,14,18,.94));}
${T} .igs-ti-tabs{position:relative;z-index:2;display:flex;justify-content:center;padding:0 16px 8px;flex:none;}
${T} .igs-ti-scroll{flex:1 1 auto;min-width:0;min-height:0;width:100%;overflow:auto;padding:8px clamp(18px,4vw,56px) 28px;overscroll-behavior:contain;box-sizing:border-box;}
${T} .igs-ti-layout{display:grid;grid-template-columns:minmax(260px,32%) minmax(0,1fr);gap:clamp(20px,3vw,40px);height:100%;min-height:0;}
${T} .igs-ti-side{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;}
${T} .igs-ti-summary{margin:0;color:var(--igs-rp-text-faint);font-size:12px;letter-spacing:.06em;font-variant-numeric:tabular-nums;}
${T} .igs-ti-quick{display:flex;flex-wrap:wrap;gap:2px;margin:0 -6px;}
${T} .igs-rp-chip:disabled{opacity:.35;cursor:default;background:transparent;}
${T} .igs-rp-chip.is-danger:hover{color:var(--igs-rp-danger,#d96c6c);}
${T} .igs-ti-goto{margin:0;}
${T} .igs-ti-goto input{flex:1;min-width:0;height:100%;margin:0;padding:0;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;color:var(--igs-rp-text);font:inherit;font-size:13px;-webkit-appearance:none;appearance:none;-moz-appearance:textfield;}
${T} .igs-ti-goto input::-webkit-outer-spin-button,${T} .igs-ti-goto input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
${T} .igs-ti-goto input::placeholder{color:var(--igs-rp-text-faint);}
${T} .igs-ti-notice{margin:0;}
${T} .igs-ti-empty{margin:16px 0;color:var(--igs-rp-text-faint);font-size:13px;text-align:center;}
${T} .igs-ti-list{flex:1 1 auto;min-height:160px;overflow:auto;position:relative;margin:0 -6px;}
${T} .igs-ti-inner{position:relative;}
${T} .igs-ti-row{position:absolute;left:0;right:0;height:${ROW_HEIGHT - 2}px;display:flex;align-items:center;gap:12px;padding:0 10px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-row:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
${T} .igs-ti-floor[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${T} .igs-ti-chapter{justify-content:space-between;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
${T} .igs-ti-chapter:hover{background:transparent;color:var(--igs-rp-text-soft);}
${T} .igs-ti-no{flex:0 0 3em;color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;}
${T} .igs-ti-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;}
${T} .igs-ti-floor.is-read .igs-ti-text{color:var(--igs-rp-text-faint);}
${T} .igs-ti-mark{flex:none;color:var(--igs-rp-accent,var(--igs-rp-text));font-size:11px;letter-spacing:.08em;}
${T} .igs-rp-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--igs-rp-warm);}
${T} .igs-rp-dot.is-partial{background:transparent;box-shadow:inset 0 0 0 1.5px var(--igs-rp-warm);}
${T} .igs-ti-detail{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;box-sizing:border-box;padding:clamp(24px,3.4vw,44px) clamp(22px,4vw,56px) 16px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-reading);box-shadow:var(--igs-rp-pane-edge);}
${T} .igs-ti-meta{display:flex;flex-wrap:wrap;align-items:center;margin:0;color:var(--igs-rp-text-faint);font-size:12px;font-weight:500;letter-spacing:.12em;}
${T} .igs-ti-meta i{margin:0 10px;font-style:normal;color:var(--igs-rp-text-ghost);}
${T} .igs-ti-detail h3{margin:12px 0 18px;font-family:var(--igs-rp-font-body);font-size:24px;font-weight:400;letter-spacing:.08em;line-height:1.4;overflow-wrap:anywhere;}
${T} .igs-ti-body{margin:18px 0 0;max-width:34em;font-family:var(--igs-rp-font-body);font-size:16px;line-height:1.95;letter-spacing:.03em;color:var(--igs-rp-text);white-space:pre-wrap;overflow-wrap:anywhere;}
${T} .igs-ti-detail h3 + .igs-ti-body{margin-top:0;color:var(--igs-rp-text-soft);}
${T} .igs-ti-detail-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:28px;}
${T} .igs-ti-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:auto;padding-top:28px;font-size:13px;}
${T} .igs-ti-nav button{min-height:36px;padding:7px 12px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);font-weight:500;letter-spacing:.06em;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-nav button:hover:not([disabled]){background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
${T} .igs-ti-nav button:first-child{justify-self:start;}
${T} .igs-ti-nav button:last-child{justify-self:end;}
${T} .igs-ti-nav button[disabled]{opacity:.3;cursor:default;}
${T} .igs-ti-nav span{color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;letter-spacing:.16em;}
${T} .igs-ti-overview h3{font-variant-numeric:tabular-nums;}
${T} .igs-ti-progress{height:3px;border-radius:2px;background:var(--igs-rp-fill-active);overflow:hidden;}
${T} .igs-ti-progress span{display:block;height:100%;background:var(--igs-rp-accent,var(--igs-rp-text));}
${T} .igs-ti-overview .igs-ti-summary{margin-top:14px;}
${T} .igs-ti-hint{margin:auto 0 0;padding-top:28px;color:var(--igs-rp-text-faint);font-size:13px;letter-spacing:.08em;}
${T} .igs-ti-empty-pane{align-items:center;justify-content:center;gap:12px;color:var(--igs-rp-text-faint);background:var(--igs-rp-pane);}
${T} .igs-ti-empty-pane p{margin:0;font-size:13px;letter-spacing:.08em;text-align:center;}
${T} .igs-ti-empty-pane svg{width:28px;height:28px;opacity:.6;}
${T} .igs-ti-slots{list-style:none;margin:0 -6px;padding:0;display:flex;flex-direction:column;gap:2px;overflow:auto;}
${T} .igs-ti-slots button{display:flex;align-items:center;gap:12px;width:100%;padding:7px 10px 7px 8px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-slots button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
${T} .igs-ti-slots button[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${T} .igs-ti-slot-thumb{flex:none;width:56px;height:36px;border-radius:var(--igs-rp-radius-s);object-fit:cover;background:var(--igs-rp-fill);}
${T} .igs-ti-slot-thumb.is-blank{display:grid;place-items:center;color:var(--igs-rp-text-ghost);}
${T} .igs-ti-slot-copy{display:flex;flex-direction:column;flex:1;min-width:0;}
${T} .igs-ti-slot-copy strong{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${T} .igs-ti-slot-copy small{color:var(--igs-rp-text-faint);font-size:11px;font-variant-numeric:tabular-nums;}
${T} .igs-ti-detail-thumb{display:block;width:100%;max-height:42%;margin:0 0 20px;border-radius:var(--igs-rp-radius-m);object-fit:cover;}
${T}.igs-rp-narrow .igs-ti-scroll{padding:4px 14px 20px;}
${T}.igs-rp-narrow .igs-ti-layout{display:flex;flex-direction:column;gap:14px;height:auto;min-height:100%;}
${T}.igs-rp-narrow .igs-ti-list{flex:none;height:38vh;}
${T}.igs-rp-narrow .igs-ti-slots{max-height:34vh;}
${T}.igs-rp-narrow .igs-ti-detail{flex:1 0 auto;min-height:260px;overflow:visible;padding:22px 18px 12px;}
${T}.igs-rp-narrow .igs-ti-detail h3{font-size:20px;margin:10px 0 14px;}
`;
