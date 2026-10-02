import { esc } from './reader-value-utils.js';
import { resolveSpriteAsset } from '../../scene/asset-match.js';
import { OUTFIT_RESET } from '../../scene/character-outfits.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isImageUrl = (url) => /^(?:https?:\/\/|data:image\/|blob:)/i.test(String(url || '').trim());

const MORE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';

// 一行末尾的「⋯」：不常用的操作收进下拉，一行只留一个入口，不再叠一排小图标。
export function renderRowMenu(items, label = '更多操作') {
    const list = items.filter(Boolean).join('');
    if (!list) return '';
    return `<details class="igs-add-menu igs-row-menu"><summary class="igs-btn-mgr-icon" title="${esc(label)}" aria-label="${esc(label)}">${MORE_SVG}</summary>`
        + `<div class="igs-add-menu-list" role="menu">${list}</div></details>`;
}

export const menuItem = (action, label, extra = '') => `<button type="button" class="igs-add-menu-item${extra}" data-action="${action}" role="menuitem">${esc(label)}</button>`;

const PERSON_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>';

function shownUrl(url, resolveUrl) {
    const raw = String(url || '').trim();
    if (!raw || typeof resolveUrl !== 'function') return raw;
    try { return String(resolveUrl(raw) || ''); } catch (error) { return ''; }
}

function thumb(url, alt, extraClass = '', resolveUrl) {
    const value = shownUrl(url, resolveUrl);
    if (isImageUrl(value)) {
        return `<img class="igs-outfit-thumb${extraClass}" src="${esc(value)}" alt="${esc(alt)}" data-action="sprite-preview:${encSeg(value)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`;
    }
    return `<span class="igs-outfit-thumb igs-outfit-thumb-empty${extraClass}" aria-hidden="true">${value ? '生成' : PERSON_SVG}</span>`;
}

// 该服装缺这一格（或这一格没填图）时阅读器实际显示什么：借用服装内同组槽，或这一套的平和。
function previewOf(sceneAssets, charName, mood, outfit) {
    const hit = resolveSpriteAsset(charName, mood, { sceneAssets }, outfit);
    if (hit.source === 'user-outfit') return { url: hit.url, label: `借用「${hit.slot}」`, kind: 'borrow' };
    if (hit.url) return { url: hit.url, label: `回落原装「${hit.slot || mood}」`, kind: 'base' };
    return { url: '', label: '无图可显示', kind: 'none' };
}

function chipList(items, removeAction, addAction, emptyText, addTitle) {
    const tags = items.map((item) => (
        `<span class="igs-mood-word-tag">${esc(item)}<button type="button" class="igs-mood-word-del" data-action="${removeAction}:${encSeg(item)}" title="删除">×</button></span>`
    )).join('');
    return `<div class="igs-mood-word-list">${tags || `<span class="igs-outfit-muted">${esc(emptyText)}</span>`}<button type="button" class="igs-btn-mgr-icon" data-action="${addAction}" title="${esc(addTitle)}">+</button></div>`;
}

// 衣柜提示词在「规则」页。这里只选用哪一条，旁边的按钮跳过去编辑（没有就按服装名新建一条）。
function wardrobeChoices(charName, outfitName, entry, wardrobe) {
    const names = Object.keys(plain(wardrobe));
    const selected = typeof entry.wardrobe === 'string' ? entry.wardrobe.trim() : '';
    const option = (item, label) => `<option value="${esc(item)}"${item === selected ? ' selected' : ''}>${esc(label)}</option>`;
    const options = ['<option value="">同名服装</option>'].concat(names.map((item) => option(item, item)));
    if (selected && !names.includes(selected)) options.push(option(selected, selected));
    const label = names.includes(selected || outfitName) ? '编辑提示词' : '写提示词';
    return `<select class="igs-asset-move" data-outfit-wardrobe-char="${esc(charName)}" data-outfit-wardrobe="${esc(outfitName)}" aria-label="使用衣柜">${options.join('')}</select>`
        + `<button type="button" class="igs-settings-action igs-outfit-wardrobe-edit" data-action="wardrobe-for-outfit:${encSeg(charName)}:${encSeg(outfitName)}">${label}</button>`;
}

