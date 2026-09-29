import { esc } from './reader-value-utils.js';
import { resolveSpriteAsset } from '../../scene/asset-match.js';
import { OUTFIT_RESET } from '../../scene/character-outfits.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isImageUrl = (url) => /^(?:https?:\/\/|data:image\/|blob:)/i.test(String(url || '').trim());

const PERSON_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>';

function thumb(url, alt, extraClass = '') {
    const value = String(url || '').trim();
    if (isImageUrl(value)) {
        return `<img class="igs-outfit-thumb${extraClass}" src="${esc(value)}" loading="lazy" alt="${esc(alt)}" data-action="sprite-preview:${encSeg(value)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`;
    }
    return `<span class="igs-outfit-thumb igs-outfit-thumb-empty${extraClass}" aria-hidden="true">${value ? '生成' : PERSON_SVG}</span>`;
}

// 该服装缺这一格（或这一格没填图）时阅读器实际显示什么：借用服装内同组槽，或回落到原装。
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

function renderOutfitPanel(charName, name, entry, baseMoods, sceneAssets, icons) {
    const c = encSeg(charName);
    const o = encSeg(name);
    const moods = plain(entry.moods);
    const words = Array.isArray(entry.words) ? entry.words : [];
    const scenes = Array.isArray(entry.scenes) ? entry.scenes : [];
    const avatar = typeof entry.avatar === 'string' ? entry.avatar : '';
    const head = `<div class="igs-outfit-head"><code class="igs-outfit-syntax">[igs-char:${esc(charName)}|表情|${esc(name)}|对白]</code>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-outfit:${c}:${o}" title="重命名服装">${icons.pencil}</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-outfit-mood:${c}:${o}" title="添加情绪槽">+</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-outfit:${c}:${o}" title="删除服装">${icons.trash}</button></div>`;
    const meta = `<div class="igs-outfit-meta">`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">服装词</span>${chipList(words, `scene-remove-outfit-word:${c}:${o}`, `scene-add-outfit-word:${c}:${o}`, '只认服装名', '添加服装词（AI 写出或表格里出现该词即视为这套服装）')}</div>`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">适用场景</span>${chipList(scenes, `scene-remove-outfit-scene:${c}:${o}`, `scene-add-outfit-scene:${c}:${o}`, '不限', '添加适用场景（换到其他场景时，继承来的这套服装自动失效）')}</div>`
        + `<div class="igs-outfit-meta-row"><span class="igs-outfit-meta-label">状态栏头像</span>${thumb(avatar, `${name} 头像`, ' igs-outfit-avatar')}`
        + `<input class="igs-scene-url-input" data-scene-outfit-avatar-char="${esc(charName)}" data-scene-outfit-avatar="${esc(name)}" value="${esc(avatar)}" placeholder="留空沿用角色头像">`
        + (avatar ? `<button type="button" class="igs-btn-mgr-icon" data-action="scene-clear-outfit-avatar:${c}:${o}" title="清除服装头像">${icons.trash}</button>` : '')
        + `</div></div>`;
    const ownRows = Object.entries(moods).map(([mood, url]) => {
        const filled = Boolean(String(url || '').trim());
        const preview = filled ? null : previewOf(sceneAssets, charName, mood, name);
        return `<div class="igs-outfit-slot${filled ? '' : ' is-fallback'}" data-outfit-slot="${esc(mood)}">`
            + (filled ? thumb(url, mood) : thumb(preview.url, mood, ' is-ghost'))
            + `<span class="igs-btn-mgr-label">${esc(mood)}</span>`
            + `<input class="igs-scene-url-input" data-scene-outfit-char="${esc(charName)}" data-scene-outfit="${esc(name)}" data-scene-outfit-mood="${esc(mood)}" value="${esc(url || '')}" placeholder="URL 或 data:image/...">`
            + (filled ? '' : `<span class="igs-outfit-badge is-${preview.kind}">未填 · ${esc(preview.label)}</span>`)
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-outfit-mood:${c}:${o}:${encSeg(mood)}" title="重命名">${icons.pencil}</button>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-outfit-mood:${c}:${o}:${encSeg(mood)}" title="删除">${icons.trash}</button>`
            + `</div>`;
    }).join('');
    const missing = baseMoods.filter((mood) => mood !== OUTFIT_RESET && !Object.prototype.hasOwnProperty.call(moods, mood));
    const fallbackRows = missing.map((mood) => {
        const preview = previewOf(sceneAssets, charName, mood, name);
        return `<div class="igs-outfit-slot is-fallback" data-outfit-fallback="${esc(mood)}">${thumb(preview.url, mood, ' is-ghost')}`
            + `<span class="igs-btn-mgr-label">${esc(mood)}</span><span class="igs-outfit-badge is-${preview.kind}">${esc(preview.label)}</span>`
            + `<button type="button" class="igs-settings-action igs-outfit-fill" data-action="scene-add-outfit-mood:${c}:${o}:${encSeg(mood)}">补这一格</button></div>`;
    }).join('');
    const fallbackBlock = missing.length
        ? `<div class="igs-outfit-subhead">缺图时<span class="igs-outfit-muted">（阅读器会这样显示）</span><button type="button" class="igs-settings-action igs-outfit-fill" data-action="scene-outfit-copy-slots:${c}:${o}">按原装补齐 ${missing.length} 格</button></div>${fallbackRows}`
        : '';
    const own = ownRows || '<div class="igs-scene-empty">还没有这套服装的情绪槽。可点下方「补这一格」，或右上 + 自定义槽名</div>';
    return `<div class="igs-outfit-panel" data-outfit-panel="${esc(name)}">${head}${meta}<div class="igs-btn-mgr-list igs-outfit-slots">${own}</div>${fallbackBlock ? `<div class="igs-outfit-fallbacks">${fallbackBlock}</div>` : ''}</div>`;
}

