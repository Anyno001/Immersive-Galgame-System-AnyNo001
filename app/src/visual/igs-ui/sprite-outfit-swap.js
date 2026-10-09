const IN_CLASS = 'igs-sprite-outfit-in';
const GHOST_ID = 'igs-sprite-ghost';
const FORM_GHOST_CLASS = 'igs-sprite-form-ghost';
const FORM_IN_CLASS = 'igs-sprite-form-in';
const FORM_SHIFT_MS = 1100;

// 同一人换装不再淡入淡出。函数保留给旧调用，阅读器不再播放。
// 新立绘的关键帧只写起点，终点回到内联样式（旁白压暗等滤镜不被动画结束态覆盖）。
export const SPRITE_OUTFIT_SWAP_STYLE_TEXT = `
#${GHOST_ID}{display:none;}
#igs-sprite.${IN_CLASS}{animation:none;}
.${FORM_GHOST_CLASS}{pointer-events:none;animation:igs-form-ghost ${FORM_SHIFT_MS}ms ease-out forwards;}
#igs-sprite.${FORM_IN_CLASS}{animation:igs-form-in ${FORM_SHIFT_MS}ms ease-out backwards;}
@keyframes igs-form-ghost{0%{opacity:1;filter:brightness(1);}35%{opacity:.9;filter:brightness(2.6) saturate(.3) blur(1px);}100%{opacity:0;filter:brightness(3) blur(6px);transform:scale(1.04);}}
@keyframes igs-form-in{0%,30%{opacity:0;filter:brightness(3) blur(6px);}100%{opacity:1;filter:none;}}
@media (prefers-reduced-motion: reduce){.${FORM_GHOST_CLASS}{display:none;}#igs-sprite.${FORM_IN_CLASS}{animation:none;}}
`.trim();

export function spriteLookOf(content, url) {
    const c = content || {};
    return { character: String(c.spriteCharacter || c.speaker || ''), outfit: String(c.spriteOutfit || ''), url: String(url || '') };
}

export function isOutfitSwap(prev, next) {
    return Boolean(prev && next && prev.url && next.url && prev.character && prev.character === next.character
        && prev.outfit !== next.outfit && prev.url !== next.url);
}

export function clearSpriteOutfitSwap(spriteEl) {
    if (!spriteEl) return;
    try {
        const parent = spriteEl.parentNode;
        const ghost = parent && typeof parent.querySelector === 'function' ? parent.querySelector(`#${GHOST_ID}`) : null;
        if (ghost && typeof ghost.remove === 'function') ghost.remove();
        else if (ghost && ghost.parentNode && typeof ghost.parentNode.removeChild === 'function') ghost.parentNode.removeChild(ghost);
        if (spriteEl.classList) spriteEl.classList.remove(IN_CLASS);
    } catch (error) { /* 阅读器已卸载时静默结束 */ }
}

// 必须在写入新立绘之前调用：残影复制的是旧立绘此刻的内联样式（图片、缩放、位置）。
export function playSpriteOutfitSwap() {
    return false;
}

// 变身形态（服装带 form）：切入或切出这一套时播一次变身——旧立绘发白散开、新立绘从光里浮现。普通换装仍不播。
export function isFormOutfit(sceneAssets, character, outfit) {
    const map = sceneAssets && sceneAssets.characterOutfits;
    const own = map && character && Object.hasOwn(map, character) ? map[character] : null;
    const entry = own && outfit && Object.hasOwn(own, outfit) ? own[outfit] : null;
    return Boolean(entry && entry.form);
}

// 必须在写入新立绘之前调用：残影复制旧立绘此刻的内联样式。
export function playSpriteFormShift(spriteEl) {
    const parent = spriteEl && spriteEl.parentNode;
    const doc = spriteEl && spriteEl.ownerDocument;
    if (!parent || !doc || typeof spriteEl.cloneNode !== 'function') return false;
    try {
        const ghost = spriteEl.cloneNode(false);
        ghost.removeAttribute('id');
        ghost.className = FORM_GHOST_CLASS;
        parent.insertBefore(ghost, spriteEl.nextSibling);
        spriteEl.classList.remove(FORM_IN_CLASS);
        void spriteEl.offsetWidth;
        spriteEl.classList.add(FORM_IN_CLASS);
        const view = doc.defaultView || globalThis;
        view.setTimeout(() => {
            if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
            spriteEl.classList.remove(FORM_IN_CLASS);
        }, FORM_SHIFT_MS + 80);
        return true;
    } catch (error) { return false; }
}
