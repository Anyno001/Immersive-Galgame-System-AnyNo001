import { createShujukuClient } from '../../data/shujuku/client.js';
import { getMapChildren, locateMapScene, readMapModel } from '../../data/shujuku/map-model.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pointer = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.1 7-13a7 7 0 1 0-14 0c0 6.9 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>';

export function createMapPanelController(doc, global, fillDraft) {
    let root = null;
    let client = null;
    let previousFocus = null;
    let model = { status: 'no-tables', tables: [] };
    let activeUid = '';
    let parentId = null;
    let selectedId = null;
    let sceneName = '';
    let message = '';
    const callback = () => { if (root) reload(); };
    const activeTable = () => model.tables.find(table => table.uid === activeUid) || null;
    const selected = () => activeTable()?.locations.find(loc => loc.id === selectedId) || null;

    function reload() {
        try { model = readMapModel(client.readTables()); }
        catch (error) { model = { status: 'read-error', reason: String(error?.message || '读取地图失败'), tables: [] }; }
        if (model.status !== 'ready') {
            activeUid = '';
            parentId = null;
            selectedId = null;
        }
        if (!activeTable()) { activeUid = model.tables[0]?.uid || ''; parentId = null; selectedId = null; }
        const table = activeTable();
        if (table && parentId && !table.locations.some(loc => loc.id === parentId && !loc.issues.includes('地点ID重复') && !loc.issues.includes('父级循环'))) parentId = null;
        if (!selected()) selectedId = null;
        render();
    }

    function open(overlay, settings, scene = '') {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-map-container' };
        message = '';
        const container = overlay.querySelector?.('#igs-db-layer') || overlay;
        previousFocus = doc.activeElement || null;
        sceneName = String(scene || '').trim();
        root = doc.createElement('div');
        root.id = 'igs-map-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '地点地图');
        root.addEventListener('click', onClick);
        container.appendChild(root);
        applyTransparentGlassMaterial(root, settings?.glassOpacity, { backdropFilter: settings?.glassBackdropFilter });
        client = createShujukuClient((global || globalThis).AutoCardUpdaterAPI || null);
        try { client.registerCallback(callback); } catch (error) { /* Optional subscription must not block browsing. */ }
        reload();
        if (sceneName) {
            const match = locateMapScene(model, sceneName);
            if (match.location) {
                activeUid = match.location.table.uid;
                parentId = match.location.location.parentId;
                selectedId = match.location.location.id;
            } else if (model.status === 'ready' && match.ambiguous) message = '场景名称重复，无法确定当前地点';
            else if (model.status === 'ready') message = '当前场景未在地图中定位';
            render();
        }
        root.querySelector?.('[data-map-act="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        root.removeEventListener('click', onClick);
        root.remove();
        root = null;
        try { client?.unregisterCallback(callback); } catch (error) { /* Host may already be gone. */ }
        client = null;
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    function onClick(event) {
        event.stopPropagation?.();
        if (event.target === root) { close(); return; }
        const control = event.target?.closest?.('[data-map-act]');
        if (!control || !root?.contains(control)) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        const action = control.getAttribute('data-map-act');
        const id = control.getAttribute('data-map-id');
        if (action === 'close') return close();
        if (action === 'refresh') return reload();
        if (action === 'table') {
            if (!model.tables.some(table => table.uid === id)) return;
            activeUid = id; parentId = null; selectedId = null; message = '';
        }
        if (action === 'select') {
            if (!getMapChildren(activeTable(), parentId).some(loc => loc.id === id)) return;
            selectedId = id; message = '';
        }
        if (action === 'enter') {
            if (selectedId !== id || !selected() || !getMapChildren(activeTable(), id).length) return;
            parentId = id; selectedId = null; message = '';
        }
        if (action === 'back') {
            parentId = activeTable()?.locations.find(loc => loc.id === parentId)?.parentId || null;
            selectedId = null;
            message = '';
        }
        if (action === 'travel') return travel();
        render();
    }

    async function travel() {
        const loc = selected();
        if (!loc?.name || !loc.rowId || loc.issues.includes('地点ID重复')) { message = '地点信息不完整，无法填入草稿'; render(); return; }
        try {
            const result = await fillDraft(`前往${loc.name}地点`);
            message = result?.ok ? '已填入草稿，尚未发送' : result?.reason === 'draft-not-empty'
                ? '输入框已有草稿，未覆盖' : `填入失败：${result?.reason || '输入框不可用'}`;
        } catch (error) { message = '填入失败：输入框不可用'; }
        render();
    }

    function render() {
        if (!root) return;
        const table = activeTable();
        const parent = table?.locations.find(loc => loc.id === parentId);
        const children = table ? getMapChildren(table, parentId) : [];
        const pins = children.filter(loc => loc.x !== null && loc.y !== null && loc.rowId && loc.name && !loc.issues.length);
        const list = children.filter(loc => !pins.includes(loc));
        const place = selected();
        const tabs = model.tables.length > 1 ? `<nav class="igs-map-tabs" aria-label="选择地图">${model.tables.map(item =>
            `<button type="button" data-map-act="table" data-map-id="${escapeHtml(item.uid)}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const choice = loc => `<button type="button" data-map-act="select" data-map-id="${escapeHtml(loc.id)}" aria-label="查看${escapeHtml(loc.name || '未命名地点')}">${escapeHtml(loc.name || '未命名地点')}</button>`;
        const pinsHtml = pins.map(loc => `<div class="igs-map-marker" style="left:${loc.x * 100}%;top:${loc.y * 100}%">` +
            `<button type="button" data-map-act="select" data-map-id="${escapeHtml(loc.id)}" aria-label="查看${escapeHtml(loc.name || '未命名地点')}" ${loc.id === selectedId ? 'aria-current="location"' : ''}>${pointer}</button><span>${escapeHtml(loc.name || '未命名地点')}</span></div>`).join('');
        const diagnostics = table ? [...table.diagnostics, ...table.locations.flatMap(loc => loc.issues.map(issue => `${loc.name || `第${loc.rowIndex + 1}行`}: ${issue}`))] : [];
        const notice = model.status === 'read-error' ? `地图读取失败：${model.reason}` :
            model.status === 'no-tables' ? '未找到名称含“地图”或“地点”的表' : '';
        const card = place ? `<section class="igs-map-card"><h3>${escapeHtml(place.name || '未命名地点')}</h3>` +
            `<p>${escapeHtml(place.description || '暂无地点说明')}</p><p>角色：${escapeHtml(place.characters.join('、') || '暂无角色信息')}</p>` +
            (getMapChildren(table, place.id).length ? `<button type="button" data-map-act="enter" data-map-id="${escapeHtml(place.id)}">查看子地点</button>` : '') +
            (place.name && place.rowId && !place.issues.includes('地点ID重复') ? '<button type="button" data-map-act="travel">前往</button>' : '') + '</section>' : '';
        root.innerHTML = `<div class="igs-map-window"><header><h2>地点地图</h2><button type="button" data-map-act="close" aria-label="关闭地图">×</button></header>` +
            tabs + `<div class="igs-map-scroll">${parentId ? `<button type="button" data-map-act="back">返回上级：${escapeHtml(parent?.name || table?.name || '地图')}</button>` : ''}` +
            `<p class="igs-map-level">${escapeHtml(table?.name || '地图')} / ${escapeHtml(parent?.name || '总览')}</p>` +
            (notice ? `<p role="status">${escapeHtml(notice)}</p>` : '') +
            (table && !children.length ? '<p>这一层没有子地点</p>' : '') +
            (pins.length ? `<div class="igs-map-plane" aria-label="地图示意平面">${pinsHtml}</div>` : '') +
            (list.length ? `<div class="igs-map-list" aria-label="未标注坐标的地点">${list.map(choice).join('')}</div>` : '') +
            card + (diagnostics.length ? `<details><summary>地图数据提示（${diagnostics.length}）</summary><ul>${diagnostics.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : '') +
            `<p class="igs-map-feedback" role="status" aria-live="polite">${escapeHtml(message)}</p>` +
            '<button type="button" data-map-act="refresh">刷新地图</button></div></div>';
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ model, activeUid, parentId, selectedId, message }) };
}
