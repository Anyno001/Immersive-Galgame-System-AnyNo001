import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildRecordModel, buildRelationshipModel } from '../../data/shujuku/record-model.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { RECORD_ICONS, inventoryIconKey } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';

const labels = Object.freeze({ diary: '日记', inventory: '物品', relationships: '人际关系' });
const pageTitles = Object.freeze({ diary: '珍藏心事', inventory: '你的背包', relationships: '人际关系' });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cellsHtml = cells => `<dl class="igs-record-fields">${cells.map(cell => `<div><dt>${escapeHtml(cell.label)}</dt><dd>${escapeHtml(cell.value)}</dd></div>`).join('')}</dl>`;
const personInitial = value => escapeHtml(String(value ?? '').trim().charAt(0) || '·');

// 心事视图日期：只有整册均为合法 YYYY-MM-DD 才按最新在前排序，否则保留原表顺序。
const isCanonicalDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Only names that appear in labels are ever rendered as SVG; sheet contents remain escaped text.
export function createRecordPanelController(doc, global) {
    let root = null;
    let client = null;
    let category = '';
    let model = null;
    let pageOverlay = null;
    let activeUid = '';
    let selectedId = '';
    let relationshipPersonId = '';
    let diaryBook = '';
    let previousFocus = null;
    let unwatchLayout = null;
    const callback = () => { if (root) reload(); };
    const table = () => model?.tables?.find(item => item.uid === activeUid);
    const relationshipPeople = () => model?.people?.filter(item => item.uid === activeUid) || [];
    const relationshipEdges = () => model?.edges?.filter(item => item.uid === activeUid) || [];
    const entries = () => category === 'diary' || category === 'inventory'
        ? (model?.entries || [])
        : category === 'relationships' ? relationshipPeople() : (model?.entries?.filter(item => item.uid === activeUid) || []);

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

    function open(overlay, settings, type) {
        if (root) return { ok: false, reason: 'already-open' };
        if (!labels[type] || !overlay || !doc?.createElement) return { ok: false, reason: 'invalid-record-view' };
        category = type;
        activeUid = '';
        selectedId = '';
        relationshipPersonId = '';
        diaryBook = '';
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-record-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', labels[type]);
        root.setAttribute('data-record-category', type);
        root.addEventListener('click', onClick);
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
        root.removeEventListener('click', onClick);
        root.remove();
        root = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        pageOverlay = null;
        try { client?.unregisterCallback(callback); } catch (_) { /* Host may have disappeared. */ }
        client = null;
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    function reload() {
        try {
            const readResult = client.readTables();
            model = category === 'relationships' ? buildRelationshipModel(readResult) : buildRecordModel(readResult, category);
        } catch (error) {
            model = category === 'relationships'
                ? { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], people: [], edges: [] }
                : { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], entries: [] };
        }
        if (!table()) activeUid = model.tables[0]?.uid || '';
        if (category === 'relationships') {
            if (!relationshipPeople().some(person => person.id === relationshipPersonId)) relationshipPersonId = relationshipPeople()[0]?.id || '';
            selectedId = '';
        } else if (selectedId && !entries().some(entry => entry.id === selectedId)) selectedId = '';
        render();
    }

    function onClick(event) {
        event.stopPropagation?.();
        if (event.target === root) return close();
        const button = event.target?.closest?.('[data-record-act]');
        if (!button || !root?.contains(button)) return;
        event.preventDefault?.();
        const action = button.getAttribute('data-record-act');
        if (action === 'close') return close();
        const id = button.getAttribute('data-record-id');
        if (action === 'table' && model.tables.some(item => item.uid === id)) {
            activeUid = id;
            if (category === 'relationships') {
                relationshipPersonId = relationshipPeople()[0]?.id || '';
                selectedId = '';
            } else selectedId = '';
        }
        if (action === 'book' && category === 'diary') {
            // 选册：清空篇章选择，等待用户点篇；不自动替用户决定读哪一篇。
            if (diaryBooks().some(book => book.key === id)) { diaryBook = id; selectedId = ''; }
        }
        if (action === 'select') {
            const entry = entries().find(item => item.id === id);
            if (entry) {
                selectedId = id;
                if (category === 'diary') diaryBook = `${entry.uid}::${entry.author || ''}`;
            }
        }
        if (action === 'person' && category === 'relationships') {
            const person = relationshipPeople().find(item => item.id === id);
            if (person) relationshipPersonId = person.id;
        }
        if ((action === 'prev-entry' || action === 'next-entry') && category === 'diary') {
            const book = diaryBooks().find(item => item.key === diaryBook) || diaryBooks()[0];
            const index = book ? book.entries.findIndex(item => item.id === selectedId) : -1;
            const next = index + (action === 'next-entry' ? 1 : -1);
            if (book && next >= 0 && next < book.entries.length) selectedId = book.entries[next].id;
        }
        render();
        // Rerender replaces the activated button. Return focus to its replacement,
        // without interpolating untrusted sheet IDs into a CSS selector.
        const replacement = Array.from(root?.querySelectorAll?.('[data-record-act]') || [])
            .find(item => item.getAttribute('data-record-act') === action && item.getAttribute('data-record-id') === id);
        replacement?.focus?.();
    }

    function render() {
        if (!root) return;
        const current = table();
        const items = entries();
        const tabs = category === 'relationships' && model.tables.length > 1 ? `<nav class="igs-record-tabs" aria-label="选择资料来源">${model.tables.map(item =>
            `<button type="button" data-record-act="table" data-record-id="${escapeHtml(item.uid)}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const error = model.status === 'read-error' ? `${labels[category]}读取失败：${model.reason}`
            : model.status === 'no-tables' ? `未找到匹配的${labels[category]}表`
                : model.status === 'empty' ? '匹配表没有可阅读的记录' : '';
        const diagnostics = category === 'relationships'
            ? (current?.diagnostics || [])
            : (model.tables || []).flatMap(item => item.diagnostics || []);
        let content = '';
        if (category === 'diary') {
            const books = diaryBooks();
            const book = books.find(item => item.key === diaryBook) || books[0] || null;
            if (book) diaryBook = book.key;
            const chapters = book?.entries || [];
            const chosen = chapters.find(item => item.id === selectedId) || null;
            const chapterIndex = chosen ? chapters.indexOf(chosen) : -1;
            const dateLabel = value => { const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || ''); return match ? `${match[2]}.${match[3]}` : value; };
            content = `<div class="igs-record-diary"><aside class="igs-record-diary-side">` +
                `<div class="igs-record-bookshelf" aria-label="选册">${books.map(item =>
                    `<button type="button" class="igs-record-book" data-record-act="book" data-record-id="${escapeHtml(item.key)}" aria-label="阅读${escapeHtml(item.label)}的日记" ${item.key === diaryBook ? 'aria-current="true"' : ''}>${RECORD_ICONS.book}<div class="igs-record-book-meta"><span>${escapeHtml(item.label)}</span><small>${item.entries.length}</small></div></button>`).join('')}</div>` +
                (chapters.length ? `<ol class="igs-record-chapters" aria-label="篇章列表">${chapters.map(item =>
                    `<li><button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="阅读${escapeHtml(item.title || '未命名篇章')}" ${item.id === selectedId ? 'aria-current="true"' : ''}>${item.date ? `<span class="igs-record-chapter-date">${escapeHtml(dateLabel(item.date))}</span>` : ''}<span class="igs-record-chapter-title">${escapeHtml(item.title || '未命名篇章')}</span></button></li>`).join('')}</ol>` : '') +
                `</aside>` +
                (chosen ? `<article class="igs-record-diary-detail"><p class="igs-record-diary-meta">${escapeHtml(chosen.author || '未署名')}${chosen.date ? ` · ${escapeHtml(chosen.date)}` : ''}</p>` +
                    `<h3>${escapeHtml(chosen.title || '未命名篇章')}</h3>` +
                    (chosen.body ? `<p class="igs-record-body">${escapeHtml(chosen.body)}</p>` : cellsHtml(chosen.detailCells || [])) +
                    `<footer class="igs-record-diary-nav"><button type="button" data-record-act="prev-entry" ${chapterIndex <= 0 ? 'disabled' : ''}>← 上一则</button><span>${chapterIndex >= 0 ? `${String(chapterIndex + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}` : ''}</span><button type="button" data-record-act="next-entry" ${chapterIndex < 0 || chapterIndex >= chapters.length - 1 ? 'disabled' : ''}>下一则 →</button></footer></article>`
                    : '<p class="igs-record-diary-empty">选择一册与一篇开始阅读</p>') + '</div>';
        } else if (category === 'inventory') {
            const chosen = items.find(item => item.id === selectedId);
            content = `<div class="igs-record-inventory"><div class="igs-record-slots" aria-label="物品栏">${items.map(item => {
                // 数量语义：'0' 如实显示 ×0；缺失不补 ×1、不显示角标，详情写“数量未记录”。
                const quantity = String(item.quantity ?? '').trim();
                const selected = item.id === selectedId;
                return `<button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.title)}" ${selected ? 'aria-current="true"' : ''}>${RECORD_ICONS[inventoryIconKey(item.title)]}<span class="igs-record-slot-name">${escapeHtml(item.title || '未命名')}</span>${quantity ? `<small class="igs-record-slot-quantity">×${escapeHtml(quantity)}</small>` : ''}</button>`;
            }).join('')}</div>` + (() => {
                if (!chosen) return '<div class="igs-record-item-empty"><span></span><p>选择物品，查看详情</p><span></span></div>';
                const descriptionCell = (chosen.detailCells || []).find(cell => ['描述', '说明', '内容', '详情'].includes(String(cell.label || '').trim()));
                const extraCells = (chosen.detailCells || []).filter(cell => cell !== descriptionCell);
                return `<section class="igs-record-item-detail"><div class="igs-record-item-detail-icon">${RECORD_ICONS[inventoryIconKey(chosen.title)]}</div><div class="igs-record-item-detail-copy"><h3>${escapeHtml(chosen.title || '未命名')}</h3><p class="igs-record-item-quantity">${String(chosen.quantity ?? '').trim() ? `数量：×${escapeHtml(String(chosen.quantity).trim())}` : '数量未记录'}</p>${descriptionCell ? `<p class="igs-record-item-description">${escapeHtml(descriptionCell.value)}</p>` : ''}${extraCells.length ? cellsHtml(extraCells) : ''}</div></section>`;
            })() + '</div>';
        } else if (category === 'relationships') {
            const people = items;
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
                Math.round((22 + (56 * index) / (neighbors.length - 1)) * 10) / 10);
            const graphNodes = [{ person: chosen, x: 50, y: neighbors.length ? 22 : 50 }, ...neighbors.map((person, index) =>
                ({ person, x: neighborX[index], y: 72 }))].filter(item => item.person);
            const nodeByName = new Map(graphNodes.map(item => [item.person.name, item]));
            const lineHtml = localEdges.map(edge => {
                const target = nodeByName.get(edge.from === chosen?.name ? edge.to : edge.from);
                if (!target) return '';
                const startY = neighbors.length ? 31 : 50;
                const endY = neighbors.length ? 63 : target.y;
                const controlX = Math.round(((50 + target.x) / 2) * 10) / 10;
                return `<path d="M 50 ${startY} C 50 ${startY + 10}, ${controlX} ${endY - 12}, ${target.x} ${endY}"></path>`;
            }).join('');
            const labelHtml = localEdges.map((edge, index) => {
                const target = nodeByName.get(edge.from === chosen?.name ? edge.to : edge.from);
                if (!target) return '';
                const left = Math.round(((50 + target.x) / 2) * 10) / 10;
                const top = neighbors.length ? 49 + (index % 2) * 4 : 50;
                return `<span class="igs-record-relationship-label" style="left:${left}%;top:${top}%">${escapeHtml(edge.label || '关系未标注')}</span>`;
            }).join('');
            const graphHtml = chosen ? `<div class="igs-record-relationship-graph" aria-label="${escapeHtml(chosen.name)}的局部关系图"><svg class="igs-record-relationship-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lineHtml}</svg>${labelHtml}${graphNodes.map(node =>
                `<button type="button" class="igs-record-relationship-node${node.person.id === chosen.id ? ' is-current' : ''}" style="left:${node.x}%;top:${node.y}%" data-record-act="person" data-record-id="${escapeHtml(node.person.id)}" aria-label="查看${escapeHtml(node.person.name)}" ${node.person.id === relationshipPersonId ? 'aria-current="true"' : ''}><span class="igs-record-node-avatar" aria-hidden="true">${personInitial(node.person.name)}</span><span class="igs-record-node-name">${escapeHtml(node.person.name)}</span></button>`).join('')}</div>` : '<p class="igs-record-relationship-empty">当前来源没有可识别的人物记录。</p>';
            content = `<div class="igs-record-relationships">` +
                `<section class="igs-record-relationship-stage">${graphHtml}</section>` +
                `<section class="igs-record-people" aria-label="人物索引"><div class="igs-record-people-list">${people.map(person =>
                    `<button type="button" data-record-act="person" data-record-id="${escapeHtml(person.id)}" aria-label="查看${escapeHtml(person.name)}" ${person.id === relationshipPersonId ? 'aria-current="true"' : ''}><span class="igs-record-person-avatar" aria-hidden="true">${personInitial(person.name)}</span><span class="igs-record-person-copy"><strong>${escapeHtml(person.name)}</strong></span></button>`).join('')}</div></section>` +
                `<article class="igs-record-relationship-detail">${chosen ? `<header class="igs-record-person-head"><div><h2>${escapeHtml(chosen.name)}${chosen.role ? ` · ${chosen.role}` : ''}</h2></div></header><section class="igs-record-relationship-section">${chosen.description ? `<p class="igs-record-relationship-description">${escapeHtml(chosen.description)}</p>` : '<p class="igs-record-relationship-description">暂无人物描述。</p>'}${cellsHtml(chosen.detailCells || [])}${chosen.synthetic ? '<p class="igs-record-relationship-note">仅记录了姓名，未提供身份或描述。</p>' : ''}</section>` : '<p>请选择人物。</p>'}</article></div>`;
        } else if (current && items.length) {
            content = `<div class="igs-record-table-scroll"><table><caption>${escapeHtml(current.name)}</caption><thead><tr>${current.columns.map((column, index) => `<th scope="col">${escapeHtml(column || `第${index + 1}列`)}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr>${current.columns.map((_, index) => `<td>${escapeHtml(current.rows[item.rowIndex]?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        const showSource = false;
        root.innerHTML = `<div class="igs-rp-page igs-record-window">${recordPageHeadHtml(pageTitles[category])}` +
            tabs + `<div class="igs-rp-body"><div class="igs-record-scroll">${showSource && current ? `<p class="igs-record-source">来源：${escapeHtml(current.name)}</p>` : ''}` +
            (error ? `<p role="status">${escapeHtml(error)}</p>` : '') +
            (diagnostics.length ? `<p role="status">${escapeHtml(diagnostics.join('；'))}</p>` : '') +
            content + '</div></div></div>';
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ category, model, activeUid, selectedId, relationshipPersonId }) };
}
