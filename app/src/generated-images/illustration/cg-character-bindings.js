import { buildCharacterContext } from '../../scene/character-identity.js';
import { buildCharacterDnaPromptParts, mergePromptTags } from '../../scene/character-dna.js';
import { createOutfitResolver, collectLatestOutfits, resolveTagOutfitAt, resolveSpriteOutfit, isValidOutfitName } from '../../scene/character-outfits.js';
import { extractSceneDirectives, resolveCharacterKey } from '../../scene/scene-directives.js';
import { checkCharacterMeta } from '../../schemas/character-meta.js';
import { readCaptionIdentity } from '../character-caption.js';
import { checkPromptTask, checkPromptOutput, isSceneOnlyPromptOutput } from '../../schemas/prompt-recipe.js';
import { inheritImageTaskLease } from '../image-task-runtime.js';
import { cgSelectedOutfitAnchor } from './cg-outfit-catalog.js';

// CG 是允许池，不套用立绘批次的必需角色 slots；每图由 recipe 显式选角色和景别。
export function cgPromptTask(context, { outfitSelection } = {}) {
    const characterContext = structuredClone(context);
    return { characterContext, promptTask: { version: 1, mode: 'dna_template', purpose: 'cg',
        outfitMode: 'template',
        ...(outfitSelection !== undefined && { outfitSelection }),
        characters: characterContext.map((c, index) => ({ characterKey: c.characterKey,
            token: `r${index.toString(36)}`, kind: 'named' })) } };
}

// 预检只校验绑定与可用身份来源，不展开或改写正文；展开仍在发送准备入口。
export function preflightCgCaption(entry, task, context) {
    const checkedTask = checkPromptTask(task, context);
    if (!checkedTask.ok) return checkedTask;
    if (checkedTask.value && checkedTask.value.purpose !== 'cg') return {
        ok: false, reason: 'PROMPT_MODE_CONFLICT', error: 'CG 缺少只读身份任务，已停止该图',
    };
    const meta = checkCharacterMeta(entry.characterMeta, entry.caption, context.map((c) => c.characterKey));
    if (!meta.ok) return meta;
    const output = checkPromptOutput({ ...entry, characterMeta: meta.value }, checkedTask.value, context);
    if (!output.ok) return output;
    if (!checkedTask.value && !isSceneOnlyPromptOutput(entry) && !output.value.promptRecipe) return {
        ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '人物 CG 缺少只读身份任务，已停止该图',
    };
    if (!output.value.promptRecipe) return { ok: true, caption: structuredClone(entry.caption) };
    if (!checkedTask.value && output.value.promptRecipe.bindings.some((b) => ['named', 'reference'].includes(b.kind))) return {
        ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '人物 CG 缺少只读身份任务，已停止该图',
    };
    for (const binding of output.value.promptRecipe.bindings.filter((b) => b.kind === 'named')) {
        const sources = context.filter((c) => c.characterKey === binding.characterKey);
        if (sources.length !== 1) return { ok: false, reason: 'DNA_TEMPLATE_BINDING', error: 'CG 角色资料无法唯一绑定' };
        const metadata = meta.value.characters.find((c) => c.characterKey === binding.characterKey
            && c.captionIndex === binding.captionIndex);
        const view = readCaptionIdentity(sources[0].dna, binding.framing, 'cg', metadata);
        if (!view.ok) return { ...view, characterKey: binding.characterKey, framing: binding.framing,
            error: `「${binding.characterKey}」缺少可用的 ${binding.framing} 保存资料或当次身份描述；该 CG 未发送` };
    }
    return { ok: true, caption: structuredClone(entry.caption), characterMeta: meta.value,
        promptRecipe: output.value.promptRecipe,
        ...(checkedTask.value && { promptTask: checkedTask.value }),
        characterContext: structuredClone(context) };
}

