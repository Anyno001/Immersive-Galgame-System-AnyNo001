// 衣装文本与图片引用分离；采用返回补丁，由宿主原有保存门禁提交。
import { resolveWardrobePrompt, isValidOutfitName, isBuiltinNudeOutfit } from './character-outfits.js';
import { promptTaskForSlot } from '../schemas/prompt-recipe.js';
import { assetOwnerKey, effectiveSceneAssets, ensureCardLibrary } from './asset-scope.js';
import { promptProvenance } from '../generated-images/generation-prompt.js';
import { storyOutfitId, storyOutfitSourceHash } from './outfit-review-store.js';
import { readDefaultOutfit, setOutfitSprite } from './character-appearance.js';

export function savedCharacterOutfits(assets = {}, name) {
    const selected = readDefaultOutfit(assets, name);
    return Object.entries(assets.characterOutfits?.[name] || {}).flatMap(([key, entry]) => {
        if (!isValidOutfitName(key) || isBuiltinNudeOutfit(key)) return [];
        const saved = resolveWardrobePrompt(assets.wardrobe, entry, key);
        const description = saved?.prompt || '';
        return description ? [{ name: key, description,
            ...(saved.promptHalfBody !== undefined && { descriptionHalfBody: saved.promptHalfBody }),
            ...(selected.ok && selected.outfitName === key && { default: true }) }] : [];
    });
}

export function outfitAdoptionEvidence(input = {}, result = {}) {
    if (input.promptRecipe?.outfitMode !== 'template') return {};
    const selected = promptTaskForSlot(input.promptTask, input.slotId);
    if (!selected.ok) return {};
    const keys = input.promptRecipe.bindings.filter(b => b.kind === 'named').map(b => b.characterKey);
    return { outfitContext: structuredClone(input.characterContext.filter(c => keys.includes(c.characterKey))),
        ...(selected.value !== undefined && { promptTask: structuredClone({ ...selected.value,
            characters: selected.value.characters.filter(c => input.promptRecipe.bindings.some(b => b.token === c.token)) }) }),
        ...(input.slotId !== undefined && { slotId: input.slotId }) };
}

export function prepareOutfitAdoption(assets, name, imageId, record = {},
    { sourceName = name, defaultOutfit = false, readWardrobe = assets.wardrobe, spriteSlot = '平和' } = {}) {
    // 入库不因衣装资料对不上而失败：对不上就只采用图片，不登记衣装。
    const skip = { ok: true, patch: {} };
    if (record.promptEdited === true || record.edited === true) return skip;
    const adoptDefault = (candidate, allowEmptyDescription = false) => {
        if (typeof spriteSlot !== 'string' || !spriteSlot.trim() || ['__proto__', 'constructor', 'prototype'].includes(spriteSlot))
            return skip;
        if (!isValidOutfitName(candidate.name) || isBuiltinNudeOutfit(candidate.name))
            return skip;
        const selected = readDefaultOutfit(assets, name);
        // 外部来源可以只交完整绘图词。正文已给衣装名时直接登记图片，衣装 DNA 留空。
        const saved = allowEmptyDescription && !candidate.description?.trim()
            ? prepareOutfitDnaPatch(assets, name, candidate.name, '', readWardrobe)
            : prepareOutfitDnaSave(assets, name, candidate.name, candidate.description,
                { readWardrobe, descriptionHalfBody: candidate.descriptionHalfBody });
        if (!saved.ok) return skip;
        const all = saved.patch.characterOutfits || assets.characterOutfits || {};
        const entry = all[name]?.[candidate.name];
        return { ok: true, outfitName: candidate.name, patch: {
            ...saved.patch,
            characterOutfits: { ...all, [name]: { ...all[name],
                [candidate.name]: setOutfitSprite(entry, spriteSlot, `igs-gen:${imageId}`) } },
            ...((!selected.ok && (selected.reason !== 'default-outfit-unset' || ![assets.characters?.[name], assets.generated?.characters?.[name]]
                .some(slots => Object.values(slots || {}).some(url => typeof url === 'string' && url.trim())))) && {
                characterDefaultOutfits: { ...assets.characterDefaultOutfits,
                    [name]: { version: 1, outfitName: candidate.name } } }),
        } };
    };
    if (record.promptRecipe?.outfitMode !== 'template') {
        if (!defaultOutfit || !imageId || record.promptRecipe) return { ok: true, patch: {} };
        const matches = record.characterMeta?.characters?.filter(c => c.characterKey === sourceName) || [];
        const outfit = matches.length === 1 ? matches[0].outfit : undefined;
        const outfitName = isValidOutfitName(record.outfitName) ? record.outfitName : outfit?.name;
        if (!isValidOutfitName(outfitName) || isBuiltinNudeOutfit(outfitName)) return { ok: true, patch: {} };
        return adoptDefault({ name: outfitName,
            description: outfit?.name === outfitName && typeof outfit.description === 'string' ? outfit.description : '' }, true);
    }
    // IGS 自己出的图：衣装以生成时保存的快照为准，不再与发送正文比对；资料不全时照常采用图片，只是不登记衣装。
    if (!imageId || !record.outfitSnapshot) return skip;
    let snapshot;
    try { snapshot = promptProvenance({ outfitSnapshot: record.outfitSnapshot }).outfitSnapshot; }
    catch { return skip; }
    const clothes = snapshot.characters.filter(c => c.characterKey === sourceName);
    // 默认采用与身份是否初始化无关；图、服装说明和选择在同一设置补丁提交。
    if (defaultOutfit) {
        if (clothes.length !== 1) return skip;
        return adoptDefault(clothes[0]);
    }

    const candidates = snapshot.characters.filter(c => c.characterKey === sourceName
        && (c.source === 'candidate' || c.descriptionHalfBody !== undefined));
    if (!candidates.length) return { ok: true, patch: {} };
    if (candidates.length !== 1) return skip;

    const candidate = candidates[0];
    if (!isValidOutfitName(candidate.name) || isBuiltinNudeOutfit(candidate.name)) return skip;
    const saved = prepareOutfitDnaSave(assets, name, candidate.name, candidate.description,
        { readWardrobe, descriptionHalfBody: candidate.descriptionHalfBody });
    return saved.ok ? saved : skip;
}

