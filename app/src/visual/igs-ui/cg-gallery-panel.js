// CG 库面板（工具栏 cg-gallery）：数据来自 media/cg-library.js，状态来自 cg-library-view.js。
// 网格只放缩略图，列表变了才整块重画；缩略图到了只换那一格，状态行只改文字。
// 关闭、翻页、筛选立即生效，不排在读图后面；收藏 / 隐藏 / 删除按点击顺序执行。
// 隐藏 / 收藏只写状态库；删除二次确认后走 clearIllustration（楼层 CG 同时消失）；跳转只限当前聊天。
import { safeItemImageUrl } from './fx-item.js';
import { setStagePauseReason } from './stage-pause.js';
import { createCgLibraryView } from './cg-library-view.js';
import { cgReasonText } from '../../media/cg-library.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function findAction(target) {
    let node = target;
    for (let depth = 0; node && depth < 6; depth += 1) {
        const act = typeof node.getAttribute === 'function' ? node.getAttribute('data-cg-act') : null;
        if (act) return { act, key: node.getAttribute('data-cg-key') || '' };
        node = node.parentNode;
    }
    return null;
}

// options: service（createCgLibrary 的返回值）, storage（记排序偏好）, getChatId(), confirm(message) → Promise<boolean>|boolean, onJump(entry), onReroll(entry) → Promise<{ok, reason, error}>
export function createCgGalleryPanel(doc, options = {}) {
    const { service } = options;
    let root = null;
    let host = null;
    let view = null;
    let viewing = '';
    let viewerEl = null;
    let previousFocus = null;
    let acting = Promise.resolve();
    let viewerJob = Promise.resolve();

    const chatId = () => { try { return String(options.getChatId?.() || ''); } catch (_) { return ''; } };
    const query = (selector) => (root && typeof root.querySelector === 'function' ? root.querySelector(selector) : null);
    const attrValue = (value) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, ''));
    const labelOf = (entry) => (entry.kind === 'photo' ? '照片' : `第 ${entry.messageId} 楼 · ${entry.slot}`);
    // 重画按原提示词重出同一格，只认当前聊天的楼层 CG（照片没有提示词）。
    const canReroll = (entry) => entry.kind !== 'photo' && entry.chatId === chatId() && typeof options.onReroll === 'function';
    const rerolling = new Set();
    const rerollButton = (entry, cls = '') => (canReroll(entry) ? `<button type="button"${cls ? ` class="${cls}"` : ''} data-cg-act="reroll" data-cg-key="${escapeHtml(entry.key)}"${rerolling.has(entry.key) ? ' disabled' : ''}>${rerolling.has(entry.key) ? '重画中…' : '重画'}</button>` : '');

    function thumbHtml(entry) {
        const tile = view.tileOf(entry.key);
        const src = safeItemImageUrl(tile.url);
        if (src) return `<button type="button" class="igs-cg-thumb" data-cg-act="view" data-cg-key="${escapeHtml(entry.key)}" aria-label="查看${escapeHtml(labelOf(entry))}"><img src="${escapeHtml(src)}" alt="" decoding="async"></button>`;
        if (tile.state === 'failed') return `<button type="button" class="igs-cg-thumb is-failed" data-cg-act="retry" data-cg-key="${escapeHtml(entry.key)}" title="${escapeHtml(tile.reason)}"><span>读取失败，点这里重试</span></button>`;
        return `<button type="button" class="igs-cg-thumb is-loading" data-cg-act="view" data-cg-key="${escapeHtml(entry.key)}" aria-label="查看${escapeHtml(labelOf(entry))}"><span>读取中</span></button>`;
    }

    function tileHtml(entry) {
        const canJump = entry.kind !== 'photo' && entry.chatId === chatId() && typeof options.onJump === 'function';
        return `<li class="igs-cg-tile${entry.hidden ? ' is-hidden' : ''}" data-cg-tile="${escapeHtml(entry.key)}">`
            + thumbHtml(entry)
            + `<div class="igs-cg-meta"><span>${escapeHtml(labelOf(entry))}</span>${entry.favorite ? '<span class="igs-cg-fav-mark" aria-label="已收藏">★</span>' : ''}</div>`
            + `<div class="igs-cg-actions">`
            + `<button type="button" data-cg-act="favorite" data-cg-key="${escapeHtml(entry.key)}" aria-pressed="${entry.favorite}">${entry.favorite ? '取消收藏' : '收藏'}</button>`
            + `<button type="button" data-cg-act="hide" data-cg-key="${escapeHtml(entry.key)}" aria-pressed="${entry.hidden}">${entry.hidden ? '取消隐藏' : '隐藏'}</button>`
            + (canJump ? `<button type="button" data-cg-act="jump" data-cg-key="${escapeHtml(entry.key)}">跳到楼层</button>` : '')
            + rerollButton(entry)
            + `<button type="button" class="is-danger" data-cg-act="delete" data-cg-key="${escapeHtml(entry.key)}">删除</button>`
            + `</div></li>`;
    }

    function render() {
        if (!root || !view) return;
        const s = view.state;
        const filters = s.filters;
        const toggle = (act, on, label) => `<button type="button" class="igs-cg-filter" data-cg-act="${act}" aria-pressed="${on}">${label}</button>`;
        const status = view.statusText();
        const empty = s.phase === 'ready' && !s.entries.length ? '<p class="igs-cg-empty">还没有 CG</p>' : '';
        const list = s.entries.length ? `<ul class="igs-cg-grid">${s.entries.map(tileHtml).join('')}</ul>` : empty;
        const pager = s.list.length > s.entries.length || s.page > 0
            ? `<div class="igs-cg-pager"><button type="button" data-cg-act="page-prev" ${s.page <= 0 ? 'disabled' : ''}>上一页</button><span>第 ${s.page + 1} / ${s.pages} 页 · 共 ${s.list.length} 张</span><button type="button" data-cg-act="page-next" ${s.page >= s.pages - 1 ? 'disabled' : ''}>下一页</button></div>`
            : (s.list.length ? `<div class="igs-cg-pager"><span>共 ${s.list.length} 张</span></div>` : '');
        const batch = s.entries.length ? `<button type="button" class="is-danger" data-cg-act="delete-listed">删除本页 ${s.entries.length} 张</button>` : '';
        root.innerHTML = `<header class="igs-cg-head"><h2>CG 库</h2><span class="igs-cg-head-actions">${batch}<button type="button" data-cg-act="close" aria-label="关闭 CG 库">×</button></span></header>`
            + `<div class="igs-cg-filters" role="group" aria-label="筛选">${toggle('filter-favorite', filters.favoritesOnly, '只看收藏')}${toggle('filter-hidden', filters.showHidden, '显示已隐藏')}${toggle('filter-chat', Boolean(filters.chatId), '只看当前聊天')}${toggle('order', Boolean(filters.oldestFirst), filters.oldestFirst ? '最早在前' : '最新在前')}</div>`
            + pager
            + `<p class="igs-cg-notice" role="status" data-cg-status${status ? '' : ' hidden'}>${escapeHtml(status)}</p>`
            + list;
    }

    function patchStatus() {
        const el = query('[data-cg-status]');
        if (!el) { render(); return; }
        const text = view.statusText();
        el.textContent = text;
        if (text) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
    }

    function patchTile(key) {
        const entry = view.find(key);
        if (!entry) { patchStatus(); return; }
        const button = query(`[data-cg-tile="${attrValue(key)}"] .igs-cg-thumb`);
        if (!button || typeof button.insertAdjacentHTML !== 'function') { render(); return; }
        button.insertAdjacentHTML('afterend', thumbHtml(entry));
        button.remove();
        patchStatus();
    }

    function onViewChange(type, key) {
        if (!root) return;
        if (type === 'list') render();
        else if (type === 'thumb') patchTile(key);
        else patchStatus();
    }

    // 大图层挂在面板外的容器上铺满阅读区：面板是滚动容器，放在里面会随网格滚走。点任意处或 Esc 关闭。
    function onViewerClick(event) {
        event?.stopPropagation?.();
        const hit = findAction(event && event.target);
        if (hit && hit.act === 'reroll') { queueAct('reroll', hit.key); return; }
        closeViewer();
    }

    function closeViewer() {
        if (viewerEl) {
            viewerEl.removeEventListener('click', onViewerClick);
            viewerEl.removeEventListener('keydown', onKeydown);
            viewerEl.remove();
            viewerEl = null;
        }
        viewing = '';
    }

    function viewerHtml(entry, src, note) {
        const alt = entry.kind === 'photo' ? '照片' : `第 ${entry.messageId} 楼 CG`;
        return (src ? `<img src="${escapeHtml(src)}" alt="${alt}">` : '')
            + (note ? `<p class="igs-cg-viewer-note">${escapeHtml(note)}</p>` : '')
            + rerollButton(entry, 'igs-cg-viewer-reroll')
            + '<button type="button" class="igs-cg-viewer-close" aria-label="关闭大图">×</button>';
    }

    // 先用缩略图铺上，原图读到再换；读不到就写清原因。
    function openViewer(entry) {
        if (!host) return;
        closeViewer();
        viewing = entry.key;
        viewerEl = doc.createElement('div');
        viewerEl.id = 'igs-cg-viewer';
        viewerEl.setAttribute('role', 'dialog');
        viewerEl.setAttribute('aria-modal', 'true');
        viewerEl.setAttribute('aria-label', 'CG 大图');
        viewerEl.setAttribute('tabindex', '-1');
        viewerEl.innerHTML = viewerHtml(entry, safeItemImageUrl(view.tileOf(entry.key).url), '正在读取原图');
        viewerEl.addEventListener('click', onViewerClick);
        viewerEl.addEventListener('keydown', onKeydown);
        host.appendChild(viewerEl);
        viewerEl.focus?.();
        const target = viewerEl;
        viewerJob = Promise.resolve().then(() => view.readFull(entry)).catch(() => ({ ok: false, reason: 'read-error' })).then((result) => {
            if (viewerEl !== target) return;
            const src = result && result.ok ? safeItemImageUrl(result.dataUrl) : '';
            target.innerHTML = src
                ? viewerHtml(entry, src, '')
                : viewerHtml(entry, safeItemImageUrl(view.tileOf(entry.key).url), `原图读取失败：${cgReasonText(result && result.reason)}`);
        });
    }

    async function handle(act, key) {
        if (!view) return;
        const entry = key ? view.find(key) : null;
        if (act === 'delete-listed') {
            const ask = typeof options.confirm === 'function' ? options.confirm : () => false;
            const list = view.state.entries.slice();
            if (!list.length) return;
            const ok = await ask(`删除已列出的 ${list.length} 张 CG？聊天里的这些图也会一起消失，无法恢复。`);
            if (!ok) return;
            const batch = await service.removeMany(list);
            const gone = batch.keys || [];
            if (viewing && gone.includes(viewing)) closeViewer();
            view.removeKeys(gone);
            view.setNotice(batch.failed ? `已删除 ${gone.length} 张，${batch.failed} 张没能删掉。` : `已删除 ${gone.length} 张。`);
            return;
        }
        if (!entry) return;
        if (act === 'jump') { if (entry.chatId === chatId()) options.onJump?.(entry); return; }
        if (act === 'favorite' || act === 'hide') {
            const field = act === 'favorite' ? 'favorite' : 'hidden';
            const next = !entry[field];
            const result = field === 'favorite' ? await service.setFavorite(entry, next) : await service.setHidden(entry, next);
            if (result && result.ok) view.patchEntry(entry.key, { [field]: next });
            else view.setNotice(`没保存上：${cgReasonText(result && result.reason)}`);
            return;
        }
        if (act === 'reroll') {
            if (!canReroll(entry) || rerolling.has(entry.key)) return;
            const ask = typeof options.confirm === 'function' ? options.confirm : () => false;
            if (!(await ask('只重画这一张？提示词不变，楼层里的图会一起换掉。'))) return;
            rerolling.add(entry.key);
            refreshReroll(entry);
            view.setNotice('正在重画…');
            let result = null;
            try { result = await options.onReroll(entry); } catch (error) { result = { ok: false, error: (error && error.message) || String(error) }; }
            rerolling.delete(entry.key);
            if (!view) return;
            if (result && result.ok !== false && result.reason !== 'not-eligible') {
                view.setNotice('这一张已重画');
                view.retry(entry.key);
                if (viewing === entry.key) { openViewer(entry); return; }
            } else view.setNotice(result && result.reason === 'not-eligible' ? '这一楼现在不能重画（楼层已改动或换了分支）' : `重画失败：${(result && result.error) || cgReasonText(result && result.reason)}`);
            refreshReroll(entry);
            return;
        }
        if (act === 'delete') {
            const ask = typeof options.confirm === 'function' ? options.confirm : () => false;
            const ok = await ask(entry.kind === 'photo' ? '删除这张照片？无法恢复。' : `删除第 ${entry.messageId} 楼的这张 CG？楼层里的这张图也会一起消失，无法恢复。`);
            if (!ok) return;
            const result = await service.remove(entry);
            if (result && result.ok) {
                if (viewing === entry.key) closeViewer();
                view.removeKeys([entry.key]);
                view.setNotice('已删除');
            } else view.setNotice('删除失败，CG 仍保留');
        }
    }

    // 网格与大图里的重画钮跟着进度换字，不整块重画。
    function refreshReroll(entry) {
        const scopes = [query(`[data-cg-tile="${attrValue(entry.key)}"]`), viewing === entry.key ? viewerEl : null];
        for (const scope of scopes) {
            const button = scope && typeof scope.querySelector === 'function' ? scope.querySelector('[data-cg-act="reroll"]') : null;
            if (!button || typeof button.insertAdjacentHTML !== 'function') continue;
            button.insertAdjacentHTML('afterend', rerollButton(entry, button.className || ''));
            button.remove();
        }
    }

    function queueAct(act, key) {
        acting = acting.then(() => handle(act, key)).catch(() => { view?.setNotice('操作失败'); });
    }

    function onClick(event) {
        const hit = findAction(event && event.target);
        if (!hit || !view) return;
        const { act, key } = hit;
        if (act === 'close') { close(); return; }
        if (act === 'close-view') { closeViewer(); return; }
        if (act === 'page-prev') { if (view.state.page > 0) view.goto(view.state.page - 1); return; }
        if (act === 'page-next') { if (view.state.page < view.state.pages - 1) view.goto(view.state.page + 1); return; }
        if (act === 'filter-favorite') { view.setFilters({ favoritesOnly: !view.state.filters.favoritesOnly }); return; }
        if (act === 'filter-hidden') { view.setFilters({ showHidden: !view.state.filters.showHidden }); return; }
        if (act === 'filter-chat') { view.setFilters({ chatId: view.state.filters.chatId ? '' : chatId() }); return; }
        if (act === 'order') { view.setFilters({ oldestFirst: !view.state.filters.oldestFirst }); return; }
        if (act === 'retry') { view.retry(key); return; }
        if (act === 'view') { const entry = view.find(key); if (entry) openViewer(entry); return; }
        queueAct(act, key);
    }

    // 焦点在面板内时，空格/回车/方向键不冒泡到阅读器的全局翻页处理器。
    function onKeydown(event) {
        const key = event && event.key;
        if (key === 'Escape') { if (viewing) closeViewer(); else close(); }
        if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(key)) event.stopPropagation?.();
    }

    function open(container) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!container || typeof container.appendChild !== 'function') return { ok: false, reason: 'no-container' };
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-cg-gallery';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'CG 库');
        root.addEventListener('click', onClick);
        root.addEventListener('keydown', onKeydown);
        container.appendChild(root);
        host = container;
        setStagePauseReason(host, 'panel:gallery', true);
        view = createCgLibraryView(service || null, { onChange: onViewChange, storage: options.storage });
        render();
        view.open();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        closeViewer();
        view?.dispose();
        view = null;
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKeydown);
        root.remove();
        root = null;
        setStagePauseReason(host, 'panel:gallery', false);
        host = null;
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    return {
        open, close,
        isOpen: () => Boolean(root),
        async whenIdle() {
            for (let i = 0; i < 5; i += 1) {
                await acting;
                await viewerJob;
                if (view) await view.whenIdle();
            }
        },
        getState: () => {
            const s = view ? view.state : null;
            return {
                count: s ? s.entries.length : 0,
                total: s ? s.list.length : 0,
                page: s ? s.page : 0,
                pages: s ? s.pages : 1,
                phase: s ? s.phase : 'idle',
                viewing,
                filters: s ? { ...s.filters } : {},
                notice: view ? view.statusText() : '',
            };
        },
    };
}

