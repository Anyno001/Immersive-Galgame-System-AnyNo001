import { esc } from './reader-value-utils.js';
import { ensureStyleTag } from './reader-dom-utils.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { WORLDVIEWS, normalizeWorldview, worldSkinOf } from '../../scene/worldview.js';
import { resolveAssetScope } from '../../scene/asset-scope.js';
import { applySceneAudio } from './scene-audio.js';
import { applyDialogSkinAssets, normalizeDialogSkin } from './classic-dialog-skin.js';
import { syncDialogSkinStyle } from './dialog-skin-style.js';
import { getBattleTheme } from './fx-battle-themes.js';
import { DIALOG_SKIN_CHOICES, dialogSkinLabel, getDialogSkinChoices } from './dialog-skin-catalog.js';
import { dlcBorrowSkin, dlcSkinVersion, getDlcSkin, listDlcSkins } from './dlc-skin-registry.js';
import { pickWorldviewDialogSkin, worldviewDialogSkins } from './worldview-skins.js';
import { getReferenceDialogTypography } from './dialog-theme-typography.js';
import { cachedCoverPalette, coverPaletteOf, inkFor } from './title-cover-color.js';
import { WX_BAR, WX_HSTROKE, WX_RUBBING, WX_SEAL_MASK_SMALL, WX_SLASH, maskOf, wxEdge } from './wuxia-ink-svg.js';
import { WUXIA_MOON } from './dialog-theme-wuxia.js';
import { MAGIC_SPARKLE_MASK } from './dialog-theme-css-skins.js';

// 第 0 层的主界面：阅读器停在开场白第一页时先盖一层标题画面（开始 / 继续 / 世界风格 / 设置 / 生成主角立绘），
// 点开始直接过开场标题卡再演出第 0 层；世界风格页只负责保存选择。
// 画面只读快照与传入的回调，不碰存档；外观按皮肤取过场标题卡同一份主题（字体、墨色、底纱、卡片底）。
export const TITLE_SCREEN_ID = 'igs-title-screen';
export const TITLE_SKIN_ATTR = 'data-igs-title-skin';
const STYLE_ID = 'igs-title-screen-style';
const OPENING_CARD_MS = 2200;
// 水墨武侠开场：朱砂印 1.76s 起钤、2.08s 落定，再留约 1.5s 才随卡淡出，不让印没看清就跳走。
const WUXIA_OPENING_CARD_MS = 3600;

// 世界观名录旁的英文小字，没有立绘时也作背景右侧的大号描边字。
const WORLD_EN = Object.freeze({ modern: 'MODERN', ancient: 'ANCIENT', fantasy: 'FANTASY', scifi: 'SCI-FI', apocalypse: 'WASTELAND', taisho: 'TAISHO', magic: 'MAGIC', horror: 'HORROR' });

const handlersByLayer = new WeakMap();
const htmlByLayer = new WeakMap();

// 第 0 层、第一页、不是从末尾打开、设置没关时才拦。
export function shouldGateTitleScreen({ readerSettings, messageId, index, startAtEnd } = {}) {
    if (!readerSettings || readerSettings.titleScreen === false || startAtEnd === true) return false;
    if (messageId == null || messageId === '' || Number(messageId) !== 0) return false;
    return Number(index) === 0;
}

// resume：重开酒馆后的续读入口（{ label: '18 楼 · 第 74 页' }），菜单只留继续 / 最新一层 / 设置。
export function createTitleGate({ coverTurn = 0, resume = null } = {}) {
    return { view: 'menu', hasLater: resume ? true : null, pick: null, busy: false, coverTurn, resume: resume && resume.label ? { label: String(resume.label) } : null };
}

const COVER_TURN_KEY = 'igs:title-cover-turn';