// 服装 DNA 独立于图片保存；调用方负责归属、冻结基线与持久化。
export function prepareOutfitDnaSave(assets, name, outfitName, description,
    { readWardrobe = assets.wardrobe, descriptionHalfBody } = {}) {
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)
        || !isValidOutfitName(outfitName) || isBuiltinNudeOutfit(outfitName)
        || typeof description !== 'string' || !description.trim() || description.length > 4096
        || /<<\s*(?:dna|outfit)/i.test(description)
        || (descriptionHalfBody !== undefined && (typeof descriptionHalfBody !== 'string'
            || !descriptionHalfBody.trim() || descriptionHalfBody.length > 4096
            || /<<\s*(?:dna|outfit)/i.test(descriptionHalfBody)))) return outfitDnaConflict();
    return prepareOutfitDnaPatch(assets, name, outfitName, description, readWardrobe, descriptionHalfBody);
}

function outfitDnaConflict() {
    return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '服装 DNA 或已有资料冲突，原资料保持不变' };
}

function prepareOutfitDnaPatch(assets, name, outfitName, description, readWardrobe, descriptionHalfBody) {
    const characterOutfits = { ...(assets.characterOutfits || {}) };
    const outfits = { ...(characterOutfits[name] || {}) };
    const existing = outfits[outfitName];
    if (existing && !description) return { ok: true, patch: {} };
    const saved = (existing || description) ? resolveWardrobePrompt(readWardrobe, existing, outfitName) : null;
    if (saved?.prompt) {
        // 旧衣装只补缺失的半身视图；完整母版和已保存半身均不得被候选覆盖。
        if (descriptionHalfBody !== undefined) {
            if (saved.prompt !== description || (saved.promptHalfBody && saved.promptHalfBody !== descriptionHalfBody)) return outfitDnaConflict();
            if (!saved.promptHalfBody) {
                outfits[outfitName] = { words: [], moods: {}, ...existing, wardrobe: saved.name };
                characterOutfits[name] = outfits;
                return { ok: true, patch: { characterOutfits,
                    wardrobe: { ...(assets.wardrobe || {}), [saved.name]: {
                        ...(typeof readWardrobe[saved.name] === 'string' ? { prompt: saved.prompt } : readWardrobe[saved.name]),
                        promptHalfBody: descriptionHalfBody } } } };
            }
        }
        if (existing) return { ok: true, patch: {} };
        outfits[outfitName] = { words: [], moods: {}, wardrobe: saved.name };
        characterOutfits[name] = outfits;
        return { ok: true, patch: { characterOutfits } };
    }
    const wardrobe = { ...(assets.wardrobe || {}) };
    let wardrobeKey = `${name}·${outfitName}`, suffix = 1;
    while (Object.hasOwn(wardrobe, wardrobeKey) || Object.hasOwn(readWardrobe || {}, wardrobeKey))
        wardrobeKey = `${name}·${outfitName}·${++suffix}`;
    wardrobe[wardrobeKey] = { prompt: description,
        ...(descriptionHalfBody !== undefined && { promptHalfBody: descriptionHalfBody }) };
    outfits[outfitName] = { words: [], moods: {}, ...existing, wardrobe: wardrobeKey };
    characterOutfits[name] = outfits;
    return { ok: true, patch: { characterOutfits, wardrobe } };
}

// 归属在写词前冻结；生成后不能改用当前卡或借用角色的来源卡。
export function captureOutfitScope(root, scopeKey, keys) {
    return { version: 1, scopeKey, owners: [...new Set(keys)].map(characterKey => ({ characterKey,
        ownerKey: assetOwnerKey(root, scopeKey, ['characters', 'characterDna', 'characterOutfits'], characterKey) })) };
}

