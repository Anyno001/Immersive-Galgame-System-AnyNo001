const IN_CLASS = 'igs-sprite-outfit-in';
const GHOST_ID = 'igs-sprite-ghost';

// 同一人换装不再淡入淡出。函数保留给旧调用，阅读器不再播放。
// 新立绘的关键帧只写起点，终点回到内联样式（旁白压暗等滤镜不被动画结束态覆盖）。
export const SPRITE_OUTFIT_SWAP_STYLE_TEXT = `
#${GHOST_ID}{display:none;}
#igs-sprite.${IN_CLASS}{animation:none;}
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