export const CG_GALLERY_STYLE_TEXT = `
#igs-cg-gallery{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;gap:10px;padding:16px;box-sizing:border-box;overflow:auto;background:rgba(14,14,18,.94);color:#fff;}
#igs-cg-gallery .igs-cg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
#igs-cg-gallery .igs-cg-head-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}
#igs-cg-gallery .igs-cg-head h2{margin:0;font-size:16px;}
#igs-cg-gallery button{min-height:44px;min-width:44px;border:none;border-radius:8px;background:rgba(255,255,255,.1);color:inherit;cursor:pointer;padding:0 12px;}
#igs-cg-gallery button[aria-pressed="true"]{background:rgba(255,255,255,.26);}
#igs-cg-gallery button:focus-visible{outline:2px solid #fff;outline-offset:2px;}
#igs-cg-gallery .is-danger{background:rgba(220,60,60,.3);}
#igs-cg-gallery .igs-cg-filters{display:flex;flex-wrap:wrap;gap:6px;}
#igs-cg-gallery .igs-cg-pager{display:flex;align-items:center;justify-content:center;gap:8px;}
#igs-cg-gallery .igs-cg-pager button:disabled{opacity:.35;cursor:default;}
#igs-cg-gallery .igs-cg-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;}
#igs-cg-gallery .igs-cg-tile.is-hidden{opacity:.5;}
#igs-cg-gallery .igs-cg-thumb{display:block;width:100%;aspect-ratio:16/10;padding:0;overflow:hidden;cursor:zoom-in;}
#igs-cg-gallery .igs-cg-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
#igs-cg-gallery .igs-cg-thumb.is-loading,#igs-cg-gallery .igs-cg-thumb.is-failed{display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.75;}
#igs-cg-gallery .igs-cg-thumb.is-failed{background:rgba(220,60,60,.18);cursor:pointer;}
#igs-cg-gallery .igs-cg-meta{display:flex;justify-content:space-between;font-size:12px;opacity:.8;margin:4px 2px;}
#igs-cg-gallery .igs-cg-actions{display:flex;flex-wrap:wrap;gap:4px;}
#igs-cg-gallery .igs-cg-actions button{font-size:12px;}
#igs-cg-viewer{position:absolute;inset:0;z-index:31;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.92);cursor:zoom-out;outline:none;}
#igs-cg-viewer img{max-width:96%;max-height:92%;object-fit:contain;display:block;}
#igs-cg-viewer .igs-cg-viewer-note{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);margin:0;padding:6px 12px;border-radius:8px;background:rgba(0,0,0,.7);color:#fff;font-size:13px;}
#igs-cg-viewer .igs-cg-viewer-reroll{position:absolute;top:12px;right:64px;min-height:44px;padding:0 14px;border:none;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;cursor:pointer;}
#igs-cg-viewer .igs-cg-viewer-reroll:disabled{opacity:.55;cursor:default;}
#igs-cg-viewer .igs-cg-viewer-close{position:absolute;top:12px;right:12px;min-width:44px;min-height:44px;border:none;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font-size:20px;line-height:1;cursor:pointer;}
@media (max-width:420px){#igs-cg-gallery .igs-cg-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
`;
