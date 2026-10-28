// 唯一身份展开点：无存储、模型或配置访问；调用方提供本次资料快照。
import { tidyCreatureCaption } from './creature-caption.js';
import { confirmedCreatureOf, creatureOf } from '../scene/creature-profile.js';
import { checkPromptRecipe, checkPromptTask, checkPromptOutput, checkRecipeCharacterMeta, promptTaskForSlot, isSceneOnlyPromptOutput } from '../schemas/prompt-recipe.js';
import { readCharacterDnaView, normalizeCharacterDna, checkDnaViews, hasLegacyCharacterIdentity } from '../scene/character-dna.js';
import { checkOutfitTemplates } from '../schemas/outfit-template.js';
import { promptProvenance } from './generation-prompt.js';
const fail = (reason, error) => ({ ok: false, reason, error });
const controlled = /<<\s*(?:dna|outfit)/i;
const textFields = (caption) => [caption?.v4_prompt?.caption, caption?.v4_negative_prompt?.caption]
    .flatMap((side) => [side?.base_caption, ...(side?.char_captions || []).map((c) => c.char_caption)]);
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

// 普通 CG 缺本景别时借同一人最近的已存景别，其次旧版身份文本；都没有才用本次写词的身份旁路。
// 写词模型看不到保存的身份正文，旁路是它按正文现编的，排在已存资料之后。不补建 DNA，也不替换身份错绑或非法资料。
const NEAREST_VIEWS = Object.freeze({ full_body: ['half_body', 'portrait'], half_body: ['full_body', 'portrait'],
    portrait: ['half_body', 'full_body'], partial: ['half_body', 'full_body', 'portrait'] });
const CJK = /[㐀-鿿]/;

function nearestSavedIdentity(dna, framing, options) {
    if (dna?.version === 2) {
        for (const view of NEAREST_VIEWS[framing] || []) {
            const near = readCharacterDnaView(dna, view, options);
            // 景别负面词常带该景别的构图排除，借用时不带。
            if (near.ok) return { ok: true, value: { subject: near.value.subject, negative: '' } };
        }
        return null;
    }
    if (dna?.version !== undefined || !hasLegacyCharacterIdentity(dna)) return null;
    const d = normalizeCharacterDna(dna);
    // 中文身份文本不能直接进画图词。
    const subject = [d.triggerWords, d.identity, options?.personality === false ? '' : d.personality]
        .map(s => String(s || '').trim()).filter(Boolean).join(', ');
    const negative = String(d.negative || '').trim();
    if (!subject || CJK.test(subject) || controlled.test(subject + negative)) return null;
    return { ok: true, value: { subject, negative: CJK.test(negative) ? '' : negative } };
}

export function readCaptionIdentity(dna, framing, purpose, metadata, options) {
    const saved = readCharacterDnaView(dna, framing, options);
    if (saved.ok) return { ...saved, source: 'saved' };
    if (purpose !== 'cg' || !['DNA_MISSING', 'DNA_VIEW_MISSING'].includes(saved.reason)) return saved;
    const near = saved.reason === 'DNA_VIEW_MISSING' ? nearestSavedIdentity(dna, framing, options) : null;
    if (near) return { ...near, source: 'saved' };
    if (dna?.version !== undefined && dna.version !== 2)
        return fail('DNA_VIEW_INVALID', '未知 DNA 版本不能作为当次身份降级');
    if (dna?.version === 2 && dna.views !== undefined) {
        const checked = checkDnaViews(dna.views, { allowEmpty: true });
        if (!checked.ok) return { ...checked,
            error: `非法景别资料不能作为当次身份降级；${checked.error}` };
    }
    const subject = metadata?.identityAnchor, signature = metadata?.signatureDetails || '';
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 4096
        || typeof signature !== 'string' || signature.length > 4096) return saved;
    if (controlled.test(subject + signature))
        return fail('DNA_TEMPLATE_UNRESOLVED', '当次身份描述不能包含身份令牌');
    // 旁路由写词模型按实际取景给出完整主语；程序不裁切、拼补或重新设计身份。
    return { ok: true, source: 'scene', value: { subject: subject.trim(), negative: '' } };
}

