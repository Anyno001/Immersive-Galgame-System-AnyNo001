import { applySpriteDisplayScale, normalizeSpriteDefaultScale, resolveSpriteLayout } from './settings-normalize.js';
import { spriteIdentity } from '../../scene/character-outfits.js';
import { sceneAssetsForContext } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { igsDebug } from './reader-value-utils.js';
import { peekSpriteHead, probeSpriteHead, resolveSpriteHead, spriteBackgroundSize, spriteDrawRect, spriteHeadKey } from './fx-anchor.js';
import { startHeadEdit } from './sprite-head-edit.js';
import { resolveSpriteBaseScale } from './sprite-height.js';

const MAIN_BAR = '<span class="igs-se-hint">拖动调整，滚轮/双指缩放</span>'
    + '<button data-se="head" type="button">标定头部</button>'
    + '<button data-se="reset" type="button">还原</button>'
    + '<button data-se="cancel" type="button">取消</button>'
    + '<button data-se="save" class="igs-se-save" type="button">保存</button>';

function headBar(mood, moodOnly) {
    return '<span class="igs-se-hint">拖动/轻点圆圈对准脸，滚轮/双指调大小</span>'
        + (mood ? `<button data-se="head-mood" type="button" aria-pressed="${moodOnly ? 'true' : 'false'}"${moodOnly ? ' class="is-on"' : ''}>仅当前表情</button>` : '')
        + '<button data-se="head-auto" type="button">自动识别</button>'
        + '<button data-se="head-back" type="button">返回</button>'
        + '<button data-se="save" class="igs-se-save" type="button">保存</button>';
}

function spriteUrlOf(spriteEl) {
    const raw = String(spriteEl.style.backgroundImage || '').trim();
    if (!raw.startsWith('url(')) return '';
    return raw.slice(4, -1).trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
}

// background-position 百分比的实际偏移 = (舞台 - 立绘) × pos%。立绘比舞台大时可移动量为负，
// 固定按舞台尺寸换算会让拖动方向反过来（手机竖屏放大立绘后最常见）。这里按实际可移动量换算，
// 让立绘跟手移动；可移动量不足 1px 时该轴百分比不影响画面，保持不变。读不到原图比例时纵向沿用旧换算。
// 读不到原图比例（探测未完成或失败）时宽度只能估算；立绘按高度绘制，估算可移动量可能为 0，
// 这时横向退回按舞台宽度换算，避免拖动被整个吞掉（比例 100 时最常见）。
export function spriteDragPosition({ posX, posY, dx, dy, stageW, stageH, scale, naturalW, naturalH }) {
    const axis = (pos, delta, movable) => (Number.isFinite(movable) && Math.abs(movable) >= 1 ? pos + delta / movable * 100 : pos);
    const rect = naturalW > 0 && naturalH > 0 ? spriteDrawRect(stageW, stageH, { posX, posY, scale, naturalW, naturalH }) : null;
    const drawW = rect ? rect.w : stageW * scale / 100;
    const movableX = stageW - drawW;
    const nextX = !(stageW > 0) ? posX
        : (!rect && !(Math.abs(movableX) >= 1) ? posX + dx / stageW * 100 : axis(posX, dx, movableX));
    let nextY = posY;
    if (stageH > 0) nextY = rect ? axis(posY, dy, stageH - rect.h) : posY + dy / stageH * 100;
    return { posX: nextX, posY: nextY };
}