// 服装设置折起来时，摘要里仍能看到这套衣服的要点，不用展开也知道怎么配的。
function outfitMetaSummary(entry, words, scenes, avatar) {
    const wardrobe = typeof entry.wardrobe === 'string' && entry.wardrobe.trim() ? entry.wardrobe.trim() : '同名';
    return [
        `衣柜 ${wardrobe}`,
        words.length ? `服装词 ${words.join('、')}` : '',
        scenes.length ? `场景 ${scenes.join('、')}` : '',
        avatar ? '有头像' : '',
    ].filter(Boolean).join(' · ');
}

function renderOutfitPanel(charName, name, entry, baseMoods, sceneAssets, icons, expressionNotes, resolveUrl, isOpen) {
    const c = encSeg(charName);
    const o = encSeg(name);
    const moods = plain(entry.moods);
    const words = Array.isArray(entry.words) ? entry.words : [];
    const scenes = Array.isArray(entry.scenes) ? entry.scenes : [];
    const note = typeof entry.note === 'string' ? entry.note : '';
    const avatar = typeof entry.avatar === 'string' ? entry.avatar : '';
    const notes = expressionNotes && typeof expressionNotes === 'object' ? expressionNotes[`${charName}\u0001${name}`] : null;
    const metaKey = `outfit-meta:${charName}\u0001${name}`;
    const metaOpen = isOpen(metaKey);
    const meta = !metaOpen ? '' : `<div class="igs-outfit-meta-body"><div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">衣柜</span>${wardrobeChoices(charName, name, entry, sceneAssets.wardrobe)}</div>`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">说明</span><input class="igs-scene-url-input" data-scene-outfit-note-char="${esc(charName)}" data-scene-outfit-note="${esc(name)}" value="${esc(note)}" placeholder="什么情形穿这套"></div>`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">服装词</span>${chipList(words, `scene-remove-outfit-word:${c}:${o}`, `scene-add-outfit-word:${c}:${o}`, '只认服装名', '添加服装词（AI 写出或表格里出现该词即视为这套服装）')}</div>`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">适用场景</span>${chipList(scenes, `scene-remove-outfit-scene:${c}:${o}`, `scene-add-outfit-scene:${c}:${o}`, '不限', '添加适用场景（换到其他场景时，继承来的这套服装自动失效）')}</div>`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">状态栏头像</span>${thumb(avatar, `${name} 头像`, ' igs-outfit-avatar', resolveUrl)}`
        + `<input class="igs-scene-url-input" data-scene-outfit-avatar-char="${esc(charName)}" data-scene-outfit-avatar="${esc(name)}" value="${esc(avatar)}" placeholder="留空沿用角色头像">`
        + (avatar ? `<button type="button" class="igs-btn-mgr-icon" data-action="scene-clear-outfit-avatar:${c}:${o}" title="清除服装头像">${icons.trash}</button>` : '')
        + `</div></div>`;
    const ownRows = Object.entries(moods).map(([mood, url]) => {
        const filled = Boolean(String(url || '').trim());
        const preview = filled ? null : previewOf(sceneAssets, charName, mood, name);
        const note = notes && notes[mood];
        const raw = String(url || '').trim();
        const imageId = raw.startsWith('igs-gen:') ? raw.slice('igs-gen:'.length) : '';
        const canPrompt = Boolean(imageId) || Boolean(note && (note.caption || note.positive || note.negative));
        const slotMenu = renderRowMenu([
            canPrompt ? menuItem(`outfit-expression-prompt:${c}:${o}:${encSeg(mood)}`, '提示词') : '',
            imageId ? menuItem(`gen-asset-download:${encSeg(imageId)}:${encSeg(`${charName}-${name}-${mood}-立绘.png`)}`, '下载') : '',
            imageId || (note && note.error) ? menuItem(`outfit-expression-retry:${c}:${o}:${encSeg(mood)}`, '重新生成') : '',
            menuItem(`scene-rename-outfit-mood:${c}:${o}:${encSeg(mood)}`, '重命名'),
            menuItem(`scene-remove-outfit-mood:${c}:${o}:${encSeg(mood)}`, '删除', ' is-danger'),
        ], `「${mood}」的操作`);
        // 生成图的格子不放编号地址输入框；自己填地址的格子才有输入框。
        return `<div class="igs-outfit-slot${filled ? '' : ' is-fallback'}" data-outfit-slot="${esc(mood)}">`
            + (filled ? thumb(url, mood, '', resolveUrl) : thumb(preview.url, mood, ' is-ghost', resolveUrl))
            + `<span class="igs-btn-mgr-label">${esc(mood)}</span>`
            + (imageId ? '' : `<input class="igs-scene-url-input" data-scene-outfit-char="${esc(charName)}" data-scene-outfit="${esc(name)}" data-scene-outfit-mood="${esc(mood)}" value="${esc(url || '')}" placeholder="URL 或 data:image/...">`)
            + (filled ? '' : `<span class="igs-outfit-hint">${esc(preview.label)}</span>`)
            + slotMenu
            + `</div>`;
    }).join('');
    const missing = baseMoods.filter((mood) => mood !== OUTFIT_RESET && !Object.prototype.hasOwnProperty.call(moods, mood));
    // 缺的格子和有的排在同一个列表里，淡色显示阅读器暂时用哪张，右边一个 + 补上。
    const fallbackRows = missing.map((mood) => {
        const preview = previewOf(sceneAssets, charName, mood, name);
        return `<div class="igs-outfit-slot is-fallback" data-outfit-fallback="${esc(mood)}">${thumb(preview.url, mood, ' is-ghost', resolveUrl)}`
            + `<span class="igs-btn-mgr-label">${esc(mood)}</span><span class="igs-outfit-hint">${esc(preview.label)}</span>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-outfit-mood:${c}:${o}:${encSeg(mood)}" title="给这套补上「${esc(mood)}」">+</button></div>`;
    }).join('');
    const fillAll = missing.length > 1
        ? `<div class="igs-outfit-fill-all"><button type="button" class="igs-review-link" data-action="scene-outfit-copy-slots:${c}:${o}">缺的 ${missing.length} 格全部补上</button></div>`
        : '';
    const rows = ownRows + fallbackRows || '<div class="igs-scene-empty">还没有情绪槽，点右上 + 添加</div>';
    return `<div class="igs-outfit-panel" data-outfit-panel="${esc(name)}">${meta}<div class="igs-btn-mgr-list igs-outfit-slots">${rows}</div>${fillAll}</div>`;
}

