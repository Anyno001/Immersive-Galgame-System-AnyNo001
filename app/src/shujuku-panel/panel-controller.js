import { createShujukuClient } from '../data/shujuku/client.js';
import { applyTransparentGlassMaterial } from '../styles/glass-material.js';
import { parseTables } from './panel-model.js';
import { getDbPanelStyles, renderDbPanelInner } from './panel-render.js';

export function toShujukuApiRowIndex(rowIndex) {
    return Number.isInteger(rowIndex) ? rowIndex + 1 : NaN;
}

export function createDbTabClickGuard(now = () => Date.now()) {
    let blockedClick = null;
    const blockMs = 120;
    const maxDistance = 8;

    function arm(input = {}) {
        if (!input.strip) return;
        blockedClick = {
            strip: input.strip,
            clientX: toFiniteNumber(input.clientX),
            clientY: toFiniteNumber(input.clientY),
            expiresAt: now() + blockMs,
        };
    }

    function shouldSuppress(event, tab) {
        if (!blockedClick) return false;
        if (now() > blockedClick.expiresAt) {
            blockedClick = null;
            return false;
        }
        if (!tab || typeof tab.closest !== 'function' || tab.closest('.igs-shujuku-tabs') !== blockedClick.strip) {
            return false;
        }
        const clientX = toFiniteNumber(event && event.clientX);
        const clientY = toFiniteNumber(event && event.clientY);
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
        if (Number.isFinite(blockedClick.clientX) && Math.abs(clientX - blockedClick.clientX) > maxDistance) return false;
        if (Number.isFinite(blockedClick.clientY) && Math.abs(clientY - blockedClick.clientY) > maxDistance) return false;
        blockedClick = null;
        return true;
    }

    function clear() {
        blockedClick = null;
    }

    return { arm, shouldSuppress, clear };
}