export function enterSpriteEditMode(overlay, current, ctx = {}) {
    if (current.spriteEditMode) return;
    const spriteEl = overlay.querySelector('#igs-sprite');
    if (!spriteEl || spriteEl.style.display === 'none') {
        if (typeof ctx.writeToast === 'function') ctx.writeToast('当前无立绘可编辑');
        return;
    }
    if (typeof ctx.closeSettings === 'function') ctx.closeSettings();
    const mode = current.snapshot.mode;
    const rs = current.snapshot.readerSettings;
    const character = current.snapshot.content.spriteCharacter || current.snapshot.content.speaker || '';
    const mood = current.snapshot.content.spriteMood || '';
    const outfit = current.snapshot.content.spriteOutfit || '';
    const height = resolveSpriteBaseScale(rs._sceneAssets, rs, character);
    const modeLayout = resolveSpriteLayout(rs.spriteLayouts, mode, character, mood, outfit, height.defaultScale, height.characterScale);
    const displayScale = rs.spriteDisplayScale;
    const shownScale = () => applySpriteDisplayScale({ scale }, displayScale).scale;
    const orig = { ...modeLayout };
    let posX = orig.posX, posY = orig.posY, scale = orig.scale;
    igsDebug('[DEBUG-sprite] enter-edit', { mode, character, mood, outfit, resolved: { ...orig }, allLayouts: rs.spriteLayouts });
    const clickLayer = overlay.querySelector('#igs-click-layer');
    if (clickLayer) clickLayer.style.pointerEvents = 'none';

    const origSpriteStyle = {
        position: spriteEl.style.position,
        inset: spriteEl.style.inset,
        width: spriteEl.style.width,
        height: spriteEl.style.height,
        transform: spriteEl.style.transform,
        bottom: spriteEl.style.bottom,
        left: spriteEl.style.left,
    };
    const origEnhance = typeof spriteEl.style.getPropertyValue === 'function'
        ? spriteEl.style.getPropertyValue('--igs-sprite-enhance')
        : (spriteEl.style['--igs-sprite-enhance'] || '');
    spriteEl.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;transform:none;bottom:auto;left:auto';
    spriteEl.style.removeProperty('--igs-sprite-enhance');
    spriteEl.classList.add('igs-sprite-editing');

    const doc = overlay.ownerDocument;
    const editBar = doc.createElement('div');
    editBar.id = 'igs-sprite-edit-bar';
    editBar.innerHTML = MAIN_BAR;
    overlay.appendChild(editBar);
    const em = { orig, origEnhance, editBar, clickLayer, mode, character, mood, outfit, origSpriteStyle, displayScale, headEdit: null, headPending: null };
    current.spriteEditMode = em;
    const storedHead = resolveSpriteHead(rs.spriteHeads, character, mood, outfit);
    const head = { moodOnly: Boolean(mood && rs.spriteHeads && rs.spriteHeads[spriteHeadKey(character, mood, outfit)]), dirty: false, info: null };

    // 按角色保存时顺带清掉当前表情的单独标定，否则表情键会继续覆盖角色键、改动看不到。
    function headTarget(value) {
        const key = spriteHeadKey(character, head.moodOnly ? mood : '', outfit);
        return { key, value, clearKey: !head.moodOnly && mood ? spriteHeadKey(character, mood, outfit) : '' };
    }

    function pendingHead() {
        if (em.headEdit && head.dirty) {
            const value = em.headEdit.getHead();
            if (value && head.info) value.aspect = head.info.naturalH / head.info.naturalW;
            return headTarget(value);
        }
        return em.headPending;
    }

    function leaveHead() {
        if (!em.headEdit) return;
        em.headPending = pendingHead();
        em.headEdit.destroy();
        em.headEdit = null;
        editBar.innerHTML = MAIN_BAR;
    }

    async function enterHead() {
        if (!character) {
            if (typeof ctx.writeToast === 'function') ctx.writeToast('当前立绘没有角色名，无法按角色标定头部');
            return;
        }
        const info = await probeSpriteHead(spriteUrlOf(spriteEl), doc);
        if (current.spriteEditMode !== em || em.headEdit) return;
        if (!info || !(scale > 0)) {
            if (typeof ctx.writeToast === 'function') ctx.writeToast('读不到立绘尺寸，暂时无法标定头部');
            return;
        }
        head.info = info;
        head.dirty = Boolean(em.headPending);
        const start = (em.headPending && em.headPending.value) || storedHead || info.head;
        em.headEdit = startHeadEdit({
            motion: spriteEl.parentNode,
            sprite: { posX, posY, scale: shownScale(), naturalW: info.naturalW, naturalH: info.naturalH },
            head: start,
            onChange: () => { head.dirty = true; },
        });
        editBar.innerHTML = headBar(mood, head.moodOnly);
    }

    function apply() {
        spriteEl.style.backgroundSize = spriteBackgroundSize(shownScale());
        spriteEl.style.backgroundPosition = `${posX}% ${posY}%`;
    }
    apply();

    editBar.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-se]');
        if (!btn) return;
        const act = btn.getAttribute('data-se');
        if (act === 'reset') { posX = 50; posY = 100; scale = height.characterScale ?? normalizeSpriteDefaultScale(height.defaultScale); apply(); }
        else if (act === 'cancel') { exitSpriteEditMode(overlay, current, null, ctx); }
        else if (act === 'save') { exitSpriteEditMode(overlay, current, { posX, posY, scale, head: pendingHead() }, ctx); }
        else if (act === 'head') { enterHead(); }
        else if (act === 'head-back') { leaveHead(); }
        else if (act === 'head-mood') {
            head.moodOnly = !head.moodOnly;
            head.dirty = true;
            editBar.innerHTML = headBar(mood, head.moodOnly);
        } else if (act === 'head-auto') {
            // 清除当前键的手动标定，保存后回到透明通道自动识别。
            head.dirty = false;
            em.headPending = headTarget(null);
            leaveHead();
            if (typeof ctx.writeToast === 'function') ctx.writeToast('已改回自动识别，保存后生效');
        }
    });

    const pointers = new Map();
    let dragStart = null, pinchStart = null;
    // 预热原图尺寸缓存，拖动时用于纵向换算。
    void probeSpriteHead(spriteUrlOf(spriteEl), doc).catch(() => null);
    spriteEl.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { spriteEl.setPointerCapture(event.pointerId); } catch (e) {}
        if (pointers.size === 1) {
            dragStart = { x: event.clientX, y: event.clientY, posX, posY };
            spriteEl.classList.add('is-dragging');
        } else if (pointers.size === 2) {
            dragStart = null;
            const pts = [...pointers.values()];
            pinchStart = { dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), scale };
        }
    });
    spriteEl.addEventListener('pointermove', (event) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1 && dragStart) {
            const rect = spriteEl.getBoundingClientRect ? spriteEl.getBoundingClientRect() : { width: 400, height: 600 };
            const info = peekSpriteHead(spriteUrlOf(spriteEl));
            ({ posX, posY } = spriteDragPosition({
                posX: dragStart.posX, posY: dragStart.posY,
                dx: event.clientX - dragStart.x, dy: event.clientY - dragStart.y,
                stageW: rect.width, stageH: rect.height, scale: shownScale(),
                naturalW: info && info.naturalW, naturalH: info && info.naturalH,
            }));
            igsDebug('[DEBUG-sprite] drag', { dx: event.clientX - dragStart.x, dy: event.clientY - dragStart.y, rectW: Math.round(rect.width), rectH: Math.round(rect.height), posX: Math.round(posX), posY: Math.round(posY) });
            apply();
        } else if (pointers.size === 2 && pinchStart) {
            const pts = [...pointers.values()];
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            scale = Math.max(-500, Math.min(500, pinchStart.scale * (dist / pinchStart.dist)));
            apply();
        }
    });
    function endPointer(event) {
        pointers.delete(event.pointerId);
        if (pointers.size === 0) { dragStart = null; spriteEl.classList.remove('is-dragging'); }
        else if (pointers.size === 1) {
            pinchStart = null;
            const [ptr] = pointers.values();
            dragStart = { x: ptr.x, y: ptr.y, posX, posY };
        }
    }
    spriteEl.addEventListener('pointerup', endPointer);
    spriteEl.addEventListener('pointercancel', endPointer);
    spriteEl.addEventListener('wheel', (event) => {
        event.preventDefault();
        scale = Math.max(-500, Math.min(500, scale * (event.deltaY < 0 ? 1.1 : 0.91)));
        apply();
    }, { passive: false });
}