export function prepareCgOutfitAdoption(root, scopeKey, record) {
    const fail = () => ({ ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT' });
    const scope = record.outfitScope;
    if (scope?.version !== 1 || scope.scopeKey !== scopeKey || !Array.isArray(scope.owners)
        || record.promptTask?.purpose !== 'cg' || record.status !== 'done' || !record.dataUrl
        || record.key !== `${record.floorKey}|${record.slot}` || !record.floorKey
        || !Number.isSafeInteger(record.revision) || record.revision < 1 || !record.revisionToken) return fail();
    const effective = effectiveSceneAssets(root, scopeKey);
    const patches = [];
    for (const candidate of record.outfitSnapshot?.characters || []) {
        if (candidate.source !== 'candidate' || isBuiltinNudeOutfit(candidate.name)) continue;
        const owners = scope.owners.filter(o => o.characterKey === candidate.characterKey);
        if (owners.length !== 1) return fail();
        const owner = assetOwnerKey(root, scopeKey,
            ['characters', 'characterDna', 'characterOutfits'], candidate.characterKey);
        const adoption = prepareOutfitAdoption(effective, candidate.characterKey, record.key, record);
        if (!adoption.ok) return adoption;
        patches.push({ owner, name: candidate.characterKey, patch: adoption.patch });
    }
    if (!patches.length) return { ok: true, sceneAssets: root, changed: false };
    const next = structuredClone(root);
    for (const { owner, name, patch } of patches) {
        if (!patch.characterOutfits) continue;
        const target = owner ? ensureCardLibrary(next, owner) : next;
        target.characterOutfits = { ...target.characterOutfits, [name]: patch.characterOutfits[name] };
        target.wardrobe = { ...target.wardrobe, ...Object.fromEntries(Object.entries(patch.wardrobe)
            .filter(([key]) => !Object.hasOwn(effective.wardrobe || {}, key))) };
    }
    return { ok: true, sceneAssets: next, changed: true };
}
// CG 权威回读仍按原采用契约核验；只输出候选，不提交准备出的衣柜补丁。
export function prepareCgOutfitCandidates(root, scopeKey, record, floor) {
    const checked = prepareCgOutfitAdoption(root, scopeKey, record);
    if (!checked.ok) return checked;
    if (!floor || record.floorKey !== `${floor.chatId}|${floor.messageId}|${floor.swipeId ?? 0}`)
        return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT' };
    const rows = (record.outfitSnapshot?.characters || []).filter(c => c.source === 'candidate' && !isBuiltinNudeOutfit(c.name))
        .map(c => {
            const row = { character: c.characterKey, word: c.name, prompt: c.description, status: 'ready',
                scopeKey, ownerKey: record.outfitScope.owners.find(o => o.characterKey === c.characterKey).ownerKey,
                floorKey: record.floorKey, messageId: Number(floor.messageId), sourceHash: storyOutfitSourceHash(floor.text) };
            return { ...row, id: storyOutfitId(row) };
        });
    return { ok: true, items: rows };
}

// 剧情衣装词不依赖图片成功；用户明确采用后才登记，并沿冻结归属写回。
export function prepareStoryOutfitAdoption(root, scopeKey, candidate) {
    const { character, word, prompt } = candidate;
    const ownerKey = assetOwnerKey(root, scopeKey, ['characters', 'characterDna', 'characterOutfits'], character);
    const fail = () => ({ ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '衣装或角色归属已变化，候选保留，原资料不变' });
    if (!isValidOutfitName(word) || isBuiltinNudeOutfit(word) || !character
        || ['__proto__', 'prototype', 'constructor'].includes(character)
        || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4096 || /<<\s*(?:dna|outfit)/i.test(prompt)) return fail();
    const effective = effectiveSceneAssets(root, scopeKey);
    if (!effective.characters?.[character] && !effective.characterDna?.[character]) return fail();
    const existing = effective.characterOutfits?.[character]?.[word];
    const saved = resolveWardrobePrompt(effective.wardrobe, existing, word);
    if (saved?.prompt && existing) return { ok: true, sceneAssets: root, changed: false };
    const prepared = prepareOutfitDnaSave(effective, character, word, prompt,
        { descriptionHalfBody: candidate.promptHalfBody });
    if (!prepared.ok) return prepared;
    const next = structuredClone(root), target = ownerKey ? ensureCardLibrary(next, ownerKey) : next;
    target.characterOutfits = { ...target.characterOutfits,
        [character]: prepared.patch.characterOutfits?.[character] || target.characterOutfits?.[character] };
    if (prepared.patch.wardrobe) target.wardrobe = { ...target.wardrobe,
        ...Object.fromEntries(Object.entries(prepared.patch.wardrobe)
            .filter(([key]) => !Object.hasOwn(effective.wardrobe || {}, key))) };
    return { ok: true, sceneAssets: next, changed: true };
}
