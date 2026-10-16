// 衣装文本与图片引用分离；采用返回补丁，由宿主原有保存门禁提交。
import { resolveWardrobePrompt, isValidOutfitName, isBuiltinNudeOutfit } from './character-outfits.js';
import { prepareCharacterCaption } from '../generated-images/character-caption.js';
import { promptTaskForSlot } from '../schemas/prompt-recipe.js';
import { assetOwnerKey, effectiveSceneAssets, ensureCardLibrary } from './asset-scope.js';
import { prefixFinalArtist } from '../generated-images/final-caption.js';
import { promptFromCaption } from '../generated-images/generation-prompt.js';
import { storyOutfitId, storyOutfitSourceHash } from './outfit-review-store.js';
import { readDefaultOutfit } from './character-appearance.js';

const outfitRows = rows => (rows || []).map(o => [o.name, o.description, o.default === true])
    .sort((a, b) => a[0].localeCompare(b[0]));

export function savedCharacterOutfits(assets = {}, name) {
    const selected = readDefaultOutfit(assets, name);
    return Object.entries(assets.characterOutfits?.[name] || {}).flatMap(([key, entry]) => {
        if (!isValidOutfitName(key) || isBuiltinNudeOutfit(key)) return [];
        const description = resolveWardrobePrompt(assets.wardrobe, entry, key)?.prompt || '';
        return description ? [{ name: key, description, ...(selected.ok && selected.outfitName === key && { default: true }) }] : [];
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

// 仅返回计数与相等性；缺失的历史列表不宣称为空，不输出名称或正文。
function outfitBaselineDiagnostic(live, frozen, effective, owner) {
    const known = Array.isArray(frozen);
    const before = new Map((frozen || []).map(o => [o.name, o]));
    const after = new Map(live.map(o => [o.name, o]));
    const shared = [...before.keys()].filter(key => after.has(key));
    return {
        baselineKnown: known, baselineCount: known ? frozen.length : null,
        currentCount: live.length, equal: false,
        addedCount: known ? [...after.keys()].filter(key => !before.has(key)).length : null,
        removedCount: known ? [...before.keys()].filter(key => !after.has(key)).length : null,
        descriptionChangedCount: known ? shared.filter(key => before.get(key).description !== after.get(key).description).length : null,
        defaultChangedCount: known ? shared.filter(key => (before.get(key).default === true) !== (after.get(key).default === true)).length : null,
        ...(Array.isArray(effective) && {
            effectiveCount: effective.length,
            ownerEffectiveEqual: JSON.stringify(outfitRows(live)) === JSON.stringify(outfitRows(effective)),
            effectiveBaselineEqual: known ? JSON.stringify(outfitRows(frozen)) === JSON.stringify(outfitRows(effective)) : null,
        }),
        ...(['global', 'current-card', 'other-card'].includes(owner) && { ownerKind: owner }),
    };
}

function outfitBaselineMessage(summary) {
    const count = value => value === null ? '未知' : `${value}套`;
    const changes = summary.baselineKnown
        ? `新增${summary.addedCount}、移除${summary.removedCount}、说明差异${summary.descriptionChangedCount}、默认标记差异${summary.defaultChangedCount}`
        : '生成时的已保存衣装列表缺失，不能确认历史基线为空';
    const owners = { global: '全局', 'current-card': '当前卡', 'other-card': '其他卡' };
    const view = summary.effectiveCount !== undefined
        ? `；有效视图${count(summary.effectiveCount)}，与所属库${summary.ownerEffectiveEqual ? '相同' : '不同'}，与生成基线${summary.effectiveBaselineEqual === null ? '无法比较' : summary.effectiveBaselineEqual ? '相同' : '不同'}` : '';
    return `生成时已保存衣装${count(summary.baselineCount)}，当前所属库读取${count(summary.currentCount)}；${changes}${summary.ownerKind ? `；入库归属：${owners[summary.ownerKind]}` : ''}${view}`;
}

export function prepareOutfitAdoption(assets, name, imageId, record = {},
    { sourceName = name, defaultOutfit = false, readWardrobe = assets.wardrobe,
        diagnosticAssets, diagnosticOwner, spriteSlot = '平和' } = {}) {
    const fail = (issue, message, cause, baseline) => {
        const code = typeof cause === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(cause) ? cause : '';
        return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT',
            error: `衣装入库核验未通过：${message}；已生成图片保留，原衣装保持不变。（${issue}${code ? `/${code}` : ''}）`,
            diagnostic: { stage: 'outfit-adoption', issue, ...(code && { causeReason: code }),
                ...(baseline && { baseline }) } };
    };
    if (record.promptRecipe?.outfitMode !== 'template' || record.promptEdited === true || record.edited === true)
        return { ok: true, patch: {} };
    const context = record.outfitContext || record.identityContext;
    if (!imageId || !Array.isArray(context) || !record.sentPrompt || !record.outfitSnapshot)
        return fail('evidence-missing', '图片缺少生成时的衣装或发送快照');
    const source = context.filter(c => c.characterKey === sourceName);
    if (source.length !== 1) return fail('context-binding', '生成资料无法唯一绑定目标角色');
    // 共享衣柜只用于解析说明；返回补丁仍基于所属库，不复制共享条目。
    const live = savedCharacterOutfits({ ...assets, wardrobe: readWardrobe }, name);
    if (JSON.stringify(outfitRows(live)) !== JSON.stringify(outfitRows(source[0].outfits))) {
        const baseline = outfitBaselineDiagnostic(live, source[0].outfits,
            diagnosticAssets ? savedCharacterOutfits(diagnosticAssets, name) : undefined, diagnosticOwner);
        return fail('saved-outfits-changed',
            `已保存衣装基线与当前读取结果不同；${outfitBaselineMessage(baseline)}；请保留本提示以定位读取差异`,
            undefined, baseline);
    }
    const prepared = prepareCharacterCaption({ ...record, captionMode: undefined,
        caption: record.promptRecipe.caption, characterContext: context });
    if (!prepared.ok) return fail('caption-prepare', '保存的生成资料无法重新校验', prepared.reason);
    if (JSON.stringify(prepared.outfitSnapshot) !== JSON.stringify(record.outfitSnapshot))
        return fail('snapshot-mismatch', '重新校验的衣装与图片保存的衣装快照不一致');
    const wire = promptFromCaption(prefixFinalArtist(prepared.caption, record.sentPrompt.artist))?.caption;
    if (!wire) return fail('wire-missing', '无法核对图片的实际发送正文');
    for (const side of ['v4_prompt', 'v4_negative_prompt']) {
        const expected = wire[side].caption;
        const actual = record.sentPrompt.caption?.[side]?.caption;
        if (!actual || expected.base_caption !== actual.base_caption
            || !Array.isArray(actual.char_captions)
            || expected.char_captions.length !== actual.char_captions.length)
            return fail('wire-structure', '图片实际发送的场景正文或角色数量与生成资料不一致');
        for (const [index, c] of expected.char_captions.entries()) {
            const sent = actual.char_captions[index];
            const positive = wire.v4_prompt.caption.char_captions[index]?.centers || [];
            const centers = c.centers || (side === 'v4_negative_prompt' ? positive : []);
            const sentCenters = sent?.centers || (side === 'v4_negative_prompt' ? positive : []);
            // 负向未指定坐标时，NAI 协议可复制同索引正向坐标；不改变正文。
            if (c.char_caption !== sent?.char_caption)
                return fail('wire-text', '图片实际发送的角色正文与生成资料不一致');
            if (JSON.stringify(centers) !== JSON.stringify(sentCenters))
                return fail('wire-centers', '图片实际发送的角色坐标与生成资料不一致');
        }
    }
    // 默认采用与身份是否初始化无关；图、服装说明和选择在同一设置补丁提交。
    if (defaultOutfit) {
        if (typeof spriteSlot !== 'string' || !spriteSlot.trim() || ['__proto__', 'constructor', 'prototype'].includes(spriteSlot))
            return fail('sprite-slot-invalid', '立绘图槽无效');
        const clothing = prepared.outfitSnapshot.characters.filter(c => c.characterKey === sourceName);
        if (clothing.length !== 1) return fail('candidate-binding', '默认服装无法唯一绑定目标角色');
        const candidate = clothing[0];
        if (!isValidOutfitName(candidate.name) || isBuiltinNudeOutfit(candidate.name))
            return fail('candidate-name', '默认立绘需要可保存的命名衣装');
        const selected = readDefaultOutfit(assets, name);
        if (!selected.ok && selected.reason !== 'default-outfit-unset')
            return fail('default-outfit-invalid', '默认衣装记录失效，请先重新指定');
        if (selected.ok && (candidate.name !== selected.outfitName
            || candidate.description !== resolveWardrobePrompt(readWardrobe, selected.entry, selected.outfitName)?.prompt))
            return fail('default-outfit-changed', '默认立绘必须复用已指定衣装及其保存说明');
        const saved = prepareOutfitDnaSave(assets, name, candidate.name, candidate.description, { readWardrobe });
        if (!saved.ok) return saved;
        const all = saved.patch.characterOutfits || assets.characterOutfits || {};
        const entry = all[name]?.[candidate.name];
        return { ok: true, outfitName: candidate.name, patch: {
            ...saved.patch,
            characterOutfits: { ...all, [name]: { ...all[name], [candidate.name]: {
                ...entry, moods: { ...entry?.moods, [spriteSlot]: `igs-gen:${imageId}` },
            } } },
            characterDefaultOutfits: { ...assets.characterDefaultOutfits,
                [name]: { version: 1, outfitName: candidate.name } },
        } };
    }

    const candidates = prepared.outfitSnapshot.characters.filter(c => c.characterKey === sourceName && c.source === 'candidate');
    if (!candidates.length) return { ok: true, patch: {} };
    if (candidates.length !== 1) return fail('candidate-binding', '衣装候选无法唯一绑定目标角色');

    const candidate = candidates[0];
    if (!isValidOutfitName(candidate.name)) return fail('candidate-name', '衣装候选名称不合法');
    if (isBuiltinNudeOutfit(candidate.name)) return { ok: true, patch: {} };
    const existing = assets.characterOutfits?.[name]?.[candidate.name];
    if (resolveWardrobePrompt(readWardrobe, existing, candidate.name)?.prompt)
        return fail('outfit-name-exists', '候选衣装名称已有保存说明，不能覆盖，请核对角色衣装资料');
    return prepareOutfitDnaSave(assets, name, candidate.name, candidate.description, { readWardrobe });
}

// 服装 DNA 独立于图片保存；调用方负责归属、冻结基线与持久化。
export function prepareOutfitDnaSave(assets, name, outfitName, description, { readWardrobe = assets.wardrobe } = {}) {
    const fail = () => ({ ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '服装 DNA 或已有资料冲突，原资料保持不变' });
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)
        || !isValidOutfitName(outfitName) || isBuiltinNudeOutfit(outfitName)
        || typeof description !== 'string' || !description.trim() || description.length > 4096
        || /<<\s*(?:dna|outfit)/i.test(description)) return fail();
    const characterOutfits = { ...(assets.characterOutfits || {}) };
    const outfits = { ...(characterOutfits[name] || {}) };
    const existing = outfits[outfitName];
    const saved = resolveWardrobePrompt(readWardrobe, existing, outfitName)?.prompt;
    if (saved) return saved === description ? { ok: true, patch: {} } : fail();
    const wardrobe = { ...(assets.wardrobe || {}) };
    let wardrobeKey = `${name}·${outfitName}`, suffix = 1;
    while (Object.hasOwn(wardrobe, wardrobeKey) || Object.hasOwn(readWardrobe || {}, wardrobeKey))
        wardrobeKey = `${name}·${outfitName}·${++suffix}`;
    wardrobe[wardrobeKey] = { prompt: description };
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
        const owner = owners[0].ownerKey;
        if (typeof owner !== 'string' || owner !== assetOwnerKey(root, scopeKey,
            ['characters', 'characterDna', 'characterOutfits'], candidate.characterKey)) return fail();
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
    const { character, word, prompt, ownerKey } = candidate;
    const fail = () => ({ ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '衣装或角色归属已变化，候选保留，原资料不变' });
    if (!isValidOutfitName(word) || isBuiltinNudeOutfit(word) || !character
        || ['__proto__', 'prototype', 'constructor'].includes(character)
        || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4096 || /<<\s*(?:dna|outfit)/i.test(prompt)) return fail();
    if (ownerKey !== assetOwnerKey(root, scopeKey, ['characters', 'characterDna', 'characterOutfits'], character)) return fail();
    const effective = effectiveSceneAssets(root, scopeKey);
    if (!effective.characters?.[character] && !effective.characterDna?.[character]) return fail();
    const existing = effective.characterOutfits?.[character]?.[word];
    const saved = resolveWardrobePrompt(effective.wardrobe, existing, word);
    if (saved?.prompt) return saved.prompt === prompt
        ? { ok: true, sceneAssets: root, changed: false } : fail();
    const next = structuredClone(root), target = ownerKey ? ensureCardLibrary(next, ownerKey) : next;
    let key = `${character}·${word}`, suffix = 1;
    while (Object.hasOwn(effective.wardrobe || {}, key)) key = `${character}·${word}·${++suffix}`;
    target.wardrobe = { ...target.wardrobe, [key]: { prompt } };
    target.characterOutfits = { ...target.characterOutfits, [character]: {
        ...target.characterOutfits?.[character], [word]: { words: [], moods: {}, ...existing, wardrobe: key },
    } };
    return { ok: true, sceneAssets: next, changed: true };
}