// 两条发送链复用同一只读预检；历史定稿旁路不参与身份处理。
export function cgPaintRequests(slots, assets) {
    return slots.map(entry => {
        const { status, error, failureReason, dataUrl, floorKey, key, updatedAt, ...source } = entry;
        inheritImageTaskLease(entry, source);
        // 未迁移的旧协议保留原引用和请求形状。
        if (!source.promptRecipe && !source.promptTask && !source.captionMode
            && source.promptEdited !== true && source.edited !== true) return source;
        const request = inheritImageTaskLease(source, structuredClone(source));
        inheritImageTaskLease(source.caption, request.caption);
        if (request.promptEdited === true || request.edited === true) return request;
        try {
            if (request.promptRecipe) {
                delete request.captionMode;
                request.caption = structuredClone(request.promptRecipe.caption);
                inheritImageTaskLease(source.promptRecipe?.caption || source.caption, request.caption);
                if (assets) {
                    request.characterContext = currentCgContext(request, assets);
                    request.promptTask = { version: 1, mode: 'dna_template', purpose: 'cg',
                        ...(request.promptRecipe.outfitMode && { outfitMode: request.promptRecipe.outfitMode }),
                        ...(request.promptRecipe.outfitSelection && { outfitSelection: request.promptRecipe.outfitSelection }),
                        characters: request.promptRecipe.bindings.filter((b) => b.kind === 'named')
                            .map(({ characterKey, token }) => ({ characterKey, token, kind: 'named' })) };
                }
                const checked = preflightCgCaption(request, request.promptTask, request.characterContext || []);
                request.preflightFailure = checked.ok ? null : { reason: checked.reason, error: checked.error };
                if (checked.ok) request.characterMeta = checked.characterMeta;
            } else if (request.promptTask) {
                const checked = preflightCgCaption(request, request.promptTask, request.characterContext || []);
                request.preflightFailure = checked.ok ? null : { reason: checked.reason, error: checked.error };
                if (checked.ok) delete request.promptTask;
            }
        } catch {
            request.preflightFailure = { reason: 'DNA_TEMPLATE_BINDING', error: 'CG 模板或角色绑定无效，未发送该图' };
        }
        return request;
    });
}

// 手改定稿只发正文；旧 recipe / 快照留在存储中追溯。
export function cgFinalRequest(request) {
    const { promptRecipe, promptTask, dnaCandidates, dnaSnapshot, outfitSnapshot, outfitContext,
        sentPrompt, preflightFailure, ...final } = request;
    return inheritImageTaskLease(request, { ...final, captionMode: 'final' });
}

// 普通重画只取当前 DNA；保留原 CG 当次衣装元数据，不重新解释剧情或复用历史身份。
export function currentCgContext(record, assets) {
    const keys = record.promptRecipe.bindings.filter((b) => b.kind === 'named').map((b) => b.characterKey);
    return buildCharacterContext(keys, assets).map((c) => {
        const snapshot = record.outfitSnapshot?.characters?.find((m) => m.characterKey === c.characterKey);
        const outfit = snapshot ? { name: snapshot.name, description: snapshot.description }
            : record.characterMeta?.characters?.find((m) => m.characterKey === c.characterKey)?.outfit
                || { name: '', description: '' };
        // 原图衣装快照是本次重画的服装来源，不与后来编辑的同名衣柜混用。
        // catalog 直接从绑定展开；outfits 保留真实衣柜基线供候选采用核验。
        const outfits = snapshot && record.promptRecipe.outfitSelection !== 'catalog'
            ? c.outfits.filter(saved => saved.name !== snapshot.name)
                .concat({ name: snapshot.name, description: snapshot.description }) : c.outfits;
        return { ...c, outfits, outfit: structuredClone(outfit) };
    });
}

// 仅消费既有正文和资料；不看图、不做额外写词或定位请求。
export function cgCharacterState(text, names, assets, previousTexts = [], readClues) {
    const outfitResolver = createOutfitResolver(assets);
    // 未登记衣装只作为写词上下文，不改阅读器的旧图回退或衣柜。
    const storyDirectives = source => extractSceneDirectives(source, { outfitResolver }).directives
        .map(d => d.unknownOutfit && isValidOutfitName(d.unknownOutfit) ? { ...d, outfit: d.unknownOutfit } : d);
    const directives = storyDirectives(text);
    const known = { ...assets.characterDna, ...assets.characters, ...assets.characterOutfits, ...assets.generated?.characters };
    const canonical = (name) => resolveCharacterKey(known, assets.characterAliases || {}, name) || name;
    const inheritedOutfits = {};
    for (const previous of previousTexts.slice(-3).reverse()) {
        const latest = collectLatestOutfits(storyDirectives(previous), canonical);
        for (const [key, value] of Object.entries(latest)) {
            if (!Object.hasOwn(inheritedOutfits, key)) inheritedOutfits[key] = value;
        }
    }
    const at = (offset) => {
        const scene = directives.filter((d) => d.type === 'scene' && d.offset <= offset).at(-1);
        return buildCharacterContext(names, assets, { directives, offset, inheritedOutfits, readClues,
            scene: scene?.scene ? [scene.scene] : [] }).map(c => {
            const requested = resolveTagOutfitAt(directives, c.characterKey, offset, inheritedOutfits, canonical);
            return isValidOutfitName(requested) && !outfitResolver(c.characterKey, requested)
                ? { ...c, outfit: { name: requested, description: '' } }
                : c;
        });
    };
    const context = at(Infinity);
    const timeline = directives.filter((d) => d.outfit).map((d) => ({
        characterKey: canonical(d.character), offset: d.offset,
        outfit: at(d.offset).find((c) => c.characterKey === canonical(d.character))?.outfit,
    }));
    const anchorAt = (offset, keys) => {
        const scene = directives.filter(d => d.type === 'scene' && d.offset <= offset).at(-1);
        const context = at(offset);
        const characters = [...new Set(keys.map(canonical))].map(characterKey => {
            const requestedOutfit = resolveTagOutfitAt(directives, characterKey, offset, inheritedOutfits, canonical);
            const trace = resolveSpriteOutfit({ directives, character: characterKey, offset,
                inheritedOutfits, sceneAssets: assets, readClues, scene: scene?.scene ? [scene.scene] : [] });
            const effectiveOutfit = context.find(c => c.characterKey === characterKey)?.outfit.name || '';
            const local = directives.some(d => (d.type === 'char' || d.type === 'thought')
                && canonical(d.character) === characterKey && d.offset <= offset && (d.unknownOutfit || d.outfit));
            return { characterKey, requestedOutfit, effectiveOutfit,
                requirementSource: requestedOutfit ? local ? 'tag' : 'inherited' : 'none',
                source: trace.source || (effectiveOutfit ? 'default' : 'none'), reason: trace.reason || '',
                ...(['profile', 'equipment'].includes(trace.source) && { inferredOutfit: trace.outfit }) };
        });
        return { version: 1, offset, characters };
    };
    // 自动立绘也复用正文衣装解析；一人一张时绑定首次出场，不套用楼末换装。
    const atFirstAppearance = name => {
        const key = canonical(name);
        const first = directives.find(d => (d.type === 'char' || d.type === 'thought')
            && canonical(d.character) === key);
        return at(first?.offset ?? -1).find(c => c.characterKey === key);
    };
    return { context, at, timeline, anchorAt, atFirstAppearance };
}