export function exitSpriteEditMode(overlay, current, save, ctx = {}) {
    const em = current.spriteEditMode;
    if (!em) return;
    current.spriteEditMode = null;
    if (em.headEdit) em.headEdit.destroy();
    const spriteEl = overlay.querySelector('#igs-sprite');
    if (spriteEl) {
        spriteEl.classList.remove('igs-sprite-editing', 'is-dragging');
        if (em.origEnhance) spriteEl.style.setProperty('--igs-sprite-enhance', em.origEnhance);
        else spriteEl.style.removeProperty('--igs-sprite-enhance');
    }
    if (em.clickLayer) em.clickLayer.style.pointerEvents = '';
    if (em.editBar && em.editBar.parentNode) em.editBar.remove();
    if (save) {
        const unified = typeof ctx.resolveUnifiedSettings === 'function'
            ? ctx.resolveUnifiedSettings({ mode: em.mode })
            : { readerSettings: {} };
        const layouts = { ...(unified.readerSettings.spriteLayouts || {}) };
        const value = { posX: save.posX, posY: save.posY, scale: save.scale };
        if (!em.character) {
            layouts[em.mode] = value;
        } else {
            const sceneAssets = sceneAssetsForContext(unified.bridge && unified.bridge.sceneAssets, getSillyTavernContext()) || {};
            const unified_ = sceneAssets.unifiedSpriteLayout === true;
            // 服装立绘的位置写到「角色|服装」身份下，不影响原有立绘位置。
            const identity = spriteIdentity(em.character, em.outfit);
            if (unified_) {
                // Apply to every known mood slot of this character so all expressions
                // share one position, while keeping the mode::char::mood key format.
                const outfitEntry = identity !== em.character && sceneAssets.characterOutfits
                    && sceneAssets.characterOutfits[em.character] && sceneAssets.characterOutfits[em.character][em.outfit];
                const slotSource = identity !== em.character
                    ? (outfitEntry && outfitEntry.moods) || null
                    : (sceneAssets.characters && sceneAssets.characters[em.character]) || null;
                const charMoods = slotSource ? Object.keys(slotSource) : [];
                if (charMoods.length) {
                    for (const m of charMoods) {
                        layouts[`${em.mode}::${identity}::${m}`] = { ...value };
                    }
                } else {
                    layouts[`${em.mode}::${identity}`] = value;
                }
            } else if (em.mood) {
                layouts[`${em.mode}::${identity}::${em.mood}`] = value;
            } else {
                // 空 mood 必须存到 mode::char，与 resolveSpriteLayout 的 charKey 对齐，
                // 否则重渲染查不回（v0.5.4/v0.13.1 回归）。
                layouts[`${em.mode}::${identity}`] = value;
            }
        }
        const patch = { spriteLayouts: layouts };
        if (save.head && save.head.key) {
            const heads = { ...(unified.readerSettings.spriteHeads || {}) };
            if (save.head.value) heads[save.head.key] = save.head.value;
            else delete heads[save.head.key];
            if (save.head.clearKey) delete heads[save.head.clearKey];
            patch.spriteHeads = heads;
        }
        if (typeof ctx.saveReaderSettingsPatch === 'function') {
            ctx.saveReaderSettingsPatch(patch);
        }
    } else {
        if (spriteEl) Object.assign(spriteEl.style, em.origSpriteStyle);
        if (em.orig && spriteEl) {
            spriteEl.style.backgroundSize = spriteBackgroundSize(applySpriteDisplayScale({ scale: em.orig.scale }, em.displayScale).scale);
            spriteEl.style.backgroundPosition = `${em.orig.posX}% ${em.orig.posY}%`;
        }
    }
}
