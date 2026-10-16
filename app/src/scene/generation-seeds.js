import { isImageSeed } from '../generated-images/image-seed.js';
import { resolveCharacterKey } from './scene-directives.js';

const safeName = name => typeof name === 'string' && name.trim()
    && !['__proto__', 'constructor', 'prototype'].includes(name);

export function normalizeCharacterSeeds(value) {
    return Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
        .filter(([name, seed]) => safeName(name) && isImageSeed(seed)));
}

export function characterGenerationSeed(assets = {}, name) {
    const known = { ...assets.characterDna, ...assets.generated?.characters,
        ...assets.characters, ...assets.characterOutfits };
    const key = resolveCharacterKey(known, assets.characterAliases || {}, name);
    const seed = key && assets.characterSeeds?.[key];
    return isImageSeed(seed) ? seed : undefined;
}

// 只由成功图片的采用写口调用；生成候选和 CG 不登记角色种子。
export function adoptCharacterSeed(assets, name, seed) {
    if (!safeName(name) || !isImageSeed(seed) || isImageSeed(assets.characterSeeds?.[name])) return {};
    return { characterSeeds: { ...assets.characterSeeds, [name]: seed } };
}

export function sceneGenerationSeed(assets = {}, name) {
    const scenes = { ...assets.generated?.scenes, ...assets.scenes };
    const key = Object.hasOwn(scenes, name) ? name : Object.keys(scenes)
        .find(key => Array.isArray(scenes[key]?.words) && scenes[key].words.includes(name));
    const seed = key && scenes[key]?.seed;
    return isImageSeed(seed) ? seed : undefined;
}

// 只认本图显式绑定，按 Char 索引取第一个已登记种子的角色，不使用正文允许池。
export function cgGenerationSeed(record = {}, assets = {}) {
    const bindings = record.promptRecipe?.bindings || record.characterMeta?.characters || [];
    const named = bindings.filter(c => (!c.kind || c.kind === 'named') && safeName(c.characterKey)
        && Number.isInteger(c.captionIndex) && c.captionIndex >= 0)
        .slice().sort((a, b) => a.captionIndex - b.captionIndex);
    for (const c of named) {
        const seed = characterGenerationSeed(assets, c.characterKey);
        if (isImageSeed(seed)) return seed;
    }
    return undefined;
}
