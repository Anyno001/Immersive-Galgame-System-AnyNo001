import { resolveSpriteLayout } from './settings-normalize.js';
import { igsDebug } from './reader-value-utils.js';

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
    const modeLayout = resolveSpriteLayout(rs.spriteLayouts, mode, character, mood);
    const orig = { ...modeLayout };
    let posX = orig.posX, posY = orig.posY, scale = orig.scale;
    igsDebug('[DEBUG-sprite] enter-edit', { mode, character, mood, layoutKey: character ? `${mode}::${character}::${mood}` : mode, resolved: { ...orig }, allLayouts: rs.spriteLayouts });
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
    spriteEl.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;transform:none;bottom:auto;left:auto';
    spriteEl.classList.add('igs-sprite-editing');

    const doc = overlay.ownerDocument;
    const editBar = doc.createElement('div');
    editBar.id = 'igs-sprite-edit-bar';
    editBar.innerHTML = '<span class="igs-se-hint">拖动调整，滚轮/双指缩放</span>'
        + '<button data-se="reset" type="button">还原</button>'
        + '<button data-se="cancel" type="button">取消</button>'
        + '<button data-se="save" class="igs-se-save" type="button">保存</button>';
    overlay.appendChild(editBar);
    current.spriteEditMode = { orig, editBar, clickLayer, mode, character, mood, origSpriteStyle };

    function apply() {
        spriteEl.style.backgroundSize = `${scale}%`;
        spriteEl.style.backgroundPosition = `${posX}% ${posY}%`;
    }
    apply();

    editBar.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-se]');
        if (!btn) return;
        const act = btn.getAttribute('data-se');
        if (act === 'reset') { posX = 50; posY = 100; scale = 100; apply(); }
        else if (act === 'cancel') { exitSpriteEditMode(overlay, current, null, ctx); }
        else if (act === 'save') { exitSpriteEditMode(overlay, current, { posX, posY, scale }, ctx); }
    });

    const pointers = new Map();
    let dragStart = null, pinchStart = null;
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
            posX = dragStart.posX + (event.clientX - dragStart.x) / rect.width * 100;
            posY = dragStart.posY + (event.clientY - dragStart.y) / rect.height * 100;
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
    const spriteEl = overlay.querySelector('#igs-sprite');
    if (spriteEl) {
        spriteEl.classList.remove('igs-sprite-editing', 'is-dragging');
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
            const sceneAssets = (unified.bridge && unified.bridge.sceneAssets) || {};
            const unified_ = sceneAssets.unifiedSpriteLayout === true;
            if (unified_) {
                // Apply to every known mood slot of this character so all expressions
                // share one position, while keeping the mode::char::mood key format.
                const charMoods = (sceneAssets.characters && sceneAssets.characters[em.character])
                    ? Object.keys(sceneAssets.characters[em.character])
                    : [];
                if (charMoods.length) {
                    for (const m of charMoods) {
                        layouts[`${em.mode}::${em.character}::${m}`] = { ...value };
                    }
                } else {
                    layouts[`${em.mode}::${em.character}`] = value;
                }
            } else if (em.mood) {
                layouts[`${em.mode}::${em.character}::${em.mood}`] = value;
            } else {
                // 空 mood 必须存到 mode::char，与 resolveSpriteLayout 的 charKey 对齐，
                // 否则重渲染查不回（v0.5.4/v0.13.1 回归）。
                layouts[`${em.mode}::${em.character}`] = value;
            }
        }
        if (typeof ctx.saveReaderSettingsPatch === 'function') {
            ctx.saveReaderSettingsPatch({ spriteLayouts: layouts });
        }
    } else {
        if (spriteEl) Object.assign(spriteEl.style, em.origSpriteStyle);
        if (em.orig && spriteEl) {
            spriteEl.style.backgroundSize = `${em.orig.scale}%`;
            spriteEl.style.backgroundPosition = `${em.orig.posX}% ${em.orig.posY}%`;
        }
    }
}
