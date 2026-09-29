import { prefersReducedMotion } from './reduced-motion.js';
import { measureStage, peekSpriteHead, probeSpriteHead, resolveSymbolPlacement } from './fx-anchor.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { resolveWeatherFxTime } from './weather-fx-runtime.js';
import { normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import {
    computeRomanceApproach,
    computeShadeNeck,
    normalizeRomanceFxSettings,
    pickFavorPercent,
    resolveRomanceLevel,
    nsfwCurveFactor,
    resolveRomanceParams,
    scaleRomanceParams,
} from './romance-settings.js';
import { applyRomanceMoments, closeRomanceMoments, playRivalSymbol } from './romance-moments.js';
import { closeRomanceActions, syncRomanceActions } from './romance-actions.js';

// 状态全部挂在 #igs-stage-motion 上（data-igs-rm-* 与 --igs-rm-*），皮肤可覆写；环境层插在立绘之前（背景之上、立绘之下）。
const ATTRS = Object.freeze([
    'data-igs-rm-level', 'data-igs-rm-favor', 'data-igs-rm-strength', 'data-igs-rm-tone', 'data-igs-rm-approach', 'data-igs-rm-breathe',
    'data-igs-rm-glow', 'data-igs-rm-bokeh', 'data-igs-rm-backlight', 'data-igs-rm-shade', 'data-igs-rm-face',
]);
const VARS = Object.freeze([
    '--igs-rm-dx', '--igs-rm-scale', '--igs-rm-origin-x', '--igs-rm-origin-y', '--igs-rm-bg-blur',
    '--igs-rm-glow', '--igs-rm-bokeh', '--igs-rm-backlight', '--igs-rm-light-x', '--igs-rm-light-y',
    '--igs-rm-neck', '--igs-rm-shade-end',
]);
// 只开剪影、没开亲密演出时的逆光强度：让黑色剪影在 NSFW 黑幕上仍有轮廓。
const SHADE_ONLY_BACKLIGHT = 0.6;
const MOON_TIMES = new Set(['night', 'midnight']);

const states = new WeakMap();
// 好感按角色缓存：状态栏只在说话人页面有数据，旁白页沿用该角色最近一次的数值，避免暖光逐页闪烁。
const favorCache = new Map();
const FAVOR_CACHE_LIMIT = 64;

function rememberFavor(hud, words) {
    const name = String((hud && hud.character) || '').trim();
    const value = name ? pickFavorPercent(hud.metrics, words) : null;
    if (value == null) return;
    favorCache.delete(name);
    favorCache.set(name, value);
    while (favorCache.size > FAVOR_CACHE_LIMIT) favorCache.delete(favorCache.keys().next().value);
}

// 修罗场：romance 区间的对象（标签第 3 栏，缺省为区间开启后第一个出场的立绘角色）按区间记忆。
const rangeOwners = new Map();

function characterKey(sceneAssets, name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    return resolveCharacterKey(assets.characters, assets.characterAliases, raw) || '';
}

// 返回当前立绘角色是否为「另一位已登记角色」（非本区间对象）。
function resolveRival(snapshot, content, sceneAssets) {
    const fx = content.fx || {};
    if (!fx.romance || Number(fx.romanceAt) < 0) return false;
    const current = characterKey(sceneAssets, content.spriteCharacter || content.speaker);
    const rangeKey = `${snapshot.messageId}:${fx.romanceAt}`;
    let owner = characterKey(sceneAssets, fx.romanceTarget) || String(fx.romanceTarget || '').trim();
    if (!owner) {
        owner = rangeOwners.get(rangeKey) || '';
        if (!owner && current) {
            owner = current;
            rangeOwners.set(rangeKey, owner);
            while (rangeOwners.size > FAVOR_CACHE_LIMIT) rangeOwners.delete(rangeOwners.keys().next().value);
        }
    }
    return Boolean(current && owner && current !== owner);
}

// 心形按钮落在头部右上方（复用漫画符号「心」的落点）；原图尺寸未知时贴在立绘上方中间。
function actionButtonPlacement(geo, sprite, head) {
    if (sprite.naturalW > 0 && sprite.naturalH > 0) {
        const placement = resolveSymbolPlacement('heart', { ...geo, sprite: { ...sprite, head } });
        if (placement) return placement;
    }
    const posX = Number.isFinite(Number(sprite.posX)) ? Number(sprite.posX) : 50;
    const scale = Number.isFinite(Number(sprite.scale)) ? Number(sprite.scale) : 100;
    const centerPct = (100 - scale) * posX / 100 + scale / 2;
    return { x: geo.stageW * centerPct / 100, y: geo.stageH * 0.18 };
}

function favorActive(settings, content, hasSprite) {
    if (!settings.favorAmbience || !hasSprite) return false;
    const name = String(content.spriteCharacter || content.speaker || '').trim();
    const value = name ? favorCache.get(name) : undefined;
    return value != null && value >= settings.favorThreshold;
}

function setAttr(el, name, on, value = '1') {
    if (!el || typeof el.setAttribute !== 'function') return;
    if (on) {
        if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    } else if (el.hasAttribute(name)) {
        el.removeAttribute(name);
    }
}

function setVar(el, name, value) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, String(value));
}

