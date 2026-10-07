import { esc } from './reader-value-utils.js';
import { resolveSpriteAsset } from '../../scene/asset-match.js';
import { BUILTIN_NUDE_OUTFIT, OUTFIT_RESET, isBuiltinNudeOutfit } from '../../scene/character-outfits.js';

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

// 下拉默认贴着按钮右缘往左、往下开。靠左的 ⋯ 左边放不下就改往右开；靠近滚动区底部往上开。
// 两边都放不下就限高，菜单内滚动。
export function placeRowMenu(details, win = globalThis) {
    // 情绪列表外框为了圆角设了 overflow:hidden，菜单开着时放开，否则下拉被裁、只剩一截。
    const clipper = details && typeof details.closest === 'function' ? details.closest('.igs-btn-mgr-list') : null;
    if (clipper) clipper.classList.toggle('is-menu-open', details.open === true);
    if (details && details.classList) {
        details.classList.remove('is-up');
        details.classList.remove('is-flip-x');
    }
    if (!details || !details.open || typeof details.querySelector !== 'function') return;
    const list = details.querySelector('.igs-add-menu-list');
    if (!list || typeof list.getBoundingClientRect !== 'function') return;
    if (list.style) list.style.maxHeight = '';
    const getStyle = win && typeof win.getComputedStyle === 'function' ? (el) => win.getComputedStyle(el) : null;
    let top = 0;
    let bottom = Number(win && win.innerHeight) || 0;
    let left = 0;
    let right = Number(win && win.innerWidth) || 0;
    // 只往上查到设置正文滚动区为止：再往外都是固定的遮罩与面板，逐层取样式只会白白强制排版。
    const stop = typeof details.closest === 'function' ? details.closest('.igs-settings-body') : null;
    for (let el = details.parentElement; el && getStyle; el = el === stop ? null : el.parentElement) {
        const style = getStyle(el) || {};
        const box = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
        if (!box) continue;
        if (/(auto|scroll|hidden)/.test(String(style.overflowY || ''))) {
            top = Math.max(top, box.top);
            bottom = bottom ? Math.min(bottom, box.bottom) : box.bottom;
        }
        if (/(auto|scroll|hidden)/.test(`${style.overflowX || ''}${style.overflow || ''}`)) {
            left = Math.max(left, box.left);
            right = right ? Math.min(right, box.right) : box.right;
        }
    }
    const anchor = details.getBoundingClientRect();
    const menuBox = list.getBoundingClientRect();
    const gap = 8;
    const width = Math.max(Number(list.scrollWidth) || 0, Number(menuBox.width) || 0);
    const anchorLeft = Number(anchor.left);
    const anchorRight = Number(anchor.right);
    if (width && right && Number.isFinite(anchorLeft) && Number.isFinite(anchorRight)) {
        const roomLeft = anchorRight - left;
        const roomRight = right - anchorLeft;
        if (width + gap > roomLeft && roomRight > roomLeft) details.classList.add('is-flip-x');
    }
    if (!bottom) return;
    const need = list.scrollHeight || menuBox.height;
    const below = bottom - anchor.bottom - gap;
    const above = anchor.top - top - gap;
    if (need <= below) return;
    const up = above > below;
    if (up) details.classList.add('is-up');
    const room = Math.floor(up ? above : below);
    if (need > room && room > 0 && list.style) list.style.maxHeight = `${room}px`;
}

// 词写好了、图还没出的格子：已有空槽的出图失败，或者停下时还没轮到、没建槽的。
// 用户删掉的格子注记可能还在，但它不是「已停止」，不算进来。
export function pendingExpressionCaptions(notes, slots) {
    const own = slots && typeof slots === 'object' ? slots : {};
    return Object.entries(notes && typeof notes === 'object' ? notes : {})
        .filter(([mood, note]) => note && note.caption && mood !== '默认' && !String(own[mood] || '').trim()
            && (Object.prototype.hasOwnProperty.call(own, mood) || note.error === '已停止'))
        .map(([mood, note]) => ({ mood, caption: note.caption }));
}

export const menuItem = (action, label, extra = '') => `<button type="button" class="igs-add-menu-item${extra}" data-action="${action}" role="menuitem">${esc(label)}</button>`;