// 只完善本次新 CG 已有的锚点；历史记录与手改 final 不回填、不重新解释正文。
export function completedCgOutfitAnchor(request, result) {
    if (!result?.ok || request.promptEdited === true || request.edited === true
        || request.outfitAnchor?.version !== 1 || !Array.isArray(request.outfitAnchor.characters)
        || result.outfitSnapshot?.version !== 1 || !Array.isArray(result.outfitSnapshot.characters)) return {};
    if (request.promptRecipe?.outfitSelection === 'catalog')
        return { outfitAnchor: cgSelectedOutfitAnchor(result, request.outfitAnchor.offset) };
    return { outfitAnchor: { ...structuredClone(request.outfitAnchor), characters: request.outfitAnchor.characters.map(c => {
        const matches = result.outfitSnapshot.characters.filter(saved => saved.characterKey === c.characterKey);
        return matches.length === 1 ? { ...c, effectiveOutfit: matches[0].name, effectiveSource: 'snapshot' } : { ...c };
    }) } };
}

// captionIndex 只定位本次 caption，身份始终由已核验的规范键确定。
export function bindCgCaption(caption, rawMeta, context, assets) {
    if (rawMeta === undefined) return { ok: true, caption };
    const known = { ...assets.characterDna, ...assets.characters, ...assets.characterOutfits, ...assets.generated?.characters };
    const normalized = rawMeta && Array.isArray(rawMeta.characters) ? { ...rawMeta,
        characters: rawMeta.characters.map((c) => ({ ...c,
            characterKey: resolveCharacterKey(known, assets.characterAliases || {}, c?.characterKey) || c?.characterKey })) } : rawMeta;
    const checked = checkCharacterMeta(normalized, caption, context.map((c) => c.characterKey));
    if (!checked.ok) return checked;
    const next = JSON.parse(JSON.stringify(caption));
    const pos = next.v4_prompt.caption.char_captions;
    const neg = next.v4_negative_prompt ||= { caption: { base_caption: '', char_captions: [] } };
    neg.caption ||= { base_caption: '', char_captions: [] };
    neg.caption.char_captions ||= [];
    const characters = checked.value.characters.map((binding) => {
        const source = context.find((c) => c.characterKey === binding.characterKey);
        const parts = buildCharacterDnaPromptParts(source.dna);
        const outfit = source.outfit.name ? source.outfit : binding.outfit;
        const index = binding.captionIndex;
        pos[index].char_caption = mergePromptTags(parts.positive, pos[index].char_caption, outfit.description);
        while (neg.caption.char_captions.length <= index) neg.caption.char_captions.push({ char_caption: '' });
        neg.caption.char_captions[index].char_caption = mergePromptTags(neg.caption.char_captions[index].char_caption, parts.negative);
        return { ...binding, identityAnchor: source.dna.identity || binding.identityAnchor,
            signatureDetails: source.dna.identity ? '' : binding.signatureDetails,
            outfit: { ...outfit }, positionExplicit: binding.positionExplicit === true && binding.centers.length > 0 };
    });
    return { ok: true, caption: next, characterMeta: { version: 1, characters } };
}
