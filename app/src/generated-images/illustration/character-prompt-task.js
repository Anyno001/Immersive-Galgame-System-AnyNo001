// 人物任务交接：冻结输入资料，不展开身份、不加工模型返回的正文。
import { normalizeCharacterDna, readCharacterDnaView, characterDnaIdentityCleared, hasLegacyCharacterIdentity, CHARACTER_DNA_REQUIRED_VIEWS, CHARACTER_DNA_VIEWS } from '../../scene/character-dna.js';
import { savedCharacterOutfits } from '../../scene/outfit-identity.js';
import { readDefaultOutfit } from '../../scene/character-appearance.js';
import { isValidOutfitName } from '../../scene/character-outfits.js';
import { inheritImageTaskLease } from '../image-task-runtime.js';
import { checkPromptRecipe, checkRecipeCharacterMeta } from '../../schemas/prompt-recipe.js';
import { creatureFraming, creatureOf } from '../../scene/creature-profile.js';
import { BUILTIN_PROMPTS } from '../prompt-registry.js';

export const usesCharacterTemplates = (backend, dna) => {
    const mode = backend?.describe?.().mode;
    if (mode !== 'nai') return false;
    // 非人角色没有旧版完整词存档，始终走资料模板。
    return !hasLegacyCharacterIdentity(dna) || Boolean(creatureOf(dna));
};

// 写词输入与采用基线分离：旧服装仅留在本地原始快照，不交给模型选衣。
export function characterWritingContext(context, { targetOutfitOnly = false } = {}) {
    if (!Array.isArray(context)) return context;
    return context.map(character => {
        const copy = structuredClone(character);
        if (copy?.dna && typeof copy.dna === 'object') delete copy.dna.defaultAppearance;
        if (targetOutfitOnly) delete copy.outfits;
        return copy;
    });
}

// 表情只消费当前身份视图与当前衣装；完整任务、衣柜和绘图配置不发给写词模型。
export function expressionWritingInput(task, context) {
    const fail = () => ({ ok: false, reason: 'SPRITE_DATA_INVALID', error: '表情任务无法唯一绑定角色与图号' });
    if (task.purpose !== 'derived') return fail();
    const slots = task.slots || [{ slotId: 1, tokens: task.characters.map(c => c.token) }];
    if (slots.some(slot => slot.tokens.length !== 1)) return fail();
    const characters = [];
    for (const character of task.characters) {
        const sources = context.filter(c => c.characterKey === character.characterKey);
        if (sources.length !== 1) return fail();
        const source = sources[0], view = readCharacterDnaView(source.dna, character.framing);
        if (!view.ok) return view;
        characters.push({ characterKey: character.characterKey, dna: view.value,
            outfit: { name: source.outfit?.name || '', description: character.framing === 'half_body'
                ? source.outfit?.descriptionHalfBody || source.outfit?.description || '' : source.outfit?.description || '' },
            ...(creatureOf(source.dna) && { creature: creatureOf(source.dna) }) });
    }
    return { ok: true, value: { characterContext: characters,
        outputs: { format: 'expression-fragments', rows: slots.map(slot => ({ slotId: slot.slotId,
            characterKey: task.characters.find(c => c.token === slot.tokens[0]).characterKey })) } } };
}

export function characterPromptTask(context, purpose, framing, slotKeys) {
    const characterContext = structuredClone(context);
    // 非人角色按体型取景，并且不使用衣装模板；同一任务内不混入人类角色。
    const creature = ['sprite', 'derived'].includes(purpose) && characterContext.length > 0
        && characterContext.every(c => creatureOf(c.dna));
    const characters = characterContext.map((c, index) => ({ characterKey: c.characterKey,
        token: `r${index.toString(36)}`, framing: creature ? creatureFraming(c.dna.creature) : framing }));
    const byKey = new Map(characters.map((c) => [c.characterKey, c.token]));
    return { characterContext, promptTask: { version: 1, mode: 'dna_template', purpose, ...(!creature && { outfitMode: 'template' }), characters,
        ...(slotKeys && { slots: slotKeys.map((keys, index) => ({ slotId: index + 1,
            tokens: keys.map((key) => byKey.get(key)) })) }) } };
}

// 仅声明本轮身份字段交付要求；画面景别与候选完整性分开，不生成或改写 DNA。
export function spriteIdentityRequirements(task, context, format = 'dna-template') {
    const dataOnly = format === 'sprite-data';
    return task.characters.map(character => {
        const dna = context.find(source => source.characterKey === character.characterKey)?.dna;
        const preservedViews = CHARACTER_DNA_VIEWS.filter(view =>
            typeof dna?.views?.[view]?.subject === 'string' && dna.views[view].subject.trim());
        const complete = CHARACTER_DNA_REQUIRED_VIEWS.every(view => preservedViews.includes(view));
        const cleared = characterDnaIdentityCleared(dna);
        const requiredViews = !complete && !cleared ? [...CHARACTER_DNA_REQUIRED_VIEWS] : [];
        return { characterKey: character.characterKey, token: character.token,
            ...(character.framing !== undefined && { imageFraming: character.framing }),
            mode: complete ? 'saved-only' : cleared ? 'identity-cleared' : 'candidate-required',
            requiredViews, requiredFields: [
                ...requiredViews.map(view => `${dataOnly ? 'dna' : 'meta_dna'}_${view}`),
                ...(dataOnly && !cleared && dna?.personality === undefined ? ['personality'] : [])],
            preservedViews };
    });
}

