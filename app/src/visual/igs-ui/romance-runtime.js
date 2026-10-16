import { prefersReducedMotion } from './reduced-motion.js';
import { measureStage, peekSpriteHead, probeSpriteHead, resolveSymbolPlacement } from './fx-anchor.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { isPlayerName } from '../../scene/battle-context.js';
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
import { applyRomanceMoments, closeRomanceMoments, playRivalSymbol, slowerTypewriterSpeed } from './romance-moments.js';
import { closeRomanceActions, syncRomanceActions } from './romance-actions.js';
import { closeRomanceIntimate, syncRomanceIntimate } from './romance-intimate-runtime.js';
import { resolveIntimatePhase } from './romance-intimate.js';
import {
    detectImaginedTarget,
    detectNoiseByText,
    detectSoloByText,
    isNudeOutfit,
    pickCgShot,
    planUndress,
    registeredNames,
    resolvePageSense,
    senseMix,
} from './romance-senses.js';
import { cancelCgPan, syncCgPan } from './romance-cg-pan.js';
import { closeDreamFigure, syncDreamFigure } from './romance-solo.js';
import { resolveSpriteAsset } from '../../scene/asset-match.js';

// 状态全部挂在 #igs-stage-motion 上（data-igs-rm-* 与 --igs-rm-*），皮肤可覆写；环境层插在立绘之前（背景之上、立绘之下）。
const ATTRS = Object.freeze([
    'data-igs-rm-level', 'data-igs-rm-favor', 'data-igs-rm-strength', 'data-igs-rm-tone', 'data-igs-rm-approach', 'data-igs-rm-breathe',
    'data-igs-rm-glow', 'data-igs-rm-bokeh', 'data-igs-rm-backlight', 'data-igs-rm-shade', 'data-igs-rm-face', 'data-igs-rm-asset',
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
// 脱衣判定：角色 → 上一页是否裸体（衣柜路线）。关闭阅读器时清空。
const nudeMemory = new Map();
// 独处：没有标签、靠正文认出的独处段，以及每段「想着谁」，都按「楼层:段起点」记忆。关闭阅读器时清空。
const soloSpans = new Set();
const imagined = new Map();
const SOLO_MEMORY_LIMIT = 64;

function remember(map, key, value) {
    if (map instanceof Set) map.add(key);
    else map.set(key, value);
    while (map.size > SOLO_MEMORY_LIMIT) map.delete(map.keys().next().value);
}

// 返回 { target } 或 null。标签区间优先；没有标签时，情事段里出现明确说法就把这一段记为独处（往后生效）。
// 想着谁：标签没写时从正文认已登记角色，认到后这一段都沿用。
function resolveSolo(settings, snapshot, content, sceneAssets) {
    if (!settings.solo || content.sceneNsfw !== true) return null;
    const fx = content.fx || {};
    const span = content.nsfwSpan;
    const key = span ? `${snapshot.messageId}:${Number(content.currentIndex) - span.index}` : '';
    if (!fx.solo && key && settings.senseWords && detectSoloByText(content.text)) remember(soloSpans, key);
    if (!fx.solo && !(key && soloSpans.has(key))) return null;
    let target = fx.solo ? String(fx.solo.target || '').trim() : '';
    if (!target && key) target = imagined.get(key) || '';
    if (!target && key && settings.senseWords) {
        target = detectImaginedTarget(content.text, registeredNames(sceneAssets), content.spriteCharacter || content.speaker);
        if (target) remember(imagined, key, target);
    }
    return { target };
}

// 想象中的对象：用这个角色的立绘（平常的衣服、害羞的表情）；没有立绘就不显示。
function imaginedUrl(target, sceneAssets, ctx) {
    if (!target) return '';
    const hit = resolveSpriteAsset(target, '害羞', { sceneAssets });
    const raw = hit && hit.url ? String(hit.url) : '';
    return raw && typeof ctx.resolveAssetUrl === 'function' ? String(ctx.resolveAssetUrl(raw) || '').trim() : raw;
}
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

function characterKey(sceneAssets, name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    return resolveCharacterKey(assets.characters, assets.characterAliases, raw) || '';
}

// 修罗场：只认 romance 标签第 3 栏写明的对象（与同屏 resolveRomanceRivalTarget 一致）。
// 对象栏缺省时不猜——按「区间里第一个出场的人」猜会猜错，心动 / 动情段里换人说话就频繁弹心碎。
// 主角本人不算对象也不算情敌；情敌只认当过 romance 对象的角色（好感不一定是爱情，系统 / 家人 / 朋友插话不算）。
const romanceTargets = new Set();

function romanceOwner(content, sceneAssets, userName) {
    const fx = content.fx || {};
    if (!fx.romance || Number(fx.romanceAt) < 0) return '';
    const target = String(fx.romanceTarget || '').trim();
    if (!target || isPlayerName(target, userName)) return '';
    return characterKey(sceneAssets, target) || target;
}

// 每页都记（不论档位、有没有立绘），往后翻到其他段落时才认得出谁是情敌。
function rememberRomanceTarget(content, sceneAssets, userName) {
    const owner = romanceOwner(content, sceneAssets, userName);
    if (owner) remember(romanceTargets, owner);
}

// 返回当前立绘角色是否为「另一位当过恋爱对象的角色」（非本区间对象）。
function resolveRival(content, sceneAssets, userName) {
    const owner = romanceOwner(content, sceneAssets, userName);
    const name = String(content.spriteCharacter || content.speaker || '').trim();
    if (!owner || isPlayerName(name, userName)) return false;
    const current = characterKey(sceneAssets, name);
    return Boolean(current && current !== owner && romanceTargets.has(current));
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
    cancelCgPan(stage);
    closeDreamFigure(stage);
    setAttr(root, 'data-igs-rm-sense', false);
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
    closeRomanceIntimate(root);
    closeRomanceMoments(root);
    favorCache.clear();
    nudeMemory.clear();
    soloSpans.clear();
    imagined.clear();
}

function lowQuality(root, stage) {
    const overlay = root && root.id === 'igs-overlay'
        ? root
        : stage && typeof stage.closest === 'function' ? stage.closest('#igs-overlay') : null;
    return Boolean(overlay && typeof overlay.getAttribute === 'function' && overlay.getAttribute('data-igs-quality') === 'low');
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
        rememberRomanceTarget(content, reader._sceneAssets, ctx.userName);
        moments = applyRomanceMoments(root, snapshot, ctx);
    }
    // 脱衣：每个文字页都记一次「这个角色现在是不是裸体」，这样进入亲密段时才知道是不是刚脱。
    const undress = settings.enabled && settings.undress && pageKind === 'text'
        ? planUndress(nudeMemory, {
            character: content.spriteCharacter,
            nude: content.spriteCharacter ? isNudeOutfit(reader._sceneAssets, content.spriteCharacter, content.spriteOutfit) : false,
            text: content.text,
        })
        : '';
    // 好感常驻 0.5 档：只在没有整数档位的普通文字页生效。
    const favor = settings.enabled && !level && !nsfw && pageKind === 'text' && favorActive(settings, content, hasSprite);
    if (!stage || (!level && !shade && !favor)) {
        cancelRomanceFx(root);
        syncRomanceIntimate(root, { level: 0 });
        return { level: 0, shade: false, favor: false, whisper: false, typewriter: moments.typewriter };
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
    const rival = settings.rival && !nsfw && (level === 1 || level === 2) && hasSprite && resolveRival(content, reader._sceneAssets, ctx.userName);
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
    // 生成的 CG / 插图是画面主体：不柔焦，环境层退到边缘（遮罩见 romance-intimate-style）。
    const asset = content.illustrationActive === true;
    setAttr(stage, 'data-igs-rm-asset', asset);
    setAttr(stage, 'data-igs-rm-glow', glow);
    setVar(stage, '--igs-rm-glow', glow ? params.glow : null);
    setVar(stage, '--igs-rm-bg-blur', glow && !asset ? `${params.bgBlur}px` : null);
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
    // 独处（情事档）：换声景；门外的动静标签随时可用，正文识别只在独处里做。
    const solo = level === 3 ? resolveSolo(settings, snapshot, content, reader._sceneAssets) : null;
    const fxNoise = level === 3 && content.fx && content.fx.noise ? content.fx.noise : '';
    const noise = fxNoise || (solo && settings.senseWords ? detectNoiseByText(content.text) : '');
    // 感官调度：只在暧昧 / 亲密 / 情事档生效（好感常驻档与只开剪影时不算）。外面有动静时一律屏息。
    const senseRaw = level > 0 && settings.senses
        ? resolvePageSense({ fx: content.fx, text: content.text, keywords: settings.senseWords }).sense
        : '';
    const sense = noise && settings.senses ? 'hush' : senseRaw;
    // 对话框文字随感官微调（失神时字距拉开），归在边缘光影开关下。
    setAttr(root, 'data-igs-rm-sense', Boolean(sense) && settings.edgeFx, sense);
    const intimate = syncRomanceIntimate(root, {
        level,
        span: content.nsfwSpan,
        location: content.sceneLocation,
        settings,
        fxSound: reader.fxSound,
        reduced,
        low: lowQuality(root, stage),
        messageId: snapshot.messageId,
        index: content.currentIndex,
        rng: ctx.rng,
        sense,
        undress: level > 0 ? undress : '',
        solo: Boolean(solo),
        noise,
    });
    // 想象中的对象：人影放在立绘的另一侧；没有立绘（挂 CG、剪影隐藏）时放右边。
    const dreamSide = hasSprite && Number(ctx.sprite.posX) >= 50 ? 'l' : 'r';
    // 写成自己的（标签写错）不出人影。
    const self = characterKey(reader._sceneAssets, content.spriteCharacter || content.speaker);
    const fantasy = solo && solo.target && characterKey(reader._sceneAssets, solo.target) !== self ? solo.target : '';
    const dream = syncDreamFigure(stage, { url: imaginedUrl(fantasy, reader._sceneAssets, ctx), side: dreamSide });
    // CG 镜头缓移：挂着 CG 的亲密页才动；屏息、蒙眼这类剥夺型感官时定格。
    const mix = senseMix(sense);
    const cgUrl = asset && settings.cgPan && level > 0 && !reduced ? String(content.illustrationUrl || '') : '';
    const cgShot = syncCgPan(stage, {
        url: cgUrl,
        shot: pickCgShot({ url: cgUrl, level, phase: level === 3 ? resolveIntimatePhase(content.nsfwSpan) : '', sense }),
        hold: Boolean(mix && mix.cgHold),
    });
    // 香气、屏息、失神时打字机降一档（告白段已经降过的不再叠加）。
    let typewriter = moments.typewriter;
    if (!typewriter && mix && mix.slowText && !reduced) {
        const speed = reader.typewriter && reader.typewriter.speed;
        typewriter = { speed: slowerTypewriterSpeed(speed || 'medium') };
    }
    return { level, shade, favor, rival, curve, face: Boolean(neck), approach, whisper: intimate.whisper, typewriter, sense, undress: level > 0 ? undress : '', cgShot, solo: solo ? solo.target || true : false, noise, dream };
}
