import { esc } from './reader-value-utils.js';
import { ensureStyleTag } from './reader-dom-utils.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { WORLDVIEWS, normalizeWorldview, worldSkinOf } from '../../scene/worldview.js';
import { resolveSpriteAsset } from '../../scene/asset-match.js';
import { resolveAssetScope } from '../../scene/asset-scope.js';
import { applySceneAudio } from './scene-audio.js';
import { applyDialogSkinAssets, normalizeDialogSkin } from './classic-dialog-skin.js';
import { syncDialogSkinStyle } from './dialog-skin-style.js';
import { getBattleTheme } from './fx-battle-themes.js';
import { DIALOG_SKIN_CHOICES, dialogSkinLabel } from './dialog-skin-catalog.js';
import { pickWorldviewDialogSkin, worldviewDialogSkins } from './worldview-skins.js';
import { getReferenceDialogTypography } from './dialog-theme-typography.js';

// 第 0 层的主界面：阅读器停在开场白第一页时先盖一层标题画面（开始 / 继续 / 世界风格 / 设置 / 生成主角立绘），
// 点开始直接过开场标题卡再演出第 0 层；世界风格页只负责保存选择。
// 画面只读快照与传入的回调，不碰存档；外观按皮肤取过场标题卡同一份主题（字体、墨色、底纱、卡片底）。
export const TITLE_SCREEN_ID = 'igs-title-screen';
export const TITLE_SKIN_ATTR = 'data-igs-title-skin';
const STYLE_ID = 'igs-title-screen-style';
const OPENING_CARD_MS = 2200;

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

