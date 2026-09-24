import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildRecordModel } from '../../data/shujuku/record-model.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { RECORD_ICONS, inventoryIconKey } from './record-icons.js';

const labels = Object.freeze({ diary: '日记', inventory: '物品', relationships: '人际关系' });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cellsHtml = cells => `<dl class="igs-record-fields">${cells.map(cell => `<div><dt>${escapeHtml(cell.label)}</dt><dd>${escapeHtml(cell.value)}</dd></div>`).join('')}</dl>`;

// Only names that appear in labels are ever rendered as SVG; sheet contents remain escaped text.
export function createRecordPanelController(doc, global) {
    let root = null;
    let client = null;
    let category = '';
    let model = null;
    let activeUid = '';
    let selectedId = '';
    let previousFocus = null;
    const callback = () => { if (root) reload(); };
    const table = () => model?.tables?.find(item => item.uid === activeUid);
    const entries = () => model?.entries?.filter(item => item.uid === activeUid) || [];

    function open(overlay, settings, type) {
        if (root) return { ok: false, reason: 'already-open' };
        if (!labels[type] || !overlay || !doc?.createElement) return { ok: false, reason: 'invalid-record-view' };
        category = type;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-record-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', labels[type]);
        root.addEventListener('click', onClick);
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
        if (!entries().some(entry => entry.id === selectedId)) selectedId = entries()[0]?.id || '';
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
        if (action === 'refresh') return reload();
        const id = button.getAttribute('data-record-id');
        if (action === 'table' && model.tables.some(item => item.uid === id)) {
            activeUid = id;
            selectedId = entries()[0]?.id || '';
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
        const tabs = model.tables.length > 1 ? `<nav class="igs-record-tabs" aria-label="选择资料来源">${model.tables.map(item =>
            `<button type="button" data-record-act="table" data-record-id="${escapeHtml(item.uid)}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const error = model.status === 'read-error' ? `${labels[category]}读取失败：${model.reason}`
            : model.status === 'no-tables' ? `未找到匹配的${labels[category]}表`
                : model.status === 'empty' ? '匹配表没有可阅读的记录' : '';
        const diagnostics = current?.diagnostics || [];
        let content = '';
        if (category === 'diary') {
            content = items.map(item => `<article class="igs-record-chapter"><p class="igs-record-source">${escapeHtml(item.source)}${item.date ? ` · ${escapeHtml(item.date)}` : ''}</p><h3>${escapeHtml(item.title)}</h3>` +
                (item.body ? `<p class="igs-record-body">${escapeHtml(item.body)}</p>` : '') +
                (item.body ? '' : cellsHtml(item.cells)) + '</article>').join('');
        } else if (category === 'inventory') {
            const chosen = items.find(item => item.id === selectedId);
            content = `<div class="igs-record-inventory"><div class="igs-record-slots" aria-label="物品栏">${items.map(item => `<button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.title)}" ${item.id === selectedId ? 'aria-current="true"' : ''}>${RECORD_ICONS[inventoryIconKey(item.title)]}<span>${escapeHtml(item.title)}</span></button>`).join('')}</div>` +
                (chosen ? `<section class="igs-record-item-detail"><h3>${RECORD_ICONS[inventoryIconKey(chosen.title)]}${escapeHtml(chosen.title)}</h3>${cellsHtml(chosen.cells)}</section>` : '') + '</div>';
        } else if (current && items.length) {
            content = `<div class="igs-record-table-scroll"><table><caption>${escapeHtml(current.name)}</caption><thead><tr>${current.columns.map((column, index) => `<th scope="col">${escapeHtml(column || `第${index + 1}列`)}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr>${current.columns.map((_, index) => `<td>${escapeHtml(current.rows[item.rowIndex]?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        root.innerHTML = `<div class="igs-record-window"><header><h2>${labels[category]}</h2><button type="button" data-record-act="close" aria-label="关闭${labels[category]}">×</button></header>` +
            tabs + `<div class="igs-record-scroll">${current ? `<p class="igs-record-source">来源：${escapeHtml(current.name)}</p>` : ''}` +
            (error ? `<p role="status">${escapeHtml(error)}</p>` : '') +
            (diagnostics.length ? `<p role="status">${escapeHtml(diagnostics.join('；'))}</p>` : '') +
            content + '<button type="button" data-record-act="refresh">刷新资料</button></div></div>';
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ category, model, activeUid, selectedId }) };
}
