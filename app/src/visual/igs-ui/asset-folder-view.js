import { esc } from './reader-value-utils.js';
import { groupAssetsByFolder } from './asset-folders.js';

const encSeg = (v) => encodeURIComponent(String(v == null ? '' : v));
const icon = (d, s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PENCIL = icon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const TRASH = icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
const DOWN = icon('<polyline points="6 9 12 15 18 9"/>', 13);
const RIGHT = icon('<polyline points="9 6 15 12 9 18"/>', 13);
const EMPTY_KIND = Object.freeze({ view: 'list', folders: [], collapsed: [], assign: {} });

// 条目上的「移到文件夹」；没有文件夹时不显示。
export function renderAssetFolderSelect(kind, name, kindState) {
    const k = kindState || EMPTY_KIND;
    if (!k.folders.length) return '';
    const current = Object.prototype.hasOwnProperty.call(k.assign, name) ? k.assign[name] : '';
    const opts = [['', '未分类']].concat(k.folders.map((f) => [f, f]))
        .map(([v, l]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`).join('');
    return `<select class="igs-asset-move" data-asset-folder-move="${kind}" data-asset-name="${esc(name)}" aria-label="移到文件夹">${opts}</select>`;
}

function tile(kind, name, url, kindState) {
    const u = String(url || '').trim();
    const thumb = u
        ? `<img class="igs-asset-tile-thumb" src="${esc(u)}" loading="lazy" alt="${esc(name)}" data-action="sprite-preview:${encSeg(u)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : '<div class="igs-asset-tile-thumb igs-asset-tile-empty">未配置</div>';
    // 缩略图模式的「修改」入口：由 asset-edit 动作切回列表并展开该条目，不改动素材数据。
    const edit = `<button type="button" class="igs-btn-mgr-icon igs-asset-tile-edit" data-action="asset-edit:${kind}:${encSeg(name)}" title="修改" aria-label="修改 ${esc(name)}">${PENCIL}</button>`;
    return `<div class="igs-asset-tile">${thumb}<div class="igs-asset-tile-head"><div class="igs-asset-tile-name" title="${esc(name)}">${esc(name)}</div>${edit}</div>${renderAssetFolderSelect(kind, name, kindState)}</div>`;
}

// 只改变素材的展示方式；renderList 仍用原来的列表渲染器，数据原样传入。
export function renderAssetFolderView(kind, entries, options = {}) {
    const k = (options.state && options.state[kind]) || EMPTY_KIND;
    const source = entries && typeof entries === 'object' ? entries : {};
    const names = Object.keys(source);
    const renderList = typeof options.renderList === 'function' ? options.renderList : () => '';
    if (!names.length) return renderList({});
    const grid = k.view === 'grid';
    const viewBtn = (view, label) => `<button type="button" class="igs-settings-action igs-asset-view-btn" data-action="asset-view:${kind}:${view}" aria-pressed="${k.view === view}">${label}</button>`;
    const bar = `<div class="igs-asset-folder-bar">${viewBtn('list', '列表')}${viewBtn('grid', '缩略图')}<button type="button" class="igs-settings-action" data-action="asset-folder-add:${kind}">新建文件夹</button></div>`;
    const pick = (items) => Object.fromEntries(items.map((n) => [n, source[n]]));
    const body = (items) => {
        if (!items.length) return '<div class="igs-scene-empty">文件夹为空</div>';
        if (!grid) return renderList(pick(items));
        const thumbOf = typeof options.thumbOf === 'function' ? options.thumbOf : () => '';
        return `<div class="igs-asset-grid">${items.map((n) => tile(kind, n, thumbOf(n, source[n]), k)).join('')}</div>`;
    };
    if (!k.folders.length) return bar + body(names);
    const html = groupAssetsByFolder(options.state, kind, names).filter((g) => g.folder || g.items.length).map((g) => {
        const open = !k.collapsed.includes(g.folder);
        const seg = encSeg(g.folder);
        const tools = g.folder
            ? `<button type="button" class="igs-btn-mgr-icon" data-action="asset-folder-rename:${kind}:${seg}" title="重命名文件夹">${PENCIL}</button>`
              + `<button type="button" class="igs-btn-mgr-icon" data-action="asset-folder-remove:${kind}:${seg}" title="删除文件夹（素材移回未分类）">${TRASH}</button>`
            : '';
        return `<div class="igs-asset-folder"><div class="igs-asset-folder-head">`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="asset-folder-toggle:${kind}:${seg}" aria-expanded="${open}" title="展开/折叠">${open ? DOWN : RIGHT}</button>`
            + `<span class="igs-asset-folder-name">${esc(g.folder || '未分类')}</span><span class="igs-asset-folder-count">${g.items.length}</span>${tools}</div>`
            + `${open ? body(g.items) : ''}</div>`;
    }).join('');
    return bar + html;
}
