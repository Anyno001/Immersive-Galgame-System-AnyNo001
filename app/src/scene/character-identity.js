import { normalizeCharacterDna } from './character-dna.js';
import { checkPromptTask, checkPromptOutput, promptTaskForSlot } from '../schemas/prompt-recipe.js';
import { checkCharacterMeta } from '../schemas/character-meta.js';
import { resolveCharacterKey } from './scene-directives.js';
import { resolveSpriteOutfit, resolveWardrobePrompt } from './character-outfits.js';
import { savedCharacterOutfits, prepareOutfitAdoption } from './outfit-identity.js';

// 沿用既有别名解析；请求内去重，不从 caption 顺序猜身份。
export function buildCharacterContext(names, assets = {}, options) {
    const known = { ...assets.characterDna, ...assets.characters, ...assets.characterOutfits, ...assets.generated?.characters };
    const seen = new Set();
    return (names || []).flatMap((name) => {
        const characterKey = resolveCharacterKey(known, assets.characterAliases || {}, name) || String(name || '').trim();
        if (!characterKey || ['__proto__', 'constructor', 'prototype'].includes(characterKey) || seen.has(characterKey)) return [];
        seen.add(characterKey);
        const dna = normalizeCharacterDna(assets.characterDna?.[characterKey]);
        const outfits = savedCharacterOutfits(assets, characterKey);
        const original = outfits.find(o => o.default === true);
        let outfit = original ? { name: original.name, description: original.description } : { name: '', description: '' };
        if (options) {
            const resolved = resolveSpriteOutfit({ ...options, character: characterKey, sceneAssets: assets });
            const entry = assets.characterOutfits?.[characterKey]?.[resolved.outfit];
            if (resolved.outfit) outfit = { name: resolved.outfit,
                description: resolveWardrobePrompt(assets.wardrobe, entry, resolved.outfit)?.prompt || '' };
        }
        return [{ characterKey, dna, outfit, outfits }];
    });
}

// 新候选采用与旧完整词采用分开：成功图片的旁路是证据，不从图片或正文猜身份。
export function prepareSpriteIdentityAdoption(assets, name, imageId, record = {},
    { sourceName = name, hadDefault = false, readWardrobe = assets.wardrobe, spriteSlot = '平和' } = {}) {
    const fail = (reason, error = '立绘身份资料已变化或无法核验，请重新生成；原资料保持不变') => ({ ok: false, reason, error });
    if (record.promptEdited === true || record.edited === true) {
        if (record.dnaCandidates !== undefined) return fail('DNA_ADOPTION_INVALID');
        return { ok: true, patch: {
            characterDna: assets.characterDna || {}, characterOutfits: assets.characterOutfits || {}, wardrobe: assets.wardrobe || {},
        } };
    }
    const clothes = prepareOutfitAdoption(assets, name, imageId, record, { sourceName, defaultOutfit: true, readWardrobe, spriteSlot });
    if (!clothes.ok) return clothes;
    if (record.dnaCandidates === undefined) {
        // 新模板没有候选时不得用旧 identityAnchor 建档。
        const patch = record.promptRecipe ? {
            characterDna: assets.characterDna || {}, characterOutfits: assets.characterOutfits || {}, wardrobe: assets.wardrobe || {},
        } : adoptSpriteIdentity(assets, name, imageId, record.characterMeta, { hadDefault });
        return { ok: true, ...(clothes.outfitName && { outfitName: clothes.outfitName }),
            patch: { ...patch, ...clothes.patch } };
    }
    if (!imageId || record.promptEdited === true || record.edited === true || !record.sentPrompt
        || !record.promptRecipe || !Array.isArray(record.identityContext)) return fail('DNA_ADOPTION_INVALID');
    const context = record.identityContext;
    const source = context.filter((c) => c.characterKey === sourceName);
    if (source.length !== 1) return fail('DNA_TEMPLATE_BINDING');
    const task = checkPromptTask(record.promptTask, context);
    if (!task.ok || task.value?.purpose !== 'sprite') return fail('PROMPT_MODE_CONFLICT');
    const caption = record.promptRecipe.caption;
    const meta = checkCharacterMeta(record.characterMeta, caption, [sourceName]);
    if (!meta.ok) return meta;
    const output = checkPromptOutput({ ...record, caption, characterMeta: meta.value }, task.value, context);
    if (!output.ok) return output;
    const candidates = output.value.dnaCandidates?.characters;
    if (candidates?.length !== 1 || candidates[0].characterKey !== sourceName) return fail('DNA_TEMPLATE_BINDING');
    const dna = normalizeCharacterDna(assets.characterDna?.[name]);
    const candidate = candidates[0];
    const snapshot = record.dnaSnapshot?.characters?.filter((c) => c.characterKey === sourceName && c.source === 'candidate');
    if (record.dnaSnapshot?.version !== 1 || snapshot?.length !== 1
        || JSON.stringify(normalizeCharacterDna(snapshot[0].profile).views) !== JSON.stringify(candidate.views)
        || (candidate.personality !== undefined && snapshot[0].profile?.personality !== candidate.personality))
        return fail('DNA_ADOPTION_INVALID');
    // 显式立绘转换可补齐旧身份的景别，但旧字段及已存在景别必须原样保留。
    const nextDna = { ...dna, version: 2, views: structuredClone({ ...candidate.views, ...Object.fromEntries(Object.entries(dna.views || {}).filter(([, view]) => view.subject)) }),
        ...(dna.personality === undefined && candidate.personality !== undefined && { personality: candidate.personality }),
        identityInitialized: true, identitySource: dna.identitySource || imageId };
    return { ok: true, ...(clothes.outfitName && { outfitName: clothes.outfitName }),
        patch: { ...clothes.patch, characterDna: { ...assets.characterDna, [name]: nextDna } } };
}