export function prepareCharacterCaption(input = {}) {
    const { caption, promptRecipe, characterContext = [], dnaCandidates, promptTask } = input;
    if (!caption) return fail('DNA_TEMPLATE_BINDING', '缺少人物提示词');
    if (input.captionMode !== undefined && input.captionMode !== 'final')
        return fail('PROMPT_MODE_CONFLICT', '未知提示词发送模式');
    if (input.captionMode === 'final' && (promptRecipe !== undefined || promptTask !== undefined || dnaCandidates !== undefined))
        return fail('PROMPT_MODE_CONFLICT', '手改定稿不能同时应用身份模板或候选');
    if (promptTask?.purpose === 'cg' && isSceneOnlyPromptOutput(input)) {
        const task = checkPromptTask(promptTask, characterContext);
        if (!task.ok) return task;
        return { ok: true, caption: structuredClone(caption) };
    }
    if (promptRecipe === undefined && (promptTask !== undefined || dnaCandidates !== undefined))
        return fail('PROMPT_MODE_CONFLICT', '新模板任务缺少动态模板，已停止出图');
    if (input.captionMode === 'final' || promptRecipe === undefined) {
        if (textFields(caption).some((v) => controlled.test(v || '')))
            return fail('DNA_TEMPLATE_UNRESOLVED', '定稿或旧提示词不能包含未展开的身份令牌');
        return { ok: true, caption: structuredClone(caption), ...(input.captionMode && { captionMode: 'final' }) };
    }
    const validTask = checkPromptTask(promptTask, characterContext);
    if (!validTask.ok) return validTask;
    const selected = promptTaskForSlot(validTask.value, input.slotId);
    if (!selected.ok) return selected;
    const checked = checkPromptRecipe(promptRecipe, caption, selected.value, { context: Array.isArray(characterContext) ? characterContext : undefined });
    if (!checked.ok) return checked;
    if (!Array.isArray(characterContext)) return fail('DNA_TEMPLATE_BINDING', '缺少角色资料快照');
    // 已保存的显式 recipe 可独立重画；候选与 reference 必须保留原任务用途，不能猜测。
    if (!validTask.value && (dnaCandidates !== undefined || checked.value.bindings.some((b) => b.kind === 'reference')))
        return fail('PROMPT_MODE_CONFLICT', '身份候选或参考角色缺少显式任务');
    const output = validTask.value
        ? checkPromptOutput({ caption, promptRecipe, dnaCandidates, characterMeta: input.characterMeta }, selected.value, characterContext)
        : checkRecipeCharacterMeta(checked.value, input.characterMeta);
    if (!output.ok) return output;
    const outfits = checkOutfitTemplates(checked.value, input.characterMeta, characterContext, selected.value);
    if (!outfits.ok) return outfits;
    // 普通 CG 重画保留原衣装来源；不能把快照复用误记为已入柜。
    // 先核验格式和本次展开的绑定／正文，拒绝借历史快照替换其他衣装。
    if (selected.value?.purpose === 'cg' && checked.value.outfitMode === 'template'
        && input.outfitSnapshot !== undefined) {
        let snapshot;
        try { snapshot = promptProvenance({ outfitSnapshot: input.outfitSnapshot }).outfitSnapshot; }
        catch { return fail('OUTFIT_TEMPLATE_INVALID', 'CG 原衣装快照无效，已停止出图'); }
        if (snapshot.characters.length !== outfits.value.characters.length)
            return fail('OUTFIT_TEMPLATE_INVALID', 'CG 原衣装快照绑定不一致，已停止出图');
        for (const outfit of outfits.value.characters) {
            const original = snapshot.characters.find(c => c.captionIndex === outfit.captionIndex);
            if (!original || ['characterKey', 'token', 'name', 'description']
                .some(field => original[field] !== outfit[field])
                || (checked.value.outfitSelection === 'catalog' && original.source !== outfit.source))
                return fail('OUTFIT_TEMPLATE_INVALID', 'CG 原衣装快照与本次展开不一致，已停止出图');
        }
        outfits.value = snapshot;
    }
    for (const b of checked.value.bindings.filter((b) => b.token)) {
        if (characterContext.filter((c) => c?.characterKey === b.characterKey).length !== 1)
            return fail('DNA_TEMPLATE_BINDING', '角色资料快照无法唯一绑定');
    }
    const expanded = structuredClone(caption), characters = [];
    for (const b of checked.value.bindings) {
        if (!b.token) continue;
        const saved = characterContext.find((c) => c.characterKey === b.characterKey)?.dna;
        const candidate = output.value.dnaCandidates?.characters.find((c) => c.characterKey === b.characterKey);
        const dna = candidate ? { ...normalizeCharacterDna(saved), version: 2, views: candidate.views,
            ...(candidate.personality !== undefined && { personality: candidate.personality }) } : saved;
        const metadata = input.characterMeta?.characters?.find((c) => c.characterKey === b.characterKey && c.captionIndex === b.captionIndex);
        const view = readCaptionIdentity(dna, b.framing, selected.value?.purpose, metadata, { personality: input.omitPersonality !== true });
        if (!view.ok) return { ...view, characterKey: b.characterKey, framing: b.framing };
        const correcting = checked.value.identityMode === 'appearance_correction';
        const identity = correcting ? b.correction : view.value;

        if (controlled.test(identity.subject) || controlled.test(identity.negative))
            return fail('DNA_TEMPLATE_UNRESOLVED', '身份资料不能包含递归令牌');
        const pos = expanded.v4_prompt.caption.char_captions[b.captionIndex];
        const neg = expanded.v4_negative_prompt.caption.char_captions[b.captionIndex];
        // 替换回调保真 $、权重与标点；只替换原模板，不再扫描替换产物。
        pos.char_caption = pos.char_caption.replace(`<<dna:${b.token}>>`, () => identity.subject);
        const outfit = outfits.value.characters.find(c => c.captionIndex === b.captionIndex);
        if (outfit) pos.char_caption = pos.char_caption.replace(`<<outfit:${b.token}>>`, () =>
            b.framing === 'half_body' && ['sprite', 'derived'].includes(selected.value?.purpose)
                ? outfit.descriptionHalfBody || outfit.description : outfit.description);
        if (neg) neg.char_caption = neg.char_caption.replace(`<<dna_uc:${b.token}>>`, () => identity.negative);
        const { correction, outfit: selectedOutfit, ...binding } = b;
        characters.push({ ...binding, source: candidate ? 'candidate' : view.source,
            dnaVersion: view.source === 'scene' ? 0 : 2,
            subject: identity.subject, negative: identity.negative,
            ...(correcting && { application: 'appearance_correction' }),
            profile: normalizeCharacterDna(dna) });
    }
    if (textFields(expanded).some((v) => controlled.test(v || '')))
        return fail('DNA_TEMPLATE_UNRESOLVED', '身份展开后仍有未解析令牌');
    // 非人角色：展开后按标签去重并统一为单行逗号分隔；差分的姿态词优先于固定取景里的姿态词。
    const cgCast = selected.value?.purpose === 'cg';
    if (characters.some(c => cgCast ? confirmedCreatureOf(c.profile) : creatureOf(c.profile))) tidyCreatureCaption(expanded, { derived: selected.value?.purpose === 'derived',
        ...(cgCast && { only: characters.filter(c => confirmedCreatureOf(c.profile)).map(c => c.captionIndex) }) });
    // 工作画布标记属于发送封装，不写回可复用模板或原 CG 提示词。
    if (selected.value?.purpose === 'consistency'
        && checked.value.bindings.some(b => b.kind === 'reference')) {
        const scene = expanded.v4_prompt.caption;
        // 只归一化标点分隔的独立技术标签，不改写正文中的同名短语。
        let text = scene.base_caption, previous;
        do {
            previous = text;
            text = text.replace(/(^\s*|[,.;:]\s*)reference inset\s*(?:([,.;:]\s*)|$)/gi,
                (_match, before, after) => before.trim() && after ? before : '');
        } while (text !== previous);
        text = text.trim();
        scene.base_caption = text ? `reference inset, ${text}` : 'reference inset';
    }
    return freeze({ ok: true, caption: expanded, captionMode: 'final', promptRecipe: checked.value,
        dnaSnapshot: { version: 1, characters },
        ...(checked.value.outfitMode === 'template' && { outfitSnapshot: outfits.value,
            ...(input.characterMeta && { characterMeta: { ...structuredClone(input.characterMeta), characters: input.characterMeta.characters.map(c => {
                const outfit = outfits.value.characters.find(o => o.captionIndex === c.captionIndex);
                return outfit ? { ...structuredClone(c), outfit: { name: outfit.name, description: outfit.description,
                    ...(outfit.descriptionHalfBody !== undefined && { descriptionHalfBody: outfit.descriptionHalfBody }) } } : structuredClone(c);
            }) } }) }),
        ...(output.value.dnaCandidates !== undefined && { dnaCandidates: output.value.dnaCandidates }) });
}
