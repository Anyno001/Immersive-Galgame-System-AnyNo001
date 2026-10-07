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

// 第 0 层的主界面：阅读器停在开场白第一页时先盖一层标题画面（开始 / 继续 / 世界观 / 设置），
// 新聊天点开始先进世界观页，确认后写进角色卡、过一张开场标题卡再演出第 0 层。
// 画面只读快照与传入的回调，不碰存档；外观按皮肤取过场标题卡同一份主题（字体、墨色、底纱、卡片底）。
export const TITLE_SCREEN_ID = 'igs-title-screen';
export const TITLE_SKIN_ATTR = 'data-igs-title-skin';
const STYLE_ID = 'igs-title-screen-style';
const OPENING_CARD_MS = 2200;

const WORLDVIEW_NOTES = Object.freeze({
    modern: '现代日常演出与配乐，报幕、通知按现代风格书写',
    ancient: '宣纸竖幅报幕、家仆通报与古风配乐，AI 不写现代物件',
    fantasy: '剑与魔法的演出换皮与史诗配乐，AI 写信使、钟楼时刻',
    scifi: '全息报幕与电子配乐，AI 写通讯器、舰内时',
    apocalypse: '废土报幕与荒凉配乐，AI 写对讲机、幸存天数',
    taisho: '和洋折衷的报幕与复古配乐，AI 写电报、座机',
    magic: '咒语、猫头鹰等魔法日常演出与学院配乐',
    horror: '恐怖演出、阴森配乐与会出错的打字机',
});

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

// 主界面按钮 → 新的界面状态，以及要阅读器去做的事：start / continue / settings / close / save / save-start。
export function reduceTitleAction(gate, model, act, value) {
    const base = { ...(gate || createTitleGate()) };
    const pickFor = (id) => pickWorldviewDialogSkin(id, { cardSkin: model.cardSkin, globalSkin: model.globalSkin, horrorStyle: model.horrorStyle });
    switch (act) {
        case 'start':
            return model.newChat ? { gate: { ...base, view: 'worldview', pick: null } } : { gate: base, effect: 'start' };
        case 'continue':
        case 'settings':
        case 'close':
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
            return { gate: base, effect: model.newChat ? 'save-start' : 'save', pick: { ...model.pick } };
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
export function buildTitleScreenModel({ snapshot, gate, card = {}, globalSkin, resolveUrl } = {}) {
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
    };
}

function worldLabel(id) {
    const hit = WORLDVIEWS.find((item) => item.id === id);
    return hit ? hit.label : '现代';
}

// 背景与立绘地址可能是很长的 data URL：HTML 里只放占位，地址由 syncMedia 直接写到元素上。
function backdropHtml(model) {
    const kind = model.background ? '' : model.avatar ? ' is-avatar' : ' is-empty';
    const sprite = model.sprite && model.view === 'menu' ? '<img class="igs-ts-sprite" alt="">' : '';
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
        ['worldview', '世界观'],
        ['settings', '设置'],
    ].filter(Boolean).map(([act, label]) => `<button type="button" class="igs-ts-btn" data-ts-act="${act}"${model.busy ? ' disabled' : ''}>${esc(label)}</button>`).join('');
    return `${backdropHtml(model)}
<button type="button" class="igs-ts-close" data-ts-act="close" aria-label="关闭阅读器">×</button>
<div class="igs-ts-main">
  <div class="igs-ts-heading"><div class="igs-ts-title">${esc(model.title)}</div><div class="igs-ts-tag">${esc(worldLabel(model.worldview))} · ${esc(dialogSkinLabel(model.skin))}</div></div>
  <nav class="igs-ts-menu" aria-label="主界面">${items}</nav>
</div>`;
}

function sampleHtml(skin, name, line) {
    return `<span class="igs-ts-sample" ${TITLE_SKIN_ATTR}="${esc(skin)}"><span class="igs-ts-sample-box"><span class="igs-ts-sample-name">${esc(name)}</span><span class="igs-ts-sample-line">${esc(line)}</span></span></span>`;
}