// 角色卡的立绘区：「原装 · 服装…」标签切换。原装标签显示原有情绪槽；服装标签显示该服装的槽、词、场景、头像与缺图预览。
export function renderCharacterSlotTabs({ charName, baseMoods, baseListHtml, baseMenuItems = [], outfits, activeOutfit, sceneAssets, icons, expressionNotes, resolveUrl, isOpen = () => false }) {
    const map = plain(outfits);
    const names = Object.keys(map);
    const active = names.includes(activeOutfit) ? activeOutfit : '';
    const c = encSeg(charName);
    const tab = (value, label, extra = '', title = '') => (
        `<button type="button" class="igs-outfit-tab${active === value ? ' is-active' : ''}" role="tab" aria-selected="${active === value ? 'true' : 'false'}" data-action="scene-outfit-tab:${c}:${encSeg(value)}"${title ? ` title="${esc(title)}"` : ''}>${label}${extra}</button>`
    );
    const tabs = [tab('', '原装')].concat(names.map((name) => {
        const moods = plain(map[name] && map[name].moods);
        const filled = Object.values(moods).filter((url) => String(url || '').trim()).length;
        return tab(name, esc(name), `<span class="igs-outfit-tab-count">${filled}</span>`, `AI 写法：[igs-char:${charName}|表情|${name}|对白]`);
    })).join('');
    // 当前页签（原装或某套服装）的操作都在页签行末尾的「⋯」里。
    const o = encSeg(active);
    const metaKey = `outfit-meta:${charName}\u0001${active}`;
    const menu = active
        ? renderRowMenu([
            menuItem(`outfit-expression-set:${c}:${o}`, '表情差分'),
            menuItem(`ui-toggle-open:${encSeg(metaKey)}`, isOpen(metaKey) ? '收起服装设置' : '服装设置（衣柜、服装词…）'),
            menuItem(`scene-add-outfit-mood:${c}:${o}`, '添加情绪槽'),
            menuItem(`scene-rename-outfit:${c}:${o}`, '重命名这套'),
            menuItem(`scene-remove-outfit:${c}:${o}`, '删除这套', ' is-danger'),
        ], `「${active}」的操作`)
        : renderRowMenu(baseMenuItems, '原装的操作');
    const bar = `<div class="igs-outfit-tabs" role="tablist" data-outfit-tabs="${esc(charName)}">${tabs}`
        + `<button type="button" class="igs-outfit-tab igs-outfit-tab-add" data-action="scene-add-outfit:${c}" title="添加服装">＋ 服装</button>${menu}</div>`;
    const panel = active
        ? renderOutfitPanel(charName, active, plain(map[active]), baseMoods, sceneAssets, icons, expressionNotes, resolveUrl, isOpen)
        : baseListHtml;
    return `<div class="igs-outfit-area" data-outfit-area="${esc(charName)}">${bar}${panel}</div>`;
}

