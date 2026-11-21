import { STICKER_CATALOG, STICKER_SETS, STICKER_SET_IDS, matchSticker, stickerView } from './sticker-catalog.js';
import { normalizeStickerSettings } from './sticker-settings.js';
import { stickerImgHtml } from './sticker-render.js';

// 设置器「表情包」子页：按套组分开展示，每个套组里按情绪分组（一张图归在它的第一个情绪下；没有情绪的归「未分类」）。
// 点一张图展开编辑菜单：改情绪（多选 24 个内置情绪，并可输入新情绪名）、改描述、停用或启用、恢复默认。
// 纯函数，只出 HTML 与整理 overrides；版式沿用设置器 CG 网格（igs-image-cg-grid / igs-image-cg-tile）。
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ITEM_BY_FILE = new Map();
for (const id of STICKER_SET_IDS) for (const item of STICKER_SETS[id].items) ITEM_BY_FILE.set(item.file, { setId: id, item });

// 内置数据里这张图的原样（情绪 id 数组与描述）；素材里没有这个文件返回 null。
export function stickerBaseOf(file) {
    const hit = ITEM_BY_FILE.get(String(file || ''));
    return hit ? { setId: hit.setId, emotions: [...(hit.item.emotions || [])], desc: hit.item.desc || '' } : null;
}

