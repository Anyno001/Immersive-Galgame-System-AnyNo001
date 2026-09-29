// CG 库面板：只展示 IGS 自动插图已出图的 CG；数据来自 media/cg-gallery-service.js。
// 隐藏/收藏只写状态库；删除二次确认后走 clearIllustration（楼层 CG 同时消失）；跳转只限当前聊天。
import { safeItemImageUrl } from './fx-item.js';
import { setStagePauseReason } from './stage-pause.js';

const PAGE_SIZE = 24;
const THUMB_CACHE_LIMIT = 120;
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

// options: service, getChatId(), confirm(message) → Promise<boolean>|boolean, onJump(entry), makeThumbnail(dataUrl) → Promise<string>|string
export function createCgGalleryPanel(doc, options = {}) {
    const { service } = options;
    let root = null;
    let host = null;
    let entries = [];
    let cursor = '';
    let exhausted = false;
    let viewing = '';
    let notice = '';
    let filters = { favoritesOnly: false, showHidden: false, currentChatOnly: false };
    let pending = Promise.resolve();
    let previousFocus = null;
    const thumbs = new Map();

    const chatId = () => { try { return String(options.getChatId?.() || ''); } catch (_) { return ''; } };
    const find = (key) => entries.find((entry) => entry.key === key) || null;

    function thumbOf(entry) {
        const hit = thumbs.get(entry.key);
        if (hit != null) return hit;
        const raw = safeItemImageUrl(entry.dataUrl);
        if (typeof options.makeThumbnail !== 'function' || !raw) { thumbs.set(entry.key, raw); return raw; }
        thumbs.set(entry.key, raw);
        Promise.resolve().then(() => options.makeThumbnail(raw)).then((small) => {
            const safe = safeItemImageUrl(small);
            if (safe && thumbs.has(entry.key)) { thumbs.set(entry.key, safe); render(); }
        }).catch(() => {});
        while (thumbs.size > THUMB_CACHE_LIMIT) thumbs.delete(thumbs.keys().next().value);
        return raw;
    }

    function tileHtml(entry) {
        const src = thumbOf(entry);
        const canJump = entry.chatId === chatId() && typeof options.onJump === 'function';
        return `<li class="igs-cg-tile${entry.hidden ? ' is-hidden' : ''}" data-cg-tile="${escapeHtml(entry.key)}">`
            + `<button type="button" class="igs-cg-thumb" data-cg-act="view" data-cg-key="${escapeHtml(entry.key)}" aria-label="查看第 ${entry.messageId} 楼 CG">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async">` : ''}</button>`
            + `<div class="igs-cg-meta"><span>第 ${entry.messageId} 楼 · ${entry.slot}</span>${entry.favorite ? '<span class="igs-cg-fav-mark" aria-label="已收藏">★</span>' : ''}</div>`
            + `<div class="igs-cg-actions">`
            + `<button type="button" data-cg-act="favorite" data-cg-key="${escapeHtml(entry.key)}" aria-pressed="${entry.favorite}">${entry.favorite ? '取消收藏' : '收藏'}</button>`
            + `<button type="button" data-cg-act="hide" data-cg-key="${escapeHtml(entry.key)}" aria-pressed="${entry.hidden}">${entry.hidden ? '取消隐藏' : '隐藏'}</button>`
            + (canJump ? `<button type="button" data-cg-act="jump" data-cg-key="${escapeHtml(entry.key)}">跳到楼层</button>` : '')
            + `<button type="button" class="is-danger" data-cg-act="delete" data-cg-key="${escapeHtml(entry.key)}">删除</button>`
            + `</div></li>`;
    }

    function render() {
        if (!root) return;
        const toggle = (act, on, label) => `<button type="button" class="igs-cg-filter" data-cg-act="${act}" aria-pressed="${on}">${label}</button>`;
        const viewed = viewing ? find(viewing) : null;
        const viewer = viewed ? `<div class="igs-cg-viewer" role="dialog" aria-label="CG 大图"><img src="${escapeHtml(safeItemImageUrl(viewed.dataUrl))}" alt="第 ${viewed.messageId} 楼 CG"><button type="button" data-cg-act="close-view">关闭</button></div>` : '';
        const list = entries.length ? `<ul class="igs-cg-grid">${entries.map(tileHtml).join('')}</ul>` : '<p class="igs-cg-empty">还没有 CG</p>';
        const more = exhausted ? '' : '<button type="button" class="igs-cg-more" data-cg-act="more">加载更多</button>';
        root.innerHTML = `<header class="igs-cg-head"><h2>CG 库</h2><button type="button" data-cg-act="close" aria-label="关闭 CG 库">×</button></header>`
            + `<div class="igs-cg-filters" role="group" aria-label="筛选">${toggle('filter-favorite', filters.favoritesOnly, '只看收藏')}${toggle('filter-hidden', filters.showHidden, '显示已隐藏')}${toggle('filter-chat', filters.currentChatOnly, '只看当前聊天')}</div>`
            + (notice ? `<p class="igs-cg-notice" role="status">${escapeHtml(notice)}</p>` : '')
            + list + more + viewer;
    }

    async function loadMore(reset = false) {
        if (!service) { notice = 'CG 库不可用'; exhausted = true; render(); return; }
        if (reset) { entries = []; cursor = ''; exhausted = false; }
        // 被筛掉的页可能为空：继续翻页直到拿到内容或到末尾，单次最多 5 页。
        for (let guard = 0; guard < 5 && !exhausted; guard += 1) {
            const page = await service.loadPage({ after: cursor, limit: PAGE_SIZE, favoritesOnly: filters.favoritesOnly, showHidden: filters.showHidden, chatId: filters.currentChatOnly ? chatId() : '' });
            if (!page.ok) { notice = page.reason === 'read-error' ? 'CG 读取失败' : 'CG 库不可用'; exhausted = true; break; }
            notice = '';
            entries = entries.concat(page.items.filter((item) => !find(item.key)));
            cursor = page.next;
            exhausted = !page.next;
            if (page.items.length) break;
        }
        render();
    }

    async function handle(act, key) {
        const entry = key ? find(key) : null;
        if (act === 'close') { close(); return; }
        if (act === 'more') { await loadMore(); return; }
        if (act === 'filter-favorite' || act === 'filter-hidden' || act === 'filter-chat') {
            const name = act === 'filter-favorite' ? 'favoritesOnly' : act === 'filter-hidden' ? 'showHidden' : 'currentChatOnly';
            filters = { ...filters, [name]: !filters[name] };
            await loadMore(true);
            return;
        }
        if (act === 'close-view') { viewing = ''; render(); return; }
        if (!entry) return;
        if (act === 'view') { viewing = entry.key; render(); return; }
        if (act === 'jump') { if (entry.chatId === chatId()) options.onJump?.(entry); return; }
        if (act === 'favorite') {
            const result = await service.setFavorite(entry.key, !entry.favorite);
            if (result && result.ok) entry.favorite = !entry.favorite;
            if (filters.favoritesOnly && !entry.favorite) entries = entries.filter((e) => e !== entry);
            render();
            return;
        }
        if (act === 'hide') {
            const result = await service.setHidden(entry.key, !entry.hidden);
            if (result && result.ok) entry.hidden = !entry.hidden;
            if (!filters.showHidden && entry.hidden) entries = entries.filter((e) => e !== entry);
            render();
            return;
        }
        if (act === 'delete') {
            const ask = typeof options.confirm === 'function' ? options.confirm : () => false;
            const ok = await ask(entry.kind === 'photo' ? '删除这张照片？无法恢复。' : `删除第 ${entry.messageId} 楼的这张 CG？楼层里的这张图也会一起消失，无法恢复。`);
            if (!ok) return;
            const result = await service.remove(entry);
            if (result && result.ok) {
                entries = entries.filter((e) => e !== entry);
                thumbs.delete(entry.key);
                if (viewing === entry.key) viewing = '';
                notice = '已删除';
            } else notice = '删除失败，CG 仍保留';
            render();
        }
    }

    function onClick(event) {
        const hit = findAction(event && event.target);
        if (!hit) return;
        pending = pending.then(() => handle(hit.act, hit.key)).catch(() => { notice = '操作失败'; render(); });
    }

    // 焦点在面板内时，空格/回车/方向键不冒泡到阅读器的全局翻页处理器。
    function onKeydown(event) {
        const key = event && event.key;
        if (key === 'Escape') { if (viewing) { viewing = ''; render(); } else close(); }
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
        render();
        pending = pending.then(() => loadMore(true)).catch(() => {});
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKeydown);
        root.remove();
        root = null;
        setStagePauseReason(host, 'panel:gallery', false);
        host = null;
        entries = [];
        viewing = '';
        thumbs.clear();
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    return {
        open, close,
        isOpen: () => Boolean(root),
        whenIdle: () => pending,
        getState: () => ({ count: entries.length, exhausted, viewing, filters: { ...filters }, notice }),
    };
}

export const CG_GALLERY_STYLE_TEXT = `
#igs-cg-gallery{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;gap:10px;padding:16px;box-sizing:border-box;overflow:auto;background:rgba(14,14,18,.94);color:#fff;}
#igs-cg-gallery .igs-cg-head{display:flex;align-items:center;justify-content:space-between;}
#igs-cg-gallery .igs-cg-head h2{margin:0;font-size:16px;}
#igs-cg-gallery button{min-height:44px;min-width:44px;border:none;border-radius:8px;background:rgba(255,255,255,.1);color:inherit;cursor:pointer;padding:0 12px;}
#igs-cg-gallery button[aria-pressed="true"]{background:rgba(255,255,255,.26);}
#igs-cg-gallery button:focus-visible{outline:2px solid #fff;outline-offset:2px;}
#igs-cg-gallery .is-danger{background:rgba(220,60,60,.3);}
#igs-cg-gallery .igs-cg-filters{display:flex;flex-wrap:wrap;gap:6px;}
#igs-cg-gallery .igs-cg-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;}
#igs-cg-gallery .igs-cg-tile.is-hidden{opacity:.5;}
#igs-cg-gallery .igs-cg-thumb{display:block;width:100%;aspect-ratio:16/10;padding:0;overflow:hidden;}
#igs-cg-gallery .igs-cg-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
#igs-cg-gallery .igs-cg-meta{display:flex;justify-content:space-between;font-size:12px;opacity:.8;margin:4px 2px;}
#igs-cg-gallery .igs-cg-actions{display:flex;flex-wrap:wrap;gap:4px;}
#igs-cg-gallery .igs-cg-actions button{font-size:12px;}
#igs-cg-gallery .igs-cg-viewer{position:fixed;inset:0;z-index:31;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.92);}
#igs-cg-gallery .igs-cg-viewer img{max-width:96%;max-height:84%;object-fit:contain;}
@media (max-width:420px){#igs-cg-gallery .igs-cg-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
`;