function stageOf(root) {
    return (root && typeof root.querySelector === 'function' && root.querySelector('#igs-stage-motion')) || root;
}

function ensureBackLayer(state, stage, spriteEl) {
    if (state.back && state.back.parentNode) return state.back;
    const doc = stage.ownerDocument;
    if (!doc || !spriteEl || spriteEl.parentNode !== stage) return null;
    const back = doc.createElement('div');
    back.className = 'igs-rm-back';
    for (const name of ['glow', 'bokeh', 'backlight']) {
        const layer = doc.createElement('div');
        layer.className = `igs-rm-${name}`;
        back.appendChild(layer);
    }
    stage.insertBefore(back, spriteEl);
    state.back = back;
    return back;
}

export function cancelRomanceFx(root) {
    const stage = stageOf(root);
    if (!stage) return;
    closeRomanceActions(root);
    for (const name of ATTRS) setAttr(stage, name, false);
    for (const name of VARS) setVar(stage, name, null);
    const state = states.get(stage);
    const back = state && state.back;
    if (back && typeof back.remove === 'function') back.remove();
    else if (back && back.parentNode && typeof back.parentNode.removeChild === 'function') back.parentNode.removeChild(back);
    states.delete(stage);
}

// 关闭阅读器：清环境层、关系卡与计时器，并清空好感缓存与关系基线（换聊天后同名角色不串数据）。
export function closeRomanceFx(root) {
    cancelRomanceFx(root);
    closeRomanceMoments(root);
    favorCache.clear();
    rangeOwners.clear();
}

function pageKindOf(content) {
    if (content.htmlCardPage === true) return 'card';
    return content.textType === 'chat' ? 'chat' : 'text';
}

// 立绘原图尺寸来自漫画符号共用的透明通道探测缓存；尚未探测完时先按无头部处理（剪影整张、放大原点退回默认），
// 探测完成后用上一次的快照重算一次几何。
function spriteGeometry(state, root, sprite) {
    if (!sprite) return { sprite: null, manualHead: null, anyHead: null };
    const probed = peekSpriteHead(sprite.url);
    if (!probed && !(sprite.head && sprite.head.aspect) && state.probing !== sprite.url && stageOf(root).ownerDocument) {
        state.probing = sprite.url;
        probeSpriteHead(sprite.url, stageOf(root).ownerDocument).then(() => {
            if (states.get(stageOf(root)) !== state || !state.last || !peekSpriteHead(sprite.url)) return;
            if (state.last.ctx.sprite && state.last.ctx.sprite.url === sprite.url) applyRomanceToDom(root, state.last.snapshot, state.last.ctx);
        }, () => {});
    }
    // 手动标定的头部自带原图高宽比（与漫画符号同源），不必等探测即可定位。
    const aspect = sprite.head && Number(sprite.head.aspect) > 0 ? Number(sprite.head.aspect) : 0;
    const dims = probed ? { naturalW: probed.naturalW, naturalH: probed.naturalH } : aspect ? { naturalW: 1, naturalH: aspect } : null;
    const sized = dims ? { ...sprite, ...dims } : sprite;
    const manualHead = dims && sprite.head ? sprite.head : null;
    return { sprite: sized, manualHead, anyHead: dims ? manualHead || (probed && probed.head) || null : null };
}