// 封面轮换序号：每打开一次主界面进一格，存本机，刷新页面后接着轮。
export function nextTitleCoverTurn(storage) {
    try {
        const next = (Number(storage.getItem(COVER_TURN_KEY)) || 0) + 1;
        storage.setItem(COVER_TURN_KEY, String(next % 1000));
        return next;
    } catch (error) {
        return 0;
    }
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 标题用角色卡名（群聊用群名）；头像给背景兜底用。
export function titleCardOf(ctx) {
    const scope = resolveAssetScope(ctx);
    const characters = ctx && Array.isArray(ctx.characters) ? ctx.characters : [];
    const card = ctx && ctx.characterId != null ? characters[ctx.characterId] : null;
    const avatar = card && card.avatar ? String(card.avatar).trim() : '';
    return {
        name: scope.kind === 'global' ? '' : scope.label,
        avatarUrl: avatar && scope.kind === 'card' ? `/characters/${encodeURIComponent(avatar)}` : '',
    };
}

// 主界面按钮 → 新的界面状态，以及要阅读器去做的事：start / continue / settings / close / save / save-start / user-char。
export function reduceTitleAction(gate, model, act, value) {
    const base = { ...(gate || createTitleGate()) };
    const pickFor = (id) => pickWorldviewDialogSkin(id, { cardSkin: model.cardSkin, globalSkin: model.globalSkin, horrorStyle: model.horrorStyle });
    switch (act) {
        case 'start':
            return { gate: base, effect: 'start' };
        case 'continue':
        case 'latest':
        case 'settings':
        case 'close':
        case 'user-char':
            return { gate: base, effect: act };
        case 'worldview':
            return { gate: { ...base, view: 'worldview', pick: null } };
        case 'back':
            return { gate: { ...base, view: 'menu', pick: null } };
        case 'world': {
            const id = normalizeWorldview(value);
            return { gate: { ...base, pick: { worldview: id, skin: pickFor(id) } } };
        }
        case 'skin':
            return { gate: { ...base, pick: { worldview: model.pick.worldview, skin: normalizeDialogSkin(value) } } };
        case 'confirm':
            return { gate: base, effect: 'save', pick: { ...model.pick } };
        default:
            return { gate: base };
    }
}

// 开着配乐时主界面就按所选世界观的曲包放一首；正文开演后由同一个 overlay 的配乐状态接着走。
export function playTitleBgm(overlay, snapshot) {
    const readerSettings = plain(snapshot && snapshot.readerSettings);
    const content = plain(snapshot && snapshot.content);
    return applySceneAudio(overlay, {
        master: readerSettings.audioMaster,
        bgm: readerSettings.bgm,
        ambient: { enabled: false },
        context: { location: content.sceneLocation, time: content.sceneTime, worldview: readerSettings._worldview, pageKey: 'title' },
        active: true,
    });
}

// 主界面要画的东西全在这里算好；renderTitleScreen 只拼 HTML。
// userName：酒馆当前用户名。有名字时主菜单「设置」下多一个「生成主角立绘」，开局前就能按用户设定画好主角。
// cgCovers：0 楼已有的 CG 地址，和封面一起按 gate.coverTurn 轮换。
export function buildTitleScreenModel({ snapshot, gate, card = {}, globalSkin, resolveUrl, userName = '', cgCovers = [] } = {}) {
    const readerSettings = plain(snapshot && snapshot.readerSettings);
    const content = plain(snapshot && snapshot.content);
    const sceneAssets = plain(readerSettings._sceneAssets);
    const resolve = typeof resolveUrl === 'function' ? resolveUrl : (url) => String(url || '').trim();
    const title = String(card.name || '').trim();
    const worldview = normalizeWorldview(readerSettings._worldview);
    const cardSkin = typeof sceneAssets.dialogSkin === 'string' ? sceneAssets.dialogSkin : '';
    const skin = normalizeDialogSkin(readerSettings.dialogSkin);
    const state = gate || createTitleGate();
    const pick = state.pick || { worldview, skin: cardSkin ? skin : pickWorldviewDialogSkin(worldview, { cardSkin, globalSkin, horrorStyle: sceneAssets.horrorStyle }) };
    // 主图用角色卡封面（群聊等没有封面时退到第一页场景背景）；0 楼出过 CG 时每次打开轮到下一张。
    const covers = [...new Set([String(card.avatarUrl || '') || (content.backgroundImage ? resolve(content.backgroundImage) : ''), ...cgCovers.map((url) => String(url || '').trim())].filter(Boolean))];
    const cover = covers.length ? covers[Math.abs(Math.trunc(Number(state.coverTurn) || 0)) % covers.length] : '';
    return {
        view: state.view === 'worldview' ? 'worldview' : 'menu',
        title: title || '序章',
        cover,
        worldview,
        skin,
        hasLater: state.hasLater === true,
        busy: state.busy === true,
        newChat: state.hasLater === false,
        pick: { worldview: normalizeWorldview(pick.worldview), skin: normalizeDialogSkin(pick.skin) },
        cardSkin,
        globalSkin: String(globalSkin || ''),
        horrorStyle: sceneAssets.horrorStyle,
        userName: String(userName || '').trim(),
        resume: state.resume || null,
    };
}

function worldLabel(id) {
    const hit = WORLDVIEWS.find((item) => item.id === id);
    return hit ? hit.label : '现代';
}

function worldCode(id) {
    const index = WORLDVIEWS.findIndex((item) => item.id === id);
    return 'WV-' + String(Math.max(0, index) + 1).padStart(2, '0');
}

// 标题按显示宽度分档：中文记 1、西文记 0.55，越长字越小，最长一档允许折两行。
function titleSize(title) {
    const width = Array.from(String(title || '')).reduce((sum, ch) => sum + (ch.charCodeAt(0) < 0x250 ? 0.55 : 1), 0);
    return width <= 4 ? 'xl' : width <= 8 ? 'l' : width <= 13 ? 'm' : 's';
}

// 标题做成字标：首字放大领起、末个实字收尾，虚词缩小上提，标点缩小居中，其余字轻微起伏；英文与版本号连写成一段。具体形变由各调性 CSS 决定。
const TITLE_MINOR = /^[的了又之与和及也着过吗呢吧啊么而其乃于以の]$/;
const TITLE_PUNCT = /^[・·，、。！？!?…：:—~～「」『』《》()（）【】\-]$/;
function titleGlyphsHtml(title) {
    const parts = String(title || '').match(/[A-Za-z0-9][A-Za-z0-9'’.\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’.\-]*)*|\s+|[\s\S]/gu) || [];
    const solid = (p) => p.trim() && !TITLE_MINOR.test(p) && !TITLE_PUNCT.test(p) && !/^[A-Za-z0-9]/.test(p);
    const last = parts.findLastIndex(solid);
    let lead = -1;
    let beat = 0;
    return parts.map((part, i) => {
        if (!part.trim()) return ' ';
        let kind;
        if (/^[A-Za-z0-9]/.test(part)) kind = 'is-latin';
        else if (TITLE_PUNCT.test(part)) kind = 'is-punct';
        else if (TITLE_MINOR.test(part)) kind = 'is-minor';
        else if (lead < 0) { lead = i; kind = 'is-lead'; }
        else if (i === last && parts.filter(solid).length > 2) kind = 'is-tail';
        else kind = beat++ === 0 ? 'is-dip' : beat % 2 ? 'is-rise' : 'is-flat';
        return `<span class="igs-ts-g ${kind}">${esc(part)}</span>`;
    }).join('');
}

// 封面地址可能是很长的 data URL：HTML 里只放占位，地址由 syncMedia 直接写到元素上。
const COVER_IMG = '<img class="igs-ts-cover-img" alt="" decoding="async">';
const PHASE_ATTR = 'data-igs-ts-phase';
const TONE_ATTR = 'data-igs-ts-tone';
const WORLD_ATTR = 'data-igs-ts-world';
// 主界面调性：先看对话框风格，没有专属调性再看世界观；DLC 皮肤按所借的内置皮肤算。
const SKIN_TONES = Object.freeze({
    'scifi-holo': 'tech', 'wasteland-rust': 'tech',
    'plant-coffee': 'soft', 'warm-picturebook': 'soft', 'fairy-tale': 'soft', 'cute-pink': 'soft', 'day-minimal': 'soft',
    'qinglv-shanshui': 'ink', 'xianxia-ink': 'ink', 'wuxia-ink': 'ink', 'retro-japanese': 'classic',
    'western-classic': 'mystic', 'elegant-european': 'mystic', 'magic-academy': 'mystic', 'mermaid-deep': 'mystic', 'adventure-journey': 'mystic',
    'horror-gore': 'dark', 'horror-psych': 'dark',
});
const WORLD_TONES = Object.freeze({ scifi: 'tech', apocalypse: 'tech', ancient: 'ink', taisho: 'classic', fantasy: 'mystic', magic: 'mystic', horror: 'dark' });

export function titleTone(skin, worldview) {
    const own = SKIN_TONES[skin] || (getDlcSkin(skin) ? SKIN_TONES[dlcBorrowSkin(skin)] : '');
    return own || WORLD_TONES[normalizeWorldview(worldview)] || 'modern';
}
const INTRO_MS = 1100;
const COVER_WAIT_MS = 1500;
const PALETTE_VARS = Object.freeze([['--igs-ts-cblock', 'block'], ['--igs-ts-cdeep', 'deep'], ['--igs-ts-cink', 'ink'], ['--igs-ts-cmuted', 'muted'], ['--igs-ts-cmink', 'mutedInk']]);

function coverHtml(model) {
    if (!model.cover) return '<div class="igs-ts-cover is-empty" aria-hidden="true"><span class="igs-ts-cover-mono">IGS</span></div>';
    return `<div class="igs-ts-cover" aria-hidden="true">${COVER_IMG}</div><div class="igs-ts-sliver" aria-hidden="true">${COVER_IMG}</div>`;
}

function later(layer, fn, ms) {
    const win = layer.ownerDocument && layer.ownerDocument.defaultView;
    (win || globalThis).setTimeout(fn, ms);
}

// 进场只播一次：封面与配色就绪再切入，之后重绘（如「继续」晚到）不重播。
function startIntro(layer) {
    if (layer.getAttribute(PHASE_ATTR) !== 'wait') return;
    layer.setAttribute(PHASE_ATTR, 'intro');
    later(layer, () => layer.setAttribute(PHASE_ATTR, 'idle'), INTRO_MS);
}

function applyPalette(layer, palette) {
    for (const [name, key] of PALETTE_VARS) {
        if (palette) layer.style.setProperty(name, palette[key]);
        else layer.style.removeProperty(name);
    }
}

function syncMedia(layer, model) {
    const url = model.cover;
    const imgs = layer.querySelectorAll('.igs-ts-cover-img');
    for (const img of imgs) if (img.getAttribute('src') !== url) img.setAttribute('src', url);
    const first = imgs[0];
    if (!url || !first) {
        applyPalette(layer, null);
        startIntro(layer);
        return;
    }
    const cached = cachedCoverPalette(url);
    if (cached.hit) {
        applyPalette(layer, cached.palette);
        startIntro(layer);
        return;
    }
    const ready = () => {
        if (first.getAttribute('src') !== url) return;
        applyPalette(layer, coverPaletteOf(first, url));
        startIntro(layer);
    };
    if (first.complete && first.naturalWidth) ready();
    else {
        first.addEventListener('load', ready, { once: true });
        first.addEventListener('error', () => startIntro(layer), { once: true });
        later(layer, () => startIntro(layer), COVER_WAIT_MS);
    }
}

const MENU_EN = Object.freeze({ start: 'START', replay: 'REPLAY', continue: 'CONTINUE', worldview: 'WORLD', settings: 'CONFIG', 'user-char': 'OPERATOR', latest: 'LATEST' });

function menuHtml(model) {
    const replay = !model.newChat && model.hasLater;
    const items = (model.resume ? [
        ['continue', '继续', model.resume.label],
        ['latest', '最新一层', MENU_EN.latest],
        ['settings', '设置', MENU_EN.settings],
    ] : [
        ['start', replay ? '从头重播' : '开始', replay ? MENU_EN.replay : MENU_EN.start],
        model.hasLater ? ['continue', '继续', MENU_EN.continue] : null,
        ['worldview', '世界风格', MENU_EN.worldview],
        ['settings', '设置', MENU_EN.settings],
        model.userName ? ['user-char', '生成主角立绘', MENU_EN['user-char']] : null,
    ]).filter(Boolean).map(([act, label, en], i) => `<button type="button" class="igs-ts-btn${i === 0 ? ' is-primary' : ''}" data-ts-act="${act}"${model.busy ? ' disabled' : ''}>`
        + `<span class="igs-ts-no">${String(i + 1).padStart(2, '0')}</span><span class="igs-ts-zh">${esc(label)}</span><span class="igs-ts-btn-en">${en}</span></button>`).join('');
    return `<div class="igs-ts-base"></div>${coverHtml(model)}<div class="igs-ts-edge" aria-hidden="true"></div>${ARC_HTML}
<div class="igs-ts-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="igs-ts-topbar" aria-hidden="true"><span class="igs-ts-mono">IGS</span><span class="igs-ts-code">Immersive Galgame System</span><span class="igs-ts-code is-dim">// Main Menu</span></div>
<button type="button" class="igs-ts-close" data-ts-act="close" aria-label="关闭阅读器">×</button>
<div class="igs-ts-slab">
  <div class="igs-ts-script" aria-hidden="true">Immersive Galgame System</div>
  <div class="igs-ts-dots" aria-hidden="true"></div>
  <div class="igs-ts-chip" aria-hidden="true"></div>
  <div class="igs-ts-slab-mark" aria-hidden="true">${esc(WORLD_EN[model.worldview] || '')}</div>
  <div class="igs-ts-tag"><span class="igs-ts-en">${worldCode(model.worldview)} ${esc(WORLD_EN[model.worldview] || '')}</span><span>${esc(worldLabel(model.worldview))} · ${esc(dialogSkinLabel(model.skin))}</span></div>
  <div class="igs-ts-title" data-size="${titleSize(model.title)}">${titleGlyphsHtml(model.title)}<span class="igs-ts-title-seal" aria-hidden="true">${esc(Array.from(model.title)[0] || '')}</span></div>
</div>
<nav class="igs-ts-menu" aria-label="主界面">${items}</nav>
<div class="igs-ts-foot" aria-hidden="true"><span class="igs-ts-barcode"></span><span class="igs-ts-code">Prologue · N°000</span><span class="igs-ts-hazard"></span></div>`;
}

// 预览直接用真对话框：同一套 .igs-dialog 结构与皮肤样式压在开场背景上，所见即开场后的样子。
function previewDialogHtml(skin, name) {
    const type = getReferenceDialogTypography(skin) || {};
    const css = (font, color) => [font ? 'font-family:' + font : '', color ? 'color:' + color : ''].filter(Boolean).join(';');
    return '<div class="igs-ts-stage"><div class="igs-dialog igs-ts-preview" data-igs-dialog-skin="' + esc(skin) + '" data-igs-has-speaker="1" aria-hidden="true">'
        + '<div class="igs-speaker" style="display:block;' + esc(css(type.nameFont, type.nameColor)) + '">' + esc(name) + '</div>'
        + '<div class="igs-text" style="' + esc(css(type.textFont, type.textColor)) + '">……就从这里开始吧。</div></div></div>';
}

// 世界观页：不铺面板，左侧竖排世界观名录，选中那一项下面一行列出可用的对话框；底部就是所选皮肤的真对话框。
function worldviewHtml(model) {
    const name = model.title === '序章' ? '旁白' : model.title;
    const recommended = worldviewDialogSkins(model.pick.worldview);
    const others = getDialogSkinChoices(model.pick.skin).filter(([skin]) => !recommended.includes(skin));
    const otherOn = !recommended.includes(model.pick.skin);
    const skinButtons = recommended.map((skin) => {
        const on = skin === model.pick.skin;
        return '<button type="button" class="igs-ts-skin' + (on ? ' is-on' : '') + '" data-ts-act="skin:' + esc(skin) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(dialogSkinLabel(skin)) + '</button>';
    }).join('');
    const options = others.map(([skin, label]) => '<option value="' + esc(skin) + '"' + (skin === model.pick.skin ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
    const more = '<label class="igs-ts-skin igs-ts-more' + (otherOn ? ' is-on' : '') + '"><span>' + (otherOn ? esc(dialogSkinLabel(model.pick.skin)) : '其他') + '</span>'
        + '<select data-ts-skin-select aria-label="其他对话框风格"><option value=""' + (otherOn ? '' : ' selected') + '>其他</option>' + options + '</select></label>';
    const worlds = WORLDVIEWS.filter((item) => item.ready).map(({ id, label }) => {
        const on = id === model.pick.worldview;
        const skins = on ? '<div class="igs-ts-skins" role="group" aria-label="对话框">' + skinButtons + more + '</div>' : '';
        return '<li class="igs-ts-world' + (on ? ' is-on' : '') + '"><button type="button" class="igs-ts-world-name" data-ts-act="world:' + esc(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '"><span class="igs-ts-world-zh">' + esc(label) + '</span><span class="igs-ts-world-en">' + esc(WORLD_EN[id] || '') + '</span></button>' + skins + '</li>';
    }).join('');
    const disabled = model.busy ? ' disabled' : '';
    const backdrop = '<div class="igs-ts-base"></div>' + (model.cover ? '<div class="igs-ts-wv-bg" aria-hidden="true">' + COVER_IMG + '</div>' : '') + '<div class="igs-ts-wv-panel" aria-hidden="true"></div>';
    const mark = '<div class="igs-ts-mark" aria-hidden="true">' + esc(WORLD_EN[model.pick.worldview] || '') + '</div>';
    return backdrop + mark + '\n' + previewDialogHtml(model.pick.skin, name)
        + '\n<div class="igs-ts-pick" role="dialog" aria-label="选择世界风格"><ul class="igs-ts-worlds">' + worlds + '</ul></div>'
        + '\n<div class="igs-ts-actions">'
        + '<button type="button" class="igs-ts-link" data-ts-act="back"' + disabled + '>返回</button>'
        + '<button type="button" class="igs-ts-link is-primary" data-ts-act="confirm"' + disabled + '>保存<span aria-hidden="true">›</span></button></div>';
}

function dispatch(layer, act, value) {
    const handlers = handlersByLayer.get(layer);
    if (handlers && typeof handlers.onAction === 'function') handlers.onAction(act, value);
}

function ensureLayer(overlay) {
    let layer = overlay.querySelector(`#${TITLE_SCREEN_ID}`);
    if (layer) return layer;
    const doc = overlay.ownerDocument;
    layer = doc.createElement('div');
    layer.id = TITLE_SCREEN_ID;
    layer.className = 'igs-title-screen';
    layer.setAttribute(PHASE_ATTR, 'wait');
    // 主界面盖住整个阅读器：点击不往下传，免得点到底下的翻页层。
    layer.addEventListener('click', (event) => {
        event.stopPropagation();
        const button = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-ts-act]') : null;
        if (!button || button.disabled) {
            if (layer.getAttribute('data-igs-title-view') === 'opening') dispatch(layer, 'skip-opening');
            return;
        }
        const [act, ...rest] = String(button.getAttribute('data-ts-act') || '').split(':');
        dispatch(layer, act, rest.join(':'));
    });
    layer.addEventListener('change', (event) => {
        const select = event.target;
        if (!select || typeof select.hasAttribute !== 'function' || !select.hasAttribute('data-ts-skin-select')) return;
        if (select.value) dispatch(layer, 'skin', select.value);
    });
    overlay.appendChild(layer);
    return layer;
}

export function renderTitleScreen(overlay, model, handlers = {}) {
    if (!overlay || !model) return null;
    ensureStyleTag(overlay.ownerDocument, STYLE_ID, getTitleScreenStyleText());
    const layer = ensureLayer(overlay);
    handlersByLayer.set(layer, handlers);
    const view = model.view === 'worldview' ? 'worldview' : 'menu';
    const skin = view === 'worldview' ? model.pick.skin : model.skin;
    const html = view === 'worldview' ? worldviewHtml(model) : menuHtml(model);
    layer.setAttribute(TITLE_SKIN_ATTR, skin);
    layer.setAttribute('data-igs-title-view', view);
    const world = view === 'worldview' ? model.pick.worldview : model.worldview;
    layer.setAttribute(TONE_ATTR, titleTone(skin, world));
    layer.setAttribute(WORLD_ATTR, normalizeWorldview(world));
    if (htmlByLayer.get(layer) !== html) {
        layer.innerHTML = html;
        htmlByLayer.set(layer, html);
    }
    syncMedia(layer, model);
    return layer;
}

export function removeTitleScreen(overlay) {
    const layer = overlay && typeof overlay.querySelector === 'function' ? overlay.querySelector(`#${TITLE_SCREEN_ID}`) : null;
    if (!layer) return false;
    handlersByLayer.delete(layer);
    htmlByLayer.delete(layer);
    layer.remove();
    return true;
}

// 主界面画在阅读器 overlay 里：对话框皮肤标记与皮肤样式先挂上，过场标题卡的皮肤主题才认得出来。
export function applyTitleSkin(overlay, readerSettings) {
    if (!overlay) return;
    applyDialogSkinAssets(overlay, readerSettings);
    syncDialogSkinStyle(overlay, readerSettings);
}

// 开场标题卡：复用过场标题卡的类名，皮肤主题与古代竖幅自动生效；点一下或到时自动收起。
export function playOpeningCard(overlay, { main = '序章', sub = '', worldview = '', schedule } = {}) {
    const layer = overlay && typeof overlay.querySelector === 'function' ? overlay.querySelector(`#${TITLE_SCREEN_ID}`) : null;
    if (!layer) return Promise.resolve(false);
    const id = normalizeWorldview(worldview);
    const ancient = id === 'ancient';
    const worldSkin = !ancient && worldSkinOf(id) ? ` is-${id}` : '';
    const wuxia = typeof overlay.getAttribute === 'function' && overlay.getAttribute('data-igs-dialog-skin') === 'wuxia-ink';
    const life = prefersReducedMotion() ? 900 : (wuxia ? WUXIA_OPENING_CARD_MS : OPENING_CARD_MS);
    const subText = ancient ? String(sub || '').replace(/^——\s*/, '') : sub;
    layer.setAttribute('data-igs-title-view', 'opening');
    const html = `<div class="igs-ts-backdrop"></div><div class="${ancient ? 'igs-fx-title-card is-ancient' : 'igs-fx-title-card'}${worldSkin}" data-igs-seal="${esc(Array.from(String(main || ''))[0] || '')}" style="--igs-fx-life:${life}ms"><div class="igs-fx-title-main">${esc(main)}</div>${subText ? `<div class="igs-fx-title-sub">${esc(subText)}</div>` : ''}</div>`;
    layer.innerHTML = html;
    htmlByLayer.set(layer, html);
    const wait = typeof schedule === 'function' ? schedule : (fn, ms) => setTimeout(fn, ms);
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            handlersByLayer.delete(layer);
            resolve(true);
        };
        handlersByLayer.set(layer, { onAction: (act) => { if (act === 'skip-opening') finish(); } });
        wait(finish, life);
    });
}

const FALLBACK_THEME = Object.freeze({
    font: '',
    accent: '#ffd98a',
    vars: Object.freeze({ veil: 'rgba(10,12,20,.58)', rule: 'rgba(255,255,255,.3)', ink: '#fff', halo: '0 1px 3px rgba(0,0,0,.85)', 'title-halo': '0 2px 14px rgba(0,0,0,.7)' }),
});

function themeRules(skin) {
    // DLC 皮肤借内置那套的字体与纱色，主色用作者给的 accent。
    const dlc = getDlcSkin(skin);
    const borrowed = getBattleTheme(skin) || (dlc && getBattleTheme(dlcBorrowSkin(skin))) || FALLBACK_THEME;
    const theme = dlc && dlc.accent ? { ...borrowed, accent: dlc.accent } : borrowed;
    const v = theme.vars || {};
    const scope = `[${TITLE_SKIN_ATTR}="${skin}"]`;
    const veil = v.veil || v.wipe || FALLBACK_THEME.vars.veil;
    const rule = v.rule && v.rule !== 'transparent' ? v.rule : 'rgba(255,255,255,.22)';
    const vars = [
        theme.font ? `--igs-ts-font:${theme.font};` : '',
        `--igs-ts-accent-ink:${inkFor(theme.accent) || '#101014'};`,
        `--igs-ts-ink:${v.ink || '#fff'};`,
        `--igs-ts-halo:${v.halo || 'none'};`,
        `--igs-ts-title-halo:${v['title-halo'] || v.halo || 'none'};`,
        `--igs-ts-veil:${veil};`,
        `--igs-ts-rule:${rule};`,
        `--igs-ts-accent:${theme.accent || FALLBACK_THEME.accent};`,
    ].join('');
    const rules = [`${scope}{${vars}}`];
    return rules.join('\n');
}

// 条形码：按 IGS 三个字母的二进制位画粗细条，所有卡一致。
const BARCODE = (() => {
    const stops = [];
    let x = 0;
    for (const bit of Array.from('IGS', (ch) => ch.charCodeAt(0).toString(2).padStart(8, '0')).join('')) {
        const w = bit === '1' ? 3 : 1;
        stops.push(`currentColor ${x}px ${x + w}px`, `transparent ${x + w}px ${x + w + 2}px`);
        x += w + 2;
    }
    return { image: `linear-gradient(90deg,${stops.join(',')})`, width: x };
})();

// 点线面：一道弧线从封面穿到色块底下再冒出来，线上落几颗色点，切线旁再压一只细圆环。
// 弧线画在 0–1000 的拉伸坐标里，点按同一条贝塞尔曲线算百分比位置，拉伸后仍落在线上。宽屏与竖屏各一条。
const ARCS = Object.freeze({
    wide: [[[-20, 760], [180, 560], [420, 520], [560, 640]], [[560, 640], [700, 760], [860, 980], [1020, 900]]],
    tall: [[[-20, 420], [180, 330], [320, 500], [520, 430]], [[520, 430], [720, 360], [880, 300], [1020, 380]]],
});
const ARC_DOTS = Object.freeze([[0, 0.34], [0, 0.72], [1, 0.62]]);

function arcPoint([p0, p1, p2, p3], t) {
    const u = 1 - t;
    const at = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
    return [at(0) / 10, at(1) / 10];
}

const arcPath = (segs) => `M${segs[0][0].join(' ')} ` + segs.map((seg) => `C${seg.slice(1).map((p) => p.join(' ')).join(' ')}`).join(' ');
const ARC_HTML = '<svg class="igs-ts-arc" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">'
    + Object.entries(ARCS).map(([kind, segs]) => `<path class="is-${kind}" d="${arcPath(segs)}"/>`).join('') + '</svg>'
    + Object.keys(ARCS).map((kind) => ARC_DOTS.map((_, i) => `<i class="igs-ts-dot is-${kind} is-d${i}" aria-hidden="true"></i>`).join('')).join('')
    + '<i class="igs-ts-ring" aria-hidden="true"></i>';
const ARC_DOT_STYLE = Object.entries(ARCS).map(([kind, segs]) => ARC_DOTS.map(([seg, t], i) => {
    const [x, y] = arcPoint(segs[seg], t);
    return `.igs-ts-dot.is-${kind}.is-d${i}{left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;}`;
}).join('')).join('\n');

// 奇幻调性的色块不走硬斜边：竖屏上下两边是缓波，宽屏左缘是一道微弓的弧。
const svgMask = (d) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${d}' fill='#fff'/></svg>`)}")`;
const WAVE_BAND = svgMask('M0 10 C22 2 42 16 66 8 C82 3 94 2 100 6 L100 90 C84 98 64 86 40 94 C22 100 8 98 0 92 Z');
const BOW_SIDE = svgMask('M14 0 L100 0 L100 100 L0 100 C3 68 6 34 14 0 Z');
const S = `#${TITLE_SCREEN_ID}`;
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const BASE_STYLE = `
${S}{position:absolute;inset:0;z-index:36;overflow:hidden;color:#fff;font-family:var(--igs-ts-font,inherit);container-type:size;-webkit-tap-highlight-color:transparent;
  --igs-ts-block:var(--igs-ts-cblock,var(--igs-ts-accent,#ffd98a));--igs-ts-deep:var(--igs-ts-cdeep,#0c0d11);--igs-ts-on-block:var(--igs-ts-cink,var(--igs-ts-accent-ink,#101014));
  --igs-ts-en:"IGS Oswald","Oswald","Bahnschrift","Arial Narrow",sans-serif;--igs-ts-zh:"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Source Han Sans CN","Noto Sans SC",sans-serif;--igs-ts-script:"Pinyon Script","Great Vibes",cursive;
  --igs-ts-cw:56cqw;--igs-ts-angle:10deg;--igs-ts-pangle:7deg;--igs-ts-cut:calc(100cqh * tan(var(--igs-ts-angle)));--igs-ts-line:rgba(255,255,255,.07);
  --igs-ts-title-font:"Smiley Sans",var(--igs-ts-zh);--igs-ts-title-weight:400;--igs-ts-menu-font:"Smiley Sans",var(--igs-ts-zh);--igs-ts-menu-weight:400;--igs-ts-radius:0px;}
${S} *{box-sizing:border-box;}
.igs-ts-base{position:absolute;inset:0;background-color:var(--igs-ts-deep);background-image:linear-gradient(var(--igs-ts-line) 1px,transparent 1px),linear-gradient(90deg,var(--igs-ts-line) 1px,transparent 1px);background-size:44px 44px;background-position:-1px -1px;transition:background-color .4s ease;}
.igs-ts-base::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 90% 80% at 80% 40%,transparent 30%,var(--igs-ts-deep) 100%);opacity:.85;}
.igs-ts-cover{position:absolute;left:0;top:0;bottom:0;width:var(--igs-ts-cw);overflow:hidden;background:var(--igs-ts-deep);clip-path:polygon(0 0,100% 0,calc(100% - var(--igs-ts-cut)) 100%,0 100%);}
.igs-ts-cover-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:50% 22%;}
.igs-ts-cover.is-empty{display:flex;align-items:center;justify-content:center;background:linear-gradient(150deg,color-mix(in srgb,var(--igs-ts-block) 34%,var(--igs-ts-deep)),var(--igs-ts-deep) 75%);}
.igs-ts-cover-mono{font-family:var(--igs-ts-script);font-size:min(46cqh,30cqw);line-height:1;color:var(--igs-ts-block);opacity:.55;transform:translateX(-6%);}
.igs-ts-sliver{position:absolute;top:0;bottom:0;left:calc(var(--igs-ts-cw) - var(--igs-ts-cut) + 1.4cqw);width:calc(var(--igs-ts-cut) + 3.4cqw);overflow:hidden;opacity:.5;clip-path:polygon(var(--igs-ts-cut) 0,100% 0,calc(100% - var(--igs-ts-cut)) 100%,0 100%);}
.igs-ts-sliver .igs-ts-cover-img{object-position:50% 62%;filter:grayscale(1) contrast(1.35);-webkit-mask:radial-gradient(circle,#000 40%,transparent 46%) 0 0/4px 4px;mask:radial-gradient(circle,#000 40%,transparent 46%) 0 0/4px 4px;}
.igs-ts-edge{position:absolute;top:0;bottom:0;left:calc(var(--igs-ts-cw) - var(--igs-ts-cut));width:calc(var(--igs-ts-cut) + 4px);background:var(--igs-ts-block);clip-path:polygon(var(--igs-ts-cut) 0,100% 0,calc(100% - var(--igs-ts-cut)) 100%,0 100%);}
.igs-ts-corners{position:absolute;inset:max(12px,2.2cqmin);pointer-events:none;}
.igs-ts-corners i{position:absolute;width:14px;height:14px;border:0 solid rgba(255,255,255,.55);}
.igs-ts-corners i:nth-child(1){left:0;top:0;border-width:1px 0 0 1px;}
.igs-ts-corners i:nth-child(2){display:none;}
.igs-ts-corners i:nth-child(3){left:0;bottom:0;border-width:0 0 1px 1px;}
.igs-ts-corners i:nth-child(4){right:0;bottom:0;border-width:0 1px 1px 0;}
.igs-ts-topbar{position:absolute;left:calc(var(--igs-ts-cw) + 6cqw);top:max(20px,5cqh);display:flex;align-items:baseline;gap:12px;white-space:nowrap;pointer-events:none;}
.igs-ts-mono{font-family:"Great Vibes",var(--igs-ts-script);font-size:32px;line-height:1;color:var(--igs-ts-block);}
.igs-ts-code{font-family:var(--igs-ts-en);font-size:11px;font-weight:400;letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.72);}
.igs-ts-code.is-dim{color:rgba(255,255,255,.4);}
.igs-ts-close{appearance:none;position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:max(14px,env(safe-area-inset-top,0px));z-index:4;width:38px;height:38px;padding:0;border:1px solid rgba(255,255,255,.3);border-radius:0;background:rgba(0,0,0,.2);color:#fff;font-family:var(--igs-ts-en);font-size:22px;font-weight:300;line-height:36px;cursor:pointer;opacity:.75;transition:opacity .2s ease,background-color .2s ease,color .2s ease;}
.igs-ts-close:hover,.igs-ts-close:focus-visible{opacity:1;outline:none;background:var(--igs-ts-block);color:var(--igs-ts-on-block);border-color:var(--igs-ts-block);}
.igs-ts-slab{position:absolute;left:30cqw;right:0;bottom:16cqh;z-index:2;isolation:isolate;padding:2.6cqh 6cqw 3cqh 8cqw;color:var(--igs-ts-on-block);}
.igs-ts-slab::before{content:"";position:absolute;inset:0 -14cqw 0 0;z-index:-1;border-radius:var(--igs-ts-radius);background:var(--igs-ts-block);transform:skewX(calc(-1 * var(--igs-ts-angle)));transform-origin:0 100%;}
.igs-ts-slab::after{content:"";position:absolute;right:4cqw;bottom:1.4cqh;width:72px;height:6px;background:repeating-linear-gradient(-45deg,currentColor 0 3px,transparent 3px 7px);opacity:.35;}
.igs-ts-script{position:absolute;left:-27cqw;bottom:calc(100% - .16em);font-family:var(--igs-ts-script);font-size:clamp(34px,8.4cqh,104px);font-weight:400;line-height:1.1;color:#fff;white-space:nowrap;text-shadow:0 2px 16px rgba(0,0,0,.45);opacity:.78;pointer-events:none;}
.igs-ts-slab-mark{position:absolute;right:5cqw;top:50%;z-index:-1;transform:translateY(-50%);font-family:var(--igs-ts-en);font-size:min(15cqh,9cqw);font-weight:700;line-height:1;letter-spacing:.02em;color:transparent;-webkit-text-stroke:1.5px currentColor;opacity:.3;white-space:nowrap;pointer-events:none;}
.igs-ts-tag{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 14px;margin-bottom:.8cqh;font-family:var(--igs-ts-menu-font);font-size:clamp(12px,1.9cqh,15px);font-weight:600;letter-spacing:.2em;opacity:.85;}
.igs-ts-en{font-family:var(--igs-ts-en);font-weight:600;letter-spacing:.24em;}
.igs-ts-title{--igs-ts-title-size:min(11cqh,7.4cqw);font-family:var(--igs-ts-title-font);font-size:var(--igs-ts-title-size);font-weight:var(--igs-ts-title-weight);line-height:1.1;letter-spacing:.04em;font-synthesis:none;overflow-wrap:anywhere;text-wrap:balance;}
.igs-ts-title[data-size="xl"]{--igs-ts-title-size:min(15cqh,10cqw);letter-spacing:.1em;}
.igs-ts-title[data-size="m"]{--igs-ts-title-size:min(8cqh,5cqw);}
.igs-ts-title[data-size="s"]{--igs-ts-title-size:min(6cqh,3.6cqw);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
.igs-ts-menu{position:absolute;left:calc(var(--igs-ts-cw) + 6cqw);right:max(5cqw,env(safe-area-inset-right,0px));top:15cqh;display:flex;flex-direction:column;}
.igs-ts-btn{appearance:none;position:relative;isolation:isolate;display:grid;grid-template-columns:2.6em auto 1fr;align-items:baseline;align-content:center;gap:0 14px;min-height:max(44px,8.2cqh);padding:0 16px 0 12px;border:0;border-bottom:1px solid var(--igs-ts-line);background:none;color:#fff;font:inherit;text-align:left;cursor:pointer;transition:color .2s ease;}
.igs-ts-btn::before{content:"";position:absolute;inset:0 -6px 0 0;z-index:-1;border-radius:var(--igs-ts-radius);background:var(--igs-ts-block);transform:skewX(calc(-1 * var(--igs-ts-angle))) scaleX(0);transform-origin:0 50%;transition:transform .26s ${EASE};}
.igs-ts-no{font-family:var(--igs-ts-en);font-size:13px;font-weight:500;letter-spacing:.08em;color:var(--igs-ts-block);transition:color .2s ease;}
.igs-ts-zh{font-family:var(--igs-ts-menu-font);font-size:clamp(18px,3.4cqh,26px);font-weight:var(--igs-ts-menu-weight);font-synthesis:none;letter-spacing:.18em;white-space:nowrap;}
.igs-ts-btn-en{justify-self:end;margin-right:-.3em;font-family:var(--igs-ts-en);font-size:12px;font-weight:300;letter-spacing:.3em;opacity:.5;white-space:nowrap;transition:font-weight .26s ease,opacity .2s ease;}
.igs-ts-btn.is-primary .igs-ts-zh{font-size:clamp(21px,4.2cqh,32px);}
.igs-ts-btn.is-primary .igs-ts-btn-en{color:var(--igs-ts-block);opacity:1;font-weight:500;}
.igs-ts-btn:focus-visible,.igs-ts-btn:active:not(:disabled){outline:none;color:var(--igs-ts-on-block);}
.igs-ts-btn:focus-visible::before,.igs-ts-btn:active:not(:disabled)::before{transform:skewX(calc(-1 * var(--igs-ts-angle))) scaleX(1);}
.igs-ts-btn:focus-visible .igs-ts-no,.igs-ts-btn:focus-visible .igs-ts-btn-en,.igs-ts-btn:active:not(:disabled) .igs-ts-no,.igs-ts-btn:active:not(:disabled) .igs-ts-btn-en{color:var(--igs-ts-on-block);opacity:.9;font-weight:600;}
@media (hover:hover){
  .igs-ts-btn:hover:not(:disabled){color:var(--igs-ts-on-block);}
  .igs-ts-btn:hover:not(:disabled)::before{transform:skewX(calc(-1 * var(--igs-ts-angle))) scaleX(1);}
  .igs-ts-btn:hover:not(:disabled) .igs-ts-no,.igs-ts-btn:hover:not(:disabled) .igs-ts-btn-en{color:var(--igs-ts-on-block);opacity:.9;font-weight:600;}
}
.igs-ts-btn:disabled{opacity:.45;cursor:default;}
.igs-ts-foot{position:absolute;right:max(5cqw,env(safe-area-inset-right,0px));bottom:max(4.5cqh,env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:16px;color:rgba(255,255,255,.6);pointer-events:none;}
.igs-ts-barcode{display:block;width:${BARCODE.width}px;height:18px;background:${BARCODE.image};}
.igs-ts-hazard{display:none;width:56px;height:8px;background:repeating-linear-gradient(-45deg,var(--igs-ts-block) 0 3px,transparent 3px 7px);}
.igs-ts-title-seal{display:none;}
.igs-ts-g{display:inline-block;font-size:.8em;line-height:1;transform-origin:50% 85%;}
.igs-ts-g.is-lead{font-size:1.3em;margin-right:.03em;transform:rotate(-6deg);}
.igs-ts-g.is-minor{font-size:.56em;vertical-align:.32em;margin-inline:.06em;opacity:.85;}
.igs-ts-g.is-punct{font-size:.6em;vertical-align:.12em;opacity:.7;}
.igs-ts-g.is-rise{transform:translateY(-.05em);}
.igs-ts-g.is-dip{font-size:.72em;}
.igs-ts-g.is-tail{font-size:.94em;transform:rotate(5deg);}
.igs-ts-g.is-latin{font-family:var(--igs-ts-en);font-size:.5em;font-weight:600;letter-spacing:.06em;}
${S}[${TONE_ATTR}="tech"] .igs-ts-g.is-lead{transform:skewX(-10deg);}
${S}[${TONE_ATTR}="tech"] .igs-ts-g.is-tail{transform:none;}
${S}[${TONE_ATTR}="soft"] .igs-ts-g.is-lead{transform:rotate(-9deg) translateY(.04em);}
${S}[${TONE_ATTR}="soft"] .igs-ts-g.is-rise{transform:translateY(-.1em) rotate(-5deg);}
${S}[${TONE_ATTR}="soft"] .igs-ts-g.is-flat{transform:rotate(4deg);}
/* 宋体、书法不歪字：只靠大小对比与上下错落立出字标。 */
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="dark"],[${TONE_ATTR}="mystic"],[${TONE_ATTR}="ink"]) .igs-ts-g{transform:none;}
${S}:is([${TONE_ATTR}="dark"],[${TONE_ATTR}="mystic"]) .igs-ts-g.is-lead{font-size:1.3em;}
/* 古风：庞门正道粗书毛笔字标，只留轻微大小差，靠上下错落成行气。 */
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-g{font-size:.98em;letter-spacing:-.06em;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-tag{margin-bottom:0;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-g.is-lead{font-size:1.16em;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-g.is-dip{font-size:.88em;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-g.is-tail{font-size:1.04em;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-g.is-minor{font-size:.62em;}
${S}[${TONE_ATTR}="ink"] .igs-ts-g.is-dip{transform:translateY(.1em);}
${S}[${TONE_ATTR}="ink"] .igs-ts-g.is-rise{transform:translateY(-.06em);}
${S}[${TONE_ATTR}="ink"] .igs-ts-g.is-tail{transform:translateY(.04em);}
.igs-ts-slab::after{display:none;}
${S}[${PHASE_ATTR}="wait"] :is(.igs-ts-cover,.igs-ts-sliver,.igs-ts-edge,.igs-ts-slab,.igs-ts-menu,.igs-ts-topbar,.igs-ts-foot,.igs-ts-corners){opacity:0;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-cover{animation:igs-ts-cut .6s ${EASE} both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-sliver{animation:igs-ts-cut .6s ${EASE} .08s both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-edge{animation:igs-ts-drop .5s ${EASE} .12s both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-slab{animation:igs-ts-wipe .5s ${EASE} .2s both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-title{animation:igs-ts-up .45s ${EASE} .36s both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-script{animation:igs-ts-slide .7s ${EASE} .42s both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-btn{animation:igs-ts-slide .42s ${EASE} both;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-btn:nth-child(1){animation-delay:.3s;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-btn:nth-child(2){animation-delay:.35s;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-btn:nth-child(3){animation-delay:.4s;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-btn:nth-child(4){animation-delay:.45s;}
${S}[${PHASE_ATTR}="intro"] .igs-ts-btn:nth-child(5){animation-delay:.5s;}
${S}[${PHASE_ATTR}="intro"] :is(.igs-ts-topbar,.igs-ts-foot,.igs-ts-corners){animation:igs-ts-fade .5s ease .25s both;}
.igs-ts-wv-bg{position:absolute;inset:0;}
.igs-ts-wv-bg .igs-ts-cover-img{filter:brightness(.6) saturate(1.05);}
.igs-ts-wv-panel{position:absolute;left:0;top:0;bottom:0;width:48cqw;background:color-mix(in srgb,var(--igs-ts-deep) 90%,transparent);clip-path:polygon(0 0,100% 0,calc(100% - var(--igs-ts-cut)) 100%,0 100%);animation:igs-ts-cut .45s ${EASE} both;}
.igs-ts-wv-panel::after{content:"";position:absolute;top:0;bottom:0;right:0;width:calc(var(--igs-ts-cut) + 3px);background:var(--igs-ts-block);clip-path:polygon(calc(100% - 3px) 0,100% 0,calc(var(--igs-ts-cut)) 100%,calc(var(--igs-ts-cut) - 3px) 100%);}
.igs-ts-pick{position:absolute;left:max(6%,env(safe-area-inset-left,0px));top:9%;bottom:calc(var(--igs-ts-dialog-h,210px) + 30px);display:flex;align-items:center;min-width:0;max-width:60%;font-family:var(--igs-ts-menu-font);animation:igs-ts-fade .35s ease both;}
.igs-ts-worlds{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:100%;overflow:auto;scrollbar-width:none;}
.igs-ts-worlds::-webkit-scrollbar{display:none;}
.igs-ts-world-name{appearance:none;position:relative;display:flex;align-items:baseline;gap:14px;padding:4px 0 4px 22px;border:0;background:none;color:#fff;font:inherit;font-size:clamp(17px,3.4cqmin,22px);font-weight:600;line-height:1.35;letter-spacing:.26em;text-align:left;opacity:.5;cursor:pointer;transition:opacity .25s ease,font-size .32s ${EASE};}
.igs-ts-world-name::before{content:"";position:absolute;left:0;top:50%;width:6px;height:.9em;background:var(--igs-ts-block);transform:translateY(-50%) skewX(calc(-1 * var(--igs-ts-angle))) scaleY(0);transition:transform .28s ${EASE};}
.igs-ts-world-en{font-family:var(--igs-ts-en);font-size:11px;font-weight:400;letter-spacing:.3em;opacity:0;transform:translateX(-6px);transition:opacity .25s ease,transform .28s ${EASE};}
.igs-ts-world-name:hover,.igs-ts-world-name:focus-visible{opacity:.9;outline:none;}
.igs-ts-world-name:hover .igs-ts-world-en,.igs-ts-world-name:focus-visible .igs-ts-world-en{opacity:.55;transform:none;}
.igs-ts-world.is-on .igs-ts-world-name{opacity:1;font-size:clamp(28px,6.6cqmin,44px);font-weight:900;letter-spacing:.16em;}
.igs-ts-world.is-on .igs-ts-world-name::before{transform:translateY(-50%) skewX(calc(-1 * var(--igs-ts-angle))) scaleY(1);}
.igs-ts-world.is-on .igs-ts-world-en{opacity:1;transform:none;color:var(--igs-ts-block);font-weight:600;}
.igs-ts-mark{position:absolute;right:4%;top:40%;transform:translateY(-50%);font-family:var(--igs-ts-en);font-size:clamp(56px,14cqw,180px);font-weight:700;line-height:1;letter-spacing:.02em;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.32);pointer-events:none;white-space:nowrap;animation:igs-ts-fade .5s ease both;}
.igs-ts-skins{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:4px 0 12px 22px;animation:igs-ts-fade .3s ease both;}
.igs-ts-skin{appearance:none;position:relative;display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border:1px solid rgba(255,255,255,.22);background:none;color:#fff;font:inherit;font-size:14px;font-weight:500;letter-spacing:.12em;opacity:.75;cursor:pointer;transition:opacity .2s ease,background-color .2s ease,border-color .2s ease;}
.igs-ts-skin:hover,.igs-ts-skin:focus-within,.igs-ts-skin:focus-visible{opacity:1;outline:none;border-color:rgba(255,255,255,.6);}
.igs-ts-skin.is-on{opacity:1;background:var(--igs-ts-block);border-color:var(--igs-ts-block);color:var(--igs-ts-on-block);font-weight:700;}
.igs-ts-more select{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer;font-size:16px;}
.igs-ts-more option{color:#222;background:#fff;}
.igs-ts-actions{position:absolute;right:calc(max(16px,env(safe-area-inset-right,0px)) + 54px);top:max(14px,env(safe-area-inset-top,0px));display:flex;align-items:center;gap:22px;font-family:var(--igs-ts-zh);animation:igs-ts-fade .35s ease both;}
${S}[data-igs-title-view="worldview"] .igs-ts-actions{right:max(16px,env(safe-area-inset-right,0px));}
.igs-ts-link{appearance:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 4px;border:0;background:none;color:#fff;font:inherit;font-size:16px;font-weight:500;letter-spacing:.24em;text-shadow:0 1px 3px rgba(0,0,0,.85);opacity:.75;cursor:pointer;transition:opacity .18s ease;}
.igs-ts-link:hover:not(:disabled),.igs-ts-link:focus-visible{opacity:1;outline:none;}
.igs-ts-link.is-primary{opacity:1;min-height:38px;padding:0 18px;background:var(--igs-ts-block);color:var(--igs-ts-on-block);font-size:17px;font-weight:700;text-shadow:none;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);}
.igs-ts-link.is-primary span{font-family:var(--igs-ts-en);font-size:1.2em;transition:transform .18s ease;}
.igs-ts-link.is-primary:hover span{transform:translateX(3px);}
.igs-ts-link:disabled{opacity:.4;cursor:default;}
.igs-ts-stage{position:absolute;inset:0;pointer-events:none;}
${S} .igs-ts-preview{pointer-events:none;transition:none;animation:igs-ts-fade .3s ease both;}
.igs-ts-backdrop{position:absolute;inset:0;background:#000;animation:igs-ts-fade .4s ease both;}
${S} .igs-fx-title-card{top:40%;z-index:1;pointer-events:none;}
@keyframes igs-ts-fade{from{opacity:0;}to{opacity:1;}}
@keyframes igs-ts-cut{from{opacity:0;transform:translateX(-5cqw);}to{opacity:1;transform:none;}}
@keyframes igs-ts-drop{from{transform:translateY(-100%);}to{transform:none;}}
@keyframes igs-ts-wipe{from{clip-path:inset(-60% 100% -20% 0);}to{clip-path:inset(-60% -20% -20% 0);}}
@keyframes igs-ts-up{from{opacity:0;transform:translateY(.3em);}to{opacity:1;transform:none;}}
@keyframes igs-ts-slide{from{opacity:0;transform:translateX(2.4cqw);}to{opacity:1;transform:none;}}
/* 调性：tech 保留整套机械细节；modern 去掉警示条；soft 圆角点阵；classic 直切竖格配印章；mystic 星点与菱形；dark 不铺网格、压暗色块。 */
${S}[${TONE_ATTR}="tech"]{--igs-ts-angle:12deg;--igs-ts-line:rgba(255,255,255,.12);}
${S}[${TONE_ATTR}="tech"] .igs-ts-hazard,${S}[${TONE_ATTR}="tech"] .igs-ts-slab::after{display:block;}
${S}[${TONE_ATTR}="soft"]{--igs-ts-angle:5deg;--igs-ts-pangle:4deg;--igs-ts-radius:18px;--igs-ts-title-font:"ChillRoundF","IGS Rounded",var(--igs-ts-zh);--igs-ts-title-weight:700;--igs-ts-menu-font:"ChillRoundF","IGS Rounded",var(--igs-ts-zh);--igs-ts-menu-weight:700;}
${S}[${TONE_ATTR}="soft"] .igs-ts-base{background-image:radial-gradient(circle,rgba(255,255,255,.1) 1.2px,transparent 1.8px);background-size:22px 22px;}
${S}[${TONE_ATTR}="soft"] :is(.igs-ts-sliver,.igs-ts-barcode,.igs-ts-corners){display:none;}
${S}[${TONE_ATTR}="soft"] .igs-ts-btn::before{inset:4px -6px 4px -4px;border-radius:999px;}
${S}[${TONE_ATTR}="soft"] :is(.igs-ts-close,.igs-ts-skin,.igs-ts-link.is-primary){border-radius:999px;clip-path:none;}
${S}[${TONE_ATTR}="soft"] .igs-ts-hazard{display:block;width:44px;height:6px;background:radial-gradient(circle,var(--igs-ts-block) 2px,transparent 2.5px) 0 50%/11px 6px repeat-x;}
${S}[${TONE_ATTR}="classic"]{--igs-ts-angle:0deg;--igs-ts-pangle:0deg;--igs-ts-title-font:"IGS-PangMen","Source Han Serif CN",serif;--igs-ts-menu-font:"Source Han Serif CN","Huiwen Mincho",serif;}
${S}[${TONE_ATTR}="classic"] .igs-ts-base{background-image:linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:56px 100%;}
${S}[${TONE_ATTR}="classic"] :is(.igs-ts-sliver,.igs-ts-barcode){display:none;}
${S}[${TONE_ATTR}="classic"] .igs-ts-title{letter-spacing:.14em;}
${S}[${TONE_ATTR}="classic"] .igs-ts-slab::after{display:block;left:8cqw;right:5cqw;top:1.1cqh;bottom:auto;width:auto;height:4px;background:none;border-block:1px solid currentColor;}
${S}[${TONE_ATTR}="mystic"]{--igs-ts-angle:8deg;--igs-ts-pangle:5deg;--igs-ts-title-font:"Tsanger YuYang","LXGW Neo ZhiSong","Source Han Serif CN",serif;--igs-ts-menu-font:"Source Han Serif CN","LXGW Neo ZhiSong",serif;}
${S}[${TONE_ATTR}="mystic"] .igs-ts-base{background-image:radial-gradient(circle,rgba(255,255,255,.26) 1px,transparent 1.6px),radial-gradient(circle,rgba(255,255,255,.13) .8px,transparent 1.4px);background-size:97px 89px,53px 61px;background-position:13px 29px,41px 7px;}
${S}[${TONE_ATTR}="mystic"] :is(.igs-ts-sliver,.igs-ts-barcode){display:none;}
${S}[${TONE_ATTR}="mystic"] .igs-ts-hazard{display:block;position:relative;width:72px;height:9px;background:linear-gradient(var(--igs-ts-block),var(--igs-ts-block)) 0 50%/100% 1px no-repeat;}
${S}[${TONE_ATTR}="mystic"] .igs-ts-hazard::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;background:var(--igs-ts-block);transform:translate(-50%,-50%) rotate(45deg);}
${S}[${TONE_ATTR}="mystic"] .igs-ts-corners i{border-color:color-mix(in srgb,var(--igs-ts-block) 70%,transparent);}
${S}[${TONE_ATTR}="dark"]{--igs-ts-angle:4deg;--igs-ts-pangle:3deg;--igs-ts-line:transparent;--igs-ts-block:color-mix(in srgb,var(--igs-ts-cblock,var(--igs-ts-accent,#8a1c1c)) 62%,#000);--igs-ts-on-block:#f1ece4;--igs-ts-title-font:"Huiwen Mincho","Source Han Serif CN",serif;--igs-ts-menu-font:"Source Han Serif CN","Huiwen Mincho",serif;}
${S}[${TONE_ATTR}="dark"] :is(.igs-ts-sliver,.igs-ts-barcode,.igs-ts-corners){display:none;}
${S}[${TONE_ATTR}="dark"] .igs-ts-base::after{opacity:1;background:radial-gradient(ellipse 80% 70% at 70% 45%,transparent 10%,#000 100%);}
${S}[${TONE_ATTR}="dark"] .igs-ts-script{opacity:.7;}
${ARC_DOT_STYLE}
.igs-ts-arc{position:absolute;inset:0;z-index:1;width:100%;height:100%;overflow:visible;fill:none;stroke:rgba(255,255,255,.42);stroke-width:1.2;pointer-events:none;}
.igs-ts-arc path{vector-effect:non-scaling-stroke;}
.igs-ts-arc .is-tall,.igs-ts-dot.is-tall{display:none;}
.igs-ts-dot{position:absolute;z-index:1;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:var(--igs-ts-block);box-shadow:0 0 0 3px color-mix(in srgb,var(--igs-ts-block) 22%,transparent);pointer-events:none;}
.igs-ts-dot.is-d1{width:4px;height:4px;margin:-2px 0 0 -2px;background:#fff;box-shadow:none;}
/* 细圆环只露出一段弧，两端淡出，弧上挂一颗色点。 */
.igs-ts-ring{position:absolute;z-index:1;left:calc(var(--igs-ts-cw) - var(--igs-ts-cut) * .22 - 9cqh);top:13cqh;width:18cqh;height:18cqh;border:1px solid rgba(255,255,255,.26);border-radius:50%;-webkit-mask:conic-gradient(transparent 20deg,#000 80deg 240deg,transparent 300deg);mask:conic-gradient(transparent 20deg,#000 80deg 240deg,transparent 300deg);pointer-events:none;}
.igs-ts-ring::after{content:"";position:absolute;right:-3px;top:calc(50% - 2.5px);width:5px;height:5px;border-radius:50%;background:var(--igs-ts-block);}
.igs-ts-chip{position:absolute;right:14cqw;top:-2.6cqh;width:8cqw;height:1.2cqh;background:var(--igs-ts-block);transform:skewX(calc(-1 * var(--igs-ts-angle)));}
.igs-ts-no,.igs-ts-zh{display:inline-block;transform-origin:0 75%;transition:transform .26s ${EASE},color .2s ease;}
.igs-ts-btn:focus-visible :is(.igs-ts-no),.igs-ts-btn:active:not(:disabled) :is(.igs-ts-no){transform:scale(1.45);}
.igs-ts-btn:focus-visible .igs-ts-zh,.igs-ts-btn:active:not(:disabled) .igs-ts-zh{transform:translateX(.16em) scale(1.12);}
@media (hover:hover){
  .igs-ts-btn:hover:not(:disabled) .igs-ts-no{transform:scale(1.45);}
  .igs-ts-btn:hover:not(:disabled) .igs-ts-zh{transform:translateX(.16em) scale(1.12);}
}
${S}[${TONE_ATTR}="tech"] .igs-ts-arc{stroke-dasharray:2 5;}
${S}[${TONE_ATTR}="soft"] .igs-ts-arc{stroke:color-mix(in srgb,var(--igs-ts-block) 70%,transparent);stroke-width:3;stroke-linecap:round;stroke-dasharray:.1 9;}
${S}[${TONE_ATTR}="soft"] .igs-ts-chip{border-radius:999px;transform:none;}
${S}[${TONE_ATTR}="mystic"] .igs-ts-dot{border-radius:0;transform:rotate(45deg);}
${S}[${TONE_ATTR}="mystic"] .igs-ts-slab::before{inset:0 -14cqw 0 -3cqw;transform:none;${maskOf(BOW_SIDE)}}
${S}[${TONE_ATTR}="mystic"] .igs-ts-title{letter-spacing:.08em;}
${S}[${TONE_ATTR}="dark"] .igs-ts-arc{stroke:rgba(255,255,255,.2);}
${S}[${TONE_ATTR}="dark"] .igs-ts-ring{display:none;}
/* 水墨：照水墨武侠皮肤的笔形——色块是一道干笔横扫，选中项是一笔短捺，标题旁落朱砂小印，底铺拓本石纹。 */
${S}:is([${TONE_ATTR}="ink"],[${TONE_ATTR}="classic"]){--igs-ts-block:var(--igs-ts-cmuted,var(--igs-ts-accent,#8c7a5b));--igs-ts-on-block:var(--igs-ts-cmink,var(--igs-ts-accent-ink,#101014));}
${S}:is([${TONE_ATTR}="ink"],[${TONE_ATTR}="classic"]) :is(.igs-ts-no,.igs-ts-btn.is-primary .igs-ts-btn-en,.igs-ts-mono,.igs-ts-world.is-on .igs-ts-world-en){color:color-mix(in srgb,var(--igs-ts-block) 55%,#fff);}
${S}[${TONE_ATTR}="ink"]{--igs-ts-angle:0deg;--igs-ts-pangle:0deg;--igs-ts-title-font:"IGS-PangMen","Source Han Serif CN",serif;--igs-ts-menu-font:"Source Han Serif CN","LXGW WenKai",serif;}
${S}[${TONE_ATTR}="ink"] .igs-ts-base{background-image:${WX_RUBBING};background-size:1024px 512px;}
${S}[${TONE_ATTR}="ink"] :is(.igs-ts-sliver,.igs-ts-barcode,.igs-ts-corners){display:none;}
${S}[${TONE_ATTR}="ink"] .igs-ts-edge{left:calc(var(--igs-ts-cw) - 4px);width:8px;clip-path:none;background:${wxEdge(WUXIA_MOON)} center/100% 100% no-repeat;opacity:.75;}
${S}[${TONE_ATTR}="ink"] .igs-ts-slab::before{inset:-2.4cqh -12cqw -2.4cqh -5cqw;transform:none;border-radius:0;${maskOf(WX_HSTROKE)}}
${S}[${TONE_ATTR}="ink"] .igs-ts-chip{right:10cqw;top:-3.4cqh;width:12cqw;height:2.6cqh;transform:none;${maskOf(WX_SLASH)}}
/* 古风破框：笔触收窄压在字的中下部，大字冲出笔触上沿，标签落到笔触里。 */
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-slab{display:flex;flex-direction:column;align-items:flex-start;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-tag{order:2;margin:.6cqh 0 0;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title{font-size:calc(var(--igs-ts-title-size) * 1.32);line-height:1;text-shadow:0 2px 14px rgba(0,0,0,.35);}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title[data-size="xl"]{font-size:calc(var(--igs-ts-title-size) * 1.62);}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title[data-size="l"]{font-size:calc(var(--igs-ts-title-size) * 1.44);}
${S}[${TONE_ATTR}="ink"] .igs-ts-slab::before{inset:40% -12cqw -1.6cqh -5cqw;}
${S}[${TONE_ATTR}="classic"] .igs-ts-slab::before{inset:40% -14cqw 0 0;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-script{left:auto;right:5cqw;bottom:.4cqh;font-size:clamp(24px,4.6cqh,56px);opacity:.72;}
${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-chip{top:auto;bottom:-3.2cqh;}
${S}[${TONE_ATTR}="ink"] .igs-ts-btn::before{inset:3px -16px 3px -18px;${maskOf(WX_SLASH)}}
${S}[${TONE_ATTR}="ink"] .igs-ts-arc{stroke:rgba(236,231,221,.38);}
${S}[${TONE_ATTR}="ink"] .igs-ts-ring{border-color:rgba(236,231,221,.32);}
${S}[${TONE_ATTR}="ink"] .igs-ts-hazard{display:block;width:64px;height:6px;background:var(--igs-ts-block);${maskOf(WX_BAR)}}
${S}[${TONE_ATTR}="ink"] .igs-ts-title{letter-spacing:.1em;}
${S}[${TONE_ATTR}="ink"] .igs-ts-title-seal{display:inline-grid;place-items:center;width:1.7em;height:1.7em;margin-left:.5em;vertical-align:middle;font:400 max(13px,.26em)/1 "IGS-MaShanZheng","LXGW WenKai",serif;letter-spacing:0;color:#f5ece0;background:#a8382a;${maskOf(WX_SEAL_MASK_SMALL)}}
/* 底纹跟世界观走；柔和与水墨两种皮肤自带纹理，不换。 */
${S}[${WORLD_ATTR}="scifi"]:not([${TONE_ATTR}="ink"]):not([${TONE_ATTR}="soft"]) .igs-ts-base{background-image:linear-gradient(var(--igs-ts-line) 1px,transparent 1px),linear-gradient(90deg,var(--igs-ts-line) 1px,transparent 1px);background-size:22px 22px;}
${S}[${WORLD_ATTR}="apocalypse"]:not([${TONE_ATTR}="ink"]):not([${TONE_ATTR}="soft"]) .igs-ts-base{background-image:repeating-linear-gradient(45deg,var(--igs-ts-line) 0 1px,transparent 1px 16px);background-size:auto;}
${S}[${WORLD_ATTR}="fantasy"]:not([${TONE_ATTR}="ink"]):not([${TONE_ATTR}="soft"]) .igs-ts-base{background-image:repeating-linear-gradient(60deg,var(--igs-ts-line) 0 1px,transparent 1px 46px),repeating-linear-gradient(-60deg,var(--igs-ts-line) 0 1px,transparent 1px 46px);background-size:auto;}
${S}[${WORLD_ATTR}="ancient"]:not([${TONE_ATTR}="ink"]):not([${TONE_ATTR}="soft"]) .igs-ts-base,${S}[${WORLD_ATTR}="taisho"]:not([${TONE_ATTR}="ink"]):not([${TONE_ATTR}="soft"]) .igs-ts-base{background-image:linear-gradient(90deg,var(--igs-ts-line) 1px,transparent 1px,transparent 5px,var(--igs-ts-line) 5px,transparent 6px);background-size:64px 100%;}
${S}[${WORLD_ATTR}="horror"]:not([${TONE_ATTR}="ink"]):not([${TONE_ATTR}="soft"]) .igs-ts-base{background-image:none;}
/* 色块上的波点：从左往右渐显的网点，只给现代、科技、柔和三种调性。 */
.igs-ts-dots{display:none;position:absolute;z-index:-1;left:42%;right:-14cqw;top:0;bottom:0;background:radial-gradient(circle,color-mix(in srgb,var(--igs-ts-on-block) 24%,transparent) 32%,transparent 36%) 0 0/9px 9px;transform:skewX(calc(-1 * var(--igs-ts-angle)));transform-origin:0 100%;-webkit-mask:linear-gradient(90deg,transparent,#000 75%);mask:linear-gradient(90deg,transparent,#000 75%);pointer-events:none;}
:is(${S}[${TONE_ATTR}="modern"],${S}[${TONE_ATTR}="tech"],${S}[${TONE_ATTR}="soft"]) .igs-ts-dots{display:block;}
${S}[${TONE_ATTR}="tech"] .igs-ts-dots{background-size:6px 6px;}
${S}[${TONE_ATTR}="soft"] .igs-ts-dots{background:radial-gradient(circle,color-mix(in srgb,#fff 34%,transparent) 30%,transparent 34%) 0 0/16px 16px;border-radius:0 0 0 18px;}
/* 魔法世界观：圆环换成一弯发光新月，弧线上的点换成四芒星光（与魔法星夜皮肤同一笔形），星点再亮一档。 */
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]){--igs-ts-moon:#f3f1ff;}
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-base{background-image:radial-gradient(circle,rgba(243,241,255,.5) 1.1px,transparent 1.8px),radial-gradient(circle,rgba(243,241,255,.24) .8px,transparent 1.4px),radial-gradient(circle,rgba(200,190,255,.16) .7px,transparent 1.3px);background-size:97px 89px,53px 61px,31px 37px;background-position:13px 29px,41px 7px,5px 19px;}
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-ring{left:calc(var(--igs-ts-cw) - var(--igs-ts-cut) * .2 - 5cqh);top:14cqh;width:10cqh;height:10cqh;border:0;-webkit-mask:none;mask:none;box-shadow:inset -1.6cqh .8cqh 0 0 var(--igs-ts-moon);filter:drop-shadow(0 0 8px rgba(243,241,255,.55));transform:rotate(-18deg);}
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-ring::after{display:none;}
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-arc{stroke:rgba(243,241,255,.45);}
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-dot{width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:0;transform:none;box-shadow:none;background:var(--igs-ts-moon);${maskOf(MAGIC_SPARKLE_MASK, 'contain')}filter:drop-shadow(0 0 5px rgba(243,241,255,.85));}
${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-dot.is-d1{width:10px;height:10px;margin:-5px 0 0 -5px;}
@container (max-aspect-ratio:1/1){
  ${S} > *{--igs-ts-cover-h:51cqh;--igs-ts-tilt:calc(100cqw * tan(var(--igs-ts-pangle)));}
  .igs-ts-cover{right:0;bottom:auto;width:auto;height:var(--igs-ts-cover-h);clip-path:polygon(0 0,100% 0,100% calc(100% - var(--igs-ts-tilt)),0 100%);}
  .igs-ts-cover-img{object-position:50% 18%;}
  .igs-ts-sliver,.igs-ts-edge{display:none;}
  .igs-ts-topbar{left:max(18px,env(safe-area-inset-left,0px));top:max(16px,env(safe-area-inset-top,0px));text-shadow:0 1px 4px rgba(0,0,0,.7);}
  .igs-ts-topbar .is-dim{display:none;}
  .igs-ts-mono{font-size:28px;}
  .igs-ts-slab{left:0;right:0;bottom:auto;top:calc(var(--igs-ts-cover-h) - var(--igs-ts-tilt) - 3cqh);padding:2.4cqh 7cqw 1cqh;}
  .igs-ts-slab::before{inset:calc(var(--igs-ts-tilt) / -2) 0;transform:skewY(calc(-1 * var(--igs-ts-pangle)));transform-origin:50% 50%;}
  .igs-ts-slab::after{right:7cqw;bottom:1.2cqh;}
  .igs-ts-script{left:4cqw;bottom:calc(100% - .2em);font-size:clamp(30px,9.4cqw,80px);}
  .igs-ts-slab-mark,.igs-ts-corners i:nth-child(1){display:none;}
  .igs-ts-arc .is-wide,.igs-ts-dot.is-wide{display:none;}
  .igs-ts-arc .is-tall,.igs-ts-dot.is-tall{display:block;}
  .igs-ts-ring{left:auto;right:-6cqw;top:24cqh;width:28cqw;height:28cqw;}
  ${S}[${WORLD_ATTR}="magic"]:not([${TONE_ATTR}="ink"]) .igs-ts-ring{left:auto;right:12cqw;top:20cqh;width:13cqw;height:13cqw;box-shadow:inset -2.2cqw 1.1cqw 0 0 var(--igs-ts-moon);}
  .igs-ts-chip{right:8cqw;top:-1.8cqh;width:16cqw;height:.9cqh;}
  .igs-ts-dots{left:38%;right:0;top:calc(var(--igs-ts-tilt) / -2);bottom:calc(var(--igs-ts-tilt) / -2);transform:skewY(calc(-1 * var(--igs-ts-pangle)));transform-origin:50% 50%;}
  ${S}[${TONE_ATTR}="ink"] .igs-ts-chip{top:auto;bottom:-1.4cqh;height:2.2cqh;}
  ${S}[${TONE_ATTR}="mystic"] .igs-ts-slab::before{inset:-2.6cqh 0 -3.6cqh;transform:none;${maskOf(WAVE_BAND)}}
  .igs-ts-tag{font-size:clamp(11px,3.2cqw,14px);gap:2px 10px;}
  .igs-ts-title{--igs-ts-title-size:min(13cqw,7cqh);margin-top:2.2cqh;rotate:-4deg;transform-origin:0 100%;}
  .igs-ts-title[data-size="xl"]{--igs-ts-title-size:min(15cqw,8cqh);}
  .igs-ts-title[data-size="m"]{--igs-ts-title-size:min(12.2cqw,6.6cqh);}
  .igs-ts-title[data-size="s"]{--igs-ts-title-size:min(7.4cqw,4.2cqh);}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-slab{top:calc(var(--igs-ts-cover-h) - var(--igs-ts-tilt) - 12cqh);padding-bottom:2.6cqh;}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title{font-size:calc(var(--igs-ts-title-size) * 1.2);}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title[data-size="xl"]{font-size:calc(var(--igs-ts-title-size) * 1.42);}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title[data-size="l"]{font-size:calc(var(--igs-ts-title-size) * 1.3);}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-script{right:6cqw;bottom:calc(100% - .3em);font-size:clamp(20px,6cqw,40px);}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title{margin-top:0;rotate:none;}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-tag{margin-bottom:.8cqh;}
  ${S}:is([${TONE_ATTR}="classic"],[${TONE_ATTR}="ink"]) .igs-ts-title[data-size="m"]{--igs-ts-title-size:min(9.8cqw,5.2cqh);}
  .igs-ts-menu{left:6cqw;right:6cqw;top:auto;bottom:calc(max(14px,env(safe-area-inset-bottom,0px)) + 34px);}
  .igs-ts-btn{min-height:max(46px,6.2cqh);}
  .igs-ts-zh{font-size:clamp(18px,5.4cqw,24px);}
  .igs-ts-btn.is-primary .igs-ts-zh{font-size:clamp(21px,6.6cqw,30px);}
  .igs-ts-foot{left:6cqw;right:6cqw;bottom:max(14px,env(safe-area-inset-bottom,0px));justify-content:space-between;}
  .igs-ts-wv-panel{width:auto;right:0;clip-path:none;background:linear-gradient(180deg,color-mix(in srgb,var(--igs-ts-deep) 92%,transparent) 0,color-mix(in srgb,var(--igs-ts-deep) 80%,transparent) 60%,transparent);}
  .igs-ts-wv-panel::after{display:none;}
  .igs-ts-pick{left:5%;top:max(64px,8%);max-width:90%;align-items:flex-start;}
  .igs-ts-world-name{font-size:20px;letter-spacing:.22em;padding:5px 0 5px 20px;}
  .igs-ts-world.is-on .igs-ts-world-name{font-size:34px;}
  .igs-ts-mark{top:6%;right:1%;transform:none;writing-mode:vertical-rl;font-size:min(20cqw,9cqh);letter-spacing:0;}
  .igs-ts-skins{padding-left:20px;}
}
@container (min-aspect-ratio:1/1) and (max-height:460px){
  ${S} > *{--igs-ts-cw:46cqw;}
  .igs-ts-script,.igs-ts-slab-mark,.igs-ts-foot,.igs-ts-topbar .is-dim,.igs-ts-ring,.igs-ts-chip{display:none;}
  .igs-ts-topbar{top:max(12px,env(safe-area-inset-top,0px));left:calc(var(--igs-ts-cw) + 4cqw);}
  .igs-ts-mono{font-size:24px;}
  .igs-ts-slab{left:0;right:calc(100% - var(--igs-ts-cw) + 2cqw);bottom:max(8cqh,env(safe-area-inset-bottom,0px));padding:2cqh 5cqw 2.4cqh max(4cqw,env(safe-area-inset-left,0px));}
  .igs-ts-slab::before{inset:0 0 0 -10cqw;}
  .igs-ts-slab::after{display:none;}
  .igs-ts-title{--igs-ts-title-size:min(12cqh,5.4cqw);}
  .igs-ts-title[data-size="xl"]{--igs-ts-title-size:min(16cqh,7cqw);}
  .igs-ts-title[data-size="m"]{--igs-ts-title-size:min(9cqh,3.8cqw);}
  .igs-ts-title[data-size="s"]{--igs-ts-title-size:min(7cqh,3cqw);}
  .igs-ts-menu{left:calc(var(--igs-ts-cw) + 4cqw);top:50%;transform:translateY(-44%);}
  .igs-ts-btn{min-height:max(36px,10cqh);}
  .igs-ts-zh{font-size:17px;}
  .igs-ts-btn.is-primary .igs-ts-zh{font-size:20px;}
  .igs-ts-pick{top:max(8px,env(safe-area-inset-top,0px));left:4%;right:4%;max-width:none;bottom:auto;align-items:flex-start;}
  .igs-ts-worlds{flex-direction:row;flex-wrap:wrap;gap:0 14px;padding-right:180px;}
  .igs-ts-world{display:contents;}
  .igs-ts-world-name{font-size:15px;letter-spacing:.2em;padding:3px 0 3px 14px;}
  .igs-ts-world.is-on .igs-ts-world-name{font-size:21px;}
  .igs-ts-world-en,.igs-ts-mark{display:none;}
  .igs-ts-skins{order:99;flex-basis:100%;padding:0 0 0 14px;}
  .igs-ts-wv-panel{width:auto;right:0;bottom:auto;height:46cqh;clip-path:none;background:linear-gradient(180deg,color-mix(in srgb,var(--igs-ts-deep) 90%,transparent),transparent);}
  .igs-ts-wv-panel::after{display:none;}
  .igs-ts-actions{top:max(4px,env(safe-area-inset-top,0px));gap:16px;}
}
@media (prefers-reduced-motion:reduce){
  ${S} *{animation-duration:.01ms!important;animation-delay:0s!important;transition:none!important;}
}
`;

export const TITLE_SCREEN_STYLE_TEXT = [BASE_STYLE.trim(), ...DIALOG_SKIN_CHOICES.map(([skin]) => themeRules(skin))].join('\n');

// 含已登记 DLC 皮肤的主界面样式；登记表没变就复用上次的结果。
let titleStyleCache = { version: -1, text: TITLE_SCREEN_STYLE_TEXT };
export function getTitleScreenStyleText() {
    const version = dlcSkinVersion();
    if (titleStyleCache.version !== version) {
        const extra = listDlcSkins().map((def) => themeRules(def.id));
        titleStyleCache = { version, text: extra.length ? [TITLE_SCREEN_STYLE_TEXT, ...extra].join('\n') : TITLE_SCREEN_STYLE_TEXT };
    }
    return titleStyleCache.text;
}