// 图片及临时记录使用同一份采用证据；只保存本次角色资料，不含凭据或请求全量。
export function spriteAdoptionEvidence(input = {}, result = {}) {
    if (input.promptTask?.purpose !== 'sprite') return {};
    const selected = promptTaskForSlot(input.promptTask, input.slotId);
    if (!selected.ok) return {};
    const keys = selected.value.characters.map((c) => c.characterKey);
    return { ...(result.dnaCandidates !== undefined && { dnaCandidates: structuredClone(result.dnaCandidates) }),
        identityContext: input.characterContext.filter((c) => keys.includes(c.characterKey))
            .map((c) => ({ characterKey: c.characterKey, dna: normalizeCharacterDna(c.dna),
                ...(input.promptTask.outfitMode === 'template' && { outfit: structuredClone(c.outfit), outfits: structuredClone(c.outfits || []) }) })),
        promptTask: structuredClone(selected.value), ...(input.slotId !== undefined && { slotId: input.slotId }) };
}
// 只在默认立绘首次采用事件中调用；返回新值，持久化成功前不替换原资料。
export function adoptSpriteIdentity(assets, name, imageId, meta, { hadDefault = false } = {}) {
    const dna = normalizeCharacterDna(assets.characterDna?.[name]);
    const binding = meta?.characters?.find((c) => c.characterKey === name);
    if (!binding || !imageId || hadDefault || dna.identityInitialized === true)
        return { characterDna: assets.characterDna || {}, characterOutfits: assets.characterOutfits || {}, wardrobe: assets.wardrobe || {} };
    const identity = [binding.identityAnchor, binding.signatureDetails].filter(Boolean).join(' ');
    const nextDna = { ...dna, identity: dna.identity || identity, identityInitialized: true, identitySource: imageId };
    return { characterDna: { ...(assets.characterDna || {}), [name]: nextDna },
        characterOutfits: assets.characterOutfits || {}, wardrobe: assets.wardrobe || {} };
}
