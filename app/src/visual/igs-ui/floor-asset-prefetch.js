import { resolveCharacterLive2dBinding } from './live2d-config.js';
import { extractSceneDirectives, classifySceneKey } from '../../scene/scene-directives.js';
import { resolveBackgroundAsset, resolveNudeSpriteAsset, isNonSpriteSpeaker } from '../../scene/asset-match.js';
import { createOutfitResolver, resolveSpriteOutfit } from '../../scene/character-outfits.js';
import { isSystemRole } from './system-role.js';
import { resolveReaderSpriteAsset } from './reader-sprite-asset.js';

function pushUrl(urls, seen, url) {
    const source = String(url || '').trim();
    if (!source || seen.has(source)) return;
    seen.add(source);
    urls.push(source);
}

function sceneBefore(directives, offset, inheritedScene) {
    let scene = inheritedScene && inheritedScene.scene ? String(inheritedScene.scene) : '';
    let nsfw = Boolean(inheritedScene && inheritedScene.nsfw);
    for (const directive of directives) {
        if (directive.type !== 'scene') continue;
        if (Number.isFinite(offset) && Number(directive.offset) > offset) break;
        scene = String(directive.scene || scene);
        nsfw = directive.nsfw === true;
    }
    return { scene, nsfw };
}

// 这一楼会用到的立绘和背景。翻页前一次性取齐，不在轮到出场时才去读。
export function collectFloorAssetUrls({
    source = '',
    sceneAssets = null,
    inheritedOutfits = null,
    inheritedScene = null,
    assetMatchCtx = null,
    imageSlots = [],
    onSpriteUrl = null,
    systemRole = null,
    live2dConfig = null,
    readClues = null,
    prepared = null,
} = {}) {
    const urls = [];
    const seen = new Set();
    for (const slot of Array.isArray(imageSlots) ? imageSlots : []) {
        pushUrl(urls, seen, slot && slot.url);
    }
    if (prepared) {
        for (const url of prepared.assets?.urls || []) pushUrl(urls, seen, url);
        for (const hit of prepared.eventCgs || []) pushUrl(urls, seen, hit?.url);
        return urls;
    }
    if (!sceneAssets || !sceneAssets.enabled) return urls;
    const ctx = assetMatchCtx || { sceneAssets };
    const outfitResolver = createOutfitResolver(sceneAssets);
    const directives = extractSceneDirectives(String(source || ''), { outfitResolver }).directives;
    const outfitFor = (character, offset) => {
        const place = sceneBefore(directives, offset, inheritedScene);
        const sceneRaw = place.scene;
        return resolveSpriteOutfit({
            directives,
            character,
            offset: Number.isFinite(offset) ? offset : Number.NaN,
            inheritedOutfits,
            sceneAssets,
            scene: [classifySceneKey(sceneAssets.scenes, sceneRaw).key || '', sceneRaw],
            readClues: typeof readClues === 'function' ? readClues : () => null,
        }).outfit;
    };
    if (inheritedScene && inheritedScene.scene) {
        pushUrl(urls, seen, resolveBackgroundAsset(inheritedScene, ctx).url);
    }
    for (const directive of directives) {
        if (directive.type === 'scene' && directive.scene) {
            pushUrl(urls, seen, resolveBackgroundAsset(directive, ctx).url);
            continue;
        }
        if (directive.type !== 'char' && directive.type !== 'thought') continue;
        const name = String(directive.character || '').trim();
        if (!name || isNonSpriteSpeaker(name) || isSystemRole(name, systemRole)) continue;
        const outfit = outfitFor(name, Number(directive.offset));
        if (!resolveCharacterLive2dBinding(live2dConfig, sceneAssets, name, directive.mood)) {
            const spriteUrl = resolveReaderSpriteAsset(name, directive.mood || '', ctx, outfit).url;
            if (spriteUrl && onSpriteUrl) onSpriteUrl(spriteUrl);
            pushUrl(urls, seen, spriteUrl);
        }
        const place = sceneBefore(directives, Number(directive.offset), inheritedScene);
        if (place.nsfw) {
            const nudeUrl = resolveNudeSpriteAsset(name, directive.mood || '', ctx).url;
            if (nudeUrl && onSpriteUrl) onSpriteUrl(nudeUrl);
            pushUrl(urls, seen, nudeUrl);
        }
    }
    return urls;
}