// 一个情绪的存储写法：内置情绪存 id，新情绪存名字。
function emotionKeyOf(raw) {
    const name = String(raw == null ? '' : raw).replace(/[[\]【】［］|\s]+/g, '').slice(0, 12);
    if (!name) return '';
    const hit = matchSticker(name);
    return hit ? hit.id : name;
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// 改完把「与内置一致」的部分去掉：只存差异；整条都一致就删掉这条修改。
function settle(overrides, file, entry, base) {
    const next = { ...overrides };
    const kept = {};
    if (Array.isArray(entry.emotions) && !sameSet(entry.emotions.map(emotionKeyOf), base.emotions)) kept.emotions = entry.emotions;
    if (entry.desc && entry.desc !== base.desc) kept.desc = entry.desc;
    if ('emotions' in kept || kept.desc) next[file] = kept;
    else delete next[file];
    return next;
}

function currentEntry(overrides, file) {
    const own = overrides && typeof overrides === 'object' && Object.prototype.hasOwnProperty.call(overrides, file) ? overrides[file] : null;
    return own && typeof own === 'object' ? { ...own } : {};
}

// 勾选 / 取消一个情绪。素材里没有这个文件时原样返回。
export function toggleStickerEmotion(overrides, file, emotion) {
    const base = stickerBaseOf(file);
    const key = emotionKeyOf(emotion);
    if (!base || !key) return overrides;
    const entry = currentEntry(overrides, file);
    const list = (Array.isArray(entry.emotions) ? entry.emotions : base.emotions).map(emotionKeyOf);
    entry.emotions = list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
    return settle(overrides, file, entry, base);
}

// 新增一个情绪名（认得出内置情绪就按内置的存；已有则不动）。
export function addStickerEmotion(overrides, file, name) {
    const base = stickerBaseOf(file);
    const key = emotionKeyOf(name);
    if (!base || !key) return overrides;
    const entry = currentEntry(overrides, file);
    const list = (Array.isArray(entry.emotions) ? entry.emotions : base.emotions).map(emotionKeyOf);
    if (list.includes(key)) return overrides;
    entry.emotions = [...list, key];
    return settle(overrides, file, entry, base);
}

// 改描述；留空或与内置一致就是恢复内置描述。
export function setStickerDesc(overrides, file, desc) {
    const base = stickerBaseOf(file);
    if (!base) return overrides;
    const entry = currentEntry(overrides, file);
    const text = String(desc == null ? '' : desc).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (text) entry.desc = text; else delete entry.desc;
    return settle(overrides, file, entry, base);
}

// 恢复默认：去掉这张图的全部修改，并重新启用。返回 { overrides, disabled }。
export function resetSticker(overrides, disabled, file) {
    const next = { ...overrides };
    delete next[file];
    return { overrides: next, disabled: (Array.isArray(disabled) ? disabled : []).filter((k) => k !== file) };
}

// 点击一张图：在停用列表里加入或移除它的键，返回新的列表。
export function toggleStickerKey(disabled, key) {
    const list = Array.isArray(disabled) ? disabled : [];
    const k = String(key || '').trim();
    if (!k) return list;
    return list.includes(k) ? list.filter((x) => x !== k) : [...list, k];
}

// 一个套组要展示的分组：[{ name, images }]，内置情绪按名字表顺序，其后是用户新增的情绪，最后是未分类；没有图的情绪不出现。
export function stickerGroups(view) {
    const groups = view.catalog.map((s) => ({ id: s.id, name: s.name, images: [] }));
    const byId = new Map(groups.map((g) => [g.id, g]));
    const loose = { id: '', name: '未分类', images: [] };
    for (const image of view.pool) (image.emotions.length ? byId.get(image.emotions[0]) : loose).images.push(image);
    return [...groups, loose].filter((g) => g.images.length);
}

function tileHtml(image, setId, disabled, editing) {
    const off = disabled.includes(image.file);
    const alt = image.desc || image.file;
    const mark = `${off ? '<i class="igs-sticker-off-mark">已停用</i>' : ''}${image.edited ? '<i class="igs-sticker-edit-mark" title="含义已修改">改</i>' : ''}`;
    return `<button type="button" class="igs-image-cg-tile igs-sticker-tile${off ? ' is-off' : ''}${image.edited ? ' is-edited' : ''}${editing === image.file ? ' is-editing' : ''}" data-action="sticker-edit:${esc(image.file)}" aria-pressed="${editing === image.file ? 'true' : 'false'}" title="${esc(alt)}"><span class="igs-sticker-thumb${setId === 'nga' ? ' is-small' : ''}">${stickerImgHtml(image, setId, alt, false)}</span>${mark}</button>`;
}

function editorHtml(image, setId, view, overrides, disabled) {
    const file = esc(image.file);
    const chosen = new Set(image.emotions);
    const customNames = new Set();
    for (const entry of Object.values(overrides)) for (const e of Array.isArray(entry && entry.emotions) ? entry.emotions : []) if (!matchSticker(e)) customNames.add(String(e));
    const chips = [...STICKER_CATALOG.map((s) => ({ key: s.id, name: s.name, on: chosen.has(s.id) })), ...[...customNames].map((n) => ({ key: n, name: n, on: chosen.has(`u:${n}`) }))]
        .map((c) => `<button type="button" class="igs-sticker-chip${c.on ? ' is-on' : ''}" data-action="sticker-emo:${file}:${esc(c.key)}" aria-pressed="${c.on ? 'true' : 'false'}">${esc(c.name)}</button>`).join('');
    const off = disabled.includes(image.file);
    return `<div class="igs-sticker-editor" data-sticker-editor="${file}">`
        + `<div class="igs-sticker-editor-head"><button type="button" class="igs-sticker-thumb is-edit${setId === 'nga' ? ' is-small' : ''}" data-action="sticker-edit-close" title="点击收起" aria-label="收起编辑区">${stickerImgHtml(image, setId, image.desc || image.file, false)}</button><div class="igs-sticker-editor-title">${esc(image.desc)}${image.edited ? '<i class="igs-sticker-edit-mark is-inline">改</i>' : ''}</div></div>`
        + `<div class="igs-sticker-editor-label">情绪（可多选；没有勾选的归入未分类）</div><div class="igs-sticker-chips">${chips}</div>`
        + `<div class="igs-sticker-editor-row"><div class="igs-settings-field"><input type="text" data-sticker-new maxlength="12" placeholder="新情绪名" aria-label="新情绪名"></div><button type="button" class="igs-settings-action" data-action="sticker-emo-add:${file}">添加情绪</button></div>`
        + `<div class="igs-sticker-editor-label">描述（AI 按画面描述挑图时参考）</div>`
        + `<div class="igs-settings-field"><textarea data-sticker-desc rows="2" maxlength="80" aria-label="图片描述">${esc(image.desc)}</textarea></div>`
        + `<div class="igs-sticker-editor-actions"><button type="button" class="igs-settings-action" data-action="sticker-toggle:${file}">${off ? '启用' : '停用'}</button><button type="button" class="igs-settings-action" data-action="sticker-reset:${file}">恢复默认</button><button type="button" class="igs-settings-action is-active" data-action="sticker-desc-save:${file}">保存描述</button></div>`
        + '</div>';
}

// editing：正在编辑的文件名（界面状态，不进设置）。
export function renderStickerBrowser(stickerSettings, { editing = '' } = {}) {
    const { disabled, overrides } = normalizeStickerSettings(stickerSettings);
    const sets = STICKER_SET_IDS.map((setId) => {
        const view = stickerView(setId, overrides);
        const groups = stickerGroups(view).map((group) => {
            const tiles = group.images.map((image) => tileHtml(image, setId, disabled, editing)).join('');
            const open = group.images.find((image) => image.file === editing);
            return `<div class="igs-settings-group"><div class="igs-settings-subhead">${esc(group.name)}（${group.images.length}）</div><div class="igs-image-cg-grid igs-sticker-grid">${tiles}</div>${open ? editorHtml(open, setId, view, overrides, disabled) : ''}</div>`;
        }).join('');
        return `<div class="igs-sticker-set"><div class="igs-sticker-set-title">${esc(view.set.name)}（${view.pool.length}）</div>${groups}</div>`;
    }).join('');
    return `<div class="igs-settings-section"><div class="igs-source-filter-note">点击图片可修改情绪与描述、停用或启用、恢复默认。已停用的图不会被选用；某个情绪的图全部停用后，AI使用该情绪时不显示图片。未分类的图不会被情绪名挑中，只能被画面描述匹配到。</div>${sets}</div>`;
}
