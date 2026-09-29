import { prefersReducedMotion } from './reduced-motion.js';

const IN_CLASS = 'igs-sprite-outfit-in';
const GHOST_ID = 'igs-sprite-ghost';
const SWAP_MS = 460;

// 换装转场：旧立绘留一层残影压暗下沉淡出，新立绘从暗处上浮淡入。只在同一角色换装时播放，换表情、换人不播。
// 新立绘的关键帧只写起点，终点回到内联样式（旁白压暗等滤镜不被动画结束态覆盖）。
export const SPRITE_OUTFIT_SWAP_STYLE_TEXT = `
#${GHOST_ID}{pointer-events:none;background-repeat:no-repeat;z-index:2;animation:igs-outfit-out 340ms cubic-bezier(.4,0,.8,.4) forwards;}
#igs-sprite.${IN_CLASS}{animation:igs-outfit-in 420ms cubic-bezier(.2,.7,.2,1) backwards;}
@keyframes igs-outfit-out{from{opacity:1;}to{opacity:0;filter:brightness(.45) saturate(.7);translate:0 2%;}}
@keyframes igs-outfit-in{0%{opacity:0;filter:brightness(.4) saturate(.6);translate:0 1.5%;}35%{opacity:.4;}}
@media (prefers-reduced-motion: reduce){#${GHOST_ID}{display:none;}#igs-sprite.${IN_CLASS}{animation:none;}}
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
export function playSpriteOutfitSwap(spriteEl, options = {}) {
    clearSpriteOutfitSwap(spriteEl);
    const reduced = options.reducedMotion != null ? options.reducedMotion : prefersReducedMotion();
    const doc = spriteEl && spriteEl.ownerDocument;
    const parent = spriteEl && spriteEl.parentNode;
    if (reduced || !doc || !parent || typeof doc.createElement !== 'function') return false;
    try {
        const ghost = doc.createElement('div');
        ghost.id = GHOST_ID;
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.cssText = spriteEl.style.cssText || '';
        parent.insertBefore(ghost, spriteEl);
        spriteEl.classList.remove(IN_CLASS);
        void spriteEl.offsetWidth;
        spriteEl.classList.add(IN_CLASS);
        const token = (Number(spriteEl.igsOutfitSwapToken) || 0) + 1;
        spriteEl.igsOutfitSwapToken = token;
        const timer = options.setTimeout || (doc.defaultView && doc.defaultView.setTimeout) || globalThis.setTimeout;
        // 连续翻页时只让最后一次转场的计时器收尾，旧计时器不提前掐掉新转场。
        const handle = timer(() => { if (spriteEl.igsOutfitSwapToken === token) clearSpriteOutfitSwap(spriteEl); }, SWAP_MS);
        if (handle && typeof handle.unref === 'function') handle.unref();
        return true;
    } catch (error) {
        clearSpriteOutfitSwap(spriteEl);
        return false;
    }
}