// 规则页的衣柜提示词。focus 是从服装面板跳过来的那一条，高亮显示。
export function renderWardrobe(wardrobe, { resolveUrl, scopeTag, focus = '', lead = '' } = {}) {
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const tag = typeof scopeTag === 'function' ? scopeTag : () => '';
    const rows = Object.entries(plain(wardrobe)).map(([name, entry]) => {
        const prompt = entry && typeof entry.prompt === 'string' ? entry.prompt : '';
        const reference = entry && typeof entry.reference === 'string' ? entry.reference : '';
        const encoded = encSeg(name);
        return `<div class="igs-wardrobe-item${name === focus ? ' is-focus' : ''}" data-wardrobe-item="${esc(name)}"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label">${esc(name)}</span>${tag('wardrobe', name)}`
            + `<input class="igs-scene-url-input igs-wardrobe-prompt" data-wardrobe-name="${esc(name)}" value="${esc(prompt)}" placeholder="提示词">`
            + `<button type="button" class="igs-settings-action" data-action="wardrobe-generate-prompt:${encoded}">生成提示词</button>`
            + `<button type="button" class="igs-settings-action" data-action="wardrobe-reference:${encoded}">生图参考</button>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="wardrobe-rename:${encoded}" title="重命名">${pencil}</button>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="wardrobe-remove:${encoded}" title="删除">${trash}</button></div>`
            + (reference ? `<div class="igs-wardrobe-reference">${thumb(reference, `${name} 参考图`, '', resolveUrl)}</div>` : '')
            + `</div>`;
    }).join('');
    return `<div class="igs-wardrobe-group">${lead ? `<div class="igs-asset-folder-bar">${lead}</div>` : ''}${rows || '<div class="igs-scene-empty">还没有衣柜提示词，点右上 + 添加</div>'}</div>`;
}

// 待确认页的一块：标题、数量、一句说明、清空，下面是条目。三块（服装词 / 情绪词 / 刚生成的图）长得一样。
export function renderReviewCard({ key, title, count = 0, hint = '', clearAction = '', body = '', empty = '' }) {
    const badge = count ? `<span class="igs-review-card-count">${count}</span>` : '';
    const clear = count && clearAction ? `<button type="button" class="igs-review-clear" data-action="${clearAction}">清空</button>` : '';
    const idle = !count && !body;
    return `<section class="igs-review-card${idle ? ' is-empty' : ''}" data-review-card="${esc(key)}">`
        + `<div class="igs-review-card-head"><span class="igs-review-card-title">${esc(title)}</span>${badge}${clear}${idle ? `<span class="igs-review-card-empty">${esc(empty)}</span>` : ''}</div>`
        + (hint && !idle ? `<div class="igs-review-card-hint">${esc(hint)}</div>` : '')
        + (idle ? '' : body) + `</section>`;
}