export function createDbPanelController(doc, global) {
    let root = null;
    let modalRoot = null;
    let client = null;
    let igsWriting = false;
    const tabClickGuard = createDbTabClickGuard();
    const state = { tables: [], activeUid: '', status: 'loading', errorMsg: '', externalPending: false, tabScrollLeft: 0 };

    const externalCallback = () => {
        if (igsWriting || !root) return;
        state.externalPending = true;
        render();
    };

    function ensureStyle() {
        const id = 'igs-db-panel-style';
        if (!doc.getElementById(id)) {
            const s = doc.createElement('style');
            s.id = id;
            s.textContent = getDbPanelStyles();
            doc.head.appendChild(s);
        }
    }

    function render() {
        if (!root) return;
        const inner = root.querySelector('#igs-db-inner');
        if (inner) {
            rememberTabScroll();
            inner.innerHTML = renderDbPanelInner(state);
            restoreTabScroll();
        }
    }

    function resolvePanelContainer(overlayEl) {
        if (overlayEl && overlayEl.querySelector) {
            const layer = overlayEl.querySelector('#igs-db-layer');
            if (layer) return layer;
        }
        return overlayEl || doc.body;
    }

    function rememberTabScroll() {
        const tabs = root && root.querySelector ? root.querySelector('.igs-shujuku-tabs') : null;
        if (tabs && Number.isFinite(Number(tabs.scrollLeft))) {
            state.tabScrollLeft = Math.max(0, Number(tabs.scrollLeft) || 0);
        }
    }

    function restoreTabScroll() {
        const tabs = root && root.querySelector ? root.querySelector('.igs-shujuku-tabs') : null;
        if (tabs && state.tabScrollLeft > 0) {
            tabs.scrollLeft = state.tabScrollLeft;
        }
    }

    async function loadData() {
        const api = (global || globalThis).AutoCardUpdaterAPI || null;
        client = createShujukuClient(api);
        const result = client.readTables();
        if (!result.ok) {
            state.status = result.reason === 'missing-api' ? 'no-api' : 'error';
            state.errorMsg = result.reason || '';
            render();
            return;
        }
        state.tables = parseTables(result.data);
        state.status = 'ready';
        if (!state.tables.find(t => t.uid === state.activeUid))
            state.activeUid = state.tables[0] ? state.tables[0].uid : '';
        state.externalPending = false;
        render();
    }

    function open(overlayEl, readerSettings) {
        if (root) return;

        // conflict detection
        const shujukuOpen = doc.querySelector('#shujuku_v104-main-window,[id^="shujuku"][id$="-main-window"]');
        if (shujukuOpen && shujukuOpen.offsetParent !== null) {
            const win = doc.defaultView || globalThis;
            if (!win.confirm('骰子系统数据库面板正在打开中，同时编辑可能导致数据冲突，是否继续？'))
                return;
        }

        ensureStyle();
        root = doc.createElement('div');
        root.id = 'igs-db-panel';
        root.className = 'igs-shujuku-panel';
        root.innerHTML = `<div class="igs-shujuku-header">`
            + `<span class="igs-shujuku-title">数据库</span>`
            + `<button class="igs-shujuku-close" data-db-act="close" title="关闭">×</button>`
            + `</div><div id="igs-db-inner"></div>`;

        const container = resolvePanelContainer(overlayEl);
        container.appendChild(root);

        applyTransparentGlassMaterial(root, readerSettings && readerSettings.glassOpacity, {
            backdropFilter: readerSettings && readerSettings.glassBackdropFilter,
        });

        // drag within container
        const header = root.querySelector('.igs-shujuku-header');
        if (header) attachDrag(header, root, container);
        attachTabsDragScroll(root);

        root.addEventListener('click', onClick);
        root.addEventListener('focusout', onFocusOut);

        client = createShujukuClient((global || globalThis).AutoCardUpdaterAPI || null);
        client.registerCallback(externalCallback);
        state.status = 'loading';
        render();
        loadData();
    }

    function close() {
        if (!root) return;
        root.removeEventListener('click', onClick);
        root.removeEventListener('focusout', onFocusOut);
        root.remove();
        root = null;
        closeModal();
        if (client) client.unregisterCallback(externalCallback);
    }

    function toggle(overlayEl, readerSettings) { root ? close() : open(overlayEl, readerSettings); }

    async function onClick(event) {
        const act = event.target.closest('[data-db-act]');
        if (act) {
            const action = act.getAttribute('data-db-act');
            if (action === 'close') { close(); return; }
            if (action === 'refresh') { state.externalPending = false; await loadData(); return; }
            if (action === 'add-row') { await doAddRow(); return; }
            if (action === 'delete-row') {
                await doDeleteRow(
                    parseInt(act.getAttribute('data-db-row-index'), 10),
                    act.getAttribute('data-db-row-id')
                );
                return;
            }
        }
        const tab = event.target.closest('[data-db-tab]');
        if (tab) {
            // 拖动标签栏后抑制本次 click，避免误切换标签
            if (tabClickGuard.shouldSuppress(event, tab)) return;
            state.activeUid = tab.getAttribute('data-db-tab'); render(); return;
        }

        const editCell = event.target.closest('[data-db-edit]');
        if (editCell) { activateInline(editCell); return; }

        const expandCell = event.target.closest('[data-db-expand]');
        if (expandCell) { openModal(expandCell); }
    }

    function activateInline(cell) {
        const [ri, ci] = cell.getAttribute('data-db-edit').split(':').map(Number);
        const table = activeTable();
        if (!table) return;
        const row = table.rows[ri];
        if (!row) return;
        const span = cell.querySelector('.igs-shujuku-cell');
        if (!span) return;
        const input = doc.createElement('input');
        input.className = 'igs-shujuku-cell-input';
        input.value = String(row[ci] ?? '');
        input.setAttribute('data-db-commit', `${ri}:${ci}`);
        // 替换 td 内的 span，保留 td 本身（维持列结构）；防止再次触发 td 的编辑激活。
        cell.removeAttribute('data-db-edit');
        span.replaceWith(input);
        input.focus();
        input.select();
    }

    async function onFocusOut(event) {
        const input = event.target;
        if (!input || !input.hasAttribute('data-db-commit')) return;
        const [ri, ci] = input.getAttribute('data-db-commit').split(':').map(Number);
        const table = activeTable();
        if (!table) { render(); return; }
        const row = table.rows[ri];
        if (!row) { render(); return; }
        const oldVal = String(row[ci] ?? '');
        const newVal = input.value;
        if (newVal === oldVal) { render(); return; }
        const colName = table.columns[ci];
        igsWriting = true;
        row[ci] = newVal;
        render();
        const result = await client.updateCell(table.name, toShujukuApiRowIndex(ri), colName, newVal);
        igsWriting = false;
        if (!result.ok) { row[ci] = oldVal; render(); }
        else await client.refresh();
    }

    async function doAddRow() {
        const table = activeTable();
        if (!table || !client) return;
        const maxId = table.rows.reduce((m, r) => Math.max(m, parseInt(r[0] || 0, 10)), 0);
        const rowData = Object.fromEntries(table.columns.map((col, i) => [col, i === 0 ? String(maxId + 1) : '']));
        igsWriting = true;
        const result = await client.insertRow(table.name, rowData);
        igsWriting = false;
        if (result.ok) await loadData();
    }

    async function doDeleteRow(rowIndex, rowId) {
        const table = activeTable();
        if (!table || !client) return;
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.rows.length) return;
        const win = doc.defaultView || globalThis;
        const label = rowId != null && rowId !== '' ? `row_id=${rowId}` : `第 ${rowIndex + 1} 行`;
        if (!win.confirm(`确认删除 ${label} 的行？`)) return;
        igsWriting = true;
        const result = await client.deleteRow(table.name, toShujukuApiRowIndex(rowIndex));
        igsWriting = false;
        if (result.ok) await loadData();
    }

    function openModal(expandEl) {
        const [ri, ci] = expandEl.getAttribute('data-db-expand').split(':').map(Number);
        const table = activeTable();
        if (!table) return;
        const row = table.rows[ri];
        if (!row) return;
        const colName = table.columns[ci];
        const origVal = String(row[ci] ?? '');
        closeModal();
        modalRoot = doc.createElement('div');
        modalRoot.className = 'igs-db-modal-bg';
        modalRoot.innerHTML = `<div class="igs-db-modal">`
            + `<div class="igs-db-modal-label">${esc(table.name)} · ${esc(colName)}</div>`
            + `<textarea>${esc(origVal)}</textarea>`
            + `<div class="igs-db-modal-btns">`
            + `<button class="igs-db-modal-cancel">取消</button>`
            + `<button class="igs-db-modal-save">保存</button>`
            + `</div></div>`;
        (root && root.parentElement || doc.body).appendChild(modalRoot);
        const textarea = modalRoot.querySelector('textarea');
        modalRoot.querySelector('.igs-db-modal-cancel').addEventListener('click', closeModal);
        modalRoot.querySelector('.igs-db-modal-save').addEventListener('click', async () => {
            const newVal = textarea.value;
            closeModal();
            if (newVal === origVal) return;
            igsWriting = true;
            row[ci] = newVal;
            render();
            const result = await client.updateCell(table.name, toShujukuApiRowIndex(ri), colName, newVal);
            igsWriting = false;
            if (!result.ok) { row[ci] = origVal; render(); }
            else await client.refresh();
        });
        textarea.focus();
    }

    function closeModal() { if (modalRoot) { modalRoot.remove(); modalRoot = null; } }

    function activeTable() { return state.tables.find(t => t.uid === state.activeUid) || state.tables[0] || null; }

    function attachTabsDragScroll(panel) {
        if (!panel) return;
        let strip = null;
        let active = false;
        let moved = false;
        let startX = 0;
        let startScroll = 0;
        let pointerId = null;
        let captured = false;

        panel.addEventListener('scroll', (e) => {
            const target = e.target;
            if (target && target.classList && target.classList.contains('igs-shujuku-tabs')) {
                state.tabScrollLeft = Math.max(0, Number(target.scrollLeft) || 0);
            }
        }, true);

        panel.addEventListener('pointerdown', (e) => {
            const s = e.target.closest('.igs-shujuku-tabs');
            if (!s) return;
            // 仅当内容溢出时才进入拖动滚动
            if (s.scrollWidth <= s.clientWidth + 1) return;
            strip = s;
            active = true;
            moved = false;
            startX = e.clientX;
            startScroll = s.scrollLeft;
            pointerId = e.pointerId;
            captured = false;
        });
        panel.addEventListener('pointermove', (e) => {
            if (!active || !strip) return;
            const dx = e.clientX - startX;
            if (!moved && Math.abs(dx) < 4) return;
            if (!moved) {
                moved = true;
                try {
                    if (pointerId != null && strip.setPointerCapture) {
                        strip.setPointerCapture(pointerId);
                        captured = true;
                    }
                } catch (err) { /* ignore */ }
                strip.classList.add('igs-db-dragging');
            }
            strip.scrollLeft = startScroll - dx;
            state.tabScrollLeft = Math.max(0, Number(strip.scrollLeft) || 0);
            if (e.cancelable) e.preventDefault();
        });
        const end = (e) => {
            if (!active) return;
            const endedStrip = strip;
            active = false;
            if (strip) {
                try { if (captured && pointerId != null && strip.releasePointerCapture) strip.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
                strip.classList.remove('igs-db-dragging');
            }
            // 拖动后抑制紧随的 click，避免误切标签
            if (moved) {
                if (endedStrip) tabClickGuard.arm({ strip: endedStrip, clientX: e && e.clientX, clientY: e && e.clientY });
                const win = doc.defaultView || globalThis;
                if (win && typeof win.setTimeout === 'function') {
                    win.setTimeout(tabClickGuard.clear, 160);
                }
            }
            strip = null;
            pointerId = null;
            captured = false;
        };
        panel.addEventListener('pointerup', end);
        panel.addEventListener('pointercancel', end);
    }

    function attachDrag(handle, panel, container) {
        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('[data-db-act]')) return;
            e.preventDefault();
            const cRect = container.getBoundingClientRect();
            const pRect = panel.getBoundingClientRect();
            const startLeft = pRect.left - cRect.left;
            const startTop = pRect.top - cRect.top;
            const startX = e.clientX;
            const startY = e.clientY;
            panel.style.right = 'auto';
            panel.style.left = `${startLeft}px`;
            panel.style.top = `${startTop}px`;

            function onMove(e) {
                const maxLeft = container.clientWidth - panel.offsetWidth;
                const maxTop = container.clientHeight - panel.offsetHeight;
                panel.style.left = `${Math.max(0, Math.min(maxLeft, startLeft + e.clientX - startX))}px`;
                panel.style.top = `${Math.max(0, Math.min(maxTop, startTop + e.clientY - startY))}px`;
            }
            function onUp() {
                doc.removeEventListener('mousemove', onMove);
                doc.removeEventListener('mouseup', onUp);
            }
            doc.addEventListener('mousemove', onMove);
            doc.addEventListener('mouseup', onUp);
        });
    }

    return { open, close, toggle };
}

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
}