// 角色卡的立绘区：「原装 · 服装…」标签切换。原装标签显示原有情绪槽；服装标签显示该服装的槽、词、场景、头像与缺图预览。
export function renderCharacterSlotTabs({ charName, baseMoods, baseListHtml, outfits, activeOutfit, sceneAssets, icons }) {
    const map = plain(outfits);
    const names = Object.keys(map);
    const active = names.includes(activeOutfit) ? activeOutfit : '';
    const c = encSeg(charName);
    const tab = (value, label, extra = '') => (
        `<button type="button" class="igs-outfit-tab${active === value ? ' is-active' : ''}" role="tab" aria-selected="${active === value ? 'true' : 'false'}" data-action="scene-outfit-tab:${c}:${encSeg(value)}">${label}${extra}</button>`
    );
    const tabs = [tab('', '原装')].concat(names.map((name) => {
        const moods = plain(map[name] && map[name].moods);
        const filled = Object.values(moods).filter((url) => String(url || '').trim()).length;
        return tab(name, esc(name), `<span class="igs-outfit-tab-count">${filled}</span>`);
    })).join('');
    const bar = `<div class="igs-outfit-tabs" role="tablist" data-outfit-tabs="${esc(charName)}">${tabs}`
        + `<button type="button" class="igs-outfit-tab igs-outfit-tab-add" data-action="scene-add-outfit:${c}" title="添加服装">＋ 服装</button></div>`;
    const panel = active
        ? renderOutfitPanel(charName, active, plain(map[active]), baseMoods, sceneAssets, icons)
        : baseListHtml;
    return `<div class="igs-outfit-area" data-outfit-area="${esc(charName)}">${bar}${panel}</div>`;
}

// 待确认服装词：AI 写了、但该角色没登记的服装名。可归入已有服装当服装词，或直接新建为服装。
export function renderOutfitReviewList(items, characterOutfits, characters) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';
    const chars = plain(characters);
    const outfitMap = plain(characterOutfits);
    const rows = list.map(({ character, word }) => {
        const c = encSeg(character);
        const w = encSeg(word);
        const known = Object.prototype.hasOwnProperty.call(chars, character);
        const assign = known
            ? Object.keys(plain(outfitMap[character])).map((name) => (
                `<button type="button" class="igs-settings-action" data-action="outfit-review-assign:${c}:${w}:${encSeg(name)}">归入「${esc(name)}」</button>`
            )).join('') + `<button type="button" class="igs-settings-action" data-action="outfit-review-create:${c}:${w}">新建为服装</button>`
            : '<span class="igs-source-filter-note">角色未登记立绘</span>';
        return `<div class="igs-btn-mgr-row igs-mood-review-row"><span class="igs-btn-mgr-label">${esc(word)}</span>`
            + `<span class="igs-source-filter-note">${esc(character)} · 未登记的服装，本句按原装显示</span>${assign}`
            + `<button type="button" class="igs-mood-word-del" data-action="outfit-review-dismiss:${c}:${w}" title="忽略">×</button></div>`;
    }).join('');
    const head = `<div class="igs-settings-section-head"><div class="igs-settings-subhead">待确认服装词</div><button type="button" class="igs-settings-action" data-action="outfit-review-clear">清空</button></div>`;
    return `<div class="igs-mood-review igs-outfit-review">${head}${rows}</div>`;
}

export const OUTFIT_SETTINGS_STYLE_TEXT = `
.igs-outfit-area{margin-top:8px;min-width:0}
.igs-outfit-tabs{display:flex;flex-wrap:wrap;gap:2px;padding:3px;margin:0 0 8px;background:var(--igs-settings-field);border-radius:var(--igs-settings-radius-control)}
.igs-outfit-tab{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border:0;background:transparent;color:var(--igs-settings-ink-3);border-radius:var(--igs-settings-radius-small);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color .14s,color .14s}
.igs-outfit-tab:hover,.igs-outfit-tab:focus-visible{background:var(--igs-settings-highlight);color:var(--igs-settings-ink);outline:none}
.igs-outfit-tab.is-active{background:var(--igs-settings-raised);color:var(--igs-settings-ink);font-weight:600}
.igs-outfit-tab-add{margin-left:auto;color:var(--igs-settings-ink-4)}
.igs-outfit-tab-count{min-width:16px;padding:0 4px;border-radius:8px;background:var(--igs-settings-highlight);color:var(--igs-settings-ink-3);font-size:10px;font-weight:500;line-height:16px;text-align:center}
.igs-outfit-tab.is-active .igs-outfit-tab-count{background:var(--igs-settings-field)}
.igs-outfit-panel{display:flex;flex-direction:column;gap:6px;min-width:0}
.igs-outfit-head{display:flex;align-items:center;gap:4px;min-width:0;padding:0 2px 0 4px}
.igs-outfit-syntax{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--igs-settings-ink-4);background:none;padding:0}
.igs-outfit-meta{display:flex;flex-direction:column;gap:6px;padding:2px 4px 4px}
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
`.trim();