// 待确认服装词：AI 写了、但该角色没登记的服装名。下拉归入已有服装当服装词，或直接新建为服装。
export function renderOutfitReviewList(items, characterOutfits, characters) {
    const list = Array.isArray(items) ? items : [];
    const chars = plain(characters);
    const outfitMap = plain(characterOutfits);
    const rows = list.map(({ character, word }) => {
        const c = encSeg(character);
        const w = encSeg(word);
        const known = Object.prototype.hasOwnProperty.call(chars, character);
        const outfits = known ? Object.keys(plain(outfitMap[character])) : [];
        const assign = outfits.length
            ? `<select class="igs-asset-move igs-review-select" data-outfit-review-char="${esc(character)}" data-outfit-review-word="${esc(word)}" aria-label="把「${esc(word)}」归入已有服装"><option value="">归入…</option>`
                + outfits.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('') + '</select>'
            : '';
        const actions = known
            ? `${assign}<button type="button" class="igs-review-link is-primary" data-action="outfit-review-create:${c}:${w}" title="新建为「${esc(character)}」的服装">新建</button>`
            : '<span class="igs-review-card-note">角色未登记立绘</span>';
        return `<div class="igs-review-item"><span class="igs-mood-review-chip"><b>${esc(word)}</b><span class="igs-review-who">${esc(character)}</span></span>`
            + `<span class="igs-review-actions">${actions}<button type="button" class="igs-review-link" data-action="outfit-review-dismiss:${c}:${w}">忽略</button></span></div>`;
    }).join('');
    return renderReviewCard({
        key: 'outfit',
        title: '服装词',
        count: list.length,
        hint: 'AI 写了、角色还没登记的服装。归入已有服装后，下次就认得这个词。',
        clearAction: 'outfit-review-clear',
        body: rows ? `<div class="igs-review-list">${rows}</div>` : '',
        empty: '没有待确认的服装词',
    });
}

