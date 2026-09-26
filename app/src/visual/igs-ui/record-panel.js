import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildRecordModel, buildRelationshipModel, parseLooseDate } from '../../data/shujuku/record-model.js';
import { createCharacterMetricsLookup } from '../../data/shujuku/character-metrics.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { INVENTORY_GROUP_ORDER, RECORD_ICONS, inventoryGroupLabel, inventoryIconKey } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { applyTypewriterEffect, cancelTypewriter } from './typewriter-runtime.js';

const labels = Object.freeze({ diary: '日记', inventory: '物品', relationships: '人际关系' });
const pageTitles = Object.freeze({ diary: '珍藏心事', inventory: '你的背包', relationships: '人际关系' });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cellsHtml = cells => cells.length ? `<dl class="igs-record-fields">${cells.map(cell => `<div><dt>${escapeHtml(cell.label)}</dt><dd>${escapeHtml(cell.value)}</dd></div>`).join('')}</dl>` : '';
const personInitial = value => escapeHtml(String(value ?? '').trim().charAt(0) || '·');
const INVENTORY_SORTS = Object.freeze([['default', '默认'], ['name', '名称'], ['quantity', '数量']]);
const DIARY_PREFS_KEY = 'igs_record_diary_prefs';
const DIARY_READ_KEY = 'igs_record_diary_read';
const DIARY_READ_LIMIT = 2000;
const DIARY_PREFS = Object.freeze([
    ['pageTurn', '翻页动画', '切换篇章时轻翻入场'],
    ['typewriter', '打字机', '打开篇章时逐字浮现，点击正文立即显示'],
    ['unread', '未读标记', '新写入的日记显示小圆点'],
    ['scroll', '连续阅读', '同一列表的篇章上下连成长卷'],
]);
const DIARY_PREF_DEFAULTS = Object.freeze({ pageTurn: true, typewriter: false, unread: true, scroll: false });

// 心事视图日期：只有整册均为合法 YYYY-MM-DD 才按最新在前排序，否则保留原表顺序。
const isCanonicalDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const excerpt = (text, max) => {
    const line = String(text || '').split(/\n/).map(part => part.trim()).find(Boolean) || '';
    const chars = Array.from(line.replace(/[。！？!?…,，、；;：:]+$/, ''));
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};
const chapterTitle = entry => entry.chapterTitle || excerpt(entry.body, 16) || entry.title || '未命名篇章';
const dateLabel = value => parseLooseDate(value)?.label || String(value || '');
const hashText = text => { let hash = 5381; for (const char of String(text)) hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0; return hash.toString(36); };
const entryReadKey = entry => `${entry.uid}|${entry.author || ''}|${entry.date || ''}|${hashText(entry.body || entry.cells?.map(cell => cell.value).join('|'))}`;

// 按日期新→旧；只要有一篇无法识别日期，就退回表内追加顺序的倒序（最新写入在前），不猜日期。
function newestFirst(list) {
    const keyed = list.map((entry, index) => ({ entry, index, date: parseLooseDate(entry.date) }));
    if (keyed.length && keyed.every(item => item.date)) return keyed.sort((a, b) => b.date.key - a.date.key || b.index - a.index).map(item => item.entry);
    return list.slice().reverse();
}