export function singleCharacterContext(name, dna, outfit, assets = {}) {
    const profile = normalizeCharacterDna(dna);
    const outfits = savedCharacterOutfits(assets, name);
    // 默认仅来自显式映射；旧 DNA 服装字段保留但不参与新任务选衣。
    const selected = readDefaultOutfit(assets, name);
    const original = outfits.find(o => o.default === true)
        || (selected.ok ? { name: selected.outfitName, description: '' } : null);
    const saved = outfit?.name ? outfits.find(o => o.name === outfit.name) : original;
    const half = outfit?.nude ? 'No clothing; retain the fixed identifying features.'
        : outfit?.promptHalfBody ?? saved?.descriptionHalfBody;
    return [{ characterKey: name, dna: profile, outfits, outfit: {
        name: String(outfit?.name || (outfit?.nude ? '裸体' : original?.name) || ''),
        description: outfit?.nude ? 'No clothing; retain the fixed identifying features.'
            : String(outfit?.prompt || (outfit?.name ? outfits.find(o => o.name === outfit.name)?.description
                : original?.description) || ''),
        ...(half !== undefined && { descriptionHalfBody: half }),
        ...(Array.isArray(outfit?.words) && { words: [...outfit.words] }),
        ...(outfit?.nsfwBoost === true && { nsfwBoost: true }),
    } }];
}

export function preflightCharacterTask(context, purpose, framing, outfit) {
    if (outfit?.form && Object.values(outfit.form).some(Boolean)) return {
        ok: false, reason: 'DNA_VIEW_INVALID', error: '当前形态尚无可核验的景别身份视图，请先补齐对应资料；基础 DNA 不会被改写',
    };
    if (purpose === 'sprite') return { ok: true };
    for (const c of context) {
        const checked = readCharacterDnaView(c.dna, framing);
        if (!checked.ok) return { ...checked, characterKey: c.characterKey };
    }
    return { ok: true };
}

// 默认平和或独立表情片段只替换表情槽，构图来自程序模板。
export function savedExpressionTemplate(context, mood, prompts, { expression,
    purpose = 'derived', framing = 'half_body', slotId = 1, dnaCandidates, promptTask } = {}) {
    if (context.length !== 1 || (expression === undefined && !['默认', '平和'].includes(mood)))
        return { ok: true, available: false };
    if (expression !== undefined && (!expression || typeof expression !== 'object' || Array.isArray(expression)
        || typeof expression.positive !== 'string' || !expression.positive.trim()
        || typeof expression.negative !== 'string'
        || [expression.positive, expression.negative].some(text => text.length > 4096 || /<<\s*(?:dna|outfit)/i.test(text))))
        return { ok: false, reason: 'SPRITE_DATA_INVALID', error: '独立表情资料无效，未继续绘图' };
    const source = context[0], outfit = source.outfit;
    const saved = source.outfits?.find(o => o.name === outfit?.name);
    const clothing = outfit?.description || saved?.description;
    const half = outfit?.descriptionHalfBody ?? saved?.descriptionHalfBody;
    // 非人角色没有衣装：跳过衣柜与换装，不报缺字段。
    const creature = creatureOf(source.dna);
    if (!clothing?.trim() && !creature) return { ok: true, available: false };
    const task = characterPromptTask(context, purpose, framing, [[source.characterKey]]);
    if (promptTask) {
        const original = promptTask.characters.find(c => c.characterKey === source.characterKey);
        if (!original) return { ok: false, reason: 'DNA_TEMPLATE_BINDING' };
        task.promptTask = { ...promptTask, characters: [original], slots: [{ slotId, tokens: [original.token] }] };
    }
    task.promptTask.slots[0].slotId = slotId;
    const binding = { kind: 'named', ...task.promptTask.characters[0], captionIndex: 0 };
    const centers = [{ x: 0.5, y: 0.5 }];
    const tags = expression?.positive ?? (creature ? BUILTIN_PROMPTS[creature.form === 'humanoid' ? 'creatureHumanoid' : 'creatureBeast'].defaultPose : 'calm, relaxed, closed mouth');
    const fragment = expression === undefined ? undefined : {
        positive: String(expression.positive || ''), negative: String(expression.negative || '') };
    const caption = {
        v4_prompt: { caption: { base_caption: prompts.positive, char_captions: [{
            char_caption: creature ? `<<dna:${binding.token}>>, ${tags}` : `<<dna:${binding.token}>>, <<outfit:${binding.token}>>, ${tags}`,
            centers,
        }] } },
        v4_negative_prompt: { caption: { base_caption: prompts.negative, char_captions: [{
            char_caption: [`<<dna_uc:${binding.token}>>`, fragment?.negative].filter(Boolean).join(', '),
        }] } },
    };
    return { ok: true, available: true, value: { slotId, caption,
        promptRecipe: { version: 1, mode: 'dna_template', ...(!creature && { outfitMode: 'template' }),
            caption, bindings: [binding] },
        characterMeta: { version: 1, characters: [{ characterKey: source.characterKey,
            captionIndex: 0, identityAnchor: '', signatureDetails: '', outfit: { name: creature ? outfit?.name || '' : outfit.name, description: creature ? clothing || '' : clothing,
                ...(half !== undefined && { descriptionHalfBody: half }) },
            centers, positionExplicit: true }] },
        promptTask: task.promptTask,
        ...(fragment && { expression: fragment }),
        ...(dnaCandidates !== undefined && { dnaCandidates }),
    } };
}