export const OUTFIT_SETTINGS_STYLE_TEXT = `
.igs-outfit-area{margin-top:8px;min-width:0}
.igs-char-card{padding:6px 4px}
.igs-char-card.is-open{padding-bottom:12px}
.igs-char-body{margin-top:6px}
.igs-folder-pick{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:28px;height:28px;border-radius:var(--igs-settings-radius-small);color:var(--igs-settings-ink-4);cursor:pointer}
.igs-folder-pick.is-set{color:var(--igs-settings-ink-2)}
.igs-folder-pick:hover,.igs-folder-pick:focus-within{background:var(--igs-settings-highlight);color:var(--igs-settings-ink)}
.igs-folder-pick-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px}
.igs-char-body .igs-outfit-area{margin-top:0}
.igs-char-card .igs-btn-mgr-list{padding:0;background:transparent;border-radius:0}
.igs-char-head{display:flex;align-items:center;gap:6px;min-width:0;min-height:36px}
.igs-char-avatar{display:inline-flex;flex-shrink:0;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer}
.igs-char-avatar .igs-status-avatar-thumb{width:32px;height:32px;cursor:pointer}
.igs-char-avatar:hover .igs-status-avatar-thumb,.igs-char-avatar:focus-visible .igs-status-avatar-thumb{outline:2px solid var(--igs-settings-line-strong);outline-offset:1px}
.igs-char-avatar:focus-visible{outline:none}
.igs-char-head .igs-asset-move{flex:0 0 96px;width:96px}
.igs-char-info-row>.igs-asset-move{flex:1;width:auto}
@media (max-width:420px){.igs-char-head .igs-asset-move{flex-basis:80px;width:80px}}
.igs-char-title{display:flex;align-items:baseline;gap:8px;flex:1 1 120px;min-width:0;padding:4px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.igs-char-title:focus-visible{outline:2px solid var(--igs-settings-line-strong);outline-offset:2px;border-radius:var(--igs-settings-radius-small)}
.igs-char-name{flex-shrink:0;font-size:14px;font-weight:600;color:var(--igs-settings-ink)}
.igs-char-aliases{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--igs-settings-ink-4)}
.igs-char-info-row{display:flex;align-items:center;gap:8px;min-width:0}
.igs-char-info-row.is-block{flex-direction:column;align-items:stretch;gap:6px;padding-top:6px;border-top:1px solid var(--igs-settings-line)}
.igs-char-info-row>.igs-mood-word-list,.igs-char-info-value{flex:1;min-width:0}
.igs-char-info-value{display:flex;align-items:center;gap:6px}
.igs-char-info-label{flex:0 0 72px;font-size:12px;color:var(--igs-settings-ink-3)}
.igs-char-info-row.is-block>.igs-char-info-label{flex:none}
.igs-char-info .igs-dna-fields{margin-top:0}
.igs-settings-section-actions{display:flex;align-items:center;gap:2px}
.igs-btn-mgr-icon.igs-char-dna-btn.is-on{color:var(--igs-settings-ink-2)}
.igs-char-dna-btn.is-open{background:var(--igs-settings-highlight);color:var(--igs-settings-ink)}
span.igs-char-dna-btn{display:inline-flex;color:var(--igs-settings-ink-3)}
.igs-char-dna-panel{display:flex;flex-direction:column;gap:8px;min-width:0;margin-top:8px;padding:8px 10px 10px;border:1px solid var(--igs-settings-line);border-radius:var(--igs-settings-radius-control)}
.igs-char-dna-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font-size:12px;font-weight:600;color:var(--igs-settings-ink-2)}
.igs-dna-input{padding:8px 10px;line-height:1.6}
.igs-char-dna-panel .igs-dna-fields{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:0}
.igs-char-dna-panel .igs-dna-input{height:60px;min-height:60px}
.igs-outfit-tabs{display:flex;flex-wrap:wrap;gap:2px;padding:3px;margin:0 0 8px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-outfit-tab{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border:0;background:transparent;color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color .14s,color .14s}
.igs-outfit-tab:hover,.igs-outfit-tab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-outfit-tab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600}
.igs-outfit-tab-add{margin-left:auto;color:var(--igs-settings-ink-4)}
.igs-outfit-tabs>.igs-row-menu>summary{height:28px}
.igs-add-menu-item.is-danger{color:var(--igs-settings-danger)}
.igs-folder-pick-item{position:relative;gap:8px}
.igs-folder-pick-where{margin-left:auto;padding-left:12px;color:var(--igs-settings-ink-4)}
.igs-outfit-tab-count{min-width:16px;padding:0 4px;border-radius:8px;background:var(--igs-settings-highlight);color:var(--igs-settings-ink-3);font-size:10px;font-weight:500;line-height:16px;text-align:center}
.igs-outfit-tab.is-active .igs-outfit-tab-count{background:var(--igs-settings-field)}
.igs-outfit-panel{display:flex;flex-direction:column;gap:6px;min-width:0}
.igs-outfit-meta-toggle.is-open{background:var(--igs-settings-highlight);color:var(--igs-settings-ink)}
.igs-outfit-hint{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--igs-settings-ink-4)}
.igs-outfit-slot.is-fallback>.igs-btn-mgr-label{color:var(--igs-settings-ink-4)}
.igs-outfit-fill-all{display:flex;justify-content:flex-end;margin-top:2px}
.igs-outfit-meta-body{display:flex;flex-direction:column;gap:6px;margin:2px 0 6px 6px;padding:2px 0 2px 12px;border-left:1px solid var(--igs-settings-line)}
.igs-outfit-meta-row{display:flex;align-items:center;gap:8px;min-width:0}
.igs-outfit-meta-row .igs-mood-word-list{flex:1;min-width:0}
.igs-outfit-meta-label{flex:0 0 64px;font-size:12px;color:var(--igs-settings-ink-3)}
.igs-outfit-muted{font-size:11px;color:var(--igs-settings-ink-4);font-weight:400}
.igs-outfit-slot{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 6px;border-bottom:1px solid var(--igs-settings-line)}
.igs-outfit-slot:last-child{border-bottom:0}
.igs-outfit-slot>.igs-btn-mgr-label{flex:0 0 64px}
.igs-outfit-slot .igs-scene-url-input{flex:1;min-width:0}
.igs-outfit-slot.is-fallback>.igs-btn-mgr-label{color:var(--igs-settings-ink-3)}
.igs-outfit-fallbacks{padding:0 6px}
.igs-outfit-fallbacks .igs-outfit-slot{border-bottom:0;padding:2px 6px}
.igs-outfit-thumb{width:36px;height:36px;flex-shrink:0;object-fit:contain;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-paper);cursor:zoom-in}
.igs-outfit-thumb.is-ghost{opacity:.38;filter:grayscale(.6)}
.igs-outfit-thumb-empty{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;padding:6px;font-size:10px;color:var(--igs-settings-ink-4);cursor:default}
.igs-outfit-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;padding:4px}
img.igs-outfit-avatar{padding:0}

.igs-outfit-badge{flex-shrink:0;font-size:11px;padding:1px 6px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-highlight);color:var(--igs-settings-ink-3);white-space:nowrap}
.igs-outfit-badge.is-none{color:var(--igs-settings-ink-4)}
.igs-outfit-slot.is-fallback .igs-outfit-badge{margin-right:auto}
.igs-outfit-subhead{display:flex;align-items:center;gap:6px;margin:8px 0 2px;font-size:12px;color:var(--igs-settings-ink-2)}
.igs-outfit-subhead .igs-outfit-fill{margin-left:auto}
.igs-outfit-fill{height:24px;padding:0 8px;font-size:11px}
.igs-wardrobe-group{display:flex;flex-direction:column;gap:6px;min-width:0}
.igs-wardrobe-group+.igs-wardrobe-group{margin-top:4px;padding-top:12px;border-top:1px solid var(--igs-settings-line)}
.igs-wardrobe-item{display:flex;flex-direction:column;min-width:0}
.igs-wardrobe-item .igs-btn-mgr-row{height:auto;min-height:36px;flex-wrap:wrap}
.igs-wardrobe-item .igs-btn-mgr-label{flex:0 1 auto;max-width:9em}
.igs-wardrobe-prompt{flex:1;min-width:0;width:auto;height:26px}
.igs-wardrobe-reference{padding:0 8px 4px}
.igs-wardrobe-item.is-focus{border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-highlight)}
.igs-asset-scope-switch{display:inline-flex;flex-shrink:0;gap:2px;padding:2px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field)}
.igs-scope-seg{display:inline-flex;align-items:center;height:22px;padding:0 8px;border:0;border-radius:var(--igs-settings-radius-small);background:transparent;color:var(--igs-settings-ink-4);font:inherit;font-size:11px;white-space:nowrap}
button.igs-scope-seg{cursor:pointer}
button.igs-scope-seg:hover,button.igs-scope-seg:focus-visible{color:var(--igs-settings-ink);outline:none}
.igs-scope-seg.is-on{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600}
.igs-asset-scope-note{flex-shrink:0;font-size:11px;color:var(--igs-settings-ink-4);white-space:nowrap}
.igs-asset-scope-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0 0 10px}
.igs-asset-scope-name{flex:1;min-width:0;font-size:12px;color:var(--igs-settings-ink-2)}
.igs-asset-presets{margin:0 0 10px;border:1px solid var(--igs-settings-line);border-radius:var(--igs-settings-radius-control)}
.igs-asset-presets-summary{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 12px;font-size:12px;font-weight:600;color:var(--igs-settings-ink-2);cursor:pointer;list-style:none;user-select:none}
.igs-asset-presets-summary::-webkit-details-marker{display:none}
.igs-asset-presets-summary::before{content:"";flex-shrink:0;width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);opacity:.55;transition:transform .14s}
.igs-asset-presets[open]>.igs-asset-presets-summary::before{transform:rotate(45deg)}
.igs-asset-presets-body{display:flex;flex-direction:column;padding:0 12px 10px}
.igs-asset-preset-row{display:flex;align-items:center;gap:6px;min-width:0;min-height:36px;border-top:1px solid var(--igs-settings-line)}
.igs-asset-preset-row:first-child{border-top:0}
.igs-asset-preset-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--igs-settings-ink)}
.igs-asset-preset-row .igs-review-link{min-width:52px;min-height:28px;padding:2px 10px;background:var(--igs-settings-field);text-align:center;color:var(--igs-settings-ink)}
.igs-asset-preset-where{flex-shrink:1;min-width:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--igs-settings-ink-4)}
.igs-asset-preset-apply>summary{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;list-style:none}
.igs-asset-preset-apply>summary::-webkit-details-marker{display:none}
.igs-asset-presets-empty{padding:4px 0 8px;font-size:11px;color:var(--igs-settings-ink-4)}
.igs-asset-presets-tools{display:flex;gap:8px;padding-top:8px;border-top:1px solid var(--igs-settings-line)}
.igs-asset-presets-tools>.igs-settings-action{flex:1}
.igs-asset-scope-bar+.igs-source-filter-note{margin:-4px 0 10px}
.igs-source-filter-title>.igs-title-add{margin-left:auto}
.igs-outfit-wardrobe-edit{flex-shrink:0;white-space:nowrap}
.igs-asset-filter-group{display:inline-flex;gap:2px;padding:2px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field)}
.igs-asset-filter{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 10px;border:0;border-radius:var(--igs-settings-radius-small);background:transparent;color:var(--igs-settings-ink-3);font:inherit;font-size:12px;cursor:pointer}
.igs-asset-filter.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600}
.igs-asset-filter:hover,.igs-asset-filter:focus-visible{color:var(--igs-settings-ink);outline:none}
.igs-asset-filter-count{font-size:10px;color:var(--igs-settings-ink-4);font-weight:400}
.igs-asset-bulk{width:28px;height:28px;color:var(--igs-settings-ink-3)}
.igs-asset-bulk:hover,.igs-asset-bulk:focus-visible{color:var(--igs-settings-ink);background:var(--igs-settings-highlight);outline:none}
.igs-asset-bulk-menu>.igs-add-menu-list{left:0;right:auto;transform-origin:top left}
.igs-add-menu-item:disabled{color:var(--igs-settings-ink-4);background:transparent;cursor:default}
.igs-review-card{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--igs-settings-line);border-radius:var(--igs-settings-radius-control)}
.igs-review-card+.igs-review-card{margin-top:10px}
.igs-review-card.is-empty{gap:0;padding:10px 12px}
.igs-review-card-head{display:flex;align-items:center;gap:8px;min-width:0}
.igs-review-card-title{font-size:13px;font-weight:600;color:var(--igs-settings-ink)}
.igs-review-card.is-empty .igs-review-card-title{font-weight:500;color:var(--igs-settings-ink-3)}
.igs-review-card-count{min-width:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:var(--igs-settings-highlight);color:var(--igs-settings-ink-2);font-size:11px;line-height:18px;text-align:center}
.igs-review-card-head .igs-review-clear{margin-left:auto}
.igs-review-card-hint{margin-top:-4px;font-size:11px;line-height:1.5;color:var(--igs-settings-ink-4)}
.igs-review-card-empty{margin-left:auto;font-size:11px;color:var(--igs-settings-ink-4)}
.igs-review-card-note{font-size:11px;color:var(--igs-settings-ink-4)}
.igs-review-list{display:flex;flex-direction:column;min-width:0}
.igs-review-item{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0;padding:7px 0;border-top:1px solid var(--igs-settings-line)}
.igs-review-item:first-child{border-top:0;padding-top:0}
.igs-review-item:last-child{padding-bottom:0}
.igs-review-who{font-size:11px;color:var(--igs-settings-ink-4)}
.igs-review-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px;margin-left:auto}
.igs-review-actions .igs-review-link{min-width:52px;min-height:28px;padding:2px 10px;text-align:center;background:var(--igs-settings-field)}
.igs-review-actions .igs-review-link.is-primary{color:var(--igs-settings-ink)}
.igs-gen-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;min-width:0}
.igs-gen-tile{display:flex;flex-direction:column;gap:6px;min-width:0}
.igs-gen-tile-img{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1/1;object-fit:contain;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);font-size:11px;color:var(--igs-settings-ink-4);cursor:zoom-in}
.igs-gen-tile.is-wide .igs-gen-tile-img{object-fit:cover}
.igs-gen-tile-empty{cursor:default}
.igs-gen-tile-meta{display:flex;flex-direction:column;gap:2px;min-width:0}
.igs-gen-tile-meta b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--igs-settings-ink)}
.igs-gen-tile-meta span{font-size:11px;color:var(--igs-settings-ink-4)}
.igs-gen-tile-actions{display:flex;align-items:center;gap:4px}
.igs-gen-tile-actions>.igs-review-link{flex:1;min-height:28px;background:var(--igs-settings-field);text-align:center}
.igs-gen-tile-actions>.igs-review-link.is-primary{color:var(--igs-settings-ink)}
@media (max-width:420px){.igs-gen-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.igs-review-select{width:auto;max-width:8em;height:28px;padding:0 6px;font-size:12px}
.igs-scene-subtab-count{margin-left:4px;padding:0 5px;border-radius:8px;background:var(--igs-settings-accent);color:#fff;font-size:10px;line-height:16px}
`.trim();