const svg12 = (body) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const SLOT_ICONS = {
    download: svg12('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    upload: svg12('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    retry: svg12('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
    rename: svg12('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    outfit: svg12('<path d="M12 6a2 2 0 1 1 2-2"/><path d="M12 6v2L2.5 15.5A1.5 1.5 0 0 0 3.4 18h17.2a1.5 1.5 0 0 0 .9-2.5L12 8"/>'),
    mood: svg12('<circle cx="11" cy="12" r="8"/><path d="M7.5 14.5a4.5 4.5 0 0 0 7 0"/><line x1="8.5" y1="9.5" x2="8.51" y2="9.5"/><line x1="13.5" y1="9.5" x2="13.51" y2="9.5"/><line x1="20" y1="2" x2="20" y2="8"/><line x1="17" y1="5" x2="23" y2="5"/>'),
    variants: svg12('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/><path d="M19 3a3 3 0 0 0 2 5 4 4 0 0 1-4-5z"/>'),
};

// 下载 / 上传成对外露、同一套图标：没存图（外链或空格）时下载位留空占位，整列按钮才对得齐。
// pick 为 [action, title]，不给就只放下载位。
export function transferIcons(url, fileName, pick) {
    const raw = String(url || '').trim();
    const id = raw.startsWith('igs-gen:') ? raw.slice('igs-gen:'.length) : '';
    const down = id
        ? `<button type="button" class="igs-btn-mgr-icon igs-asset-transfer" data-action="gen-asset-download:${encSeg(id)}:${encSeg(fileName)}" title="下载" aria-label="下载">${SLOT_ICONS.download}</button>`
        : `<span class="igs-btn-mgr-icon igs-asset-transfer is-spacer" aria-hidden="true">${SLOT_ICONS.download}</span>`;
    const up = pick ? `<button type="button" class="igs-btn-mgr-icon igs-asset-transfer" data-action="${pick[0]}" title="${esc(pick[1])}" aria-label="${esc(pick[1])}">${SLOT_ICONS.upload}</button>` : '';
    return down + up;
}

// 差分格的下载 / 重新生成 / 重命名：宽屏外露成图标；细窄屏藏起图标，仍走 ⋯ 里的同名项。
// list：[action, label, iconKey]，空项跳过。返回 { inline, items }：inline 放行内，items 塞进 ⋯。
export function slotActions(list) {
    const shown = list.filter(Boolean);
    return {
        inline: shown.map(([action, label, icon]) => `<button type="button" class="igs-btn-mgr-icon igs-slot-act" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}">${SLOT_ICONS[icon]}</button>`).join(''),
        items: shown.map(([action, label]) => menuItem(action, label, ' igs-slot-act-menu')),
    };
}

const PERSON_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>';

function shownUrl(url, resolveUrl) {
    const raw = String(url || '').trim();
    if (!raw || typeof resolveUrl !== 'function') return raw;
    try { return String(resolveUrl(raw) || ''); } catch (error) { return ''; }
}

// note：点开大图时底部的说明（淡色借图要说清楚这不是这一格自己的图）。
function thumb(url, alt, extraClass = '', resolveUrl, note = '') {
    const value = shownUrl(url, resolveUrl);
    if (isImageUrl(value)) {
        return `<img loading="lazy" decoding="async" class="igs-outfit-thumb${extraClass}" src="${esc(value)}" alt="${esc(alt)}" data-action="sprite-preview"${note ? ` data-preview-note="${esc(note)}"` : ''} onerror="this.classList.add('igs-sprite-thumb-broken')">`;
    }
    return `<span class="igs-outfit-thumb igs-outfit-thumb-empty${extraClass}" aria-hidden="true">${value ? '生成' : PERSON_SVG}</span>`;
}

// 该服装缺这一格（或这一格没填图）时阅读器实际显示什么：借用服装内同组槽，或这一套的平和。
function previewOf(sceneAssets, charName, mood, outfit) {
    const hit = resolveSpriteAsset(charName, mood, { sceneAssets }, outfit);
    // 这一套里没有、借的是角色默认立绘：说成回落原装，不说成借这一套的格子。
    if (hit.source === 'user-outfit' && hit.slot !== '默认') return { url: hit.url, label: `借用「${hit.slot}」`, kind: 'borrow', slot: hit.slot };
    if (hit.url) return { url: hit.url, label: `回落原装「${hit.slot || mood}」`, kind: 'base', slot: hit.slot || mood };
    return { url: '', label: '无图可显示', kind: 'none', slot: '' };
}

// 借来的图多半和本格情绪接近（回退链按同方向找），不写明就会被当成本格自己的图。
function ghostNote(mood, preview, status) {
    if (!preview.url) return '';
    const lead = preview.kind === 'borrow'
        ? `「${mood}」还没有自己的图，这里显示的是阅读器暂时借用的「${preview.slot}」。`
        : `「${mood}」还没有自己的图，这里显示的是阅读器暂时回落使用的原装「${preview.slot}」。`;
    return status ? `${lead}\n${status.text}` : lead;
}

// 表情差分没画出来的格子：注记里记着原因或写好的词，直接写在格子上，不再只剩一张淡色借图。
export function expressionSlotStatus(note) {
    if (!note || typeof note !== 'object') return null;
    const error = String(note.error || '').trim();
    if (error && error !== '已停止') return { text: `没画出来：${error}`, failed: true };
    if (note.caption || error === '已停止') return { text: '词已写好，还没出图', failed: false };
    return null;
}

// 有原因时分两行：上行原因、下行借谁，各自省略，窄屏上「借用」那行也不会被原因挤掉。
function fallbackHint(preview, status) {
    if (!status) return `<span class="igs-outfit-hint">${esc(preview.label)}</span>`;
    return `<span class="igs-outfit-hint is-stacked" title="${esc(`${status.text} · ${preview.label}`)}">`
        + `<span class="igs-outfit-status">${esc(status.text)}</span><span>${esc(preview.label)}</span></span>`;
}

function chipList(items, removeAction, addAction, emptyText, addTitle) {
    const tags = items.map((item) => (
        `<span class="igs-mood-word-tag">${esc(item)}<button type="button" class="igs-mood-word-del" data-action="${removeAction}:${encSeg(item)}" title="删除">×</button></span>`
    )).join('');
    return `<div class="igs-mood-word-list">${tags || (emptyText ? `<span class="igs-outfit-muted">${esc(emptyText)}</span>` : '')}<button type="button" class="igs-btn-mgr-icon" data-action="${addAction}" title="${esc(addTitle)}">+</button></div>`;
}

// 衣柜提示词在「规则」页。这里只选用哪一条。「裸体」是内置项，不进服装库，选中后生图按这个角色写裸体。
function wardrobeChoices(charName, outfitName, entry, wardrobe) {
    const names = Object.keys(plain(wardrobe)).filter((item) => !isBuiltinNudeOutfit(item));
    const selected = typeof entry.wardrobe === 'string' ? entry.wardrobe.trim() : '';
    const nude = isBuiltinNudeOutfit(selected);
    const choice = (value, label) => menuItem(
        `scene-set-outfit-wardrobe-url:${encSeg(charName)}:${encSeg(outfitName)}:${encSeg(value)}`,
        label,
        (value ? value === selected : !selected) ? ' is-current' : '',
    );
    const options = [choice('', '同名服装'), choice(BUILTIN_NUDE_OUTFIT, BUILTIN_NUDE_OUTFIT)]
        .concat(names.map((item) => choice(item, item)));
    if (selected && !nude && !names.includes(selected)) options.push(choice(selected, selected));
    const current = nude ? BUILTIN_NUDE_OUTFIT : (selected || '同名服装');
    const edit = nude ? '' : `<button type="button" class="igs-settings-action igs-outfit-wardrobe-edit" data-action="wardrobe-for-outfit:${encSeg(charName)}:${encSeg(outfitName)}">${names.includes(selected || outfitName) ? '编辑提示词' : '写提示词'}</button>`;
    return `<details class="igs-add-menu igs-wardrobe-pick"><summary class="igs-asset-move" aria-label="使用衣柜">${esc(current)}</summary>`
        + `<div class="igs-add-menu-list" role="listbox">${options.join('')}</div></details>${edit}`;
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
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">别名</span>${chipList(words, `scene-remove-outfit-word:${c}:${o}`, `scene-add-outfit-word:${c}:${o}`, '', '添加别名：正文或表格里出现这个词，就按这套服装显示')}</div>`
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
        const acts = slotActions([
            imageId || (note && note.error) ? [`outfit-expression-retry:${c}:${o}:${encSeg(mood)}`, '重新生成', 'retry'] : null,
        ]);
        const slotMenu = acts.inline + transferIcons(raw, `${charName}-${name}-${mood}-立绘.png`, [`scene-pick-outfit-mood:${c}:${o}:${encSeg(mood)}`, `上传${mood}立绘`]) + renderRowMenu([
            canPrompt ? menuItem(`outfit-expression-prompt:${c}:${o}:${encSeg(mood)}`, '提示词') : '',
            ...acts.items,
            menuItem(`scene-rename-outfit-mood:${c}:${o}:${encSeg(mood)}`, '重命名'),
            menuItem(`scene-remove-outfit-mood:${c}:${o}:${encSeg(mood)}`, '删除', ' is-danger'),
        ], `「${mood}」的操作`);
        const status = filled ? null : expressionSlotStatus(note);
        // 生成图的格子不放编号地址输入框（差分没画出来的也算）；自己填地址的格子才有输入框。
        return `<div class="igs-outfit-slot${filled ? '' : ' is-fallback'}${status && status.failed ? ' is-failed' : ''}" data-outfit-slot="${esc(mood)}">`
            + (filled ? thumb(url, mood, '', resolveUrl) : thumb(preview.url, mood, ' is-ghost', resolveUrl, ghostNote(mood, preview, status)))
            + `<span class="igs-btn-mgr-label">${esc(mood)}</span>`
            + (imageId || status ? '' : `<input class="igs-scene-url-input" data-scene-outfit-char="${esc(charName)}" data-scene-outfit="${esc(name)}" data-scene-outfit-mood="${esc(mood)}" value="${esc(url || '')}" placeholder="URL或data:image/...">`)
            + (filled ? '' : fallbackHint(preview, status))
            + `<span class="igs-outfit-acts">${slotMenu}</span>`
            + `</div>`;
    }).join('');
    const missing = baseMoods.filter((mood) => mood !== OUTFIT_RESET && !Object.prototype.hasOwnProperty.call(moods, mood));
    // 缺的格子和有的排在同一个列表里，淡色显示阅读器暂时用哪张，右边一个 + 补上。
    const fallbackRows = missing.map((mood) => {
        const preview = previewOf(sceneAssets, charName, mood, name);
        const status = expressionSlotStatus(notes && notes[mood]);
        return `<div class="igs-outfit-slot is-fallback" data-outfit-fallback="${esc(mood)}">${thumb(preview.url, mood, ' is-ghost', resolveUrl, ghostNote(mood, preview, status))}`
            + `<span class="igs-btn-mgr-label">${esc(mood)}</span>${fallbackHint(preview, status)}`
            + `<span class="igs-outfit-acts"><button type="button" class="igs-btn-mgr-icon" data-action="scene-add-outfit-mood:${c}:${o}:${encSeg(mood)}" title="给这套补上「${esc(mood)}」">+</button></span></div>`;
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
    const names = Object.keys(map).filter((item) => !isBuiltinNudeOutfit(item));
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
    const o = encSeg(active);
    const metaKey = `outfit-meta:${charName}\u0001${active}`;
    // 生成立绘只留在原装。其它服装没有自己的立绘，只能出表情差分。
    const exprAction = active ? `outfit-expression-set:${c}:${o}` : `char-expression-set:${c}`;
    const notesMap = plain(expressionNotes);
    const pending = active
        ? pendingExpressionCaptions(notesMap[`${charName}\u0001${active}`], plain(map[active] && map[active].moods))
        : pendingExpressionCaptions(notesMap[charName], plain(plain(plain(sceneAssets).characters)[charName]));
    const resumeAction = active ? `outfit-expression-resume:${c}:${o}` : `char-expression-resume:${c}`;
    const spriteButton = active
        ? ''
        : `<button type="button" class="igs-settings-action igs-outfit-quick-btn" data-action="char-generate-sprite:${c}">生成立绘</button>`;
    const quickButtons = `<span class="igs-outfit-quick">`
        + spriteButton
        + `<button type="button" class="igs-settings-action igs-outfit-quick-btn" data-action="${exprAction}">表情差分</button>`
        + (pending.length ? `<button type="button" class="igs-settings-action igs-outfit-quick-btn" data-action="${resumeAction}" title="词已经写好，直接出图，不重写">继续生图（${pending.length}）</button>` : '')
        + `</span>`;
    const menu = active
        ? renderRowMenu([
            menuItem(`ui-toggle-open:${encSeg(metaKey)}`, isOpen(metaKey) ? '收起服装设置' : '服装设置（衣柜、别名…）'),
            menuItem(`scene-rename-outfit:${c}:${o}`, '重命名这套'),
            menuItem(`scene-remove-outfit:${c}:${o}`, '删除这套', ' is-danger'),
        ], `「${active}」的操作`)
        : renderRowMenu(baseMenuItems, '原装的操作');
    const bar = `<div class="igs-outfit-tabs" role="tablist" data-outfit-tabs="${esc(charName)}">${tabs}`
        + `<button type="button" class="igs-outfit-tab igs-outfit-tab-add" data-action="scene-add-outfit:${c}" title="添加服装">+服装</button>`
        + `<button type="button" class="igs-outfit-tab igs-outfit-tab-add igs-outfit-tab-mood" data-action="${active ? `scene-add-outfit-mood:${c}:${o}` : `scene-add-mood:${c}`}" title="给${active ? `「${esc(active)}」` : '原装'}添加情绪">+情绪</button>`
        + `${quickButtons}${menu}</div>`;
    const panel = active
        ? renderOutfitPanel(charName, active, plain(map[active]) || { words: [], moods: {} }, baseMoods, sceneAssets, icons, expressionNotes, resolveUrl, isOpen)
        : baseListHtml;
    return `<div class="igs-outfit-area" data-outfit-area="${esc(charName)}">${bar}${panel}</div>`;
}

// 规则页的衣柜提示词。focus 是从服装面板跳过来的那一条，高亮显示。
export function renderWardrobe(wardrobe, { resolveUrl, scopeTag, focus = '', lead = '' } = {}) {
    const tag = typeof scopeTag === 'function' ? scopeTag : () => '';
    const rows = Object.entries(plain(wardrobe)).filter(([name]) => !isBuiltinNudeOutfit(name)).map(([name, entry]) => {
        const reference = entry && typeof entry.reference === 'string' ? entry.reference : '';
        const encoded = encSeg(name);
        const nsfwBoost = Boolean(entry && entry.nsfwBoost);
        const menu = renderRowMenu([
            menuItem(`wardrobe-prompt:${encoded}`, '提示词'),
            menuItem(`wardrobe-generate-prompt:${encoded}`, '生成提示词'),
            menuItem(`wardrobe-reference:${encoded}`, '生图参考'),
            `<button type="button" class="igs-add-menu-item igs-wardrobe-nsfw${nsfwBoost ? ' is-on' : ''}" data-action="wardrobe-nsfw:${encoded}" role="menuitem" aria-pressed="${nsfwBoost ? 'true' : 'false'}">${nsfwBoost ? '关闭瑟瑟加强' : '瑟瑟加强'}</button>`,
            menuItem(`wardrobe-rename:${encoded}`, '重命名'),
            menuItem(`wardrobe-remove:${encoded}`, '删除', ' is-danger'),
        ], `「${name}」的操作`);
        const rowThumb = reference
            ? thumb(reference, `${name} 参考图`, '', resolveUrl)
            : '<span class="igs-outfit-thumb igs-outfit-thumb-empty" aria-hidden="true"></span>';
        return `<div class="igs-sprite-slot igs-wardrobe-item${name === focus ? ' is-focus' : ''}" data-wardrobe-item="${esc(name)}"><div class="igs-btn-mgr-row igs-scene-mood-row">`
            + rowThumb
            + `<button type="button" class="igs-btn-mgr-label igs-wardrobe-name" data-action="wardrobe-prompt:${encoded}" title="查看和修改提示词">${esc(name)}</button>${tag('wardrobe', name)}`
            + `${menu}</div></div>`;
    }).join('');
    const body = rows
        ? `<div class="igs-btn-mgr-list igs-wardrobe-list is-tall">${rows}</div>`
        : '<div class="igs-scene-empty">还没有衣柜提示词，点右上 + 添加</div>';
    return `<div class="igs-wardrobe-group">${lead ? `<div class="igs-asset-folder-bar">${lead}</div>` : ''}${body}</div>`;
}

// 待确认页的一块：标题、数量、一句说明、清空，下面是条目。三块（服装词 / 情绪词 / 刚生成的图）长得一样。
export function renderReviewCard({ key, title, count = 0, hint = '', clearAction = '', headerAction = '', body = '', empty = '' }) {
    const badge = count ? `<span class="igs-review-card-count">${count}</span>` : '';
    const clear = count && clearAction ? `<button type="button" class="igs-review-clear" data-action="${clearAction}">清空</button>` : '';
    const idle = !count && !body;
    return `<section class="igs-review-card${idle ? ' is-empty' : ''}" data-review-card="${esc(key)}">`
        + `<div class="igs-review-card-head"><span class="igs-review-card-title">${esc(title)}</span>${badge}${headerAction}${clear}${idle ? `<span class="igs-review-card-empty">${esc(empty)}</span>` : ''}</div>`
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
        hint: 'AI写了、角色还没登记的服装。归入已有服装后，下次就认得这个词。',
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
.igs-char-info-row.igs-char-height-row{margin-bottom:6px}
.igs-char-info-row.igs-char-height-row>.igs-asset-move{flex:0 0 76px;width:76px;cursor:text}
.igs-char-height-hint{flex:1;min-width:0;font-size:12px;line-height:1.4;color:var(--igs-settings-ink-3)}
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
.igs-outfit-tab-add{margin-left:auto;padding:0 9px;border:1px dashed var(--igs-settings-line-strong,rgba(128,128,128,.4));color:var(--igs-settings-ink-3);white-space:nowrap}
.igs-outfit-tab-add.igs-outfit-tab-mood{margin-left:0}
.igs-outfit-quick{display:inline-flex;align-items:center;gap:4px;margin-left:4px;padding-left:6px;border-left:1px solid var(--igs-settings-line)}
.igs-outfit-quick .igs-outfit-quick-btn{height:28px;padding:0 10px;background:var(--igs-settings-raised);border-radius:var(--igs-settings-radius-small);white-space:nowrap}
.igs-outfit-quick .igs-outfit-quick-btn:hover,.igs-outfit-quick .igs-outfit-quick-btn:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-outfit-tabs>.igs-row-menu>summary{height:28px}
/* 窄屏放不下一行时，生成按钮整组单独成第二行、等宽排开，不再半截折下去带着分隔线。 */
@media (max-width:640px){.igs-outfit-quick{order:10;flex:1 0 100%;margin:4px 0 0;padding:4px 0 0;border-left:0;border-top:1px solid var(--igs-settings-line)}.igs-outfit-quick .igs-outfit-quick-btn{flex:1 1 0;min-width:0}}
.igs-add-menu-item.is-danger{color:var(--igs-settings-danger)}
.igs-add-menu>.igs-add-menu-list{overflow-y:auto;overscroll-behavior:contain}
.igs-btn-mgr-list.is-menu-open{overflow:visible}
.igs-add-menu.is-up>.igs-add-menu-list{top:auto;bottom:calc(100% + 6px);transform-origin:bottom right}
.igs-add-menu.is-flip-x>.igs-add-menu-list{left:0;right:auto;transform-origin:top left}
.igs-add-menu.is-up.is-flip-x>.igs-add-menu-list{transform-origin:bottom left}
.igs-wardrobe-pick{flex:1;min-width:0}
.igs-wardrobe-pick>summary.igs-asset-move{display:flex;align-items:center;width:100%;gap:8px}
.igs-wardrobe-pick>summary.igs-asset-move::after{content:"";flex-shrink:0;width:6px;height:6px;margin-left:auto;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.55}
.igs-wardrobe-pick>.igs-add-menu-list,.igs-wardrobe-pick.is-flip-x>.igs-add-menu-list{left:0;right:auto;width:100%;min-width:100%;max-width:none;transform-origin:top left}
.igs-wardrobe-pick.is-up>.igs-add-menu-list,.igs-wardrobe-pick.is-up.is-flip-x>.igs-add-menu-list{transform-origin:bottom left}
.igs-add-menu-item.is-current{color:var(--igs-settings-ink);font-weight:600}
.igs-folder-pick-item{position:relative;gap:8px}
.igs-folder-pick-where{margin-left:auto;padding-left:12px;color:var(--igs-settings-ink-4)}
.igs-outfit-tab-count{min-width:16px;padding:0 4px;border-radius:8px;background:var(--igs-settings-highlight);color:var(--igs-settings-ink-3);font-size:10px;font-weight:500;line-height:16px;text-align:center}
.igs-outfit-tab.is-active .igs-outfit-tab-count{background:var(--igs-settings-field)}
.igs-outfit-panel{display:flex;flex-direction:column;gap:6px;min-width:0}
.igs-outfit-meta-toggle.is-open{background:var(--igs-settings-highlight);color:var(--igs-settings-ink)}
.igs-outfit-hint{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--igs-settings-ink-4)}
.igs-outfit-hint.is-stacked{display:flex;flex-direction:column;justify-content:center;line-height:1.4}
.igs-outfit-hint.is-stacked>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-outfit-status{color:var(--igs-settings-ink-3)}
.igs-outfit-slot.is-failed .igs-outfit-status{color:var(--igs-settings-danger)}
/* 窄屏上空格子的地址框让出位置，「借用谁」按原长显示。 */
@media (max-width:640px){.igs-outfit-slot.is-fallback>.igs-scene-url-input{flex:1 1 0;min-width:44px;margin-right:0}.igs-outfit-slot.is-fallback>.igs-outfit-hint{flex:0 1 auto}}
/* 没画出来的格子，「重新生成」就是下一步：任何宽度都露在行内，⋯ 里不再重复。 */
.igs-scene-char-group .igs-outfit-slot.is-failed .igs-slot-act{display:inline-flex}
.igs-scene-char-group .igs-outfit-slot.is-failed .igs-add-menu-list .igs-slot-act-menu{display:none}
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
.igs-outfit-slot .igs-scene-url-input{flex:0 1 160px;min-width:0;margin-right:auto}
.igs-outfit-acts{display:flex;align-items:center;gap:inherit;margin-left:auto;flex-shrink:0}
.igs-scene-mood-row .igs-scene-url-input{flex:0 1 160px}
.igs-outfit-tab-icon{color:var(--igs-settings-ink-4)}
.igs-asset-transfer.is-spacer{visibility:hidden;pointer-events:none}
.igs-add-menu-list .igs-slot-act-menu{display:none}
@media (max-width:420px){.igs-slot-act{display:none}.igs-add-menu-list .igs-slot-act-menu{display:flex}}
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
.igs-wardrobe-list{padding:0;background:transparent;border-radius:0}
/* 衣柜与角色缩略图同一种竖长条卡：参考图在上、名字和 ⋯ 在下。 */
.igs-wardrobe-list.is-tall{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:10px 8px}
.igs-wardrobe-list.is-tall>.igs-wardrobe-item>.igs-btn-mgr-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px;height:auto;padding:0;background:transparent}
.igs-wardrobe-list.is-tall .igs-outfit-thumb{grid-column:1/-1;width:100%;height:auto;aspect-ratio:9/20;object-fit:cover;object-position:50% 8%;border-radius:var(--igs-settings-radius-control)}
.igs-wardrobe-list.is-tall .igs-outfit-thumb-empty{padding:0}
.igs-wardrobe-list.is-tall .igs-wardrobe-name{font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.igs-wardrobe-list.is-tall>.igs-wardrobe-item>.igs-btn-mgr-row>:not(.igs-outfit-thumb):not(.igs-wardrobe-name):not(.igs-row-menu){grid-column:1/-1;justify-self:start}
.igs-wardrobe-list.is-tall .igs-wardrobe-item.is-focus .igs-outfit-thumb{outline:2px solid var(--igs-settings-accent);outline-offset:-2px}
button.igs-wardrobe-name{min-width:0;padding:0;border:0;background:transparent;text-align:left;cursor:pointer}
.igs-wardrobe-nsfw.is-on{color:var(--igs-settings-accent)}
.igs-wardrobe-item.is-focus>.igs-btn-mgr-row{background:var(--igs-settings-highlight)}
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