// ctx.sprite 为 reader-dom-render 已算好的 fxSprite：{ url, posX, posY, scale, head(手动标定) }，编辑立绘时为 null。
export function applyRomanceToDom(root, snapshot, ctx = {}) {
    const stage = stageOf(root);
    const spriteEl = stage && typeof stage.querySelector === 'function' ? stage.querySelector('#igs-sprite') : null;
    const content = (snapshot && snapshot.content) || {};
    const reader = (snapshot && snapshot.readerSettings) || {};
    const settings = normalizeRomanceFxSettings(reader.romanceFx);
    const pageKind = pageKindOf(content);
    const nsfw = content.sceneNsfw === true;
    const level = resolveRomanceLevel({ settings, fx: content.fx, nsfw, pageKind });
    const hasSprite = Boolean(ctx.sprite && ctx.sprite.url && spriteEl);
    const shade = nsfw && pageKind === 'text' && hasSprite && normalizeStatusHudSettings(reader.statusHud).nsfwSpriteMode === 'shade';
    let moments = { played: [], typewriter: null };
    if (settings.enabled) {
        rememberFavor(content.statusHud, settings.favorWords);
        moments = applyRomanceMoments(root, snapshot, ctx);
    }
    // 好感常驻 0.5 档：只在没有整数档位的普通文字页生效。
    const favor = settings.enabled && !level && !nsfw && pageKind === 'text' && favorActive(settings, content, hasSprite);
    if (!stage || (!level && !shade && !favor)) {
        cancelRomanceFx(root);
        return { level: 0, shade: false, favor: false, typewriter: moments.typewriter };
    }

    let state = states.get(stage);
    if (!state) {
        state = { back: null, probing: '', last: null };
        states.set(stage, state);
    }
    state.last = { snapshot, ctx };
    const reduced = ctx.reducedMotion === true || (ctx.reducedMotion !== false && prefersReducedMotion());
    // NSFW 强度曲线：content.nsfwSpan 由 reader-host 在亲密演出开启时按楼层算出。
    const curve = level === 3 && settings.nsfwCurve ? nsfwCurveFactor(content.nsfwSpan) : 1;
    const params = scaleRomanceParams(resolveRomanceParams(level || (favor ? 'favor' : 0), settings.strength), curve);
    const geo = measureStage(stage) || { stageW: 0, stageH: 0 };
    const { sprite, manualHead, anyHead } = spriteGeometry(state, root, hasSprite ? ctx.sprite : null);

    setAttr(stage, 'data-igs-rm-level', level > 0, String(level));
    setAttr(stage, 'data-igs-rm-favor', favor);
    setAttr(stage, 'data-igs-rm-strength', level > 0 || favor, settings.strength);
    const rival = settings.rival && !nsfw && (level === 1 || level === 2) && hasSprite && resolveRival(snapshot, content, reader._sceneAssets);
    setAttr(stage, 'data-igs-rm-tone', true, rival ? 'rival' : MOON_TIMES.has(resolveWeatherFxTime(content.sceneTime)) ? 'moon' : 'warm');

    // 多人同屏（ctx.sprite.multi）时不向中线收拢，否则说话人会压到陪衬上；只保留以头部为原点的放大。
    const approach = level > 0 && settings.approach && sprite
        ? computeRomanceApproach({ ...geo, sprite, head: anyHead, params: sprite.multi ? { ...params, pull: 0 } : params })
        : null;
    setAttr(stage, 'data-igs-rm-approach', Boolean(approach));
    setVar(stage, '--igs-rm-dx', approach ? `${approach.dx}%` : null);
    setVar(stage, '--igs-rm-scale', approach ? approach.zoom : null);
    setVar(stage, '--igs-rm-origin-x', approach ? `${approach.originX}%` : null);
    setVar(stage, '--igs-rm-origin-y', approach ? `${approach.originY}%` : null);
    setAttr(stage, 'data-igs-rm-breathe', level >= 2 && hasSprite && !reduced);

    const ambient = level > 0 || favor;
    const glow = ambient && settings.glow;
    const bokeh = ambient && settings.bokeh;
    const backlight = level > 0
        ? (settings.backlight && params.backlight > 0 ? params.backlight : 0)
        : (shade ? SHADE_ONLY_BACKLIGHT : 0);
    if (glow || bokeh || backlight) ensureBackLayer(state, stage, spriteEl);
    setAttr(stage, 'data-igs-rm-glow', glow);
    setVar(stage, '--igs-rm-glow', glow ? params.glow : null);
    setVar(stage, '--igs-rm-bg-blur', glow ? `${params.bgBlur}px` : null);
    setAttr(stage, 'data-igs-rm-bokeh', bokeh);
    setVar(stage, '--igs-rm-bokeh', bokeh ? params.bokeh : null);
    setAttr(stage, 'data-igs-rm-backlight', backlight > 0);
    setVar(stage, '--igs-rm-backlight', backlight > 0 ? backlight : null);
    // 逆光打在头部后方；没有头部数据时按立绘水平位置取一个偏上的点。
    const light = computeRomanceApproach({ ...geo, sprite, head: anyHead, params: { pull: 0, zoom: 1 } });
    setVar(stage, '--igs-rm-light-x', backlight > 0 ? `${light ? light.originX : 50}%` : null);
    setVar(stage, '--igs-rm-light-y', backlight > 0 ? `${light ? light.originY : 35}%` : null);

    // 仅露脸剪影：只信任手动标定的头部，否则整张剪影。
    const neck = shade ? computeShadeNeck({ ...geo, sprite, head: manualHead }) : null;
    setAttr(stage, 'data-igs-rm-shade', shade);
    setAttr(stage, 'data-igs-rm-face', Boolean(neck));
    setVar(stage, '--igs-rm-neck', neck ? `${neck.neck}%` : null);
    setVar(stage, '--igs-rm-shade-end', neck ? `${neck.end}%` : null);
    // 快捷动作：只在 1、2 档或好感常驻档、有立绘的普通文字页显示；NSFW 不显示。
    const actionsOn = settings.quickActions && !nsfw && hasSprite && sprite && (level === 1 || level === 2 || favor) && geo.stageW > 0;
    syncRomanceActions(root, {
        show: actionsOn,
        placement: actionsOn ? actionButtonPlacement(geo, sprite, anyHead) : null,
        actions: settings.actions,
        character: content.spriteCharacter || content.speaker || '',
        pageKey: `${snapshot.messageId}:${content.currentIndex}`,
    });
    if (rival && !reduced && sprite && sprite.naturalW > 0 && geo.stageW > 0) {
        const placement = resolveSymbolPlacement('heartbreak', { ...geo, sprite: { ...sprite, head: anyHead } });
        playRivalSymbol(root, placement, `${snapshot.messageId}:${content.currentIndex}`, ctx);
    }
    return { level, shade, favor, rival, curve, face: Boolean(neck), approach, typewriter: moments.typewriter };
}