// Only names that appear in labels are ever rendered as SVG; sheet contents remain escaped text.
export function createRecordPanelController(doc, global, fillDraft) {
    let root = null;
    let client = null;
    let category = '';
    let model = null;
    let settings = null;
    let pageOverlay = null;
    let activeUid = '';
    let selectedId = '';
    let relationshipPersonId = '';
    let diaryBook = '';
    let diaryView = 'books';
    let prefsOpen = false;
    let turn = '';
    let typedId = '';
    let invGroup = '';
    let invSort = 'default';
    let invQuery = '';
    let message = '';
    let metricsOf = () => ({ metrics: [], stages: [] });
    let readKeys = new Set();
    let previousFocus = null;
    let unwatchLayout = null;
    const callback = () => { if (root) reload(); };
    const storage = () => { try { return (global || globalThis).localStorage || null; } catch (_) { return null; } };
    const loadJson = (key, fallback) => { try { const raw = storage()?.getItem?.(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } };
    const saveJson = (key, value) => { try { storage()?.setItem?.(key, JSON.stringify(value)); } catch (_) { /* Storage may be full or blocked. */ } };
    let prefs = { ...DIARY_PREF_DEFAULTS };
    const table = () => model?.tables?.find(item => item.uid === activeUid);
    const relationshipPeople = () => model?.people?.filter(item => item.uid === activeUid) || [];
    const relationshipEdges = () => model?.edges?.filter(item => item.uid === activeUid) || [];
    const entries = () => category === 'diary' || category === 'inventory'
        ? (model?.entries || [])
        : category === 'relationships' ? relationshipPeople() : (model?.entries?.filter(item => item.uid === activeUid) || []);
    const isUnread = entry => prefs.unread && !readKeys.has(entryReadKey(entry));

    // 心事分册：同一来源 UID 内按明确作者分册；未署名归入中性“未署名册”，不默认归为“我”。
    const diaryBooks = () => {
        const books = new Map();
        for (const entry of model?.entries || []) {
            const key = `${entry.uid}::${entry.author || ''}`;
            if (!books.has(key)) books.set(key, { key, uid: entry.uid, author: entry.author || '', label: entry.author || '未署名册', entries: [] });
            books.get(key).entries.push(entry);
        }
        for (const book of books.values()) {
            if (book.entries.length && book.entries.every(item => isCanonicalDate(item.date)))
                book.entries.sort((a, b) => b.date.localeCompare(a.date) || a.rowIndex - b.rowIndex);
        }
        return [...books.values()];
    };
    const currentBook = () => { const books = diaryBooks(); return books.find(item => item.key === diaryBook) || books[0] || null; };
    const diaryList = () => diaryView === 'timeline' ? newestFirst(model?.entries || []) : (currentBook()?.entries || []);

    const itemGroup = item => item.category || inventoryGroupLabel(item.title);
    const inventoryGroups = () => {
        const present = new Set((model?.entries || []).map(itemGroup));
        const ordered = INVENTORY_GROUP_ORDER.filter(label => present.has(label));
        return [...ordered, ...[...present].filter(label => !ordered.includes(label))];
    };
    const visibleItems = () => {
        const query = invQuery.trim().toLowerCase();
        const list = (model?.entries || []).filter(item => (!invGroup || itemGroup(item) === invGroup)
            && (!query || String(item.title || '').toLowerCase().includes(query)
                || item.detailCells?.some(cell => String(cell.value).toLowerCase().includes(query))));
        if (invSort === 'name') return list.slice().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'));
        if (invSort === 'quantity') {
            const qty = item => { const value = Number(String(item.quantity ?? '').trim()); return String(item.quantity ?? '').trim() && Number.isFinite(value) ? value : -Infinity; };
            return list.slice().sort((a, b) => qty(b) - qty(a) || a.rowIndex - b.rowIndex);
        }
        return list;
    };

    function open(overlay, readerSettings, type) {
        if (root) return { ok: false, reason: 'already-open' };
        if (!labels[type] || !overlay || !doc?.createElement) return { ok: false, reason: 'invalid-record-view' };
        category = type;
        settings = readerSettings || null;
        activeUid = '';
        selectedId = '';
        relationshipPersonId = '';
        diaryBook = '';
        prefsOpen = false;
        turn = '';
        typedId = '';
        invGroup = '';
        invSort = 'default';
        invQuery = '';
        message = '';
        prefs = { ...DIARY_PREF_DEFAULTS, ...loadJson(DIARY_PREFS_KEY, {}) };
        diaryView = loadJson(DIARY_PREFS_KEY, {})?.view === 'timeline' ? 'timeline' : 'books';
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-record-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', labels[type]);
        root.setAttribute('data-record-category', type);
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        overlay.classList?.toggle('igs-record-screen-open', true);
        (overlay.querySelector?.('#igs-db-layer') || overlay).appendChild(root);
        unwatchLayout = watchRecordPageLayout(root, doc);
        applyTransparentGlassMaterial(root, settings?.glassOpacity, { backdropFilter: settings?.glassBackdropFilter });
        client = createShujukuClient((global || globalThis).AutoCardUpdaterAPI || null);
        try { client.registerCallback(callback); } catch (_) { /* Optional subscription. */ }
        reload();
        root.querySelector?.('[data-record-act="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        unwatchLayout?.();
        unwatchLayout = null;
        const body = root.querySelector?.('.igs-record-diary-detail .igs-record-body');
        if (body) cancelTypewriter(body);
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.remove();
        root = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        pageOverlay = null;
        try { client?.unregisterCallback(callback); } catch (_) { /* Host may have disappeared. */ }
        client = null;
        settings = null;
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    function reload() {
        let readResult = null;
        try {
            readResult = client.readTables();
            model = category === 'relationships' ? buildRelationshipModel(readResult) : buildRecordModel(readResult, category);
        } catch (error) {
            model = category === 'relationships'
                ? { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], people: [], edges: [] }
                : { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], entries: [] };
        }
        if (!table()) activeUid = model.tables[0]?.uid || '';
        if (category === 'relationships') {
            try {
                metricsOf = createCharacterMetricsLookup(readResult, {
                    selectedTables: settings?.statusHud?.tables,
                    characterAliases: (settings?._sceneAssets || settings?.sceneAssets)?.characterAliases,
                });
            } catch (_) { metricsOf = () => ({ metrics: [], stages: [] }); }
            if (!relationshipPeople().some(person => person.id === relationshipPersonId)) relationshipPersonId = relationshipPeople()[0]?.id || '';
            selectedId = '';
        } else if (selectedId && !entries().some(entry => entry.id === selectedId)) selectedId = '';
        if (category === 'diary') syncReadKeys();
        render();
    }

    // 首次使用把现有篇章记为已读，之后新写入的日记才显示未读圆点。
    function syncReadKeys() {
        const stored = loadJson(DIARY_READ_KEY, null);
        if (!Array.isArray(stored)) {
            readKeys = new Set((model?.entries || []).map(entryReadKey));
            saveJson(DIARY_READ_KEY, [...readKeys]);
        } else readKeys = new Set(stored);
        const chosen = (model?.entries || []).find(entry => entry.id === selectedId);
        if (chosen) markRead(chosen);
    }

    function markRead(entry) {
        const key = entryReadKey(entry);
        if (readKeys.has(key)) return;
        readKeys.add(key);
        saveJson(DIARY_READ_KEY, [...readKeys].slice(-DIARY_READ_LIMIT));
    }

    function savePrefs() { saveJson(DIARY_PREFS_KEY, { ...prefs, view: diaryView }); }

    function onInput(event) {
        const input = event.target;
        if (!root || input?.getAttribute?.('data-record-input') !== 'query') return;
        invQuery = String(input.value ?? '');
        const grid = root.querySelector?.('.igs-record-slots');
        if (grid) grid.innerHTML = slotsHtml(visibleItems());
        else render();
    }

    async function useItem() {
        const item = (model?.entries || []).find(entry => entry.id === selectedId);
        if (!item?.title || typeof fillDraft !== 'function') return;
        try {
            const result = await fillDraft(`使用${item.title}`);
            message = result?.ok ? '已填入草稿，尚未发送' : result?.reason === 'draft-not-empty'
                ? '输入框已有草稿，未覆盖' : `填入失败：${result?.reason || '输入框不可用'}`;
        } catch (_) { message = '填入失败：输入框不可用'; }
        render();
    }

    function onClick(event) {
        event.stopPropagation?.();
        if (event.target === root) return close();
        const typing = event.target?.closest?.('.igs-record-body[data-igs-typewriter="running"]');
        if (typing) { cancelTypewriter(typing); return; }
        const button = event.target?.closest?.('[data-record-act]');
        if (!button || !root?.contains(button)) return;
        event.preventDefault?.();
        const action = button.getAttribute('data-record-act');
        if (action === 'close') return close();
        const id = button.getAttribute('data-record-id');
        const previousSelected = selectedId;
        turn = '';
        if (action === 'use') { useItem(); return; }
        if (action !== 'toggle-prefs' && action !== 'pref') message = '';
        if (action === 'table' && model.tables.some(item => item.uid === id)) {
            activeUid = id;
            if (category === 'relationships') relationshipPersonId = relationshipPeople()[0]?.id || '';
            selectedId = '';
        }
        if (action === 'book' && category === 'diary') {
            // 选册：清空篇章选择，等待用户点篇；不自动替用户决定读哪一篇。
            if (diaryBooks().some(book => book.key === id)) { diaryBook = id; selectedId = ''; }
        }
        if (action === 'diary-view' && (id === 'books' || id === 'timeline')) { diaryView = id; savePrefs(); }
        if (action === 'toggle-prefs') prefsOpen = !prefsOpen;
        if (action === 'pref' && Object.hasOwn(DIARY_PREF_DEFAULTS, id)) { prefs[id] = !prefs[id]; savePrefs(); }
        if (action === 'select') {
            const entry = entries().find(item => item.id === id);
            if (entry) {
                if (category === 'diary') {
                    const list = diaryList();
                    const from = list.findIndex(item => item.id === selectedId);
                    const to = list.findIndex(item => item.id === id);
                    turn = from >= 0 && to >= 0 && to < from ? 'prev' : 'next';
                    if (diaryView === 'books') diaryBook = `${entry.uid}::${entry.author || ''}`;
                    markRead(entry);
                }
                selectedId = id;
            }
        }
        if (action === 'group' && category === 'inventory') invGroup = inventoryGroups().includes(id) ? id : '';
        if (action === 'sort' && category === 'inventory') {
            const index = INVENTORY_SORTS.findIndex(([key]) => key === invSort);
            invSort = INVENTORY_SORTS[(index + 1) % INVENTORY_SORTS.length][0];
        }
        if (action === 'person' && category === 'relationships') {
            const person = relationshipPeople().find(item => item.id === id);
            if (person) relationshipPersonId = person.id;
        }
        if ((action === 'prev-entry' || action === 'next-entry') && category === 'diary') {
            const list = diaryList();
            const index = list.findIndex(item => item.id === selectedId);
            const next = index + (action === 'next-entry' ? 1 : -1);
            if (index >= 0 && next >= 0 && next < list.length) {
                selectedId = list[next].id;
                turn = action === 'next-entry' ? 'next' : 'prev';
                markRead(list[next]);
            }
        }
        if (selectedId === previousSelected) turn = '';
        render();
        // Rerender replaces the activated button. Return focus to its replacement,
        // without interpolating untrusted sheet IDs into a CSS selector.
        const replacement = Array.from(root?.querySelectorAll?.('[data-record-act]') || [])
            .find(item => item.getAttribute('data-record-act') === action && item.getAttribute('data-record-id') === id);
        replacement?.focus?.();
    }

    function slotsHtml(items) {
        if (!items.length) return '<p class="igs-record-slots-empty">没有符合条件的物品</p>';
        return items.map(item => {
            // 数量语义：'0' 如实显示 ×0；缺失不补 ×1、不显示角标，详情写“数量未记录”。
            const quantity = String(item.quantity ?? '').trim();
            const selected = item.id === selectedId;
            return `<button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.title)}" ${selected ? 'aria-current="true"' : ''}><span class="igs-record-slot-icon" aria-hidden="true">${RECORD_ICONS[inventoryIconKey(item.title)]}</span><span class="igs-record-slot-name">${escapeHtml(item.title || '未命名')}</span>${quantity ? `<small class="igs-record-slot-quantity">×${escapeHtml(quantity)}</small>` : ''}</button>`;
        }).join('');
    }

    function renderInventory() {
        const items = visibleItems();
        const chosen = (model?.entries || []).find(item => item.id === selectedId);
        const groups = inventoryGroups();
        const total = (model?.entries || []).length;
        const chips = groups.length > 1 ? `<div class="igs-record-groups" role="group" aria-label="物品分类"><button type="button" class="igs-rp-chip" data-record-act="group" data-record-id="" aria-pressed="${invGroup ? 'false' : 'true'}">全部<small>${total}</small></button>${groups.map(label =>
            `<button type="button" class="igs-rp-chip" data-record-act="group" data-record-id="${escapeHtml(label)}" aria-pressed="${label === invGroup ? 'true' : 'false'}">${escapeHtml(label)}<small>${(model?.entries || []).filter(item => itemGroup(item) === label).length}</small></button>`).join('')}</div>` : '';
        const sortLabel = INVENTORY_SORTS.find(([key]) => key === invSort)?.[1] || '默认';
        const tools = total ? `<div class="igs-record-inventory-tools">${chips}<div class="igs-record-inventory-actions"><label class="igs-rp-search">${RECORD_ICONS.search}<input type="search" data-record-input="query" value="${escapeHtml(invQuery)}" placeholder="搜索物品" aria-label="搜索物品" autocomplete="off"></label><button type="button" class="igs-rp-chip igs-rp-chip-icon" data-record-act="sort" aria-label="排序：${sortLabel}">${RECORD_ICONS.sort}<span>${sortLabel}</span></button></div></div>` : '';
        let detail = '<div class="igs-record-item-empty"><span class="igs-record-item-empty-icon" aria-hidden="true">' + RECORD_ICONS.sparkle + '</span><p>选择物品，查看详情</p></div>';
        if (chosen) {
            const descriptionCell = (chosen.detailCells || []).find(cell => ['描述', '说明', '内容', '详情'].includes(String(cell.label || '').trim()));
            const extraCells = (chosen.detailCells || []).filter(cell => cell !== descriptionCell);
            const quantity = String(chosen.quantity ?? '').trim();
            const useButton = typeof fillDraft === 'function' && quantity !== '0'
                ? `<div class="igs-record-item-actions"><button type="button" class="igs-rp-btn" data-record-act="use">使用</button><small>把「使用${escapeHtml(chosen.title || '')}」填入输入框，不会自动发送</small></div>` : '';
            detail = `<section class="igs-record-item-detail"><div class="igs-record-item-detail-icon" aria-hidden="true">${RECORD_ICONS[inventoryIconKey(chosen.title)]}</div><div class="igs-record-item-detail-copy"><p class="igs-record-item-kicker">${escapeHtml(itemGroup(chosen))}</p><h3>${escapeHtml(chosen.title || '未命名')}</h3><p class="igs-record-item-quantity">${quantity ? `数量：×${escapeHtml(quantity)}` : '数量未记录'}</p>${descriptionCell ? `<p class="igs-record-item-description">${escapeHtml(descriptionCell.value)}</p>` : ''}${cellsHtml(extraCells)}${useButton}<p class="igs-record-feedback" role="status" aria-live="polite">${escapeHtml(message)}</p></div></section>`;
        }
        return `<div class="igs-record-inventory"><section class="igs-record-inventory-main">${tools}<div class="igs-record-slots" aria-label="物品栏">${slotsHtml(items)}</div></section><aside class="igs-record-item-pane">${detail}</aside></div>`;
    }

    function diaryPageHtml(entry, { heading = 'h3' } = {}) {
        const meta = [escapeHtml(entry.author || '未署名'), entry.date ? escapeHtml(entry.date) : '', entry.related ? `关于 ${escapeHtml(entry.related)}` : ''].filter(Boolean).join('<i aria-hidden="true">·</i>');
        return `<p class="igs-record-diary-meta">${meta}</p><${heading}>${escapeHtml(chapterTitle(entry))}</${heading}>` +
            (entry.body ? `<p class="igs-record-body">${escapeHtml(entry.body)}</p>` : cellsHtml(entry.detailCells || []));
    }

    function renderDiary() {
        const books = diaryBooks();
        const book = currentBook();
        if (book) diaryBook = book.key;
        const list = diaryList();
        const chosen = list.find(item => item.id === selectedId) || null;
        const index = chosen ? list.indexOf(chosen) : -1;
        const dot = entry => isUnread(entry) ? '<i class="igs-rp-dot" aria-label="未读"></i>' : '';
        const viewSwitch = `<div class="igs-rp-segment" role="group" aria-label="浏览方式"><button type="button" data-record-act="diary-view" data-record-id="books" aria-pressed="${diaryView === 'books'}">${RECORD_ICONS.people}<span>按人物</span></button><button type="button" data-record-act="diary-view" data-record-id="timeline" aria-pressed="${diaryView === 'timeline'}">${RECORD_ICONS.timeline}<span>时间线</span></button></div>`;
        const prefsButton = `<button type="button" class="igs-rp-icon-btn" data-record-act="toggle-prefs" aria-expanded="${prefsOpen}" aria-label="阅读设置">${RECORD_ICONS.sliders}</button>`;
        const prefsPanel = prefsOpen ? `<div class="igs-record-prefs" role="group" aria-label="阅读设置">${DIARY_PREFS.map(([key, label, hint]) =>
            `<button type="button" data-record-act="pref" data-record-id="${key}" aria-pressed="${prefs[key] ? 'true' : 'false'}"><span class="igs-rp-switch" aria-hidden="true"></span><span><strong>${label}</strong><small>${hint}</small></span></button>`).join('')}</div>` : '';
        let nav = '';
        if (diaryView === 'books') {
            nav = `<div class="igs-record-bookshelf" aria-label="选册">${books.map(item => {
                const unread = item.entries.filter(isUnread).length;
                return `<button type="button" class="igs-record-book" data-record-act="book" data-record-id="${escapeHtml(item.key)}" aria-label="阅读${escapeHtml(item.label)}的日记" ${item.key === diaryBook ? 'aria-current="true"' : ''}><span class="igs-record-book-avatar" aria-hidden="true">${personInitial(item.author || '?')}</span><span class="igs-record-book-meta"><span>${escapeHtml(item.label)}</span><small>${item.entries.length} 篇${unread ? ` · ${unread} 未读` : ''}</small></span>${unread ? '<i class="igs-rp-dot" aria-hidden="true"></i>' : ''}</button>`;
            }).join('')}</div>` + (list.length ? `<ol class="igs-record-chapters" aria-label="篇章列表">${list.map(item =>
                `<li><button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="阅读${escapeHtml(chapterTitle(item))}" ${item.id === selectedId ? 'aria-current="true"' : ''}>${item.date ? `<span class="igs-record-chapter-date">${escapeHtml(dateLabel(item.date))}</span>` : ''}<span class="igs-record-chapter-title">${escapeHtml(chapterTitle(item))}</span>${dot(item)}</button></li>`).join('')}</ol>` : '');
        } else {
            let lastDate = null;
            nav = list.length ? `<ol class="igs-record-timeline" aria-label="时间线">${list.map(item => {
                const label = item.date ? dateLabel(item.date) : '';
                const header = label !== lastDate && label ? `<li class="igs-record-timeline-date" aria-hidden="true">${escapeHtml(label)}</li>` : '';
                lastDate = label;
                return `${header}<li><button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="阅读${escapeHtml(item.author || '未署名')}的${escapeHtml(chapterTitle(item))}" ${item.id === selectedId ? 'aria-current="true"' : ''}><span class="igs-record-timeline-avatar" aria-hidden="true">${personInitial(item.author || '?')}</span><span class="igs-record-timeline-copy"><strong>${escapeHtml(chapterTitle(item))}</strong><small>${escapeHtml(item.author || '未署名')}</small></span>${dot(item)}</button></li>`;
            }).join('')}</ol>` : '';
        }
        let reading;
        if (prefs.scroll && list.length) {
            reading = `<div class="igs-record-diary-detail is-scroll" aria-label="连续阅读">${list.map(item =>
                `<section class="igs-record-diary-page${item.id === selectedId ? ' is-current' : ''}" data-record-page="${escapeHtml(item.id)}">${diaryPageHtml(item)}</section>`).join('')}</div>`;
        } else if (chosen) {
            const turnClass = prefs.pageTurn && turn ? ` igs-rp-turn-${turn}` : '';
            reading = `<article class="igs-record-diary-detail${turnClass}">${diaryPageHtml(chosen)}` +
                `<footer class="igs-record-diary-nav"><button type="button" data-record-act="prev-entry" ${index <= 0 ? 'disabled' : ''}>← 上一则</button><span>${index >= 0 ? `${String(index + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}` : ''}</span><button type="button" data-record-act="next-entry" ${index < 0 || index >= list.length - 1 ? 'disabled' : ''}>下一则 →</button></footer></article>`;
        } else reading = `<div class="igs-record-diary-empty"><span aria-hidden="true">${RECORD_ICONS.book}</span><p>${diaryView === 'books' ? '选择一册与一篇开始阅读' : '在时间线中选择一篇开始阅读'}</p></div>`;
        return `<div class="igs-record-diary" data-view="${diaryView}"><aside class="igs-record-diary-side"><div class="igs-record-diary-tools">${viewSwitch}${prefsButton}</div>${prefsPanel}${nav}</aside>${reading}</div>`;
    }

    function renderRelationships() {
        const people = relationshipPeople();
        const chosen = people.find(item => item.id === relationshipPersonId) || people[0] || null;
        if (chosen && chosen.id !== relationshipPersonId) relationshipPersonId = chosen.id;
        const localEdges = chosen ? relationshipEdges().filter(edge => edge.from === chosen.name || edge.to === chosen.name) : [];
        const neighbors = [];
        for (const edge of localEdges) {
            const name = edge.from === chosen?.name ? edge.to : edge.from;
            const person = people.find(item => item.name === name) || { id: `${activeUid}:edge-name:${name}`, uid: activeUid, name, role: '', description: '', synthetic: true };
            if (!neighbors.some(item => item.id === person.id)) neighbors.push(person);
        }
        const neighborX = neighbors.length <= 1 ? [50] : neighbors.map((_, index) =>
            Math.round((18 + (64 * index) / (neighbors.length - 1)) * 10) / 10);
        const graphNodes = [{ person: chosen, x: 50, y: neighbors.length ? 24 : 50 }, ...neighbors.map((person, index) =>
            ({ person, x: neighborX[index], y: neighbors.length > 4 && index % 2 ? 80 : 72 }))].filter(item => item.person);
        const nodeByName = new Map(graphNodes.map(item => [item.person.name, item]));
        const lineHtml = localEdges.map(edge => {
            const target = nodeByName.get(edge.from === chosen?.name ? edge.to : edge.from);
            if (!target) return '';
            const startY = neighbors.length ? 34 : 50;
            const endY = neighbors.length ? target.y - 9 : target.y;
            const controlX = Math.round(((50 + target.x) / 2) * 10) / 10;
            return `<path d="M 50 ${startY} C 50 ${startY + 14}, ${controlX} ${endY - 14}, ${target.x} ${endY}"></path>`;
        }).join('');
        const labelHtml = localEdges.map((edge, index) => {
            const target = nodeByName.get(edge.from === chosen?.name ? edge.to : edge.from);
            if (!target) return '';
            const left = Math.round(((50 + target.x) / 2) * 10) / 10;
            const top = neighbors.length ? 50 + (index % 2) * 5 : 50;
            return `<span class="igs-record-relationship-label" style="left:${left}%;top:${top}%">${escapeHtml(edge.label || '关系未标注')}</span>`;
        }).join('');
        const graphHtml = chosen ? `<div class="igs-record-relationship-graph" aria-label="${escapeHtml(chosen.name)}的局部关系图"><svg class="igs-record-relationship-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lineHtml}</svg>${labelHtml}${graphNodes.map(node =>
            `<button type="button" class="igs-record-relationship-node${node.person.id === chosen.id ? ' is-current' : ''}" style="left:${node.x}%;top:${node.y}%" data-record-act="person" data-record-id="${escapeHtml(node.person.id)}" aria-label="查看${escapeHtml(node.person.name)}" ${node.person.id === relationshipPersonId ? 'aria-current="true"' : ''}><span class="igs-record-node-avatar" aria-hidden="true">${personInitial(node.person.name)}</span><span class="igs-record-node-name">${escapeHtml(node.person.name)}</span></button>`).join('')}</div>` : '<p class="igs-record-relationship-empty">当前来源没有可识别的人物记录。</p>';
        const { metrics, stages } = chosen ? metricsOf(chosen.name) : { metrics: [], stages: [] };
        const metricsHtml = metrics.length || stages.length ? `<section class="igs-record-metrics" aria-label="${escapeHtml(chosen.name)}的数值">${stages.map(stage =>
            `<p class="igs-record-stage"><span>${escapeHtml(stage.label)}</span><strong>${escapeHtml(stage.value)}</strong></p>`).join('')}${metrics.map(metric =>
            `<div class="igs-record-metric"><span>${escapeHtml(metric.label)}</span><i role="img" aria-label="${escapeHtml(metric.label)} ${escapeHtml(metric.display)}"><b style="width:${Math.max(0, Math.min(100, Number(metric.percent) || 0))}%"></b></i><em>${escapeHtml(metric.display)}</em></div>`).join('')}</section>` : '';
        const links = localEdges.map(edge => ({ label: edge.label || '关系未标注', name: edge.from === chosen?.name ? edge.to : edge.from }));
        const linksHtml = links.length ? `<ul class="igs-record-relationship-links" aria-label="关系">${links.map(link => `<li><span>${escapeHtml(link.label)}</span>${escapeHtml(link.name)}</li>`).join('')}</ul>` : '';
        return `<div class="igs-record-relationships">` +
            `<section class="igs-record-relationship-stage">${graphHtml}</section>` +
            `<section class="igs-record-people" aria-label="人物索引"><div class="igs-record-people-list">${people.map(person =>
                `<button type="button" data-record-act="person" data-record-id="${escapeHtml(person.id)}" aria-label="查看${escapeHtml(person.name)}" ${person.id === relationshipPersonId ? 'aria-current="true"' : ''}><span class="igs-record-person-avatar" aria-hidden="true">${personInitial(person.name)}</span><span class="igs-record-person-copy"><strong>${escapeHtml(person.name)}</strong></span></button>`).join('')}</div></section>` +
            `<article class="igs-record-relationship-detail">${chosen ? `<header class="igs-record-person-head"><h2>${escapeHtml(chosen.name)}${chosen.role ? ` · ${escapeHtml(chosen.role)}` : ''}</h2></header>${metricsHtml}<section class="igs-record-relationship-section">${chosen.description ? `<p class="igs-record-relationship-description">${escapeHtml(chosen.description)}</p>` : '<p class="igs-record-relationship-description">暂无人物描述。</p>'}${linksHtml}${cellsHtml(chosen.detailCells || [])}${chosen.synthetic ? '<p class="igs-record-relationship-note">仅记录了姓名，未提供身份或描述。</p>' : ''}</section>` : '<p>请选择人物。</p>'}</article></div>`;
    }

    function render() {
        if (!root) return;
        const current = table();
        const items = entries();
        const tabs = category === 'relationships' && model.tables.length > 1 ? `<nav class="igs-record-tabs" aria-label="选择资料来源">${model.tables.map(item =>
            `<button type="button" class="igs-rp-chip" data-record-act="table" data-record-id="${escapeHtml(item.uid)}" aria-pressed="${item.uid === activeUid ? 'true' : 'false'}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const error = model.status === 'read-error' ? `${labels[category]}读取失败：${model.reason}`
            : model.status === 'no-tables' ? `未找到匹配的${labels[category]}表`
                : model.status === 'empty' ? '匹配表没有可阅读的记录' : '';
        const diagnostics = category === 'relationships'
            ? (current?.diagnostics || [])
            : (model.tables || []).flatMap(item => item.diagnostics || []);
        let content = '';
        if (category === 'diary') content = renderDiary();
        else if (category === 'inventory') content = renderInventory();
        else if (category === 'relationships') content = renderRelationships();
        else if (current && items.length) {
            content = `<div class="igs-record-table-scroll"><table><caption>${escapeHtml(current.name)}</caption><thead><tr>${current.columns.map((column, index) => `<th scope="col">${escapeHtml(column || `第${index + 1}列`)}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr>${current.columns.map((_, index) => `<td>${escapeHtml(current.rows[item.rowIndex]?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        root.innerHTML = `<div class="igs-rp-page igs-record-window">${recordPageHeadHtml(pageTitles[category])}` +
            tabs + `<div class="igs-rp-body"><div class="igs-record-scroll">` +
            (error ? `<p class="igs-rp-notice" role="status">${escapeHtml(error)}</p>` : '') +
            (diagnostics.length ? `<p class="igs-rp-notice" role="status">${escapeHtml(diagnostics.join('；'))}</p>` : '') +
            content + '</div></div></div>';
        if (category === 'diary') afterDiaryRender();
        turn = '';
    }

    function afterDiaryRender() {
        if (prefs.scroll) {
            const pages = Array.from(root.querySelectorAll?.('[data-record-page]') || []);
            pages.find(page => page.getAttribute('data-record-page') === selectedId)?.scrollIntoView?.({ block: 'start' });
            typedId = '';
            return;
        }
        const body = root.querySelector?.('.igs-record-diary-detail .igs-record-body');
        if (!body || !selectedId || !prefs.typewriter || typedId === selectedId) { if (!selectedId) typedId = ''; return; }
        typedId = selectedId;
        const typewriter = settings?.typewriter && typeof settings.typewriter === 'object' ? settings.typewriter : {};
        applyTypewriterEffect(body, { enabled: true, mode: 'classic', speed: typewriter.speed, sound: { enabled: false }, key: `diary:${selectedId}` });
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ category, model, activeUid, selectedId, relationshipPersonId, diaryView, prefs: { ...prefs }, invGroup, invSort, invQuery, message }) };
}
