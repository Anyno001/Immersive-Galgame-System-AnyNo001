import { esc } from './reader-value-utils.js';
import { groupAssetsByFolder } from './asset-folders.js';

const encSeg = (v) => encodeURIComponent(String(v == null ? '' : v));
const icon = (d, s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PENCIL = icon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const TRASH = icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
const DOWN = icon('<polyline points="6 9 12 15 18 9"/>', 13);
const RIGHT = icon('<polyline points="9 6 15 12 9 18"/>', 13);
const LIST_ICON = icon('<line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>', 14);
const GRID_ICON = icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', 14);
const FOLDER_ICON = icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', 13);
const FOLDER_ADD_ICON = icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/>', 14);
const EMPTY_KIND = Object.freeze({ view: 'list', folders: [], collapsed: [], assign: {} });

// 条目上的「移到文件夹」；没有文件夹时不显示。
export function renderAssetFolderSelect(kind, name, kindState, { menu = false } = {}) {
    const k = kindState || EMPTY_KIND;
    if (!k.folders.length) return '';
    const current = Object.prototype.hasOwnProperty.call(k.assign, name) ? k.assign[name] : '';
    const opts = [['', '未分类']].concat(k.folders.map((f) => [f, f]))
        .map(([v, l]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(l)}</option>`).join('');
    // 只露一个文件夹图标，点了弹系统自带的选择列表；手机上不占一整截下拉框。
    const where = current || '未分类';
    const select = `<select class="igs-folder-pick-select" data-asset-folder-move="${kind}" data-asset-name="${esc(name)}" aria-label="移到文件夹，现在在 ${esc(where)}">${opts}</select>`;
    if (menu) return `<label class="igs-add-menu-item igs-folder-pick-item" role="menuitem">移到文件夹<span class="igs-folder-pick-where">${esc(where)}</span>${select}</label>`;
    return `<label class="igs-folder-pick${current ? ' is-set' : ''}" title="文件夹：${esc(where)}（点一下移动）">${FOLDER_ICON}`
        + `<select class="igs-folder-pick-select" data-asset-folder-move="${kind}" data-asset-name="${esc(name)}" aria-label="移到文件夹，现在在 ${esc(where)}">${opts}</select></label>`;
}

function tile(kind, name, url, kindState) {
    const u = String(url || '').trim();
    const thumb = u
        ? `<img class="igs-asset-tile-thumb" src="${esc(u)}" alt="${esc(name)}" data-action="sprite-preview" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : '<div class="igs-asset-tile-thumb igs-asset-tile-empty">未配置</div>';
    // 缩略图模式的「修改」入口：由 asset-edit 动作切回列表并展开该条目，不改动素材数据。
    const edit = `<button type="button" class="igs-btn-mgr-icon igs-asset-tile-edit" data-action="asset-edit:${kind}:${encSeg(name)}" title="修改" aria-label="修改 ${esc(name)}">${PENCIL}</button>`;
    return `<div class="igs-asset-tile">${thumb}<div class="igs-asset-tile-head"><div class="igs-asset-tile-name" title="${esc(name)}">${esc(name)}</div>${edit}</div>${renderAssetFolderSelect(kind, name, kindState)}</div>`;
}

// 只改变素材的展示方式；renderList 仍用原来的列表渲染器，数据原样传入。
// options.lead 是放在工具条左边的内容（素材页的「全部 / 本卡 / 全局」筛选），列表为空时工具条也留着它。
export function renderAssetFolderView(kind, entries, options = {}) {
    const k = (options.state && options.state[kind]) || EMPTY_KIND;
    const source = entries && typeof entries === 'object' ? entries : {};
    const names = Object.keys(source);
    const renderList = typeof options.renderList === 'function' ? options.renderList : () => '';
    const lead = typeof options.lead === 'string' ? options.lead : '';
    if (!names.length) return (lead ? `<div class="igs-asset-folder-bar">${lead}</div>` : '') + renderList({});
    const grid = k.view === 'grid';
    const viewBtn = (view, label, svg) => `<button type="button" class="igs-asset-view-btn" data-action="asset-view:${kind}:${view}" aria-pressed="${k.view === view}" title="${label}" aria-label="${label}">${svg}</button>`;
    const bar = `<div class="igs-asset-folder-bar">${lead}<span class="igs-asset-bar-spacer"></span>`
        + `<span class="igs-asset-view-toggle" role="group" aria-label="显示方式">${viewBtn('list', '列表', LIST_ICON)}${viewBtn('grid', '缩略图', GRID_ICON)}</span>`
        + `<button type="button" class="igs-btn-mgr-icon igs-asset-folder-add" data-action="asset-folder-add:${kind}" title="新建文件夹" aria-label="新建文件夹">${FOLDER_ADD_ICON}</button></div>`;
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