function worldviewHtml(model) {
    const name = model.title === '序章' ? '旁白' : model.title;
    const cards = WORLDVIEWS.filter((item) => item.ready).map(({ id, label }) => {
        const on = id === model.pick.worldview;
        const skin = on ? model.pick.skin : pickWorldviewDialogSkin(id, { cardSkin: model.cardSkin, globalSkin: model.globalSkin, horrorStyle: model.horrorStyle });
        return `<button type="button" class="igs-ts-world${on ? ' is-on' : ''}" data-ts-act="world:${esc(id)}" aria-pressed="${on ? 'true' : 'false'}">
<span class="igs-ts-world-name">${esc(label)}</span>${sampleHtml(skin, name, '「……就从这里开始吧。」')}<span class="igs-ts-world-note">${esc(WORLDVIEW_NOTES[id] || '')}</span></button>`;
    }).join('');
    const recommended = worldviewDialogSkins(model.pick.worldview);
    const chips = recommended.map((skin) => {
        const on = skin === model.pick.skin;
        return `<button type="button" class="igs-ts-chip${on ? ' is-on' : ''}" data-ts-act="skin:${esc(skin)}" aria-pressed="${on ? 'true' : 'false'}">${esc(dialogSkinLabel(skin))}</button>`;
    }).join('');
    const others = DIALOG_SKIN_CHOICES.filter(([skin]) => !recommended.includes(skin));
    const otherOn = !recommended.includes(model.pick.skin);
    const select = `<select class="igs-ts-other" data-ts-skin-select aria-label="其他对话框风格"><option value=""${otherOn ? '' : ' selected'}>其他…</option>${others.map(([skin, label]) => `<option value="${esc(skin)}"${skin === model.pick.skin ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    const confirm = model.newChat ? '就这样，开始' : '保存';
    return `${backdropHtml(model)}
<div class="igs-ts-panel" role="dialog" aria-label="选择世界观">
  <div class="igs-ts-panel-head"><div class="igs-ts-panel-title">选择世界观</div><div class="igs-ts-panel-hint">对话框、演出、配乐和 AI 报幕用词会一起换；记在这张角色卡上，以后在主界面的「世界观」里还能改。</div></div>
  <div class="igs-ts-worlds">${cards}</div>
  <div class="igs-ts-skins"><span class="igs-ts-skins-label">对话框</span>${chips}${select}</div>
  <div class="igs-ts-actions"><button type="button" class="igs-ts-btn is-ghost" data-ts-act="back"${model.busy ? ' disabled' : ''}>返回</button><button type="button" class="igs-ts-btn is-primary" data-ts-act="confirm"${model.busy ? ' disabled' : ''}>${esc(confirm)}</button></div>
</div>`;
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
    if (theme.card) {
        rules.push(`.igs-title-screen${scope} .igs-ts-main,.igs-title-screen${scope} .igs-ts-panel,${scope}>.igs-ts-sample-box{${theme.card}}`);
    }
    return rules.join('\n');
}

const BASE_STYLE = `
#${TITLE_SCREEN_ID}{position:absolute;inset:0;z-index:36;overflow:hidden;color:var(--igs-ts-ink,#fff);font-family:var(--igs-ts-font,inherit);container-type:size;-webkit-tap-highlight-color:transparent;}
#${TITLE_SCREEN_ID} *{box-sizing:border-box;}
.igs-ts-bg{position:absolute;inset:0;background:#0d0f14 center/cover no-repeat;}
.igs-ts-bg.is-avatar{inset:-24px;filter:blur(18px) brightness(.62) saturate(1.1);background-position:center 22%;}
.igs-ts-bg.is-empty{background:radial-gradient(ellipse at 30% 40%,color-mix(in srgb,var(--igs-ts-accent,#ffd98a) 18%,#14161d),#090a0e 72%);}
.igs-ts-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.5),rgba(0,0,0,.12) 55%,rgba(0,0,0,0)),linear-gradient(0deg,rgba(0,0,0,.35),transparent 40%);pointer-events:none;}
.igs-ts-sprite{position:absolute;right:6%;bottom:0;height:92%;max-width:46%;object-fit:contain;object-position:bottom;pointer-events:none;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35));animation:igs-ts-rise .8s ease both;}
.igs-ts-main{position:absolute;left:7%;top:50%;transform:translateY(-50%);width:min(340px,42%);display:flex;flex-direction:column;gap:18px;padding:26px 26px 22px;background:var(--igs-ts-veil);border-top:1px solid var(--igs-ts-rule);border-bottom:1px solid var(--igs-ts-rule);backdrop-filter:blur(6px);animation:igs-ts-fade .6s ease both;}
.igs-ts-title{font-size:clamp(24px,5.2cqmin,44px);line-height:1.2;letter-spacing:.08em;text-shadow:var(--igs-ts-title-halo);word-break:break-word;}
.igs-ts-tag{margin-top:6px;font-size:13px;letter-spacing:.14em;opacity:.78;text-shadow:var(--igs-ts-halo);}
.igs-ts-menu{display:flex;flex-direction:column;gap:6px;}
.igs-ts-btn{appearance:none;display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:6px 14px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:17px;letter-spacing:.24em;text-align:left;text-shadow:var(--igs-ts-halo);cursor:pointer;transition:background .18s ease,transform .18s ease;}
.igs-ts-btn::before{content:"";width:7px;height:7px;flex:0 0 auto;transform:rotate(45deg) scale(.4);background:var(--igs-ts-accent);opacity:0;transition:opacity .18s ease,transform .18s ease;}
.igs-ts-btn:hover:not(:disabled),.igs-ts-btn:focus-visible{background:color-mix(in srgb,var(--igs-ts-accent) 16%,transparent);outline:none;transform:translateX(3px);}
.igs-ts-btn:hover:not(:disabled)::before,.igs-ts-btn:focus-visible::before{opacity:1;transform:rotate(45deg) scale(1);}
.igs-ts-btn:disabled{opacity:.5;cursor:default;}
.igs-ts-close{position:absolute;right:max(10px,env(safe-area-inset-right,0px));top:max(8px,env(safe-area-inset-top,0px));z-index:2;width:36px;height:36px;border:0;border-radius:50%;background:rgba(0,0,0,.32);color:#fff;font-size:22px;line-height:36px;cursor:pointer;opacity:.7;}
.igs-ts-close:hover,.igs-ts-close:focus-visible{opacity:1;outline:none;}
.igs-ts-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(860px,92%);max-height:92%;display:flex;flex-direction:column;gap:12px;padding:18px 20px 16px;background:var(--igs-ts-veil);border-top:1px solid var(--igs-ts-rule);border-bottom:1px solid var(--igs-ts-rule);backdrop-filter:blur(8px);animation:igs-ts-fade .35s ease both;}
.igs-ts-panel-title{font-size:20px;letter-spacing:.2em;text-shadow:var(--igs-ts-title-halo);}
.igs-ts-panel-hint{margin-top:4px;font-size:12.5px;line-height:1.6;opacity:.8;}
.igs-ts-worlds{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;overflow:auto;min-height:0;padding:2px;}
.igs-ts-world{appearance:none;display:flex;flex-direction:column;gap:7px;min-width:0;padding:10px 10px 9px;border:1px solid color-mix(in srgb,var(--igs-ts-ink) 18%,transparent);border-radius:8px;background:color-mix(in srgb,var(--igs-ts-veil) 55%,transparent);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .18s ease,box-shadow .18s ease;}
.igs-ts-world:hover,.igs-ts-world:focus-visible{border-color:var(--igs-ts-accent);outline:none;}
.igs-ts-world.is-on{border-color:var(--igs-ts-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--igs-ts-accent) 45%,transparent);}
.igs-ts-world-name{font-size:15px;letter-spacing:.2em;}
.igs-ts-world-note{font-size:11.5px;line-height:1.5;opacity:.78;}
.igs-ts-sample{display:block;min-width:0;color:var(--igs-ts-ink);font-family:var(--igs-ts-font,inherit);}
.igs-ts-sample-box{position:relative;display:flex;flex-direction:column;gap:3px;min-height:52px;padding:8px 10px;background:var(--igs-ts-veil);border-top:1px solid var(--igs-ts-rule);border-bottom:1px solid var(--igs-ts-rule);overflow:hidden;}
.igs-ts-sample-name{font-size:11px;letter-spacing:.12em;color:var(--igs-ts-accent);text-shadow:var(--igs-ts-halo);}
.igs-ts-sample-line{font-size:12.5px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:var(--igs-ts-halo);}
.igs-ts-skins{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.igs-ts-skins-label{font-size:13px;letter-spacing:.14em;opacity:.8;margin-right:4px;}
.igs-ts-chip,.igs-ts-other{appearance:none;min-height:32px;padding:4px 12px;border:1px solid color-mix(in srgb,var(--igs-ts-ink) 25%,transparent);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;}
.igs-ts-other{padding-right:10px;background:color-mix(in srgb,var(--igs-ts-veil) 70%,transparent);}
.igs-ts-other option{color:#222;background:#fff;}
.igs-ts-chip.is-on{border-color:var(--igs-ts-accent);background:color-mix(in srgb,var(--igs-ts-accent) 22%,transparent);}
.igs-ts-actions{display:flex;justify-content:flex-end;gap:10px;}
.igs-ts-actions .igs-ts-btn{width:auto;justify-content:center;padding:6px 20px;letter-spacing:.16em;border:1px solid color-mix(in srgb,var(--igs-ts-ink) 25%,transparent);}
.igs-ts-actions .igs-ts-btn::before{display:none;}
.igs-ts-actions .igs-ts-btn.is-primary{border-color:var(--igs-ts-accent);background:color-mix(in srgb,var(--igs-ts-accent) 26%,transparent);}
.igs-ts-backdrop{position:absolute;inset:0;background:#000;animation:igs-ts-fade .4s ease both;}
#${TITLE_SCREEN_ID} .igs-fx-title-card{top:40%;z-index:1;pointer-events:none;}
@keyframes igs-ts-fade{from{opacity:0;}to{opacity:1;}}
@keyframes igs-ts-rise{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
@container (max-width:560px){
  .igs-ts-sprite{left:50%;right:auto;transform:translateX(-50%);height:74%;max-width:90%;opacity:.92;animation:none;}
  .igs-ts-main{left:4%;right:4%;top:auto;bottom:max(14px,env(safe-area-inset-bottom,0px));transform:none;width:auto;gap:12px;padding:16px 16px 12px;}
  .igs-ts-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;}
  .igs-ts-btn{min-height:44px;font-size:16px;letter-spacing:.16em;}
  .igs-ts-panel{width:96%;max-height:96%;padding:14px 12px 12px;gap:10px;}
  .igs-ts-worlds{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
  .igs-ts-panel-hint{font-size:12px;}
}
@container (max-height:420px){
  .igs-ts-main{gap:10px;padding:14px 18px 12px;}
  .igs-ts-btn{min-height:34px;}
  .igs-ts-panel{gap:8px;padding:12px 16px 10px;}
  .igs-ts-panel-title{font-size:17px;}
  .igs-ts-panel-hint{display:none;}
  .igs-ts-worlds{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
  .igs-ts-world{gap:4px;padding:6px 8px;}
  .igs-ts-world-name{font-size:13px;}
  .igs-ts-world-note{display:none;}
  .igs-ts-sample-box{min-height:0;gap:1px;padding:4px 8px;}
}
@media (prefers-reduced-motion:reduce){
  #${TITLE_SCREEN_ID} *{animation-duration:.01ms!important;transition:none!important;}
}
`;

export const TITLE_SCREEN_STYLE_TEXT = [BASE_STYLE.trim(), ...DIALOG_SKIN_CHOICES.map(([skin]) => themeRules(skin))].join('\n');
