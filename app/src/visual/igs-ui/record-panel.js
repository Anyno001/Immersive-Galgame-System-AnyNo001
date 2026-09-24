import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildRecordModel } from '../../data/shujuku/record-model.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { RECORD_ICONS, inventoryIconKey } from './record-icons.js';

const labels = Object.freeze({ diary: '日记', inventory: '物品', relationships: '人际关系' });
const pageTitles = Object.freeze({ diary: '珍藏心事', inventory: '你的背包', relationships: '人际关系' });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cellsHtml = cells => `<dl class="igs-record-fields">${cells.map(cell => `<div><dt>${escapeHtml(cell.label)}</dt><dd>${escapeHtml(cell.value)}</dd></div>`).join('')}</dl>`;

// Only names that appear in labels are ever rendered as SVG; sheet contents remain escaped text.
export function createRecordPanelController(doc, global) {
    let root = null;
    let client = null;
    let category = '';
    let model = null;
    let pageOverlay = null;
    let activeUid = '';
    let selectedId = '';
    let previousFocus = null;
    const callback = () => { if (root) reload(); };
    const table = () => model?.tables?.find(item => item.uid === activeUid);
    const entries = () => category === 'diary' || category === 'inventory'
        ? (model?.entries || [])
        : (model?.entries?.filter(item => item.uid === activeUid) || []);

    function open(overlay, settings, type) {
        if (root) return { ok: false, reason: 'already-open' };
        if (!labels[type] || !overlay || !doc?.createElement) return { ok: false, reason: 'invalid-record-view' };
        category = type;
        activeUid = '';
        selectedId = '';
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-record-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', labels[type]);
        root.setAttribute('data-record-category', type);
        root.addEventListener('click', onClick);
        overlay.classList?.toggle('igs-record-screen-open', type === 'diary' || type === 'inventory');
        (overlay.querySelector?.('#igs-db-layer') || overlay).appendChild(root);
        applyTransparentGlassMaterial(root, settings?.glassOpacity, { backdropFilter: settings?.glassBackdropFilter });
        client = createShujukuClient((global || globalThis).AutoCardUpdaterAPI || null);
        try { client.registerCallback(callback); } catch (_) { /* Optional subscription. */ }
        reload();
        root.querySelector?.('[data-record-act="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
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
        try { model = buildRecordModel(client.readTables(), category); }
        catch (error) { model = { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], entries: [] }; }
        if (!table()) activeUid = model.tables[0]?.uid || '';
        if (selectedId && !entries().some(entry => entry.id === selectedId)) selectedId = '';
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
            selectedId = category === 'relationships' ? entries()[0]?.id || '' : '';
        }
        if (action === 'select' && entries().some(item => item.id === id)) selectedId = id;
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
            const chosen = items.find(item => item.id === selectedId);
            content = `<div class="igs-record-diary"><div class="igs-record-bookshelf" aria-label="日记目录">${items.map(item =>
                `<button type="button" class="igs-record-book" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="阅读${escapeHtml(item.title)}" ${item.id === selectedId ? 'aria-current="true"' : ''}>${RECORD_ICONS.book}<span>${escapeHtml(item.title || '未命名')}</span>${item.date ? `<small>${escapeHtml(item.date)}</small>` : ''}</button>`).join('')}</div>` +
                (chosen ? `<article class="igs-record-diary-detail"><h3>${escapeHtml(chosen.title || '未命名')}</h3>${chosen.date ? `<p class="igs-record-date">${escapeHtml(chosen.date)}</p>` : ''}${chosen.body ? `<p class="igs-record-body">${escapeHtml(chosen.body)}</p>` : cellsHtml(chosen.detailCells || [])}</article>` : '') + '</div>';
        } else if (category === 'inventory') {
            const chosen = items.find(item => item.id === selectedId);
            content = `<div class="igs-record-inventory"><div class="igs-record-slots" aria-label="物品栏">${items.map(item => {
                const quantity = String(item.quantity || '').trim() || '1';
                const selected = item.id === selectedId;
                return `<button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.title)}" ${selected ? 'aria-current="true"' : ''}>${RECORD_ICONS[inventoryIconKey(item.title)]}${selected ? '' : `<span class="igs-record-slot-name">${escapeHtml(item.title || '未命名')}</span>`}<small class="igs-record-slot-quantity">×${escapeHtml(quantity)}</small></button>`;
            }).join('')}</div>` +
                (chosen ? `<section class="igs-record-item-detail"><h3>${RECORD_ICONS[inventoryIconKey(chosen.title)]}<span>${escapeHtml(chosen.title || '未命名')}</span></h3>${cellsHtml(chosen.detailCells || [])}</section>` : '') + '</div>';
        } else if (current && items.length) {
            content = `<div class="igs-record-table-scroll"><table><caption>${escapeHtml(current.name)}</caption><thead><tr>${current.columns.map((column, index) => `<th scope="col">${escapeHtml(column || `第${index + 1}列`)}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr>${current.columns.map((_, index) => `<td>${escapeHtml(current.rows[item.rowIndex]?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        const showSource = category === 'relationships';
        root.innerHTML = `<div class="igs-record-window"><header><button type="button" class="igs-record-back" data-record-act="close" aria-label="返回">${RECORD_ICONS.back}</button><h2>${pageTitles[category]}</h2><span class="igs-record-head-spacer" aria-hidden="true"></span></header>` +
            tabs + `<div class="igs-record-scroll">${showSource && current ? `<p class="igs-record-source">来源：${escapeHtml(current.name)}</p>` : ''}` +
            (error ? `<p role="status">${escapeHtml(error)}</p>` : '') +
            (diagnostics.length ? `<p role="status">${escapeHtml(diagnostics.join('；'))}</p>` : '') +
            content + '</div></div>';
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ category, model, activeUid, selectedId }) };
}