export function createTitleGate() {
    return { view: 'menu', hasLater: null, pick: null, busy: false };
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
export function buildTitleScreenModel({ snapshot, gate, card = {}, globalSkin, resolveUrl, userName = '' } = {}) {
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
    let sprite = content.spriteImage ? resolve(content.spriteImage) : '';
    if (!sprite && title && sceneAssets.enabled === true) {
        sprite = resolve(resolveSpriteAsset(title, '平和', { sceneAssets, generatedAssets: sceneAssets.generated }).url);
    }
    return {
        view: state.view === 'worldview' ? 'worldview' : 'menu',
        title: title || '序章',
        background: content.backgroundImage ? resolve(content.backgroundImage) : '',
        avatar: String(card.avatarUrl || ''),
        sprite,
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
    };
}

function worldLabel(id) {
    const hit = WORLDVIEWS.find((item) => item.id === id);
    return hit ? hit.label : '现代';
}

// 背景与立绘地址可能是很长的 data URL：HTML 里只放占位，地址由 syncMedia 直接写到元素上。
function backdropHtml(model) {
    const kind = model.background ? '' : model.avatar ? ' is-avatar' : ' is-empty';
    const sprite = model.sprite ? '<img class="igs-ts-sprite" alt="">' : '';
    return `<div class="igs-ts-bg${kind}"></div><div class="igs-ts-shade"></div>${sprite}`;
}

function syncMedia(layer, model) {
    const bg = layer.querySelector('.igs-ts-bg');
    const url = model.background || model.avatar;
    const value = url ? `url("${url.replace(/"/g, '&quot;')}")` : '';
    if (bg && bg.style.backgroundImage !== value) bg.style.backgroundImage = value;
    const sprite = layer.querySelector('.igs-ts-sprite');
    if (sprite && sprite.getAttribute('src') !== model.sprite) sprite.setAttribute('src', model.sprite);
}

function menuHtml(model) {
    const start = model.newChat ? '开始' : model.hasLater ? '从头重播' : '开始';
    const items = [
        ['start', start],
        model.hasLater ? ['continue', '继续'] : null,
        ['worldview', '世界风格'],
        ['settings', '设置'],
        model.userName ? ['user-char', '生成主角立绘'] : null,
    ].filter(Boolean).map(([act, label]) => `<button type="button" class="igs-ts-btn" data-ts-act="${act}"${model.busy ? ' disabled' : ''}>${esc(label)}</button>`).join('');
    return `${backdropHtml(model)}
<button type="button" class="igs-ts-close" data-ts-act="close" aria-label="关闭阅读器">×</button>
<div class="igs-ts-main">
  <div class="igs-ts-heading"><div class="igs-ts-title">${esc(model.title)}</div><div class="igs-ts-tag">${esc(worldLabel(model.worldview))} · ${esc(dialogSkinLabel(model.skin))}</div></div>
  <nav class="igs-ts-menu" aria-label="主界面">${items}</nav>
</div>`;
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
    const others = DIALOG_SKIN_CHOICES.filter(([skin]) => !recommended.includes(skin));
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
    // 没有立绘时右侧空着：铺一行很淡的英文描边大字，随所选世界观换。
    const mark = model.sprite ? '' : '<div class="igs-ts-mark" aria-hidden="true">' + esc(WORLD_EN[model.pick.worldview] || '') + '</div>';
    return backdropHtml(model) + mark + '\n' + previewDialogHtml(model.pick.skin, name)
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
    ensureStyleTag(overlay.ownerDocument, STYLE_ID, TITLE_SCREEN_STYLE_TEXT);
    const layer = ensureLayer(overlay);
    handlersByLayer.set(layer, handlers);
    const view = model.view === 'worldview' ? 'worldview' : 'menu';
    const skin = view === 'worldview' ? model.pick.skin : model.skin;
    const html = view === 'worldview' ? worldviewHtml(model) : menuHtml(model);
    layer.setAttribute(TITLE_SKIN_ATTR, skin);
    layer.setAttribute('data-igs-title-view', view);
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
    const life = prefersReducedMotion() ? 900 : OPENING_CARD_MS;
    const subText = ancient ? String(sub || '').replace(/^——\s*/, '') : sub;
    layer.setAttribute('data-igs-title-view', 'opening');
    const html = `<div class="igs-ts-backdrop"></div><div class="${ancient ? 'igs-fx-title-card is-ancient' : 'igs-fx-title-card'}${worldSkin}" style="--igs-fx-life:${life}ms"><div class="igs-fx-title-main">${esc(main)}</div>${subText ? `<div class="igs-fx-title-sub">${esc(subText)}</div>` : ''}</div>`;
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
    const theme = getBattleTheme(skin) || FALLBACK_THEME;
    const v = theme.vars || {};
    const scope = `[${TITLE_SKIN_ATTR}="${skin}"]`;
    const veil = v.veil || v.wipe || FALLBACK_THEME.vars.veil;
    const rule = v.rule && v.rule !== 'transparent' ? v.rule : 'rgba(255,255,255,.22)';
    const vars = [
        theme.font ? `--igs-ts-font:${theme.font};` : '',
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

const BASE_STYLE = `
#${TITLE_SCREEN_ID}{position:absolute;inset:0;z-index:36;overflow:hidden;color:var(--igs-ts-ink,#fff);font-family:var(--igs-ts-font,inherit);container-type:size;-webkit-tap-highlight-color:transparent;}
#${TITLE_SCREEN_ID} *{box-sizing:border-box;}
.igs-ts-bg{position:absolute;inset:0;background:#0d0f14 center/cover no-repeat;}
.igs-ts-bg.is-avatar{inset:-24px;filter:blur(18px) brightness(.62) saturate(1.1);background-position:center 22%;}
.igs-ts-bg.is-empty{background:radial-gradient(ellipse 70% 60% at 72% 38%,color-mix(in srgb,var(--igs-ts-accent,#ffd98a) 22%,#14161d),transparent 70%),radial-gradient(ellipse 60% 70% at 18% 80%,color-mix(in srgb,var(--igs-ts-accent,#ffd98a) 10%,#101218),transparent 72%),linear-gradient(160deg,#16181f,#08090c);transition:background .4s ease;}
.igs-ts-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.5),rgba(0,0,0,.12) 55%,rgba(0,0,0,0)),linear-gradient(0deg,rgba(0,0,0,.35),transparent 40%);pointer-events:none;}
.igs-ts-sprite{position:absolute;right:6%;bottom:0;height:92%;max-width:46%;object-fit:contain;object-position:bottom;pointer-events:none;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35));animation:igs-ts-rise .8s ease both;}
.igs-ts-main{position:absolute;left:max(7%,env(safe-area-inset-left,0px));top:50%;transform:translateY(-50%);max-width:60%;display:flex;flex-direction:column;gap:clamp(22px,5cqmin,40px);animation:igs-ts-fade .6s ease both;}
.igs-ts-title{font-size:clamp(40px,11cqmin,88px);font-weight:600;line-height:1.1;letter-spacing:.12em;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.55),0 0 28px rgba(0,0,0,.35);word-break:break-word;}
.igs-ts-tag{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:14px;letter-spacing:.24em;color:#fff;opacity:.75;text-shadow:0 1px 3px rgba(0,0,0,.8);}
.igs-ts-tag::before{content:"";width:22px;height:1px;background:var(--igs-ts-accent);}
.igs-ts-menu{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}
.igs-ts-btn{appearance:none;position:relative;display:flex;align-items:center;min-height:46px;padding:2px 0 2px 26px;border:0;background:none;color:#fff;font:inherit;font-size:clamp(20px,4cqmin,28px);letter-spacing:.3em;text-align:left;text-shadow:0 1px 3px rgba(0,0,0,.8),0 0 16px rgba(0,0,0,.35);opacity:.72;cursor:pointer;transform-origin:0 50%;transition:opacity .25s ease,transform .28s cubic-bezier(.2,.8,.2,1);}
.igs-ts-btn::before{content:"";position:absolute;left:0;top:50%;width:16px;height:1px;background:var(--igs-ts-accent);transform:scaleX(0);transform-origin:left;transition:transform .28s cubic-bezier(.2,.8,.2,1);}
.igs-ts-btn:hover:not(:disabled),.igs-ts-btn:focus-visible{opacity:1;outline:none;transform:scale(1.14);}
.igs-ts-btn:hover:not(:disabled)::before,.igs-ts-btn:focus-visible::before{transform:scaleX(1);}
.igs-ts-btn:disabled{opacity:.5;cursor:default;}
.igs-ts-close{position:absolute;right:max(10px,env(safe-area-inset-right,0px));top:max(8px,env(safe-area-inset-top,0px));z-index:2;width:36px;height:36px;border:0;border-radius:50%;background:rgba(0,0,0,.32);color:#fff;font-size:22px;line-height:36px;cursor:pointer;opacity:.7;}
.igs-ts-close:hover,.igs-ts-close:focus-visible{opacity:1;outline:none;}
.igs-ts-pick{position:absolute;left:max(6%,env(safe-area-inset-left,0px));top:9%;bottom:calc(var(--igs-ts-dialog-h,210px) + 30px);display:flex;align-items:center;min-width:0;max-width:60%;animation:igs-ts-fade .35s ease both;}
.igs-ts-worlds{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:100%;overflow:auto;scrollbar-width:none;}
.igs-ts-worlds::-webkit-scrollbar{display:none;}
.igs-ts-world-name{appearance:none;position:relative;display:flex;align-items:baseline;gap:12px;padding:4px 0 4px 24px;border:0;background:none;color:#fff;font:inherit;font-size:clamp(18px,3.6cqmin,23px);line-height:1.35;letter-spacing:.3em;text-align:left;text-shadow:0 1px 3px rgba(0,0,0,.8),0 0 16px rgba(0,0,0,.35);opacity:.52;cursor:pointer;transform-origin:0 50%;transition:opacity .25s ease,font-size .32s cubic-bezier(.2,.8,.2,1),transform .28s cubic-bezier(.2,.8,.2,1);}
.igs-ts-world-name::before{content:"";position:absolute;left:0;top:50%;width:14px;height:1px;background:var(--igs-ts-accent);transform:scaleX(0);transform-origin:left;transition:transform .28s cubic-bezier(.2,.8,.2,1);}
.igs-ts-world-en{font-size:11px;letter-spacing:.32em;opacity:0;transform:translateX(-6px);transition:opacity .25s ease,transform .28s cubic-bezier(.2,.8,.2,1);}
.igs-ts-world-name:hover,.igs-ts-world-name:focus-visible{opacity:.9;outline:none;transform:scale(1.14);}
.igs-ts-world-name:hover .igs-ts-world-en,.igs-ts-world-name:focus-visible .igs-ts-world-en{opacity:.55;transform:none;}
.igs-ts-world.is-on .igs-ts-world-name{opacity:1;font-size:clamp(28px,7cqmin,46px);letter-spacing:.24em;transform:none;}
.igs-ts-world.is-on .igs-ts-world-name::before{transform:scaleX(1);}
.igs-ts-world.is-on .igs-ts-world-en{opacity:.7;transform:none;color:var(--igs-ts-accent);}
.igs-ts-mark{position:absolute;right:4%;top:44%;transform:translateY(-50%);font-size:clamp(56px,15cqw,190px);font-weight:800;line-height:1;letter-spacing:.04em;color:transparent;-webkit-text-stroke:1px color-mix(in srgb,var(--igs-ts-accent) 38%,transparent);opacity:.55;pointer-events:none;white-space:nowrap;animation:igs-ts-fade .5s ease both;}
.igs-ts-skins{display:flex;flex-wrap:wrap;align-items:center;gap:2px 18px;padding:0 0 10px 24px;animation:igs-ts-fade .3s ease both;}
.igs-ts-skin{appearance:none;position:relative;display:inline-flex;align-items:center;min-height:30px;padding:0;border:0;background:none;color:#fff;font:inherit;font-size:15px;letter-spacing:.16em;text-shadow:0 1px 3px rgba(0,0,0,.85);opacity:.6;cursor:pointer;transform-origin:0 50%;transition:opacity .2s ease,transform .25s cubic-bezier(.2,.8,.2,1);}
.igs-ts-skin:hover,.igs-ts-skin:focus-within,.igs-ts-skin:focus-visible{opacity:.95;outline:none;transform:scale(1.08);}
.igs-ts-skin.is-on{opacity:1;}
.igs-ts-skin.is-on::after{content:"";position:absolute;left:0;right:.14em;bottom:4px;height:1px;background:var(--igs-ts-accent);}
.igs-ts-more select{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer;font-size:16px;}
.igs-ts-more option{color:#222;background:#fff;}
.igs-ts-actions{position:absolute;right:max(5%,env(safe-area-inset-right,0px));top:max(14px,env(safe-area-inset-top,0px));display:flex;align-items:center;gap:24px;animation:igs-ts-fade .35s ease both;}
.igs-ts-link{appearance:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0;border:0;background:none;color:#fff;font:inherit;font-size:16px;letter-spacing:.24em;text-shadow:0 1px 3px rgba(0,0,0,.85);opacity:.7;cursor:pointer;transition:opacity .18s ease;}
.igs-ts-link:hover:not(:disabled),.igs-ts-link:focus-visible{opacity:1;outline:none;}
.igs-ts-link.is-primary{opacity:1;font-size:20px;}
.igs-ts-link.is-primary span{color:var(--igs-ts-accent);font-size:1.2em;transition:transform .18s ease;}
.igs-ts-link.is-primary:hover span{transform:translateX(3px);}
.igs-ts-link:disabled{opacity:.4;cursor:default;}
.igs-ts-stage{position:absolute;inset:0;pointer-events:none;}
#${TITLE_SCREEN_ID} .igs-ts-preview{pointer-events:none;transition:none;animation:igs-ts-fade .3s ease both;}
#${TITLE_SCREEN_ID}[data-igs-title-view="worldview"] .igs-ts-shade{background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.16) 42%,rgba(0,0,0,0) 70%),linear-gradient(180deg,rgba(0,0,0,.32),transparent 22%);}
.igs-ts-backdrop{position:absolute;inset:0;background:#000;animation:igs-ts-fade .4s ease both;}
#${TITLE_SCREEN_ID} .igs-fx-title-card{top:40%;z-index:1;pointer-events:none;}
@keyframes igs-ts-fade{from{opacity:0;}to{opacity:1;}}
@keyframes igs-ts-rise{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
@container (max-width:560px){
  .igs-ts-sprite{left:50%;right:auto;transform:translateX(-50%);height:74%;max-width:90%;opacity:.92;animation:none;}
  .igs-ts-main{left:6%;right:6%;top:auto;bottom:max(28px,env(safe-area-inset-bottom,0px));transform:none;max-width:none;gap:20px;}
  .igs-ts-title{font-size:clamp(40px,13cqw,60px);}
  .igs-ts-menu{gap:0;}
  .igs-ts-btn{min-height:46px;font-size:22px;letter-spacing:.26em;}
  #${TITLE_SCREEN_ID}[data-igs-title-view="worldview"] .igs-ts-sprite{opacity:.4;}
  .igs-ts-pick{left:5%;top:max(60px,8%);max-width:90%;align-items:flex-start;}
  .igs-ts-world-name{font-size:21px;letter-spacing:.26em;padding:5px 0 5px 20px;}
  .igs-ts-world.is-on .igs-ts-world-name{font-size:36px;}
  .igs-ts-mark{top:6%;right:1%;transform:none;writing-mode:vertical-rl;font-size:min(22cqw,9.5cqh);letter-spacing:0;}
  .igs-ts-skins{padding-left:20px;gap:0 16px;}
}
@container (max-height:420px){
  .igs-ts-main{gap:12px;}
  .igs-ts-title{font-size:clamp(30px,11cqh,44px);}
  .igs-ts-btn{min-height:34px;font-size:18px;}
  .igs-ts-pick{top:max(8px,env(safe-area-inset-top,0px));left:4%;right:4%;max-width:none;bottom:auto;align-items:flex-start;}
  .igs-ts-worlds{flex-direction:row;flex-wrap:wrap;gap:0 14px;padding-right:140px;}
  .igs-ts-world{display:contents;}
  .igs-ts-world-name{font-size:15px;letter-spacing:.2em;padding:3px 0 3px 16px;}
  .igs-ts-world.is-on .igs-ts-world-name{font-size:21px;}
  .igs-ts-world-en,.igs-ts-mark{display:none;}
  .igs-ts-skins{order:99;flex-basis:100%;padding:0 0 0 16px;}
  .igs-ts-actions{top:max(4px,env(safe-area-inset-top,0px));gap:16px;}
}
@media (prefers-reduced-motion:reduce){
  #${TITLE_SCREEN_ID} *{animation-duration:.01ms!important;transition:none!important;}
}
`;

export const TITLE_SCREEN_STYLE_TEXT = [BASE_STYLE.trim(), ...DIALOG_SKIN_CHOICES.map(([skin]) => themeRules(skin))].join('\n');