// 自动补立绘的标签原名是程序输入；只绑定已有旁路名称，不补身份或改写模型描述。
export function bindAutoSpriteOutfitNames(entry, task, names) {
    if (task?.purpose !== 'sprite' || !Array.isArray(names) || !Array.isArray(entry?.characterMeta?.characters)) return entry;
    return inheritImageTaskLease(entry, { ...entry, characterMeta: { ...entry.characterMeta,
        characters: entry.characterMeta.characters.map(character => {
            const matches = names.filter(source => source.characterKey === character.characterKey
                && source.slotId === entry.slotId);
            const name = matches.length === 1 ? matches[0].name : '';
            return character.outfit && isValidOutfitName(name)
                ? { ...character, outfit: { ...character.outfit, name } } : character;
        }),
    } });
}

// 仅复制发送所需字段；历史审计字段不能成为本次发送指令。
export function characterTemplateInput(entry, task, context) {
    const metadata = entry.characterMeta === undefined ? undefined : structuredClone(entry.characterMeta);
    // 新生成仍核对原回复；显式续画才把衣装旁路绑定到当前已保存资料。
    if (entry.rebindOutfit === true && entry.promptRecipe?.outfitMode === 'template') {
        for (const character of metadata?.characters || []) {
            const source = context.find(c => c.characterKey === character.characterKey);
            const outfit = source?.outfit;
            const saved = source?.outfits?.find(o => o.name === outfit?.name);
            if (character.outfit?.name === outfit?.name
                && (outfit?.description || saved?.description))
                character.outfit = { name: outfit.name, description: outfit.description || saved.description,
                    ...((outfit.descriptionHalfBody ?? saved?.descriptionHalfBody) !== undefined && {
                        descriptionHalfBody: outfit.descriptionHalfBody ?? saved.descriptionHalfBody }) };
        }
    }
    return inheritImageTaskLease(entry, { caption: entry.promptRecipe?.caption || entry.caption,
        ...(entry.slotId !== undefined && { slotId: entry.slotId }),
        ...(entry.expression !== undefined && { expression: structuredClone(entry.expression) }),
        ...(metadata !== undefined && { characterMeta: metadata }),
        ...(entry.promptRecipe !== undefined && { promptRecipe: entry.promptRecipe }),
        ...(entry.dnaCandidates !== undefined && { dnaCandidates: entry.dnaCandidates }),
        ...(task !== undefined && { promptTask: task }), characterContext: context });
}

// 历史正文不再发送，但不能通过重组洗掉旧记录的错绑。
export function checkSpriteRecoveryBinding(entry, name, outfitName) {
    const fail = () => ({ ok: false, reason: 'DNA_TEMPLATE_BINDING', error: '恢复资料的人物或衣装与当前目标不一致，未继续生成' });
    const recipe = entry.promptRecipe, meta = entry.characterMeta;
    if (recipe !== undefined) {
        const checked = checkPromptRecipe(recipe, recipe?.caption);
        if (!checked.ok) return checked;
        const binding = checked.value.bindings;
        if (binding.length !== 1 || binding[0].kind !== 'named' || binding[0].characterKey !== name) return fail();
        const metadata = checkRecipeCharacterMeta(checked.value, meta);
        if (!metadata.ok) return metadata;
    }
    if (meta !== undefined) {
        if (meta?.version !== 1 || !Array.isArray(meta.characters) || meta.characters.length !== 1
            || meta.characters[0]?.characterKey !== name) return fail();
        const previousOutfit = meta.characters[0].outfit?.name;
        if (previousOutfit && previousOutfit !== outfitName) return fail();
    }
    return { ok: true };
}

// 恢复资料只保存旁路，不保存当次角色上下文；下一次显式续画读取当前 DNA。
export function characterPromptRecovery(entry = {}) {
    const out = {};
    for (const key of ['promptRecipe', 'characterMeta', 'promptTask', 'dnaCandidates', 'slotId', 'expression']) {
        if (entry[key] !== undefined) out[key] = structuredClone(entry[key]);
    }
    if (entry.edited === true || entry.promptEdited === true) out.edited = true;
    return out;
}
